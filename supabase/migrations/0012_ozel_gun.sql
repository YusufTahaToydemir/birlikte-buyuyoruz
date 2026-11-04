-- Kyron · 0012_ozel_gun.sql · Özel gün modu (5 Kasım 2026)
-- Açıkken seçilen ibadet görevleri listeden kalkar (gizlenir); yerine hafif görevler gelir.
-- ADALET: gizlenen görevlerin toplam XP / altın / canavar hasarı, yerine gelen görevlere aynen aktarılır.
-- Seri, can, kombo ve zincirler etkilenmez (gizli görevler "izinli" sayılır). 14 gün sonra kendiliğinden kapanır.

-- =====================================================================
-- 0. Şema
-- =====================================================================
alter table quests add column if not exists hidden boolean not null default false;
alter table heroes add column if not exists special_since date;
alter table heroes add column if not exists special_hide text[] not null default '{FAJR,DHUHR,ASR,MAGHRIB,ISHA,SUNNAH,QURAN,DHIKR}';
alter table heroes add column if not exists special_extra text[] not null default '{SP_DUA,SP_ISTIGFAR,SP_LISTEN}';

do $$
declare cn text;
begin
  select conname into cn from pg_constraint where conrelid = 'quest_catalog'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if cn is not null then execute format('alter table quest_catalog drop constraint %I', cn); end if;
  alter table quest_catalog add constraint quest_catalog_kind_check check (kind in ('DAILY','SIDE','SPECIAL'));
end $$;

insert into quest_catalog (code, kind, category, icon, title, targets, min_difficulty, base_xp, sort) values
  ('SP_DUA',      'SPECIAL','SPIRIT','pray',    'Dua et', null, 1, 10, 25),
  ('SP_ISTIGFAR', 'SPECIAL','SPIRIT','beads',   '100 istiğfar', null, 1, 10, 26),
  ('SP_LISTEN',   'SPECIAL','SPIRIT','music',   'Sohbet veya ilmihal dinle', null, 1, 10, 27),
  ('SP_SALAVAT',  'SPECIAL','SPIRIT','sparkle', 'Salavat getir', null, 1, 10, 28),
  ('SP_TEFEKKUR', 'SPECIAL','SPIRIT','moon',    '10 dk tefekkür', null, 1, 10, 29),
  ('SP_SADAKA',   'SPECIAL','SPIRIT','coin',    'Sadaka ver', null, 1, 10, 30),
  ('SP_SIYER',    'SPECIAL','MIND',  'book',    'Siyer veya dinî hikâye oku', null, 1, 10, 31)
on conflict (code) do update set kind = excluded.kind, category = excluded.category, icon = excluded.icon, title = excluded.title, sort = excluded.sort;

-- =====================================================================
-- 1. Uygulama / geri alma (gün bazlı, tekrar çalıştırılabilir)
-- =====================================================================
create or replace function bb_special_clear(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from quests where user_id = p_user and local_date = p_date and code like 'SP\_%' and not done;
  update quests set hidden = false where user_id = p_user and local_date = p_date and hidden;
end $$;

create or replace function bb_special_apply(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_xp int; v_gold int; v_dmg int; v_n int; i int := 0; ex record; s_xp int; s_gold int; s_dmg int; v_hidden int;
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null or h.special_since is null or p_date < h.special_since then return; end if;
  perform bb_special_clear(p_user, p_date);
  update quests set hidden = true where user_id = p_user and local_date = p_date and kind = 'DAILY' and not done and code = any(h.special_hide);
  select count(*), coalesce(sum(xp), 0), coalesce(sum(gold), 0), coalesce(sum(damage), 0) into v_hidden, v_xp, v_gold, v_dmg
    from quests where user_id = p_user and local_date = p_date and hidden;
  if v_hidden = 0 then return; end if;
  -- bugün zaten yapılmış SP görevleri havuzdan düşülür
  v_xp := v_xp - coalesce((select sum(xp) from quests where user_id = p_user and local_date = p_date and code like 'SP\_%' and done), 0);
  v_gold := v_gold - coalesce((select sum(gold) from quests where user_id = p_user and local_date = p_date and code like 'SP\_%' and done), 0);
  v_dmg := v_dmg - coalesce((select sum(damage) from quests where user_id = p_user and local_date = p_date and code like 'SP\_%' and done), 0);
  select count(*) into v_n from quest_catalog c where c.kind = 'SPECIAL' and c.code = any(h.special_extra)
    and not exists (select 1 from quests q where q.user_id = p_user and q.local_date = p_date and q.code = c.code);
  if v_n = 0 then return; end if;
  v_xp := greatest(v_xp, 0); v_gold := greatest(v_gold, 0); v_dmg := greatest(v_dmg, 0);
  for ex in select * from quest_catalog c where c.kind = 'SPECIAL' and c.code = any(h.special_extra)
              and not exists (select 1 from quests q where q.user_id = p_user and q.local_date = p_date and q.code = c.code) order by c.sort loop
    i := i + 1;
    s_xp := floor(v_xp::numeric * i / v_n) - floor(v_xp::numeric * (i - 1) / v_n);
    s_gold := floor(v_gold::numeric * i / v_n) - floor(v_gold::numeric * (i - 1) / v_n);
    s_dmg := floor(v_dmg::numeric * i / v_n) - floor(v_dmg::numeric * (i - 1) / v_n);
    insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
      values (p_user, p_date, ex.code, 'DAILY', ex.category, ex.icon, ex.title, s_xp, s_gold, s_dmg, ex.sort);
  end loop;
end $$;

-- =====================================================================
-- 2. Gün üretimi: mod açıksa uygula; 14 günden uzunsa kapat
-- =====================================================================
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int; v_regen int := coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10);
  c couples; ev text; b_mind numeric; b_order numeric; b_spirit numeric; w numeric; k_lib numeric; k_forge numeric; k_garden numeric; k_market numeric; k_mosque numeric;
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
  k_lib := 1 + bb_castle_lv(c.id, 'library') / 100.0; k_forge := 1 + bb_castle_lv(c.id, 'forge') / 100.0;
  k_garden := 1 + bb_castle_lv(c.id, 'garden') / 100.0; k_market := 1 + bb_castle_lv(c.id, 'market') / 100.0; k_mosque := 1 + bb_castle_lv(c.id, 'mosque') / 100.0;
  v_regen := v_regen + 2 * bb_castle_lv(c.id, 'kitchen');
  insert into hero_days (user_id, local_date, difficulty, event) values (p_user, p_date, d, ev);
  insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
  select p_user, p_date, q.code, q.kind, q.category, q.icon,
    case when q.targets is null then q.title else replace(q.title, '{t}', coalesce(q.targets->>d::text, '')) end,
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * b_mind
      * case when q.category = 'MIND' then k_lib when q.category = 'BODY' then k_forge else 1 end
      * case when (ev = 'MIND_DAY' and q.category = 'MIND') or (ev = 'BODY_DAY' and q.category = 'BODY') then 2 else 1 end)::int,
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2 * b_order * k_market * case when q.category = 'ORDER' then k_garden else 1 end
      * case when ev = 'ORDER_DAY' and q.category = 'ORDER' then 2 when ev = 'GOLD_RAIN' and q.kind = 'SIDE' then 3 else 1 end)::int,
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * w * b_spirit * case when q.category = 'SPIRIT' then k_mosque else 1 end
      * case when ev = 'SPIRIT_SURGE' and q.category = 'SPIRIT' then 2 when ev = 'BOSS_RAGE' then 1.5 else 1 end)::int,
    case when q.kind = 'DAILY' then q.sort else 200 end
  from (
    select * from quest_catalog q where q.kind = 'DAILY' and q.min_difficulty <= d
    union all
    select * from (select * from quest_catalog q where q.kind = 'SIDE' and q.min_difficulty <= d
                   order by md5(p_user::text || p_date::text || q.code) limit v_sides) s
  ) q;
  -- Özel gün modu: 14 günden uzun açık kalmışsa kapat, değilse uygula
  if h.special_since is not null then
    if p_date > h.special_since + 14 then
      update heroes set special_since = null where user_id = p_user;
    else
      perform bb_special_apply(p_user, p_date);
    end if;
  end if;
  update heroes set hp = least(bb_user_max_hp(p_user), hp + v_regen) where user_id = p_user;
end $$;

-- =====================================================================
-- 3. Gün kapanışı: gizli görevler sayılmaz, zincirleri korunur
-- =====================================================================
create or replace function bb_close_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  hd hero_days; h heroes; v_missed int; v_total int; v_dmg int; v_lost_gold int; v_partner uuid; pd hero_days; c couples; b bosses; q record; v_cgold int;
  cfg jsonb := (select value from app_config where key = 'game');
begin
  select * into hd from hero_days where user_id = p_user and local_date = p_date for update;
  if hd.user_id is null or hd.closed then return; end if;
  select count(*) filter (where not done), count(*) into v_missed, v_total from quests where user_id = p_user and local_date = p_date and kind = 'DAILY' and not hidden;
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
  for q in select code, done, hidden from quests where user_id = p_user and local_date = p_date and kind = 'DAILY' loop
    perform bb_chain_update(p_user, q.code, q.done, hd.izin or q.hidden, p_date);
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

-- =====================================================================
-- 4. Okuma: gizli görevler listede / sayaçta / takvimde görünmez
-- =====================================================================
create or replace function bb_calendar_days(p_user uuid, p_from date, p_to date, p_couple uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'd', hd.local_date, 'allDone', hd.all_done, 'izin', hd.izin, 'closed', hd.closed, 'hpLost', hd.hp_lost,
    'done', (select count(*) filter (where done) from quests q where q.user_id = hd.user_id and q.local_date = hd.local_date and q.kind = 'DAILY' and not q.hidden),
    'total', (select count(*) from quests q where q.user_id = hd.user_id and q.local_date = hd.local_date and q.kind = 'DAILY' and not q.hidden),
    'combo', exists (select 1 from couple_combos cc where cc.couple_id = p_couple and cc.local_date = hd.local_date)
  ) order by hd.local_date), '[]'::jsonb)
  from hero_days hd where hd.user_id = p_user and hd.local_date between p_from and p_to
$$;

create or replace function get_day(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid := bb_partner_of(u);
begin
  return jsonb_build_object(
    'date', p_date,
    'me', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = p_date and not hidden),
    'partner', case when v_partner is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = v_partner and local_date = p_date and not hidden) end,
    'meDay', (select jsonb_build_object('izin', izin, 'allDone', all_done, 'hpLost', hp_lost) from hero_days where user_id = u and local_date = p_date),
    'partnerDay', case when v_partner is null then null else (select jsonb_build_object('izin', izin, 'allDone', all_done, 'hpLost', hp_lost) from hero_days where user_id = v_partner and local_date = p_date) end);
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
    'skillReadyAt', case when h.skill_used_at is null then null else h.skill_used_at + make_interval(hours => v_cd) end,
    'remindHour', h.remind_hour, 'pushSubs', (select count(*) from push_subs p where p.user_id = p_user),
    'special', h.special_since is not null);
end $$;

create or replace function get_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid; b bosses; ws date; v_ws_ts timestamptz; v_invite jsonb; w word_games; hs heroes;
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
  select * into hs from heroes where user_id = u;
  select jsonb_build_object('expiresAt', expires_at) into v_invite from invites
    where couple_id = c.id and used_at is null and expires_at > now() order by created_at desc limit 1;
  return jsonb_build_object(
    'serverTime', now(), 'today', v_today, 'weekStart', ws, 'weekEnd', bb_local_ts(ws + 7, time '00:00', c.timezone),
    'config', (select value from app_config where key = 'game'),
    'hero', bb_hero_json(u),
    'special', jsonb_build_object('on', hs.special_since is not null, 'since', hs.special_since, 'hide', hs.special_hide, 'extra', hs.special_extra,
        'days', case when hs.special_since is null then 0 else v_today - hs.special_since + 1 end),
    'day', (select jsonb_build_object('izin', izin, 'difficulty', difficulty, 'event', event) from hero_days where user_id = u and local_date = v_today),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title,
        'xp', xp, 'gold', gold, 'damage', damage, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = v_today and not hidden),
    'chains', (select coalesce(jsonb_object_agg(code, jsonb_build_object('chain', case when last_date >= v_today - 1 then chain else 0 end, 'best', best)), '{}'::jsonb) from quest_chains where user_id = u),
    'partner', case when v_partner is null then null else bb_hero_json(v_partner) ||
        jsonb_build_object('todayDone', (select count(*) filter (where done) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY' and not hidden),
                           'todayTotal', (select count(*) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY' and not hidden),
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

-- =====================================================================
-- 5. Mod düğmesi
-- =====================================================================
create or replace function set_special(p_on boolean, p_hide text[] default null, p_extra text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; h heroes;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  if p_hide is not null then
    if exists (select 1 from unnest(p_hide) x where x <> all (array['FAJR','DHUHR','ASR','MAGHRIB','ISHA','SUNNAH','QURAN','DHIKR','STUDY'])) then raise exception 'INVALID_VALUE'; end if;
    update heroes set special_hide = p_hide where user_id = u;
  end if;
  if p_extra is not null then
    if cardinality(p_extra) not between 1 and 7 or exists (select 1 from unnest(p_extra) x where not exists (select 1 from quest_catalog q where q.code = x and q.kind = 'SPECIAL')) then raise exception 'INVALID_VALUE'; end if;
    update heroes set special_extra = p_extra where user_id = u;
  end if;
  perform bb_process_user(u);
  select * into h from heroes where user_id = u for update;
  if p_on is true then
    if h.special_since is null then update heroes set special_since = v_today where user_id = u; end if;
    perform bb_special_apply(u, v_today);
  elsif p_on is false then
    update heroes set special_since = null where user_id = u;
    perform bb_special_clear(u, v_today);
  elsif h.special_since is not null then
    perform bb_special_apply(u, v_today);
  end if;
  return get_game();
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
  get_calendar(date), get_day(date), use_skill(), get_bestiary(),
  quiz_answer(jsonb), quiz_add(text, jsonb), note_write(text, text, text), get_notes(timestamptz, int), raid_play(int), word_hint(),
  castle_build(text), get_castle(), get_season(), push_subscribe(text, text, text), push_unsubscribe(text), set_reminder(int),
  set_special(boolean, text[], text[])
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'ozel gun ok' as result, (select count(*) from quest_catalog where kind = 'SPECIAL') as replacements;
