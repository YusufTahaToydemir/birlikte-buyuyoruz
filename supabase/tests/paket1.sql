-- 0007 testleri: bilet kademeleri, Seri Kalkanı, görev zincirleri, takvim, bilet notu, yetkiler.
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; q record; res text := ''; i int; v_today date; t4 text; t8 text; t10 text; v_qty int; v_n int; tk uuid;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T7-KEY'), 'gametest7');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g7_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g7_a","display_name":"A","setup_key":"T7-KEY"}', now(), now());
  select id into a from app_users where username = 'g7_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T7-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g7_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g7_b","display_name":"B","invite_token":"T7-INV"}', now(), now());
  select id into b from app_users where username = 'g7_b';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 2);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'WARRIOR', '{"gender":"F"}', 2);
  v_today := (g->>'today')::date;

  -- 1) Bilet kademeleri: 40 parça = 10 bilet; 4. ve 8. en az turuncu, 10. kırmızı
  for i in 1..40 loop perform bb_add_shard(a, 'TEST', 'k' || i); end loop;
  select count(*) into v_n from tickets where owner_id = a;
  if v_n <> 10 then raise exception 'bilet sayısı %', v_n; end if;
  select tier into t4 from (select tier, row_number() over (order by created_at, id) rn from tickets where owner_id = a) x where rn = 4;
  select tier into t8 from (select tier, row_number() over (order by created_at, id) rn from tickets where owner_id = a) x where rn = 8;
  select tier into t10 from (select tier, row_number() over (order by created_at, id) rn from tickets where owner_id = a) x where rn = 10;
  if t4 not in ('ORANGE','RED') or t8 not in ('ORANGE','RED') or t10 <> 'RED' then raise exception 'garanti % % %', t4, t8, t10; end if;
  if exists (select 1 from tickets where owner_id = a and tier not in ('GREEN','ORANGE','RED')) then raise exception 'kademe'; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'TICKET' and data->>'tier' = 'RED') then raise exception 'kırmızı olay'; end if;
  res := res || E'\nbilet · 40 parça = 10 bilet; 4. ve 8. en az turuncu, 10. kırmızı ✓';

  -- Bilet notu + eşe giden olay
  select id into tk from tickets where owner_id = a and status = 'AVAILABLE' order by created_at limit 1;
  r := request_ticket(tk, gen_random_uuid(), '  Masaj  ');
  if r->>'note' <> 'Masaj' or r->>'tier' is null then raise exception 'not %', r; end if;
  if not exists (select 1 from hero_events where user_id = b and kind = 'TICKET_REQUEST' and data->>'note' = 'Masaj') then raise exception 'not olayı'; end if;
  r := get_tickets();
  if (select count(*) from jsonb_array_elements(r->'tickets') t where t->>'tier' is null) > 0 then raise exception 'liste kademe'; end if;
  res := res || E'\nbilet notu · "Masaj" eşe olayla gidiyor, listede kademe var ✓';

  -- 2) Seri Kalkanı: en fazla 2, eksik günde seriyi korur
  update heroes set xp = bb_level_start(3), gold = 5000, streak = 5 where user_id = a;
  g := buy_item('streak_shield'); g := buy_item('streak_shield');
  begin g := buy_item('streak_shield'); raise exception 'üçüncü kalkan alındı';
  exception when others then if sqlerrm <> 'MAX_HELD' then raise; end if; end;
  if (g->'inventory'->>'streak_shield')::int <> 2 then raise exception 'kalkan sayısı'; end if;
  -- geçmiş günler: -4 tam, -3 tam (zincir 2), -2 sadece WAKE (kalkan), -1 izin
  perform bb_generate_day(a, v_today - 4); update quests set done = true where user_id = a and local_date = v_today - 4;
  perform bb_generate_day(a, v_today - 3); update quests set done = true where user_id = a and local_date = v_today - 3;
  perform bb_generate_day(a, v_today - 2); update quests set done = true where user_id = a and local_date = v_today - 2 and code = 'WAKE';
  perform bb_generate_day(a, v_today - 1); update hero_days set izin = true where user_id = a and local_date = v_today - 1;
  perform bb_close_day(a, v_today - 4); perform bb_close_day(a, v_today - 3);
  if (select streak from heroes where user_id = a) <> 7 then raise exception 'seri +2'; end if;
  if (select chain from quest_chains where user_id = a and code = 'QURAN') <> 2 then raise exception 'zincir 2'; end if;
  perform bb_close_day(a, v_today - 2);
  if (select streak from heroes where user_id = a) <> 7 then raise exception 'kalkan seriyi korumadı'; end if;
  if (select qty from inventory where user_id = a and item_key = 'streak_shield') <> 1 then raise exception 'kalkan harcanmadı'; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'STREAK_SAVED') then raise exception 'kalkan olayı'; end if;
  if (select chain from quest_chains where user_id = a and code = 'QURAN') <> 0 then raise exception 'zincir kırılmadı'; end if;
  if (select chain from quest_chains where user_id = a and code = 'WAKE') <> 3 then raise exception 'WAKE zincir 3'; end if;
  if (select hp from heroes where user_id = a) >= bb_max_hp(3) then raise exception 'can yine de düşmeli'; end if;
  perform bb_close_day(a, v_today - 1);
  if (select streak from heroes where user_id = a) <> 7 or (select qty from inventory where user_id = a and item_key = 'streak_shield') <> 1 then raise exception 'izin günü'; end if;
  if (select chain from quest_chains where user_id = a and code = 'WAKE') <> 3 or (select last_date from quest_chains where user_id = a and code = 'WAKE') <> v_today - 1 then raise exception 'izin zinciri korumadı'; end if;
  res := res || E'\nkalkan · 3. alınamaz; eksik günde seri 7 kaldı, kalkan 1'e düştü, can düştü; izin günü zinciri korudu ✓';

  -- 3) get_game zincirleri: WAKE 3 (dünden devam), QURAN 0; bugün WAKE yapınca istemci 4 gösterir
  g := get_game();
  if (g->'chains'->'WAKE'->>'chain')::int <> 3 or (g->'chains'->'QURAN'->>'chain')::int <> 0 or (g->'chains'->'QURAN'->>'best')::int <> 2 then raise exception 'chains %', g->'chains'; end if;
  res := res || E'\nzincir · get_game: WAKE 3, QURAN 0 (en iyi 2) ✓';

  -- 4) Takvim ve gün detayı
  r := get_calendar(v_today);
  if jsonb_array_length(r->'me') < 5 then raise exception 'takvim gün sayısı %', jsonb_array_length(r->'me'); end if;
  if (select count(*) from jsonb_array_elements(r->'me') d where (d->>'allDone')::boolean) <> 2 then raise exception 'tam gün sayısı'; end if;
  if (select count(*) from jsonb_array_elements(r->'me') d where (d->>'izin')::boolean) <> 1 then raise exception 'izin günü sayısı'; end if;
  if (r->'totals'->>'fullDays')::int <> 2 then raise exception 'toplam'; end if;
  r := get_day(v_today - 2);
  if (select count(*) from jsonb_array_elements(r->'me') q where (q->>'done')::boolean) <> 1 or (r->'meDay'->>'allDone')::boolean then raise exception 'gün detayı'; end if;
  if jsonb_typeof(r->'partner') <> 'array' then raise exception 'eş listesi'; end if;
  res := res || E'\ntakvim · 2 tam gün, 1 izin, gün detayında 1 görev ✓';

  -- 5) Yetkiler
  if not has_function_privilege('authenticated', 'get_calendar(date)', 'execute') or not has_function_privilege('authenticated', 'get_day(date)', 'execute')
     or not has_function_privilege('authenticated', 'request_ticket(uuid, uuid, text)', 'execute') then raise exception 'yetki eksik'; end if;
  if has_function_privilege('authenticated', 'bb_ticket_tier(uuid)', 'execute') or has_function_privilege('authenticated', 'bb_chain_update(uuid, text, boolean, boolean, date)', 'execute')
     or has_table_privilege('authenticated', 'quest_chains', 'select') then raise exception 'fazla yetki'; end if;
  res := res || E'\nyetki · yalnızca RPC listesi ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
