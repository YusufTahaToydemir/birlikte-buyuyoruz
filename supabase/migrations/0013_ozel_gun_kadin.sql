-- Kyron · 0013_ozel_gun_kadin.sql · Özel gün modu yalnızca kadın karakterde (5 Kasım 2026)
-- Açma ve liste değiştirme yalnızca look.gender = 'F' olan kahramana açıktır; kapatmak herkese serbesttir.
-- Erkek kahramanda mod açık kalmışsa (ör. sonradan görünüm değişti) kapatılır.

create or replace function set_special(p_on boolean, p_hide text[] default null, p_extra text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; h heroes;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  select * into h from heroes where user_id = u;
  if h.user_id is null then raise exception 'NOT_FOUND'; end if;
  -- erkek kahramanda yalnızca "kapat" (p_on = false) çalışır
  if coalesce(h.look->>'gender', '') <> 'F' and p_on is not false then raise exception 'NOT_ALLOWED'; end if;
  if p_hide is not null then
    if exists (select 1 from unnest(p_hide) x where x <> all (array['FAJR','DHUHR','ASR','MAGHRIB','ISHA','SUNNAH','QURAN','DHIKR','STUDY'])) then raise exception 'INVALID_VALUE'; end if;
    update heroes set special_hide = p_hide where user_id = u;
  end if;
  if p_extra is not null then
    if cardinality(p_extra) not between 1 and 7 or exists (select 1 from unnest(p_extra) x where not exists (select 1 from quest_catalog q where q.code = x and q.kind = 'SPECIAL')) then raise exception 'INVALID_VALUE'; end if;
    update heroes set special_extra = p_extra where user_id = u;
  end if;
  perform bb_process_user(u);
  select * into h from heroes where user_id = u for update;
  if p_on is true then
    if h.special_since is null then update heroes set special_since = v_today where user_id = u; end if;
    perform bb_special_apply(u, v_today);
  elsif p_on is false then
    update heroes set special_since = null where user_id = u;
    perform bb_special_clear(u, v_today);
  elsif h.special_since is not null then
    perform bb_special_apply(u, v_today);
  end if;
  return get_game();
end $$;

-- Görünüm erkeğe çevrilirse açık mod kapanır
create or replace function bb_special_gender_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.special_since is not null and coalesce(new.look->>'gender', '') <> 'F' then
    new.special_since := null;
  end if;
  return new;
end $$;
drop trigger if exists heroes_special_gender on heroes;
create trigger heroes_special_gender before update of look on heroes for each row execute function bb_special_gender_guard();

-- Güvenlik
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
  set_special(boolean, text[], text[])
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'ozel gun kadin ok' as result;
