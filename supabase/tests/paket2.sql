-- 0008 testleri: stat bonusları, günün olayı, zayıflık/öfke, çift gün, yetenekler, bestiyer, yetkiler.
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; q record; res text := ''; v_today date; d0 date; d1 date; i int; v_dmg0 int; v_dmg1 int;
  bs bosses; v_weak text; v_exp int; v_hit int; v_gold int; v_n int; v_hp int;
begin
  if bb_stat_bonus(0) <> 0 or bb_stat_bonus(100) <> 10 or bb_stat_bonus(500) <> 20 or bb_stat_bonus(50) <> 7 then raise exception 'stat bonus'; end if;
  res := res || E'\nstat bonusu · 0→0, 50→7, 100→10, 500→20 (tavan) ✓';

  insert into setup_keys (key_hash, label) values (bb_hash('T8-KEY'), 'gametest8');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g8_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g8_a","display_name":"A","setup_key":"T8-KEY"}', now(), now());
  select id into a from app_users where username = 'g8_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T8-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g8_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g8_b","display_name":"B","invite_token":"T8-INV"}', now(), now());
  select id into b from app_users where username = 'g8_b';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'HEALER', '{"gender":"M"}', 2);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'WARRIOR', '{"gender":"F"}', 2);
  v_today := (g->>'today')::date;

  -- 1) Güç → can: BODY 100 ⇒ +20 maksimum can
  update heroes set stats = stats || '{"BODY":100}'::jsonb where user_id = a;
  g := get_game();
  if (g->'hero'->>'maxHp')::int <> bb_max_hp(1) + 20 then raise exception 'maxHp %', g->'hero'->>'maxHp'; end if;
  res := res || E'\ncan · Güç 100 ⇒ +20 can ✓';

  -- 2) Günün olayı: hero_days ve get_game aynı; iki eş aynı olayı görür
  if coalesce(g->'day'->>'event', '-') <> coalesce(bb_day_event(cp, v_today), '-') then raise exception 'gün olayı'; end if;
  if (select coalesce(event, '-') from hero_days where user_id = b and local_date = v_today) <> coalesce(bb_day_event(cp, v_today), '-') then raise exception 'eşin olayı farklı'; end if;
  -- olaysız ve SPIRIT_SURGE günlerini bul, FAJR hasarı 2 katı; MIND_DAY'de ENGLISH XP 2 katı
  select min(v_today + i) into d0 from generate_series(1, 90) i where bb_day_event(cp, v_today + i) is null;
  select min(v_today + i) into d1 from generate_series(1, 90) i where bb_day_event(cp, v_today + i) = 'SPIRIT_SURGE';
  perform bb_generate_day(a, d0); perform bb_generate_day(a, d1);
  select damage into v_dmg0 from quests where user_id = a and local_date = d0 and code = 'FAJR';
  select damage into v_dmg1 from quests where user_id = a and local_date = d1 and code = 'FAJR';
  if v_dmg1 <> v_dmg0 * 2 then raise exception 'ruh dalgası % %', v_dmg0, v_dmg1; end if;
  select damage into v_dmg1 from quests where user_id = a and local_date = d1 and code = 'ENGLISH';
  select damage into v_dmg0 from quests where user_id = a and local_date = d0 and code = 'ENGLISH';
  if v_dmg1 <> v_dmg0 then raise exception 'ruh dalgası zekâyı etkiledi'; end if;
  select min(v_today + i) into d1 from generate_series(1, 90) i where bb_day_event(cp, v_today + i) = 'GOLD_RAIN';
  perform bb_generate_day(a, d1);
  if (select min(gold) from quests where user_id = a and local_date = d1 and kind = 'SIDE') < 3 * (select min(gold) from quests where user_id = a and local_date = d0 and kind = 'SIDE') then raise exception 'altın yağmuru'; end if;
  res := res || E'\ngünün olayı · çift için ortak; Ruh Dalgası FAJR hasarı 2×, Zekâ etkilenmez; Altın Yağmuru yan görev 3× ✓';

  -- 3) Zayıflık 1.5× ve öfke (son %25) yarım hasar
  select * into bs from bosses where couple_id = cp and week_start = bb_week_start(v_today);
  v_weak := bb_boss_weak(bs.boss_key);
  if v_weak is null then raise exception 'zayıflık yok %', bs.boss_key; end if;
  select id, damage into q from quests where user_id = a and local_date = v_today and category = v_weak and kind = 'DAILY' limit 1;
  v_exp := least(bs.hp, round(q.damage * 1.5));
  r := complete_quest(q.id, true);
  select damage into v_hit from boss_hits where quest_id = q.id;
  if v_hit <> v_exp or (select kind from boss_hits where quest_id = q.id) <> 'WEAK' then raise exception 'zayıflık % %', v_hit, v_exp; end if;
  update bosses set hp = floor(max_hp * 0.2) where id = bs.id;
  select id, damage into q from quests where user_id = a and local_date = v_today and category <> v_weak and kind = 'DAILY' and not done limit 1;
  v_exp := least(floor(bs.max_hp * 0.2)::int, ceil(q.damage / 2.0)::int);
  r := complete_quest(q.id, true);
  select damage into v_hit from boss_hits where quest_id = q.id;
  if v_hit <> v_exp or (select kind from boss_hits where quest_id = q.id) <> 'RAGE' then raise exception 'öfke % %', v_hit, v_exp; end if;
  r := complete_quest(q.id, false);
  if (select hp from bosses where id = bs.id) <> floor(bs.max_hp * 0.2) then raise exception 'geri alma öfke hasarını iade etmedi'; end if;
  update bosses set hp = max_hp where id = bs.id;
  res := res || E'\ncanavar · zayıf kategori 1.5× (WEAK), öfkede yarım (RAGE), geri alma tutarlı ✓';

  -- 4) Çift gün: ikiniz de aynı görevi yapınca +5 altın (bir kez)
  update hero_days set event = 'TWIN' where user_id in (a, b) and local_date = v_today;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  select id into q from quests where user_id = b and local_date = v_today and code = 'QURAN';
  r := complete_quest(q.id, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select gold into v_gold from heroes where user_id = a;
  select id, gold into q from quests where user_id = a and local_date = v_today and code = 'QURAN';
  r := complete_quest(q.id, true);
  if (select gold from heroes where user_id = a) <> v_gold + q.gold + 5 then raise exception 'çift altını'; end if;
  if (select count(*) from hero_events where kind = 'TWIN_BONUS' and user_id in (a, b)) <> 2 then raise exception 'çift olayı'; end if;
  r := complete_quest(q.id, false); r := complete_quest(q.id, true);
  if (select count(*) from hero_log where user_id = a and kind = 'TWIN') <> 1 then raise exception 'çift bonusu tekrarlandı'; end if;
  res := res || E'\nçift gün · aynı görev ikisinde de yapılınca +5 altın, geri al/yap tekrarlamaz ✓';

  -- 5) Yetenekler
  select sum(damage) into v_dmg0 from quests where user_id = a and local_date = v_today and not done;
  g := use_skill();
  if (select sum(damage) from quests where user_id = a and local_date = v_today and not done) <> v_dmg0 * 2 then raise exception 'savaş çığlığı'; end if;
  if g->'hero'->>'skillReadyAt' is null then raise exception 'bekleme süresi yok'; end if;
  begin g := use_skill(); raise exception 'ikinci yetenek';
  exception when others then if sqlerrm <> 'SKILL_COOLDOWN' then raise; end if; end;
  if not exists (select 1 from hero_events where user_id = b and kind = 'SKILL_USED' and data->>'skill' = 'WAR_CRY') then raise exception 'yetenek olayı'; end if;
  -- Büyücü: XP 2×
  update heroes set class = 'MAGE', skill_used_at = null where user_id = a;
  select sum(xp) into v_dmg0 from quests where user_id = a and local_date = v_today and not done;
  g := use_skill();
  if (select sum(xp) from quests where user_id = a and local_date = v_today and not done) <> v_dmg0 * 2 then raise exception 'büyük büyü'; end if;
  -- Okçu: yan görevler yenilenir, +1
  update heroes set class = 'RANGER', skill_used_at = null where user_id = a;
  g := use_skill();
  select count(*) into v_n from quests where user_id = a and local_date = v_today and kind = 'SIDE';
  if v_n <> (bb_diff(2)->>'sides')::int + 1 then raise exception 'keşif %', v_n; end if;
  -- Şifacı (b): ikisinin de canı dolar
  update heroes set hp = 5 where user_id in (a, b);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := use_skill();
  if (select hp from heroes where user_id = a) <> bb_user_max_hp(a) or (select hp from heroes where user_id = b) <> bb_user_max_hp(b) then raise exception 'büyük şifa'; end if;
  if not exists (select 1 from achievements where user_id = b and key = 'SKILL_1') then raise exception 'yetenek rozeti'; end if;
  res := res || E'\nyetenekler · Savaş Çığlığı hasar 2×, bekleme süresi; Büyük Büyü XP 2×; Keşif yan görev +1; Büyük Şifa ikisini doldurur ✓';

  -- 6) Bestiyer
  r := get_bestiary();
  if jsonb_array_length(r) <> 12 then raise exception 'bestiyer %', jsonb_array_length(r); end if;
  if (select count(*) from jsonb_array_elements(r) e where (e->>'faced')::int = 1) <> 1 then raise exception 'karşılaşılan'; end if;
  update bosses set hp = 1 where id = bs.id;
  select id into q from quests where user_id = b and local_date = v_today and not done and kind = 'DAILY' limit 1;
  g := complete_quest(q.id, true);
  r := get_bestiary();
  if (select (e->>'defeated')::int from jsonb_array_elements(r) e where e->>'key' = bs.boss_key) <> 1 then raise exception 'yenilen'; end if;
  if (select (e->>'fastest')::int from jsonb_array_elements(r) e where e->>'key' = bs.boss_key) is null then raise exception 'en hızlı'; end if;
  res := res || E'\nbestiyer · 12 canavar, karşılaşılan 1, yenilince sayaç ve en hızlı gün ✓';

  -- 7) BOSS_RAGE kapanışta 2× hasar
  perform bb_generate_day(a, v_today - 1);
  update hero_days set event = 'BOSS_RAGE' where user_id = a and local_date = v_today - 1;
  update heroes set hp = 100 where user_id = a;
  perform bb_close_day(a, v_today - 1);
  select hp_lost into v_hp from hero_days where user_id = a and local_date = v_today - 1;
  if v_hp <> 2 * greatest(1, round(11 * (bb_diff(2)->>'damage')::int)) then raise exception 'öfke günü hasarı %', v_hp; end if;
  res := res || E'\nöfke günü · kaçan günde can kaybı 2× ✓';

  -- 8) Yetkiler
  if not has_function_privilege('authenticated', 'use_skill()', 'execute') or not has_function_privilege('authenticated', 'get_bestiary()', 'execute') then raise exception 'yetki eksik'; end if;
  if has_function_privilege('authenticated', 'bb_day_event(uuid, date)', 'execute') or has_function_privilege('authenticated', 'bb_user_max_hp(uuid)', 'execute') then raise exception 'fazla yetki'; end if;
  res := res || E'\nyetki · yalnızca RPC listesi ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
