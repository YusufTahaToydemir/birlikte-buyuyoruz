-- Kyron · 0008_paket2.sql · "Derinlik" paketi (4 Kasım 2026)
-- 1) Statlar işe yarar: Güç → can, Zekâ → XP, Düzen → altın, Ruh → canavar hasarı (bonus % = √stat, en çok 20)
-- 2) Sınıf yetenekleri (haftada 1): Savaş Çığlığı, Büyük Büyü, Büyük Şifa, Keşif
-- 3) Günün olayı: çifte ortak, tohumla seçilen günlük değiştirici
-- 4) Canavar zayıflıkları (1.5×), öfke evresi (son %25'te yarım hasar), Bestiyer

-- =====================================================================
-- 0. Şema
-- =====================================================================
alter table heroes add column if not exists skill_used_at timestamptz;
alter table hero_days add column if not exists event text;
update app_config set value = value || '{
  "bossWeak": {"slime_green":"ORDER","slime_purple":"ORDER","slime_blue":"ORDER","slime_gold":"MIND",
               "golem_stone":"BODY","golem_lava":"BODY","golem_ice":"BODY","golem_moss":"MIND",
               "dragon_green":"SPIRIT","dragon_shadow":"SPIRIT","dragon_red":"SPIRIT","dragon_gold":"MIND"},
  "twinGold": 5, "skillCooldownHours": 156
}'::jsonb, updated_at = now() where key = 'game';

-- =====================================================================
-- 1. Statlar
-- =====================================================================
create or replace function bb_stat_bonus(p_stat int) returns int
language sql immutable as $$ select least(20, floor(sqrt(greatest(p_stat, 0))))::int $$;

create or replace function bb_user_max_hp(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select bb_max_hp(bb_level(h.xp)) + 2 * bb_stat_bonus(coalesce((h.stats->>'BODY')::int, 0)) from heroes h where h.user_id = p_user
$$;

-- =====================================================================
-- 2. Günün olayı
-- =====================================================================
-- 12'de 8 gün olay var; çift için ortak ve tohumla sabit
create or replace function bb_day_event(p_couple uuid, p_date date) returns text
language sql immutable as $$
  select (array['SPIRIT_SURGE','MIND_DAY','BODY_DAY','ORDER_DAY','GOLD_RAIN','TWIN','BOSS_RAGE','COMBO_DAY',null,null,null,null])
    [1 + (('x' || substr(md5(p_couple::text || p_date::text || 'olay'), 1, 8))::bit(32)::int & 2147483647) % 12]
$$;

-- Gün üretimi: olay + stat bonusları
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int; v_regen int := coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10);
  c couples; ev text; b_mind numeric; b_order numeric; b_spirit numeric; w numeric;
begin
  if exists (select 1 from hero_days where user_id = p_user and local_date = p_date) then return; end if;
  select * into h from heroes where user_id = p_user for update;
  if h.user_id is null then return; end if;
  c := bb_couple_of(p_user);
  ev := bb_day_event(c.id, p_date);
  if h.pending_difficulty is not null then
    update heroes set difficulty = pending_difficulty, pending_difficulty = null where user_id = p_user returning * into h;
  end if;
  d := h.difficulty;
  v_sides := (bb_diff(d)->>'sides')::int;
  b_mind := 1 + bb_stat_bonus(coalesce((h.stats->>'MIND')::int, 0)) / 100.0;
  b_order := 1 + bb_stat_bonus(coalesce((h.stats->>'ORDER')::int, 0)) / 100.0;
  b_spirit := 1 + bb_stat_bonus(coalesce((h.stats->>'SPIRIT')::int, 0)) / 100.0;
  w := 1 + 0.1 * coalesce((h.equipped->>'weapon')::int, 0);
  insert into hero_days (user_id, local_date, difficulty, event) values (p_user, p_date, d, ev);
  insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
  select p_user, p_date, q.code, q.kind, q.category, q.icon,
    case when q.targets is null then q.title else replace(q.title, '{t}', coalesce(q.targets->>d::text, '')) end,
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * b_mind
      * case when (ev = 'MIND_DAY' and q.category = 'MIND') or (ev = 'BODY_DAY' and q.category = 'BODY') then 2 else 1 end)::int,
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2 * b_order
      * case when ev = 'ORDER_DAY' and q.category = 'ORDER' then 2 when ev = 'GOLD_RAIN' and q.kind = 'SIDE' then 3 else 1 end)::int,
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * w * b_spirit
      * case when ev = 'SPIRIT_SURGE' and q.category = 'SPIRIT' then 2 when ev = 'BOSS_RAGE' then 1.5 else 1 end)::int,
    case when q.kind = 'DAILY' then q.sort else 200 end
  from (
    select * from quest_catalog q where q.kind = 'DAILY' and q.min_difficulty <= d
    union all
    select * from (select * from quest_catalog q where q.kind = 'SIDE' and q.min_difficulty <= d
                   order by md5(p_user::text || p_date::text || q.code) limit v_sides) s
  ) q;
  update heroes set hp = least(bb_user_max_hp(p_user), hp + v_regen) where user_id = p_user;
end $$;

-- =====================================================================
-- 3. Canavar: zayıflık + öfke, TWIN bonusu, stat canı
-- =====================================================================
create or replace function bb_boss_weak(p_key text) returns text
language sql stable as $$ select value->'bossWeak'->>p_key from app_config where key = 'game' $$;

create or replace function complete_quest(p_quest uuid, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; q quests; h heroes; v_today date; b bosses; v_dmg int := 0; v_hit boss_hits;
  v_defeated boolean := false; v_partner uuid; v_twin int; hd hero_days; v_kind text := 'QUEST';
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  select * into q from quests where id = p_quest and user_id = u for update;
  if q.id is null then raise exception 'NOT_FOUND'; end if;
  if q.local_date <> v_today then raise exception 'DAY_LOCKED'; end if;
  if q.done = p_done then return jsonb_build_object('delta', jsonb_build_object('xp', 0, 'gold', 0, 'damage', 0), 'game', get_game()); end if;
  select * into h from heroes where user_id = u for update;
  select * into hd from hero_days where user_id = u and local_date = v_today;
  b := bb_ensure_boss(c.id, bb_week_start(v_today));
  select * into b from bosses where id = b.id for update;
  v_partner := bb_partner_of(u);

  if p_done then
    update quests set done = true, done_at = now() where id = q.id;
    update heroes set xp = xp + q.xp, gold = gold + q.gold,
      stats = jsonb_set(stats, array[q.category], to_jsonb(coalesce((stats->>q.category)::int, 0) + 1)) where user_id = u returning * into h;
    insert into hero_log (user_id, kind, xp, gold, ref) values (u, 'QUEST', q.xp, q.gold, q.id);
    if b.defeated_at is null then
      v_dmg := q.damage;
      if bb_boss_weak(b.boss_key) = q.category then v_dmg := round(v_dmg * 1.5); v_kind := 'WEAK'; end if;
      if b.hp < b.max_hp * 0.25 then v_dmg := ceil(v_dmg / 2.0); v_kind := 'RAGE'; end if;
      v_dmg := least(b.hp, greatest(1, v_dmg));
      insert into boss_hits (boss_id, user_id, quest_id, kind, damage) values (b.id, u, q.id, v_kind, v_dmg);
      update bosses set hp = hp - v_dmg where id = b.id returning * into b;
      if b.hp <= 0 then perform bb_defeat_boss(b.id); v_defeated := true; end if;
    end if;
    -- Çift gün: eşin de aynı görevi bugün yaptıysa ikinize altın (görev başına bir kez)
    if hd.event = 'TWIN' and v_partner is not null and q.kind = 'DAILY'
       and exists (select 1 from quests pq where pq.user_id = v_partner and pq.local_date = v_today and pq.code = q.code and pq.done)
       and not exists (select 1 from hero_log l where l.user_id = u and l.kind = 'TWIN' and l.ref = q.id) then
      v_twin := coalesce(((select value from app_config where key = 'game')->>'twinGold')::int, 5);
      update heroes set gold = gold + v_twin where user_id in (u, v_partner);
      insert into hero_log (user_id, kind, gold, ref) values (u, 'TWIN', v_twin, q.id), (v_partner, 'TWIN', v_twin, q.id);
      perform bb_event(u, 'TWIN_BONUS', jsonb_build_object('gold', v_twin, 'title', q.title, 'icon', q.icon));
      perform bb_event(v_partner, 'TWIN_BONUS', jsonb_build_object('gold', v_twin, 'title', q.title, 'icon', q.icon), u);
    end if;
    perform bb_award_levels(u);
  else
    update quests set done = false, done_at = null where id = q.id;
    update heroes set xp = greatest(0, xp - q.xp), gold = greatest(0, gold - q.gold),
      stats = jsonb_set(stats, array[q.category], to_jsonb(greatest(0, coalesce((stats->>q.category)::int, 0) - 1))) where user_id = u returning * into h;
    insert into hero_log (user_id, kind, xp, gold, ref) values (u, 'UNDO', -q.xp, -q.gold, q.id);
    select * into v_hit from boss_hits where quest_id = q.id;
    if v_hit.id is not null and b.defeated_at is null then
      update bosses set hp = least(max_hp, hp + v_hit.damage) where id = b.id;
      v_dmg := -v_hit.damage;
    end if;
    delete from boss_hits where quest_id = q.id;
    update heroes set hp = least(hp, bb_user_max_hp(u)) where user_id = u;
  end if;
  perform bb_check_achievements(u);
  return jsonb_build_object(
    'delta', jsonb_build_object('xp', case when p_done then q.xp else -q.xp end, 'gold', case when p_done then q.gold else -q.gold end, 'damage', v_dmg, 'defeated', v_defeated, 'kind', v_kind),
    'game', get_game());
end $$;

-- Gün kapanışı: BOSS_RAGE (hasar 2×) ve COMBO_DAY (kombo altını 2×) eklendi
create or replace function bb_close_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  hd hero_days; h heroes; v_missed int; v_total int; v_dmg int; v_lost_gold int; v_partner uuid; pd hero_days; c couples; b bosses; q record; v_cgold int;
  cfg jsonb := (select value from app_config where key = 'game');
begin
  select * into hd from hero_days where user_id = p_user and local_date = p_date for update;
  if hd.user_id is null or hd.closed then return; end if;
  select count(*) filter (where not done), count(*) into v_missed, v_total from quests where user_id = p_user and local_date = p_date and kind = 'DAILY';
  select * into h from heroes where user_id = p_user for update;
  v_dmg := 0;
  if not hd.izin and v_missed > 0 then
    v_dmg := greatest(1, round(v_missed * (bb_diff(hd.difficulty)->>'damage')::int * (1 - 0.08 * coalesce((h.equipped->>'armor')::int, 0))))::int;
    if hd.event = 'BOSS_RAGE' then v_dmg := v_dmg * 2; end if;
  end if;
  update hero_days set closed = true, all_done = (v_missed = 0 and v_total > 0), hp_lost = v_dmg where user_id = p_user and local_date = p_date returning * into hd;
  if hd.izin then
    null;
  elsif hd.all_done then
    update heroes set streak = streak + 1, best_streak = greatest(best_streak, streak + 1) where user_id = p_user;
  else
    update inventory set qty = qty - 1 where user_id = p_user and item_key = 'streak_shield' and qty > 0;
    if found and h.streak > 0 then
      insert into hero_log (user_id, kind) values (p_user, 'SHIELD');
      perform bb_event(p_user, 'STREAK_SAVED', jsonb_build_object('streak', h.streak, 'date', p_date));
    else
      if found then update inventory set qty = qty + 1 where user_id = p_user and item_key = 'streak_shield'; end if;
      update heroes set streak = 0 where user_id = p_user;
    end if;
  end if;
  for q in select code, done from quests where user_id = p_user and local_date = p_date and kind = 'DAILY' loop
    perform bb_chain_update(p_user, q.code, q.done, hd.izin, p_date);
  end loop;
  if v_dmg > 0 then
    update heroes set hp = hp - v_dmg where user_id = p_user returning * into h;
    insert into hero_log (user_id, kind, hp) values (p_user, 'MISSED', -v_dmg);
    perform bb_event(p_user, 'DAY_DAMAGE', jsonb_build_object('missed', v_missed, 'hp', v_dmg, 'date', p_date, 'rage', hd.event = 'BOSS_RAGE'));
    if h.hp <= 0 then
      v_lost_gold := floor(h.gold * 0.1)::int;
      update heroes set hp = bb_user_max_hp(p_user) / 2, gold = gold - v_lost_gold where user_id = p_user;
      insert into hero_log (user_id, kind, gold) values (p_user, 'FAINT', -v_lost_gold);
      perform bb_event(p_user, 'FAINT', jsonb_build_object('gold', v_lost_gold));
    end if;
  end if;
  v_partner := bb_partner_of(p_user);
  if hd.all_done and v_partner is not null then
    select * into pd from hero_days where user_id = v_partner and local_date = p_date;
    c := bb_couple_of(p_user);
    if pd.closed and pd.all_done then
      insert into couple_combos (couple_id, local_date) values (c.id, p_date) on conflict do nothing;
      if found then
        v_cgold := (cfg->>'comboGold')::int * case when hd.event = 'COMBO_DAY' then 2 else 1 end;
        update heroes set gold = gold + v_cgold where user_id in (p_user, v_partner);
        insert into hero_log (user_id, kind, gold) values (p_user, 'COMBO', v_cgold), (v_partner, 'COMBO', v_cgold);
        select * into b from bosses where couple_id = c.id and week_start = bb_week_start(p_date) for update;
        if b.id is not null and b.defeated_at is null then
          insert into boss_hits (boss_id, user_id, kind, damage) values (b.id, null, 'COMBO', least(b.hp, (cfg->>'comboDamage')::int));
          update bosses set hp = greatest(0, hp - (cfg->>'comboDamage')::int) where id = b.id returning * into b;
          if b.hp = 0 then perform bb_defeat_boss(b.id); end if;
        end if;
        perform bb_event(p_user, 'COMBO', jsonb_build_object('gold', v_cgold, 'damage', (cfg->>'comboDamage')::int));
        perform bb_event(v_partner, 'COMBO', jsonb_build_object('gold', v_cgold, 'damage', (cfg->>'comboDamage')::int));
      end if;
    end if;
  end if;
end $$;

-- Can tavanı stat bonusuyla: iksir, şifa, seviye
create or replace function use_potion(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); s shop_items;
begin
  select * into s from shop_items where key = p_key and kind = 'POTION';
  if s.key is null then raise exception 'NOT_FOUND'; end if;
  update inventory set qty = qty - 1 where user_id = u and item_key = p_key and qty > 0;
  if not found then raise exception 'NOT_OWNED'; end if;
  update heroes set hp = least(bb_user_max_hp(u), hp + s.effect) where user_id = u;
  insert into hero_log (user_id, kind, hp) values (u, 'POTION', s.effect);
  return get_game();
end $$;

create or replace function social_action(p_kind text, p_amount int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid; c couples; v_today_ts timestamptz; h heroes; cfg jsonb := (select value from app_config where key = 'game'); v_heal int;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  v_today_ts := bb_local_ts(bb_local_date(now(), c.timezone), time '00:00', c.timezone);
  select * into h from heroes where user_id = u for update;
  if p_kind = 'CHEER' then
    if (select count(*) from hero_events where from_user = u and kind = 'CHEER' and created_at >= v_today_ts) >= (cfg->>'cheersPerDay')::int then raise exception 'DAILY_LIMIT'; end if;
    update heroes set xp = xp + (cfg->>'cheerXP')::int where user_id = v_partner;
    insert into hero_log (user_id, kind, xp) values (v_partner, 'CHEER', (cfg->>'cheerXP')::int);
    perform bb_event(v_partner, 'CHEER', jsonb_build_object('xp', (cfg->>'cheerXP')::int), u);
    perform bb_award_levels(v_partner);
  elsif p_kind = 'HEAL' then
    if h.class = 'HEALER' and not exists (select 1 from hero_events where from_user = u and kind = 'HEAL' and created_at >= v_today_ts) then
      v_heal := (cfg->>'healAmount')::int;
    else
      update inventory set qty = qty - 1 where user_id = u and item_key = 'potion_small' and qty > 0;
      if not found then raise exception 'NO_POTION'; end if;
      v_heal := 30;
    end if;
    update heroes set hp = least(bb_user_max_hp(v_partner), hp + v_heal) where user_id = v_partner;
    insert into hero_log (user_id, kind, hp) values (v_partner, 'HEALED', v_heal);
    perform bb_event(v_partner, 'HEAL', jsonb_build_object('hp', v_heal), u);
  elsif p_kind = 'GIFT' then
    if p_amount not in (10, 25, 50) then raise exception 'INVALID_VALUE'; end if;
    if h.gold < p_amount then raise exception 'INSUFFICIENT_GOLD'; end if;
    update heroes set gold = gold - p_amount where user_id = u;
    update heroes set gold = gold + p_amount where user_id = v_partner;
    insert into hero_log (user_id, kind, gold) values (u, 'GIFT_OUT', -p_amount), (v_partner, 'GIFT_IN', p_amount);
    perform bb_event(v_partner, 'GIFT', jsonb_build_object('gold', p_amount), u);
  else
    raise exception 'INVALID_ACTION';
  end if;
  perform bb_check_achievements(u);
  return get_game();
end $$;

create or replace function bb_award_levels(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_lvl int; l int; r jsonb; v_gold int := 0;
begin
  select * into h from heroes where user_id = p_user for update;
  if h.user_id is null then return; end if;
  v_lvl := bb_level(h.xp);
  if v_lvl <= h.rewarded_level then return; end if;
  for l in h.rewarded_level + 1 .. v_lvl loop
    r := bb_level_reward(l);
    v_gold := v_gold + (r->>'gold')::int;
    if r->>'potion' is not null then
      insert into inventory (user_id, item_key, qty) values (p_user, r->>'potion', 1)
        on conflict (user_id, item_key) do update set qty = inventory.qty + 1;
    end if;
    perform bb_event(p_user, 'LEVEL_UP', jsonb_build_object('level', l, 'gold', (r->>'gold')::int, 'potion', r->>'potion'));
  end loop;
  update heroes set rewarded_level = v_lvl, gold = gold + v_gold where user_id = p_user;
  update heroes set hp = bb_user_max_hp(p_user) where user_id = p_user;
  insert into hero_log (user_id, kind, gold) values (p_user, 'LEVEL_REWARD', v_gold);
end $$;

-- =====================================================================
-- 4. Sınıf yetenekleri (haftada 1)
-- =====================================================================
create or replace function use_skill() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); h heroes; c couples; v_today date; v_partner uuid; v_cd int; v_sides int; v_skill text; v_n int;
begin
  select * into h from heroes where user_id = u for update;
  if h.user_id is null then raise exception 'NOT_FOUND'; end if;
  v_cd := coalesce(((select value from app_config where key = 'game')->>'skillCooldownHours')::int, 156);
  if h.skill_used_at is not null and h.skill_used_at + make_interval(hours => v_cd) > now() then raise exception 'SKILL_COOLDOWN'; end if;
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  v_partner := bb_partner_of(u);
  perform bb_process_user(u);
  if h.class = 'WARRIOR' then
    v_skill := 'WAR_CRY';
    update quests set damage = damage * 2 where user_id = u and local_date = v_today and not done;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'SKILL_NOTHING'; end if;
  elsif h.class = 'MAGE' then
    v_skill := 'GREAT_SPELL';
    update quests set xp = xp * 2 where user_id = u and local_date = v_today and not done;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'SKILL_NOTHING'; end if;
  elsif h.class = 'HEALER' then
    v_skill := 'GREAT_HEAL';
    update heroes set hp = bb_user_max_hp(user_id) where user_id = u or user_id = v_partner;
    insert into hero_log (user_id, kind, hp) values (u, 'HEALED', 0);
    if v_partner is not null then
      insert into hero_log (user_id, kind, hp) values (v_partner, 'HEALED', 0);
      perform bb_event(v_partner, 'HEAL', jsonb_build_object('hp', 999, 'full', true), u);
    end if;
  elsif h.class = 'RANGER' then
    v_skill := 'SCOUT';
    v_sides := (bb_diff(h.difficulty)->>'sides')::int + 1;
    delete from quests where user_id = u and local_date = v_today and kind = 'SIDE' and not done;
    insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
    select u, v_today, q.code, q.kind, q.category, q.icon, q.title,
      bb_quest_xp(q.base_xp, h.difficulty, h.class, q.category, q.kind),
      round(q.base_xp * (bb_diff(h.difficulty)->>'mult')::numeric / 2)::int,
      round(bb_quest_xp(q.base_xp, h.difficulty, h.class, q.category, q.kind) * (1 + 0.1 * coalesce((h.equipped->>'weapon')::int, 0)))::int, 200
    from quest_catalog q where q.kind = 'SIDE' and q.min_difficulty <= h.difficulty
      and not exists (select 1 from quests x where x.user_id = u and x.local_date = v_today and x.code = q.code)
    order by md5(u::text || v_today::text || q.code || 'kesif') limit v_sides;
  end if;
  update heroes set skill_used_at = now() where user_id = u;
  insert into hero_log (user_id, kind) values (u, 'SKILL');
  if v_partner is not null then perform bb_event(v_partner, 'SKILL_USED', jsonb_build_object('class', h.class, 'skill', v_skill), u); end if;
  perform bb_check_achievements(u);
  return get_game();
end $$;

-- =====================================================================
-- 5. Bestiyer, hero json, get_game, rozetler
-- =====================================================================
create or replace function get_bestiary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'key', e->>'key', 'name', e->>'name', 'weak', bb_boss_weak(e->>'key'),
      'faced', (select count(*) from bosses b where b.couple_id = c.id and b.boss_key = e->>'key'),
      'defeated', (select count(*) from bosses b where b.couple_id = c.id and b.boss_key = e->>'key' and b.defeated_at is not null),
      'fastest', (select min(bb_local_date(b.defeated_at, c.timezone) - b.week_start + 1) from bosses b where b.couple_id = c.id and b.boss_key = e->>'key' and b.defeated_at is not null),
      'next', (select min(b.week_start) from bosses b where b.couple_id = c.id and b.boss_key = e->>'key' and b.defeated_at is null and b.week_start >= bb_week_start(bb_local_date(now(), c.timezone)))
    ) order by o), '[]'::jsonb)
    from jsonb_array_elements((select value->'bosses' from app_config where key = 'game')) with ordinality as t(e, o));
end $$;

create or replace function bb_hero_json(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h heroes; au app_users; v_lvl int; v_cd int := coalesce(((select value from app_config where key = 'game')->>'skillCooldownHours')::int, 156);
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null then return null; end if;
  select * into au from app_users where id = p_user;
  v_lvl := bb_level(h.xp);
  return jsonb_build_object(
    'id', p_user, 'name', au.display_name, 'username', au.username, 'class', h.class, 'look', h.look,
    'difficulty', h.difficulty, 'pendingDifficulty', h.pending_difficulty,
    'level', v_lvl, 'xp', h.xp, 'levelStart', bb_level_start(v_lvl), 'levelEnd', bb_level_start(v_lvl + 1),
    'hp', h.hp, 'maxHp', bb_user_max_hp(p_user), 'gold', h.gold, 'stats', h.stats, 'equipped', h.equipped,
    'streak', h.streak, 'bestStreak', h.best_streak, 'sound', h.sound, 'shards', h.shards, 'lastSeen', h.last_seen,
    'skillReadyAt', case when h.skill_used_at is null then null else h.skill_used_at + make_interval(hours => v_cd) end);
end $$;

create or replace function get_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid; b bosses; ws date; v_ws_ts timestamptz; v_invite jsonb; w word_games;
begin
  c := bb_couple_of(u);
  perform bb_process_user(u);
  update heroes set last_seen = now() where user_id = u;
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_process_user(v_partner); end if;
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  v_ws_ts := bb_local_ts(ws, time '00:00', c.timezone);
  select * into b from bosses where couple_id = c.id and week_start = ws;
  select * into w from word_games where couple_id = c.id and local_date = v_today;
  select jsonb_build_object('expiresAt', expires_at) into v_invite from invites
    where couple_id = c.id and used_at is null and expires_at > now() order by created_at desc limit 1;
  return jsonb_build_object(
    'serverTime', now(), 'today', v_today, 'weekStart', ws, 'weekEnd', bb_local_ts(ws + 7, time '00:00', c.timezone),
    'config', (select value from app_config where key = 'game'),
    'hero', bb_hero_json(u),
    'day', (select jsonb_build_object('izin', izin, 'difficulty', difficulty, 'event', event) from hero_days where user_id = u and local_date = v_today),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title,
        'xp', xp, 'gold', gold, 'damage', damage, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = v_today),
    'chains', (select coalesce(jsonb_object_agg(code, jsonb_build_object('chain', case when last_date >= v_today - 1 then chain else 0 end, 'best', best)), '{}'::jsonb) from quest_chains where user_id = u),
    'partner', case when v_partner is null then null else bb_hero_json(v_partner) ||
        jsonb_build_object('todayDone', (select count(*) filter (where done) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY'),
                           'todayTotal', (select count(*) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY'),
                           'todayCodes', (select coalesce(jsonb_agg(code), '[]'::jsonb) from quests where user_id = v_partner and local_date = v_today and done)) end,
    'couple', jsonb_build_object('id', c.id, 'hasPartner', v_partner is not null, 'pendingInvite', v_invite, 'status', c.status),
    'boss', case when b.id is null then null else jsonb_build_object('id', b.id, 'key', b.boss_key, 'name', b.name, 'hp', b.hp, 'maxHp', b.max_hp, 'defeated', b.defeated_at is not null,
        'weak', bb_boss_weak(b.boss_key),
        'hits', (select coalesce(jsonb_agg(jsonb_build_object('user', h.user_id, 'kind', h.kind, 'damage', h.damage, 'at', h.created_at) order by h.created_at desc), '[]'::jsonb)
                 from (select * from boss_hits where boss_id = b.id order by created_at desc limit 12) h),
        'byUser', (select coalesce(jsonb_object_agg(coalesce(user_id::text, 'combo'), s), '{}'::jsonb) from (select user_id, sum(damage) s from boss_hits where boss_id = b.id group by user_id) q)) end,
    'weekXp', jsonb_build_object(
        'me', (select coalesce(sum(xp), 0) from hero_log where user_id = u and created_at >= v_ws_ts),
        'partner', case when v_partner is null then null else (select coalesce(sum(xp), 0) from hero_log where user_id = v_partner and created_at >= v_ws_ts) end),
    'cheersLeft', greatest(0, (select (value->>'cheersPerDay')::int from app_config where key = 'game')
        - (select count(*) from hero_events where from_user = u and kind = 'CHEER' and created_at >= bb_local_ts(v_today, time '00:00', c.timezone))),
    'healUsedToday', exists (select 1 from hero_events where from_user = u and kind = 'HEAL' and created_at >= bb_local_ts(v_today, time '00:00', c.timezone)),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'data', e.data, 'from', au.display_name, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
        from hero_events e left join app_users au on au.id = e.from_user where e.user_id = u and not e.seen),
    'inventory', (select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb) from inventory where user_id = u and qty > 0),
    'achievements', (select coalesce(jsonb_agg(key), '[]'::jsonb) from achievements where user_id = u),
    'tickets', (select jsonb_build_object('available', count(*) filter (where status = 'AVAILABLE'), 'requested', count(*) filter (where status = 'REQUESTED'), 'used', count(*) filter (where status = 'USED'))
        from tickets where owner_id = u),
    'incomingRequests', (select count(*) from ticket_redemptions where partner_id = u and status = 'REQUESTED' and expires_at > now()),
    'play', jsonb_build_object(
        'duels', (select count(*) from duels where opponent = u and status = 'OPEN' and expires_at > now()),
        'together', (select count(*) from together_log where couple_id = c.id and week_start = ws and status = 'PENDING' and proposed_by <> u),
        'word', coalesce(not w.finished, true) and v_partner is not null
                and (select count(*) from jsonb_array_elements(coalesce(w.guesses, '[]'::jsonb)) g where g->>'by' = u::text) < 3)
  );
end $$;

create or replace function bb_check_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_done int; v_lvl int; k text; v_new text[] := '{}'; c couples; v_boss int; v_wins int; v_words int; v_tog int; v_chain int; v_skill int;
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null then return; end if;
  v_lvl := bb_level(h.xp);
  select count(*) into v_done from quests where user_id = p_user and done;
  c := bb_couple_of(p_user);
  select count(*) into v_boss from bosses where couple_id = c.id and defeated_at is not null;
  select count(*) into v_wins from duels where winner = p_user;
  select count(*) into v_words from word_games where couple_id = c.id and solved;
  select count(*) into v_tog from together_log where couple_id = c.id and status = 'DONE';
  select coalesce(max(best), 0) into v_chain from quest_chains where user_id = p_user;
  select count(*) into v_skill from hero_log where user_id = p_user and kind = 'SKILL';
  if v_done >= 1 then v_new := array_append(v_new, 'FIRST_QUEST'); end if;
  if v_done >= 50 then v_new := array_append(v_new, 'QUESTS_50'); end if;
  if v_done >= 250 then v_new := array_append(v_new, 'QUESTS_250'); end if;
  if v_done >= 1000 then v_new := array_append(v_new, 'QUESTS_1000'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'WAKE') >= 5 then v_new := array_append(v_new, 'EARLY_BIRD'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'READING') >= 10 then v_new := array_append(v_new, 'BOOKWORM'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'QURAN') >= 30 then v_new := array_append(v_new, 'QURAN_30'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'SPORT') >= 20 then v_new := array_append(v_new, 'ATHLETE'); end if;
  if h.best_streak >= 7 then v_new := array_append(v_new, 'STREAK_7'); end if;
  if h.best_streak >= 30 then v_new := array_append(v_new, 'STREAK_30'); end if;
  if h.best_streak >= 100 then v_new := array_append(v_new, 'STREAK_100'); end if;
  if v_chain >= 30 then v_new := array_append(v_new, 'CHAIN_30'); end if;
  if v_chain >= 100 then v_new := array_append(v_new, 'CHAIN_100'); end if;
  if v_boss >= 1 then v_new := array_append(v_new, 'BOSS_1'); end if;
  if v_boss >= 5 then v_new := array_append(v_new, 'BOSS_5'); end if;
  if v_boss >= 20 then v_new := array_append(v_new, 'BOSS_20'); end if;
  if v_lvl >= 5 then v_new := array_append(v_new, 'LEVEL_5'); end if;
  if v_lvl >= 10 then v_new := array_append(v_new, 'LEVEL_10'); end if;
  if v_lvl >= 20 then v_new := array_append(v_new, 'LEVEL_20'); end if;
  if v_lvl >= 30 then v_new := array_append(v_new, 'LEVEL_30'); end if;
  if v_lvl >= 50 then v_new := array_append(v_new, 'LEVEL_50'); end if;
  if v_lvl >= 75 then v_new := array_append(v_new, 'LEVEL_75'); end if;
  if v_lvl >= 100 then v_new := array_append(v_new, 'LEVEL_100'); end if;
  if h.gold >= 1000 then v_new := array_append(v_new, 'RICH'); end if;
  if exists (select 1 from hero_days where user_id = p_user and difficulty = 6 and all_done) then v_new := array_append(v_new, 'MYTHIC_DAY'); end if;
  if (select count(*) from hero_events where from_user = p_user and kind = 'CHEER') >= 10 then v_new := array_append(v_new, 'FRIEND'); end if;
  if exists (select 1 from couple_combos where couple_id = c.id) then v_new := array_append(v_new, 'COMBO'); end if;
  if v_wins >= 1 then v_new := array_append(v_new, 'DUEL_1'); end if;
  if v_wins >= 10 then v_new := array_append(v_new, 'DUEL_10'); end if;
  if v_wins >= 50 then v_new := array_append(v_new, 'DUEL_50'); end if;
  if v_words >= 1 then v_new := array_append(v_new, 'WORD_1'); end if;
  if v_words >= 25 then v_new := array_append(v_new, 'WORD_25'); end if;
  if v_tog >= 1 then v_new := array_append(v_new, 'TOGETHER_1'); end if;
  if v_tog >= 20 then v_new := array_append(v_new, 'TOGETHER_20'); end if;
  if exists (select 1 from tickets where owner_id = p_user) then v_new := array_append(v_new, 'TICKET_1'); end if;
  if v_skill >= 1 then v_new := array_append(v_new, 'SKILL_1'); end if;
  if v_skill >= 10 then v_new := array_append(v_new, 'SKILL_10'); end if;
  if (select count(distinct boss_key) from bosses where couple_id = c.id and defeated_at is not null) >= 12 then v_new := array_append(v_new, 'BESTIARY'); end if;
  foreach k in array v_new loop
    insert into achievements (user_id, key) values (p_user, k) on conflict do nothing;
    if found then perform bb_event(p_user, 'ACHIEVEMENT', jsonb_build_object('key', k)); end if;
  end loop;
end $$;

-- =====================================================================
-- 6. Güvenlik
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_game(), create_hero(text, text, jsonb, int), update_hero(text, text, jsonb, boolean), complete_quest(uuid, boolean),
  set_izin(boolean), set_difficulty(int), buy_item(text), equip_item(text, text), use_potion(text), social_action(text, int), mark_events_seen(uuid[]),
  get_tickets(), request_ticket(uuid, uuid, text), respond_redemption(uuid, text), request_reversal(uuid),
  create_invite(), generate_recovery_codes(), recovery_codes_status(), revoke_other_sessions(), disconnect_couple(), delete_account(),
  get_games(), duel_create(text, int, int), duel_play(uuid, int), duel_cancel(uuid), word_guess(text), together_mark(text), together_cancel(text),
  get_calendar(date), get_day(date), use_skill(), get_bestiary()
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'paket2 ok' as result, (select value->'bossWeak'->>'dragon_red' from app_config where key = 'game') as weak_dragon_red;
