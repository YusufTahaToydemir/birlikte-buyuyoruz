-- 0009 testleri: çift testi, not defteri, ortak baskın, yeni düellolar, kelime ipucu, yetkiler.
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; res text := ''; v_today date; ids bigint[]; ans jsonb := '{}'::jsonb; qid bigint; i int := 0;
  v_gold int; v_hp int; bs bosses; v_n int; w word_games;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T9-KEY'), 'gametest9');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g9_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g9_a","display_name":"A","setup_key":"T9-KEY"}', now(), now());
  select id into a from app_users where username = 'g9_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T9-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g9_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g9_b","display_name":"B","invite_token":"T9-INV"}', now(), now());
  select id into b from app_users where username = 'g9_b';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 2);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'WARRIOR', '{"gender":"F"}', 2);
  v_today := (g->>'today')::date;
  update heroes set gold = 100 where user_id in (a, b);

  -- 1) Çift testi: 5 soru, a cevaplar (bekler), b cevaplar (biter); eşleşme hesabı
  g := get_games();
  if jsonb_array_length(g->'quiz'->'questions') <> 5 or (g->'quiz'->>'mineDone')::boolean then raise exception 'test soruları'; end if;
  select question_ids into ids from quiz_games where couple_id = cp;
  -- a: self = 0, guess = 1 ; b: self = 1 (ilk 3 soru) / 2 (son 2), guess = 0 → a'nın tahmini 3 tutar, b'nin tahmini 5 tutar = 8
  foreach qid in array ids loop ans := ans || jsonb_build_object(qid::text, '{"self":0,"guess":1}'::jsonb); end loop;
  g := quiz_answer(ans);
  if not (g->'quiz'->>'mineDone')::boolean or (g->'quiz'->>'finished')::boolean then raise exception 'a cevabı'; end if;
  if not exists (select 1 from hero_events where user_id = b and kind = 'QUIZ_WAIT') then raise exception 'bekleme olayı'; end if;
  begin g := quiz_answer(ans); raise exception 'ikinci cevap';
  exception when others then if sqlerrm <> 'INVALID_STATE' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  ans := '{}'::jsonb;
  foreach qid in array ids loop i := i + 1; ans := ans || jsonb_build_object(qid::text, jsonb_build_object('self', case when i <= 3 then 1 else 2 end, 'guess', 0)); end loop;
  select gold into v_gold from heroes where user_id = a;
  g := quiz_answer(ans);
  if not (g->'quiz'->>'finished')::boolean or (g->'quiz'->>'matches')::int <> 8 then raise exception 'eşleşme % ', g->'quiz'->>'matches'; end if;
  if (select gold from heroes where user_id = a) <> v_gold + 40 then raise exception 'test altını'; end if;
  if (select count(*) from hero_events where kind = 'QUIZ_RESULT' and user_id in (a, b)) <> 2 then raise exception 'test olayı'; end if;
  if (g->'quiz'->'questions'->0->'partner'->>'self')::int <> 0 then raise exception 'sonuç detayı'; end if;
  if not exists (select 1 from boss_hits bh join bosses bb on bb.id = bh.boss_id where bb.couple_id = cp and bh.kind = 'QUIZ' and bh.damage = 64) then raise exception 'test hasarı'; end if;
  -- kendi sorusu
  g := quiz_add('En sevdiği oyun?', '["Kyron","Satranç","Okey","Tavla"]'::jsonb);
  if (select count(*) from quiz_questions where couple_id = cp) <> 1 then raise exception 'özel soru'; end if;
  begin g := quiz_add('x', '["a","b","c","d"]'::jsonb); raise exception 'kısa soru kabul';
  exception when others then if sqlerrm <> 'INVALID_VALUE' then raise; end if; end;
  res := res || E'\nçift testi · 5 soru; a bekler (QUIZ_WAIT), b bitirir; 8 eşleşme → +40 altın, 64 hasar; özel soru eklenir ✓';

  -- 2) Not defteri: mektup günde 1; şükür ikisi de yazınca +10 altın
  g := note_write('LETTER', '  Seni   seviyorum ', 'heart');
  if not (g->'notes'->>'letterSent')::boolean then raise exception 'mektup'; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'LETTER' and data->>'text' = 'Seni seviyorum') then raise exception 'mektup olayı'; end if;
  begin g := note_write('LETTER', 'ikinci', null); raise exception 'ikinci mektup';
  exception when others then if sqlerrm <> 'DAILY_LIMIT' then raise; end if; end;
  g := note_write('THANKS', 'Sağlık için', null);
  if g->'notes'->>'thanksMe' <> 'Sağlık için' or g->'notes'->>'thanksPartner' is not null then raise exception 'şükür b'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select gold into v_gold from heroes where user_id = a;
  g := note_write('THANKS', 'Eşim için', null);
  if g->'notes'->>'thanksPartner' <> 'Sağlık için' then raise exception 'şükür a'; end if;
  if (select gold from heroes where user_id = a) <> v_gold + 10 then raise exception 'şükür altını'; end if;
  if (select count(*) from hero_events where kind = 'THANKS_BOTH' and user_id in (a, b)) <> 2 then raise exception 'şükür olayı'; end if;
  r := get_notes();
  if jsonb_array_length(r) <> 3 or (select count(*) from jsonb_array_elements(r) n where n->>'kind' = 'LETTER') <> 1 then raise exception 'hatıra defteri'; end if;
  res := res || E'\nnot defteri · mektup olayı ve günlük sınır; iki şükür → +10 altın; hatıra 3 kayıt ✓';

  -- 3) Ortak baskın: aynı oyun ve tohum; iki skor → hasar
  g := get_games();
  if g->'raid'->>'game' is null or (g->'raid'->>'finished')::boolean then raise exception 'baskın yok'; end if;
  select hp into v_hp from bosses where couple_id = cp and week_start = bb_week_start(v_today);
  g := raid_play(bb_game_max(g->'raid'->>'game'));
  if not exists (select 1 from hero_events where user_id = b and kind = 'RAID_WAIT') then raise exception 'baskın bekleme'; end if;
  begin g := raid_play(5); raise exception 'ikinci baskın';
  exception when others then if sqlerrm <> 'INVALID_STATE' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := raid_play(bb_game_max(g->'raid'->>'game'));
  if not (g->'raid'->>'finished')::boolean or (g->'raid'->>'damage')::int <> 120 then raise exception 'baskın hasarı %', g->'raid'->>'damage'; end if;
  if (select hp from bosses where couple_id = cp and week_start = bb_week_start(v_today)) <> v_hp - 120 then raise exception 'canavar canı'; end if;
  if (select count(*) from hero_events where kind = 'RAID_DONE' and user_id in (a, b)) <> 2 then raise exception 'baskın olayı'; end if;
  res := res || E'\nbaskın · tam puanlar → 120 hasar, canavar canı düştü, iki olay ✓';

  -- 4) Yeni düellolar kabul edilir, puan tavanı 40
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := duel_create('MATH', 7, 99);
  if (select score_a from duels where couple_id = cp and game = 'MATH') <> 40 then raise exception 'MATH tavan'; end if;
  g := duel_create('COLOR', 8, 12);
  if (select count(*) from duels where couple_id = cp and game in ('MATH','COLOR')) <> 2 then raise exception 'COLOR düello'; end if;
  res := res || E'\ndüello · MATH ve COLOR kabul, tavan 40 ✓';

  -- 5) Kelime ipucu: 10 altın, harf doğru, günde 2
  select gold into v_gold from heroes where user_id = a;
  g := word_hint();
  select * into w from word_games where couple_id = cp and local_date = v_today;
  if jsonb_array_length(w.hints) <> 1 or (w.hints->0->>'pos')::int <> 1 or w.hints->0->>'letter' <> substr(w.word, 1, 1) then raise exception 'ipucu %', w.hints; end if;
  if (select gold from heroes where user_id = a) <> v_gold - 10 then raise exception 'ipucu altını'; end if;
  if jsonb_array_length(g->'word'->'hints') <> 1 then raise exception 'ipucu json'; end if;
  g := word_hint();
  begin g := word_hint(); raise exception 'üçüncü ipucu';
  exception when others then if sqlerrm <> 'DAILY_LIMIT' then raise; end if; end;
  if not exists (select 1 from hero_events where user_id = b and kind = 'WORD_HINT') then raise exception 'ipucu olayı'; end if;
  res := res || E'\nkelime ipucu · 10 altın, 1. harf, günde 2, eşe olay ✓';

  -- 6) Yetkiler
  if not has_function_privilege('authenticated', 'quiz_answer(jsonb)', 'execute') or not has_function_privilege('authenticated', 'note_write(text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'raid_play(int)', 'execute') or not has_function_privilege('authenticated', 'word_hint()', 'execute')
     or not has_function_privilege('authenticated', 'get_notes(timestamptz, int)', 'execute') or not has_function_privilege('authenticated', 'quiz_add(text, jsonb)', 'execute') then raise exception 'yetki eksik'; end if;
  if has_table_privilege('authenticated', 'notes', 'select') or has_table_privilege('authenticated', 'quiz_games', 'select') or has_function_privilege('authenticated', 'bb_raid_today(uuid, date)', 'execute') then raise exception 'fazla yetki'; end if;
  res := res || E'\nyetki · yalnızca RPC listesi ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
