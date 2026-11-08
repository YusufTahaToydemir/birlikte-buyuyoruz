-- 0017: Ortak evcil dostlar ve sudoku (kullanıcı isteği, 8 Kasım 2026)
--  * Evcil dost artık çiftin ortak dostu: biri sahiplenmeyi başlatıp yarısını öder, eşi onaylayıp kalanını öder.
--    Bebek olarak gelir; "sevgi" ile büyür (Bebek → Yavru → Genç → Yetişkin → Efsanevi). Sevgi kaynakları: günlük sevme,
--    tam gün, kombo, birlikte etkinlik, mektup/şükür, Günün Kelimesi, düello, çift testi, baskın, canavar, sudoku.
--  * Güç: her dost evresine göre XP ve canavar hasarına +%1/2/3/4/6, toplam en çok %15 (ertesi günün görevlerine işler).
--  * Denge: dost sayısı yuvayla sınırlı (2 + Ahır seviyesi, en çok 4); her yeni dost fiyatı ×1 / ×2 / ×3.5 / ×6.
--  * Süs: ortak gardırop (bir kez alınır, tüm dostlarda kullanılır): baş, boyun, yüz, sırt, ışık, özel boya.
--  * Eski kişisel evcil hayvanlar iade edilir (ödenen altın geri).
--  * Sudoku: düello oyunu (SUDOKU) + sıra tabanlı ortak tahta (doğru rakam puan, sırada en çok 3 hamle, yanlış sırayı devreder).
--  * get_game(): eski gövde bb_get_game_core() adını aldı; yeni get_game() onu çağırıp 'pets' ve play.sudoku / play.petAdopt ekler.

-- =====================================================================
-- 1. Eski kişisel evcil hayvanların iadesi
-- =====================================================================
do $$
declare r record;
begin
  for r in select i.user_id, s.price, s.name from inventory i join shop_items s on s.key = i.item_key where s.kind = 'PET' and i.qty > 0 loop
    update heroes set gold = gold + r.price, equipped = equipped - 'pet' where user_id = r.user_id;
    insert into hero_log (user_id, kind, gold) values (r.user_id, 'REFUND', r.price);
    perform bb_event(r.user_id, 'PET_REFUND', jsonb_build_object('name', r.name, 'gold', r.price));
  end loop;
end $$;
delete from inventory where item_key in (select key from shop_items where kind = 'PET');
update heroes set equipped = equipped - 'pet' where equipped ? 'pet';
delete from shop_items where kind = 'PET';

-- =====================================================================
-- 2. Tablolar
-- =====================================================================
create table if not exists couple_pets (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  species text not null,
  color text not null default 'c0',
  name text not null,
  love int not null default 0,
  stage int not null default 0,
  outfit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists couple_pets_couple on couple_pets(couple_id, created_at);
create table if not exists pet_pats (
  pet_id uuid not null references couple_pets(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  local_date date not null,
  primary key (pet_id, user_id, local_date)
);
create table if not exists pet_wardrobe (
  couple_id uuid not null references couples(id) on delete cascade,
  item_key text not null,
  bought_by uuid references app_users(id) on delete set null,
  bought_at timestamptz not null default now(),
  primary key (couple_id, item_key)
);
create table if not exists pet_adoptions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  species text not null,
  color text not null,
  name text not null,
  price int not null,
  half int not null,
  started_by uuid references app_users(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','DONE','CANCELLED','EXPIRED')),
  pet_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create unique index if not exists pet_adoptions_one_pending on pet_adoptions(couple_id) where status = 'PENDING';
create table if not exists pet_love_log (
  id bigint generated always as identity primary key,
  couple_id uuid not null references couples(id) on delete cascade,
  pet_id uuid,
  amount int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists pet_love_log_couple on pet_love_log(couple_id, created_at desc);
alter table couple_pets enable row level security;
alter table pet_pats enable row level security;
alter table pet_wardrobe enable row level security;
alter table pet_adoptions enable row level security;
alter table pet_love_log enable row level security;

-- =====================================================================
-- 3. Katalog ve yardımcılar (istemcideki src/game/art/pets.ts ile aynı)
-- =====================================================================
create or replace function bb_pet_cfg() returns jsonb
language sql immutable as $$
  select '{
    "species": {
      "cat": {"name": "Kedi", "price": 400}, "dog": {"name": "Köpek", "price": 400}, "bunny": {"name": "Tavşan", "price": 500},
      "fox": {"name": "Tilki", "price": 700}, "owl": {"name": "Baykuş", "price": 900}, "dragon": {"name": "Ejder", "price": 2400},
      "phoenix": {"name": "Anka", "price": 4000}
    },
    "stages": [0, 120, 450, 1100, 2500],
    "bonus": [1, 2, 3, 4, 6],
    "cap": 15,
    "baseSlots": 2, "maxSlots": 4,
    "priceMult": [1, 2, 3.5, 6],
    "patLove": 3, "patBoth": 2,
    "adoptHours": 48
  }'::jsonb
$$;

create or replace function bb_pet_items() returns jsonb
language sql immutable as $$
  select '[
    {"key":"bow","name":"Fiyonk","slot":"HEAD","price":60,"stage":0},
    {"key":"flower","name":"Çiçek Tacı","slot":"HEAD","price":90,"stage":0},
    {"key":"party","name":"Parti Şapkası","slot":"HEAD","price":150,"stage":0},
    {"key":"beret","name":"Bere","slot":"HEAD","price":150,"stage":0},
    {"key":"helmet","name":"Miğfer","slot":"HEAD","price":300,"stage":1},
    {"key":"wizard","name":"Büyücü Şapkası","slot":"HEAD","price":400,"stage":2},
    {"key":"crown","name":"Taç","slot":"HEAD","price":900,"stage":3},
    {"key":"halo","name":"Hale","slot":"HEAD","price":1600,"stage":4},
    {"key":"collar","name":"Çıngıraklı Tasma","slot":"NECK","price":50,"stage":0},
    {"key":"bowtie","name":"Papyon","slot":"NECK","price":90,"stage":0},
    {"key":"scarf","name":"Atkı","slot":"NECK","price":140,"stage":0},
    {"key":"medal","name":"Kalp Kolye","slot":"NECK","price":450,"stage":2},
    {"key":"goldchain","name":"Altın Zincir","slot":"NECK","price":1000,"stage":3},
    {"key":"glasses","name":"Gözlük","slot":"FACE","price":120,"stage":0},
    {"key":"hearts_g","name":"Kalp Gözlük","slot":"FACE","price":220,"stage":1},
    {"key":"shades","name":"Güneş Gözlüğü","slot":"FACE","price":260,"stage":1},
    {"key":"bag","name":"Sırt Çantası","slot":"BACK","price":160,"stage":0},
    {"key":"cape","name":"Pelerin","slot":"BACK","price":220,"stage":1},
    {"key":"fairy","name":"Peri Kanadı","slot":"BACK","price":600,"stage":2},
    {"key":"wings","name":"Melek Kanadı","slot":"BACK","price":1200,"stage":3},
    {"key":"a_hearts","name":"Kalpler","slot":"AURA","price":350,"stage":1},
    {"key":"a_stars","name":"Yıldızlar","slot":"AURA","price":600,"stage":2},
    {"key":"a_bubbles","name":"Baloncuklar","slot":"AURA","price":450,"stage":1},
    {"key":"a_fire","name":"Alev Halkası","slot":"AURA","price":1500,"stage":4},
    {"key":"pink","name":"Pembe Boya","slot":"COLOR","price":400,"stage":1},
    {"key":"gold","name":"Altın Boya","slot":"COLOR","price":2000,"stage":4}
  ]'::jsonb
$$;

create or replace function bb_pet_stage(p_love int) returns int
language sql immutable as $$
  select greatest(0, (select count(*)::int from jsonb_array_elements_text(bb_pet_cfg()->'stages') t where t::int <= p_love) - 1)
$$;

create or replace function bb_pet_bonus(p_couple uuid) returns int
language sql stable security definer set search_path = public as $$
  select least((bb_pet_cfg()->>'cap')::int,
               coalesce((select sum((bb_pet_cfg()->'bonus'->>stage)::int) from couple_pets where couple_id = p_couple), 0))::int
$$;

create or replace function bb_pet_slots(p_couple uuid) returns int
language sql stable security definer set search_path = public as $$
  select least((bb_pet_cfg()->>'maxSlots')::int, (bb_pet_cfg()->>'baseSlots')::int + bb_castle_lv(p_couple, 'stable'))
$$;

/** Çiftin dostlarına sevgi ekler (p_pet null ise hepsine); evre atlayınca ikisine de olay */
create or replace function bb_pet_love(p_couple uuid, p_amount int, p_reason text, p_pet uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_new int; m uuid; n int := 0;
begin
  if p_couple is null or coalesce(p_amount, 0) <= 0 then return; end if;
  for r in select * from couple_pets where couple_id = p_couple and (p_pet is null or id = p_pet) for update loop
    n := n + 1;
    v_new := bb_pet_stage(r.love + p_amount);
    update couple_pets set love = love + p_amount, stage = greatest(stage, v_new) where id = r.id;
    if v_new > r.stage then
      for m in select user_id from memberships where couple_id = p_couple and ended_at is null loop
        perform bb_event(m, 'PET_STAGE', jsonb_build_object('pet', r.id, 'name', r.name, 'species', r.species, 'color', r.color, 'outfit', r.outfit, 'stage', v_new,
          'bonus', bb_pet_bonus(p_couple)));
      end loop;
    end if;
  end loop;
  if n > 0 then insert into pet_love_log (couple_id, pet_id, amount, reason) values (p_couple, p_pet, p_amount, p_reason); end if;
end $$;

create or replace function bb_pet_json(p couple_pets, p_user uuid, p_today date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'species', p.species, 'color', p.color, 'name', p.name, 'love', p.love, 'stage', p.stage,
    'outfit', p.outfit, 'createdAt', p.created_at,
    'patMe', exists (select 1 from pet_pats where pet_id = p.id and user_id = p_user and local_date = p_today),
    'patPartner', exists (select 1 from pet_pats where pet_id = p.id and user_id <> p_user and local_date = p_today))
$$;

/** Bekleyen sahiplenmenin süresi dolduysa başlatana yarısını geri ver */
create or replace function bb_pet_expire(p_couple uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a pet_adoptions;
begin
  for a in select * from pet_adoptions where couple_id = p_couple and status = 'PENDING' and expires_at <= now() for update loop
    update pet_adoptions set status = 'EXPIRED' where id = a.id;
    if a.started_by is not null then
      update heroes set gold = gold + a.half where user_id = a.started_by;
      insert into hero_log (user_id, kind, gold) values (a.started_by, 'PET_REFUND', a.half);
    end if;
  end loop;
end $$;

create or replace function get_pets() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; a pet_adoptions; n int;
begin
  c := bb_couple_of(u);
  perform bb_pet_expire(c.id);
  v_today := bb_local_date(now(), c.timezone);
  select * into a from pet_adoptions where couple_id = c.id and status = 'PENDING';
  select count(*) into n from couple_pets where couple_id = c.id;
  return jsonb_build_object(
    'pets', (select coalesce(jsonb_agg(bb_pet_json(p, u, v_today) order by p.created_at), '[]'::jsonb) from couple_pets p where p.couple_id = c.id),
    'wardrobe', (select coalesce(jsonb_agg(item_key), '[]'::jsonb) from pet_wardrobe where couple_id = c.id),
    'pending', case when a.id is null then null else jsonb_build_object('id', a.id, 'species', a.species, 'color', a.color, 'name', a.name,
        'price', a.price, 'half', a.half, 'rest', a.price - a.half, 'startedBy', a.started_by, 'expiresAt', a.expires_at) end,
    'bonus', bb_pet_bonus(c.id),
    'slots', bb_pet_slots(c.id),
    'priceMult', (bb_pet_cfg()->'priceMult'->>least(n, 3))::numeric,
    'cfg', bb_pet_cfg(),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'reason', reason, 'pet', pet_id, 'at', created_at) order by created_at desc), '[]'::jsonb)
            from (select * from pet_love_log where couple_id = c.id order by created_at desc limit 8) l)
  );
end $$;

-- =====================================================================
-- 4. Sahiplenme (ortak alım), sevme, gardırop, giydirme, ad
-- =====================================================================
create or replace function pet_adopt_start(p_species text, p_color text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; sp jsonb; n int; v_price int; v_half int; v_name text := btrim(coalesce(p_name, ''));
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  perform bb_pet_expire(c.id);
  if exists (select 1 from pet_adoptions where couple_id = c.id and status = 'PENDING') then raise exception 'ADOPT_PENDING'; end if;
  sp := bb_pet_cfg()->'species'->p_species;
  if sp is null then raise exception 'NOT_FOUND'; end if;
  if coalesce(p_color, '') !~ '^c[0-3]$' then raise exception 'INVALID_VALUE'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 16 then raise exception 'PET_NAME'; end if;
  select count(*) into n from couple_pets where couple_id = c.id;
  if n >= bb_pet_slots(c.id) then raise exception 'PET_SLOTS'; end if;
  v_price := round((sp->>'price')::int * (bb_pet_cfg()->'priceMult'->>least(n, 3))::numeric);
  v_half := ceil(v_price / 2.0);
  if (select gold from heroes where user_id = u for update) < v_half then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - v_half where user_id = u;
  insert into hero_log (user_id, kind, gold) values (u, 'PET', -v_half);
  insert into pet_adoptions (couple_id, species, color, name, price, half, started_by, expires_at)
    values (c.id, p_species, p_color, v_name, v_price, v_half, u, now() + make_interval(hours => (bb_pet_cfg()->>'adoptHours')::int));
  perform bb_event(v_partner, 'PET_ADOPT_REQUEST', jsonb_build_object('species', p_species, 'color', p_color, 'name', v_name, 'rest', v_price - v_half), u);
  return get_pets();
end $$;

create or replace function pet_adopt_confirm(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; a pet_adoptions; v_rest int; p couple_pets;
begin
  c := bb_couple_of(u);
  perform bb_pet_expire(c.id);
  select * into a from pet_adoptions where id = p_id and couple_id = c.id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'PENDING' or a.started_by = u then raise exception 'INVALID_STATE'; end if;
  if (select count(*) from couple_pets where couple_id = c.id) >= bb_pet_slots(c.id) then raise exception 'PET_SLOTS'; end if;
  v_rest := a.price - a.half;
  if (select gold from heroes where user_id = u for update) < v_rest then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - v_rest where user_id = u;
  insert into hero_log (user_id, kind, gold) values (u, 'PET', -v_rest);
  insert into couple_pets (couple_id, species, color, name) values (c.id, a.species, a.color, a.name) returning * into p;
  update pet_adoptions set status = 'DONE', pet_id = p.id where id = a.id;
  if a.started_by is not null then
    perform bb_event(a.started_by, 'PET_ADOPTED', jsonb_build_object('pet', p.id, 'species', p.species, 'color', p.color, 'name', p.name), u);
  end if;
  return get_pets();
end $$;

create or replace function pet_adopt_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; a pet_adoptions;
begin
  c := bb_couple_of(u);
  select * into a from pet_adoptions where id = p_id and couple_id = c.id and status = 'PENDING' for update;
  if a.id is null then raise exception 'INVALID_STATE'; end if;
  update pet_adoptions set status = 'CANCELLED' where id = a.id;
  if a.started_by is not null then
    update heroes set gold = gold + a.half where user_id = a.started_by;
    insert into hero_log (user_id, kind, gold) values (a.started_by, 'PET_REFUND', a.half);
  end if;
  return get_pets();
end $$;

create or replace function pet_pat(p_pet uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; n int;
begin
  c := bb_couple_of(u);
  if not exists (select 1 from couple_pets where id = p_pet and couple_id = c.id) then raise exception 'NOT_FOUND'; end if;
  v_today := bb_local_date(now(), c.timezone);
  insert into pet_pats (pet_id, user_id, local_date) values (p_pet, u, v_today) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'DAILY_LIMIT'; end if;
  perform bb_pet_love(c.id, (bb_pet_cfg()->>'patLove')::int, 'PAT', p_pet);
  if (select count(*) from pet_pats where pet_id = p_pet and local_date = v_today) >= 2 then
    perform bb_pet_love(c.id, (bb_pet_cfg()->>'patBoth')::int, 'PAT_BOTH', p_pet);
  end if;
  return get_pets();
end $$;

create or replace function pet_buy_item(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; it jsonb; v_partner uuid;
begin
  c := bb_couple_of(u);
  select x into it from jsonb_array_elements(bb_pet_items()) x where x->>'key' = p_key;
  if it is null then raise exception 'NOT_FOUND'; end if;
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
  if p_slot not in ('HEAD','NECK','FACE','BACK','AURA','COLOR') then raise exception 'INVALID_VALUE'; end if;
  if p_slot = 'COLOR' then
    if v is null or v !~ '^c[0-3]$' then
      select x into it from jsonb_array_elements(bb_pet_items()) x where x->>'key' = v and x->>'slot' = 'COLOR';
      if it is null then raise exception 'INVALID_VALUE'; end if;
      if not exists (select 1 from pet_wardrobe where couple_id = c.id and item_key = v) then raise exception 'NOT_OWNED'; end if;
    end if;
    update couple_pets set color = v where id = p_pet;
  elsif v is null then
    update couple_pets set outfit = outfit - p_slot where id = p_pet;
  else
    select x into it from jsonb_array_elements(bb_pet_items()) x where x->>'key' = v and x->>'slot' = p_slot;
    if it is null then raise exception 'INVALID_VALUE'; end if;
    if not exists (select 1 from pet_wardrobe where couple_id = c.id and item_key = v) then raise exception 'NOT_OWNED'; end if;
    update couple_pets set outfit = outfit || jsonb_build_object(p_slot, v) where id = p_pet;
  end if;
  return get_pets();
end $$;

create or replace function pet_rename(p_pet uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_name text := btrim(coalesce(p_name, ''));
begin
  c := bb_couple_of(u);
  if char_length(v_name) < 1 or char_length(v_name) > 16 then raise exception 'PET_NAME'; end if;
  update couple_pets set name = v_name where id = p_pet and couple_id = c.id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return get_pets();
end $$;

-- =====================================================================
-- 5. Sevgi kaynakları (tetikleyiciler; mevcut fonksiyonlara dokunmadan)
-- =====================================================================
create or replace function bb_pet_love_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  case TG_TABLE_NAME
    when 'hero_days' then
      if new.closed and not old.closed and new.all_done and not new.izin then perform bb_pet_love((bb_couple_of(new.user_id)).id, 3, 'FULL_DAY'); end if;
    when 'couple_combos' then perform bb_pet_love(new.couple_id, 5, 'COMBO');
    when 'together_log' then
      if new.status = 'DONE' and old.status is distinct from 'DONE' then perform bb_pet_love(new.couple_id, 5, 'TOGETHER'); end if;
    when 'word_games' then
      if new.solved and not old.solved then perform bb_pet_love(new.couple_id, 3, 'WORD'); end if;
    when 'notes' then perform bb_pet_love(new.couple_id, 1, 'NOTE');
    when 'duels' then
      if new.status = 'DONE' and old.status <> 'DONE' then perform bb_pet_love(new.couple_id, 2, 'DUEL'); end if;
    when 'quiz_games' then
      if new.finished and not old.finished then perform bb_pet_love(new.couple_id, 4, 'QUIZ'); end if;
    when 'raids' then
      if new.finished and not old.finished then perform bb_pet_love(new.couple_id, 2, 'RAID'); end if;
    when 'bosses' then
      if new.defeated_at is not null and old.defeated_at is null then perform bb_pet_love(new.couple_id, 10, 'BOSS'); end if;
    when 'sudoku_games' then
      if new.status = 'DONE' and old.status <> 'DONE' then perform bb_pet_love(new.couple_id, 5, 'SUDOKU'); end if;
    else null;
  end case;
  return null;
end $$;

drop trigger if exists bb_pet_love_hd on hero_days;
create trigger bb_pet_love_hd after update of closed on hero_days for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_cc on couple_combos;
create trigger bb_pet_love_cc after insert on couple_combos for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_tl on together_log;
create trigger bb_pet_love_tl after update of status on together_log for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_wg on word_games;
create trigger bb_pet_love_wg after update of solved on word_games for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_nt on notes;
create trigger bb_pet_love_nt after insert on notes for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_du on duels;
create trigger bb_pet_love_du after update of status on duels for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_qz on quiz_games;
create trigger bb_pet_love_qz after update of finished on quiz_games for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_rd on raids;
create trigger bb_pet_love_rd after update of finished on raids for each row execute function bb_pet_love_trg();
drop trigger if exists bb_pet_love_bs on bosses;
create trigger bb_pet_love_bs after update of defeated_at on bosses for each row execute function bb_pet_love_trg();

-- =====================================================================
-- 6. Gün üretimi: dost bonusu XP ve hasara (0015 ile aynı, yalnızca v_pet eklendi)
-- =====================================================================
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int; v_regen int := coalesce(((select value from app_config where key = 'game')->>'morningRegen')::int, 10);
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
  v_regen := v_regen + 2 * bb_castle_lv(c.id, 'kitchen');
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
  update heroes set hp = least(bb_user_max_hp(p_user), hp + v_regen) where user_id = p_user;
end $$;

-- =====================================================================
-- 7. Sudoku
-- =====================================================================
alter table duels drop constraint if exists duels_game_check;
alter table duels add constraint duels_game_check check (game in ('TAP','MEMORY','TIMING','WORDS','SLIDE','MATH','COLOR','SUDOKU'));
create or replace function bb_game_max(p_game text) returns int
language sql immutable as $$
  select case p_game when 'TAP' then 120 when 'MEMORY' then 40 when 'TIMING' then 500 when 'WORDS' then 60 when 'SLIDE' then 300
    when 'MATH' then 40 when 'COLOR' then 40 when 'SUDOKU' then 1000 else 0 end
$$;

create table if not exists sudoku_bank (
  id bigint generated always as identity primary key,
  level int not null check (level between 1 and 3),
  puzzle text not null check (char_length(puzzle) = 81),
  solution text not null check (char_length(solution) = 81)
);
create table if not exists sudoku_games (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  level int not null,
  puzzle text not null,
  solution text not null,
  board text not null,
  owners text not null,              -- 81 karakter: '.' ipucu/boş, 'a' başlatan, 'b' eşi
  player_a uuid references app_users(id) on delete set null,
  player_b uuid references app_users(id) on delete set null,
  turn uuid,
  moves_left int not null default 3,
  score_a int not null default 0,
  score_b int not null default 0,
  miss_a int not null default 0,
  miss_b int not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DONE','CANCELLED')),
  winner uuid,
  last_move jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists sudoku_one_active on sudoku_games(couple_id) where status = 'ACTIVE';
create index if not exists sudoku_games_couple on sudoku_games(couple_id, created_at desc);
alter table sudoku_bank enable row level security;
alter table sudoku_games enable row level security;
drop trigger if exists bb_pet_love_sg on sudoku_games;
create trigger bb_pet_love_sg after update of status on sudoku_games for each row execute function bb_pet_love_trg();

/** Bankadaki bulmacayı rastgele simetriyle dönüştürür (rakam, bant içi satır/sütun, bant sırası, devrik): tek çözüm korunur */
create or replace function bb_sudoku_shuffle(p_puzzle text, p_solution text, out puzzle text, out solution text)
language plpgsql volatile as $$
declare dig int[]; rws int[] := '{}'; cls int[] := '{}'; b int; tr boolean := random() < 0.5; r int; cc int; src int; ch text;
begin
  select array_agg(x order by random()) into dig from generate_series(1, 9) x;
  for b in select x from generate_series(0, 2) x order by random() loop
    rws := rws || (select array_agg(b * 3 + x order by random()) from generate_series(0, 2) x);
  end loop;
  for b in select x from generate_series(0, 2) x order by random() loop
    cls := cls || (select array_agg(b * 3 + x order by random()) from generate_series(0, 2) x);
  end loop;
  puzzle := ''; solution := '';
  for r in 0..8 loop
    for cc in 0..8 loop
      src := case when tr then rws[cc + 1] * 9 + cls[r + 1] else rws[r + 1] * 9 + cls[cc + 1] end;
      ch := substr(p_puzzle, src + 1, 1);
      puzzle := puzzle || case when ch = '0' then '0' else dig[ch::int]::text end;
      solution := solution || dig[substr(p_solution, src + 1, 1)::int]::text;
    end loop;
  end loop;
end $$;

create or replace function bb_sudoku_json(g sudoku_games) returns jsonb
language sql stable as $$
  select case when g.id is null then null else jsonb_build_object('id', g.id, 'level', g.level, 'puzzle', g.puzzle, 'board', g.board, 'owners', g.owners,
    'playerA', g.player_a, 'playerB', g.player_b, 'turn', g.turn, 'movesLeft', g.moves_left,
    'scoreA', g.score_a, 'scoreB', g.score_b, 'missA', g.miss_a, 'missB', g.miss_b,
    'status', g.status, 'winner', g.winner, 'lastMove', g.last_move, 'createdAt', g.created_at, 'finishedAt', g.finished_at) end
$$;

create or replace function get_sudoku() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; g sudoku_games;
begin
  c := bb_couple_of(u);
  select * into g from sudoku_games where couple_id = c.id and status = 'ACTIVE';
  if g.id is null then
    select * into g from sudoku_games where couple_id = c.id and status = 'DONE' and finished_at > now() - interval '2 days' order by finished_at desc limit 1;
  end if;
  return jsonb_build_object('game', bb_sudoku_json(g),
    'record', (select jsonb_build_object('me', count(*) filter (where winner = u), 'partner', count(*) filter (where winner is not null and winner <> u),
        'draws', count(*) filter (where winner is null)) from sudoku_games where couple_id = c.id and status = 'DONE'));
end $$;

create or replace function sudoku_start(p_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; bk sudoku_bank; sh record;
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  if p_level not between 1 and 3 then raise exception 'INVALID_VALUE'; end if;
  if exists (select 1 from sudoku_games where couple_id = c.id and status = 'ACTIVE') then raise exception 'INVALID_STATE'; end if;
  select * into bk from sudoku_bank where level = p_level order by random() limit 1;
  if bk.id is null then raise exception 'NOT_FOUND'; end if;
  select * into sh from bb_sudoku_shuffle(bk.puzzle, bk.solution);
  insert into sudoku_games (couple_id, level, puzzle, solution, board, owners, player_a, player_b, turn)
    values (c.id, p_level, sh.puzzle, sh.solution, sh.puzzle, repeat('.', 81), u, v_partner, u);
  perform bb_event(v_partner, 'SUDOKU_START', jsonb_build_object('level', p_level), u);
  return get_sudoku();
end $$;

/** Ortak sudoku hamlesi: doğru rakam +1 ve tamamlanan her satır/sütun/kutu +3; sırada en çok 3 doğru; yanlış −1 ve sıra eşine */
create or replace function sudoku_move(p_cell int, p_digit int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; g sudoku_games; v_ok boolean; v_units int := 0; v_pts int; v_other uuid; v_a boolean;
  r int; cc int; bx int;
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
    g.board := overlay(g.board placing p_digit::text from p_cell + 1 for 1);
    g.owners := overlay(g.owners placing case when v_a then 'a' else 'b' end from p_cell + 1 for 1);
    r := p_cell / 9; cc := p_cell % 9; bx := (r / 3) * 3 * 9 + (cc / 3) * 3;
    if position('0' in substr(g.board, r * 9 + 1, 9)) = 0 then v_units := v_units + 1; end if;
    if not exists (select 1 from generate_series(0, 8) s(j) where substr(g.board, s.j * 9 + cc + 1, 1) = '0') then v_units := v_units + 1; end if;
    if not exists (select 1 from generate_series(0, 8) s(j) where substr(g.board, bx + (s.j / 3) * 9 + (s.j % 3) + 1, 1) = '0') then v_units := v_units + 1; end if;
    v_pts := 1 + 3 * v_units;
    if v_a then g.score_a := g.score_a + v_pts; else g.score_b := g.score_b + v_pts; end if;
    g.moves_left := g.moves_left - 1;
    g.last_move := jsonb_build_object('by', u, 'cell', p_cell, 'digit', p_digit, 'ok', true, 'units', v_units, 'pts', v_pts);
    if position('0' in g.board) = 0 then
      g.status := 'DONE'; g.finished_at := now(); g.turn := null;
      g.winner := case when g.score_a > g.score_b then g.player_a when g.score_b > g.score_a then g.player_b end;
    elsif g.moves_left <= 0 then
      g.turn := v_other; g.moves_left := 3;
    end if;
  else
    if v_a then g.miss_a := g.miss_a + 1; g.score_a := greatest(0, g.score_a - 1); else g.miss_b := g.miss_b + 1; g.score_b := greatest(0, g.score_b - 1); end if;
    g.last_move := jsonb_build_object('by', u, 'cell', p_cell, 'digit', p_digit, 'ok', false);
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

create or replace function sudoku_pass() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; g sudoku_games; v_other uuid;
begin
  c := bb_couple_of(u);
  select * into g from sudoku_games where couple_id = c.id and status = 'ACTIVE' for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if g.turn is distinct from u then raise exception 'NOT_YOUR_TURN'; end if;
  v_other := case when u = g.player_a then g.player_b else g.player_a end;
  update sudoku_games set turn = v_other, moves_left = 3, last_move = jsonb_build_object('by', u, 'pass', true), updated_at = now() where id = g.id;
  if v_other is not null then perform bb_event(v_other, 'SUDOKU_TURN', jsonb_build_object('pass', true), u); end if;
  return get_sudoku();
end $$;

create or replace function sudoku_cancel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  update sudoku_games set status = 'CANCELLED', turn = null, finished_at = now(), updated_at = now() where couple_id = c.id and status = 'ACTIVE';
  if not found then raise exception 'INVALID_STATE'; end if;
  return get_sudoku();
end $$;

-- =====================================================================
-- 8. get_game: eski gövde bb_get_game_core olur, yenisi dostları ve sudoku sırasını ekler
--    (ileride get_game gövdesi değişecekse bb_get_game_core yeniden tanımlanmalı)
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'bb_get_game_core') then
    alter function get_game() rename to bb_get_game_core;
  end if;
end $$;

create or replace function get_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; g jsonb; v_today date;
begin
  g := bb_get_game_core();
  c := bb_couple_of(u);
  if c.id is null then return g; end if;
  v_today := bb_local_date(now(), c.timezone);
  return g || jsonb_build_object(
    'pets', (select coalesce(jsonb_agg(bb_pet_json(p, u, v_today) order by p.created_at), '[]'::jsonb) from couple_pets p where p.couple_id = c.id),
    'petBonus', bb_pet_bonus(c.id),
    'play', coalesce(g->'play', '{}'::jsonb) || jsonb_build_object(
      'sudoku', exists (select 1 from sudoku_games where couple_id = c.id and status = 'ACTIVE' and turn = u),
      'petAdopt', exists (select 1 from pet_adoptions where couple_id = c.id and status = 'PENDING' and started_by <> u and expires_at > now())));
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

select 'evcil + sudoku ok' as result;
