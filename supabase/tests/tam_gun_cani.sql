-- 0019 testleri: can yalnızca eksiksiz günün kapanışında yenilenir. SQL Editor'de çalıştır; sonunda HER ŞEYİ GERİ ALIR.
do $$
declare a uuid; cp uuid; g jsonb; res text := ''; v_today date; v_hp int;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T19-KEY'), 'gametest19');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g19_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g19_a","display_name":"Ayşe","setup_key":"T19-KEY"}', now(), now());
  select id into a from app_users where username = 'g19_a';
  select couple_id into cp from memberships where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'HEALER', '{"gender":"F"}', 1);
  v_today := (g->>'today')::date;

  -- 1) Yeni gün üretimi can vermez
  update heroes set hp = 50 where user_id = a;
  perform bb_generate_day(a, v_today + 1);
  if (select hp from heroes where user_id = a) <> 50 then raise exception 'yeni gün can verdi: %', (select hp from heroes where user_id = a); end if;
  res := res || E'\nyeni gün · can eklemesi yok ✓';

  -- 2) Eksiksiz gün kapanınca +10 (Mutfak 1 → +12)
  update quests set done = true where user_id = a and local_date = v_today;
  perform bb_close_day(a, v_today);
  if not (select all_done from hero_days where user_id = a and local_date = v_today) then raise exception 'tam gün sayılmadı'; end if;
  if (select hp from heroes where user_id = a) <> 60 then raise exception 'tam gün canı %', (select hp from heroes where user_id = a); end if;
  insert into castle_parts (couple_id, key, level) values (cp, 'kitchen', 1);
  update hero_days set closed = false where user_id = a and local_date = v_today;
  perform bb_close_day(a, v_today);
  if (select hp from heroes where user_id = a) <> 72 then raise exception 'mutfak canı %', (select hp from heroes where user_id = a); end if;
  res := res || E'\ntam gün · kapanışta +10, Mutfak 1 ile +12 ✓';

  -- 3) Eksik gün: hasar alır, can yenilenmez
  update heroes set hp = 50 where user_id = a;
  perform bb_close_day(a, v_today + 1);
  v_hp := (select hp from heroes where user_id = a);
  if v_hp <> 50 - (select hp_lost from hero_days where user_id = a and local_date = v_today + 1) or v_hp >= 50 then raise exception 'eksik gün %', v_hp; end if;
  res := res || E'\neksik gün · yalnızca hasar (' || (50 - v_hp) || '), can yok ✓';

  -- 4) Zorluk değişimi canı düşürmez
  update heroes set hp = 40 where user_id = a;
  g := set_difficulty(2);
  if (select hp from heroes where user_id = a) <> 40 then raise exception 'zorluk canı %', (select hp from heroes where user_id = a); end if;
  res := res || E'\nzorluk · can değişmez ✓';

  if has_function_privilege('authenticated', 'bb_full_day_regen_trg()', 'execute') then raise exception 'fazla yetki'; end if;
  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
