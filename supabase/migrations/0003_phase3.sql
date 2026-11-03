-- Birlikte Büyüyoruz · 0003_phase3.sql · Aşama 3: bilet kullanım akışı, geri alma, çift kural önerileri, haftalık özet
-- Idempotent. 0001 ve 0002 uygulanmış olmalı.

alter table couple_rule_versions add column if not exists version_no int;
alter table ticket_redemptions add column if not exists reversal_approved_by uuid;

-- =====================================================================
-- 1. Haftaya etkin bilet kuralı (varsayılan + çiftin onaylı sürümü)
-- =====================================================================
create or replace function bb_rule_for_week(p_couple uuid, p_week date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare base jsonb := (select value->'ticket' from app_config where key = 'economy'); custom jsonb; v_no int;
begin
  select rule_json, version_no into custom, v_no from couple_rule_versions
    where couple_id = p_couple and status = 'ACTIVE' and effective_week_start <= p_week
    order by effective_week_start desc, created_at desc limit 1;
  if custom is null then return base || jsonb_build_object('versionNo', 1); end if;
  return base || custom || jsonb_build_object('versionNo', coalesce(v_no, 1));
end $$;

create or replace function bb_process_weeks(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c couples; v_tz text; v_join date; ws date; wk record; t jsonb;
  v_planned int; v_gross int; v_qd int; v_days int; v_eligible boolean;
begin
  c := bb_couple_of(p_user);
  if c.id is null then return; end if;
  v_tz := c.timezone;
  select bb_local_date(joined_at, v_tz) into v_join from memberships where user_id = p_user and ended_at is null;

  for wk in
    select bb_week_start(local_date) as week_start
    from daily_summaries where user_id = p_user
    group by bb_week_start(local_date)
    having count(*) filter (where state = 'FINALIZED') = 7
    order by 1
  loop
    ws := wk.week_start;
    if v_join >= ws then continue; end if;
    if exists (select 1 from weekly_results where user_id = p_user and week_start = ws) then continue; end if;
    t := bb_rule_for_week(c.id, ws);

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
      values (p_user, ws, (t->>'versionNo')::int, v_planned, v_gross, v_qd, v_eligible,
        jsonb_build_object('minPlanned', (t->>'minimumWeeklyPlannedXP')::int, 'minDays', (t->>'minimumQualifyingDays')::int,
                           'minWeeklyPercent', (t->>'minimumWeeklyWeightedRatioPercent')::int, 'minDailyPercent', (t->>'minimumDailyRatioPercent')::int))
      on conflict (user_id, week_start) do nothing;
    if v_eligible then
      insert into tickets (owner_id, awarded_week_start, rule_version)
        values (p_user, ws, (t->>'versionNo')::int) on conflict (owner_id, awarded_week_start) do nothing;
    end if;
  end loop;
end $$;

-- =====================================================================
-- 2. Bilet kullanım akışı (Şartname §10.3)
-- =====================================================================
create or replace function bb_redemption_json(r ticket_redemptions) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', r.id, 'ticketId', r.ticket_id, 'requestedBy', r.requested_by, 'partnerId', r.partner_id, 'status', r.status,
    'expiresAt', r.expires_at, 'resolvedAt', r.resolved_at, 'reversalRequestedBy', r.reversal_requested_by, 'reversedAt', r.reversed_at, 'createdAt', r.created_at)
$$;

create or replace function request_ticket(p_ticket_id uuid, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid; tk tickets; r ticket_redemptions; v_prev jsonb; v_resp jsonb;
  v_hours int := coalesce(((select value from app_config where key = 'economy')->'ticket'->>'requestExpiresHours')::int, 72);
begin
  select response into v_prev from idempotency_records where user_id = u and route = 'request_ticket' and operation_id = p_operation_id;
  if v_prev is not null then return v_prev; end if;
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  select * into tk from tickets where id = p_ticket_id and owner_id = u for update;  -- bilet satır kilidi
  if tk.id is null then raise exception 'NOT_FOUND'; end if;
  if tk.status <> 'AVAILABLE' then raise exception 'INVALID_STATE'; end if;
  insert into ticket_redemptions (ticket_id, requested_by, partner_id, expires_at)
    values (tk.id, u, v_partner, now() + make_interval(hours => v_hours)) returning * into r;  -- aktif istek tekilliği: kısmi unique index
  update tickets set status = 'REQUESTED' where id = tk.id;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'TICKET_REQUESTED', tk.id);
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
  if r.status <> 'REQUESTED' then
    return bb_redemption_json(r);  -- zaten sonuçlanmış: ikinci tüketim/iade yok, mevcut durum döner
  end if;
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
    else
      update ticket_redemptions set status = 'DECLINED', resolved_at = now() where id = r.id returning * into r;
      update tickets set status = 'AVAILABLE' where id = tk.id;
    end if;
  end if;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'REDEMPTION_' || r.status, r.id);
  return bb_redemption_json(r);
end $$;

-- Kullanım sonrası 24 saat içinde iki tarafın onayıyla bir kez geri alma.
create or replace function request_reversal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); r ticket_redemptions;
  v_hours int := coalesce(((select value from app_config where key = 'economy')->'ticket'->>'reversalWindowHours')::int, 24);
begin
  select * into r from ticket_redemptions where id = p_id and (requested_by = u or partner_id = u) for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'APPROVED' then raise exception 'INVALID_STATE'; end if;
  if r.resolved_at + make_interval(hours => v_hours) <= now() then raise exception 'REVERSAL_WINDOW_CLOSED'; end if;
  if r.reversal_requested_by is null then
    update ticket_redemptions set reversal_requested_by = u where id = r.id returning * into r;
  elsif r.reversal_requested_by <> u then
    update ticket_redemptions set status = 'REVERSED', reversed_at = now(), reversal_approved_by = u where id = r.id returning * into r;
    update tickets set status = 'AVAILABLE' where id = r.ticket_id;
  end if;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'REVERSAL_' || r.status, r.id);
  return bb_redemption_json(r);
end $$;

-- =====================================================================
-- 3. Çift kural önerileri (Şartname §10.1)
-- =====================================================================
create or replace function propose_rule(p_rule jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); cp couples; v_id uuid; clean jsonb;
  a int; b int; c int; d int;
begin
  if bb_partner_of(u) is null then raise exception 'NO_PARTNER'; end if;
  cp := bb_couple_of(u);
  a := (p_rule->>'minimumWeeklyPlannedXP')::int; b := (p_rule->>'minimumQualifyingDays')::int;
  c := (p_rule->>'minimumDailyRatioPercent')::int; d := (p_rule->>'minimumWeeklyWeightedRatioPercent')::int;
  if a is null or a < 100 or a > 1400 then raise exception 'RULE_RANGE_PLANNED'; end if;
  if b is null or b < 1 or b > 7 then raise exception 'RULE_RANGE_DAYS'; end if;
  if c is null or c < 1 or c > 100 then raise exception 'RULE_RANGE_DAILY'; end if;
  if d is null or d < 1 or d > 100 then raise exception 'RULE_RANGE_WEEKLY'; end if;
  clean := jsonb_build_object('minimumWeeklyPlannedXP', a, 'minimumQualifyingDays', b, 'minimumDailyRatioPercent', c, 'minimumWeeklyWeightedRatioPercent', d);
  -- çift başına tek açık öneri: eskisi ve onayları düşer
  update couple_rule_versions set status = 'SUPERSEDED' where couple_id = cp.id and status = 'PROPOSED';
  insert into couple_rule_versions (couple_id, effective_week_start, rule_json, proposed_by, status)
    values (cp.id, bb_week_start(bb_local_date(now(), cp.timezone)) + 7, clean, u, 'PROPOSED') returning id into v_id;
  return jsonb_build_object('id', v_id, 'rule', clean);
end $$;

create or replace function respond_rule(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); cp couples; rv couple_rule_versions; v_eff date; v_no int;
begin
  if p_action not in ('approve','reject','withdraw') then raise exception 'INVALID_ACTION'; end if;
  cp := bb_couple_of(u);
  select * into rv from couple_rule_versions where id = p_id and couple_id = cp.id for update;
  if rv.id is null then raise exception 'NOT_FOUND'; end if;
  if rv.status <> 'PROPOSED' then raise exception 'INVALID_STATE'; end if;
  if p_action = 'withdraw' then
    if rv.proposed_by <> u then raise exception 'FORBIDDEN'; end if;
    update couple_rule_versions set status = 'REJECTED' where id = rv.id;
  else
    if rv.proposed_by = u then raise exception 'FORBIDDEN'; end if;
    if p_action = 'reject' then
      update couple_rule_versions set status = 'REJECTED', approved_by = null where id = rv.id;
    else
      -- İki onay tamamlandığı andan sonraki ilk Pazartesi yürürlüğe girer; geçmiş haftalar yeniden değerlendirilmez
      v_eff := bb_week_start(bb_local_date(now(), cp.timezone)) + 7;
      select coalesce(max(version_no), 1) + 1 into v_no from couple_rule_versions where couple_id = cp.id and status = 'ACTIVE';
      update couple_rule_versions set status = 'SUPERSEDED' where couple_id = cp.id and status = 'ACTIVE' and effective_week_start = v_eff;
      update couple_rule_versions set status = 'ACTIVE', approved_by = u, effective_week_start = v_eff, version_no = v_no where id = rv.id;
    end if;
  end if;
  insert into audit_events (actor_id, event_type, object_id) values (u, 'RULE_' || p_action, rv.id);
  return jsonb_build_object('id', rv.id, 'status', (select status from couple_rule_versions where id = rv.id));
end $$;

-- =====================================================================
-- 4. Haftalık özet (Şartname §14.7)
-- =====================================================================
create or replace function get_weekly_summary(p_week_start date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; ws date; t jsonb;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  ws := coalesce(p_week_start, bb_week_start(v_today));
  ws := bb_week_start(ws);
  t := bb_rule_for_week(c.id, ws);
  return jsonb_build_object(
    'weekStart', ws, 'weekEnd', ws + 6, 'isCurrent', ws = bb_week_start(v_today), 'rule', t,
    'totals', (select jsonb_build_object('plannedXP', coalesce(sum(planned_xp), 0), 'grossXP', coalesce(sum(gross_xp), 0), 'netXP', coalesce(sum(net_xp), 0),
        'penaltyXP', coalesce(sum(penalty_xp), 0),
        'activeDays', count(*) filter (where planned_xp > 0 and gross_xp > 0),
        'excusedDays', count(*) filter (where excused_all),
        'qualifyingDays', count(*) filter (where planned_xp > 0 and tracked_instance_count >= (t->>'minimumTrackedInstancesPerQualifyingDay')::int and gross_xp * 100 >= planned_xp * (t->>'minimumDailyRatioPercent')::int),
        'finalizedDays', count(*) filter (where state = 'FINALIZED'), 'days', count(*))
      from daily_summaries where user_id = u and local_date between ws and ws + 6),
    'days', (select coalesce(jsonb_agg(bb_summary_json(s) order by s.local_date), '[]'::jsonb) from daily_summaries s where s.user_id = u and s.local_date between ws and ws + 6),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', q.cat, 'plannedXP', q.p, 'grossXP', q.g, 'completed', q.done, 'tracked', q.tr) order by q.cat), '[]'::jsonb) from (
        select i.snapshot->>'category' cat, sum((i.snapshot->>'max_xp')::int) p, sum(i.earned_xp) g, count(*) filter (where i.status = 'COMPLETED') done, count(*) tr
        from task_instances i join daily_summaries s on s.id = i.daily_summary_id
        where s.user_id = u and s.local_date between ws and ws + 6 and i.status <> 'EXCUSED' group by 1) q),
    'goals', (select coalesce(jsonb_agg(jsonb_build_object('name', q.nm, 'daysDone', q.done, 'daysTracked', q.tr, 'grossXP', q.g, 'plannedXP', q.p) order by q.p desc), '[]'::jsonb) from (
        select i.snapshot->>'name' nm, count(*) filter (where i.status = 'COMPLETED') done, count(*) tr, sum(i.earned_xp) g, sum((i.snapshot->>'max_xp')::int) p
        from task_instances i join daily_summaries s on s.id = i.daily_summary_id
        where s.user_id = u and s.local_date between ws and ws + 6 and i.status <> 'EXCUSED' group by 1) q),
    'result', (select jsonb_build_object('plannedXP', planned_xp, 'grossXP', gross_xp, 'qualifyingDays', qualifying_days, 'eligible', eligible, 'ruleVersion', rule_version, 'finalizedAt', finalized_at)
               from weekly_results where user_id = u and week_start = ws),
    'ticket', (select jsonb_build_object('id', id, 'status', status) from tickets where owner_id = u and awarded_week_start = ws)
  );
end $$;

-- =====================================================================
-- 5. Okuma RPC'leri: ödüller ve bekleyen işler
-- =====================================================================
create or replace function get_rewards() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; v_today date; ws date; t jsonb; v_partner uuid;
  v_planned int; v_gross int; v_qd int; v_join date;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  t := bb_rule_for_week(c.id, ws);
  v_partner := bb_partner_of(u);
  select bb_local_date(joined_at, c.timezone) into v_join from memberships where user_id = u and ended_at is null;
  select coalesce(sum(planned_xp), 0), coalesce(sum(gross_xp), 0),
         count(*) filter (where planned_xp > 0 and tracked_instance_count >= (t->>'minimumTrackedInstancesPerQualifyingDay')::int
                          and gross_xp * 100 >= planned_xp * (t->>'minimumDailyRatioPercent')::int)
    into v_planned, v_gross, v_qd
    from daily_summaries where user_id = u and local_date between ws and ws + 6;
  return jsonb_build_object(
    'weekStart', ws, 'today', v_today, 'serverTime', now(),
    'firstPartialWeek', v_join >= ws,
    'plannedXP', v_planned, 'grossXP', v_gross, 'qualifyingDays', v_qd,
    'rule', t,
    'nextWeekRule', bb_rule_for_week(c.id, ws + 7),
    'pendingRule', (select jsonb_build_object('id', id, 'rule', rule_json, 'proposedBy', proposed_by, 'createdAt', created_at) from couple_rule_versions where couple_id = c.id and status = 'PROPOSED' order by created_at desc limit 1),
    'finalizesAt', bb_local_ts(ws + 7, time '12:00', c.timezone),
    'hearts', (select hearts from wallet_balances where user_id = u),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week', awarded_week_start, 'status', status, 'createdAt', created_at) order by created_at desc), '[]'::jsonb) from tickets where owner_id = u),
    'partnerTickets', case when v_partner is not null and (select share_ticket_balance from sharing_settings where user_id = v_partner)
        then (select jsonb_build_object('available', count(*) filter (where status = 'AVAILABLE'), 'used', count(*) filter (where status = 'USED')) from tickets where owner_id = v_partner) else null end,
    'redemptions', (select coalesce(jsonb_agg(bb_redemption_json(r) || jsonb_build_object('ticketWeek', tk.awarded_week_start) order by r.created_at desc), '[]'::jsonb)
        from ticket_redemptions r join tickets tk on tk.id = r.ticket_id where (r.requested_by = u or r.partner_id = u) and r.created_at > now() - interval '90 days'),
    'lastWeek', (select jsonb_build_object('weekStart', week_start, 'plannedXP', planned_xp, 'grossXP', gross_xp, 'qualifyingDays', qualifying_days, 'eligible', eligible)
                 from weekly_results where user_id = u order by week_start desc limit 1),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'slot', slot, 'requiredLevel', required_level,
        'requiredGardenLevel', required_garden_level, 'price', price_hearts, 'assetKey', asset_key) order by sort_order), '[]'::jsonb) from reward_catalog where active),
    'inventory', (select coalesce(jsonb_agg(item_id), '[]'::jsonb) from user_inventory where user_id = u),
    'coupleInventory', (select coalesce(jsonb_agg(jsonb_build_object('itemId', item_id, 'placed', placed)), '[]'::jsonb) from couple_inventory where couple_id = c.id)
  );
end $$;

-- Bekleyen işler sayacı (sekme uyarısı için)
create or replace function bb_attention(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'redemptions', (select count(*) from ticket_redemptions where partner_id = p_user and status = 'REQUESTED' and expires_at > now()),
    'reversals', (select count(*) from ticket_redemptions where status = 'APPROVED' and reversal_requested_by is not null and reversal_requested_by <> p_user and (requested_by = p_user or partner_id = p_user)),
    'rules', (select count(*) from couple_rule_versions v join memberships m on m.couple_id = v.couple_id and m.user_id = p_user and m.ended_at is null where v.status = 'PROPOSED' and v.proposed_by <> p_user),
    'activities', (select count(*) from shared_activities a join memberships m on m.couple_id = a.couple_id and m.user_id = p_user and m.ended_at is null
                   where (a.status = 'PROPOSED' and a.creator_id <> p_user) or (a.status = 'ACCEPTED' and not exists (select 1 from activity_confirmations ac where ac.activity_id = a.id and ac.user_id = p_user)))
  )
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
    'attention', bb_attention(u),
    'config', (select value from app_config where key = 'economy'),
    'serverTime', now()
  );
end $$;

-- =====================================================================
-- 6. İzinler
-- =====================================================================
grant execute on function request_ticket(uuid, uuid), respond_redemption(uuid, text), request_reversal(uuid), propose_rule(jsonb), respond_rule(uuid, text), get_weekly_summary(date) to authenticated;
revoke execute on function bb_rule_for_week(uuid, date), bb_attention(uuid), bb_redemption_json(ticket_redemptions) from public, anon, authenticated;
drop policy if exists own_redemptions on ticket_redemptions;
create policy own_redemptions on ticket_redemptions for select to authenticated using (requested_by = auth.uid() or partner_id = auth.uid());
select 'phase3 ok' as result;
