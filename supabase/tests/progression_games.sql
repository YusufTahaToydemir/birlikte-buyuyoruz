-- 0006 testleri: seviye eğrisi/ödülleri, bilet parçaları, düello, Günün Kelimesi, birlikte etkinlik, yetkiler.
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; q record; res text := ''; v_gold int; v_xp bigint; d uuid; w word_games; v_code text; v_hp int;
begin
  -- saf fonksiyonlar
  if bb_level_start(1) <> 0 or bb_level_start(2) <> 180 or bb_level_start(3) <> 390 then raise exception 'eğri başı'; end if;
  if bb_level(0) <> 1 or bb_level(179) <> 1 or bb_level(180) <> 2 or bb_level(389) <> 2 or bb_level(390) <> 3 then raise exception 'seviye sınırları'; end if;
  if bb_level(bb_level_start(100)) <> 100 or bb_level(bb_level_start(100) - 1) <> 99 or bb_level(bb_level_start(250)) <> 250 then raise exception 'yüksek seviye'; end if;
  if (bb_level_reward(7)->>'gold')::int <> 55 or (bb_level_reward(10)->>'gold')::int <> 170 or bb_level_reward(10)->>'potion' <> 'potion_big' or bb_level_reward(5)->>'potion' <> 'potion_small' then raise exception 'ödül tablosu'; end if;
  if bb_word_score('KALEM', 'KALEM') <> 'GGGGG' or bb_word_score('MELEK', 'KALEM') <> 'YBGGY' or bb_word_score('ÇİÇEK', 'ÇİLEK') <> 'GGBGG' then raise exception 'kelime puanı % %', bb_word_score('MELEK', 'KALEM'), bb_word_score('ÇİÇEK', 'ÇİLEK'); end if;
  res := res || E'\neğri · Sv2=180, Sv3=390, Sv100/250 doğru; ödül tablosu; kelime puanı (tekrarlı harf) ✓';

  insert into setup_keys (key_hash, label) values (bb_hash('T6-KEY'), 'gametest6');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g6_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g6_a","display_name":"A","setup_key":"T6-KEY"}', now(), now());
  select id into a from app_users where username = 'g6_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T6-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g6_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g6_b","display_name":"B","invite_token":"T6-INV"}', now(), now());
  select id into b from app_users where username = 'g6_b';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 2);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'WARRIOR', '{"gender":"F"}', 6);

  -- Seviye ödülü: tüm günü yap -> en az Sv 2, ödül altını
  for q in select (e->>'id')::uuid as id from jsonb_array_elements(g->'quests') e loop r := complete_quest(q.id, true); end loop;
  g := r->'game';
  if (g->'hero'->>'level')::int < 2 then raise exception 'seviye yok %', g->'hero'->>'xp'; end if;
  if (select rewarded_level from heroes where user_id = a) <> (g->'hero'->>'level')::int then raise exception 'rewarded_level'; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'LEVEL_UP' and (data->>'gold')::int = 30) then raise exception 'Sv2 ödül olayı'; end if;
  if (g->'hero'->>'hp')::int <> (g->'hero'->>'maxHp')::int then raise exception 'can dolmadı'; end if;
  -- geri al + tekrar yap: ödül ikinci kez verilmez
  select (e->>'id')::uuid as id into q from jsonb_array_elements(g->'quests') e where e->>'code' = 'SPORT';
  v_gold := (g->'hero'->>'gold')::int;
  r := complete_quest(q.id, false); r := complete_quest(q.id, true);
  if (r->'game'->'hero'->>'gold')::int <> v_gold then raise exception 'ödül istismarı % %', v_gold, r->'game'->'hero'->>'gold'; end if;
  if (select count(*) from hero_events where user_id = a and kind = 'LEVEL_UP' and (data->>'level')::int = 2) <> 1 then raise exception 'çift seviye olayı'; end if;
  res := res || E'\nseviye ödülü · Sv atlayınca altın + can dolu; geri al/yap ödülü tekrarlamaz ✓';

  -- Sv 10'a çıkar: büyük iksir kazanılır
  update heroes set xp = bb_level_start(10) where user_id = a;
  perform bb_award_levels(a);
  if (select qty from inventory where user_id = a and item_key = 'potion_big') < 1 then raise exception 'Sv10 iksir'; end if;
  if (select qty from inventory where user_id = a and item_key = 'potion_small') < 1 then raise exception 'Sv5 iksir'; end if;
  res := res || E'\nsandıklar · Sv5 küçük iksir, Sv10 büyük iksir ✓';

  -- Bilet parçaları: 3 parça bilet yok, 4. parça bilet
  perform bb_add_shard(a, 'TEST', 't1'); perform bb_add_shard(a, 'TEST', 't1'); perform bb_add_shard(a, 'TEST', 't2'); perform bb_add_shard(a, 'TEST', 't3');
  if (select shards from heroes where user_id = a) <> 3 or exists (select 1 from tickets where owner_id = a) then raise exception 'parça 3'; end if;
  perform bb_add_shard(a, 'TEST', 't4');
  if (select shards from heroes where user_id = a) <> 0 or (select count(*) from tickets where owner_id = a) <> 1 then raise exception 'parça 4'; end if;
  -- boss yenilgisi bilet değil parça verir
  update bosses set hp = 1 where couple_id = cp and defeated_at is null;
  perform bb_team_hit(cp, 'TEST', 5);
  if (select count(*) from tickets where owner_id = a) <> 1 or (select shards from heroes where user_id = a) <> 1 or (select shards from heroes where user_id = b) <> 1 then raise exception 'boss parçası'; end if;
  res := res || E'\nbilet · 4 parça = 1 bilet (aynı kaynak bir kez); boss yenilince ikinize 1 parça ✓';

  -- Düello: A oynar (skor 30), B oynar (40) -> B kazanır
  r := duel_create('TAP', 12345, 30);
  select id into d from duels where couple_id = cp and created_by = a;
  begin perform duel_play(d, 10); raise exception 'x'; exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  begin perform duel_create('NOPE', 1, 1); raise exception 'x'; exception when others then if sqlerrm <> 'INVALID_VALUE' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  if (get_game()->'play'->>'duels')::int <> 1 then raise exception 'düello rozeti'; end if;
  v_xp := (select xp from heroes where user_id = b);
  r := duel_play(d, 40);
  if (select winner from duels where id = d) <> b then raise exception 'kazanan'; end if;
  if (select xp from heroes where user_id = b) <> v_xp + 20 then raise exception 'düello ödülü'; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'DUEL_RESULT' and data->>'result' = 'LOSE') then raise exception 'sonuç olayı'; end if;
  if not exists (select 1 from achievements where user_id = b and key = 'DUEL_1') then raise exception 'düello rozeti'; end if;
  begin perform duel_play(d, 50); raise exception 'x'; exception when others then if sqlerrm <> 'INVALID_STATE' then raise; end if; end;
  -- skor sınırı
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  r := duel_create('MEMORY', 7, 99999);
  if (select score_a from duels where couple_id = cp and game = 'MEMORY') <> 40 then raise exception 'skor sınırı'; end if;
  res := res || E'\ndüello · sırayla oyna, kazanan +20 XP +30 altın, sonuç olayı, rozet, skor sınırı ✓';

  -- Günün Kelimesi: kişi başı 3 tahmin, doğru tahmin ikisine ödül
  r := get_games();
  select * into w from word_games where couple_id = cp;
  begin perform word_guess('abc'); raise exception 'x'; exception when others then if sqlerrm <> 'INVALID_WORD' then raise; end if; end;
  r := word_guess(case when w.word = 'ZEBRA' then 'PANDA' else 'ZEBRA' end);
  r := word_guess(case when w.word = 'ZEBRA' then 'PANDA' else 'ZEBRA' end);
  r := word_guess(case when w.word = 'ZEBRA' then 'PANDA' else 'ZEBRA' end);
  begin perform word_guess('KALEM'); raise exception 'x'; exception when others then if sqlerrm <> 'NO_GUESSES_LEFT' then raise; end if; end;
  if (r->'word'->>'answer') is not null then raise exception 'cevap sızdı'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  v_xp := (select xp from heroes where user_id = a);
  r := word_guess(w.word);
  if not (r->'word'->>'solved')::boolean or r->'word'->>'answer' <> w.word then raise exception 'çözüm'; end if;
  -- 4. tahminde: 15 + 8*3 = 39 XP
  if (select xp from heroes where user_id = a) <> v_xp + 39 then raise exception 'kelime ödülü %', (select xp from heroes where user_id = a) - v_xp; end if;
  res := res || E'\nkelime · kişi başı 3 tahmin, cevap bitene kadar gizli, 4. tahminde ikinize +39 XP ✓';

  -- Birlikte: B "yaptık" der, A onaylar -> ikisine ödül + boss hasarı
  select code into v_code from bb_together_week(cp, bb_week_start(bb_local_date(now(), 'Europe/Istanbul'))) limit 1;
  r := together_mark(v_code);
  begin perform together_mark(v_code); raise exception 'x'; exception when others then if sqlerrm <> 'INVALID_STATE' then raise; end if; end;
  begin perform together_mark('T_NOPE'); raise exception 'x'; exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  if (get_game()->'play'->>'together')::int <> 1 then raise exception 'etkinlik rozeti'; end if;
  v_xp := (select xp from heroes where user_id = b);
  r := together_mark(v_code);
  if (select status from together_log where couple_id = cp and code = v_code) <> 'DONE' then raise exception 'onay'; end if;
  if (select xp from heroes where user_id = b) <> v_xp + 40 then raise exception 'etkinlik ödülü'; end if;
  if not exists (select 1 from hero_events where user_id = b and kind = 'TOGETHER_DONE') then raise exception 'etkinlik olayı'; end if;
  res := res || E'\nbirlikte · biri işaretler, diğeri onaylar, ikinize +40 XP +25 altın ✓';

  -- Yetkiler: iç yardımcılar istemciye kapalı
  if has_function_privilege('authenticated', 'bb_grant(uuid,text,integer,integer)', 'execute') then raise exception 'bb_grant açık'; end if;
  if has_function_privilege('authenticated', 'bb_add_shard(uuid,text,text)', 'execute') then raise exception 'bb_add_shard açık'; end if;
  if not has_function_privilege('authenticated', 'word_guess(text)', 'execute') then raise exception 'word_guess kapalı'; end if;
  if has_table_privilege('authenticated', 'word_games', 'select') then raise exception 'word_games okunabiliyor'; end if;
  res := res || E'\nyetki · iç fonksiyonlar ve tablolar kapalı, RPC açık ✓';

  raise exception E'İLERLEME + OYUN TESTLERİ (geri alındı):%', res;
end $$;
