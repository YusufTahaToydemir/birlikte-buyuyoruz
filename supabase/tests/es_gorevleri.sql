-- 0014 testleri: eşin görevleri (kayıt, geri alma, bildirim kuyruğu, sessiz saat, tercih, özel gün gizliliği, özet, yetki).
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
-- Yardımcı: saat dilimini yalnızca kuyruk çağrısı sırasında değiştirir ("bugün" tarihi kaymasın).
create or replace function pg_temp.pq(p_cp uuid, p_tz text, p_orig text) returns jsonb language plpgsql as $f$
declare q jsonb;
begin
  update couples set timezone = p_tz where id = p_cp;
  q := bb_push_queue();
  update couples set timezone = p_orig where id = p_cp;
  return q;
end $f$;
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; q jsonb; res text := ''; v_today date; c couples;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; tz_day text; tz_night text; v_n int;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T14-KEY'), 'gametest14');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g14_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g14_a","display_name":"Ayşe","setup_key":"T14-KEY"}', now(), now());
  select id into a from app_users where username = 'g14_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T14-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g14_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g14_b","display_name":"Ali","invite_token":"T14-INV"}', now(), now());
  select id into b from app_users where username = 'g14_b';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 6);
  r := push_subscribe('https://push.example/b', 'p256', 'auth1');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'HEALER', '{"gender":"F"}', 6);
  v_today := (g->>'today')::date;
  select * into c from couples where id = cp;
  -- push saat penceresini denemek için: saat 12 ve saat 3 olan bir saat dilimi
  select name into tz_day from pg_timezone_names where extract(hour from (now() at time zone name)) = 12 limit 1;
  select name into tz_night from pg_timezone_names where extract(hour from (now() at time zone name)) = 3 limit 1;
  select id into q1 from quests where user_id = a and local_date = v_today and code = 'FAJR';
  select id into q2 from quests where user_id = a and local_date = v_today and code = 'DHUHR';
  select id into q3 from quests where user_id = a and local_date = v_today and code = 'ASR';
  select id into q4 from quests where user_id = a and local_date = v_today and code = 'MAGHRIB';

  -- 1) Görev yapılınca eşe kayıt düşer; geri alınınca (gönderilmeden) silinir; yeniden yapılınca tek kayıt
  g := (complete_quest(q1, true))->'game';
  if (select count(*) from partner_feed where actor = a and receiver = b and quest_id = q1) <> 1 then raise exception 'kayıt düşmedi'; end if;
  g := (complete_quest(q1, false))->'game';
  if exists (select 1 from partner_feed where quest_id = q1) then raise exception 'geri alınca kayıt silinmedi'; end if;
  g := (complete_quest(q1, true))->'game';
  g := (complete_quest(q2, true))->'game';
  if (select count(*) from partner_feed where actor = a and not pushed) <> 2 then raise exception 'iki kayıt bekleniyordu'; end if;
  res := res || E'\nkayıt · yapılınca eşe düşer, geri alınınca silinir, yeniden yapılınca tek kayıt ✓';

  -- 2) Kuyruk: 1 dk dolmadan gitmez; dolunca eş başına TEK bildirim; ikinci çağrı boş
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner') then raise exception 'çok erken gitti %', q; end if;
  update partner_feed set created_at = now() - interval '2 minutes' where actor = a;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if (select count(*) from jsonb_array_elements(q) x where x->>'tag' = 'partner') <> 1 then raise exception 'tek bildirim bekleniyordu %', q; end if;
  if not exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner' and (x->>'user')::uuid = b and x->>'body' like 'Ayşe 2 görev tamamladı: %') then raise exception 'metin %', q; end if;
  if exists (select 1 from jsonb_array_elements(q) x where (x->>'user')::uuid = a and x->>'tag' = 'partner') then raise exception 'yapan kişiye gitti'; end if;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner') then raise exception 'ikinci çağrı boş değil %', q; end if;
  res := res || E'\nkuyruk · 1 dk bekler, eş başına tek bildirim, yapana gitmez, ikinci çağrı boş ✓';

  -- 3) Tek görev metni: "şu görevi tamamladı: <ad>"
  g := (complete_quest(q3, true))->'game';
  update partner_feed set created_at = now() - interval '2 minutes' where actor = a and not pushed;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if not exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner' and x->>'body' like 'Ayşe şu görevi tamamladı: %') then raise exception 'tek görev metni %', q; end if;
  res := res || E'\ntek görev · "Ayşe şu görevi tamamladı: …" ✓';

  -- 4) Gece 23:00-08:00 arası gönderilmez (kayıt tüketilir, sonra da gitmez); 30 dk'dan eski sessizce düşer
  g := (complete_quest(q4, true))->'game';
  update partner_feed set created_at = now() - interval '2 minutes' where actor = a and not pushed;
  q := pg_temp.pq(cp, tz_night, c.timezone);
  if exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner') then raise exception 'gece gitti %', q; end if;
  if exists (select 1 from partner_feed where not pushed) then raise exception 'gece kaydı tüketilmedi'; end if;
  select id into q1 from quests where user_id = a and local_date = v_today and code = 'ISHA';
  g := (complete_quest(q1, true))->'game';
  update partner_feed set created_at = now() - interval '40 minutes' where actor = a and not pushed;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner') then raise exception 'eski kayıt gitti %', q; end if;
  res := res || E'\nsessiz saat · gece gitmez, 30 dk''dan eski düşer ✓';

  -- 5) Alıcı bildirimi kapatır → gitmez; açınca yine gider
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  r := set_partner_notify(false);
  if (r->>'notify')::boolean then raise exception 'kapanmadı'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select id into q1 from quests where user_id = a and local_date = v_today and code = 'SUNNAH';
  g := (complete_quest(q1, true))->'game';
  update partner_feed set created_at = now() - interval '2 minutes' where actor = a and not pushed;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner') then raise exception 'kapalıyken gitti %', q; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  r := set_partner_notify(true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select id into q1 from quests where user_id = a and local_date = v_today and code = 'QURAN';
  g := (complete_quest(q1, true))->'game';
  update partner_feed set created_at = now() - interval '2 minutes' where actor = a and not pushed;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if (select count(*) from jsonb_array_elements(q) x where x->>'tag' = 'partner') <> 1 then raise exception 'açınca gitmedi %', q; end if;
  res := res || E'\ntercih · kapalıyken gitmez, açınca gider ✓';

  -- 6) Eş özeti (get_partner_feed): bugünkü görevler, 7 günlük çubuk, sayılar
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  r := get_partner_feed();
  if not (r->>'hasPartner')::boolean or jsonb_array_length(r->'today') <> 7 or jsonb_array_length(r->'week') <> 7 then raise exception 'özet şekli %', r; end if;
  if (r->>'weekDone')::int < 7 or (r->>'totalDone')::int < 7 then raise exception 'sayılar %', r; end if;
  if (r->'week'->6->>'done')::int <> 7 then raise exception 'bugün çubuğu %', r; end if;
  res := res || E'\neş özeti · bugünkü 7 görev, 7 günlük çubuk, haftalık/toplam sayılar ✓';

  -- 7) Özel gün: eşin özel görevi adıyla çıkmaz; gizli görevler görünmez; bildirimde "bir görev"
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := set_special(true);
  select id into q1 from quests where user_id = a and local_date = v_today and code = 'SP_DUA';
  g := (complete_quest(q1, true))->'game';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  r := get_partner_feed();
  if exists (select 1 from jsonb_array_elements(r->'today') e where e->>'code' like 'SP\_%' and e->>'title' is not null) then raise exception 'özel görev adı sızdı %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r->'today') e where e->>'code' = 'SP_DUA') then raise exception 'özel görev listede yok'; end if;
  update partner_feed set created_at = now() - interval '2 minutes' where actor = a and not pushed;
  q := pg_temp.pq(cp, tz_day, c.timezone);
  if not exists (select 1 from jsonb_array_elements(q) x where x->>'tag' = 'partner' and x->>'body' like 'Ayşe bir görev tamamladı%') then raise exception 'özel gün metni %', q; end if;
  if (select count(*) from jsonb_array_elements(r->'today') e) > (select count(*) from quests where user_id = a and local_date = v_today and done and not hidden) then raise exception 'gizli görev göründü'; end if;
  res := res || E'\nözel gün · özel görev adı gizli ("bir görev"), gizli görevler listede yok ✓';

  -- 8) Eşi olmayan kullanıcı
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  r := get_partner_feed();
  if (r->>'hasPartner')::boolean is not true then raise exception 'eşli kullanıcı'; end if;
  res := res || E'\nçift · iki taraf da kendi eşini görür ✓';

  -- 9) Yetkiler
  if not has_function_privilege('authenticated', 'get_partner_feed()', 'execute') or not has_function_privilege('authenticated', 'set_partner_notify(boolean)', 'execute') then raise exception 'yetki eksik'; end if;
  if has_function_privilege('authenticated', 'bb_quest_feed()', 'execute') or has_function_privilege('authenticated', 'bb_push_queue()', 'execute')
     or has_table_privilege('authenticated', 'partner_feed', 'select') then raise exception 'fazla yetki'; end if;
  res := res || E'\nyetki · yalnızca iki RPC açık, tablo ve tetikleyici kapalı ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
