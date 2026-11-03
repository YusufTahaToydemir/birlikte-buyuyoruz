-- Birlikte Büyüyoruz · 0002_phase2.sql · Aşama 2: beceriler, satın alma, giydirme, dekor, ortak etkinlikler
-- Idempotent. 0001 uygulanmış olmalı.

-- =====================================================================
-- 1. Beceri tanımları (Şartname §11)
-- =====================================================================
create table if not exists skill_catalog (
  id text primary key,
  name text not null,
  required_level int not null,
  description text not null,
  sort_order int not null
);
insert into skill_catalog (id, name, required_level, description, sort_order) values
  ('beside', 'Yanındayım', 2, 'Karakter el sallar: “Bugün de yanındayım.”', 1),
  ('flower', 'Küçük Çiçek', 4, 'Partnerin sahnesinde bir çiçek belirir.', 2),
  ('break', 'Sıcak Bir Mola', 7, '“Birlikte kısa bir mola verelim mi?” kartı.', 3),
  ('note', 'Kalpten Not', 10, 'En çok 280 karakterlik özel mesaj.', 4),
  ('picnic', 'Piknik Daveti', 14, 'Kabul / başka zaman yanıtlı ortak etkinlik önerisi.', 5),
  ('starry', 'Yıldızlı Akşam', 20, 'İki karakterli kısa gece sahnesi.', 6)
on conflict (id) do nothing;
alter table skill_catalog enable row level security;
drop policy if exists skills_read on skill_catalog;
create policy skills_read on skill_catalog for select to authenticated using (true);

-- =====================================================================
-- 2. Etkin giydirme: seviye düşerse kostüm başlangıca döner (Şartname §8)
-- =====================================================================
create or replace function bb_effective_equipped(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e jsonb; v_level int; v_req int; k text;
begin
  select coalesce(equipped_items, '{}'::jsonb) into e from profiles where user_id = p_user;
  v_level := bb_level_for_xp(bb_total_xp(p_user));
  if e ? 'outfit' then
    select required_level into v_req from reward_catalog where id = e->>'outfit';
    if v_req is null or v_req > v_level then e := e - 'outfit'; end if;
  end if;
  for k in select * from jsonb_object_keys(e) loop
    if k <> 'outfit' and not exists (select 1 from user_inventory ui join reward_catalog rc on rc.id = ui.item_id
        where ui.user_id = p_user and ui.item_id = e->>k and rc.required_level <= v_level) then
      e := e - k;
    end if;
  end loop;
  return e;
end $$;

-- =====================================================================
-- 3. Giydirme ve satın alma (Şartname §9)
-- =====================================================================
create or replace function equip_item(p_slot text, p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c reward_catalog; v_level int; e jsonb;
begin
  if p_slot not in ('outfit','head','hand','effect') then raise exception 'INVALID_SLOT'; end if;
  select coalesce(equipped_items, '{}'::jsonb) into e from profiles where user_id = u for update;
  if p_item_id is null then
    update profiles set equipped_items = e - p_slot, updated_at = now() where user_id = u;
    return get_me();
  end if;
  select * into c from reward_catalog where id = p_item_id and active;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if c.slot <> p_slot then raise exception 'SLOT_MISMATCH'; end if;
  v_level := bb_level_for_xp(bb_total_xp(u));
  if c.required_level > v_level then raise exception 'LEVEL_LOCKED'; end if;
  if c.kind <> 'OUTFIT' and not exists (select 1 from user_inventory where user_id = u and item_id = c.id) then raise exception 'NOT_OWNED'; end if;
  update profiles set equipped_items = e || jsonb_build_object(p_slot, c.id), updated_at = now() where user_id = u;
  return get_me();
end $$;

create or replace function purchase_item(p_item_id text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c reward_catalog; cp couples; w wallet_balances; v_prev jsonb; v_resp jsonb;
  v_level int; v_garden bigint; v_garden_level int := 1; v_levels jsonb; i int; v_inserted int;
begin
  select response into v_prev from idempotency_records where user_id = u and route = 'purchase_item' and operation_id = p_operation_id;
  if v_prev is not null then return v_prev; end if;
  select * into c from reward_catalog where id = p_item_id and active;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if c.kind = 'OUTFIT' then raise exception 'OUTFIT_IS_FREE'; end if;
  cp := bb_couple_of(u);
  select * into w from wallet_balances where user_id = u for update;  -- cüzdan kilidi

  if c.kind = 'DECOR' then
    v_levels := (select value->'gardenLevels' from app_config where key = 'economy');
    select coalesce(sum(net_xp), 0) into v_garden from daily_summaries s join memberships m on m.user_id = s.user_id where m.couple_id = cp.id and s.state = 'FINALIZED';
    for i in 0 .. jsonb_array_length(v_levels) - 1 loop
      if v_garden >= (v_levels->>i)::bigint then v_garden_level := i + 1; end if;
    end loop;
    if c.required_garden_level > v_garden_level then raise exception 'GARDEN_LOCKED'; end if;
    if exists (select 1 from couple_inventory where couple_id = cp.id and item_id = c.id) then raise exception 'ALREADY_OWNED'; end if;
    if w.hearts < c.price_hearts then raise exception 'INSUFFICIENT_HEARTS'; end if;
    insert into couple_inventory (couple_id, item_id, purchased_by) values (cp.id, c.id, u) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then raise exception 'ALREADY_OWNED'; end if;  -- eşzamanlı yarışta ikinci istek ücret ödemez
  else
    v_level := bb_level_for_xp(bb_total_xp(u));
    if c.required_level > v_level then raise exception 'LEVEL_LOCKED'; end if;
    if exists (select 1 from user_inventory where user_id = u and item_id = c.id) then raise exception 'ALREADY_OWNED'; end if;
    if w.hearts < c.price_hearts then raise exception 'INSUFFICIENT_HEARTS'; end if;
    insert into user_inventory (user_id, item_id, source_key) values (u, c.id, 'purchase:' || u || ':' || c.id) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then raise exception 'ALREADY_OWNED'; end if;
  end if;

  if c.price_hearts > 0 then
    insert into heart_ledger (user_id, delta, source_key, source_type) values (u, -c.price_hearts, 'purchase:' || u || ':' || c.id, 'PURCHASE');
    update wallet_balances set hearts = hearts - c.price_hearts, updated_at = now() where user_id = u;
  end if;
  insert into audit_events (actor_id, event_type) values (u, 'PURCHASE:' || c.id);
  v_resp := jsonb_build_object('itemId', c.id, 'hearts', (select hearts from wallet_balances where user_id = u), 'serverTime', now());
  insert into idempotency_records (user_id, route, operation_id, request_hash, response) values (u, 'purchase_item', p_operation_id, md5(p_item_id), v_resp);
  return v_resp;
end $$;

create or replace function toggle_decor(p_item_id text, p_placed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); cp couples;
begin
  cp := bb_couple_of(u);
  update couple_inventory set placed = p_placed where couple_id = cp.id and item_id = p_item_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into audit_events (actor_id, event_type) values (u, 'DECOR_' || case when p_placed then 'PLACED:' else 'REMOVED:' end || p_item_id);
end $$;

-- =====================================================================
-- 4. Romantik beceriler (Şartname §11)
-- =====================================================================
create or replace function use_skill(p_skill_id text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); v_partner uuid; sk skill_catalog; cp couples; v_today date; v_level int; v_note text;
  cfg jsonb := (select value->'skills' from app_config where key = 'economy'); v_id uuid; v_payload jsonb := '{}'::jsonb; v_act uuid;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  select * into sk from skill_catalog where id = p_skill_id;
  if sk.id is null then raise exception 'NOT_FOUND'; end if;
  v_level := bb_level_for_xp(bb_total_xp(u));
  if sk.required_level > v_level then raise exception 'LEVEL_LOCKED'; end if;
  cp := bb_couple_of(u); v_today := bb_local_date(now(), cp.timezone);
  perform 1 from app_users where id = u for update;  -- günlük sayım için kullanıcı satırı kilidi
  if (select count(*) from skill_uses where sender_id = u and local_date = v_today and skill_id = sk.id) >= coalesce((cfg->>'maxPerSkillPerDay')::int, 1) then raise exception 'SKILL_DAILY_LIMIT'; end if;
  if (select count(*) from skill_uses where sender_id = u and local_date = v_today) >= coalesce((cfg->>'maxTotalPerDay')::int, 3) then raise exception 'SKILL_TOTAL_LIMIT'; end if;

  if sk.id = 'note' then
    v_note := regexp_replace(coalesce(p_payload->>'text', ''), '<[^>]*>', '', 'g');
    v_note := trim(v_note);
    if char_length(v_note) = 0 then raise exception 'INVALID_VALUE'; end if;
    if char_length(v_note) > 280 then raise exception 'NOTE_TOO_LONG'; end if;
    v_payload := jsonb_build_object('text', v_note);
  elsif sk.id = 'picnic' then
    if (p_payload->>'date') is null then raise exception 'INVALID_VALUE'; end if;
    insert into shared_activities (couple_id, creator_id, type, title, proposed_date, proposed_time, status)
      values (cp.id, u, 'PICNIC', 'Piknik', (p_payload->>'date')::date, nullif(p_payload->>'time', '')::time, 'PROPOSED') returning id into v_act;
    v_payload := jsonb_build_object('activityId', v_act, 'date', p_payload->>'date');
  end if;

  insert into skill_uses (sender_id, recipient_id, skill_id, local_date, payload) values (u, v_partner, sk.id, v_today, v_payload) returning id into v_id;
  return jsonb_build_object('id', v_id, 'skillId', sk.id, 'serverTime', now());
end $$;

-- =====================================================================
-- 5. Ortak etkinlikler (Şartname §12)
-- =====================================================================
create or replace function propose_activity(p_type text, p_title text, p_date date, p_time time default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); cp couples; v_id uuid; v_title text;
begin
  if bb_partner_of(u) is null then raise exception 'NO_PARTNER'; end if;
  if p_type not in ('WALK','READING','ENGLISH','TEA','DISCUSS','PICNIC','CUSTOM') then raise exception 'INVALID_VALUE'; end if;
  v_title := left(trim(regexp_replace(coalesce(p_title, ''), '<[^>]*>', '', 'g')), 60);
  if char_length(v_title) = 0 then raise exception 'INVALID_VALUE'; end if;
  if p_date is null then raise exception 'INVALID_VALUE'; end if;
  cp := bb_couple_of(u);
  insert into shared_activities (couple_id, creator_id, type, title, proposed_date, proposed_time) values (cp.id, u, p_type, v_title, p_date, p_time) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function respond_activity(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); a shared_activities; cp couples;
begin
  cp := bb_couple_of(u);
  select * into a from shared_activities where id = p_id and couple_id = cp.id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if p_action = 'cancel' then
    if a.creator_id <> u then raise exception 'FORBIDDEN'; end if;
    if a.status not in ('PROPOSED','ACCEPTED') then raise exception 'INVALID_STATE'; end if;
    update shared_activities set status = 'CANCELLED' where id = a.id;
  elsif p_action in ('accept','later') then
    if a.creator_id = u then raise exception 'FORBIDDEN'; end if;
    if a.status <> 'PROPOSED' then raise exception 'INVALID_STATE'; end if;
    update shared_activities set status = case when p_action = 'accept' then 'ACCEPTED' else 'DECLINED' end where id = a.id;
  else
    raise exception 'INVALID_ACTION';
  end if;
  return jsonb_build_object('id', a.id, 'status', (select status from shared_activities where id = a.id));
end $$;

create or replace function confirm_activity(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); a shared_activities; cp couples; n int; m record; ws date;
  v_h int := coalesce(((select value from app_config where key = 'economy')->>'sharedActivityHeartsPerWeek')::int, 5);
begin
  cp := bb_couple_of(u);
  select * into a from shared_activities where id = p_id and couple_id = cp.id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status not in ('ACCEPTED','PROPOSED') then raise exception 'INVALID_STATE'; end if;
  if a.status = 'PROPOSED' and a.creator_id = u then raise exception 'NOT_ACCEPTED_YET'; end if;
  insert into activity_confirmations (activity_id, user_id) values (a.id, u) on conflict do nothing;
  select count(*) into n from activity_confirmations where activity_id = a.id;
  if a.first_confirmed_at is null then update shared_activities set first_confirmed_at = now(), status = 'ACCEPTED' where id = a.id; end if;
  if n >= 2 then
    update shared_activities set status = 'COMPLETED', finalized_at = now() where id = a.id;
    ws := bb_week_start(bb_local_date(now(), cp.timezone));
    -- Haftanın ilk doğrulanmış ortak etkinliği: kişi başına 5 kalp, haftada bir kez (DB tekilliği)
    for m in select user_id from memberships where couple_id = cp.id and ended_at is null loop
      insert into heart_ledger (user_id, delta, source_key, source_type, reference_id)
        values (m.user_id, v_h, 'activity:' || m.user_id || ':' || ws, 'SHARED_ACTIVITY', a.id) on conflict (source_key) do nothing;
      update wallet_balances set hearts = (select coalesce(sum(delta), 0) from heart_ledger where user_id = m.user_id), updated_at = now() where user_id = m.user_id;
    end loop;
  end if;
  return jsonb_build_object('id', a.id, 'status', (select status from shared_activities where id = a.id), 'confirmations', n);
end $$;

create or replace function hide_activity(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); cp couples;
begin
  cp := bb_couple_of(u);
  update shared_activities set hidden_by = array_append(hidden_by, u) where id = p_id and couple_id = cp.id and not (u = any(hidden_by));
end $$;

-- 48 saat içinde ikinci onay gelmezse UNCONFIRMED (cron)
create or replace function bb_expire_activities() returns void
language sql security definer set search_path = public as $$
  update shared_activities set status = 'UNCONFIRMED'
  where status = 'ACCEPTED' and first_confirmed_at is not null and first_confirmed_at < now() - interval '48 hours';
$$;

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
  perform bb_expire_activities();
  update ticket_redemptions r set status = 'EXPIRED', resolved_at = now() where r.status = 'REQUESTED' and r.expires_at <= now();
  update tickets tk set status = 'AVAILABLE' where tk.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = tk.id and r.status = 'REQUESTED');
  delete from idempotency_records where expires_at < now();
  return n;
end $$;
revoke all on function bb_run_jobs() from public, anon, authenticated;

-- =====================================================================
-- 6. Okuma RPC'leri güncellemesi: etkin giydirme, dekor, beceriler
-- =====================================================================
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
    'profile', jsonb_build_object('avatar', p.avatar_config, 'equipped', bb_effective_equipped(u), 'motion', p.motion_preference, 'onboarded', p.onboarded),
    'sharing', jsonb_build_object('dailyTotal', sh.share_daily_total, 'categories', sh.share_categories, 'hearts', sh.share_hearts, 'ticketBalance', sh.share_ticket_balance),
    'couple', jsonb_build_object('id', c.id, 'timezone', c.timezone, 'status', c.status, 'hasPartner', v_partner is not null, 'pendingInvite', v_invite),
    'totals', bb_user_totals(u),
    'hearts', (select hearts from wallet_balances where user_id = u),
    'inventory', (select coalesce(jsonb_agg(item_id), '[]'::jsonb) from user_inventory where user_id = u),
    'tickets', (select jsonb_build_object(
        'available', count(*) filter (where status = 'AVAILABLE'),
        'requested', count(*) filter (where status = 'REQUESTED'),
        'used', count(*) filter (where status = 'USED')) from tickets where owner_id = u),
    'config', (select value from app_config where key = 'economy'),
    'serverTime', now()
  );
end $$;

create or replace function get_couple() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; v_partner uuid; pu app_users; pp profiles; psh sharing_settings;
  v_today date; ps daily_summaries; partner_json jsonb; v_garden bigint; v_levels jsonb; v_garden_level int := 1; i int; v_level int;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  v_partner := bb_partner_of(u);
  v_level := bb_level_for_xp(bb_total_xp(u));
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
      'id', v_partner, 'displayName', pu.display_name, 'avatar', pp.avatar_config, 'equipped', bb_effective_equipped(v_partner),
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
    'serverTime', now(), 'today', v_today, 'myLevel', v_level,
    'couple', jsonb_build_object('id', c.id, 'name', c.display_name, 'status', c.status, 'gardenXP', v_garden, 'gardenLevel', v_garden_level, 'gardenLevels', v_levels),
    'partner', partner_json,
    'decor', (select coalesce(jsonb_agg(jsonb_build_object('itemId', ci.item_id, 'placed', ci.placed, 'name', rc.name, 'assetKey', rc.asset_key) order by rc.sort_order), '[]'::jsonb)
              from couple_inventory ci join reward_catalog rc on rc.id = ci.item_id where ci.couple_id = c.id),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'requiredLevel', required_level, 'description', description) order by sort_order), '[]'::jsonb) from skill_catalog),
    'memories', (select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
        select jsonb_build_object('type', 'LEVEL', 'userId', lc.user_id, 'name', au.display_name, 'level', lc.level, 'at', lc.seen_at) x
          from level_celebrations lc join app_users au on au.id = lc.user_id join memberships m on m.user_id = lc.user_id and m.couple_id = c.id
        union all
        select jsonb_build_object('type', 'ACTIVITY', 'title', sa.title, 'at', sa.finalized_at) from shared_activities sa where sa.couple_id = c.id and sa.status = 'COMPLETED'
        union all
        select jsonb_build_object('type', 'DECOR', 'itemId', ci.item_id, 'name', rc.name, 'at', ci.acquired_at) from couple_inventory ci join reward_catalog rc on rc.id = ci.item_id where ci.couple_id = c.id
      ) q),
    'skillsReceived', (select coalesce(jsonb_agg(jsonb_build_object('id', su.id, 'skillId', su.skill_id, 'payload', su.payload, 'at', su.sent_at, 'from', au.display_name) order by su.sent_at desc), '[]'::jsonb)
        from skill_uses su join app_users au on au.id = su.sender_id where su.recipient_id = u and su.local_date >= v_today - 1),
    'skillsSentToday', (select coalesce(jsonb_agg(skill_id), '[]'::jsonb) from skill_uses where sender_id = u and local_date = v_today),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'creatorId', a.creator_id, 'type', a.type, 'title', a.title, 'date', a.proposed_date, 'time', a.proposed_time,
        'status', a.status, 'confirmedBy', (select coalesce(jsonb_agg(user_id), '[]'::jsonb) from activity_confirmations ac where ac.activity_id = a.id),
        'firstConfirmedAt', a.first_confirmed_at, 'createdAt', a.created_at) order by a.created_at desc), '[]'::jsonb)
        from shared_activities a where a.couple_id = c.id and not (u = any(a.hidden_by)) and a.created_at > now() - interval '60 days')
  );
end $$;

-- =====================================================================
-- 7. İzinler
-- =====================================================================
grant execute on function equip_item(text, text), purchase_item(text, uuid), toggle_decor(text, boolean), use_skill(text, jsonb),
  propose_activity(text, text, date, time), respond_activity(uuid, text), confirm_activity(uuid), hide_activity(uuid) to authenticated;
revoke execute on function bb_expire_activities(), bb_effective_equipped(uuid) from public, anon, authenticated;
drop policy if exists own_inventory on user_inventory;
create policy own_inventory on user_inventory for select to authenticated using (user_id = auth.uid());
