-- Birlikte Büyüyoruz · 0001_schema.sql
-- Tüm iş kuralları sunucuda (PostgreSQL) çalışır. İstemci yalnızca girilen değerleri gönderir.
-- Çalıştırma: Supabase SQL Editor (postgres rolü). Idempotent olacak şekilde yazılmıştır.

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. Sürümlü ayar kaynağı
-- =====================================================================
create table if not exists app_config (
  key text primary key,
  version int not null default 1,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_config (key, version, value) values ('economy', 1, '{
  "appName": "Birlikte Büyüyoruz",
  "locale": "tr-TR",
  "timezone": "Europe/Istanbul",
  "weekStartsOn": "MONDAY",
  "dayBoundary": "00:00",
  "correctionCutoffNextDay": "12:00",
  "maxLevel": 50,
  "maxDailyPlannedXP": 200,
  "maxGoalXP": 20,
  "maxActiveGoals": 20,
  "nutritionPenalty": {"enabledByDefault": false, "amount": 5},
  "dailyHearts": {"anyPositiveProgress": 2, "ratioThreshold": 0.70, "ratioBonus": 3},
  "sharedActivityHeartsPerWeek": 5,
  "ticketRuleVersion": 1,
  "ticket": {
    "maxPerUserPerIsoWeek": 1,
    "minimumWeeklyPlannedXP": 500,
    "minimumQualifyingDays": 5,
    "minimumTrackedInstancesPerQualifyingDay": 4,
    "minimumDailyRatioPercent": 60,
    "minimumWeeklyWeightedRatioPercent": 70,
    "requestExpiresHours": 72,
    "reversalWindowHours": 24
  },
  "skills": {"maxPerSkillPerDay": 1, "maxTotalPerDay": 3},
  "quietHoursDefault": {"start": "22:00", "end": "07:00"},
  "gardenLevels": [0, 1000, 2500, 4500, 7000, 10000]
}'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 2. Tablolar
-- =====================================================================
create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Biz',
  timezone text not null default 'Europe/Istanbul',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISCONNECTED')),
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint display_name_len check (char_length(display_name) between 1 and 40)
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  couple_id uuid not null references couples(id),
  role text not null check (role in ('FIRST','SECOND')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists memberships_one_active_per_user on memberships(user_id) where ended_at is null;
create index if not exists memberships_couple_idx on memberships(couple_id) where ended_at is null;

create table if not exists setup_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  token_hash text not null unique,
  created_by uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  avatar_config jsonb not null default '{}'::jsonb,
  equipped_items jsonb not null default '{}'::jsonb,
  motion_preference text not null default 'SYSTEM' check (motion_preference in ('SYSTEM','REDUCED','FULL')),
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists sharing_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  share_daily_total boolean not null default false,
  share_categories boolean not null default false,
  share_tasks jsonb not null default '{}'::jsonb,
  share_worship boolean not null default false,
  share_hearts boolean not null default false,
  share_ticket_balance boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  effective_week_start date not null,
  penalty_enabled boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED')),
  created_at timestamptz not null default now(),
  unique (user_id, effective_week_start)
);

create table if not exists goal_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  stable_goal_id uuid not null,
  plan_version_id uuid not null references plan_versions(id) on delete cascade,
  code text not null,
  group_key text,
  name text not null,
  description text not null default '',
  icon text not null default '•',
  category text not null check (category in ('START','WORSHIP','LEARNING','BODY')),
  input_type text not null check (input_type in ('BOOLEAN','TIME','NUMBER','DURATION','CHECKLIST','CHOICE3')),
  target int not null default 1 check (target > 0),
  unit text not null default '',
  weekdays int[] not null default '{1,2,3,4,5,6,7}',
  max_xp int not null check (max_xp between 1 and 20),
  items jsonb not null default '[]'::jsonb,
  visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE','SHARED')),
  active boolean not null default true,
  sort_order int not null default 100,
  unique (plan_version_id, stable_goal_id)
);

create table if not exists daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  local_date date not null,
  timezone_snapshot text not null,
  state text not null default 'OPEN' check (state in ('OPEN','CLOSED_EDITABLE','FINALIZED')),
  correction_deadline timestamptz not null,
  planned_xp int not null default 0,
  gross_xp int not null default 0,
  penalty_xp int not null default 0,
  net_xp int not null default 0,
  tracked_instance_count int not null default 0,
  completed_count int not null default 0,
  excused_all boolean not null default false,
  revision int not null default 0,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table if not exists task_instances (
  id uuid primary key default gen_random_uuid(),
  daily_summary_id uuid not null references daily_summaries(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  stable_goal_id uuid not null,
  goal_version_id uuid not null references goal_versions(id),
  snapshot jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','PARTIAL','COMPLETED','MISSED_AUTO','MISSED_SELF','EXCUSED')),
  value int,
  item_values jsonb not null default '[]'::jsonb,
  earned_xp int not null default 0,
  private_note text,
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  unique (daily_summary_id, stable_goal_id)
);
create index if not exists task_instances_user_idx on task_instances(user_id);

create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references task_instances(id) on delete cascade,
  actor_id uuid not null,
  operation_id uuid not null,
  action text not null,
  before_status text,
  after_status text,
  before_value int,
  after_value int,
  xp_delta int not null default 0,
  server_time timestamptz not null default now()
);

create table if not exists xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  daily_summary_id uuid not null references daily_summaries(id) on delete cascade,
  daily_revision int not null,
  delta int not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (daily_summary_id, daily_revision)
);
create index if not exists xp_ledger_user_idx on xp_ledger(user_id);

create table if not exists level_celebrations (
  user_id uuid not null references app_users(id) on delete cascade,
  level int not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, level)
);

create table if not exists heart_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  delta int not null,
  source_key text not null unique,
  source_type text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists wallet_balances (
  user_id uuid primary key references app_users(id) on delete cascade,
  hearts int not null default 0 check (hearts >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists reward_catalog (
  id text primary key,
  kind text not null check (kind in ('OUTFIT','ACCESSORY','HAND','EFFECT','DECOR')),
  name text not null,
  slot text not null,
  required_level int not null default 1,
  required_garden_level int not null default 1,
  price_hearts int not null default 0,
  compatibility jsonb not null default '{}'::jsonb,
  asset_key text not null,
  sort_order int not null default 100,
  active boolean not null default true
);

create table if not exists user_inventory (
  user_id uuid not null references app_users(id) on delete cascade,
  item_id text not null references reward_catalog(id),
  acquired_at timestamptz not null default now(),
  source_key text not null unique,
  primary key (user_id, item_id)
);

create table if not exists couple_inventory (
  couple_id uuid not null references couples(id),
  item_id text not null references reward_catalog(id),
  purchased_by uuid not null references app_users(id),
  placed boolean not null default true,
  acquired_at timestamptz not null default now(),
  primary key (couple_id, item_id)
);

create table if not exists skill_uses (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references app_users(id) on delete cascade,
  recipient_id uuid not null references app_users(id) on delete cascade,
  skill_id text not null,
  local_date date not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'SENT',
  sent_at timestamptz not null default now()
);
create index if not exists skill_uses_sender_day on skill_uses(sender_id, local_date);

create table if not exists shared_activities (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  creator_id uuid not null references app_users(id),
  type text not null,
  title text not null,
  proposed_date date not null,
  proposed_time time,
  status text not null default 'PROPOSED' check (status in ('PROPOSED','ACCEPTED','COMPLETED','UNCONFIRMED','CANCELLED','DECLINED')),
  first_confirmed_at timestamptz,
  finalized_at timestamptz,
  hidden_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists activity_confirmations (
  activity_id uuid not null references shared_activities(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table if not exists couple_rule_versions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  effective_week_start date not null,
  rule_json jsonb not null,
  proposed_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  status text not null default 'PROPOSED' check (status in ('PROPOSED','ACTIVE','REJECTED','SUPERSEDED')),
  created_at timestamptz not null default now()
);

create table if not exists weekly_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  week_start date not null,
  rule_version int not null,
  planned_xp int not null,
  gross_xp int not null,
  qualifying_days int not null,
  eligible boolean not null,
  detail jsonb not null default '{}'::jsonb,
  finalized_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_users(id) on delete cascade,
  awarded_week_start date not null,
  rule_version int not null,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','REQUESTED','USED','ARCHIVED')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (owner_id, awarded_week_start)
);

create table if not exists ticket_redemptions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  requested_by uuid not null references app_users(id),
  partner_id uuid not null references app_users(id),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','DECLINED','WITHDRAWN','EXPIRED','REVERSED')),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  reversal_requested_by uuid,
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_redemption_per_ticket on ticket_redemptions(ticket_id) where status = 'REQUESTED';

create table if not exists idempotency_records (
  user_id uuid not null,
  route text not null,
  operation_id uuid not null,
  request_hash text not null,
  response jsonb not null,
  expires_at timestamptz not null default now() + interval '30 days',
  primary key (user_id, route, operation_id)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  event_type text not null,
  object_id uuid,
  server_time timestamptz not null default now()
);

-- =====================================================================
-- 3. Saf yardımcılar
-- =====================================================================
create or replace function bb_week_start(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

create or replace function bb_local_date(ts timestamptz, tz text) returns date
language sql stable as $$ select (ts at time zone tz)::date $$;

create or replace function bb_local_ts(d date, t time, tz text) returns timestamptz
language sql stable as $$ select ((d + t)::timestamp) at time zone tz $$;

create or replace function bb_level_threshold(l int) returns int
language sql immutable as $$ select 100 * (l - 1) + (25 * (l - 1) * (l - 2)) / 2 $$;

create or replace function bb_level_for_xp(total bigint) returns int
language plpgsql immutable as $$
declare l int := 1;
begin
  if total is null or total < 0 then return 1; end if;
  while l < 50 and total >= bb_level_threshold(l + 1) loop l := l + 1; end loop;
  return l;
end $$;

create or replace function bb_hash(s text) returns text
language sql immutable as $$ select encode(extensions.digest(s, 'sha256'), 'hex') $$;

-- Kayıt başına XP. Kurallar: Şartname §7.1
create or replace function bb_instance_xp(p_type text, p_max int, p_target int, p_status text, p_value int, p_item_values jsonb, p_items jsonb)
returns int language plpgsql immutable as $$
declare total int; done int;
begin
  if p_status not in ('PARTIAL','COMPLETED') then return 0; end if;
  case p_type
    when 'BOOLEAN' then return case when p_status = 'COMPLETED' then p_max else 0 end;
    when 'TIME' then return case when p_value is not null and p_value <= p_target then p_max else 0 end;
    when 'NUMBER', 'DURATION' then
      if p_value is null then return 0; end if;
      return floor((p_max * least(p_value, p_target))::numeric / p_target)::int;
    when 'CHECKLIST' then
      total := coalesce(jsonb_array_length(p_items), 0);
      if total = 0 then return 0; end if;
      select count(*) into done from jsonb_array_elements_text(coalesce(p_item_values, '[]'::jsonb)) v where v::boolean;
      return floor((p_max * done)::numeric / total)::int;
    when 'CHOICE3' then
      if p_value is null then return 0; end if;
      return floor((p_max * least(p_value, 2))::numeric / 2)::int;
    else return 0;
  end case;
end $$;

-- =====================================================================
-- 4. Başlangıç planı (Şartname §5)
-- =====================================================================
create or replace function bb_seed_default_plan(p_user uuid, p_week_start date) returns uuid
language plpgsql security definer set search_path = public as $$
declare pv uuid;
begin
  insert into plan_versions (user_id, effective_week_start, penalty_enabled)
  values (p_user, p_week_start, false) returning id into pv;

  insert into goal_versions (user_id, stable_goal_id, plan_version_id, code, group_key, name, description, icon, category, input_type, target, unit, weekdays, max_xp, items, active, sort_order) values
  (p_user, gen_random_uuid(), pv, 'WAKE', null, 'Güne başlama', 'Kalkış saatini kendin gir. En geç 06.30 kabul edilir.', '🌅', 'START', 'TIME', 390, '', '{1,2,3,4,5,6,7}', 15, '[]', true, 10),
  (p_user, gen_random_uuid(), pv, 'PRAYER_FAJR', 'PRAYER', 'Sabah namazı', 'Kendi beyanın.', '🕌', 'WORSHIP', 'BOOLEAN', 1, '', '{1,2,3,4,5,6,7}', 8, '[]', true, 20),
  (p_user, gen_random_uuid(), pv, 'PRAYER_DHUHR', 'PRAYER', 'Öğle namazı', 'Kendi beyanın.', '🕌', 'WORSHIP', 'BOOLEAN', 1, '', '{1,2,3,4,5,6,7}', 8, '[]', true, 21),
  (p_user, gen_random_uuid(), pv, 'PRAYER_ASR', 'PRAYER', 'İkindi namazı', 'Kendi beyanın.', '🕌', 'WORSHIP', 'BOOLEAN', 1, '', '{1,2,3,4,5,6,7}', 8, '[]', true, 22),
  (p_user, gen_random_uuid(), pv, 'PRAYER_MAGHRIB', 'PRAYER', 'Akşam namazı', 'Kendi beyanın.', '🕌', 'WORSHIP', 'BOOLEAN', 1, '', '{1,2,3,4,5,6,7}', 8, '[]', true, 23),
  (p_user, gen_random_uuid(), pv, 'PRAYER_ISHA', 'PRAYER', 'Yatsı namazı', 'Kendi beyanın.', '🕌', 'WORSHIP', 'BOOLEAN', 1, '', '{1,2,3,4,5,6,7}', 8, '[]', true, 24),
  (p_user, gen_random_uuid(), pv, 'SUNNAH', null, 'Seçtiğim sünnetler', 'Kendi listeni oluştur. Liste boşken bu görev açılamaz.', '📿', 'WORSHIP', 'CHECKLIST', 1, '', '{1,2,3,4,5,6,7}', 10, '[]', false, 30),
  (p_user, gen_random_uuid(), pv, 'DHIKR', null, 'Tesbihat', 'Kendi belirlediğin günlük hedef.', '📿', 'WORSHIP', 'BOOLEAN', 1, '', '{1,2,3,4,5,6,7}', 8, '[]', true, 31),
  (p_user, gen_random_uuid(), pv, 'QURAN', null, 'Kur’an okuma', 'Sayfa olarak kaydedilir.', '📖', 'WORSHIP', 'NUMBER', 2, 'sayfa', '{1,2,3,4,5,6,7}', 12, '[]', true, 32),
  (p_user, gen_random_uuid(), pv, 'ENGLISH', null, 'İngilizce kelime', 'Çalıştığın kelime sayısı.', '🔤', 'LEARNING', 'NUMBER', 20, 'kelime', '{1,2,3,4,5,6,7}', 12, '[]', true, 40),
  (p_user, gen_random_uuid(), pv, 'READING', null, 'Kitap okuma', 'Süre dakika olarak girilir.', '📚', 'LEARNING', 'DURATION', 15, 'dk', '{1,2,3,4,5,6,7}', 10, '[]', true, 41),
  (p_user, gen_random_uuid(), pv, 'RELIGIOUS_STUDY', null, 'Dinî okuma veya çalışma', 'Süre dakika olarak girilir.', '🕯️', 'LEARNING', 'DURATION', 10, 'dk', '{1,2,3,4,5,6,7}', 10, '[]', true, 42),
  (p_user, gen_random_uuid(), pv, 'EXERCISE', null, 'Hareket veya spor', 'Pazartesi, Çarşamba, Cuma. Süre dakika.', '🏃', 'BODY', 'DURATION', 30, 'dk', '{1,3,5}', 15, '[]', true, 50),
  (p_user, gen_random_uuid(), pv, 'NUTRITION', null, 'Beslenme planı', 'Kendi planını kendin değerlendirirsin.', '🥗', 'BODY', 'CHOICE3', 2, '', '{1,2,3,4,5,6,7}', 12, '[]', true, 51);
  return pv;
end $$;

-- =====================================================================
-- 5. Kurulum ve davet: auth.users tetikleyicisi
-- =====================================================================
create or replace function bb_handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(trim(coalesce(meta->>'username', '')));
  v_display text := trim(coalesce(meta->>'display_name', ''));
  v_couple uuid;
  v_role text;
  v_tz text;
  v_key_id uuid;
  v_invite_id uuid;
  v_member_count int;
begin
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'INVALID_USERNAME';
  end if;
  if char_length(v_display) < 1 or char_length(v_display) > 40 then
    v_display := v_username;
  end if;
  if exists (select 1 from app_users where username = v_username) then
    raise exception 'USERNAME_TAKEN';
  end if;

  if coalesce(meta->>'setup_key', '') <> '' then
    select id into v_key_id from setup_keys
      where key_hash = bb_hash(meta->>'setup_key') and used_at is null
      for update;
    if v_key_id is null then raise exception 'INVALID_SETUP_KEY'; end if;
    insert into couples default values returning id, timezone into v_couple, v_tz;
    update setup_keys set used_at = now(), used_by = new.id where id = v_key_id;
    v_role := 'FIRST';
  elsif coalesce(meta->>'invite_token', '') <> '' then
    select i.id, i.couple_id into v_invite_id, v_couple from invites i
      join couples c on c.id = i.couple_id
      where i.token_hash = bb_hash(meta->>'invite_token')
        and i.used_at is null and i.expires_at > now() and c.status = 'ACTIVE'
      for update of i;
    if v_invite_id is null then raise exception 'INVALID_INVITE'; end if;
    select count(*) into v_member_count from memberships where couple_id = v_couple and ended_at is null;
    if v_member_count >= 2 then raise exception 'COUPLE_FULL'; end if;
    select timezone into v_tz from couples where id = v_couple;
    update invites set used_at = now(), used_by = new.id where id = v_invite_id;
    v_role := 'SECOND';
  else
    raise exception 'SIGNUP_CLOSED';
  end if;

  insert into app_users (id, username, display_name) values (new.id, v_username, v_display);
  insert into memberships (user_id, couple_id, role) values (new.id, v_couple, v_role);
  insert into profiles (user_id) values (new.id);
  insert into sharing_settings (user_id) values (new.id);
  insert into wallet_balances (user_id) values (new.id);
  perform bb_seed_default_plan(new.id, bb_week_start(bb_local_date(now(), v_tz)));
  insert into audit_events (actor_id, event_type, object_id) values (new.id, 'ACCOUNT_CREATED', v_couple);

  -- Sırlar metadata içinde kalmasın
  update auth.users set raw_user_meta_data = meta - 'setup_key' - 'invite_token' where id = new.id;
  return new;
end $$;

drop trigger if exists bb_on_auth_user_created on auth.users;
create trigger bb_on_auth_user_created
  after insert on auth.users
  for each row execute function bb_handle_new_auth_user();

-- =====================================================================
-- 6. Oturum yardımcıları
-- =====================================================================
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

-- =====================================================================
-- 7. Gün üretimi, kapanış, kilitleme, kalp ve haftalık bilet (worker)
-- =====================================================================
create or replace function bb_recompute_day(p_summary uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s daily_summaries%rowtype;
  v_planned int; v_gross int; v_tracked int; v_completed int; v_penalty int := 0;
  v_penalty_enabled boolean; v_amount int;
begin
  select * into s from daily_summaries where id = p_summary for update;
  select coalesce(sum((snapshot->>'max_xp')::int) filter (where status <> 'EXCUSED'), 0),
         coalesce(sum(earned_xp) filter (where status <> 'EXCUSED'), 0),
         count(*) filter (where status <> 'EXCUSED'),
         count(*) filter (where status = 'COMPLETED')
    into v_planned, v_gross, v_tracked, v_completed
    from task_instances where daily_summary_id = p_summary;

  select pv.penalty_enabled into v_penalty_enabled
    from plan_versions pv where pv.user_id = s.user_id and pv.status = 'ACTIVE'
      and pv.effective_week_start <= bb_week_start(s.local_date)
    order by pv.effective_week_start desc limit 1;
  v_amount := coalesce(((select value from app_config where key = 'economy')->'nutritionPenalty'->>'amount')::int, 5);
  if coalesce(v_penalty_enabled, false) and exists (
      select 1 from task_instances where daily_summary_id = p_summary
        and snapshot->>'input_type' = 'CHOICE3' and status = 'MISSED_SELF') then
    v_penalty := v_amount;
  end if;

  update daily_summaries set
    planned_xp = v_planned, gross_xp = v_gross, penalty_xp = v_penalty,
    net_xp = greatest(0, v_gross - v_penalty),
    tracked_instance_count = v_tracked, completed_count = v_completed,
    excused_all = (v_tracked = 0 and exists (select 1 from task_instances where daily_summary_id = p_summary)),
    updated_at = now()
  where id = p_summary;
end $$;

-- Günlük net değişimini XP defterine yazar (summary kilitli olmalı).
create or replace function bb_write_xp_delta(p_summary uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare s daily_summaries%rowtype; v_prev int; v_delta int;
begin
  select * into s from daily_summaries where id = p_summary;
  select coalesce(sum(delta), 0) into v_prev from xp_ledger where daily_summary_id = p_summary;
  v_delta := s.net_xp - v_prev;
  update daily_summaries set revision = revision + 1 where id = p_summary returning revision into s.revision;
  if v_delta <> 0 then
    insert into xp_ledger (user_id, daily_summary_id, daily_revision, delta, reason)
    values (s.user_id, p_summary, s.revision, v_delta, p_reason);
  end if;
  return v_delta;
end $$;

create or replace function bb_total_xp(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0) from xp_ledger where user_id = p_user
$$;

create or replace function bb_generate_day(p_user uuid, p_date date, p_tz text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_summary uuid; v_plan uuid; v_today date := bb_local_date(now(), p_tz);
begin
  select id into v_summary from daily_summaries where user_id = p_user and local_date = p_date;
  if v_summary is not null then return v_summary; end if;

  select id into v_plan from plan_versions
    where user_id = p_user and status = 'ACTIVE' and effective_week_start <= bb_week_start(p_date)
    order by effective_week_start desc limit 1;

  insert into daily_summaries (user_id, local_date, timezone_snapshot, state, correction_deadline)
  values (p_user, p_date, p_tz, 'OPEN', bb_local_ts(p_date + 1, time '12:00', p_tz))
  returning id into v_summary;

  if v_plan is not null then
    insert into task_instances (daily_summary_id, user_id, stable_goal_id, goal_version_id, snapshot)
    select v_summary, p_user, g.stable_goal_id, g.id,
      jsonb_build_object('code', g.code, 'group_key', g.group_key, 'name', g.name, 'description', g.description,
        'icon', g.icon, 'category', g.category, 'input_type', g.input_type, 'target', g.target, 'unit', g.unit,
        'max_xp', g.max_xp, 'items', g.items, 'sort_order', g.sort_order)
    from goal_versions g
    where g.plan_version_id = v_plan and g.active
      and extract(isodow from p_date)::int = any(g.weekdays)
      and (g.input_type <> 'CHECKLIST' or jsonb_array_length(g.items) > 0);
  end if;
  perform bb_recompute_day(v_summary);
  return v_summary;
end $$;

-- Bir kullanıcının tüm gecikmiş işlerini sırayla yapar: üretim, kapanış, kilitleme, kalp.
create or replace function bb_process_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c couples; v_tz text; v_today date; v_start date; d date; s record;
  cfg jsonb := (select value from app_config where key = 'economy');
  v_h_active int; v_h_ratio int; v_ratio_pct int;
begin
  c := bb_couple_of(p_user);
  if c.id is null then return; end if;
  v_tz := c.timezone; v_today := bb_local_date(now(), v_tz);

  select coalesce(max(local_date) + 1, bb_local_date(m.joined_at, v_tz)) into v_start
    from memberships m left join daily_summaries ds on ds.user_id = m.user_id
    where m.user_id = p_user and m.ended_at is null group by m.joined_at;
  if v_start is null then v_start := v_today; end if;
  d := v_start;
  while d <= v_today loop
    perform bb_generate_day(p_user, d, v_tz);
    d := d + 1;
  end loop;

  -- Gece kapanışı: geçmiş günler kapanır, PENDING → MISSED_AUTO
  for s in select id from daily_summaries where user_id = p_user and state = 'OPEN' and local_date < v_today for update loop
    update task_instances set status = 'MISSED_AUTO', revision = revision + 1, updated_at = now()
      where daily_summary_id = s.id and status = 'PENDING';
    update daily_summaries set state = 'CLOSED_EDITABLE' where id = s.id;
    perform bb_recompute_day(s.id);
    perform bb_write_xp_delta(s.id, 'DAY_CLOSE');
  end loop;

  -- Kilitleme: düzeltme süresi dolan günler kesinleşir, kalp aynı transaction'da yazılır
  v_h_active := coalesce((cfg->'dailyHearts'->>'anyPositiveProgress')::int, 2);
  v_h_ratio := coalesce((cfg->'dailyHearts'->>'ratioBonus')::int, 3);
  v_ratio_pct := coalesce(round((cfg->'dailyHearts'->>'ratioThreshold')::numeric * 100)::int, 70);
  for s in select * from daily_summaries where user_id = p_user and state = 'CLOSED_EDITABLE' and correction_deadline <= now() order by local_date for update loop
    update daily_summaries set state = 'FINALIZED', finalized_at = now() where id = s.id;
    if s.planned_xp > 0 and exists (select 1 from task_instances where daily_summary_id = s.id and earned_xp > 0 and status <> 'EXCUSED') then
      insert into heart_ledger (user_id, delta, source_key, source_type, reference_id)
        values (p_user, v_h_active, 'daily:' || s.id || ':active', 'DAILY_ACTIVE', s.id) on conflict (source_key) do nothing;
      if s.gross_xp * 100 >= s.planned_xp * v_ratio_pct then
        insert into heart_ledger (user_id, delta, source_key, source_type, reference_id)
          values (p_user, v_h_ratio, 'daily:' || s.id || ':ratio', 'DAILY_RATIO', s.id) on conflict (source_key) do nothing;
      end if;
    end if;
  end loop;
  update wallet_balances set hearts = (select coalesce(sum(delta), 0) from heart_ledger where user_id = p_user), updated_at = now()
    where user_id = p_user;

  perform bb_process_weeks(p_user);
end $$;

-- Haftalık değerlendirme ve bilet (Şartname §10.1)
create or replace function bb_process_weeks(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c couples; v_tz text; v_join date; ws date; wk record;
  cfg jsonb := (select value from app_config where key = 'economy');
  t jsonb; v_rule int;
  v_planned int; v_gross int; v_qd int; v_days int; v_eligible boolean;
begin
  c := bb_couple_of(p_user);
  if c.id is null then return; end if;
  v_tz := c.timezone;
  t := cfg->'ticket'; v_rule := coalesce((cfg->>'ticketRuleVersion')::int, 1);
  select bb_local_date(joined_at, v_tz) into v_join from memberships where user_id = p_user and ended_at is null;

  for wk in
    select bb_week_start(local_date) as week_start
    from daily_summaries where user_id = p_user
    group by bb_week_start(local_date)
    having count(*) filter (where state = 'FINALIZED') = 7
    order by 1
  loop
    ws := wk.week_start;
    if v_join >= ws then continue; end if;  -- hesap hafta başlamadan önce kurulmuş olmalı
    if exists (select 1 from weekly_results where user_id = p_user and week_start = ws) then continue; end if;

    select coalesce(sum(planned_xp), 0), coalesce(sum(gross_xp), 0),
           count(*) filter (where planned_xp > 0 and tracked_instance_count >= (t->>'minimumTrackedInstancesPerQualifyingDay')::int
                            and gross_xp * 100 >= planned_xp * (t->>'minimumDailyRatioPercent')::int),
           count(*)
      into v_planned, v_gross, v_qd, v_days
      from daily_summaries where user_id = p_user and local_date between ws and ws + 6 and state = 'FINALIZED';
    if v_days <> 7 then continue; end if;

    v_eligible := v_planned >= (t->>'minimumWeeklyPlannedXP')::int
      and v_qd >= (t->>'minimumQualifyingDays')::int
      and v_gross * 100 >= v_planned * (t->>'minimumWeeklyWeightedRatioPercent')::int;

    insert into weekly_results (user_id, week_start, rule_version, planned_xp, gross_xp, qualifying_days, eligible, detail)
      values (p_user, ws, v_rule, v_planned, v_gross, v_qd, v_eligible,
        jsonb_build_object('minPlanned', (t->>'minimumWeeklyPlannedXP')::int, 'minDays', (t->>'minimumQualifyingDays')::int,
                           'minWeeklyPercent', (t->>'minimumWeeklyWeightedRatioPercent')::int))
      on conflict (user_id, week_start) do nothing;
    if v_eligible then
      insert into tickets (owner_id, awarded_week_start, rule_version)
        values (p_user, ws, v_rule) on conflict (owner_id, awarded_week_start) do nothing;
    end if;
  end loop;
end $$;

-- Cron'un çağırdığı giriş noktası (yalnızca postgres)
create or replace function bb_run_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  for u in select user_id from memberships where ended_at is null loop
    begin
      perform bb_process_user(u.user_id);
      n := n + 1;
    exception when others then
      insert into audit_events (actor_id, event_type) values (u.user_id, 'JOB_ERROR:' || left(sqlerrm, 80));
    end;
  end loop;
  -- süresi dolan bilet istekleri
  update ticket_redemptions r set status = 'EXPIRED', resolved_at = now()
    where r.status = 'REQUESTED' and r.expires_at <= now();
  update tickets tk set status = 'AVAILABLE'
    where tk.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = tk.id and r.status = 'REQUESTED');
  delete from idempotency_records where expires_at < now();
  return n;
end $$;
revoke all on function bb_run_jobs() from public, anon, authenticated;

-- =====================================================================
-- 8. RPC: okuma
-- =====================================================================
create or replace function bb_user_totals(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_total bigint; v_level int;
begin
  v_total := bb_total_xp(p_user);
  v_level := bb_level_for_xp(v_total);
  return jsonb_build_object(
    'totalXP', v_total, 'level', v_level,
    'levelStart', bb_level_threshold(v_level),
    'nextLevelXP', case when v_level >= 50 then null else bb_level_threshold(v_level + 1) end
  );
end $$;

create or replace function bb_instance_json(i task_instances) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', i.id, 'stableGoalId', i.stable_goal_id, 'status', i.status, 'value', i.value,
    'itemValues', i.item_values, 'earnedXP', i.earned_xp, 'note', i.private_note, 'revision', i.revision,
    'snapshot', i.snapshot)
$$;

create or replace function bb_summary_json(s daily_summaries) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', s.id, 'date', s.local_date, 'state', s.state, 'correctionDeadline', s.correction_deadline,
    'plannedXP', s.planned_xp, 'grossXP', s.gross_xp, 'penaltyXP', s.penalty_xp, 'netXP', s.net_xp,
    'tracked', s.tracked_instance_count, 'completed', s.completed_count, 'excusedAll', s.excused_all, 'revision', s.revision)
$$;

create or replace function get_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; p profiles; sh sharing_settings; au app_users; v_partner uuid; v_invite jsonb;
begin
  c := bb_couple_of(u);
  select * into p from profiles where user_id = u;
  select * into sh from sharing_settings where user_id = u;
  select * into au from app_users where id = u;
  v_partner := bb_partner_of(u);
  select jsonb_build_object('expiresAt', expires_at) into v_invite from invites
    where couple_id = c.id and used_at is null and expires_at > now() order by created_at desc limit 1;
  return jsonb_build_object(
    'id', u, 'username', au.username, 'displayName', au.display_name,
    'profile', jsonb_build_object('avatar', p.avatar_config, 'equipped', p.equipped_items, 'motion', p.motion_preference, 'onboarded', p.onboarded),
    'sharing', jsonb_build_object('dailyTotal', sh.share_daily_total, 'categories', sh.share_categories, 'hearts', sh.share_hearts, 'ticketBalance', sh.share_ticket_balance),
    'couple', jsonb_build_object('id', c.id, 'timezone', c.timezone, 'status', c.status, 'hasPartner', v_partner is not null, 'pendingInvite', v_invite),
    'totals', bb_user_totals(u),
    'hearts', (select hearts from wallet_balances where user_id = u),
    'tickets', (select jsonb_build_object(
        'available', count(*) filter (where status = 'AVAILABLE'),
        'requested', count(*) filter (where status = 'REQUESTED'),
        'used', count(*) filter (where status = 'USED')) from tickets where owner_id = u),
    'config', (select value from app_config where key = 'economy'),
    'serverTime', now()
  );
end $$;

create or replace function get_today() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; v_today date; s daily_summaries; y daily_summaries; v_level int;
begin
  c := bb_couple_of(u);
  perform bb_process_user(u);
  v_today := bb_local_date(now(), c.timezone);
  select * into s from daily_summaries where user_id = u and local_date = v_today;
  select * into y from daily_summaries where user_id = u and local_date = v_today - 1 and state = 'CLOSED_EDITABLE' and correction_deadline > now();
  v_level := bb_level_for_xp(bb_total_xp(u));
  return jsonb_build_object(
    'serverTime', now(), 'today', v_today, 'timezone', c.timezone,
    'summary', bb_summary_json(s),
    'instances', (select coalesce(jsonb_agg(bb_instance_json(i) order by (i.snapshot->>'sort_order')::int), '[]'::jsonb) from task_instances i where i.daily_summary_id = s.id),
    'yesterday', case when y.id is null then null else bb_summary_json(y) end,
    'totals', bb_user_totals(u),
    'unseenLevels', (select coalesce(jsonb_agg(l order by l), '[]'::jsonb) from generate_series(2, v_level) l where not exists (select 1 from level_celebrations lc where lc.user_id = u and lc.level = l)),
    'newTickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week', awarded_week_start)), '[]'::jsonb) from tickets where owner_id = u and seen_at is null)
  );
end $$;

create or replace function get_day(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); s daily_summaries;
begin
  select * into s from daily_summaries where user_id = u and local_date = p_date;
  if s.id is null then return null; end if;
  return jsonb_build_object(
    'serverTime', now(),
    'summary', bb_summary_json(s),
    'editable', (s.state <> 'FINALIZED' and s.correction_deadline > now()),
    'instances', (select coalesce(jsonb_agg(bb_instance_json(i) order by (i.snapshot->>'sort_order')::int), '[]'::jsonb) from task_instances i where i.daily_summary_id = s.id)
  );
end $$;

create or replace function get_history(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  return jsonb_build_object(
    'today', v_today,
    'days', (select coalesce(jsonb_agg(bb_summary_json(s) order by s.local_date), '[]'::jsonb) from daily_summaries s
             where s.user_id = u and s.local_date > v_today - least(greatest(p_days, 1), 90) and s.local_date <= v_today),
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object('weekStart', week_start, 'plannedXP', planned_xp, 'grossXP', gross_xp,
                'qualifyingDays', qualifying_days, 'eligible', eligible, 'detail', detail) order by week_start desc), '[]'::jsonb)
              from weekly_results where user_id = u),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('date', s.local_date, 'delta', l.delta, 'reason', l.reason, 'at', l.created_at) order by l.created_at desc), '[]'::jsonb)
               from (select * from xp_ledger where user_id = u order by created_at desc limit 50) l join daily_summaries s on s.id = l.daily_summary_id),
    'hearts', (select coalesce(jsonb_agg(jsonb_build_object('delta', delta, 'type', source_type, 'at', created_at) order by created_at desc), '[]'::jsonb)
               from (select * from heart_ledger where user_id = u order by created_at desc limit 50) h)
  );
end $$;

-- Haftalık bilet yolu (bu hafta, kesinleşmemiş; yalnızca bilgi amaçlı)
create or replace function get_rewards() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; v_today date; ws date; t jsonb;
  v_planned int; v_gross int; v_qd int; v_join date;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  t := (select value->'ticket' from app_config where key = 'economy');
  select bb_local_date(joined_at, c.timezone) into v_join from memberships where user_id = u and ended_at is null;
  select coalesce(sum(planned_xp), 0), coalesce(sum(gross_xp), 0),
         count(*) filter (where planned_xp > 0 and tracked_instance_count >= (t->>'minimumTrackedInstancesPerQualifyingDay')::int
                          and gross_xp * 100 >= planned_xp * (t->>'minimumDailyRatioPercent')::int)
    into v_planned, v_gross, v_qd
    from daily_summaries where user_id = u and local_date between ws and ws + 6;
  return jsonb_build_object(
    'weekStart', ws, 'today', v_today,
    'firstPartialWeek', v_join >= ws,
    'plannedXP', v_planned, 'grossXP', v_gross, 'qualifyingDays', v_qd,
    'rule', t,
    'finalizesAt', bb_local_ts(ws + 7, time '12:00', c.timezone),
    'hearts', (select hearts from wallet_balances where user_id = u),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week', awarded_week_start, 'status', status, 'createdAt', created_at) order by created_at desc), '[]'::jsonb) from tickets where owner_id = u),
    'redemptions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'ticketId', r.ticket_id, 'requestedBy', r.requested_by, 'partnerId', r.partner_id,
        'status', r.status, 'expiresAt', r.expires_at, 'resolvedAt', r.resolved_at, 'reversedAt', r.reversed_at, 'createdAt', r.created_at) order by r.created_at desc), '[]'::jsonb)
        from ticket_redemptions r where (r.requested_by = u or r.partner_id = u) and r.created_at > now() - interval '60 days'),
    'lastWeek', (select jsonb_build_object('weekStart', week_start, 'plannedXP', planned_xp, 'grossXP', gross_xp, 'qualifyingDays', qualifying_days, 'eligible', eligible)
                 from weekly_results where user_id = u order by week_start desc limit 1),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'slot', slot, 'requiredLevel', required_level,
        'requiredGardenLevel', required_garden_level, 'price', price_hearts, 'assetKey', asset_key) order by sort_order), '[]'::jsonb) from reward_catalog where active),
    'inventory', (select coalesce(jsonb_agg(item_id), '[]'::jsonb) from user_inventory where user_id = u),
    'coupleInventory', (select coalesce(jsonb_agg(jsonb_build_object('itemId', item_id, 'placed', placed)), '[]'::jsonb) from couple_inventory where couple_id = c.id)
  );
end $$;

-- Partner özeti: yalnızca izin verilen alanlar döner (allowlist)
create or replace function get_couple() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; v_partner uuid; pu app_users; pp profiles; psh sharing_settings;
  v_today date; ps daily_summaries; partner_json jsonb; v_garden bigint; v_levels jsonb; v_garden_level int := 1; i int;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  v_partner := bb_partner_of(u);
  v_levels := (select value->'gardenLevels' from app_config where key = 'economy');
  select coalesce(sum(net_xp), 0) into v_garden from daily_summaries s join memberships m on m.user_id = s.user_id
    where m.couple_id = c.id and s.state = 'FINALIZED';
  for i in 0 .. jsonb_array_length(v_levels) - 1 loop
    if v_garden >= (v_levels->>i)::bigint then v_garden_level := i + 1; end if;
  end loop;

  if v_partner is not null then
    select * into pu from app_users where id = v_partner;
    select * into pp from profiles where user_id = v_partner;
    select * into psh from sharing_settings where user_id = v_partner;
    select * into ps from daily_summaries where user_id = v_partner and local_date = v_today;
    partner_json := jsonb_build_object(
      'id', v_partner, 'displayName', pu.display_name, 'avatar', pp.avatar_config, 'equipped', pp.equipped_items,
      'level', bb_level_for_xp(bb_total_xp(v_partner)),
      'excusedToday', coalesce(ps.excused_all, false));
    if psh.share_daily_total and ps.id is not null and ps.planned_xp > 0 then
      partner_json := partner_json || jsonb_build_object('todayPlannedXP', ps.planned_xp, 'todayGrossXP', ps.gross_xp, 'todayCompleted', ps.completed_count, 'todayTracked', ps.tracked_instance_count);
    end if;
    if psh.share_hearts then
      partner_json := partner_json || jsonb_build_object('hearts', (select hearts from wallet_balances where user_id = v_partner));
    end if;
    if psh.share_ticket_balance then
      partner_json := partner_json || jsonb_build_object('ticketsAvailable', (select count(*) from tickets where owner_id = v_partner and status = 'AVAILABLE'));
    end if;
  end if;

  return jsonb_build_object(
    'serverTime', now(), 'today', v_today,
    'couple', jsonb_build_object('id', c.id, 'name', c.display_name, 'status', c.status, 'gardenXP', v_garden, 'gardenLevel', v_garden_level, 'gardenLevels', v_levels),
    'partner', partner_json,
    'memories', (select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
        select jsonb_build_object('type', 'LEVEL', 'userId', lc.user_id, 'name', au.display_name, 'level', lc.level, 'at', lc.seen_at) x
          from level_celebrations lc join app_users au on au.id = lc.user_id join memberships m on m.user_id = lc.user_id and m.couple_id = c.id
        union all
        select jsonb_build_object('type', 'ACTIVITY', 'title', sa.title, 'at', sa.finalized_at) from shared_activities sa where sa.couple_id = c.id and sa.status = 'COMPLETED'
        union all
        select jsonb_build_object('type', 'DECOR', 'itemId', ci.item_id, 'at', ci.acquired_at) from couple_inventory ci where ci.couple_id = c.id
      ) q limit 30),
    'skillsReceivedToday', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'skillId', skill_id, 'payload', payload, 'at', sent_at) order by sent_at desc), '[]'::jsonb)
        from skill_uses where recipient_id = u and local_date >= v_today - 1),
    'skillsSentToday', (select coalesce(jsonb_agg(skill_id), '[]'::jsonb) from skill_uses where sender_id = u and local_date = v_today),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'creatorId', a.creator_id, 'type', a.type, 'title', a.title, 'date', a.proposed_date, 'time', a.proposed_time,
        'status', a.status, 'confirmedBy', (select coalesce(jsonb_agg(user_id), '[]'::jsonb) from activity_confirmations ac where ac.activity_id = a.id),
        'createdAt', a.created_at) order by a.created_at desc), '[]'::jsonb)
        from shared_activities a where a.couple_id = c.id and not (u = any(a.hidden_by)) and a.created_at > now() - interval '60 days')
  );
end $$;

-- =====================================================================
-- 9. RPC: yazma
-- =====================================================================
create or replace function record_task(p_instance_id uuid, p_operation_id uuid, p_expected_revision int, p_action text,
                                       p_value int default null, p_item_values jsonb default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user();
  i task_instances; s daily_summaries;
  v_hash text; v_prev jsonb; v_type text; v_target int; v_max int; v_items jsonb;
  n_status text; n_value int; n_items jsonb; n_xp int; v_delta int; v_resp jsonb; v_total bigint;
  v_done int; v_total_items int; v_before text; v_before_value int; v_before_xp int;
begin
  if p_action not in ('set_value','set_completed','set_not_done','set_excused','clear') then raise exception 'INVALID_ACTION'; end if;
  v_hash := md5(coalesce(p_instance_id::text,'') || '|' || p_expected_revision || '|' || p_action || '|' || coalesce(p_value::text,'') || '|' || coalesce(p_item_values::text,'') || '|' || coalesce(p_note,''));

  select response into v_prev from idempotency_records where user_id = u and route = 'record_task' and operation_id = p_operation_id;
  if v_prev is not null then
    if v_prev->>'_hash' <> v_hash then raise exception 'OPERATION_MISMATCH'; end if;
    return v_prev - '_hash';
  end if;

  select ti.* into i from task_instances ti where ti.id = p_instance_id and ti.user_id = u;
  if i.id is null then raise exception 'NOT_FOUND'; end if;
  select * into s from daily_summaries where id = i.daily_summary_id for update;  -- gün satırı kilidi
  select ti.* into i from task_instances ti where ti.id = p_instance_id;          -- kilit sonrası yeniden oku

  if s.state = 'FINALIZED' or s.correction_deadline <= now() then raise exception 'DAY_LOCKED'; end if;
  if i.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using detail = bb_instance_json(i)::text;
  end if;

  v_before := i.status; v_before_value := i.value; v_before_xp := i.earned_xp;
  v_type := i.snapshot->>'input_type'; v_target := (i.snapshot->>'target')::int; v_max := (i.snapshot->>'max_xp')::int; v_items := i.snapshot->'items';
  n_status := i.status; n_value := i.value; n_items := i.item_values;

  case p_action
    when 'set_completed' then
      if v_type = 'BOOLEAN' then n_status := 'COMPLETED'; n_value := 1;
      elsif v_type = 'CHOICE3' then n_status := 'COMPLETED'; n_value := 2;
      elsif v_type in ('NUMBER','DURATION') then n_status := 'COMPLETED'; n_value := greatest(coalesce(i.value, 0), v_target);
      elsif v_type = 'CHECKLIST' then n_status := 'COMPLETED'; n_items := (select jsonb_agg(true) from jsonb_array_elements(v_items));
      else raise exception 'INVALID_ACTION_FOR_TYPE'; end if;
    when 'set_not_done' then
      n_status := 'MISSED_SELF'; n_value := case when v_type = 'CHOICE3' then 0 else null end; n_items := '[]'::jsonb;
    when 'set_excused' then
      n_status := 'EXCUSED'; n_value := null; n_items := '[]'::jsonb;
    when 'clear' then
      n_status := case when s.state = 'OPEN' then 'PENDING' else 'MISSED_AUTO' end; n_value := null; n_items := '[]'::jsonb;
    when 'set_value' then
      if v_type = 'CHECKLIST' then
        if p_item_values is null or jsonb_typeof(p_item_values) <> 'array' or jsonb_array_length(p_item_values) <> jsonb_array_length(v_items) then raise exception 'INVALID_VALUE'; end if;
        n_items := p_item_values; v_total_items := jsonb_array_length(v_items);
        select count(*) into v_done from jsonb_array_elements_text(p_item_values) v where v::boolean;
        n_status := case when v_done = 0 then 'MISSED_SELF' when v_done = v_total_items then 'COMPLETED' else 'PARTIAL' end;
        n_value := v_done;
      else
        if p_value is null or p_value < 0 then raise exception 'INVALID_VALUE'; end if;
        if v_type in ('NUMBER','DURATION') then
          if p_value > v_target * 10 then raise exception 'VALUE_TOO_LARGE'; end if;
          n_value := p_value; n_status := case when p_value = 0 then 'MISSED_SELF' when p_value >= v_target then 'COMPLETED' else 'PARTIAL' end;
        elsif v_type = 'TIME' then
          if p_value > 1439 then raise exception 'INVALID_VALUE'; end if;
          n_value := p_value; n_status := case when p_value <= v_target then 'COMPLETED' else 'PARTIAL' end;
        elsif v_type = 'CHOICE3' then
          if p_value > 2 then raise exception 'INVALID_VALUE'; end if;
          n_value := p_value; n_status := case p_value when 2 then 'COMPLETED' when 1 then 'PARTIAL' else 'MISSED_SELF' end;
        elsif v_type = 'BOOLEAN' then
          n_value := least(p_value, 1); n_status := case when p_value >= 1 then 'COMPLETED' else 'MISSED_SELF' end;
        end if;
      end if;
  end case;

  if p_note is not null and char_length(p_note) > 500 then raise exception 'NOTE_TOO_LONG'; end if;
  n_xp := bb_instance_xp(v_type, v_max, v_target, n_status, n_value, n_items, v_items);

  update task_instances set status = n_status, value = n_value, item_values = coalesce(n_items, '[]'::jsonb), earned_xp = n_xp,
    private_note = coalesce(p_note, private_note), revision = revision + 1, updated_at = now()
    where id = i.id returning * into i;
  insert into task_events (instance_id, actor_id, operation_id, action, before_status, after_status, before_value, after_value, xp_delta)
    values (i.id, u, p_operation_id, p_action, v_before, n_status, v_before_value, n_value, n_xp - v_before_xp);

  perform bb_recompute_day(s.id);
  v_delta := bb_write_xp_delta(s.id, 'TASK:' || p_action);
  select * into s from daily_summaries where id = s.id;
  v_total := bb_total_xp(u);

  v_resp := jsonb_build_object(
    'instance', bb_instance_json(i), 'summary', bb_summary_json(s),
    'xpDelta', v_delta, 'dayGrossXP', s.gross_xp, 'dayNetXP', s.net_xp,
    'totals', bb_user_totals(u), 'correctionDeadline', s.correction_deadline, 'serverTime', now());
  insert into idempotency_records (user_id, route, operation_id, request_hash, response)
    values (u, 'record_task', p_operation_id, v_hash, v_resp || jsonb_build_object('_hash', v_hash));
  return v_resp;
end $$;

create or replace function excuse_day(p_date date, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); s daily_summaries; v_prev jsonb; v_resp jsonb;
begin
  select response into v_prev from idempotency_records where user_id = u and route = 'excuse_day' and operation_id = p_operation_id;
  if v_prev is not null then return v_prev; end if;
  select * into s from daily_summaries where user_id = u and local_date = p_date for update;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  if s.state = 'FINALIZED' or s.correction_deadline <= now() then raise exception 'DAY_LOCKED'; end if;
  update task_instances set status = 'EXCUSED', value = null, item_values = '[]'::jsonb, earned_xp = 0, revision = revision + 1, updated_at = now()
    where daily_summary_id = s.id and status <> 'EXCUSED';
  perform bb_recompute_day(s.id);
  perform bb_write_xp_delta(s.id, 'EXCUSE_DAY');
  select * into s from daily_summaries where id = s.id;
  v_resp := jsonb_build_object('summary', bb_summary_json(s), 'totals', bb_user_totals(u), 'serverTime', now());
  insert into idempotency_records (user_id, route, operation_id, request_hash, response) values (u, 'excuse_day', p_operation_id, md5(p_date::text), v_resp);
  return v_resp;
end $$;

create or replace function mark_level_seen(p_level int) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  if p_level < 2 or p_level > bb_level_for_xp(bb_total_xp(u)) then return; end if;
  insert into level_celebrations (user_id, level) values (u, p_level) on conflict do nothing;
end $$;

create or replace function mark_tickets_seen() returns void
language plpgsql security definer set search_path = public as $$
begin
  update tickets set seen_at = now() where owner_id = bb_current_user() and seen_at is null;
end $$;

create or replace function update_profile(p_display_name text default null, p_avatar jsonb default null, p_motion text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  if p_display_name is not null then
    if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'INVALID_DISPLAY_NAME'; end if;
    update app_users set display_name = trim(p_display_name), updated_at = now() where id = u;
  end if;
  if p_avatar is not null then
    update profiles set avatar_config = p_avatar, updated_at = now() where user_id = u;
  end if;
  if p_motion is not null then
    update profiles set motion_preference = p_motion, updated_at = now() where user_id = u;
  end if;
  return get_me();
end $$;

-- İlk kurulum: başlangıç görevleri hemen başlar (yalnızca onboarded=false iken)
create or replace function finish_onboarding(p_display_name text, p_avatar jsonb, p_goals jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); p profiles; pv uuid; g jsonb; v_active int; v_planned int; c couples; v_today date; s daily_summaries;
begin
  select * into p from profiles where user_id = u for update;
  if p.onboarded then raise exception 'ALREADY_ONBOARDED'; end if;
  perform update_profile(p_display_name, p_avatar, null);

  select id into pv from plan_versions where user_id = u and status = 'ACTIVE' order by effective_week_start desc limit 1;
  if p_goals is not null and jsonb_typeof(p_goals) = 'array' then
    for g in select * from jsonb_array_elements(p_goals) loop
      update goal_versions set
        active = coalesce((g->>'active')::boolean, active),
        target = case when (g->>'target') is not null and (g->>'target')::int > 0 then (g->>'target')::int else target end,
        items = case when g ? 'items' and jsonb_typeof(g->'items') = 'array' then g->'items' else items end,
        name = case when coalesce(trim(g->>'name'), '') <> '' then left(trim(g->>'name'), 60) else name end
      where id = (g->>'id')::uuid and user_id = u and plan_version_id = pv;
    end loop;
  end if;
  update goal_versions set active = false where plan_version_id = pv and input_type = 'CHECKLIST' and jsonb_array_length(items) = 0;

  select count(*) into v_active from goal_versions where plan_version_id = pv and active;
  if v_active > 20 then raise exception 'TOO_MANY_GOALS'; end if;
  select coalesce(max(day_total), 0) into v_planned from (
    select d, sum(max_xp) day_total from goal_versions, generate_series(1,7) d where plan_version_id = pv and active and d = any(weekdays) group by d) q;
  if v_planned > 200 then raise exception 'DAILY_XP_LIMIT'; end if;

  update profiles set onboarded = true, updated_at = now() where user_id = u;

  -- Bugünün örnekleri henüz kayıt içermiyorsa plana göre yeniden üret
  c := bb_couple_of(u); v_today := bb_local_date(now(), c.timezone);
  select * into s from daily_summaries where user_id = u and local_date = v_today;
  if s.id is not null and not exists (select 1 from task_instances where daily_summary_id = s.id and status not in ('PENDING')) then
    delete from task_instances where daily_summary_id = s.id;
    delete from daily_summaries where id = s.id;
  end if;
  perform bb_process_user(u);
  return get_me();
end $$;

create or replace function update_sharing(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  update sharing_settings set
    share_daily_total = coalesce((p->>'dailyTotal')::boolean, share_daily_total),
    share_categories = coalesce((p->>'categories')::boolean, share_categories),
    share_hearts = coalesce((p->>'hearts')::boolean, share_hearts),
    share_ticket_balance = coalesce((p->>'ticketBalance')::boolean, share_ticket_balance),
    updated_at = now()
  where user_id = u;
  return get_me();
end $$;

-- 24 saat geçerli tek kullanımlık davet. Yalnızca ilk üye, çift tamamlanmamışken.
create or replace function create_invite() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_count int; v_token text; v_exp timestamptz;
begin
  c := bb_couple_of(u);
  if not exists (select 1 from memberships where user_id = u and couple_id = c.id and role = 'FIRST' and ended_at is null) then raise exception 'FORBIDDEN'; end if;
  select count(*) into v_count from memberships where couple_id = c.id and ended_at is null;
  if v_count >= 2 then raise exception 'COUPLE_FULL'; end if;
  update invites set expires_at = now() where couple_id = c.id and used_at is null and expires_at > now();
  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
  v_exp := now() + interval '24 hours';
  insert into invites (couple_id, token_hash, created_by, expires_at) values (c.id, bb_hash(v_token), u, v_exp);
  insert into audit_events (actor_id, event_type, object_id) values (u, 'INVITE_CREATED', c.id);
  return jsonb_build_object('token', v_token, 'expiresAt', v_exp);
end $$;

-- =====================================================================
-- 10. RLS: doğrudan tablo erişimi yalnızca kendi satırlarını okuma; yazma yalnızca RPC ile
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['app_config','couples','app_users','memberships','setup_keys','invites','profiles','sharing_settings',
    'plan_versions','goal_versions','daily_summaries','task_instances','task_events','xp_ledger','level_celebrations','heart_ledger',
    'wallet_balances','reward_catalog','user_inventory','couple_inventory','skill_uses','shared_activities','activity_confirmations',
    'couple_rule_versions','weekly_results','tickets','ticket_redemptions','idempotency_records','audit_events'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists own_app_users on app_users;
create policy own_app_users on app_users for select to authenticated using (id = auth.uid());
drop policy if exists own_profiles on profiles;
create policy own_profiles on profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists own_sharing on sharing_settings;
create policy own_sharing on sharing_settings for select to authenticated using (user_id = auth.uid());
drop policy if exists own_plans on plan_versions;
create policy own_plans on plan_versions for select to authenticated using (user_id = auth.uid());
drop policy if exists own_goals on goal_versions;
create policy own_goals on goal_versions for select to authenticated using (user_id = auth.uid());
drop policy if exists own_days on daily_summaries;
create policy own_days on daily_summaries for select to authenticated using (user_id = auth.uid());
drop policy if exists own_instances on task_instances;
create policy own_instances on task_instances for select to authenticated using (user_id = auth.uid());
drop policy if exists own_ledger on xp_ledger;
create policy own_ledger on xp_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists own_hearts on heart_ledger;
create policy own_hearts on heart_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists own_wallet on wallet_balances;
create policy own_wallet on wallet_balances for select to authenticated using (user_id = auth.uid());
drop policy if exists own_weeks on weekly_results;
create policy own_weeks on weekly_results for select to authenticated using (user_id = auth.uid());
drop policy if exists own_tickets on tickets;
create policy own_tickets on tickets for select to authenticated using (owner_id = auth.uid());
drop policy if exists catalog_read on reward_catalog;
create policy catalog_read on reward_catalog for select to authenticated using (active);
drop policy if exists config_read on app_config;
create policy config_read on app_config for select to authenticated using (true);

-- Doğrudan tablo yazma hakkı yok; yalnızca RPC
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- RPC izinleri
revoke execute on all functions in schema public from anon;
grant execute on function get_me(), get_today(), get_day(date), get_history(int), get_rewards(), get_couple(),
  record_task(uuid, uuid, int, text, int, jsonb, text), excuse_day(date, uuid), mark_level_seen(int), mark_tickets_seen(),
  update_profile(text, jsonb, text), finish_onboarding(text, jsonb, jsonb), update_sharing(jsonb), create_invite() to authenticated;
revoke execute on function bb_run_jobs(), bb_process_user(uuid), bb_process_weeks(uuid), bb_generate_day(uuid, date, text),
  bb_recompute_day(uuid), bb_write_xp_delta(uuid, text), bb_seed_default_plan(uuid, date), bb_handle_new_auth_user() from public, anon, authenticated;

-- =====================================================================
-- 11. Katalog seed (Şartname §9) — görseller geçici
-- =====================================================================
insert into reward_catalog (id, kind, name, slot, required_level, required_garden_level, price_hearts, asset_key, sort_order) values
  ('outfit_starter', 'OUTFIT', 'Başlangıç kıyafeti', 'outfit', 1, 1, 0, 'outfit_starter', 1),
  ('outfit_spring', 'OUTFIT', 'Günlük bahar takımı', 'outfit', 3, 1, 0, 'outfit_spring', 2),
  ('outfit_book', 'OUTFIT', 'Kitap arkadaşı takımı', 'outfit', 6, 1, 0, 'outfit_book', 3),
  ('outfit_picnic', 'OUTFIT', 'Piknik takımı', 'outfit', 10, 1, 0, 'outfit_picnic', 4),
  ('outfit_evening', 'OUTFIT', 'Zarif akşam takımı', 'outfit', 15, 1, 0, 'outfit_evening', 5),
  ('outfit_starry', 'OUTFIT', 'Yıldızlı gece takımı', 'outfit', 20, 1, 0, 'outfit_starry', 6),
  ('acc_flower_brooch', 'ACCESSORY', 'Küçük çiçek broşu', 'head', 3, 1, 10, 'acc_flower_brooch', 10),
  ('hand_book_cup', 'HAND', 'Kitap ve fincan', 'hand', 5, 1, 15, 'hand_book_cup', 11),
  ('effect_glow', 'EFFECT', 'Yumuşak parıltı', 'effect', 8, 1, 25, 'effect_glow', 12),
  ('decor_potted_flower', 'DECOR', 'Saksı çiçeği', 'decor', 1, 2, 15, 'decor_potted_flower', 20),
  ('decor_cushion', 'DECOR', 'Veranda minderi', 'decor', 1, 3, 20, 'decor_cushion', 21),
  ('decor_picnic_basket', 'DECOR', 'Piknik sepeti', 'decor', 1, 4, 25, 'decor_picnic_basket', 22),
  ('decor_light_chain', 'DECOR', 'Işık zinciri', 'decor', 1, 5, 30, 'decor_light_chain', 23)
on conflict (id) do nothing;
