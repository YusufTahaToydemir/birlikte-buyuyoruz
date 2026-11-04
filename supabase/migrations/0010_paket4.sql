-- Kyron · 0010_paket4.sql · "Kale ve bildirim" paketi (4 Kasım 2026)
-- 1) Kale inşası: ortak kale parçaları (altın yatağı), bazı parçalar küçük bonus verir
-- 2) Sezonlar: 3 aylık dönemler, sezon sonu özeti ve ödülü
-- 3) Web Push: abonelikler, hatırlatma saati, gönderim kuyruğu (Edge Function 'push' çeker)

-- =====================================================================
-- 1. Kale
-- =====================================================================
create table if not exists castle_parts (
  couple_id uuid not null references couples(id) on delete cascade,
  key text not null,
  level int not null default 0,
  built_by uuid,
  built_at timestamptz not null default now(),
  primary key (couple_id, key)
);
alter table castle_parts enable row level security;

create or replace function bb_castle_catalog() returns jsonb
language sql immutable as $$
  select '[
    {"key":"wall","name":"Sur","cost":150,"max":3},
    {"key":"gate","name":"Kapı","cost":200,"max":2},
    {"key":"tower_l","name":"Batı Kulesi","cost":300,"max":3},
    {"key":"tower_r","name":"Doğu Kulesi","cost":300,"max":3},
    {"key":"keep","name":"Ana Kule","cost":600,"max":3},
    {"key":"flag","name":"Sancak","cost":100,"max":1},
    {"key":"garden","name":"Bahçe","cost":250,"max":3},
    {"key":"well","name":"Kuyu","cost":200,"max":2},
    {"key":"library","name":"Kütüphane","cost":400,"max":3},
    {"key":"mosque","name":"Mescit","cost":500,"max":3},
    {"key":"forge","name":"Demirci","cost":400,"max":3},
    {"key":"kitchen","name":"Mutfak","cost":300,"max":2},
    {"key":"market","name":"Pazar","cost":400,"max":2},
    {"key":"stable","name":"Ahır","cost":350,"max":2},
    {"key":"fountain","name":"Çeşme","cost":250,"max":1},
    {"key":"orchard","name":"Meyve Bahçesi","cost":350,"max":2},
    {"key":"windmill","name":"Yel Değirmeni","cost":450,"max":1},
    {"key":"bridge","name":"Köprü","cost":300,"max":1},
    {"key":"pond","name":"Gölet","cost":300,"max":1},
    {"key":"lantern","name":"Fenerler","cost":150,"max":2},
    {"key":"bell","name":"Çan Kulesi","cost":500,"max":1},
    {"key":"watchtower","name":"Gözcü Kulesi","cost":450,"max":2},
    {"key":"bath","name":"Hamam","cost":450,"max":1},
    {"key":"observatory","name":"Rasathane","cost":700,"max":1},
    {"key":"banner","name":"Çift Arması","cost":1000,"max":1}
  ]'::jsonb
$$;

create or replace function bb_castle_lv(p_couple uuid, p_key text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select level from castle_parts where couple_id = p_couple and key = p_key), 0)
$$;

create or replace function bb_castle_json(p_couple uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'parts', (select coalesce(jsonb_object_agg(key, level), '{}'::jsonb) from castle_parts where couple_id = p_couple and level > 0),
    'total', (select coalesce(sum(level), 0) from castle_parts where couple_id = p_couple),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'level', level, 'by', built_by, 'at', built_at) order by built_at desc), '[]'::jsonb)
            from (select * from castle_parts where couple_id = p_couple and level > 0 order by built_at desc limit 6) l))
$$;

create or replace function castle_build(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; e jsonb; v_lv int; v_cost int; h heroes;
begin
  c := bb_couple_of(u);
  if c.id is null then raise exception 'NO_PARTNER'; end if;
  select x into e from jsonb_array_elements(bb_castle_catalog()) x where x->>'key' = p_key;
  if e is null then raise exception 'NOT_FOUND'; end if;
  v_lv := bb_castle_lv(c.id, p_key);
  if v_lv >= (e->>'max')::int then raise exception 'MAX_LEVEL'; end if;
  v_cost := (e->>'cost')::int * (v_lv + 1);
  select * into h from heroes where user_id = u for update;
  if h.gold < v_cost then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - v_cost where user_id = u;
  insert into hero_log (user_id, kind, gold) values (u, 'CASTLE', -v_cost);
  insert into castle_parts (couple_id, key, level, built_by, built_at) values (c.id, p_key, 1, u, now())
    on conflict (couple_id, key) do update set level = castle_parts.level + 1, built_by = u, built_at = now();
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'CASTLE_BUILT', jsonb_build_object('key', p_key, 'name', e->>'name', 'level', v_lv + 1, 'cost', v_cost), u); end if;
  perform bb_check_achievements(u);
  return jsonb_build_object('castle', bb_castle_json(c.id), 'game', get_game());
end $$;

create or replace function get_castle() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  return bb_castle_json(c.id);
end $$;

-- Kale bonusları: kuyu → can, mutfak → sabah canı; kütüphane/demirci → XP, bahçe/pazar → altın, mescit → hasar (gün üretiminde)
create or replace function bb_user_max_hp(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select bb_max_hp(bb_level(h.xp)) + 2 * bb_stat_bonus(coalesce((h.stats->>'BODY')::int, 0))
    + 3 * bb_castle_lv((select couple_id from memberships m where m.user_id = p_user and m.ended_at is null limit 1), 'well')
  from heroes h where h.user_id = p_user
$$;

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
  update heroes set hp = least(bb_user_max_hp(p_user), hp + v_regen) where user_id = p_user;
end $$;

-- =====================================================================
-- 2. Sezonlar (3 ay; 1 Kasım 2026'dan itibaren)
-- =====================================================================
create table if not exists seasons (
  couple_id uuid not null references couples(id) on delete cascade,
  n int not null,
  start_date date not null,
  end_date date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  primary key (couple_id, n)
);
alter table seasons enable row level security;

create or replace function bb_season_n(p_date date) returns int
language sql immutable as $$ select ((extract(year from p_date)::int * 12 + extract(month from p_date)::int) - (2026 * 12 + 11)) / 3 + 1 $$;
create or replace function bb_season_start(p_n int) returns date
language sql immutable as $$ select (date '2026-11-01' + make_interval(months => (p_n - 1) * 3))::date $$;
create or replace function bb_season_name(p_n int) returns text
language sql immutable as $$ select (array['Kış Yolu','Bahar Seferi','Yaz Güneşi','Güz Hasadı'])[1 + ((p_n - 1) % 4)] $$;

-- Bir aralığın özeti (iki kahraman)
create or replace function bb_season_summary(p_couple uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_from_ts timestamptz; v_to_ts timestamptz; c couples;
begin
  select * into c from couples where id = p_couple;
  v_from_ts := bb_local_ts(p_from, time '00:00', c.timezone); v_to_ts := bb_local_ts(p_to + 1, time '00:00', c.timezone);
  return jsonb_build_object(
    'heroes', (select coalesce(jsonb_object_agg(m.user_id::text, jsonb_build_object(
        'fullDays', (select count(*) from hero_days hd where hd.user_id = m.user_id and hd.all_done and hd.local_date between p_from and p_to),
        'quests', (select count(*) from quests q where q.user_id = m.user_id and q.done and q.local_date between p_from and p_to),
        'xp', (select coalesce(sum(xp), 0) from hero_log l where l.user_id = m.user_id and l.xp > 0 and l.created_at >= v_from_ts and l.created_at < v_to_ts),
        'bestStreak', (select coalesce(max(streak_len), 0) from (
            select count(*) streak_len from (select local_date, local_date - (row_number() over (order by local_date))::int grp from hero_days hd where hd.user_id = m.user_id and hd.all_done and hd.local_date between p_from and p_to) s group by grp) t),
        'duelWins', (select count(*) from duels d where d.winner = m.user_id and d.finished_at >= v_from_ts and d.finished_at < v_to_ts)
      )), '{}'::jsonb) from memberships m where m.couple_id = p_couple and m.ended_at is null),
    'combos', (select count(*) from couple_combos cc where cc.couple_id = p_couple and cc.local_date between p_from and p_to),
    'bosses', (select count(*) from bosses b where b.couple_id = p_couple and b.defeated_at is not null and b.week_start between p_from and p_to),
    'together', (select count(*) from together_log t where t.couple_id = p_couple and t.status = 'DONE' and t.week_start between p_from and p_to),
    'words', (select count(*) from word_games wg where wg.couple_id = p_couple and wg.solved and wg.local_date between p_from and p_to),
    'quizzes', (select count(*) from quiz_games qg where qg.couple_id = p_couple and qg.finished and qg.week_start between p_from and p_to),
    'raids', (select count(*) from raids r where r.couple_id = p_couple and r.finished and r.local_date between p_from and p_to),
    'notes', (select count(*) from notes n where n.couple_id = p_couple and n.local_date between p_from and p_to),
    'castle', (select coalesce(sum(level), 0) from castle_parts cp where cp.couple_id = p_couple));
end $$;

create or replace function get_season() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_n int; v_s date; v_e date;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  v_n := bb_season_n(v_today); v_s := bb_season_start(v_n); v_e := bb_season_start(v_n + 1) - 1;
  return jsonb_build_object(
    'n', v_n, 'name', bb_season_name(v_n), 'start', v_s, 'end', v_e, 'daysLeft', v_e - v_today + 1, 'dayOf', v_today - v_s + 1, 'days', v_e - v_s + 1,
    'summary', bb_season_summary(c.id, v_s, v_today),
    'past', (select coalesce(jsonb_agg(jsonb_build_object('n', ss.n, 'name', bb_season_name(ss.n), 'start', ss.start_date, 'end', ss.end_date, 'summary', ss.summary) order by ss.n desc), '[]'::jsonb) from seasons ss where ss.couple_id = c.id));
end $$;

-- Sezon sonu: özet kaydı + ikisine de 250 altın + olay
create or replace function bb_close_seasons(p_couple uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c couples; v_today date; n int; k int; v_first date; sm jsonb; m record;
begin
  select * into c from couples where id = p_couple;
  if c.id is null or c.status <> 'ACTIVE' then return; end if;
  v_today := bb_local_date(now(), c.timezone);
  n := bb_season_n(v_today);
  select min(hd.local_date) into v_first from hero_days hd join memberships mm on mm.user_id = hd.user_id where mm.couple_id = p_couple;
  if v_first is null then return; end if;
  for k in greatest(1, bb_season_n(v_first)) .. n - 1 loop
    if exists (select 1 from seasons where couple_id = p_couple and seasons.n = k) then continue; end if;
    sm := bb_season_summary(p_couple, bb_season_start(k), bb_season_start(k + 1) - 1);
    insert into seasons (couple_id, n, start_date, end_date, summary) values (p_couple, k, bb_season_start(k), bb_season_start(k + 1) - 1, sm) on conflict do nothing;
    for m in select user_id from memberships where couple_id = p_couple and ended_at is null loop
      perform bb_grant(m.user_id, 'SEASON', 0, 250);
      insert into achievements (user_id, key) values (m.user_id, 'SEASON_' || k) on conflict do nothing;
      perform bb_event(m.user_id, 'SEASON_END', jsonb_build_object('n', k, 'name', bb_season_name(k), 'gold', 250, 'summary', sm));
    end loop;
  end loop;
end $$;

-- =====================================================================
-- 3. Web Push
-- =====================================================================
create table if not exists push_subs (
  endpoint text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
alter table push_subs enable row level security;
alter table heroes add column if not exists remind_hour int check (remind_hour between 0 and 23);
alter table hero_events add column if not exists pushed boolean not null default false;
create table if not exists push_log (
  user_id uuid not null references app_users(id) on delete cascade,
  local_date date not null,
  kind text not null,
  primary key (user_id, local_date, kind)
);
alter table push_log enable row level security;
update app_config set value = value || jsonb_build_object('pushSecret', encode(extensions.gen_random_bytes(24), 'hex')) where key = 'game' and not (value ? 'pushSecret');

create or replace function push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'INVALID_VALUE'; end if;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (left(p_endpoint, 1000), u, left(p_p256dh, 300), left(p_auth, 100))
    on conflict (endpoint) do update set user_id = u, p256dh = excluded.p256dh, auth = excluded.auth;
  update heroes set remind_hour = coalesce(remind_hour, 20) where user_id = u;
  return jsonb_build_object('ok', true, 'subs', (select count(*) from push_subs where user_id = u));
end $$;

create or replace function push_unsubscribe(p_endpoint text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  delete from push_subs where user_id = u and (p_endpoint is null or endpoint = p_endpoint);
  return jsonb_build_object('ok', true, 'subs', (select count(*) from push_subs where user_id = u));
end $$;

create or replace function set_reminder(p_hour int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  if p_hour is not null and p_hour not between 0 and 23 then raise exception 'INVALID_VALUE'; end if;
  update heroes set remind_hour = p_hour where user_id = u;
  return get_game();
end $$;

-- Gönderim kuyruğu: yalnızca Edge Function (service role) çağırır. Olay bildirimleri + akşam hatırlatması.
create or replace function bb_push_queue() returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; r record; c couples; v_today date; v_hour int; v_left int; v_names text; v_n int;
begin
  -- 1) görülmemiş ve gönderilmemiş olaylar (son 30 dk)
  for r in select e.user_id, count(*) n, string_agg(distinct e.kind, ',') kinds, max(au.display_name) from_name
           from hero_events e left join app_users au on au.id = e.from_user
           where not e.seen and not e.pushed and e.created_at > now() - interval '30 minutes'
             and e.kind not in ('WORD_GUESS','ACHIEVEMENT','LEVEL_UP','SHARD','DAY_DAMAGE','FAINT')
             and exists (select 1 from push_subs p where p.user_id = e.user_id)
           group by e.user_id loop
    update hero_events set pushed = true where user_id = r.user_id and not seen and not pushed;
    out := out || jsonb_build_object('user', r.user_id, 'title', 'Kyron',
      'body', case when r.n = 1 then coalesce(r.from_name || ': ', '') || bb_push_text(r.kinds) else r.n || ' yeni olay · ' || replace(r.kinds, ',', ', ') end,
      'tag', 'events', 'subs', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) from push_subs where user_id = r.user_id));
  end loop;
  -- 2) akşam hatırlatması: saat geldi, bugün eksik görev var, bugün gönderilmedi
  for r in select h.user_id, h.remind_hour, m.couple_id from heroes h join memberships m on m.user_id = h.user_id and m.ended_at is null
           where h.remind_hour is not null and exists (select 1 from push_subs p where p.user_id = h.user_id) loop
    select * into c from couples where id = r.couple_id;
    v_today := bb_local_date(now(), c.timezone);
    v_hour := extract(hour from (now() at time zone c.timezone))::int;
    if v_hour <> r.remind_hour then continue; end if;
    if exists (select 1 from push_log where user_id = r.user_id and local_date = v_today and kind = 'REMIND') then continue; end if;
    select count(*) into v_left from quests q where q.user_id = r.user_id and q.local_date = v_today and q.kind = 'DAILY' and not q.done;
    if v_left = 0 then continue; end if;
    if (select izin from hero_days where user_id = r.user_id and local_date = v_today) then continue; end if;
    insert into push_log (user_id, local_date, kind) values (r.user_id, v_today, 'REMIND');
    out := out || jsonb_build_object('user', r.user_id, 'title', 'Kyron · ' || v_left || ' görev kaldı',
      'body', case when v_left = 1 then 'Bir görev daha, gün tamam!' else 'Canavar bekliyor, kahramanın seni çağırıyor.' end, 'tag', 'remind',
      'subs', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) from push_subs where user_id = r.user_id));
  end loop;
  return out;
end $$;

create or replace function bb_push_text(p_kinds text) returns text
language sql immutable as $$
  select case split_part(p_kinds, ',', 1)
    when 'CHEER' then 'seni alkışladı' when 'HEAL' then 'seni iyileştirdi' when 'GIFT' then 'sana altın gönderdi'
    when 'DUEL_INVITE' then 'sana meydan okudu!' when 'DUEL_RESULT' then 'düello sonuçlandı' when 'TICKET_REQUEST' then 'bir bilet kullanmak istiyor'
    when 'TICKET_APPROVED' then 'biletini onayladı' when 'LETTER' then 'sana mektup yazdı' when 'THANKS' then 'bugünün şükrünü yazdı'
    when 'THANKS_BOTH' then 'iki şükür · +10 altın' when 'QUIZ_WAIT' then 'çift testini cevapladı, sıra sende' when 'QUIZ_RESULT' then 'çift testi sonuçlandı'
    when 'RAID_WAIT' then 'baskına katıldı, sıra sende' when 'RAID_DONE' then 'baskın tamam, canavar hasar aldı' when 'TOGETHER_REQUEST' then 'birlikte etkinlik onayı bekliyor'
    when 'TOGETHER_DONE' then 'birlikte etkinlik tamam' when 'COMBO' then 'kombo! ikiniz de tam gün' when 'BOSS_DEFEATED' then 'canavar yenildi!'
    when 'SKILL_USED' then 'yeteneğini kullandı' when 'CASTLE_BUILT' then 'kaleye yeni parça ekledi' when 'STREAK_SAVED' then 'serin kalkanla korundu'
    when 'TWIN_BONUS' then 'çift gün bonusu' when 'SEASON_END' then 'sezon bitti, özetin hazır' when 'WORD_HINT' then 'kelimeye ipucu aldı' when 'WORD_SOLVED' then 'günün kelimesi çözüldü'
    else 'yeni bir şey oldu' end
$$;

-- Gönderim sonucu: ölü abonelikleri sil
create or replace function bb_push_result(p_dead text[], p_ok text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subs where endpoint = any(coalesce(p_dead, '{}'));
  update push_subs set last_ok = now() where endpoint = any(coalesce(p_ok, '{}'));
end $$;

-- İşler: sezon kapanışı
create or replace function bb_run_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0; cpl record;
begin
  for u in select m.user_id from memberships m join heroes h on h.user_id = m.user_id where m.ended_at is null loop
    begin
      perform bb_process_user(u.user_id);
      n := n + 1;
    exception when others then
      insert into audit_events (actor_id, event_type) values (u.user_id, 'JOB_ERROR:' || left(sqlerrm, 80));
    end;
  end loop;
  for cpl in select id from couples where status = 'ACTIVE' loop
    begin perform bb_close_seasons(cpl.id);
    exception when others then insert into audit_events (actor_id, event_type) values (null, 'SEASON_ERROR:' || left(sqlerrm, 80)); end;
  end loop;
  update ticket_redemptions r set status = 'EXPIRED', resolved_at = now() where r.status = 'REQUESTED' and r.expires_at <= now();
  update tickets tk set status = 'AVAILABLE' where tk.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = tk.id and r.status = 'REQUESTED');
  update duels set status = 'EXPIRED' where status = 'OPEN' and expires_at <= now();
  delete from idempotency_records where expires_at < now();
  return n;
end $$;

-- hero json: hatırlatma saati; get_game config'e vapid public key (app_config'ten) ve kale
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
    'remindHour', h.remind_hour, 'pushSubs', (select count(*) from push_subs p where p.user_id = p_user));
end $$;

-- rozetler: kale ve sezon
create or replace function bb_check_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_done int; v_lvl int; k text; v_new text[] := '{}'; c couples; v_boss int; v_wins int; v_words int; v_tog int; v_chain int; v_skill int; v_quiz int; v_letters int; v_raids int; v_castle int;
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
  select count(*) into v_quiz from quiz_games where couple_id = c.id and finished;
  select count(*) into v_letters from notes where author = p_user and kind = 'LETTER';
  select count(*) into v_raids from raids where couple_id = c.id and finished;
  select coalesce(sum(level), 0) into v_castle from castle_parts where couple_id = c.id;
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
  if v_quiz >= 1 then v_new := array_append(v_new, 'QUIZ_1'); end if;
  if exists (select 1 from quiz_games where couple_id = c.id and finished and matches >= 10) then v_new := array_append(v_new, 'QUIZ_PERFECT'); end if;
  if v_letters >= 10 then v_new := array_append(v_new, 'LETTER_10'); end if;
  if v_raids >= 5 then v_new := array_append(v_new, 'RAID_5'); end if;
  if v_castle >= 1 then v_new := array_append(v_new, 'CASTLE_1'); end if;
  if v_castle >= 26 then v_new := array_append(v_new, 'CASTLE_26'); end if;
  foreach k in array v_new loop
    insert into achievements (user_id, key) values (p_user, k) on conflict do nothing;
    if found then perform bb_event(p_user, 'ACHIEVEMENT', jsonb_build_object('key', k)); end if;
  end loop;
end $$;

-- =====================================================================
-- 4. Güvenlik
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
  castle_build(text), get_castle(), get_season(), push_subscribe(text, text, text), push_unsubscribe(text), set_reminder(int)
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;
-- bb_push_queue / bb_push_result yalnızca service_role (Edge Function) tarafından çağrılır; service_role zaten her şeye erişir.

select 'paket4 ok' as result, jsonb_array_length(bb_castle_catalog()) as parts, bb_season_n(current_date) as season, bb_season_name(bb_season_n(current_date)) as season_name;
