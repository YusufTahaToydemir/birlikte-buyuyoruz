-- Birlikte Büyüyoruz · 0005_game_v2.sql · RPG yeniden tasarımı (kullanıcı geri bildirimi 4 Kasım 2026)
-- Eski görev/plan sistemi kaldırılır; oyun: kahraman, sınıf, zorluk, günlük + sürpriz görev, can, altın, boss, dükkan.
-- Korunanlar: couples, app_users, memberships, setup_keys, invites, tickets, ticket_redemptions, recovery_codes,
-- recovery_attempts, idempotency_records, audit_events.

-- =====================================================================
-- 0. Eski fonksiyon ve tabloları temizle
-- =====================================================================
drop trigger if exists bb_on_auth_user_created on auth.users;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

drop table if exists profiles, sharing_settings, plan_versions, goal_versions, daily_summaries, task_instances, task_events,
  xp_ledger, level_celebrations, heart_ledger, wallet_balances, reward_catalog, user_inventory, couple_inventory,
  skill_uses, shared_activities, activity_confirmations, couple_rule_versions, weekly_results, goal_pauses, skill_catalog cascade;

-- Biletler: kaynağa göre tekil (haftada boss + kişisel = en fazla 2)
alter table tickets drop constraint if exists tickets_owner_id_awarded_week_start_key;
alter table tickets add column if not exists source_key text;
alter table tickets add column if not exists source text;
update tickets set source_key = 'legacy:' || id where source_key is null;
alter table tickets alter column source_key set not null;
create unique index if not exists tickets_source_key_uq on tickets(source_key);

-- =====================================================================
-- 1. Oyun ayarları
-- =====================================================================
insert into app_config (key, version, value) values ('game', 1, '{
  "difficulties": [
    {"n":1,"name":"Çırak","mult":1.0,"damage":2,"sides":1},
    {"n":2,"name":"Acemi","mult":1.25,"damage":3,"sides":2},
    {"n":3,"name":"Yiğit","mult":1.5,"damage":4,"sides":2},
    {"n":4,"name":"Kahraman","mult":2.0,"damage":5,"sides":3},
    {"n":5,"name":"Efsane","mult":2.5,"damage":6,"sides":3},
    {"n":6,"name":"Mitik","mult":3.0,"damage":8,"sides":4}
  ],
  "classBonus": {"WARRIOR":"BODY","MAGE":"MIND","HEALER":"SPIRIT","RANGER":"ORDER"},
  "bosses": [
    {"key":"slime_green","name":"Balçık Kral"},
    {"key":"golem_stone","name":"Taş Golem"},
    {"key":"dragon_green","name":"Orman Ejderi"},
    {"key":"slime_purple","name":"Zehir Balçığı"},
    {"key":"golem_lava","name":"Lav Golemi"},
    {"key":"dragon_shadow","name":"Gölge Ejderi"}
  ],
  "morningRegen": 10,
  "bossGold": 100,
  "comboGold": 20,
  "comboDamage": 100,
  "cheerXP": 5,
  "cheersPerDay": 3,
  "healAmount": 25
}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- =====================================================================
-- 2. Tablolar
-- =====================================================================
create table if not exists heroes (
  user_id uuid primary key references app_users(id) on delete cascade,
  class text not null check (class in ('WARRIOR','MAGE','RANGER','HEALER')),
  look jsonb not null default '{}'::jsonb,
  difficulty int not null default 1 check (difficulty between 1 and 6),
  pending_difficulty int check (pending_difficulty between 1 and 6),
  hp int not null default 100,
  xp bigint not null default 0 check (xp >= 0),
  gold int not null default 0 check (gold >= 0),
  stats jsonb not null default '{"BODY":0,"MIND":0,"SPIRIT":0,"ORDER":0}'::jsonb,
  equipped jsonb not null default '{"weapon":0,"armor":0}'::jsonb,
  streak int not null default 0,
  best_streak int not null default 0,
  sound boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists quest_catalog (
  code text primary key,
  kind text not null check (kind in ('DAILY','SIDE')),
  category text not null check (category in ('BODY','MIND','SPIRIT','ORDER')),
  icon text not null,
  title text not null,
  targets jsonb,
  min_difficulty int not null default 1,
  base_xp int not null,
  sort int not null default 100
);

create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  local_date date not null,
  code text not null,
  kind text not null,
  category text not null,
  icon text not null,
  title text not null,
  xp int not null,
  gold int not null,
  damage int not null,
  sort int not null default 100,
  done boolean not null default false,
  done_at timestamptz,
  unique (user_id, local_date, code)
);

create table if not exists hero_days (
  user_id uuid not null references app_users(id) on delete cascade,
  local_date date not null,
  difficulty int not null,
  izin boolean not null default false,
  closed boolean not null default false,
  all_done boolean not null default false,
  hp_lost int not null default 0,
  primary key (user_id, local_date)
);

create table if not exists hero_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  kind text not null,
  xp int not null default 0,
  gold int not null default 0,
  hp int not null default 0,
  ref uuid,
  created_at timestamptz not null default now()
);
create index if not exists hero_log_user_time on hero_log(user_id, created_at);

create table if not exists bosses (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  week_start date not null,
  boss_key text not null,
  name text not null,
  max_hp int not null,
  hp int not null,
  defeated_at timestamptz,
  unique (couple_id, week_start)
);

create table if not exists boss_hits (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references bosses(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  quest_id uuid unique,
  kind text not null default 'QUEST',
  damage int not null,
  created_at timestamptz not null default now()
);

create table if not exists couple_combos (
  couple_id uuid not null references couples(id) on delete cascade,
  local_date date not null,
  primary key (couple_id, local_date)
);

create table if not exists shop_items (
  key text primary key,
  name text not null,
  kind text not null check (kind in ('WEAPON','ARMOR','HEAD','CAPE','PET','POTION')),
  tier int not null default 0,
  min_level int not null default 1,
  price int not null,
  effect int not null default 0,
  sort int not null default 100
);

create table if not exists inventory (
  user_id uuid not null references app_users(id) on delete cascade,
  item_key text not null references shop_items(key),
  qty int not null default 1 check (qty >= 0),
  primary key (user_id, item_key)
);

create table if not exists hero_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  from_user uuid references app_users(id) on delete set null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hero_events_user on hero_events(user_id, seen);

create table if not exists achievements (
  user_id uuid not null references app_users(id) on delete cascade,
  key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists hero_weeks (
  user_id uuid not null references app_users(id) on delete cascade,
  week_start date not null,
  full_days int not null,
  izin_days int not null,
  earned boolean not null,
  primary key (user_id, week_start)
);

do $$
declare t text;
begin
  foreach t in array array['heroes','quest_catalog','quests','hero_days','hero_log','bosses','boss_hits','couple_combos','shop_items','inventory','hero_events','achievements','hero_weeks'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;

-- =====================================================================
-- 3. Görev kataloğu (kullanıcının onayladığı zorluk tablosu)
-- =====================================================================
delete from quest_catalog;
insert into quest_catalog (code, kind, category, icon, title, targets, min_difficulty, base_xp, sort) values
  ('WAKE',     'DAILY','BODY',  'sun',     '{t}''dan önce kalk', '{"2":"07:30","3":"07:00","4":"06:30","5":"06:00","6":"05:30"}', 2, 15, 10),
  ('FAJR',     'DAILY','SPIRIT','fajr',    'Sabah namazı', null, 1, 10, 20),
  ('DHUHR',    'DAILY','SPIRIT','dhuhr',   'Öğle namazı', null, 1, 10, 21),
  ('ASR',      'DAILY','SPIRIT','asr',     'İkindi namazı', null, 1, 10, 22),
  ('MAGHRIB',  'DAILY','SPIRIT','maghrib', 'Akşam namazı', null, 1, 10, 23),
  ('ISHA',     'DAILY','SPIRIT','isha',    'Yatsı namazı', null, 1, 10, 24),
  ('QURAN',    'DAILY','SPIRIT','quran',   'Kur''an · {t}', '{"1":"1 sayfa","2":"2 sayfa","3":"3 sayfa","4":"5 sayfa","5":"10 sayfa","6":"20 sayfa"}', 1, 15, 30),
  ('DHIKR',    'DAILY','SPIRIT','beads',   'Tesbihat', null, 2, 10, 31),
  ('SUNNAH',   'DAILY','SPIRIT','moon',    'Duha veya teheccüd', null, 6, 15, 32),
  ('ENGLISH',  'DAILY','MIND',  'scroll',  'İngilizce · {t} kelime', '{"1":"5","2":"10","3":"15","4":"20","5":"30","6":"50"}', 1, 15, 40),
  ('READING',  'DAILY','MIND',  'book',    'Kitap · {t} dk', '{"1":"5","2":"10","3":"15","4":"20","5":"30","6":"45"}', 1, 15, 41),
  ('STUDY',    'DAILY','MIND',  'lamp',    'Dinî çalışma · 10 dk', null, 3, 10, 42),
  ('SPORT',    'DAILY','BODY',  'sword',   'Spor · {t} dk', '{"1":"10","2":"15","3":"20","4":"30","5":"45","6":"60"}', 1, 20, 50),
  ('FOOD',     'DAILY','ORDER', 'apple',   'Sağlıklı beslen', null, 3, 15, 60),
  ('NOSUGAR',  'DAILY','ORDER', 'nocandy', 'Şekersiz gün', null, 4, 15, 61),
  ('NOSCREEN', 'DAILY','ORDER', 'nophone', '1 saat ekransız', null, 5, 15, 62),
  -- Sürpriz yan görevler (zarla seçilir; düzen kategorisi 3. zorluktan itibaren)
  ('S_WATER',  'SIDE','ORDER',  'water',   '2 bardak su iç', null, 3, 10, 100),
  ('S_WALK',   'SIDE','BODY',   'boot',    '10 dk yürü', null, 1, 10, 100),
  ('S_HELP',   'SIDE','SPIRIT', 'hand',    'Birine yardım et', null, 1, 10, 100),
  ('S_PARENTS','SIDE','SPIRIT', 'heart',   'Anne-babanı ara', null, 1, 10, 100),
  ('S_TIDY',   'SIDE','ORDER',  'broom',   'Odanı topla', null, 3, 10, 100),
  ('S_STRETCH','SIDE','BODY',   'stretch', '5 dk esne', null, 1, 10, 100),
  ('S_DUA',    'SIDE','SPIRIT', 'pray',    'Bir dua ezberle', null, 1, 10, 100),
  ('S_NOTE',   'SIDE','MIND',   'quill',   'Okuduğundan not çıkar', null, 1, 10, 100),
  ('S_CHARITY','SIDE','SPIRIT', 'coin',    'Sadaka ver', null, 1, 10, 100),
  ('S_SLEEP',  'SIDE','ORDER',  'bed',     '23:00''te yat', null, 3, 10, 100),
  ('S_PRAISE', 'SIDE','SPIRIT', 'sparkle', 'Partnerine iltifat et', null, 1, 10, 100),
  ('S_STAIRS', 'SIDE','BODY',   'stairs',  'Asansör yerine merdiven', null, 1, 10, 100),
  ('S_PUSHUP', 'SIDE','BODY',   'muscle',  '10 şınav', null, 1, 10, 100),
  ('S_FRUIT',  'SIDE','ORDER',  'apple',   'Bir meyve ye', null, 3, 10, 100),
  ('S_PHONE',  'SIDE','ORDER',  'nophone', 'Telefonsuz yemek', null, 3, 10, 100),
  ('S_LISTEN', 'SIDE','MIND',   'music',   'Bir ders veya sohbet dinle', null, 1, 10, 100),
  ('S_ISTIGFAR','SIDE','SPIRIT','beads',   '100 istiğfar', null, 1, 10, 100),
  ('S_PUZZLE', 'SIDE','MIND',   'puzzle',  'Bir bulmaca çöz', null, 1, 10, 100),
  ('S_DISHES', 'SIDE','ORDER',  'broom',   'Bulaşığı yıka', null, 3, 10, 100),
  ('S_WORDS',  'SIDE','MIND',   'scroll',  '3 yeni kelime öğret', null, 1, 10, 100);

-- =====================================================================
-- 4. Dükkan
-- =====================================================================
delete from inventory where item_key not in ('x');
delete from shop_items;
insert into shop_items (key, name, kind, tier, min_level, price, effect, sort) values
  ('weapon_1','Bronz Silah','WEAPON',1,3,100,0,10),
  ('weapon_2','Gümüş Silah','WEAPON',2,8,300,0,11),
  ('weapon_3','Altın Silah','WEAPON',3,15,800,0,12),
  ('weapon_4','Efsanevi Silah','WEAPON',4,25,2000,0,13),
  ('armor_1','Bronz Zırh','ARMOR',1,3,100,0,20),
  ('armor_2','Gümüş Zırh','ARMOR',2,8,300,0,21),
  ('armor_3','Altın Zırh','ARMOR',3,15,800,0,22),
  ('armor_4','Efsanevi Zırh','ARMOR',4,25,2000,0,23),
  ('head_class','Sınıf Başlığı','HEAD',0,2,60,0,30),
  ('head_flower','Çiçek Tacı','HEAD',0,4,120,0,31),
  ('head_crown','Kral Tacı','HEAD',0,20,1500,0,32),
  ('cape_red','Kızıl Pelerin','CAPE',0,3,80,0,40),
  ('cape_blue','Mavi Pelerin','CAPE',0,3,80,0,41),
  ('cape_royal','Kraliyet Peleri','CAPE',0,12,400,0,42),
  ('cape_gold','Altın Pelerin','CAPE',0,22,1200,0,43),
  ('pet_cat','Kedi','PET',0,5,250,0,50),
  ('pet_fox','Tilki','PET',0,10,500,0,51),
  ('pet_owl','Baykuş','PET',0,15,800,0,52),
  ('pet_dragon','Yavru Ejder','PET',0,25,2000,0,53),
  ('potion_small','Can İksiri','POTION',0,1,25,30,60),
  ('potion_big','Büyük İksir','POTION',0,6,60,80,61);
update shop_items set name = 'Kraliyet Pelerini' where key = 'cape_royal';

-- =====================================================================
-- 5. Saf yardımcılar
-- =====================================================================
create or replace function bb_week_start(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;
create or replace function bb_local_date(ts timestamptz, tz text) returns date
language sql stable as $$ select (ts at time zone tz)::date $$;
create or replace function bb_local_ts(d date, t time, tz text) returns timestamptz
language sql stable as $$ select ((d + t)::timestamp) at time zone tz $$;
create or replace function bb_hash(s text) returns text
language sql immutable as $$ select encode(extensions.digest(s, 'sha256'), 'hex') $$;

create or replace function bb_level(xp bigint) returns int
language sql immutable as $$ select greatest(1, floor((1 + sqrt(1 + greatest(xp, 0) * 0.08)) / 2)::int) $$;
create or replace function bb_level_start(l int) returns bigint
language sql immutable as $$ select (50::bigint * l * (l - 1)) $$;
create or replace function bb_max_hp(l int) returns int
language sql immutable as $$ select 100 + 5 * (l - 1) $$;

create or replace function bb_diff(n int) returns jsonb
language sql stable as $$ select d from app_config c, jsonb_array_elements(c.value->'difficulties') d where c.key = 'game' and (d->>'n')::int = n $$;

create or replace function bb_quest_xp(p_base int, p_diff int, p_class text, p_category text, p_kind text) returns int
language plpgsql stable as $$
declare m numeric := (bb_diff(p_diff)->>'mult')::numeric; bonus numeric := 1;
begin
  if (select value->'classBonus'->>p_class from app_config where key = 'game') = p_category then bonus := 1.1; end if;
  if p_class = 'RANGER' and p_kind = 'SIDE' then bonus := 1.1; end if;
  return round(p_base * m * bonus)::int;
end $$;

create or replace function bb_current_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (select 1 from app_users where id = u and status = 'ACTIVE') then raise exception 'UNAUTHENTICATED'; end if;
  return u;
end $$;

create or replace function bb_couple_of(p_user uuid) returns couples
language sql stable security definer set search_path = public as $$
  select c.* from couples c join memberships m on m.couple_id = c.id
  where m.user_id = p_user and m.ended_at is null limit 1
$$;

create or replace function bb_partner_of(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m2.user_id from memberships m1 join memberships m2 on m2.couple_id = m1.couple_id and m2.user_id <> m1.user_id
  where m1.user_id = p_user and m1.ended_at is null and m2.ended_at is null limit 1
$$;

create or replace function bb_event(p_user uuid, p_kind text, p_data jsonb default '{}'::jsonb, p_from uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into hero_events (user_id, from_user, kind, data) values (p_user, p_from, p_kind, coalesce(p_data, '{}'::jsonb))
$$;

-- =====================================================================
-- 6. Kayıt tetikleyicisi (kurulum anahtarı / davet)
-- =====================================================================
create or replace function bb_handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(trim(coalesce(meta->>'username', '')));
  v_display text := trim(coalesce(meta->>'display_name', ''));
  v_couple uuid; v_role text; v_key_id uuid; v_invite_id uuid; v_member_count int;
begin
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'INVALID_USERNAME'; end if;
  if char_length(v_display) < 1 or char_length(v_display) > 40 then v_display := v_username; end if;
  if exists (select 1 from app_users where username = v_username) then raise exception 'USERNAME_TAKEN'; end if;

  if coalesce(meta->>'setup_key', '') <> '' then
    select id into v_key_id from setup_keys where key_hash = bb_hash(meta->>'setup_key') and used_at is null for update;
    if v_key_id is null then raise exception 'INVALID_SETUP_KEY'; end if;
    insert into couples default values returning id into v_couple;
    update setup_keys set used_at = now(), used_by = new.id where id = v_key_id;
    v_role := 'FIRST';
  elsif coalesce(meta->>'invite_token', '') <> '' then
    select i.id, i.couple_id into v_invite_id, v_couple from invites i join couples c on c.id = i.couple_id
      where i.token_hash = bb_hash(meta->>'invite_token') and i.used_at is null and i.expires_at > now() and c.status = 'ACTIVE'
      for update of i;
    if v_invite_id is null then raise exception 'INVALID_INVITE'; end if;
    select count(*) into v_member_count from memberships where couple_id = v_couple and ended_at is null;
    if v_member_count >= 2 then raise exception 'COUPLE_FULL'; end if;
    update invites set used_at = now(), used_by = new.id where id = v_invite_id;
    v_role := 'SECOND';
  else
    raise exception 'SIGNUP_CLOSED';
  end if;

  insert into app_users (id, username, display_name) values (new.id, v_username, v_display);
  insert into memberships (user_id, couple_id, role) values (new.id, v_couple, v_role);
  insert into audit_events (actor_id, event_type, object_id) values (new.id, 'ACCOUNT_CREATED', v_couple);
  update auth.users set raw_user_meta_data = meta - 'setup_key' - 'invite_token' where id = new.id;
  return new;
end $$;
create trigger bb_on_auth_user_created after insert on auth.users for each row execute function bb_handle_new_auth_user();

-- =====================================================================
-- 7. Gün üretimi ve kapanışı
-- =====================================================================
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int; v_regen int := coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10);
begin
  if exists (select 1 from hero_days where user_id = p_user and local_date = p_date) then return; end if;
  select * into h from heroes where user_id = p_user for update;
  if h.user_id is null then return; end if;
  if h.pending_difficulty is not null then
    update heroes set difficulty = pending_difficulty, pending_difficulty = null where user_id = p_user returning * into h;
  end if;
  d := h.difficulty;
  v_sides := (bb_diff(d)->>'sides')::int;
  insert into hero_days (user_id, local_date, difficulty) values (p_user, p_date, d);
  insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
  select p_user, p_date, q.code, q.kind, q.category, q.icon,
    case when q.targets is null then q.title else replace(q.title, '{t}', coalesce(q.targets->>d::text, '')) end,
    bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind),
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2)::int,
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * (1 + 0.1 * coalesce((h.equipped->>'weapon')::int, 0)))::int,
    q.sort
  from quest_catalog q where q.kind = 'DAILY' and q.min_difficulty <= d;
  insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
  select p_user, p_date, q.code, q.kind, q.category, q.icon, q.title,
    bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind),
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2)::int,
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * (1 + 0.1 * coalesce((h.equipped->>'weapon')::int, 0)))::int,
    200
  from quest_catalog q where q.kind = 'SIDE' and q.min_difficulty <= d
  order by md5(p_user::text || p_date::text || q.code) limit v_sides;
  -- sabah canı
  update heroes set hp = least(bb_max_hp(bb_level(xp)), hp + v_regen) where user_id = p_user;
end $$;

create or replace function bb_close_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  hd hero_days; h heroes; v_missed int; v_total int; v_dmg int; v_lost_gold int; v_partner uuid; pd hero_days; c couples; b bosses;
  cfg jsonb := (select value from app_config where key = 'game');
begin
  select * into hd from hero_days where user_id = p_user and local_date = p_date for update;
  if hd.user_id is null or hd.closed then return; end if;
  select count(*) filter (where not done), count(*) into v_missed, v_total from quests where user_id = p_user and local_date = p_date and kind = 'DAILY';
  select * into h from heroes where user_id = p_user for update;
  v_dmg := 0;
  if not hd.izin and v_missed > 0 then
    v_dmg := greatest(1, round(v_missed * (bb_diff(hd.difficulty)->>'damage')::int * (1 - 0.08 * coalesce((h.equipped->>'armor')::int, 0))))::int;
  end if;
  update hero_days set closed = true, all_done = (v_missed = 0 and v_total > 0), hp_lost = v_dmg where user_id = p_user and local_date = p_date returning * into hd;
  if hd.izin then
    null; -- izin günü: seri değişmez
  elsif hd.all_done then
    update heroes set streak = streak + 1, best_streak = greatest(best_streak, streak + 1) where user_id = p_user;
  else
    update heroes set streak = 0 where user_id = p_user;
  end if;
  if v_dmg > 0 then
    update heroes set hp = hp - v_dmg where user_id = p_user returning * into h;
    insert into hero_log (user_id, kind, hp) values (p_user, 'MISSED', -v_dmg);
    perform bb_event(p_user, 'DAY_DAMAGE', jsonb_build_object('missed', v_missed, 'hp', v_dmg, 'date', p_date));
    if h.hp <= 0 then
      v_lost_gold := floor(h.gold * 0.1)::int;
      update heroes set hp = bb_max_hp(bb_level(xp)) / 2, gold = gold - v_lost_gold where user_id = p_user;
      insert into hero_log (user_id, kind, gold) values (p_user, 'FAINT', -v_lost_gold);
      perform bb_event(p_user, 'FAINT', jsonb_build_object('gold', v_lost_gold));
    end if;
  end if;
  -- Kombo: ikiniz de günlükleri tamamladıysanız boss'a ekstra vuruş + altın
  v_partner := bb_partner_of(p_user);
  if hd.all_done and v_partner is not null then
    select * into pd from hero_days where user_id = v_partner and local_date = p_date;
    c := bb_couple_of(p_user);
    if pd.closed and pd.all_done then
      insert into couple_combos (couple_id, local_date) values (c.id, p_date) on conflict do nothing;
      if found then
        update heroes set gold = gold + (cfg->>'comboGold')::int where user_id in (p_user, v_partner);
        insert into hero_log (user_id, kind, gold) values (p_user, 'COMBO', (cfg->>'comboGold')::int), (v_partner, 'COMBO', (cfg->>'comboGold')::int);
        select * into b from bosses where couple_id = c.id and week_start = bb_week_start(p_date) for update;
        if b.id is not null and b.defeated_at is null then
          insert into boss_hits (boss_id, user_id, kind, damage) values (b.id, null, 'COMBO', least(b.hp, (cfg->>'comboDamage')::int));
          update bosses set hp = greatest(0, hp - (cfg->>'comboDamage')::int) where id = b.id returning * into b;
          if b.hp = 0 then perform bb_defeat_boss(b.id); end if;
        end if;
        perform bb_event(p_user, 'COMBO', jsonb_build_object('gold', (cfg->>'comboGold')::int, 'damage', (cfg->>'comboDamage')::int));
        perform bb_event(v_partner, 'COMBO', jsonb_build_object('gold', (cfg->>'comboGold')::int, 'damage', (cfg->>'comboDamage')::int));
      end if;
    end if;
  end if;
end $$;

-- =====================================================================
-- 8. Boss
-- =====================================================================
create or replace function bb_expected_daily_xp(p_diff int, p_class text) returns int
language sql stable as $$
  select coalesce(sum(bb_quest_xp(base_xp, p_diff, p_class, category, kind)), 0)::int
       + (bb_diff(p_diff)->>'sides')::int * bb_quest_xp(10, p_diff, p_class, 'NONE', 'SIDE')
  from quest_catalog where kind = 'DAILY' and min_difficulty <= p_diff
$$;

create or replace function bb_ensure_boss(p_couple uuid, p_week date) returns bosses
language plpgsql security definer set search_path = public as $$
declare b bosses; v_hp int; v_list jsonb := (select value->'bosses' from app_config where key = 'game'); v_idx int; v_pick jsonb;
begin
  select * into b from bosses where couple_id = p_couple and week_start = p_week;
  if b.id is not null then return b; end if;
  select coalesce(sum(bb_expected_daily_xp(h.difficulty, h.class) * 7 * 0.6), 0)::int into v_hp
    from memberships m join heroes h on h.user_id = m.user_id where m.couple_id = p_couple and m.ended_at is null;
  v_hp := greatest(300, v_hp);
  v_idx := (extract(week from p_week)::int) % jsonb_array_length(v_list);
  v_pick := v_list->v_idx;
  insert into bosses (couple_id, week_start, boss_key, name, max_hp, hp) values (p_couple, p_week, v_pick->>'key', v_pick->>'name', v_hp, v_hp)
    on conflict (couple_id, week_start) do nothing;
  select * into b from bosses where couple_id = p_couple and week_start = p_week;
  return b;
end $$;

create or replace function bb_defeat_boss(p_boss uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bosses; m record; v_gold int := coalesce(((select value from app_config where key = 'game')->>'bossGold')::int, 100);
begin
  select * into b from bosses where id = p_boss for update;
  if b.defeated_at is not null then return; end if;
  update bosses set defeated_at = now(), hp = 0 where id = p_boss;
  for m in select user_id from memberships where couple_id = b.couple_id and ended_at is null loop
    update heroes set gold = gold + v_gold where user_id = m.user_id;
    insert into hero_log (user_id, kind, gold, ref) values (m.user_id, 'BOSS', v_gold, p_boss);
    insert into tickets (owner_id, awarded_week_start, rule_version, source, source_key)
      values (m.user_id, b.week_start, 2, 'BOSS', 'boss:' || p_boss || ':' || m.user_id) on conflict (source_key) do nothing;
    perform bb_event(m.user_id, 'BOSS_DEFEATED', jsonb_build_object('name', b.name, 'gold', v_gold, 'bossKey', b.boss_key));
  end loop;
end $$;

-- =====================================================================
-- 9. Haftalık kişisel bilet ve başarımlar
-- =====================================================================
create or replace function bb_process_weeks(p_user uuid, p_today date) returns void
language plpgsql security definer set search_path = public as $$
declare wk record; v_full int; v_izin int; v_req int; v_earned boolean;
begin
  for wk in select distinct bb_week_start(local_date) as ws from hero_days where user_id = p_user and bb_week_start(local_date) < bb_week_start(p_today) loop
    if exists (select 1 from hero_weeks where user_id = p_user and week_start = wk.ws) then continue; end if;
    select count(*) filter (where all_done and not izin), count(*) filter (where izin) into v_full, v_izin
      from hero_days where user_id = p_user and local_date between wk.ws and wk.ws + 6 and closed;
    v_req := greatest(3, 5 - v_izin);
    v_earned := v_full >= v_req;
    insert into hero_weeks (user_id, week_start, full_days, izin_days, earned) values (p_user, wk.ws, v_full, v_izin, v_earned) on conflict do nothing;
    if v_earned then
      insert into tickets (owner_id, awarded_week_start, rule_version, source, source_key)
        values (p_user, wk.ws, 2, 'WEEK', 'week:' || p_user || ':' || wk.ws) on conflict (source_key) do nothing;
      if found then perform bb_event(p_user, 'TICKET', jsonb_build_object('source', 'WEEK', 'week', wk.ws)); end if;
    end if;
  end loop;
end $$;

create or replace function bb_check_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_done int; v_lvl int; k text; v_new text[] := '{}'; c couples;
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null then return; end if;
  v_lvl := bb_level(h.xp);
  select count(*) into v_done from quests where user_id = p_user and done;
  c := bb_couple_of(p_user);
  if v_done >= 1 then v_new := array_append(v_new, 'FIRST_QUEST'); end if;
  if v_done >= 50 then v_new := array_append(v_new, 'QUESTS_50'); end if;
  if v_done >= 250 then v_new := array_append(v_new, 'QUESTS_250'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'WAKE') >= 5 then v_new := array_append(v_new, 'EARLY_BIRD'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'READING') >= 10 then v_new := array_append(v_new, 'BOOKWORM'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'QURAN') >= 30 then v_new := array_append(v_new, 'QURAN_30'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'SPORT') >= 20 then v_new := array_append(v_new, 'ATHLETE'); end if;
  if h.best_streak >= 7 then v_new := array_append(v_new, 'STREAK_7'); end if;
  if h.best_streak >= 30 then v_new := array_append(v_new, 'STREAK_30'); end if;
  if (select count(*) from bosses where couple_id = c.id and defeated_at is not null) >= 1 then v_new := array_append(v_new, 'BOSS_1'); end if;
  if (select count(*) from bosses where couple_id = c.id and defeated_at is not null) >= 5 then v_new := array_append(v_new, 'BOSS_5'); end if;
  if v_lvl >= 5 then v_new := array_append(v_new, 'LEVEL_5'); end if;
  if v_lvl >= 10 then v_new := array_append(v_new, 'LEVEL_10'); end if;
  if v_lvl >= 20 then v_new := array_append(v_new, 'LEVEL_20'); end if;
  if h.gold >= 1000 then v_new := array_append(v_new, 'RICH'); end if;
  if exists (select 1 from hero_days where user_id = p_user and difficulty = 6 and all_done) then v_new := array_append(v_new, 'MYTHIC_DAY'); end if;
  if (select count(*) from hero_events where from_user = p_user and kind = 'CHEER') >= 10 then v_new := array_append(v_new, 'FRIEND'); end if;
  if exists (select 1 from couple_combos where couple_id = c.id) then v_new := array_append(v_new, 'COMBO'); end if;
  foreach k in array v_new loop
    insert into achievements (user_id, key) values (p_user, k) on conflict do nothing;
    if found then perform bb_event(p_user, 'ACHIEVEMENT', jsonb_build_object('key', k)); end if;
  end loop;
end $$;

-- Kullanıcının tüm gecikmiş işleri: eksik günleri üret, geçmiş günleri kapat, haftaları değerlendir, boss'u hazırla
create or replace function bb_process_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c couples; v_today date; v_start date; d date; r record;
begin
  if not exists (select 1 from heroes where user_id = p_user) then return; end if;
  c := bb_couple_of(p_user);
  if c.id is null then return; end if;
  v_today := bb_local_date(now(), c.timezone);
  select coalesce(max(local_date) + 1, v_today) into v_start from hero_days where user_id = p_user;
  if v_start < v_today - 14 then v_start := v_today - 14; end if;
  d := v_start;
  while d <= v_today loop
    perform bb_generate_day(p_user, d);
    d := d + 1;
  end loop;
  for r in select local_date from hero_days where user_id = p_user and not closed and local_date < v_today order by local_date loop
    perform bb_close_day(p_user, r.local_date);
  end loop;
  perform bb_process_weeks(p_user, v_today);
  perform bb_ensure_boss(c.id, bb_week_start(v_today));
  perform bb_check_achievements(p_user);
end $$;

create or replace function bb_run_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  for u in select m.user_id from memberships m join heroes h on h.user_id = m.user_id where m.ended_at is null loop
    begin
      perform bb_process_user(u.user_id);
      n := n + 1;
    exception when others then
      insert into audit_events (actor_id, event_type) values (u.user_id, 'JOB_ERROR:' || left(sqlerrm, 80));
    end;
  end loop;
  update ticket_redemptions r set status = 'EXPIRED', resolved_at = now() where r.status = 'REQUESTED' and r.expires_at <= now();
  update tickets tk set status = 'AVAILABLE' where tk.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = tk.id and r.status = 'REQUESTED');
  delete from idempotency_records where expires_at < now();
  return n;
end $$;

-- =====================================================================
-- 10. Okuma: tek çağrıda tüm oyun durumu
-- =====================================================================
create or replace function bb_hero_json(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h heroes; au app_users; v_lvl int;
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null then return null; end if;
  select * into au from app_users where id = p_user;
  v_lvl := bb_level(h.xp);
  return jsonb_build_object(
    'id', p_user, 'name', au.display_name, 'username', au.username, 'class', h.class, 'look', h.look,
    'difficulty', h.difficulty, 'pendingDifficulty', h.pending_difficulty,
    'level', v_lvl, 'xp', h.xp, 'levelStart', bb_level_start(v_lvl), 'levelEnd', bb_level_start(v_lvl + 1),
    'hp', h.hp, 'maxHp', bb_max_hp(v_lvl), 'gold', h.gold, 'stats', h.stats, 'equipped', h.equipped,
    'streak', h.streak, 'bestStreak', h.best_streak, 'sound', h.sound);
end $$;

create or replace function get_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid; b bosses; ws date; v_ws_ts timestamptz; v_invite jsonb;
begin
  c := bb_couple_of(u);
  perform bb_process_user(u);
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_process_user(v_partner); end if;
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  v_ws_ts := bb_local_ts(ws, time '00:00', c.timezone);
  select * into b from bosses where couple_id = c.id and week_start = ws;
  select jsonb_build_object('expiresAt', expires_at) into v_invite from invites
    where couple_id = c.id and used_at is null and expires_at > now() order by created_at desc limit 1;
  return jsonb_build_object(
    'serverTime', now(), 'today', v_today, 'weekStart', ws, 'weekEnd', bb_local_ts(ws + 7, time '00:00', c.timezone),
    'config', (select value from app_config where key = 'game'),
    'hero', bb_hero_json(u),
    'day', (select jsonb_build_object('izin', izin, 'difficulty', difficulty) from hero_days where user_id = u and local_date = v_today),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title,
        'xp', xp, 'gold', gold, 'damage', damage, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = v_today),
    'partner', case when v_partner is null then null else bb_hero_json(v_partner) ||
        jsonb_build_object('todayDone', (select count(*) filter (where done) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY'),
                           'todayTotal', (select count(*) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY')) end,
    'couple', jsonb_build_object('id', c.id, 'hasPartner', v_partner is not null, 'pendingInvite', v_invite, 'status', c.status),
    'boss', case when b.id is null then null else jsonb_build_object('id', b.id, 'key', b.boss_key, 'name', b.name, 'hp', b.hp, 'maxHp', b.max_hp, 'defeated', b.defeated_at is not null,
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
    'incomingRequests', (select count(*) from ticket_redemptions where partner_id = u and status = 'REQUESTED' and expires_at > now())
  );
end $$;

-- =====================================================================
-- 11. Yazma
-- =====================================================================
create or replace function create_hero(p_name text, p_class text, p_look jsonb, p_difficulty int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_name text;
begin
  if exists (select 1 from heroes where user_id = u) then raise exception 'ALREADY_CREATED'; end if;
  if p_class not in ('WARRIOR','MAGE','RANGER','HEALER') then raise exception 'INVALID_VALUE'; end if;
  if p_difficulty is null or p_difficulty < 1 or p_difficulty > 6 then raise exception 'INVALID_VALUE'; end if;
  v_name := left(trim(regexp_replace(coalesce(p_name, ''), '<[^>]*>', '', 'g')), 24);
  if char_length(v_name) > 0 then update app_users set display_name = v_name, updated_at = now() where id = u; end if;
  insert into heroes (user_id, class, look, difficulty) values (u, p_class, coalesce(p_look, '{}'::jsonb), p_difficulty);
  c := bb_couple_of(u);
  perform bb_generate_day(u, bb_local_date(now(), c.timezone));
  update heroes set hp = 100 where user_id = u;
  return get_game();
end $$;

create or replace function update_hero(p_name text default null, p_class text default null, p_look jsonb default null, p_sound boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_name text;
begin
  if p_name is not null then
    v_name := left(trim(regexp_replace(p_name, '<[^>]*>', '', 'g')), 24);
    if char_length(v_name) = 0 then raise exception 'INVALID_VALUE'; end if;
    update app_users set display_name = v_name, updated_at = now() where id = u;
  end if;
  if p_class is not null then
    if p_class not in ('WARRIOR','MAGE','RANGER','HEALER') then raise exception 'INVALID_VALUE'; end if;
    update heroes set class = p_class where user_id = u;
  end if;
  if p_look is not null then update heroes set look = p_look where user_id = u; end if;
  if p_sound is not null then update heroes set sound = p_sound where user_id = u; end if;
  return bb_hero_json(u);
end $$;

-- Tek tık: yaptım / geri al (yalnızca bugün)
create or replace function complete_quest(p_quest uuid, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; q quests; h heroes; v_today date; b bosses; v_old_lvl int; v_new_lvl int; v_dmg int := 0; v_hit boss_hits;
  v_defeated boolean := false;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  select * into q from quests where id = p_quest and user_id = u for update;
  if q.id is null then raise exception 'NOT_FOUND'; end if;
  if q.local_date <> v_today then raise exception 'DAY_LOCKED'; end if;
  if q.done = p_done then return jsonb_build_object('delta', jsonb_build_object('xp', 0, 'gold', 0, 'damage', 0), 'game', get_game()); end if;
  select * into h from heroes where user_id = u for update;
  v_old_lvl := bb_level(h.xp);
  b := bb_ensure_boss(c.id, bb_week_start(v_today));
  select * into b from bosses where id = b.id for update;

  if p_done then
    update quests set done = true, done_at = now() where id = q.id;
    update heroes set xp = xp + q.xp, gold = gold + q.gold,
      stats = jsonb_set(stats, array[q.category], to_jsonb(coalesce((stats->>q.category)::int, 0) + 1)) where user_id = u returning * into h;
    insert into hero_log (user_id, kind, xp, gold, ref) values (u, 'QUEST', q.xp, q.gold, q.id);
    if b.defeated_at is null then
      v_dmg := least(b.hp, q.damage);
      insert into boss_hits (boss_id, user_id, quest_id, damage) values (b.id, u, q.id, v_dmg);
      update bosses set hp = hp - v_dmg where id = b.id returning * into b;
      if b.hp <= 0 then perform bb_defeat_boss(b.id); v_defeated := true; end if;
    end if;
    v_new_lvl := bb_level(h.xp);
    if v_new_lvl > v_old_lvl then
      update heroes set hp = bb_max_hp(v_new_lvl) where user_id = u;
      perform bb_event(u, 'LEVEL_UP', jsonb_build_object('level', v_new_lvl));
    end if;
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
    update heroes set hp = least(hp, bb_max_hp(bb_level(xp))) where user_id = u;
  end if;
  perform bb_check_achievements(u);
  return jsonb_build_object(
    'delta', jsonb_build_object('xp', case when p_done then q.xp else -q.xp end, 'gold', case when p_done then q.gold else -q.gold end, 'damage', v_dmg, 'defeated', v_defeated),
    'game', get_game());
end $$;

create or replace function set_izin(p_izin boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  update hero_days set izin = p_izin where user_id = u and local_date = bb_local_date(now(), c.timezone);
  return get_game();
end $$;

-- Bugün hiç görev yapılmadıysa hemen, yoksa yarın sabah geçerli
create or replace function set_difficulty(p_n int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date;
begin
  if p_n < 1 or p_n > 6 then raise exception 'INVALID_VALUE'; end if;
  c := bb_couple_of(u); v_today := bb_local_date(now(), c.timezone);
  if not exists (select 1 from quests where user_id = u and local_date = v_today and done) then
    update heroes set difficulty = p_n, pending_difficulty = null where user_id = u;
    delete from quests where user_id = u and local_date = v_today;
    delete from hero_days where user_id = u and local_date = v_today;
    update heroes set hp = hp - coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10) where user_id = u and hp > 10;
    perform bb_generate_day(u, v_today);
  else
    update heroes set pending_difficulty = case when difficulty = p_n then null else p_n end where user_id = u;
  end if;
  return get_game();
end $$;

create or replace function buy_item(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); s shop_items; h heroes;
begin
  select * into s from shop_items where key = p_key;
  if s.key is null then raise exception 'NOT_FOUND'; end if;
  select * into h from heroes where user_id = u for update;
  if bb_level(h.xp) < s.min_level then raise exception 'LEVEL_LOCKED'; end if;
  if s.kind <> 'POTION' and exists (select 1 from inventory where user_id = u and item_key = s.key and qty > 0) then raise exception 'ALREADY_OWNED'; end if;
  if h.gold < s.price then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - s.price where user_id = u;
  insert into inventory (user_id, item_key, qty) values (u, s.key, 1) on conflict (user_id, item_key) do update set qty = inventory.qty + 1;
  insert into hero_log (user_id, kind, gold) values (u, 'BUY', -s.price);
  -- silah/zırh otomatik kuşanılır
  if s.kind in ('WEAPON','ARMOR') then
    update heroes set equipped = equipped || jsonb_build_object(lower(s.kind), s.tier) where user_id = u and coalesce((equipped->>lower(s.kind))::int, 0) < s.tier;
  elsif s.kind in ('HEAD','CAPE','PET') then
    update heroes set equipped = equipped || jsonb_build_object(lower(s.kind), s.key) where user_id = u;
  end if;
  perform bb_check_achievements(u);
  return get_game();
end $$;

create or replace function equip_item(p_slot text, p_value text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_tier int;
begin
  if p_slot not in ('weapon','armor','head','cape','pet') then raise exception 'INVALID_VALUE'; end if;
  if p_value is null or p_value = '' then
    if p_slot in ('weapon','armor') then update heroes set equipped = equipped || jsonb_build_object(p_slot, 0) where user_id = u;
    else update heroes set equipped = equipped - p_slot where user_id = u; end if;
    return get_game();
  end if;
  if p_slot in ('weapon','armor') then
    v_tier := p_value::int;
    if v_tier > 0 and not exists (select 1 from inventory where user_id = u and item_key = p_slot || '_' || v_tier and qty > 0) then raise exception 'NOT_OWNED'; end if;
    update heroes set equipped = equipped || jsonb_build_object(p_slot, v_tier) where user_id = u;
  else
    if not exists (select 1 from inventory i join shop_items s on s.key = i.item_key where i.user_id = u and i.item_key = p_value and i.qty > 0 and lower(s.kind) = p_slot) then raise exception 'NOT_OWNED'; end if;
    update heroes set equipped = equipped || jsonb_build_object(p_slot, p_value) where user_id = u;
  end if;
  return get_game();
end $$;

create or replace function use_potion(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); s shop_items;
begin
  select * into s from shop_items where key = p_key and kind = 'POTION';
  if s.key is null then raise exception 'NOT_FOUND'; end if;
  update inventory set qty = qty - 1 where user_id = u and item_key = p_key and qty > 0;
  if not found then raise exception 'NOT_OWNED'; end if;
  update heroes set hp = least(bb_max_hp(bb_level(xp)), hp + s.effect) where user_id = u;
  insert into hero_log (user_id, kind, hp) values (u, 'POTION', s.effect);
  return get_game();
end $$;

-- Ortak eylemler: alkış (XP), iyileştir (Şifacı bedava / iksirle), altın gönder
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
  elsif p_kind = 'HEAL' then
    if h.class = 'HEALER' and not exists (select 1 from hero_events where from_user = u and kind = 'HEAL' and created_at >= v_today_ts) then
      v_heal := (cfg->>'healAmount')::int;
    else
      update inventory set qty = qty - 1 where user_id = u and item_key = 'potion_small' and qty > 0;
      if not found then raise exception 'NO_POTION'; end if;
      v_heal := 30;
    end if;
    update heroes set hp = least(bb_max_hp(bb_level(xp)), hp + v_heal) where user_id = v_partner;
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

create or replace function mark_events_seen(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update hero_events set seen = true where user_id = bb_current_user() and id = any(p_ids)
$$;

-- =====================================================================
-- 12. Biletler (kullanım: istek → partner onayı; 72 saat; 24 saatte geri alma)
-- =====================================================================
create or replace function bb_redemption_json(r ticket_redemptions) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', r.id, 'ticketId', r.ticket_id, 'requestedBy', r.requested_by, 'partnerId', r.partner_id, 'status', r.status,
    'expiresAt', r.expires_at, 'resolvedAt', r.resolved_at, 'reversalRequestedBy', r.reversal_requested_by, 'reversedAt', r.reversed_at, 'createdAt', r.created_at)
$$;

create or replace function get_tickets() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  return jsonb_build_object(
    'serverTime', now(),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week', awarded_week_start, 'status', status, 'source', source, 'createdAt', created_at) order by created_at desc), '[]'::jsonb) from tickets where owner_id = u and status <> 'ARCHIVED'),
    'redemptions', (select coalesce(jsonb_agg(bb_redemption_json(r) order by r.created_at desc), '[]'::jsonb) from ticket_redemptions r where (r.requested_by = u or r.partner_id = u) and r.created_at > now() - interval '60 days'));
end $$;

create or replace function request_ticket(p_ticket_id uuid, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid; tk tickets; r ticket_redemptions; v_prev jsonb; v_resp jsonb;
begin
  select response into v_prev from idempotency_records where user_id = u and route = 'request_ticket' and operation_id = p_operation_id;
  if v_prev is not null then return v_prev; end if;
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  select * into tk from tickets where id = p_ticket_id and owner_id = u for update;
  if tk.id is null then raise exception 'NOT_FOUND'; end if;
  if tk.status <> 'AVAILABLE' then raise exception 'INVALID_STATE'; end if;
  insert into ticket_redemptions (ticket_id, requested_by, partner_id, expires_at) values (tk.id, u, v_partner, now() + interval '72 hours') returning * into r;
  update tickets set status = 'REQUESTED' where id = tk.id;
  perform bb_event(v_partner, 'TICKET_REQUEST', '{}'::jsonb, u);
  v_resp := bb_redemption_json(r);
  insert into idempotency_records (user_id, route, operation_id, request_hash, response) values (u, 'request_ticket', p_operation_id, md5(p_ticket_id::text), v_resp);
  return v_resp;
end $$;

create or replace function respond_redemption(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); r ticket_redemptions; tk tickets;
begin
  if p_action not in ('approve','not_now','withdraw') then raise exception 'INVALID_ACTION'; end if;
  select * into r from ticket_redemptions where id = p_id and (requested_by = u or partner_id = u) for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  select * into tk from tickets where id = r.ticket_id for update;
  if r.status <> 'REQUESTED' then return bb_redemption_json(r); end if;
  if r.expires_at <= now() then
    update ticket_redemptions set status = 'EXPIRED', resolved_at = now() where id = r.id returning * into r;
    update tickets set status = 'AVAILABLE' where id = tk.id;
    return bb_redemption_json(r);
  end if;
  if p_action = 'withdraw' then
    if r.requested_by <> u then raise exception 'FORBIDDEN'; end if;
    update ticket_redemptions set status = 'WITHDRAWN', resolved_at = now() where id = r.id returning * into r;
    update tickets set status = 'AVAILABLE' where id = tk.id;
  else
    if r.partner_id <> u then raise exception 'FORBIDDEN'; end if;
    if p_action = 'approve' then
      update ticket_redemptions set status = 'APPROVED', resolved_at = now() where id = r.id returning * into r;
      update tickets set status = 'USED' where id = tk.id;
      perform bb_event(r.requested_by, 'TICKET_APPROVED', '{}'::jsonb, u);
    else
      update ticket_redemptions set status = 'DECLINED', resolved_at = now() where id = r.id returning * into r;
      update tickets set status = 'AVAILABLE' where id = tk.id;
    end if;
  end if;
  return bb_redemption_json(r);
end $$;

create or replace function request_reversal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); r ticket_redemptions;
begin
  select * into r from ticket_redemptions where id = p_id and (requested_by = u or partner_id = u) for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'APPROVED' then raise exception 'INVALID_STATE'; end if;
  if r.resolved_at + interval '24 hours' <= now() then raise exception 'REVERSAL_WINDOW_CLOSED'; end if;
  if r.reversal_requested_by is null then
    update ticket_redemptions set reversal_requested_by = u where id = r.id returning * into r;
  elsif r.reversal_requested_by <> u then
    update ticket_redemptions set status = 'REVERSED', reversed_at = now(), reversal_approved_by = u where id = r.id returning * into r;
    update tickets set status = 'AVAILABLE' where id = r.ticket_id;
  end if;
  return bb_redemption_json(r);
end $$;

-- =====================================================================
-- 13. Hesap: davet, kurtarma, oturumlar, ayrılma, silme
-- =====================================================================
create or replace function create_invite() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_count int; v_token text; v_exp timestamptz;
begin
  c := bb_couple_of(u);
  if c.status <> 'ACTIVE' then raise exception 'COUPLE_DISCONNECTED'; end if;
  select count(*) into v_count from memberships where couple_id = c.id and ended_at is null;
  if v_count >= 2 then raise exception 'COUPLE_FULL'; end if;
  update invites set expires_at = now() where couple_id = c.id and used_at is null and expires_at > now();
  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
  v_exp := now() + interval '24 hours';
  insert into invites (couple_id, token_hash, created_by, expires_at) values (c.id, bb_hash(v_token), u, v_exp);
  return jsonb_build_object('token', v_token, 'expiresAt', v_exp);
end $$;

create or replace function generate_recovery_codes() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); codes text[] := '{}'; v_code text; i int;
begin
  delete from recovery_codes where user_id = u and used_at is null;
  for i in 1..8 loop
    v_code := upper(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=', 'XYZ'));
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
    insert into recovery_codes (user_id, code_hash) values (u, bb_hash(u::text || ':' || v_code));
    codes := array_append(codes, v_code);
  end loop;
  return jsonb_build_object('codes', to_jsonb(codes), 'createdAt', now());
end $$;

create or replace function recovery_codes_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('unused', count(*) filter (where used_at is null), 'used', count(*) filter (where used_at is not null), 'createdAt', max(created_at))
  from recovery_codes where user_id = bb_current_user()
$$;

create or replace function recover_with_code(p_username text, p_code text, p_new_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_username text := lower(trim(coalesce(p_username, ''))); u uuid; v_id uuid; v_attempts int;
begin
  select count(*) into v_attempts from recovery_attempts where username = v_username and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  insert into recovery_attempts (username) values (v_username);
  if p_new_password is null or char_length(p_new_password) < 6 or char_length(p_new_password) > 128 then return jsonb_build_object('ok', false, 'error', 'PASSWORD_LENGTH'); end if;
  select id into u from app_users where username = v_username and status = 'ACTIVE';
  if u is not null then
    select id into v_id from recovery_codes where user_id = u and used_at is null and code_hash = bb_hash(u::text || ':' || upper(trim(p_code))) for update;
  end if;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_RECOVERY'); end if;
  update recovery_codes set used_at = now() where id = v_id;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now() where id = u;
  delete from auth.sessions where user_id = u;
  delete from recovery_attempts where username = v_username;
  return jsonb_build_object('ok', true);
end $$;

create or replace function revoke_other_sessions() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_cur text := coalesce(auth.jwt()->>'session_id', '');
begin
  delete from auth.sessions where user_id = u and id::text <> v_cur;
end $$;

create or replace function disconnect_couple() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_new uuid;
begin
  c := bb_couple_of(u);
  update ticket_redemptions r set status = 'WITHDRAWN', resolved_at = now() where r.requested_by = u and r.status = 'REQUESTED';
  update ticket_redemptions r set status = 'DECLINED', resolved_at = now() where r.partner_id = u and r.status = 'REQUESTED';
  update tickets t set status = 'AVAILABLE' where t.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = t.id and r.status = 'REQUESTED');
  update tickets set status = 'ARCHIVED' where owner_id = u and status = 'AVAILABLE';
  update memberships set ended_at = now() where user_id = u and couple_id = c.id and ended_at is null;
  update couples set status = 'DISCONNECTED' where id = c.id;
  insert into couples (display_name, timezone) values ('Ben', c.timezone) returning id into v_new;
  insert into memberships (user_id, couple_id, role) values (u, v_new, 'FIRST');
  return get_game();
end $$;

create or replace function delete_account() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  update ticket_redemptions r set status = 'DECLINED', resolved_at = now() where r.partner_id = u and r.status = 'REQUESTED';
  update tickets t set status = 'AVAILABLE' where t.status = 'REQUESTED' and t.owner_id <> u and not exists (select 1 from ticket_redemptions r where r.ticket_id = t.id and r.status = 'REQUESTED');
  update memberships set ended_at = now() where user_id = u and ended_at is null;
  if c.id is not null and bb_partner_of(u) is null then update couples set status = 'DISCONNECTED' where id = c.id; end if;
  delete from auth.users where id = u;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- 14. İzinler
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_game(), create_hero(text, text, jsonb, int), update_hero(text, text, jsonb, boolean), complete_quest(uuid, boolean),
  set_izin(boolean), set_difficulty(int), buy_item(text), equip_item(text, text), use_potion(text), social_action(text, int), mark_events_seen(uuid[]),
  get_tickets(), request_ticket(uuid, uuid), respond_redemption(uuid, text), request_reversal(uuid),
  create_invite(), generate_recovery_codes(), recovery_codes_status(), revoke_other_sessions(), disconnect_couple(), delete_account() to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
-- Tetikleyici auth tarafından çağrılır
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'game v2 ok' as result;
