-- Kyron · 0014_es_gorevleri.sql · Eşin görevleri: bildirim + "eşin bugünü" özeti (5 Kasım 2026)
-- * Görev yapılınca (done false→true) eşe gidecek bir kayıt düşer; geri alınırsa (henüz gönderilmediyse) silinir.
-- * Push kuyruğu bunları eş başına tek bildirimde toplar: "Ayşe şu görevi tamamladı: …".
--   1 dk beklenir (yanlış dokunuş geri alınabilsin), 30 dk'dan eskiler sessizce düşer, gece 23:00-08:00 arası gönderilmez.
-- * Özel gün modundaki eşin özel görevleri adıyla gösterilmez ("bir görev"); gizli görevler hiç görünmez.
-- * Alıcı bildirimi kapatabilir: heroes.notify_partner.

alter table heroes add column if not exists notify_partner boolean not null default true;

create table if not exists partner_feed (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references app_users(id) on delete cascade,
  receiver uuid not null references app_users(id) on delete cascade,
  quest_id uuid not null references quests(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  pushed boolean not null default false
);
create index if not exists partner_feed_queue on partner_feed (pushed, created_at);
create index if not exists partner_feed_quest on partner_feed (quest_id);
alter table partner_feed enable row level security;

create or replace function bb_quest_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_partner uuid;
begin
  if new.done then
    if new.hidden or new.kind not in ('DAILY', 'SIDE') then return new; end if;
    v_partner := bb_partner_of(new.user_id);
    if v_partner is null then return new; end if;
    insert into partner_feed (actor, receiver, quest_id, title)
    values (new.user_id, v_partner, new.id, case when new.code like 'SP\_%' then null else new.title end);
  else
    delete from partner_feed where quest_id = new.id and not pushed;
  end if;
  return new;
end $$;
drop trigger if exists quests_feed on quests;
create trigger quests_feed after update of done on quests for each row when (old.done is distinct from new.done) execute function bb_quest_feed();

-- Gönderim kuyruğu: olay bildirimleri + akşam hatırlatması + eşin görevleri
create or replace function bb_push_queue() returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; r record; c couples; v_today date; v_hour int; v_left int; v_names text; v_n int; v_total int; v_done int;
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
    select count(*) into v_left from quests q where q.user_id = r.user_id and q.local_date = v_today and q.kind = 'DAILY' and not q.done and not q.hidden;
    if v_left = 0 then continue; end if;
    if (select izin from hero_days where user_id = r.user_id and local_date = v_today) then continue; end if;
    insert into push_log (user_id, local_date, kind) values (r.user_id, v_today, 'REMIND');
    out := out || jsonb_build_object('user', r.user_id, 'title', 'Kyron · ' || v_left || ' görev kaldı',
      'body', case when v_left = 1 then 'Bir görev daha, gün tamam!' else 'Canavar bekliyor, kahramanın seni çağırıyor.' end, 'tag', 'remind',
      'subs', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) from push_subs where user_id = r.user_id));
  end loop;
  -- 3) eşin görevleri
  update partner_feed set pushed = true where not pushed and created_at < now() - interval '30 minutes';
  for r in select f.receiver, f.actor, count(*) n, array_agg(f.title order by f.created_at) titles, max(au.display_name) aname
           from partner_feed f join app_users au on au.id = f.actor
           where not f.pushed and f.created_at <= now() - interval '1 minute'
           group by f.receiver, f.actor loop
    update partner_feed set pushed = true where receiver = r.receiver and actor = r.actor and not pushed and created_at <= now() - interval '1 minute';
    if not exists (select 1 from push_subs p where p.user_id = r.receiver) then continue; end if;
    if not coalesce((select notify_partner from heroes where user_id = r.receiver), true) then continue; end if;
    c := bb_couple_of(r.receiver);
    v_hour := extract(hour from (now() at time zone c.timezone))::int;
    if v_hour < 8 or v_hour >= 23 then continue; end if;
    v_today := bb_local_date(now(), c.timezone);
    select count(*), count(*) filter (where done) into v_total, v_done from quests
      where user_id = r.actor and local_date = v_today and kind = 'DAILY' and not hidden;
    select string_agg(coalesce(t, 'bir görev'), ', ' order by o) into v_names from (select t, o from unnest(r.titles) with ordinality x(t, o) order by o limit 3) s;
    if r.n > 3 then v_names := v_names || ' +' || (r.n - 3); end if;
    out := out || jsonb_build_object('user', r.receiver, 'title', 'Kyron',
      'body', case when r.n = 1 then r.aname || case when r.titles[1] is null then ' bir görev tamamladı' else ' şu görevi tamamladı: ' || v_names end
                   else r.aname || ' ' || r.n || ' görev tamamladı: ' || v_names end
              || case when v_total > 0 and v_done = v_total then ' · Gün tamam!' else '' end,
      'tag', 'partner', 'subs', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) from push_subs where user_id = r.receiver));
  end loop;
  return out;
end $$;

-- Eşin bugünü: yapılan görevler, 7 günlük çubuk, haftalık/toplam sayılar, bildirim tercihi
create or replace function get_partner_feed() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; p uuid; v_today date; ws date;
begin
  c := bb_couple_of(u);
  p := bb_partner_of(u);
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  if p is null then return jsonb_build_object('hasPartner', false, 'notify', coalesce((select notify_partner from heroes where user_id = u), true)); end if;
  perform bb_process_user(p);
  return jsonb_build_object(
    'hasPartner', true,
    'notify', coalesce((select notify_partner from heroes where user_id = u), true),
    'today', (select coalesce(jsonb_agg(jsonb_build_object('code', q.code, 'kind', q.kind,
                'title', case when q.code like 'SP\_%' then null else q.title end,
                'icon', case when q.code like 'SP\_%' then 'shield' else q.icon end, 'at', q.done_at) order by q.done_at), '[]'::jsonb)
              from quests q where q.user_id = p and q.local_date = v_today and q.done and not q.hidden),
    'week', (select jsonb_agg(jsonb_build_object('date', d,
                'done', (select count(*) from quests q where q.user_id = p and q.local_date = d and q.kind = 'DAILY' and q.done and not q.hidden),
                'total', (select count(*) from quests q where q.user_id = p and q.local_date = d and q.kind = 'DAILY' and not q.hidden)) order by d)
             from (select v_today - 6 + i as d from generate_series(0, 6) i) days),
    'weekDone', (select count(*) from quests q where q.user_id = p and q.local_date >= ws and q.done and not q.hidden),
    'totalDone', (select count(*) from quests q where q.user_id = p and q.done),
    'weekDamage', (select coalesce(sum(bh.damage), 0) from boss_hits bh join bosses b on b.id = bh.boss_id where b.couple_id = c.id and b.week_start = ws and bh.user_id = p),
    'badges', (select count(*) from achievements where user_id = p));
end $$;

create or replace function set_partner_notify(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  update heroes set notify_partner = coalesce(p_on, true) where user_id = u;
  return jsonb_build_object('notify', coalesce(p_on, true));
end $$;

-- Güvenlik
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

select 'es gorevleri ok' as result;
