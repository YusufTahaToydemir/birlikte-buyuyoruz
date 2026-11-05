-- 0012 testleri: özel gün modu (gizleme, adil aktarım, geri alma, seri/can/zincir, eş görünümü, otomatik kapanma, yetki).
-- SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; res text := ''; v_today date; fajr uuid; dua uuid; v_n int;
  h_xp int; h_gold int; h_dmg int; s_xp int; s_gold int; s_dmg int; v_streak int; v_vis int; v_hp int;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T12-KEY'), 'gametest12');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g12_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g12_a","display_name":"A","setup_key":"T12-KEY"}', now(), now());
  select id into a from app_users where username = 'g12_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T12-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g12_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g12_b","display_name":"B","invite_token":"T12-INV"}', now(), now());
  select id into b from app_users where username = 'g12_b';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 6);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := create_hero('Ayşe', 'HEALER', '{"gender":"F"}', 6);
  v_today := (g->>'today')::date;
  insert into quest_chains (user_id, code, chain, best, last_date) values (a, 'DHUHR', 5, 5, v_today - 1) on conflict (user_id, code) do update set chain = 5, best = 5, last_date = v_today - 1;
  select count(*) into v_vis from jsonb_array_elements(g->'quests') e where e->>'kind' = 'DAILY';

  -- sabah namazı mod açılmadan önce yapıldı → görünür kalır
  select id into fajr from quests where user_id = a and local_date = v_today and code = 'FAJR';
  g := (complete_quest(fajr, true))->'game';

  -- 1) Mod açılır: ibadet görevleri gizlenir, 3 yeni görev gelir, XP/altın/hasar birebir aktarılır
  g := set_special(true);
  if not (g->'special'->>'on')::boolean or (g->'hero'->>'special')::boolean is not true then raise exception 'mod açılmadı'; end if;
  if exists (select 1 from jsonb_array_elements(g->'quests') e where e->>'code' in ('DHUHR','ASR','MAGHRIB','ISHA','SUNNAH','QURAN','DHIKR')) then raise exception 'gizlenmedi'; end if;
  if not exists (select 1 from jsonb_array_elements(g->'quests') e where e->>'code' = 'FAJR' and (e->>'done')::boolean) then raise exception 'yapılmış FAJR kayboldu'; end if;
  if (select count(*) from jsonb_array_elements(g->'quests') e where e->>'code' like 'SP\_%') <> 3 then raise exception 'yerine görev sayısı'; end if;
  select sum(xp), sum(gold), sum(damage) into h_xp, h_gold, h_dmg from quests where user_id = a and local_date = v_today and hidden;
  select sum(xp), sum(gold), sum(damage) into s_xp, s_gold, s_dmg from quests where user_id = a and local_date = v_today and code like 'SP\_%';
  if h_xp <> s_xp or h_gold <> s_gold or h_dmg <> s_dmg or h_xp < 50 then raise exception 'adalet: gizli % % % / yerine % % %', h_xp, h_gold, h_dmg, s_xp, s_gold, s_dmg; end if;
  res := res || E'\nmod açıldı · ibadet görevleri gizli, yapılmış sabah namazı kaldı; yerine 3 görev; XP ' || h_xp || ' / altın ' || h_gold || ' / hasar ' || h_dmg || ' birebir aktarıldı ✓';

  -- 2) Yerine gelen görev yapılır; mod kapanır → gizliler geri gelir, yapılan yerine görev kalır, yapılmayanlar silinir
  select id into dua from quests where user_id = a and local_date = v_today and code = 'SP_DUA';
  g := (complete_quest(dua, true))->'game';
  g := set_special(false);
  if (g->'special'->>'on')::boolean then raise exception 'mod kapanmadı'; end if;
  if not exists (select 1 from jsonb_array_elements(g->'quests') e where e->>'code' = 'DHUHR') or exists (select 1 from quests where user_id = a and local_date = v_today and hidden) then raise exception 'gizliler geri gelmedi'; end if;
  if not exists (select 1 from jsonb_array_elements(g->'quests') e where e->>'code' = 'SP_DUA' and (e->>'done')::boolean) then raise exception 'yapılan dua kayboldu'; end if;
  if exists (select 1 from jsonb_array_elements(g->'quests') e where e->>'code' in ('SP_ISTIGFAR','SP_LISTEN')) then raise exception 'yapılmayan yerine görevler silinmedi'; end if;
  res := res || E'\nmod kapandı · gizliler geri geldi, yapılan "Dua et" kaldı, yapılmayanlar silindi ✓';

  -- 3) Tekrar aç: yapılmış duanın değeri havuzdan düşülür; toplam yine birebir aynı
  g := set_special(true, null, null);
  select sum(xp), sum(gold), sum(damage) into h_xp, h_gold, h_dmg from quests where user_id = a and local_date = v_today and hidden;
  select sum(xp), sum(gold), sum(damage) into s_xp, s_gold, s_dmg from quests where user_id = a and local_date = v_today and code like 'SP\_%';
  if h_xp <> s_xp or h_gold <> s_gold or h_dmg <> s_dmg then raise exception 'adalet (yeniden): % % % / % % %', h_xp, h_gold, h_dmg, s_xp, s_gold, s_dmg; end if;
  if (select count(*) from quests where user_id = a and local_date = v_today and code like 'SP\_%') <> 3 then raise exception 'yeniden sayı'; end if;
  res := res || E'\nyeniden aç · toplam yine birebir (yapılmış dua havuzdan düşüldü) ✓';

  -- 4) Ekstra görev seçimi: 5 görev, toplam yine aynı
  g := set_special(null, null, array['SP_DUA','SP_ISTIGFAR','SP_LISTEN','SP_SALAVAT','SP_SADAKA']);
  select sum(xp), sum(gold), sum(damage) into h_xp, h_gold, h_dmg from quests where user_id = a and local_date = v_today and hidden;
  select sum(xp), sum(gold), sum(damage), count(*) into s_xp, s_gold, s_dmg, v_n from quests where user_id = a and local_date = v_today and code like 'SP\_%';
  if v_n <> 5 or h_xp <> s_xp or h_gold <> s_gold or h_dmg <> s_dmg then raise exception 'ekstra seçim % : % % %', v_n, s_xp, s_gold, s_dmg; end if;
  begin g := set_special(null, null, array['SP_YOK']); raise exception 'geçersiz görev kabul';
  exception when others then if sqlerrm <> 'INVALID_VALUE' then raise; end if; end;
  begin g := set_special(null, array['WAKE'], null); raise exception 'geçersiz gizleme kabul';
  exception when others then if sqlerrm <> 'INVALID_VALUE' then raise; end if; end;
  res := res || E'\nekstra · 5 görev seçilince toplam aynı; geçersiz görev/gizleme reddedilir ✓';

  -- 5) Eş yalnızca simgeyi görür; sayaçta gizli görevler yok
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := get_game();
  if (g->'partner'->>'special')::boolean is not true then raise exception 'eş simgesi'; end if;
  if g->'partner' ? 'specialHide' or g->'partner' ? 'specialExtra' then raise exception 'eşe ayrıntı sızdı'; end if;
  if (g->'partner'->>'todayTotal')::int <> (select count(*) from quests where user_id = a and local_date = v_today and kind = 'DAILY' and not hidden) then raise exception 'eş sayacı'; end if;
  res := res || E'\neş görünümü · yalnızca "special: true" simgesi; sayaç gizlileri saymıyor ✓';

  -- 6) Görünür görevler bitince gün TAM sayılır: seri +1, can kaybı yok, kombo koşulu, gizli görevlerin zinciri korunur
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select streak, hp into v_streak, v_hp from heroes where user_id = a;
  update quests set done = true where user_id = a and local_date = v_today and kind = 'DAILY' and not hidden;
  perform bb_close_day(a, v_today);
  if not (select all_done from hero_days where user_id = a and local_date = v_today) or (select hp_lost from hero_days where user_id = a and local_date = v_today) <> 0 then raise exception 'gün tam sayılmadı'; end if;
  if (select streak from heroes where user_id = a) <> v_streak + 1 or (select hp from heroes where user_id = a) < v_hp then raise exception 'seri/can'; end if;
  if (select chain from quest_chains where user_id = a and code = 'DHUHR') <> 5 or (select last_date from quest_chains where user_id = a and code = 'DHUHR') <> v_today then raise exception 'gizli görev zinciri bozuldu'; end if;
  res := res || E'\ngün kapanışı · gün tam, seri +1, can kaybı 0, gizli "Öğle namazı" zinciri (5) korundu ✓';

  -- 7) 14 günden uzun açık kalan mod yeni günde kendiliğinden kapanır
  update heroes set special_since = v_today - 20 where user_id = a;
  perform bb_generate_day(a, v_today + 1);
  if (select special_since from heroes where user_id = a) is not null or exists (select 1 from quests where user_id = a and local_date = v_today + 1 and (hidden or code like 'SP\_%')) then raise exception 'otomatik kapanma'; end if;
  res := res || E'\notomatik kapanma · 14 günü aşan mod kapandı, yeni gün normal ✓';

  -- 7b) Yalnızca kadın karakter: erkek (B) açamaz, kapatabilir; kadın (A) açıkken görünümü erkeğe çevrilirse mod kapanır
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin g := set_special(true); raise exception 'erkek kahramanda açıldı';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  begin g := set_special(null, array['FAJR'], null); raise exception 'erkek kahramanda liste değişti';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  g := set_special(false);
  if (g->'special'->>'on')::boolean then raise exception 'erkek kapatamadı'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := set_special(true);
  if not (g->'special'->>'on')::boolean then raise exception 'kadın açamadı'; end if;
  update heroes set look = look || '{"gender":"M"}'::jsonb where user_id = a;
  if (select special_since from heroes where user_id = a) is not null then raise exception 'görünüm erkek olunca mod kapanmadı'; end if;
  update heroes set look = look || '{"gender":"F"}'::jsonb where user_id = a;
  res := res || E'\nkadın karakter · erkek açamaz/liste değiştiremez (NOT_ALLOWED), kapatabilir; görünüm erkeğe dönünce mod kapanır ✓';

  -- 8) Yetkiler
  if not has_function_privilege('authenticated', 'set_special(boolean, text[], text[])', 'execute') then raise exception 'yetki eksik'; end if;
  if has_function_privilege('authenticated', 'bb_special_apply(uuid, date)', 'execute') or has_function_privilege('authenticated', 'bb_special_clear(uuid, date)', 'execute') then raise exception 'fazla yetki'; end if;
  res := res || E'\nyetki · yalnızca set_special çağrılabilir ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
