-- Kyron · 0015_denge.sql · Zorluk ve görev dengesi (5 Kasım 2026, kullanıcı onaylı)
-- * 6. zorluğun adı "Destansı". Çarpanlar yumuşak (her basamak ≈ ×1.4): 1 / 1.1 / 1.35 / 1.7 / 2.1 / 2.6.
--   Destansı'da her gün eksiksiz → Sv 100 ≈ 217 gün (eski eğri korunur).
-- * Kaçırılan görev başına can ondalıklı: 2 / 2.25 / 2.5 / 2.5 / 2.75 / 3 → boş gün en fazla ≈ −51 (iki boş gün bayıltmaz).
-- * Canavarda EŞİT KATKI: her kahramanın eksiksiz günü canavara aynı hasarı verir (bossDailyDamage = 300),
--   zorluk XP/altını artırır; silah, stat, kale ve olay bonusları hasarı yine artırır. Canavar canı = kişi başı 300·7·0.6.
-- * Görevler: Kitap 10→60 dk (taban 20), Spor 15→60/75 dk (Kahraman'dan "tempolu"; Efsane/Destansı'da kadın 50/60, erkek 60/75; taban 25),
--   Dinî çalışma taban 15, Duha/teheccüd Efsane'den (taban 20), Destansı'ya "Kaza namazı · 2 vakit" (taban 20). Kur'an ve İngilizce eski hâliyle.
-- * Sürpriz görevler zorluğa göre büyür ({t} hedefleri).
-- * Özel gün modu: kaza namazı da gizlenebilir (varsayılan listede).

-- =====================================================================
-- 1. Zorluk ayarları
-- =====================================================================
update app_config set value = value || jsonb_build_object(
  'difficulties', '[
    {"n":1,"name":"Çırak","mult":1.0,"damage":2,"sides":1},
    {"n":2,"name":"Acemi","mult":1.1,"damage":2.25,"sides":2},
    {"n":3,"name":"Yiğit","mult":1.35,"damage":2.5,"sides":2},
    {"n":4,"name":"Kahraman","mult":1.7,"damage":2.5,"sides":3},
    {"n":5,"name":"Efsane","mult":2.1,"damage":2.75,"sides":3},
    {"n":6,"name":"Destansı","mult":2.6,"damage":3,"sides":4}
  ]'::jsonb,
  'bossDailyDamage', 300)
where key = 'game';

-- =====================================================================
-- 2. Görev kataloğu
-- =====================================================================
update quest_catalog set base_xp = 20, targets = '{"1":"10","2":"15","3":"20","4":"30","5":"40","6":"60"}' where code = 'READING';
update quest_catalog set title = '{t}', base_xp = 25,
  targets = '{"1":"Spor · 15 dk","2":"Spor · 20 dk","3":"Spor · 30 dk","4":"Tempolu spor · 40 dk","5":"Tempolu spor · 60 dk","5F":"Tempolu spor · 50 dk","6":"Tempolu spor · 75 dk","6F":"Tempolu spor · 60 dk"}'
  where code = 'SPORT';
update quest_catalog set base_xp = 15 where code = 'STUDY';
update quest_catalog set min_difficulty = 5, base_xp = 20 where code = 'SUNNAH';
insert into quest_catalog (code, kind, category, icon, title, targets, min_difficulty, base_xp, sort) values
  ('KAZA', 'DAILY', 'SPIRIT', 'pray', 'Kaza namazı · 2 vakit', null, 6, 20, 25)
on conflict (code) do update set kind = excluded.kind, category = excluded.category, icon = excluded.icon, title = excluded.title,
  targets = excluded.targets, min_difficulty = excluded.min_difficulty, base_xp = excluded.base_xp, sort = excluded.sort;

-- Sürpriz görevler zorluğa göre
update quest_catalog set title = '{t} bardak su iç', targets = '{"3":"4","4":"5","5":"6","6":"8"}' where code = 'S_WATER';
update quest_catalog set title = '{t} dk yürü', targets = '{"1":"10","2":"10","3":"15","4":"20","5":"25","6":"30"}' where code = 'S_WALK';
update quest_catalog set title = '{t} dk esne', targets = '{"1":"5","2":"5","3":"10","4":"10","5":"15","6":"15"}' where code = 'S_STRETCH';
update quest_catalog set title = '{t}''te yat', targets = '{"3":"23:00","4":"23:00","5":"22:30","6":"22:30"}' where code = 'S_SLEEP';
update quest_catalog set title = '{t} kat merdiven çık', targets = '{"1":"2","2":"3","3":"4","4":"5","5":"6","6":"8"}' where code = 'S_STAIRS';
update quest_catalog set title = '{t} şınav', targets = '{"1":"10","2":"15","3":"20","4":"25","5":"30","6":"40"}' where code = 'S_PUSHUP';
update quest_catalog set title = '{t} dk ders veya sohbet dinle', targets = '{"1":"10","2":"10","3":"15","4":"20","5":"25","6":"30"}' where code = 'S_LISTEN';
update quest_catalog set title = '{t} istiğfar', targets = '{"1":"50","2":"70","3":"100","4":"100","5":"150","6":"200"}' where code = 'S_ISTIGFAR';
update quest_catalog set title = '{t} yeni kelime öğret', targets = '{"1":"3","2":"3","3":"4","4":"5","5":"6","6":"8"}' where code = 'S_WORDS';
update quest_catalog set title = 'Okuduğundan {t} not çıkar', targets = '{"1":"1","2":"2","3":"2","4":"3","5":"3","6":"5"}' where code = 'S_NOTE';
update quest_catalog set title = '{t} ezberle', targets = '{"1":"Bir dua","2":"Bir dua","3":"Bir dua","4":"Bir dua","5":"İki dua","6":"İki dua"}' where code = 'S_DUA';

-- =====================================================================
-- 3. Yardımcılar
-- =====================================================================
-- Görev başlığı: {t} zorluğa (ve varsa kadın hedefine "5F") göre doldurulur
create or replace function bb_quest_title(p_title text, p_targets jsonb, p_diff int, p_gender text) returns text
language sql immutable as $$
  select case when p_targets is null then p_title
    else replace(p_title, '{t}', coalesce(case when p_gender = 'F' then p_targets->>(p_diff::text || 'F') end, p_targets->>p_diff::text, '')) end
$$;

-- Hasar katsayısı: eksiksiz bir gün (günlük + sürpriz görev tabanları) bossDailyDamage kadar hasar versin
create or replace function bb_damage_k(p_diff int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(((select value from app_config where key = 'game')->>'bossDailyDamage')::numeric, 300)
       / greatest(1, (select coalesce(sum(base_xp), 0) from quest_catalog where kind = 'DAILY' and min_difficulty <= p_diff)
                     + (bb_diff(p_diff)->>'sides')::int * 10)
$$;

-- =====================================================================
-- 4. Gün üretimi
-- =====================================================================
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int; v_regen int := coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10);
  c couples; ev text; b_mind numeric; b_order numeric; b_spirit numeric; w numeric; k_lib numeric; k_forge numeric; k_garden numeric; k_market numeric; k_mosque numeric;
  v_k numeric; v_g text;
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
  v_g := h.look->>'gender';
  v_sides := (bb_diff(d)->>'sides')::int;
  v_k := bb_damage_k(d);
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
    bb_quest_title(q.title, q.targets, d, v_g),
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * b_mind
      * case when q.category = 'MIND' then k_lib when q.category = 'BODY' then k_forge else 1 end
      * case when (ev = 'MIND_DAY' and q.category = 'MIND') or (ev = 'BODY_DAY' and q.category = 'BODY') then 2 else 1 end)::int,
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2 * b_order * k_market * case when q.category = 'ORDER' then k_garden else 1 end
      * case when ev = 'ORDER_DAY' and q.category = 'ORDER' then 2 when ev = 'GOLD_RAIN' and q.kind = 'SIDE' then 3 else 1 end)::int,
    -- hasar: zorluktan bağımsız (eşit katkı); sınıf bonusu, silah, stat, kale ve olaylar yine etkiler
    greatest(1, round(bb_quest_xp(q.base_xp, 1, h.class, q.category, q.kind) * v_k * w * b_spirit * case when q.category = 'SPIRIT' then k_mosque else 1 end
      * case when ev = 'SPIRIT_SURGE' and q.category = 'SPIRIT' then 2 when ev = 'BOSS_RAGE' then 1.5 else 1 end))::int,
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
-- 5. Gün kapanışı: ondalıklı can cezası (geri kalanı 0012 ile aynı)
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
    v_dmg := greatest(1, round(v_missed * (bb_diff(hd.difficulty)->>'damage')::numeric * (1 - 0.08 * coalesce((h.equipped->>'armor')::int, 0))))::int;
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
-- 6. Canavar canı: kişi başı sabit (eşit katkı)
-- =====================================================================
create or replace function bb_ensure_boss(p_couple uuid, p_week date) returns bosses
language plpgsql security definer set search_path = public as $$
declare b bosses; v_hp int; v_list jsonb := (select value->'bosses' from app_config where key = 'game'); v_idx int; v_pick jsonb;
  v_per int := round(coalesce(((select value from app_config where key = 'game')->>'bossDailyDamage')::numeric, 300) * 7 * 0.6)::int;
begin
  select * into b from bosses where couple_id = p_couple and week_start = p_week;
  if b.id is not null then return b; end if;
  select count(*) * v_per into v_hp from memberships m join heroes h on h.user_id = m.user_id where m.couple_id = p_couple and m.ended_at is null;
  v_hp := greatest(300, v_hp);
  v_idx := (extract(week from p_week)::int) % jsonb_array_length(v_list);
  v_pick := v_list->v_idx;
  insert into bosses (couple_id, week_start, boss_key, name, max_hp, hp) values (p_couple, p_week, v_pick->>'key', v_pick->>'name', v_hp, v_hp)
    on conflict (couple_id, week_start) do nothing;
  select * into b from bosses where couple_id = p_couple and week_start = p_week;
  return b;
end $$;

-- Bu haftanın yenilmemiş canavarları yeni ölçeğe oranla taşınır (kalan can yüzdesi korunur)
update bosses b set hp = greatest(1, round(b.hp::numeric * m.nh / b.max_hp))::int, max_hp = m.nh
from (select m.couple_id, greatest(300, count(*) * 1260)::int nh from memberships m join heroes h on h.user_id = m.user_id where m.ended_at is null group by m.couple_id) m
where m.couple_id = b.couple_id and b.defeated_at is null and b.week_start >= current_date - 6 and b.max_hp > 0;

-- =====================================================================
-- 7. Korucu yeteneği (Keşif): sürpriz görevlerde yeni başlık + hasar
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
    select u, v_today, q.code, q.kind, q.category, q.icon, bb_quest_title(q.title, q.targets, h.difficulty, h.look->>'gender'),
      bb_quest_xp(q.base_xp, h.difficulty, h.class, q.category, q.kind),
      round(q.base_xp * (bb_diff(h.difficulty)->>'mult')::numeric / 2)::int,
      greatest(1, round(bb_quest_xp(q.base_xp, 1, h.class, q.category, q.kind) * bb_damage_k(h.difficulty) * (1 + 0.1 * coalesce((h.equipped->>'weapon')::int, 0))))::int, 200
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
-- 8. Özel gün: kaza namazı da gizlenebilir (varsayılan listede)
-- =====================================================================
alter table heroes alter column special_hide set default '{FAJR,DHUHR,ASR,MAGHRIB,ISHA,KAZA,SUNNAH,QURAN,DHIKR}';
update heroes set special_hide = array_append(special_hide, 'KAZA') where 'FAJR' = any(special_hide) and not ('KAZA' = any(special_hide));

create or replace function set_special(p_on boolean, p_hide text[] default null, p_extra text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; h heroes;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  select * into h from heroes where user_id = u;
  if h.user_id is null then raise exception 'NOT_FOUND'; end if;
  -- erkek kahramanda yalnızca "kapat" (p_on = false) çalışır
  if coalesce(h.look->>'gender', '') <> 'F' and p_on is not false then raise exception 'NOT_ALLOWED'; end if;
  if p_hide is not null then
    if exists (select 1 from unnest(p_hide) x where x <> all (array['FAJR','DHUHR','ASR','MAGHRIB','ISHA','KAZA','SUNNAH','QURAN','DHIKR','STUDY'])) then raise exception 'INVALID_VALUE'; end if;
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
-- Güvenlik
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
  set_special(boolean, text[], text[]), get_partner_feed(), set_partner_notify(boolean)
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'denge ok' as result;
