-- 0021: Ortak sudoku puanı zorluğa göre + dost rengi kalıcı (kullanıcı isteği, 11 Kasım 2026).
-- Sudoku: eskiden doğru rakam +1 ve biten satır/sütun/kutu +3 veriliyordu; bu, en kolay hücreye (birimin son boşluğu) en çok puanı veriyordu.
--   Artık hamle anındaki tahtaya bakılır: hücre "tek" ise (tek adayı var ya da rakam birimlerinden birinde yalnızca oraya girebiliyor) +1,
--   tek değilse (kilitli aday, ikili, X-wing gibi mantık gerekir) +3. Yanlış rakam −2 (en az 0) ve sıra eşine geçer.
-- Dost rengi: tür ve renk sahiplenirken seçilir, sonradan değişmez. Boya (COLOR) satışı ve giydirme kapandı;
--   hiçbir dostun şu anki rengi olmayan boyalar alana iade edilir. Dostların bugünkü rengi olduğu gibi kalır.

-- 1) Hücre adayları (bit maskesi, 1..9 bitleri) ve "tek" tespiti
create or replace function bb_sudoku_cands(p_board text, p_cell int) returns int
language plpgsql immutable as $$
declare m int := 1022; r int := p_cell / 9; cc int := p_cell % 9; br int := (p_cell / 27) * 3; bc int := (cc / 3) * 3; k int; ch int;
begin
  for k in 0..8 loop
    ch := ascii(substr(p_board, r * 9 + k + 1, 1)) - 48; if ch > 0 then m := m & ~(1 << ch); end if;
    ch := ascii(substr(p_board, k * 9 + cc + 1, 1)) - 48; if ch > 0 then m := m & ~(1 << ch); end if;
    ch := ascii(substr(p_board, (br + k / 3) * 9 + bc + k % 3 + 1, 1)) - 48; if ch > 0 then m := m & ~(1 << ch); end if;
  end loop;
  return m;
end $$;

create or replace function bb_sudoku_single(p_board text, p_cell int, p_digit int) returns boolean
language plpgsql immutable as $$
declare m int := bb_sudoku_cands(p_board, p_cell); r int := p_cell / 9; cc int := p_cell % 9; br int := (p_cell / 27) * 3; bc int := (cc / 3) * 3;
  un int; k int; cell int; alone boolean;
begin
  if m & (m - 1) = 0 then return true; end if;
  for un in 0..2 loop
    alone := true;
    for k in 0..8 loop
      cell := case un when 0 then r * 9 + k when 1 then k * 9 + cc else (br + k / 3) * 9 + bc + k % 3 end;
      if cell <> p_cell and substr(p_board, cell + 1, 1) = '0' and (bb_sudoku_cands(p_board, cell) & (1 << p_digit)) <> 0 then alone := false; exit; end if;
    end loop;
    if alone then return true; end if;
  end loop;
  return false;
end $$;

-- 2) Ortak sudoku hamlesi: kolay hücre +1, zor hücre +3; sırada en çok 3 doğru; yanlış −2 ve sıra eşine
create or replace function sudoku_move(p_cell int, p_digit int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; g sudoku_games; v_ok boolean; v_units int := 0; v_pts int; v_other uuid; v_a boolean;
  r int; cc int; bx int; v_single boolean;
begin
  c := bb_couple_of(u);
  select * into g from sudoku_games where couple_id = c.id and status = 'ACTIVE' for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if g.turn is distinct from u then raise exception 'NOT_YOUR_TURN'; end if;
  if p_cell not between 0 and 80 or p_digit not between 1 and 9 then raise exception 'INVALID_VALUE'; end if;
  if substr(g.board, p_cell + 1, 1) <> '0' then raise exception 'INVALID_STATE'; end if;
  v_a := u = g.player_a;
  v_other := case when v_a then g.player_b else g.player_a end;
  v_ok := substr(g.solution, p_cell + 1, 1) = p_digit::text;
  if v_ok then
    v_single := bb_sudoku_single(g.board, p_cell, p_digit);
    v_pts := case when v_single then 1 else 3 end;
    g.board := overlay(g.board placing p_digit::text from p_cell + 1 for 1);
    g.owners := overlay(g.owners placing case when v_a then 'a' else 'b' end from p_cell + 1 for 1);
    r := p_cell / 9; cc := p_cell % 9; bx := (r / 3) * 3 * 9 + (cc / 3) * 3;
    if position('0' in substr(g.board, r * 9 + 1, 9)) = 0 then v_units := v_units + 1; end if;
    if not exists (select 1 from generate_series(0, 8) s(j) where substr(g.board, s.j * 9 + cc + 1, 1) = '0') then v_units := v_units + 1; end if;
    if not exists (select 1 from generate_series(0, 8) s(j) where substr(g.board, bx + (s.j / 3) * 9 + (s.j % 3) + 1, 1) = '0') then v_units := v_units + 1; end if;
    if v_a then g.score_a := g.score_a + v_pts; else g.score_b := g.score_b + v_pts; end if;
    g.moves_left := g.moves_left - 1;
    g.last_move := jsonb_build_object('by', u, 'cell', p_cell, 'digit', p_digit, 'ok', true, 'units', v_units, 'pts', v_pts, 'hard', not v_single);
    if position('0' in g.board) = 0 then
      g.status := 'DONE'; g.finished_at := now(); g.turn := null;
      g.winner := case when g.score_a > g.score_b then g.player_a when g.score_b > g.score_a then g.player_b end;
    elsif g.moves_left <= 0 then
      g.turn := v_other; g.moves_left := 3;
    end if;
  else
    if v_a then g.miss_a := g.miss_a + 1; g.score_a := greatest(0, g.score_a - 2); else g.miss_b := g.miss_b + 1; g.score_b := greatest(0, g.score_b - 2); end if;
    g.last_move := jsonb_build_object('by', u, 'cell', p_cell, 'digit', p_digit, 'ok', false, 'pts', -2);
    g.turn := v_other; g.moves_left := 3;
  end if;
  update sudoku_games set board = g.board, owners = g.owners, score_a = g.score_a, score_b = g.score_b, miss_a = g.miss_a, miss_b = g.miss_b,
    moves_left = g.moves_left, turn = g.turn, last_move = g.last_move, status = g.status, winner = g.winner, finished_at = g.finished_at, updated_at = now()
    where id = g.id;
  if g.status = 'DONE' then
    if g.winner is null then
      perform bb_grant(g.player_a, 'SUDOKU', 20, 30); perform bb_grant(g.player_b, 'SUDOKU', 20, 30);
    else
      perform bb_grant(g.winner, 'SUDOKU', 30, 40);
      perform bb_grant(case when g.winner = g.player_a then g.player_b else g.player_a end, 'SUDOKU', 15, 20);
    end if;
    if v_other is not null then
      perform bb_event(v_other, 'SUDOKU_DONE', jsonb_build_object('me', case when v_a then g.score_b else g.score_a end, 'them', case when v_a then g.score_a else g.score_b end,
        'result', case when g.winner is null then 'DRAW' when g.winner = v_other then 'WIN' else 'LOSE' end), u);
    end if;
  elsif g.turn = v_other and v_other is not null then
    perform bb_event(v_other, 'SUDOKU_TURN', jsonb_build_object('ok', v_ok), u);
  end if;
  return get_sudoku();
end $$;

-- 3) Dost rengi kalıcı: boya satılmaz, renk yuvası giydirilemez
create or replace function pet_buy_item(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; it jsonb; v_partner uuid;
begin
  c := bb_couple_of(u);
  select x into it from jsonb_array_elements(bb_pet_items()) x where x->>'key' = p_key;
  if it is null or it->>'slot' = 'COLOR' then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from pet_wardrobe where couple_id = c.id and item_key = p_key) then raise exception 'ALREADY_OWNED'; end if;
  if coalesce((select max(stage) from couple_pets where couple_id = c.id), -1) < (it->>'stage')::int then raise exception 'PET_STAGE_LOCKED'; end if;
  if (select gold from heroes where user_id = u for update) < (it->>'price')::int then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - (it->>'price')::int where user_id = u;
  insert into hero_log (user_id, kind, gold) values (u, 'PET_ITEM', -(it->>'price')::int);
  insert into pet_wardrobe (couple_id, item_key, bought_by) values (c.id, p_key, u);
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'PET_ITEM', jsonb_build_object('key', p_key, 'name', it->>'name'), u); end if;
  return get_pets();
end $$;

create or replace function pet_dress(p_pet uuid, p_slot text, p_value text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; it jsonb; v text := nullif(btrim(coalesce(p_value, '')), '');
begin
  c := bb_couple_of(u);
  if not exists (select 1 from couple_pets where id = p_pet and couple_id = c.id) then raise exception 'NOT_FOUND'; end if;
  if p_slot not in ('HEAD','NECK','FACE','BACK','AURA') then raise exception 'INVALID_VALUE'; end if;
  if v is null then
    update couple_pets set outfit = outfit - p_slot where id = p_pet;
  else
    select x into it from jsonb_array_elements(bb_pet_items()) x where x->>'key' = v and x->>'slot' = p_slot;
    if it is null then raise exception 'INVALID_VALUE'; end if;
    if not exists (select 1 from pet_wardrobe where couple_id = c.id and item_key = v) then raise exception 'NOT_OWNED'; end if;
    update couple_pets set outfit = outfit || jsonb_build_object(p_slot, v) where id = p_pet;
  end if;
  return get_pets();
end $$;

-- 4) Kullanılmayan boyaları alana iade et
do $$
declare r record;
begin
  for r in
    select w.couple_id, w.item_key, w.bought_by, (x->>'price')::int as price, x->>'name' as name
    from pet_wardrobe w join jsonb_array_elements(bb_pet_items()) x on x->>'key' = w.item_key and x->>'slot' = 'COLOR'
    where not exists (select 1 from couple_pets p where p.couple_id = w.couple_id and p.color = w.item_key)
  loop
    if r.bought_by is not null then
      update heroes set gold = gold + r.price where user_id = r.bought_by;
      insert into hero_log (user_id, kind, gold) values (r.bought_by, 'REFUND', r.price);
      perform bb_event(r.bought_by, 'PET_REFUND', jsonb_build_object('name', r.name, 'gold', r.price, 'paint', true));
    end if;
    delete from pet_wardrobe where couple_id = r.couple_id and item_key = r.item_key;
  end loop;
end $$;

-- =====================================================================
-- Güvenlik
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_game(), create_hero(text, text, jsonb, int), update_hero(text, text, jsonb, boolean), complete_quest(uuid, boolean),
  set_izin(boolean), set_difficulty(int), buy_item(text), equip_item(text, text), use_potion(text), social_action(text, int), mark_events_seen(uuid[]),
  get_tickets(), request_ticket(uuid, uuid, text), respond_redemption(uuid, text), request_reversal(uuid),
  create_invite(), generate_recovery_codes(), recovery_codes_status(), revoke_other_sessions(), disconnect_couple(), delete_account(),
  get_games(), duel_create(text, int, int), duel_play(uuid, int), duel_cancel(uuid), word_guess(text), together_mark(text), together_cancel(text),
  get_calendar(date), get_day(date), use_skill(), get_bestiary(),
  quiz_answer(jsonb), quiz_add(text, jsonb), note_write(text, text, text), get_notes(timestamptz, int), raid_play(int), word_hint(),
  castle_build(text), get_castle(), get_season(), push_subscribe(text, text, text), push_unsubscribe(text), set_reminder(int),
  set_special(boolean, text[], text[]), get_partner_feed(), set_partner_notify(boolean),
  get_pets(), pet_adopt_start(text, text, text), pet_adopt_confirm(uuid), pet_adopt_cancel(uuid), pet_pat(uuid), pet_buy_item(text),
  pet_dress(uuid, text, text), pet_rename(uuid, text),
  get_sudoku(), sudoku_start(int), sudoku_move(int, int), sudoku_pass(), sudoku_cancel()
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;



select 'sudoku puanı + kalıcı renk ok' as result;
