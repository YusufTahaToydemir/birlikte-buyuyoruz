-- Oyun v2 sunucu testleri. SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; r jsonb; q record; res text := ''; v_today date; n int; x int; bo bosses;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T-KEY'), 'gametest');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gt_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"gt_a","display_name":"A","setup_key":"T-KEY"}', now(), now());
  select id into a from app_users where username = 'gt_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gt_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"gt_b","display_name":"B","invite_token":"T-INV"}', now(), now());
  select id into b from app_users where username = 'gt_b';

  -- A: Savaşçı, zorluk 1
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  g := get_game();
  if g->'hero' <> 'null'::jsonb then raise exception 'kahraman olmamalı'; end if;
  g := create_hero('Ayşe', 'WARRIOR', '{"gender":"F","skin":1,"hair":2,"hairColor":3}', 1);
  n := jsonb_array_length(g->'quests');
  -- Çırak: 5 namaz + Kur'an + İngilizce + Kitap + Spor = 9 günlük + 1 sürpriz
  if (select count(*) from jsonb_array_elements(g->'quests') e where e->>'kind' = 'DAILY') <> 9 then raise exception 'günlük sayısı %', n; end if;
  if (select count(*) from jsonb_array_elements(g->'quests') e where e->>'kind' = 'SIDE') <> 1 then raise exception 'sürpriz sayısı'; end if;
  if (g->'hero'->>'hp')::int <> 100 then raise exception 'başlangıç canı %', g->'hero'->>'hp'; end if;
  res := res || E'\nkurulum · 9 günlük + 1 sürpriz, can 100 ✓';

  -- Savaşçı spor bonusu: 20 * 1.0 * 1.1 = 22 XP; namaz 10
  if (select (e->>'xp')::int from jsonb_array_elements(g->'quests') e where e->>'code' = 'SPORT') <> 22 then raise exception 'sınıf bonusu'; end if;
  res := res || E'\nsınıf bonusu · Savaşçı spor 22 XP ✓';

  -- Görev tamamla: XP, altın, boss hasarı
  select (e->>'id')::uuid as id into q from jsonb_array_elements(g->'quests') e where e->>'code' = 'SPORT';
  r := complete_quest(q.id, true);
  if (r->'delta'->>'xp')::int <> 22 or (r->'game'->'hero'->>'xp')::int <> 22 or (r->'game'->'hero'->>'gold')::int <> 10 then raise exception 'tamamlama %', r->'delta'; end if;
  if (r->'delta'->>'damage')::int <> 22 then raise exception 'boss hasarı'; end if;
  if ((r->'game'->'boss'->>'maxHp')::int - (r->'game'->'boss'->>'hp')::int) <> 22 then raise exception 'boss can'; end if;
  r := complete_quest(q.id, true);
  if (r->'delta'->>'xp')::int <> 0 then raise exception 'çift tık'; end if;
  r := complete_quest(q.id, false);
  if (r->'game'->'hero'->>'xp')::int <> 0 or (r->'game'->'boss'->>'hp') <> (r->'game'->'boss'->>'maxHp') then raise exception 'geri al'; end if;
  res := res || E'\ngörev · +22 XP +10 altın, boss -22; tekrar tık etkisiz; geri al her şeyi geri verir ✓';

  -- Seviye atlama: tüm görevleri yap (>=100 XP)
  for q in select (e->>'id')::uuid as id from jsonb_array_elements(g->'quests') e loop
    r := complete_quest(q.id, true);
  end loop;
  if (r->'game'->'hero'->>'level')::int < 2 then raise exception 'seviye %', r->'game'->'hero'->>'xp'; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'LEVEL_UP') then raise exception 'seviye olayı'; end if;
  if not exists (select 1 from achievements where user_id = a and key = 'FIRST_QUEST') then raise exception 'rozet'; end if;
  res := res || E'\nseviye · tüm gün = seviye 2, olay ve ilk rozet ✓';

  -- B: Büyücü, zorluk 4; bugün hiçbir şey yapmadan dün kaçırmış gibi kapanış
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  g := create_hero('Ali', 'MAGE', '{"gender":"M","skin":0,"hair":0,"hairColor":0}', 4);
  if (select count(*) from jsonb_array_elements(g->'quests') e where e->>'kind' = 'SIDE') <> 3 then raise exception 'B sürpriz'; end if;
  -- Kahraman: 5 namaz + kalkış + Kur'an + tesbih + İng + kitap + dinî + spor + beslenme + şekersiz = 14
  if (select count(*) from jsonb_array_elements(g->'quests') e where e->>'kind' = 'DAILY') <> 14 then raise exception 'B günlük %', (select count(*) from jsonb_array_elements(g->'quests') e where e->>'kind' = 'DAILY'); end if;
  res := res || E'\nzorluk 4 · 14 günlük + 3 sürpriz ✓';

  -- Gün kapanışı: B 14 görevi kaçırdı -> 14*5 = 70 hasar; can 100 -> 30
  v_today := bb_local_date(now(), 'Europe/Istanbul');
  perform bb_close_day(b, v_today);
  if (select hp from heroes where user_id = b) <> 30 then raise exception 'hasar %', (select hp from heroes where user_id = b); end if;
  res := res || E'\ncan · 14 kaçırılan × 5 = 70 hasar ✓';

  -- İzin günü: hasar yok
  update hero_days set closed = false, izin = true where user_id = b and local_date = v_today;
  update heroes set hp = 100 where user_id = b;
  perform bb_close_day(b, v_today);
  if (select hp from heroes where user_id = b) <> 100 then raise exception 'izin'; end if;
  res := res || E'\nizin · hasar yok ✓';

  -- Bayılma: can 10, kaçırma -> 0 altında -> yarı can, %10 altın kaybı
  update hero_days set closed = false, izin = false where user_id = b and local_date = v_today;
  update heroes set hp = 10, gold = 200 where user_id = b;
  perform bb_close_day(b, v_today);
  if (select hp from heroes where user_id = b) <> 50 or (select gold from heroes where user_id = b) <> 180 then raise exception 'bayılma'; end if;
  res := res || E'\nbayılma · can yarıya, 200 -> 180 altın ✓';

  -- Ortak: alkış, altın gönder
  r := social_action('CHEER', 0);
  if (select xp from heroes where user_id = a) <> (select sum(xp) from hero_log where user_id = a) then raise exception 'alkış xp'; end if;
  perform social_action('CHEER', 0); perform social_action('CHEER', 0);
  begin perform social_action('CHEER', 0); raise exception 'x'; exception when others then if sqlerrm <> 'DAILY_LIMIT' then raise; end if; end;
  r := social_action('GIFT', 25);
  if (select gold from heroes where user_id = b) <> 155 then raise exception 'hediye'; end if;
  res := res || E'\nortak · alkış +5 XP (günde 3), altın gönder ✓';

  -- Dükkan: seviye kilidi, yetersiz altın, iksir
  begin perform buy_item('weapon_4'); raise exception 'x'; exception when others then if sqlerrm <> 'LEVEL_LOCKED' then raise; end if; end;
  r := buy_item('potion_small');
  if (r->'inventory'->>'potion_small')::int <> 1 then raise exception 'iksir'; end if;
  r := use_potion('potion_small');
  if (r->'hero'->>'hp')::int <> 80 then raise exception 'iksir can %', r->'hero'->>'hp'; end if;
  res := res || E'\ndükkan · seviye kilidi, iksir +30 ✓';

  -- Boss: yen -> iki kişiye bilet + altın
  select * into bo from bosses where couple_id = cp;
  update bosses set hp = 5 where id = bo.id;
  select id into q from quests where user_id = b and local_date = v_today and done = false limit 1;
  update hero_days set closed = false where user_id = b and local_date = v_today;
  r := complete_quest(q.id, true);
  if not (r->'game'->'boss'->>'defeated')::boolean then raise exception 'boss yenilmedi'; end if;
  if (select count(*) from tickets where source = 'BOSS') <> 2 then raise exception 'boss bileti'; end if;
  res := res || E'\nboss · yenildi, ikinize bilet + altın ✓';

  -- Zorluk: görev yapılmışsa yarın
  r := set_difficulty(6);
  if (r->'hero'->>'pendingDifficulty')::int <> 6 or (r->'hero'->>'difficulty')::int <> 4 then raise exception 'zorluk bekleme'; end if;
  res := res || E'\nzorluk · görev yapılmışsa ertesi gün geçerli ✓';

  -- Partner başkasının görevini işaretleyemez
  select id into q from quests where user_id = a limit 1;
  begin perform complete_quest(q.id, true); raise exception 'x'; exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  res := res || E'\ngüvenlik · başkasının görevi NOT_FOUND ✓';

  raise exception E'OYUN TESTLERİ (geri alındı):%', res;
end $$;
