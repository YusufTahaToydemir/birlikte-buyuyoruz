-- 0020-0022 testleri: sudoku puanı + kalıcı dost rengi + keşif paketi. SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', u::text, true);
$$;

do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; p jsonb; res text := ''; v_today date; pet uuid; v_err text; n int; k int;
  sg sudoku_games; v_easy int; v_hard int; v_ga int; v_gb int; e uuid; f jsonb; v_love int; cap uuid; i int;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T22-KEY'), 'gametest22');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g22_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g22_a","display_name":"Ayşe","setup_key":"T22-KEY"}', now(), now());
  select id into a from app_users where username = 'g22_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T22-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g22_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g22_b","display_name":"Ali","invite_token":"T22-INV"}', now(), now());
  select id into b from app_users where username = 'g22_b';
  perform pg_temp.as_user(b); g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 2);
  perform pg_temp.as_user(a); g := create_hero('Ayşe', 'HEALER', '{"gender":"F"}', 2);
  v_today := (g->>'today')::date;
  update heroes set gold = 5000 where user_id in (a, b);

  -- 1) Sudoku bankası ve zorluğa göre puan
  if (select count(*) from sudoku_bank) <> 90 or exists (select level from sudoku_bank group by level having count(*) <> 30) then raise exception 'banka'; end if;
  perform sudoku_start(1);
  select * into sg from sudoku_games where couple_id = cp and status = 'ACTIVE';
  select min(j) into v_easy from generate_series(0, 80) j where substr(sg.board, j + 1, 1) = '0' and bb_sudoku_single(sg.board, j, substr(sg.solution, j + 1, 1)::int);
  select min(j) into v_hard from generate_series(0, 80) j where substr(sg.board, j + 1, 1) = '0' and not bb_sudoku_single(sg.board, j, substr(sg.solution, j + 1, 1)::int);
  if v_easy is null or v_hard is null then raise exception 'kolay/zor hücre bulunamadı'; end if;
  g := sudoku_move(v_hard, substr(sg.solution, v_hard + 1, 1)::int);
  if (g->'game'->'lastMove'->>'pts')::int <> 3 or not (g->'game'->'lastMove'->>'hard')::boolean then raise exception 'zor hücre %', g->'game'->'lastMove'; end if;
  select * into sg from sudoku_games where id = sg.id;
  select min(j) into v_easy from generate_series(0, 80) j where substr(sg.board, j + 1, 1) = '0' and bb_sudoku_single(sg.board, j, substr(sg.solution, j + 1, 1)::int);
  g := sudoku_move(v_easy, substr(sg.solution, v_easy + 1, 1)::int);
  if (g->'game'->'lastMove'->>'pts')::int <> 1 or (g->'game'->>'scoreA')::int <> 4 then raise exception 'kolay hücre %', g->'game'; end if;
  select * into sg from sudoku_games where id = sg.id;
  select min(j) into k from generate_series(0, 80) j where substr(sg.board, j + 1, 1) = '0';
  g := sudoku_move(k, case when substr(sg.solution, k + 1, 1) = '9' then 1 else substr(sg.solution, k + 1, 1)::int + 1 end);
  if (g->'game'->>'scoreA')::int <> 2 or (g->'game'->>'turn')::uuid <> b then raise exception 'yanlış hamle %', g->'game'; end if;
  -- birimin son boşluğu artık ekstra puan vermez: tek boşluklu satırın hücresi kolaydır
  if not bb_sudoku_single(overlay(sg.solution placing '0' from 1 for 1), 0, substr(sg.solution, 1, 1)::int) then raise exception 'son boşluk tek değil'; end if;
  perform sudoku_cancel();
  res := res || E'\nsudoku · zor hücre +3, kolay +1, yanlış −2, banka 3×30 ✓';

  -- 2) Dost: birlikte sahiplen; renk kalıcı
  p := pet_adopt_start('cat', 'c1', 'Pamuk');
  perform pg_temp.as_user(b);
  p := pet_adopt_confirm((p->'pending'->>'id')::uuid);
  pet := (p->'pets'->0->>'id')::uuid;
  v_err := null; begin perform pet_dress(pet, 'COLOR', 'c2'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'INVALID_VALUE' then raise exception 'renk değişti: %', v_err; end if;
  v_err := null; begin perform pet_buy_item('pink'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'boya satıldı: %', v_err; end if;
  if not exists (select 1 from memories where couple_id = cp and kind = 'PET_NEW') then raise exception 'dost anısı yok'; end if;
  res := res || E'\ndost rengi · boya yok, renk değişmez, ilk dost anısı ✓';

  -- 3) Keşif: bölge kilidi, aynı anda tek yolculuk, hazır olmadan alınamaz, ödül ikinize
  v_err := null; begin perform pet_explore(pet, 1); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'REGION_LOCKED' then raise exception 'bölge kilidi: %', v_err; end if;
  p := pet_explore(pet, 0);
  e := (p->'pets'->0->'away'->>'id')::uuid;
  if e is null then raise exception 'keşifte görünmüyor %', p->'pets'->0; end if;
  v_err := null; begin perform pet_explore(pet, 0); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'PET_AWAY' then raise exception 'iki yolculuk: %', v_err; end if;
  v_err := null; begin perform pet_send_letter(pet, 'HEART', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'PET_AWAY' then raise exception 'keşifteki dost mektup taşıdı: %', v_err; end if;
  v_err := null; begin perform pet_explore_claim(e); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_READY' then raise exception 'erken dönüş: %', v_err; end if;
  update pet_expeditions set ends_at = now() - interval '1 minute' where id = e;
  perform pg_temp.as_user(a);
  if not ((get_game())->'play'->>'explore')::boolean then raise exception 'dönüş işareti yok'; end if;
  v_ga := (select gold from heroes where user_id = a); v_gb := (select gold from heroes where user_id = b);
  v_love := (select love from couple_pets where id = pet);
  p := pet_explore_claim(e);
  if (select gold from heroes where user_id = a) - v_ga <> (p->'loot'->>'gold')::int or (select gold from heroes where user_id = b) - v_gb <> (p->'loot'->>'gold')::int
     or (p->'loot'->>'gold')::int < 15 then raise exception 'keşif altını %', p->'loot'; end if;
  if (select love from couple_pets where id = pet) - v_love < 6 then raise exception 'keşif sevgisi'; end if;
  if not exists (select 1 from hero_events where user_id = b and kind = 'PET_BACK') then raise exception 'eşe dönüş olayı yok'; end if;
  if not exists (select 1 from memories where couple_id = cp and key = 'explore:1') then raise exception 'ilk keşif anısı yok'; end if;
  p := pet_explore(pet, 0);
  update pet_expeditions set ends_at = now() - interval '1 minute' where pet_id = pet and claimed_at is null;
  perform pet_explore_claim((p->'pets'->0->'away'->>'id')::uuid);
  v_err := null; begin perform pet_explore(pet, 0); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'DAILY_LIMIT' then raise exception 'günlük keşif sınırı: %', v_err; end if;
  res := res || E'\nkeşif · kilit, tek yolculuk, erken dönüş yok, ikinize ' || (p->'loot'->>'gold') || ' altın, günde 2 ✓';

  -- 4) Harita: 4 zafer → yeni bölge, anı ve olay
  for i in 1..4 loop
    insert into bosses (couple_id, week_start, boss_key, name, max_hp, hp) values (cp, v_today - 7 * (i + 10), 'slime_green', 'Balçık', 100, 0);
    update bosses set defeated_at = now() - make_interval(days => 70 - i) where couple_id = cp and week_start = v_today - 7 * (i + 10);
  end loop;
  g := get_game();
  if (g->'world'->>'region')::int <> 1 or (g->'world'->>'progress')::int <> 4 then raise exception 'bölge %', g->'world'; end if;
  if not exists (select 1 from memories where couple_id = cp and key = 'region:1') or not exists (select 1 from memories where couple_id = cp and key = 'boss:1') then raise exception 'bölge anısı'; end if;
  if (select count(*) from hero_events where kind = 'REGION' and user_id in (a, b)) <> 2 then raise exception 'bölge olayı'; end if;
  update pet_expeditions set local_date = v_today - 1 where pet_id = pet;
  p := pet_explore(pet, 1);
  if (p->'pets'->0->'away'->>'region')::int <> 1 then raise exception 'yeni bölgeye keşif'; end if;
  delete from pet_expeditions where pet_id = pet and claimed_at is null;
  res := res || E'\nharita · 4 zafer = Fısıltı Ormanı, anı + olay, yeni keşif yeri ✓';

  -- 5) Elçi: kalp + not, eşin postası, günde 3
  p := pet_send_letter(pet, 'HEART', null);
  p := pet_send_letter(pet, 'NOTE', 'Seni düşündüm');
  v_err := null; begin perform pet_send_letter(pet, 'NOTE', repeat('x', 81)); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'INVALID_VALUE' then raise exception 'uzun not: %', v_err; end if;
  p := pet_send_letter(pet, 'HEART', null);
  v_err := null; begin perform pet_send_letter(pet, 'HEART', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'DAILY_LIMIT' then raise exception 'elçi sınırı: %', v_err; end if;
  perform pg_temp.as_user(b);
  g := get_game();
  if jsonb_array_length(g->'petMail') <> 3 or g->'petMail'->1->>'text' <> 'Seni düşündüm' then raise exception 'posta %', g->'petMail'; end if;
  perform pet_letter_seen((g->'petMail'->0->>'id')::uuid);
  if jsonb_array_length((get_game())->'petMail') <> 2 then raise exception 'okundu'; end if;
  res := res || E'\nelçi · kalp + not eşe ulaşır, okununca düşer, günde 3 ✓';

  -- 6) Bahçe: tohum al, ek, ikiniz sulayınca büyür, hasat ikinize
  v_ga := (select gold from heroes where user_id = b);
  g := garden_buy_seed('daisy');
  if v_ga - (select gold from heroes where user_id = b) <> 20 then raise exception 'tohum fiyatı'; end if;
  v_err := null; begin perform garden_buy_seed('lavender'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'nadir tohum satıldı: %', v_err; end if;
  g := garden_plant(0, 'daisy');
  g := garden_water();
  if (g->'plots'->0->>'growth')::int <> 0 then raise exception 'tek sulama büyüttü'; end if;
  v_err := null; begin perform garden_water(); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'DAILY_LIMIT' then raise exception 'çift sulama: %', v_err; end if;
  perform pg_temp.as_user(a);
  g := garden_water();
  if (g->'plots'->0->>'growth')::int <> 1 then raise exception 'ikili sulama büyütmedi %', g->'plots'; end if;
  v_err := null; begin perform garden_harvest(0); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_READY' then raise exception 'erken hasat: %', v_err; end if;
  update garden_plots set growth = need where couple_id = cp;
  v_ga := (select gold from heroes where user_id = a); v_gb := (select gold from heroes where user_id = b);
  g := garden_harvest(0);
  if (select gold from heroes where user_id = a) - v_ga <> 15 or (select gold from heroes where user_id = b) - v_gb <> 15 then raise exception 'hasat altını'; end if;
  if (g->'flowers'->>'daisy')::int <> 1 or jsonb_array_length(g->'plots') <> 0 then raise exception 'hasat %', g; end if;
  if not exists (select 1 from memories where couple_id = cp and key = 'harvest:1') then raise exception 'hasat anısı'; end if;
  res := res || E'\nbahçe · ikiniz sulayınca büyür, hasat ikinize 15 altın + çiçek ✓';

  -- 7) Zaman kapsülü
  p := capsule_write('Üç ay sonra okuyacağız', 3);
  cap := (p->'capsules'->0->>'id')::uuid;
  if p->'capsules'->0->>'text' is not null then raise exception 'kapsül erken açıldı'; end if;
  perform pg_temp.as_user(b);
  if (get_game())->'play'->>'capsule' is not null then raise exception 'kapalı kapsül işaretli'; end if;
  update time_capsules set open_at = now() - interval '1 minute' where id = cap;
  if ((get_game())->'play'->>'capsule')::uuid <> cap then raise exception 'açık kapsül işareti yok'; end if;
  p := capsule_read(cap);
  if p->'capsules'->0->>'text' <> 'Üç ay sonra okuyacağız' or (get_game())->'play'->>'capsule' is not null then raise exception 'kapsül okuma %', p; end if;
  if not exists (select 1 from memories where couple_id = cp and key = 'capsule:' || cap) then raise exception 'kapsül anısı'; end if;
  res := res || E'\nkapsül · kapalıyken metin gelmez, açılınca ikinize işaret, anı olur ✓';

  -- 8) Yol ayrımı: farklı oy → zar; aynı oy → etki + 25 altın
  g := get_game();
  if not (g->'play'->>'fork')::boolean or (g->'fork'->>'pair') is null then raise exception 'yol ayrımı yok %', g->'fork'; end if;
  g := fork_vote('A');
  if (g->'play'->>'fork')::boolean or g->'fork'->>'mine' <> 'A' or g->'fork'->>'result' is not null then raise exception 'ilk oy %', g->'fork'; end if;
  v_err := null; begin perform fork_vote('B'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'INVALID_STATE' then raise exception 'iki oy: %', v_err; end if;
  perform pg_temp.as_user(a);
  if not ((get_game())->'fork'->>'partnerVoted')::boolean then raise exception 'eşin oyu görünmüyor'; end if;
  g := fork_vote('B');
  if g->'fork'->>'result' not in ('A','B') or (g->'fork'->>'agreed')::boolean then raise exception 'zar %', g->'fork'; end if;
  delete from week_forks where couple_id = cp;
  v_ga := (select gold from heroes where user_id = a); v_gb := (select gold from heroes where user_id = b);
  g := fork_vote('B');
  perform pg_temp.as_user(b);
  g := fork_vote('B');
  if g->'fork'->>'result' <> 'B' or not (g->'fork'->>'agreed')::boolean then raise exception 'uzlaşma %', g->'fork'; end if;
  if (select gold from heroes where user_id = a) - v_ga <> 25 or (select gold from heroes where user_id = b) - v_gb <> 25 then raise exception 'uzlaşma altını'; end if;
  f := bb_world_cfg()->'forks'->((g->'fork'->>'pair')::int)->'b';
  if bb_fork_mult(cp, v_today, f->>'fx') <= 1 then raise exception 'yol etkisi yok %', f; end if;
  if (select count(*) from hero_events where kind = 'FORK_RESULT' and user_id in (a, b)) < 4 then raise exception 'yol olayı'; end if;
  res := res || E'\nyol ayrımı · farklı oy zar, aynı oy ' || (f->>'fx') || ' etkisi + 25 altın ✓';

  -- 9) Dün özeti, koleksiyon, anılar listesi
  g := get_game();
  if g->'yesterday' is null or g->'garden' is null then raise exception 'günaydın verisi'; end if;
  p := get_collection();
  if (p->'flowers'->>'daisy')::int <> 1 or jsonb_array_length(p->'pets') <> 1 or (p->>'region')::int <> 1 then raise exception 'koleksiyon %', p; end if;
  p := get_memories();
  if jsonb_array_length(p->'memories') < 5 then raise exception 'anılar %', p->'memories'; end if;
  res := res || E'\ndefter · ' || jsonb_array_length(p->'memories') || ' anı, koleksiyon ve dün özeti ✓';

  -- 10) Yetkiler
  if has_function_privilege('authenticated', 'bb_memory(uuid, text, text, jsonb, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'bb_sudoku_single(text, int, int)', 'execute')
     or not has_function_privilege('authenticated', 'pet_explore(uuid, int)', 'execute')
     or not has_function_privilege('authenticated', 'get_world()', 'execute') then raise exception 'yetki'; end if;

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
