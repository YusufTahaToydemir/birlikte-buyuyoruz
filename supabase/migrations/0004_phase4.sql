-- Birlikte Büyüyoruz · 0004_phase4.sql · Aşama 4: plan düzenleme, görev bırakma, kurtarma kodları, oturumlar, dışa aktarma, ayrılma, hesap silme
-- Idempotent. 0001–0003 uygulanmış olmalı.

-- =====================================================================
-- 1. Şema düzeltmeleri (hesap silme için kimlik kaldırma)
-- =====================================================================
alter table shared_activities alter column creator_id drop not null;
alter table shared_activities drop constraint if exists shared_activities_creator_id_fkey;
alter table shared_activities add constraint shared_activities_creator_id_fkey foreign key (creator_id) references app_users(id) on delete set null;
alter table couple_inventory alter column purchased_by drop not null;
alter table couple_inventory drop constraint if exists couple_inventory_purchased_by_fkey;
alter table couple_inventory add constraint couple_inventory_purchased_by_fkey foreign key (purchased_by) references app_users(id) on delete set null;
alter table couple_rule_versions drop constraint if exists couple_rule_versions_proposed_by_fkey;
alter table couple_rule_versions add constraint couple_rule_versions_proposed_by_fkey foreign key (proposed_by) references app_users(id) on delete set null;
alter table couple_rule_versions drop constraint if exists couple_rule_versions_approved_by_fkey;
alter table couple_rule_versions add constraint couple_rule_versions_approved_by_fkey foreign key (approved_by) references app_users(id) on delete set null;
alter table ticket_redemptions drop constraint if exists ticket_redemptions_requested_by_fkey;
alter table ticket_redemptions add constraint ticket_redemptions_requested_by_fkey foreign key (requested_by) references app_users(id) on delete cascade;
alter table ticket_redemptions drop constraint if exists ticket_redemptions_partner_id_fkey;
alter table ticket_redemptions add constraint ticket_redemptions_partner_id_fkey foreign key (partner_id) references app_users(id) on delete cascade;

create table if not exists goal_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  stable_goal_id uuid not null,
  from_date date not null,
  to_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists goal_pauses_user_idx on goal_pauses(user_id, stable_goal_id);
alter table goal_pauses enable row level security;
drop policy if exists own_pauses on goal_pauses;
create policy own_pauses on goal_pauses for select to authenticated using (user_id = auth.uid());

create table if not exists recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  code_hash text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table recovery_codes enable row level security;

create table if not exists recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists recovery_attempts_idx on recovery_attempts(username, attempted_at);
alter table recovery_attempts enable row level security;

-- =====================================================================
-- 2. Gün üretimi: takip dışı bırakılan görevler EXCUSED olarak üretilir
-- =====================================================================
create or replace function bb_generate_day(p_user uuid, p_date date, p_tz text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_summary uuid; v_plan uuid;
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
    insert into task_instances (daily_summary_id, user_id, stable_goal_id, goal_version_id, snapshot, status)
    select v_summary, p_user, g.stable_goal_id, g.id,
      jsonb_build_object('code', g.code, 'group_key', g.group_key, 'name', g.name, 'description', g.description,
        'icon', g.icon, 'category', g.category, 'input_type', g.input_type, 'target', g.target, 'unit', g.unit,
        'max_xp', g.max_xp, 'items', g.items, 'sort_order', g.sort_order),
      case when exists (select 1 from goal_pauses gp where gp.user_id = p_user and gp.stable_goal_id = g.stable_goal_id and p_date between gp.from_date and gp.to_date) then 'EXCUSED' else 'PENDING' end
    from goal_versions g
    where g.plan_version_id = v_plan and g.active
      and extract(isodow from p_date)::int = any(g.weekdays)
      and (g.input_type <> 'CHECKLIST' or jsonb_array_length(g.items) > 0);
  end if;
  perform bb_recompute_day(v_summary);
  return v_summary;
end $$;

-- =====================================================================
-- 3. Plan düzenleme (Şartname §5 Görev düzenleme)
-- =====================================================================
create or replace function bb_goal_json(g goal_versions) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', g.stable_goal_id, 'code', g.code, 'groupKey', g.group_key, 'name', g.name, 'description', g.description, 'icon', g.icon,
    'category', g.category, 'inputType', g.input_type, 'target', g.target, 'unit', g.unit, 'weekdays', to_jsonb(g.weekdays), 'maxXP', g.max_xp,
    'items', g.items, 'active', g.active, 'sortOrder', g.sort_order)
$$;

create or replace function get_plan() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; ws date; v_cur plan_versions; v_next plan_versions;
begin
  c := bb_couple_of(u); v_today := bb_local_date(now(), c.timezone); ws := bb_week_start(v_today);
  select * into v_cur from plan_versions where user_id = u and status = 'ACTIVE' and effective_week_start <= ws order by effective_week_start desc limit 1;
  select * into v_next from plan_versions where user_id = u and status = 'ACTIVE' and effective_week_start = ws + 7;
  return jsonb_build_object(
    'today', v_today, 'weekStart', ws, 'nextWeekStart', ws + 7,
    'current', jsonb_build_object('id', v_cur.id, 'effectiveWeekStart', v_cur.effective_week_start, 'penaltyEnabled', v_cur.penalty_enabled,
      'goals', (select coalesce(jsonb_agg(bb_goal_json(g) order by g.sort_order), '[]'::jsonb) from goal_versions g where g.plan_version_id = v_cur.id)),
    'next', case when v_next.id is null then null else jsonb_build_object('id', v_next.id, 'effectiveWeekStart', v_next.effective_week_start, 'penaltyEnabled', v_next.penalty_enabled,
      'goals', (select coalesce(jsonb_agg(bb_goal_json(g) order by g.sort_order), '[]'::jsonb) from goal_versions g where g.plan_version_id = v_next.id)) end,
    'pauses', (select coalesce(jsonb_agg(jsonb_build_object('stableGoalId', stable_goal_id, 'fromDate', from_date, 'toDate', to_date)), '[]'::jsonb) from goal_pauses where user_id = u and to_date >= v_today),
    'limits', jsonb_build_object('maxGoalXP', 20, 'maxDailyPlannedXP', 200, 'maxActiveGoals', 20)
  );
end $$;

create or replace function save_next_week_plan(p_penalty_enabled boolean, p_goals jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; ws date; v_next plan_versions; v_cur plan_versions; g jsonb; v_active int; v_day int; v_max int := 0; i int;
  v_type text; v_cat text; v_xp int; v_target int; v_name text; v_days int[]; v_items jsonb; v_sid uuid; v_order int := 0;
begin
  if p_goals is null or jsonb_typeof(p_goals) <> 'array' then raise exception 'INVALID_VALUE'; end if;
  c := bb_couple_of(u); ws := bb_week_start(bb_local_date(now(), c.timezone)) + 7;
  select * into v_cur from plan_versions where user_id = u and status = 'ACTIVE' and effective_week_start <= ws - 7 order by effective_week_start desc limit 1;

  -- Doğrulama: sınırlar sessizce kırpılmaz, hangi sınırın aşıldığı belirtilir
  select count(*) into v_active from jsonb_array_elements(p_goals) x where coalesce((x->>'active')::boolean, true);
  if v_active > 20 then raise exception 'TOO_MANY_GOALS'; end if;
  for i in 1..7 loop
    select coalesce(sum((x->>'maxXP')::int), 0) into v_day from jsonb_array_elements(p_goals) x
      where coalesce((x->>'active')::boolean, true) and (x->'weekdays') @> to_jsonb(i);
    v_max := greatest(v_max, v_day);
  end loop;
  if v_max > 200 then raise exception 'DAILY_XP_LIMIT' using detail = v_max::text; end if;

  -- Gelecek haftanın sürümü: varsa yenilenir
  select * into v_next from plan_versions where user_id = u and effective_week_start = ws for update;
  if v_next.id is null then
    insert into plan_versions (user_id, effective_week_start, penalty_enabled) values (u, ws, coalesce(p_penalty_enabled, false)) returning * into v_next;
  else
    update plan_versions set penalty_enabled = coalesce(p_penalty_enabled, false), status = 'ACTIVE' where id = v_next.id;
    delete from goal_versions where plan_version_id = v_next.id;
  end if;

  for g in select * from jsonb_array_elements(p_goals) loop
    v_order := v_order + 10;
    v_type := g->>'inputType'; v_cat := g->>'category'; v_xp := (g->>'maxXP')::int; v_target := coalesce((g->>'target')::int, 1);
    v_name := left(trim(regexp_replace(coalesce(g->>'name', ''), '<[^>]*>', '', 'g')), 60);
    v_items := case when jsonb_typeof(g->'items') = 'array' then g->'items' else '[]'::jsonb end;
    select coalesce(array_agg(d::int), '{}') into v_days from jsonb_array_elements_text(coalesce(g->'weekdays', '[]'::jsonb)) d where d::int between 1 and 7;
    if v_type not in ('BOOLEAN','TIME','NUMBER','DURATION','CHECKLIST','CHOICE3') then raise exception 'INVALID_VALUE'; end if;
    if v_cat not in ('START','WORSHIP','LEARNING','BODY') then raise exception 'INVALID_VALUE'; end if;
    if char_length(v_name) = 0 then raise exception 'INVALID_VALUE'; end if;
    if v_xp is null or v_xp < 1 or v_xp > 20 then raise exception 'GOAL_XP_RANGE'; end if;
    if v_target < 1 then raise exception 'INVALID_VALUE'; end if;
    if array_length(v_days, 1) is null then raise exception 'INVALID_VALUE'; end if;
    if v_type = 'CHECKLIST' and jsonb_array_length(v_items) = 0 and coalesce((g->>'active')::boolean, true) then raise exception 'CHECKLIST_EMPTY'; end if;
    v_sid := coalesce(nullif(g->>'id', '')::uuid, gen_random_uuid());
    insert into goal_versions (user_id, stable_goal_id, plan_version_id, code, group_key, name, description, icon, category, input_type, target, unit, weekdays, max_xp, items, active, sort_order)
    values (u, v_sid, v_next.id, coalesce(nullif(g->>'code', ''), 'CUSTOM'), nullif(g->>'groupKey', ''), v_name,
      left(coalesce(g->>'description', ''), 200), coalesce(nullif(g->>'icon', ''), '•'), v_cat, v_type, v_target, left(coalesce(g->>'unit', ''), 12),
      v_days, v_xp, v_items, coalesce((g->>'active')::boolean, true), v_order);
  end loop;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'PLAN_SAVED', v_next.id);
  return get_plan();
end $$;

-- Hesaplamayı etkilemeyen değişiklikler hemen uygulanır (ad, açıklama, ikon)
create or replace function rename_goal(p_stable_goal_id uuid, p_name text, p_description text default null, p_icon text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_name text;
begin
  v_name := left(trim(regexp_replace(coalesce(p_name, ''), '<[^>]*>', '', 'g')), 60);
  if char_length(v_name) = 0 then raise exception 'INVALID_VALUE'; end if;
  update goal_versions g set name = v_name, description = coalesce(left(p_description, 200), g.description), icon = coalesce(nullif(p_icon, ''), g.icon)
    from plan_versions pv where g.plan_version_id = pv.id and pv.user_id = u and pv.status = 'ACTIVE' and g.stable_goal_id = p_stable_goal_id;
  return get_plan();
end $$;

-- Görevi bırakma: bugünden gelecek Pazartesi'ye kadar takip dışı (geçmiş kopyalar silinmez)
create or replace function pause_goal(p_stable_goal_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_to date; s daily_summaries; i task_instances;
begin
  c := bb_couple_of(u); v_today := bb_local_date(now(), c.timezone); v_to := bb_week_start(v_today) + 6;
  if not exists (select 1 from goal_versions g join plan_versions pv on pv.id = g.plan_version_id where pv.user_id = u and g.stable_goal_id = p_stable_goal_id) then raise exception 'NOT_FOUND'; end if;
  delete from goal_pauses where user_id = u and stable_goal_id = p_stable_goal_id and to_date >= v_today;
  insert into goal_pauses (user_id, stable_goal_id, from_date, to_date) values (u, p_stable_goal_id, v_today, v_to);
  -- bugünün kaydı açıksa takip dışı yap
  select * into s from daily_summaries where user_id = u and local_date = v_today for update;
  if s.id is not null and s.state <> 'FINALIZED' then
    select * into i from task_instances where daily_summary_id = s.id and stable_goal_id = p_stable_goal_id;
    if i.id is not null and i.status <> 'EXCUSED' then
      update task_instances set status = 'EXCUSED', value = null, item_values = '[]'::jsonb, earned_xp = 0, revision = revision + 1, updated_at = now() where id = i.id;
      perform bb_recompute_day(s.id); perform bb_write_xp_delta(s.id, 'PAUSE_GOAL');
    end if;
  end if;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'GOAL_PAUSED', p_stable_goal_id);
  return get_plan();
end $$;

create or replace function unpause_goal(p_stable_goal_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date;
begin
  c := bb_couple_of(u); v_today := bb_local_date(now(), c.timezone);
  update goal_pauses set to_date = v_today - 1 where user_id = u and stable_goal_id = p_stable_goal_id and to_date >= v_today;
  delete from goal_pauses where user_id = u and to_date < from_date;
  return get_plan();
end $$;

-- =====================================================================
-- 4. Kurtarma kodları (Şartname §24)
-- =====================================================================
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
  insert into audit_events (actor_id, event_type) values (u, 'RECOVERY_CODES_GENERATED');
  return jsonb_build_object('codes', to_jsonb(codes), 'createdAt', now());
end $$;

create or replace function recovery_codes_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('unused', count(*) filter (where used_at is null), 'used', count(*) filter (where used_at is not null), 'createdAt', max(created_at))
  from recovery_codes where user_id = bb_current_user()
$$;

-- Oturumsuz çağrılır (anon). Kullanıcı varlığını açığa çıkarmaz; hız sınırlıdır.
-- Hatalar exception yerine {ok:false, error} ile döner: böylece deneme kaydı geri alınmaz ve sınır gerçekten işler.
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
  delete from auth.sessions where user_id = u;  -- diğer tüm oturumlar iptal
  delete from recovery_attempts where username = v_username;
  insert into audit_events (actor_id, event_type) values (u, 'PASSWORD_RECOVERED');
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- 5. Cihaz oturumları
-- =====================================================================
create or replace function list_sessions() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_cur text := coalesce(auth.jwt()->>'session_id', '');
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'createdAt', s.created_at, 'lastUsedAt', s.updated_at, 'userAgent', left(coalesce(s.user_agent, ''), 120), 'current', s.id::text = v_cur) order by s.updated_at desc), '[]'::jsonb)
    from auth.sessions s where s.user_id = u);
end $$;

create or replace function revoke_session(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  delete from auth.sessions where user_id = u and id = p_id;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'SESSION_REVOKED', p_id);
end $$;

create or replace function revoke_other_sessions() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_cur text := coalesce(auth.jwt()->>'session_id', '');
begin
  delete from auth.sessions where user_id = u and id::text <> v_cur;
  insert into audit_events (actor_id, event_type) values (u, 'OTHER_SESSIONS_REVOKED');
end $$;

-- =====================================================================
-- 6. Dışa aktarma (Şartname §25): yalnızca kendi verisi; partner verisi yok
-- =====================================================================
create or replace function export_my_data(p_include_notes boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); au app_users;
begin
  select * into au from app_users where id = u;
  insert into audit_events (actor_id, event_type) values (u, 'EXPORTED');
  return jsonb_build_object(
    'exportedAt', now(), 'username', au.username, 'displayName', au.display_name,
    'profile', (select jsonb_build_object('avatar', avatar_config, 'equipped', equipped_items) from profiles where user_id = u),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('effectiveWeekStart', pv.effective_week_start, 'penaltyEnabled', pv.penalty_enabled,
        'goals', (select coalesce(jsonb_agg(bb_goal_json(g) order by g.sort_order), '[]'::jsonb) from goal_versions g where g.plan_version_id = pv.id)) order by pv.effective_week_start), '[]'::jsonb) from plan_versions pv where pv.user_id = u),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('date', s.local_date, 'state', s.state, 'plannedXP', s.planned_xp, 'grossXP', s.gross_xp, 'penaltyXP', s.penalty_xp, 'netXP', s.net_xp, 'excusedAll', s.excused_all,
        'tasks', (select coalesce(jsonb_agg(jsonb_build_object('name', i.snapshot->>'name', 'type', i.snapshot->>'input_type', 'target', (i.snapshot->>'target')::int, 'unit', i.snapshot->>'unit',
            'value', i.value, 'itemValues', i.item_values, 'status', i.status, 'earnedXP', i.earned_xp, 'maxXP', (i.snapshot->>'max_xp')::int,
            'note', case when p_include_notes then i.private_note else null end) order by (i.snapshot->>'sort_order')::int), '[]'::jsonb) from task_instances i where i.daily_summary_id = s.id)) order by s.local_date), '[]'::jsonb)
      from daily_summaries s where s.user_id = u),
    'xpLedger', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'delta', delta, 'reason', reason) order by created_at), '[]'::jsonb) from xp_ledger where user_id = u),
    'hearts', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'delta', delta, 'type', source_type) order by created_at), '[]'::jsonb) from heart_ledger where user_id = u),
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object('weekStart', week_start, 'plannedXP', planned_xp, 'grossXP', gross_xp, 'qualifyingDays', qualifying_days, 'eligible', eligible) order by week_start), '[]'::jsonb) from weekly_results where user_id = u),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('week', awarded_week_start, 'status', status, 'createdAt', created_at) order by created_at), '[]'::jsonb) from tickets where owner_id = u)
  );
end $$;

-- =====================================================================
-- 7. Çift bağlantısını kesme ve hesap silme (Şartname §25)
-- =====================================================================
create or replace function disconnect_couple() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_new uuid;
begin
  c := bb_couple_of(u); v_partner := bb_partner_of(u);
  -- bekleyen bilet istekleri iptal: benimkiler geri çekilir, partnerinkiler "şimdi değil"
  update ticket_redemptions r set status = 'WITHDRAWN', resolved_at = now() where r.requested_by = u and r.status = 'REQUESTED';
  update ticket_redemptions r set status = 'DECLINED', resolved_at = now() where r.partner_id = u and r.status = 'REQUESTED';
  update tickets t set status = 'AVAILABLE' where t.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = t.id and r.status = 'REQUESTED');
  -- kalan biletlerim kişisel arşive: bu çiftte kullanılamaz
  update tickets set status = 'ARCHIVED' where owner_id = u and status = 'AVAILABLE';
  update couple_rule_versions set status = 'REJECTED' where couple_id = c.id and status = 'PROPOSED';
  update shared_activities set status = 'CANCELLED' where couple_id = c.id and status in ('PROPOSED','ACCEPTED');
  update memberships set ended_at = now() where user_id = u and couple_id = c.id and ended_at is null;
  update couples set status = 'DISCONNECTED' where id = c.id;
  -- ayrılan kişi kendi (tek kişilik) alanında devam eder
  insert into couples (display_name, timezone) values ('Ben', c.timezone) returning id into v_new;
  insert into memberships (user_id, couple_id, role) values (u, v_new, 'FIRST');
  insert into audit_events (actor_id, event_type, object_id) values (u, 'COUPLE_DISCONNECTED', c.id);
  return get_me();
end $$;

create or replace function delete_account() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  if c.id is not null then
    update ticket_redemptions r set status = 'DECLINED', resolved_at = now() where r.partner_id = u and r.status = 'REQUESTED';
    update tickets t set status = 'AVAILABLE' where t.status = 'REQUESTED' and t.owner_id <> u and not exists (select 1 from ticket_redemptions r where r.ticket_id = t.id and r.status = 'REQUESTED');
    update couple_rule_versions set status = 'REJECTED' where couple_id = c.id and status = 'PROPOSED';
    update shared_activities set status = 'CANCELLED' where couple_id = c.id and status in ('PROPOSED','ACCEPTED');
    update memberships set ended_at = now() where user_id = u and ended_at is null;
    if bb_partner_of(u) is null then update couples set status = 'DISCONNECTED' where id = c.id; end if;
  end if;
  insert into audit_events (actor_id, event_type) values (u, 'ACCOUNT_DELETED');
  -- auth.users silinince app_users ve kişisel tablolar cascade ile gider; ortak kayıtlarda kimlik NULL olur
  delete from auth.users where id = u;
  return jsonb_build_object('ok', true);
end $$;

-- Tek üye kalan taraf da davet oluşturabilsin (rolünden bağımsız)
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
  insert into audit_events (actor_id, event_type, object_id) values (u, 'INVITE_CREATED', c.id);
  return jsonb_build_object('token', v_token, 'expiresAt', v_exp);
end $$;

-- =====================================================================
-- 8. İzinler
-- =====================================================================
grant execute on function get_plan(), save_next_week_plan(boolean, jsonb), rename_goal(uuid, text, text, text), pause_goal(uuid), unpause_goal(uuid),
  generate_recovery_codes(), recovery_codes_status(), list_sessions(), revoke_session(uuid), revoke_other_sessions(), export_my_data(boolean),
  disconnect_couple(), delete_account() to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
revoke execute on function bb_goal_json(goal_versions) from public, anon, authenticated;
select 'phase4 ok' as result;
