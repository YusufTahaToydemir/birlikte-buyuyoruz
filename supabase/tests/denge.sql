-- 0015 testleri: zorluk/görev dengesi. SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; res text := ''; v_today date; v_n int; v_da int; v_db int; v_xa int; v_xb int; v_t text;
  h_xp int; h_gold int; h_dmg int; s_xp int; s_gold int; s_dmg int; v_boss bosses;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T15-KEY'), 'gametest15');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g15_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g15_a","display_name":"Ayşe","setup_key":"T15-KEY"}', now(), now());
  select id into a from app_users where username = 'g15_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T15-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g15_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g15_b","display_name":"Ali","invite_token":"T15-INV"}', now(), now());
  select id into b from app_users where username = 'g15_b';
  -- b: erkek, Çırak; a: kadın, Destansı
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 1);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'HEALER', '{"gender":"F"}', 6);
  v_today := (g->>'today')::date;

  -- 1) Ad ve ayarlar
  if g->'config'->'difficulties'->5->>'name' <> 'Destansı' or (g->'config'->'difficulties'->1->>'damage')::numeric <> 2.25 then raise exception 'ayar %', g->'config'->'difficulties'; end if;
  res := res || E'\nayar · 6. zorluk "Destansı", ondalıklı can cezası ✓';

  -- 2) Destansı görevleri: 17 günlük, kaza + duha var; kadın spor hedefi; {t} kalmadı
  select count(*) into v_n from quests where user_id = a and local_date = v_today and kind = 'DAILY';
  if v_n <> 17 then raise exception 'Destansı günlük görev sayısı %', v_n; end if;
  if not exists (select 1 from quests where user_id = a and local_date = v_today and code = 'KAZA' and title = 'Kaza namazı · 2 vakit')
     or not exists (select 1 from quests where user_id = a and local_date = v_today and code = 'SUNNAH') then raise exception 'kaza/duha yok'; end if;
  select title into v_t from quests where user_id = a and local_date = v_today and code = 'SPORT';
  if v_t <> 'Tempolu spor · 60 dk' then raise exception 'kadın spor %', v_t; end if;
  select title into v_t from quests where user_id = b and local_date = v_today and code = 'SPORT';
  if v_t <> 'Spor · 15 dk' then raise exception 'Çırak spor %', v_t; end if;
  if bb_quest_title((select title from quest_catalog where code = 'SPORT'), (select targets from quest_catalog where code = 'SPORT'), 6, 'M') <> 'Tempolu spor · 75 dk'
     or bb_quest_title((select title from quest_catalog where code = 'SPORT'), (select targets from quest_catalog where code = 'SPORT'), 5, 'M') <> 'Tempolu spor · 60 dk' then raise exception 'erkek spor'; end if;
  select count(*) into v_n from quest_catalog q, generate_series(1, 6) d, (values ('F'), ('M')) gg(x)
    where q.min_difficulty <= d and bb_quest_title(q.title, q.targets, d, gg.x) like '%{t}%';
  if v_n > 0 then raise exception '{t} kalan başlık: %', v_n; end if;
  if (select title from quests where user_id = a and local_date = v_today and code = 'QURAN') <> 'Kur''an · 20 sayfa'
     or (select title from quests where user_id = a and local_date = v_today and code = 'ENGLISH') <> 'İngilizce · 30 kelime'
     or (select title from quests where user_id = a and local_date = v_today and code = 'READING') <> 'Kitap · 60 dk' then raise exception 'Kur''an/İngilizce/Kitap hedefi'; end if;
  res := res || E'\ngörevler · Destansı 17 görev (kaza 2 vakit + duha), spor kadın 60 / erkek 75, Kur''an 20 s, İngilizce 30, Kitap 60 dk; hiçbir başlıkta {t} yok ✓';

  -- 3) Eşit katkı: Çırak ve Destansı'nın tam günü canavara yaklaşık aynı hasar; XP yine zorlukla büyür
  select sum(damage), sum(xp) into v_da, v_xa from quests where user_id = a and local_date = v_today;
  select sum(damage), sum(xp) into v_db, v_xb from quests where user_id = b and local_date = v_today;
  if coalesce((select event from hero_days where user_id = a and local_date = v_today), '') not in ('SPIRIT_SURGE', 'BOSS_RAGE')
     and (v_da not between 285 and 345 or v_db not between 285 and 345) then raise exception 'hasar eşit değil: Destansı % / Çırak %', v_da, v_db; end if;
  if v_xa < v_xb * 4 then raise exception 'XP zorlukla büyümüyor % / %', v_xa, v_xb; end if;
  v_boss := bb_ensure_boss(cp, bb_week_start(v_today) + 7);
  if v_boss.max_hp <> 2520 then raise exception 'canavar canı %', v_boss.max_hp; end if;
  res := res || E'\neşit katkı · tam gün hasarı Destansı ' || v_da || ' / Çırak ' || v_db || ', XP ' || v_xa || ' / ' || v_xb || ', canavar 2520 ✓';

  -- 4) Özel gün: kaza namazı da gizlenir, adalet yine birebir
  g := set_special(true);
  if exists (select 1 from quests where user_id = a and local_date = v_today and code = 'KAZA' and not hidden) then raise exception 'kaza gizlenmedi'; end if;
  select sum(xp), sum(gold), sum(damage) into h_xp, h_gold, h_dmg from quests where user_id = a and local_date = v_today and hidden;
  select sum(xp), sum(gold), sum(damage) into s_xp, s_gold, s_dmg from quests where user_id = a and local_date = v_today and code like 'SP\_%';
  if h_xp <> s_xp or h_gold <> s_gold or h_dmg <> s_dmg then raise exception 'adalet % % % / % % %', h_xp, h_gold, h_dmg, s_xp, s_gold, s_dmg; end if;
  g := set_special(false);
  res := res || E'\nözel gün · kaza namazı gizlenir, aktarım birebir ✓';

  -- 5) Can cezası: Çırak boş gün −18; Acemi (2.25) boş gün 9 görevde −20
  update heroes set hp = 100 where user_id = b;
  perform bb_close_day(b, v_today);
  if (select hp_lost from hero_days where user_id = b and local_date = v_today) <> 18 then raise exception 'Çırak boş gün %', (select hp_lost from hero_days where user_id = b and local_date = v_today); end if;
  update hero_days set closed = false, hp_lost = 0, difficulty = 2 where user_id = b and local_date = v_today;
  update heroes set hp = 100 where user_id = b;
  perform bb_close_day(b, v_today);
  if (select hp_lost from hero_days where user_id = b and local_date = v_today) <> 20 then raise exception 'Acemi ondalık %', (select hp_lost from hero_days where user_id = b and local_date = v_today); end if;
  update heroes set hp = 100 where user_id = a;
  perform bb_close_day(a, v_today);
  if (select hp_lost from hero_days where user_id = a and local_date = v_today) <> 51 or (select hp from heroes where user_id = a) <> 49 then raise exception 'Destansı boş gün %', (select hp_lost from hero_days where user_id = a and local_date = v_today); end if;
  res := res || E'\ncan · boş gün Çırak −18, Acemi −20 (2.25 × 9), Destansı −51; bayılma yok ✓';

  -- 6) Yetkiler
  if has_function_privilege('authenticated', 'bb_quest_title(text, jsonb, int, text)', 'execute') or has_function_privilege('authenticated', 'bb_damage_k(int)', 'execute') then raise exception 'fazla yetki'; end if;
  if not has_function_privilege('authenticated', 'use_skill()', 'execute') or not has_function_privilege('authenticated', 'set_special(boolean, text[], text[])', 'execute') then raise exception 'yetki eksik'; end if;
  res := res || E'\nyetki · yardımcılar kapalı, RPC''ler açık ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
