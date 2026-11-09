-- 0019: Uykuda can yenilenmesi kaldırıldı (kullanıcı isteği, 9 Kasım 2026).
-- Hasar gece gün kapanışında alındığı için her sabah verilen +10 can, hasarı kendiliğinden azaltıyordu.
-- Artık can yalnızca EKSİKSİZ biten günün kapanışında yenilenir: +morningRegen (10) + Mutfak seviyesi × 2.
-- İzin günü, eksik gün ve boş gün can vermez. Zorluk değiştirince yapılan telafi düşüşü de kalktı.

-- 1) Gün üretimi: can yenilemesi yok (0017 ile aynı, yalnızca v_regen kaldırıldı)
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int;
  c couples; ev text; b_mind numeric; b_order numeric; b_spirit numeric; w numeric; k_lib numeric; k_forge numeric; k_garden numeric; k_market numeric; k_mosque numeric;
  v_k numeric; v_g text; v_pet numeric;
begin
  if exists (select 1 from hero_days where user_id = p_user and local_date = p_date) then return; end if;
  select * into h from heroes where user_id = p_user for update;
  if h.user_id is null then return; end if;
  c := bb_couple_of(p_user);
  ev := bb_day_event(c.id, p_date);
  if h.pending_difficulty is not null then
    update heroes set difficulty = pending_difficulty, pending_difficulty = null where user_id = p_user returning * into h;
  end if;
  d := h.difficulty;
  v_g := h.look->>'gender';
  v_sides := (bb_diff(d)->>'sides')::int;
  v_k := bb_damage_k(d);
  v_pet := 1 + bb_pet_bonus(c.id) / 100.0;
  b_mind := 1 + bb_stat_bonus(coalesce((h.stats->>'MIND')::int, 0)) / 100.0;
  b_order := 1 + bb_stat_bonus(coalesce((h.stats->>'ORDER')::int, 0)) / 100.0;
  b_spirit := 1 + bb_stat_bonus(coalesce((h.stats->>'SPIRIT')::int, 0)) / 100.0;
  w := 1 + 0.1 * coalesce((h.equipped->>'weapon')::int, 0);
  k_lib := 1 + bb_castle_lv(c.id, 'library') / 100.0; k_forge := 1 + bb_castle_lv(c.id, 'forge') / 100.0;
  k_garden := 1 + bb_castle_lv(c.id, 'garden') / 100.0; k_market := 1 + bb_castle_lv(c.id, 'market') / 100.0; k_mosque := 1 + bb_castle_lv(c.id, 'mosque') / 100.0;
  insert into hero_days (user_id, local_date, difficulty, event) values (p_user, p_date, d, ev);
  insert into quests (user_id, local_date, code, kind, category, icon, title, xp, gold, damage, sort)
  select p_user, p_date, q.code, q.kind, q.category, q.icon,
    bb_quest_title(q.title, q.targets, d, v_g),
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * b_mind * v_pet
      * case when q.category = 'MIND' then k_lib when q.category = 'BODY' then k_forge else 1 end
      * case when (ev = 'MIND_DAY' and q.category = 'MIND') or (ev = 'BODY_DAY' and q.category = 'BODY') then 2 else 1 end)::int,
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2 * b_order * k_market * case when q.category = 'ORDER' then k_garden else 1 end
      * case when ev = 'ORDER_DAY' and q.category = 'ORDER' then 2 when ev = 'GOLD_RAIN' and q.kind = 'SIDE' then 3 else 1 end)::int,
    greatest(1, round(bb_quest_xp(q.base_xp, 1, h.class, q.category, q.kind) * v_k * w * b_spirit * v_pet * case when q.category = 'SPIRIT' then k_mosque else 1 end
      * case when ev = 'SPIRIT_SURGE' and q.category = 'SPIRIT' then 2 when ev = 'BOSS_RAGE' then 1.5 else 1 end))::int,
    case when q.kind = 'DAILY' then q.sort else 200 end
  from (
    select * from quest_catalog q where q.kind = 'DAILY' and q.min_difficulty <= d
    union all
    select * from (select * from quest_catalog q where q.kind = 'SIDE' and q.min_difficulty <= d
                   order by md5(p_user::text || p_date::text || q.code) limit v_sides) s
  ) q;
  if h.special_since is not null then
    if p_date > h.special_since + 14 then
      update heroes set special_since = null where user_id = p_user;
    else
      perform bb_special_apply(p_user, p_date);
    end if;
  end if;
end $$;

-- 2) Eksiksiz gün kapanınca can
create or replace function bb_full_day_regen_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_regen int := coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10);
begin
  if new.closed and not old.closed and new.all_done and not new.izin then
    v_regen := v_regen + 2 * bb_castle_lv((bb_couple_of(new.user_id)).id, 'kitchen');
    update heroes set hp = least(bb_user_max_hp(new.user_id), hp + v_regen) where user_id = new.user_id and hp > 0;
  end if;
  return null;
end $$;
drop trigger if exists bb_full_day_regen on hero_days;
create trigger bb_full_day_regen after update of closed on hero_days for each row execute function bb_full_day_regen_trg();

-- 3) Zorluk değişimi: artık geri alınacak sabah canı yok
create or replace function set_difficulty(p_n int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date;
begin
  if p_n < 1 or p_n > 6 then raise exception 'INVALID_VALUE'; end if;
  c := bb_couple_of(u); v_today := bb_local_date(now(), c.timezone);
  if not exists (select 1 from quests where user_id = u and local_date = v_today and done) then
    update heroes set difficulty = p_n, pending_difficulty = null where user_id = u;
    delete from quests where user_id = u and local_date = v_today;
    delete from hero_days where user_id = u and local_date = v_today;
    perform bb_generate_day(u, v_today);
  else
    update heroes set pending_difficulty = case when difficulty = p_n then null else p_n end where user_id = u;
  end if;
  return get_game();
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


select 'uyku canı kaldırıldı' as result;
