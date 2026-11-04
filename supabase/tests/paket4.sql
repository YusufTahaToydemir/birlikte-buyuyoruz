-- 0010 testleri: kale, sezon, push kuyruğu, yetkiler.
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; res text := ''; v_today date; v_gold int; v_hp int; q jsonb; v_n int; c couples;
begin
  if bb_season_n(date '2026-11-01') <> 1 or bb_season_n(date '2027-01-31') <> 1 or bb_season_n(date '2027-02-01') <> 2 or bb_season_start(2) <> date '2027-02-01' then raise exception 'sezon hesabı'; end if;
  if bb_season_name(1) <> 'Kış Yolu' or bb_season_name(5) <> 'Kış Yolu' or bb_season_name(2) <> 'Bahar Seferi' then raise exception 'sezon adı'; end if;
  if jsonb_array_length(bb_castle_catalog()) <> 25 then raise exception 'katalog'; end if;
  res := res || E'\nsaf · sezon numarası/başlangıcı/adı, 25 parça ✓';

  insert into setup_keys (key_hash, label) values (bb_hash('T10-KEY'), 'gametest10');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g10_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g10_a","display_name":"A","setup_key":"T10-KEY"}', now(), now());
  select id into a from app_users where username = 'g10_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T10-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g10_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g10_b","display_name":"B","invite_token":"T10-INV"}', now(), now());
  select id into b from app_users where username = 'g10_b';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 2);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'WARRIOR', '{"gender":"F"}', 2);
  v_today := (g->>'today')::date;
  select * into c from couples where id = cp;

  -- 1) Kale: satın alma, seviye maliyeti, tavan, bonus (kuyu → can, mutfak → sabah canı)
  update heroes set gold = 4000 where user_id = a;
  begin r := castle_build('xxx'); raise exception 'yok parça';
  exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  r := castle_build('well');
  if (r->'castle'->'parts'->>'well')::int <> 1 or (select gold from heroes where user_id = a) <> 3800 then raise exception 'kuyu 1'; end if;
  r := castle_build('well');
  if (select gold from heroes where user_id = a) <> 3400 then raise exception 'kuyu 2 maliyeti (200×2)'; end if;
  begin r := castle_build('well'); raise exception 'kuyu 3';
  exception when others then if sqlerrm <> 'MAX_LEVEL' then raise; end if; end;
  if bb_user_max_hp(a) <> bb_max_hp(1) + 6 then raise exception 'kuyu canı %', bb_user_max_hp(a); end if;
  if not exists (select 1 from hero_events where user_id = b and kind = 'CASTLE_BUILT' and data->>'key' = 'well') then raise exception 'kale olayı'; end if;
  if not exists (select 1 from achievements where user_id = a and key = 'CASTLE_1') then raise exception 'kale rozeti'; end if;
  -- kütüphane: olaysız iki gün, biri kütüphaneden önce biri sonra (XP düşmemeli; küçük değerlerde yuvarlama eşit bırakabilir)
  perform bb_generate_day(a, (select min(v_today + gs) from generate_series(1, 90) gs where bb_day_event(cp, v_today + gs) is null));
  r := castle_build('library'); r := castle_build('library'); r := castle_build('library');
  perform bb_generate_day(a, (select min(v_today + gs) from generate_series(1, 90) gs where bb_day_event(cp, v_today + gs) is null and not exists (select 1 from hero_days hd where hd.user_id = a and hd.local_date = v_today + gs)));
  if (select xp from quests q where q.user_id = a and q.code = 'ENGLISH' and q.local_date > v_today order by q.local_date desc limit 1)
     < (select xp from quests q where q.user_id = a and q.code = 'ENGLISH' and q.local_date > v_today order by q.local_date asc limit 1) then raise exception 'kütüphane XP'; end if;
  if (select gold from heroes where user_id = a) <> 3400 - 400 - 800 - 1200 then raise exception 'kütüphane maliyeti'; end if;
  r := get_castle();
  if (r->>'total')::int <> 5 or jsonb_array_length(r->'log') <> 2 then raise exception 'kale json %', r; end if;
  res := res || E'\nkale · kuyu 200 + 400, 3. seviye yok; +6 can; kütüphane 3 seviye (400+800+1200), XP düşmedi; eşe olay; rozet ✓';

  -- 2) Sezon: şu anki sezon ve özet; geçmiş sezon kapanışı
  r := get_season();
  if (r->>'n')::int <> bb_season_n(v_today) or (r->>'daysLeft')::int < 1 or jsonb_typeof(r->'summary'->'heroes') <> 'object' then raise exception 'sezon json %', r; end if;
  if (r->'summary'->>'castle')::int <> 5 then raise exception 'sezon kale'; end if;
  -- geçmiş sezon simülasyonu: "bugün" 2. sezonun 5. günü olsun → 1. sezon kapanır
  select gold into v_gold from heroes where user_id = a;
  perform bb_close_seasons(cp, bb_season_start(bb_season_n(v_today) + 1) + 4);
  if (select count(*) from seasons where couple_id = cp) <> 1 then raise exception 'sezon kapanışı'; end if;
  if (select gold from heroes where user_id = a) <> v_gold + 250 then raise exception 'sezon altını'; end if;
  if (select count(*) from hero_events where kind = 'SEASON_END' and user_id in (a, b)) <> 2 then raise exception 'sezon olayı'; end if;
  perform bb_close_seasons(cp, bb_season_start(bb_season_n(v_today) + 1) + 4);
  if (select count(*) from seasons where couple_id = cp) <> 1 or (select gold from heroes where user_id = a) <> v_gold + 250 then raise exception 'sezon tekrar'; end if;
  if (select (summary->>'castle')::int from seasons where couple_id = cp) <> 5 or (select summary->'heroes'->a::text->>'fullDays' from seasons where couple_id = cp) is null then raise exception 'sezon özeti'; end if;
  r := get_season();
  if jsonb_array_length(r->'past') <> 1 then raise exception 'geçmiş sezon'; end if;
  res := res || E'\nsezon · özet; önceki sezon kapanınca kayıt + 250 altın + olay, ikinci çağrı tekrarlamaz ✓';

  -- 3) Push: abonelik, kuyruk (olay + hatırlatma), ölü abonelik
  r := push_subscribe('https://push.example/abc', 'p256', 'auth1');
  if (r->>'subs')::int <> 1 or (select remind_hour from heroes where user_id = a) <> 20 then raise exception 'abonelik'; end if;
  r := set_reminder(extract(hour from (now() at time zone c.timezone))::int);
  update hero_events set seen = true where user_id = a;
  perform bb_event(a, 'CHEER', '{"xp":5}'::jsonb, b);
  q := bb_push_queue();
  if jsonb_array_length(q) <> 2 then raise exception 'kuyruk %', q; end if;
  if not exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'events' and x->>'body' like 'Ali: seni alkışladı%') then raise exception 'olay metni %', q; end if;
  if not exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'remind' and x->>'title' like 'Kyron · 11 görev kaldı%') then raise exception 'hatırlatma %', q; end if;
  q := bb_push_queue();
  if jsonb_array_length(q) <> 0 then raise exception 'kuyruk tekrar %', q; end if;
  perform bb_push_result(array['https://push.example/abc'], '{}');
  if exists (select 1 from push_subs where user_id = a) then raise exception 'ölü abonelik silinmedi'; end if;
  r := push_subscribe('https://push.example/abc', 'p256', 'auth1');
  r := push_unsubscribe(null);
  if (r->>'subs')::int <> 0 then raise exception 'abonelik iptali'; end if;
  res := res || E'\npush · abone/iptal, kuyrukta olay + hatırlatma, ikinci çağrı boş, ölü abonelik silinir ✓';

  -- 4) Yetkiler
  if not has_function_privilege('authenticated', 'castle_build(text)', 'execute') or not has_function_privilege('authenticated', 'get_season()', 'execute')
     or not has_function_privilege('authenticated', 'push_subscribe(text, text, text)', 'execute') or not has_function_privilege('authenticated', 'set_reminder(int)', 'execute') then raise exception 'yetki eksik'; end if;
  if has_function_privilege('authenticated', 'bb_push_queue()', 'execute') or has_function_privilege('authenticated', 'bb_close_seasons(uuid, date)', 'execute') or has_table_privilege('authenticated', 'push_subs', 'select') then raise exception 'fazla yetki'; end if;
  res := res || E'\nyetki · yalnızca RPC listesi; push kuyruğu dışarıya kapalı ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
