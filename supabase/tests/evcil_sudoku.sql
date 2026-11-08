-- 0017/0018 testleri: ortak evcil dostlar ve sudoku. SQL Editor'de çalıştır; sonunda bilinçli hata fırlatır ve HER ŞEYİ GERİ ALIR.
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', u::text, true);
$$;
-- geçerli, dolu sudoku mu (27 birimin her birinde 9 farklı rakam)
create or replace function pg_temp.sudoku_ok(s text) returns boolean language sql as $$
  select position('0' in s) = 0 and not exists (
    select 1 from generate_series(0, 26) un
    where (select count(distinct substr(s, (case when un < 9 then un * 9 + k when un < 18 then k * 9 + (un - 9)
                                              else ((un - 18) / 3) * 27 + ((un - 18) % 3) * 3 + (k / 3) * 9 + k % 3 end) + 1, 1))
           from generate_series(0, 8) k) <> 9)
$$;

do $$
declare
  a uuid; b uuid; cp uuid; g jsonb; p jsonb; res text := ''; v_today date; cat uuid; dog uuid; ad uuid; v_err text; n int;
  v_x1 int; v_x2 int; sg sudoku_games; v_cell int; sh record; bk sudoku_bank; k int;
begin
  insert into setup_keys (key_hash, label) values (bb_hash('T17-KEY'), 'gametest17');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g17_a@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g17_a","display_name":"Ayşe","setup_key":"T17-KEY"}', now(), now());
  select id into a from app_users where username = 'g17_a';
  select couple_id into cp from memberships where user_id = a;
  insert into invites (couple_id, token_hash, created_by, expires_at) values (cp, bb_hash('T17-INV'), a, now() + interval '1 day');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g17_b@birlikte.local', 'x', now(),
    '{"provider":"email"}', '{"username":"g17_b","display_name":"Ali","invite_token":"T17-INV"}', now(), now());
  select id into b from app_users where username = 'g17_b';
  perform pg_temp.as_user(b); g := create_hero('Ali', 'MAGE', '{"gender":"M"}', 2);
  perform pg_temp.as_user(a); g := create_hero('Ayşe', 'HEALER', '{"gender":"F"}', 2);
  v_today := (g->>'today')::date;
  update heroes set gold = 5000 where user_id in (a, b);

  -- 0) Eski evcil hayvanlar
  if exists (select 1 from shop_items where kind = 'PET') or exists (select 1 from inventory where item_key like 'pet\_%') or exists (select 1 from heroes where equipped ? 'pet') then raise exception 'eski evcil kaldı'; end if;
  res := res || E'\niade · dükkanda kişisel evcil yok, ' || (select count(*) from hero_log where kind = 'REFUND') || ' iade kaydı ✓';

  -- 1) Ortak sahiplenme: a başlatır (yarısı), a onaylayamaz, b onaylar (kalanı)
  p := pet_adopt_start('cat', 'c1', 'Pamuk');
  ad := (p->'pending'->>'id')::uuid;
  if (select gold from heroes where user_id = a) <> 4800 or (p->'pending'->>'rest')::int <> 200 then raise exception 'yarı ödeme %', p->'pending'; end if;
  v_err := null; begin perform pet_adopt_confirm(ad); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'INVALID_STATE' then raise exception 'başlatan onayladı: %', v_err; end if;
  perform pg_temp.as_user(b);
  if not ((get_game())->'play'->>'petAdopt')::boolean then raise exception 'eşe onay işareti yok'; end if;
  p := pet_adopt_confirm(ad);
  cat := (p->'pets'->0->>'id')::uuid;
  if (select gold from heroes where user_id = b) <> 4800 or (p->'pets'->0->>'stage')::int <> 0 or p->'pending' <> 'null'::jsonb then raise exception 'onay %', p; end if;
  if not exists (select 1 from hero_events where user_id = a and kind = 'PET_ADOPTED') then raise exception 'sahiplenme olayı yok'; end if;
  res := res || E'\nsahiplenme · başlatan 200, eşi 200 öder; başlatan onaylayamaz; bebek gelir ✓';

  -- 2) İkinci dost ×2, iptal iade eder, yuva sınırı, Ahır yuvası açar
  p := pet_adopt_start('dog', 'c0', 'Karabaş');
  if (p->'pending'->>'price')::int <> 800 or (select gold from heroes where user_id = b) <> 4400 then raise exception 'ikinci fiyat %', p->'pending'; end if;
  perform pg_temp.as_user(a);
  p := pet_adopt_cancel((p->'pending'->>'id')::uuid);
  if (select gold from heroes where user_id = b) <> 4800 then raise exception 'iptal iadesi'; end if;
  p := pet_adopt_start('dog', 'c0', 'Karabaş');
  perform pg_temp.as_user(b);
  p := pet_adopt_confirm((p->'pending'->>'id')::uuid);
  dog := (select id from couple_pets where couple_id = cp and species = 'dog');
  if (select gold from heroes where user_id = a) <> 4400 or (select gold from heroes where user_id = b) <> 4400 then raise exception 'ikinci ödeme'; end if;
  v_err := null; begin perform pet_adopt_start('bunny', 'c0', 'Ponpon'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'PET_SLOTS' then raise exception 'yuva sınırı: %', v_err; end if;
  insert into castle_parts (couple_id, key, level) values (cp, 'stable', 1);
  p := get_pets();
  if (p->>'slots')::int <> 3 or (p->>'priceMult')::numeric <> 3.5 then raise exception 'ahır yuvası %', p->>'slots'; end if;
  res := res || E'\ndenge · 2. dost ×2 (800), iptal iade, 2 yuvada 3. dost olmaz, Ahır +1 yuva, 3. dost ×3.5 ✓';

  -- 3) Sevme: kişi başı günde 1 (+3), ikisi de severse +2
  perform pg_temp.as_user(a);
  p := pet_pat(cat);
  v_err := null; begin perform pet_pat(cat); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'DAILY_LIMIT' then raise exception 'günde bir sevme: %', v_err; end if;
  perform pg_temp.as_user(b);
  p := pet_pat(cat);
  if (select love from couple_pets where id = cat) <> 8 then raise exception 'sevme sevgisi %', (select love from couple_pets where id = cat); end if;
  if not ((p->'pets'->0->>'patMe')::boolean and (p->'pets'->0->>'patPartner')::boolean) then raise exception 'sevme işareti'; end if;
  res := res || E'\nsevme · 3 + 3 + ikiniz birden 2 = 8, günde bir kez ✓';

  -- 4) Ortak etkinlikler tüm dostları büyütür (tetikleyiciler)
  insert into notes (couple_id, author, kind, text, local_date) values (cp, a, 'LETTER', 'seni seviyorum', v_today);
  insert into couple_combos (couple_id, local_date) values (cp, v_today);
  if (select love from couple_pets where id = cat) <> 14 or (select love from couple_pets where id = dog) <> 6 then
    raise exception 'tetikleyici sevgisi % %', (select love from couple_pets where id = cat), (select love from couple_pets where id = dog); end if;
  perform bb_pet_love(cp, 110, 'TEST', cat);
  if (select stage from couple_pets where id = cat) <> 1 then raise exception 'evre atlamadı'; end if;
  if (select count(*) from hero_events where kind = 'PET_STAGE' and user_id in (a, b)) <> 2 then raise exception 'evre olayı'; end if;
  res := res || E'\nbüyüme · mektup +1, kombo +5 (iki dosta da), 120 sevgide Yavru, ikinize olay ✓';

  -- 5) Gardırop: evre kilidi, tek alım, giydirme, boya
  v_err := null; begin perform pet_buy_item('crown'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'PET_STAGE_LOCKED' then raise exception 'taç kilidi: %', v_err; end if;
  p := pet_buy_item('bow');
  if (select gold from heroes where user_id = b) <> 4340 then raise exception 'fiyonk fiyatı'; end if;
  v_err := null; begin perform pet_buy_item('bow'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'ALREADY_OWNED' then raise exception 'çift alım: %', v_err; end if;
  perform pg_temp.as_user(a);
  p := pet_dress(dog, 'HEAD', 'bow');                     -- eşinin aldığı süsü sen de kullanırsın
  p := pet_dress(cat, 'HEAD', 'bow');
  p := pet_dress(cat, 'COLOR', 'c3');
  v_err := null; begin perform pet_dress(cat, 'NECK', 'collar'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_OWNED' then raise exception 'sahipsiz süs: %', v_err; end if;
  v_err := null; begin perform pet_dress(cat, 'COLOR', 'gold'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_OWNED' then raise exception 'altın boya: %', v_err; end if;
  if (select outfit->>'HEAD' from couple_pets where id = cat) <> 'bow' or (select color from couple_pets where id = cat) <> 'c3' then raise exception 'giydirme'; end if;
  p := pet_dress(dog, 'HEAD', null);
  if (select outfit from couple_pets where id = dog) <> '{}'::jsonb then raise exception 'çıkarma'; end if;
  p := pet_rename(cat, 'Pamukçuk');
  res := res || E'\ngardırop · taç Yetişkin ister, fiyonk bir kez alınır ve iki dostta da kullanılır, boya ve ad ✓';

  -- 6) Güç: Yavru %2 + Bebek %1 = %3; ertesi günün XP'si artar
  if bb_pet_bonus(cp) <> 3 then raise exception 'bonus %', bb_pet_bonus(cp); end if;
  begin
    delete from couple_pets where couple_id = cp;
    perform bb_generate_day(a, v_today + 1);
    select sum(xp) into v_x2 from quests where user_id = a and local_date = v_today + 1;
    raise exception 'GERI';
  exception when others then if sqlerrm <> 'GERI' then raise; end if;
  end;
  perform bb_generate_day(a, v_today + 1);
  select sum(xp) into v_x1 from quests where user_id = a and local_date = v_today + 1;
  if v_x1 <= v_x2 or v_x1 > v_x2 * 1.06 then raise exception 'dost bonusu XP % / %', v_x1, v_x2; end if;
  update couple_pets set love = 99999, stage = 4 where couple_id = cp;
  if bb_pet_bonus(cp) <> 12 then raise exception 'iki efsanevi %', bb_pet_bonus(cp); end if;
  insert into couple_pets (couple_id, species, name, love, stage) values (cp, 'owl', 'x', 99999, 4), (cp, 'fox', 'y', 99999, 4);
  if bb_pet_bonus(cp) <> 15 then raise exception 'tavan %', bb_pet_bonus(cp); end if;
  delete from couple_pets where couple_id = cp and species in ('owl', 'fox');
  update couple_pets set love = 130, stage = 1 where id = cat;
  update couple_pets set love = 16, stage = 0 where id = dog;
  res := res || E'\ngüç · %3 bonus ertesi gün XP ' || v_x2 || ' → ' || v_x1 || ', iki efsanevi %12, tavan %15 ✓';

  -- 7) Sudoku düellosu
  g := duel_create('SUDOKU', 77, 700);
  if not exists (select 1 from duels where couple_id = cp and game = 'SUDOKU' and score_a = 700) then raise exception 'sudoku düellosu'; end if;

  -- 8) Bankadan dönüştürülen bulmacalar geçerli
  for k in 1..15 loop
    select * into bk from sudoku_bank where level = 1 + k % 3 order by random() limit 1;
    select * into sh from bb_sudoku_shuffle(bk.puzzle, bk.solution);
    if not pg_temp.sudoku_ok(sh.solution) then raise exception 'karışık çözüm geçersiz'; end if;
    if exists (select 1 from generate_series(1, 81) i where substr(sh.puzzle, i, 1) <> '0' and substr(sh.puzzle, i, 1) <> substr(sh.solution, i, 1)) then raise exception 'ipucu çözümle uyuşmuyor'; end if;
    if length(replace(sh.puzzle, '0', '')) <> length(replace(bk.puzzle, '0', '')) then raise exception 'ipucu sayısı'; end if;
  end loop;
  if (select count(*) from sudoku_bank) < 60 or exists (select 1 from sudoku_bank where not pg_temp.sudoku_ok(solution)) then raise exception 'banka'; end if;
  res := res || E'\nsudoku · düello (SUDOKU) açılır; banka ' || (select count(*) from sudoku_bank) || ' bulmaca, 15 dönüşüm de geçerli ✓';

  -- 9) Ortak sudoku: sıra, 3 hamle, yanlış sırayı devreder, bitişte ödül
  g := sudoku_start(1);
  select * into sg from sudoku_games where couple_id = cp and status = 'ACTIVE';
  if sg.turn <> a or sg.moves_left <> 3 or g->'game' ? 'solution' then raise exception 'başlangıç'; end if;
  perform pg_temp.as_user(b);
  v_err := null; begin perform sudoku_move(position('0' in sg.board) - 1, 1); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_YOUR_TURN' then raise exception 'sıra dışı hamle: %', v_err; end if;
  perform pg_temp.as_user(a);
  v_cell := position('0' in sg.board) - 1;
  g := sudoku_move(v_cell, substr(sg.solution, v_cell + 1, 1)::int);
  select * into sg from sudoku_games where id = sg.id;
  if sg.score_a < 1 or sg.moves_left <> 2 or sg.turn <> a or substr(sg.owners, v_cell + 1, 1) <> 'a' then raise exception 'doğru hamle'; end if;
  v_cell := position('0' in sg.board) - 1;
  n := sg.score_a;
  g := sudoku_move(v_cell, (substr(sg.solution, v_cell + 1, 1)::int % 9) + 1);
  select * into sg from sudoku_games where id = sg.id;
  if sg.turn <> b or sg.miss_a <> 1 or sg.score_a <> n - 1 or sg.moves_left <> 3 or substr(sg.board, v_cell + 1, 1) <> '0' then raise exception 'yanlış hamle'; end if;
  if not exists (select 1 from hero_events where user_id = b and kind = 'SUDOKU_TURN') then raise exception 'sıra olayı'; end if;
  perform pg_temp.as_user(b);
  for k in 1..3 loop
    v_cell := position('0' in sg.board) - 1;
    g := sudoku_move(v_cell, substr(sg.solution, v_cell + 1, 1)::int);
    select * into sg from sudoku_games where id = sg.id;
  end loop;
  if sg.turn <> a or sg.score_b < 3 then raise exception '3 hamle sonra sıra'; end if;
  perform pg_temp.as_user(a);
  g := sudoku_pass();
  select * into sg from sudoku_games where id = sg.id;
  if sg.turn <> b then raise exception 'pas'; end if;
  -- sonuna kadar oyna
  while sg.status = 'ACTIVE' loop
    perform pg_temp.as_user(sg.turn);
    v_cell := position('0' in sg.board) - 1;
    g := sudoku_move(v_cell, substr(sg.solution, v_cell + 1, 1)::int);
    select * into sg from sudoku_games where id = sg.id;
  end loop;
  if sg.status <> 'DONE' or sg.board <> sg.solution or sg.winner is distinct from (case when sg.score_a > sg.score_b then sg.player_a when sg.score_b > sg.score_a then sg.player_b end) then raise exception 'bitiş'; end if;
  if (select count(*) from hero_log where kind = 'SUDOKU' and user_id in (a, b)) <> 2 then raise exception 'sudoku ödülü'; end if;
  if not exists (select 1 from pet_love_log where couple_id = cp and reason = 'SUDOKU') then raise exception 'sudoku sevgisi'; end if;
  if (sg.score_a + sg.score_b) < 81 - length(replace(sg.puzzle, '0', '')) then raise exception 'puan toplamı'; end if;
  res := res || E'\nortak sudoku · sıra/3 hamle/yanlış devreder/pas, bitti: ' || sg.score_a || ' – ' || sg.score_b || ', ödül ve dost sevgisi ✓';

  -- 10) get_game ve yetkiler
  perform pg_temp.as_user(a);
  g := get_game();
  if jsonb_array_length(g->'pets') <> 2 or (g->>'petBonus')::int <> 3 or (g->'play'->>'sudoku')::boolean or g->'hero' is null then raise exception 'get_game %', g->'pets'; end if;
  if has_function_privilege('authenticated', 'bb_pet_love(uuid, int, text, uuid)', 'execute') or has_function_privilege('authenticated', 'bb_get_game_core()', 'execute')
     or has_function_privilege('authenticated', 'bb_sudoku_shuffle(text, text)', 'execute') then raise exception 'fazla yetki'; end if;
  if not has_function_privilege('authenticated', 'pet_adopt_start(text, text, text)', 'execute') or not has_function_privilege('authenticated', 'sudoku_move(int, int)', 'execute')
     or not has_function_privilege('authenticated', 'get_game()', 'execute') then raise exception 'yetki eksik'; end if;
  res := res || E'\nget_game · pets + petBonus + play.sudoku; yardımcılar kapalı ✓';

  raise exception E'TÜM TESTLER GEÇTİ (geri alındı):%', res;
end $$;
