-- Kyron · 0007_paket1.sql · "Aylarca sürsün" paketi (4 Kasım 2026)
-- 1) Bilet kademeleri: Yeşil / Turuncu / Kırmızı (kullanıcının kendi sistemi)
-- 2) Seri Kalkanı: eksik günde seri sıfırlanmaz (dükkân eşyası, en fazla 2)
-- 3) Görev zincirleri: aynı görevi üst üste yapma sayacı + rozetler
-- 4) Takvim: ay görünümü ve günün detayı (get_calendar, get_day)
-- 5) Bilet isteğine not (hangi ödül)

-- =====================================================================
-- 1. Bilet kademeleri
-- =====================================================================
alter table tickets add column if not exists tier text not null default 'GREEN' check (tier in ('GREEN','ORANGE','RED'));
alter table ticket_redemptions add column if not exists note text;

-- Kademe: %10 kırmızı, %30 turuncu, %60 yeşil. Garanti: her 10. bilet kırmızı, her 4. bilet en az turuncu.
create or replace function bb_ticket_tier(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n int; r double precision := random();
begin
  select count(*) + 1 into n from tickets where owner_id = p_user;
  if n % 10 = 0 or r < 0.10 then return 'RED'; end if;
  if n % 4 = 0 or r < 0.40 then return 'ORANGE'; end if;
  return 'GREEN';
end $$;

create or replace function bb_add_shard(p_user uuid, p_source text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sh int; v_need int := coalesce(((select value from app_config where key = 'game')->>'shardsPerTicket')::int, 4); v_tier text;
begin
  insert into shard_log (source_key, user_id, source) values (p_key, p_user, p_source) on conflict do nothing;
  if not found then return; end if;
  update heroes set shards = shards + 1 where user_id = p_user returning shards into v_sh;
  if v_sh is null then return; end if;
  if v_sh >= v_need then
    update heroes set shards = shards - v_need where user_id = p_user;
    v_tier := bb_ticket_tier(p_user);
    insert into tickets (owner_id, awarded_week_start, rule_version, source, source_key, tier)
      values (p_user, bb_week_start(current_date), 3, 'SHARDS', 'shards:' || p_key, v_tier) on conflict (source_key) do nothing;
    perform bb_event(p_user, 'TICKET', jsonb_build_object('source', p_source, 'need', v_need, 'tier', v_tier));
  else
    perform bb_event(p_user, 'SHARD', jsonb_build_object('source', p_source, 'shards', v_sh, 'need', v_need));
  end if;
end $$;

create or replace function bb_redemption_json(r ticket_redemptions) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', r.id, 'ticketId', r.ticket_id, 'requestedBy', r.requested_by, 'partnerId', r.partner_id, 'status', r.status,
    'expiresAt', r.expires_at, 'resolvedAt', r.resolved_at, 'reversalRequestedBy', r.reversal_requested_by, 'reversedAt', r.reversed_at, 'createdAt', r.created_at,
    'note', r.note, 'tier', (select t.tier from tickets t where t.id = r.ticket_id))
$$;

create or replace function get_tickets() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  return jsonb_build_object(
    'serverTime', now(),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week', awarded_week_start, 'status', status, 'source', source, 'tier', tier, 'createdAt', created_at) order by created_at desc), '[]'::jsonb) from tickets where owner_id = u and status <> 'ARCHIVED'),
    'redemptions', (select coalesce(jsonb_agg(bb_redemption_json(r) order by r.created_at desc), '[]'::jsonb) from ticket_redemptions r where (r.requested_by = u or r.partner_id = u) and r.created_at > now() - interval '60 days'));
end $$;

drop function if exists request_ticket(uuid, uuid);
create or replace function request_ticket(p_ticket_id uuid, p_operation_id uuid, p_note text default null) returns jsonb
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
  insert into ticket_redemptions (ticket_id, requested_by, partner_id, expires_at, note)
    values (tk.id, u, v_partner, now() + interval '72 hours', nullif(left(btrim(coalesce(p_note, '')), 80), '')) returning * into r;
  update tickets set status = 'REQUESTED' where id = tk.id;
  perform bb_event(v_partner, 'TICKET_REQUEST', jsonb_build_object('tier', tk.tier, 'note', r.note), u);
  v_resp := bb_redemption_json(r);
  insert into idempotency_records (user_id, route, operation_id, request_hash, response) values (u, 'request_ticket', p_operation_id, md5(p_ticket_id::text), v_resp);
  return v_resp;
end $$;

-- =====================================================================
-- 2. Seri Kalkanı (dükkân eşyası, kind CHARM)
-- =====================================================================
do $$
declare cn text;
begin
  select conname into cn from pg_constraint where conrelid = 'shop_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if cn is not null then execute format('alter table shop_items drop constraint %I', cn); end if;
  alter table shop_items add constraint shop_items_kind_check check (kind in ('WEAPON','ARMOR','HEAD','CAPE','PET','POTION','CHARM'));
end $$;
insert into shop_items (key, name, kind, tier, min_level, price, effect, sort) values
  ('streak_shield','Seri Kalkanı','CHARM',0,3,500,0,70)
on conflict (key) do update set name = excluded.name, kind = excluded.kind, tier = excluded.tier, min_level = excluded.min_level, price = excluded.price, effect = excluded.effect, sort = excluded.sort;

create or replace function buy_item(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); s shop_items; h heroes; v_qty int;
begin
  select * into s from shop_items where key = p_key;
  if s.key is null then raise exception 'NOT_FOUND'; end if;
  select * into h from heroes where user_id = u for update;
  if bb_level(h.xp) < s.min_level then raise exception 'LEVEL_LOCKED'; end if;
  select coalesce(qty, 0) into v_qty from inventory where user_id = u and item_key = s.key;
  if s.kind not in ('POTION','CHARM') and coalesce(v_qty, 0) > 0 then raise exception 'ALREADY_OWNED'; end if;
  if s.kind = 'CHARM' and coalesce(v_qty, 0) >= 2 then raise exception 'MAX_HELD'; end if;
  if h.gold < s.price then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - s.price where user_id = u;
  insert into inventory (user_id, item_key, qty) values (u, s.key, 1) on conflict (user_id, item_key) do update set qty = inventory.qty + 1;
  insert into hero_log (user_id, kind, gold) values (u, 'BUY', -s.price);
  if s.kind in ('WEAPON','ARMOR') then
    update heroes set equipped = equipped || jsonb_build_object(lower(s.kind), s.tier) where user_id = u and coalesce((equipped->>lower(s.kind))::int, 0) < s.tier;
  elsif s.kind in ('HEAD','CAPE','PET') then
    update heroes set equipped = equipped || jsonb_build_object(lower(s.kind), s.key) where user_id = u;
  end if;
  perform bb_check_achievements(u);
  return get_game();
end $$;

-- =====================================================================
-- 3. Görev zincirleri
-- =====================================================================
create table if not exists quest_chains (
  user_id uuid not null references app_users(id) on delete cascade,
  code text not null,
  chain int not null default 0,
  best int not null default 0,
  last_date date not null,
  primary key (user_id, code)
);
alter table quest_chains enable row level security;

-- Gün kapanırken: yapıldıysa +1 (dünden devam), izin günüyse korunur, yoksa sıfır
create or replace function bb_chain_update(p_user uuid, p_code text, p_done boolean, p_izin boolean, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare r quest_chains; v_new int;
begin
  select * into r from quest_chains where user_id = p_user and code = p_code;
  if r.user_id is null then
    insert into quest_chains (user_id, code, chain, best, last_date) values (p_user, p_code, case when p_done then 1 else 0 end, case when p_done then 1 else 0 end, p_date);
    return;
  end if;
  if r.last_date >= p_date then return; end if; -- aynı gün iki kez işlenmesin
  if p_done then v_new := case when r.last_date >= p_date - 1 then r.chain + 1 else 1 end;
  elsif p_izin then v_new := r.chain;
  else v_new := 0; end if;
  update quest_chains set chain = v_new, best = greatest(best, v_new), last_date = p_date where user_id = p_user and code = p_code;
end $$;

-- Gün kapanışı: kalkan + zincirler eklendi (0005'teki sürümün üstüne)
create or replace function bb_close_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  hd hero_days; h heroes; v_missed int; v_total int; v_dmg int; v_lost_gold int; v_partner uuid; pd hero_days; c couples; b bosses; q record;
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
    -- Seri Kalkanı varsa harcanır, seri korunur
    update inventory set qty = qty - 1 where user_id = p_user and item_key = 'streak_shield' and qty > 0;
    if found and h.streak > 0 then
      insert into hero_log (user_id, kind) values (p_user, 'SHIELD');
      perform bb_event(p_user, 'STREAK_SAVED', jsonb_build_object('streak', h.streak, 'date', p_date));
    else
      if found then update inventory set qty = qty + 1 where user_id = p_user and item_key = 'streak_shield'; end if; -- seri zaten 0, kalkan geri
      update heroes set streak = 0 where user_id = p_user;
    end if;
  end if;
  for q in select code, done from quests where user_id = p_user and local_date = p_date and kind = 'DAILY' loop
    perform bb_chain_update(p_user, q.code, q.done, hd.izin, p_date);
  end loop;
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

-- Geçmiş günlerden zincirleri doldur
do $$
declare r record;
begin
  for r in select hd.user_id, hd.local_date, hd.izin, q.code, q.done
           from hero_days hd join quests q on q.user_id = hd.user_id and q.local_date = hd.local_date and q.kind = 'DAILY'
           where hd.closed order by hd.user_id, hd.local_date, q.code loop
    perform bb_chain_update(r.user_id, r.code, r.done, r.izin, r.local_date);
  end loop;
end $$;

-- Rozetler: zincir 30 ve 100
create or replace function bb_check_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_done int; v_lvl int; k text; v_new text[] := '{}'; c couples; v_boss int; v_wins int; v_words int; v_tog int; v_chain int;
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
  foreach k in array v_new loop
    insert into achievements (user_id, key) values (p_user, k) on conflict do nothing;
    if found then perform bb_event(p_user, 'ACHIEVEMENT', jsonb_build_object('key', k)); end if;
  end loop;
end $$;

-- =====================================================================
-- 4. Okuma: get_game'e zincirler, get_calendar, get_day
-- =====================================================================
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
    'day', (select jsonb_build_object('izin', izin, 'difficulty', difficulty) from hero_days where user_id = u and local_date = v_today),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title,
        'xp', xp, 'gold', gold, 'damage', damage, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = v_today),
    'chains', (select coalesce(jsonb_object_agg(code, jsonb_build_object('chain', case when last_date >= v_today - 1 then chain else 0 end, 'best', best)), '{}'::jsonb) from quest_chains where user_id = u),
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
    'incomingRequests', (select count(*) from ticket_redemptions where partner_id = u and status = 'REQUESTED' and expires_at > now()),
    'play', jsonb_build_object(
        'duels', (select count(*) from duels where opponent = u and status = 'OPEN' and expires_at > now()),
        'together', (select count(*) from together_log where couple_id = c.id and week_start = ws and status = 'PENDING' and proposed_by <> u),
        'word', coalesce(not w.finished, true) and v_partner is not null
                and (select count(*) from jsonb_array_elements(coalesce(w.guesses, '[]'::jsonb)) g where g->>'by' = u::text) < 3)
  );
end $$;

-- Bir kullanıcının bir aydaki günleri
create or replace function bb_calendar_days(p_user uuid, p_from date, p_to date, p_couple uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'd', hd.local_date, 'allDone', hd.all_done, 'izin', hd.izin, 'closed', hd.closed, 'hpLost', hd.hp_lost,
    'done', (select count(*) filter (where done) from quests q where q.user_id = hd.user_id and q.local_date = hd.local_date and q.kind = 'DAILY'),
    'total', (select count(*) from quests q where q.user_id = hd.user_id and q.local_date = hd.local_date and q.kind = 'DAILY'),
    'combo', exists (select 1 from couple_combos cc where cc.couple_id = p_couple and cc.local_date = hd.local_date)
  ) order by hd.local_date), '[]'::jsonb)
  from hero_days hd where hd.user_id = p_user and hd.local_date between p_from and p_to
$$;

create or replace function get_calendar(p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_from date; v_to date; v_today date;
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  v_today := bb_local_date(now(), c.timezone);
  v_from := date_trunc('month', p_month)::date;
  v_to := (v_from + interval '1 month' - interval '1 day')::date;
  return jsonb_build_object(
    'month', v_from, 'today', v_today,
    'me', bb_calendar_days(u, v_from, v_to, c.id),
    'partner', case when v_partner is null then '[]'::jsonb else bb_calendar_days(v_partner, v_from, v_to, c.id) end,
    'firstDay', (select min(local_date) from hero_days where user_id = u),
    'totals', jsonb_build_object(
      'fullDays', (select count(*) from hero_days where user_id = u and all_done and closed),
      'combos', (select count(*) from couple_combos where couple_id = c.id)));
end $$;

create or replace function get_day(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid := bb_partner_of(u);
begin
  return jsonb_build_object(
    'date', p_date,
    'me', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = p_date),
    'partner', case when v_partner is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = v_partner and local_date = p_date) end,
    'meDay', (select jsonb_build_object('izin', izin, 'allDone', all_done, 'hpLost', hp_lost) from hero_days where user_id = u and local_date = p_date),
    'partnerDay', case when v_partner is null then null else (select jsonb_build_object('izin', izin, 'allDone', all_done, 'hpLost', hp_lost) from hero_days where user_id = v_partner and local_date = p_date) end);
end $$;

-- =====================================================================
-- 5. Güvenlik
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_game(), create_hero(text, text, jsonb, int), update_hero(text, text, jsonb, boolean), complete_quest(uuid, boolean),
  set_izin(boolean), set_difficulty(int), buy_item(text), equip_item(text, text), use_potion(text), social_action(text, int), mark_events_seen(uuid[]),
  get_tickets(), request_ticket(uuid, uuid, text), respond_redemption(uuid, text), request_reversal(uuid),
  create_invite(), generate_recovery_codes(), recovery_codes_status(), revoke_other_sessions(), disconnect_couple(), delete_account(),
  get_games(), duel_create(text, int, int), duel_play(uuid, int), duel_cancel(uuid), word_guess(text), together_mark(text), together_cancel(text),
  get_calendar(date), get_day(date)
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'paket1 ok' as result, (select count(*) from shop_items) as items, (select count(*) from quest_chains) as chains;
