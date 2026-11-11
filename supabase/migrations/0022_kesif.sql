-- 0022: Keşif paketi (kullanıcı isteği, 11 Kasım 2026)
--  1. Sisli dünya haritası: yenilen her 4 canavar yeni bölgenin sisini açar (9 bölge). Bölge sahneyi, müziği ve keşif yerlerini belirler.
--  2. Dostu keşfe gönderme: açık bir bölgeye 4 saatliğine; dönünce ikinize altın, dosta sevgi, kart, bazen tohum ve küçük bir hikâye.
--  3. Koleksiyon defteri: kartlar (9 bölge × 4), çiçekler, dost türleri, süsler, canavarlar, anılar.
--  4. Dost elçi: dostunla eşine kalp ya da tek satırlık not (günde 3).
--  5. Ortak bahçe: tohum ek; ikiniz de suladığınız her gün bitki bir evre büyür; hasat altın + dosta mama + çiçek.
--  6. Anılar ve zaman kapsülü: önemli anlar kendiliğinden anı kartı olur; kapsüle yazılan mektup 1/3/6/12 ay sonra açılır.
--  7. Haftanın yol ayrımı: her hafta iki yol; ikiniz ayrı oy verirsiniz. Aynı yol → seçilen etki + ikinize 25 altın; farklı → zar.
--  8. get_game: world, fork, petMail, yesterday, garden, play.capsule eklenir; dost json'una keşif (away) eklenir.

-- =====================================================================
-- 0. Ayarlar
-- =====================================================================
create or replace function bb_world_cfg() returns jsonb
language sql immutable as $$
  select '{
    "perRegion": 4, "expHours": 4, "expPerDay": 2, "letterPerDay": 3, "plots": 3,
    "regions": ["meadow","forest","swamp","desert","snow","volcano","cave","sky","stars"],
    "seeds": [
      {"key":"daisy","days":3,"price":20,"gold":15,"region":0},
      {"key":"tulip","days":4,"price":40,"gold":28,"region":0},
      {"key":"rose","days":5,"price":70,"gold":50,"region":0},
      {"key":"lavender","days":4,"price":null,"gold":35,"region":1},
      {"key":"lotus","days":4,"price":null,"gold":40,"region":2},
      {"key":"desertrose","days":5,"price":null,"gold":50,"region":3},
      {"key":"snowdrop","days":5,"price":null,"gold":55,"region":4},
      {"key":"firelily","days":6,"price":null,"gold":70,"region":5},
      {"key":"crystal","days":6,"price":null,"gold":80,"region":6},
      {"key":"cloudcotton","days":7,"price":null,"gold":95,"region":7},
      {"key":"starflower","days":7,"price":null,"gold":120,"region":8}
    ],
    "forks": [
      {"a":{"key":"bridge","fx":"XP"},"b":{"key":"cave","fx":"GOLD"}},
      {"a":{"key":"river","fx":"LOVE"},"b":{"key":"pass","fx":"DMG"}},
      {"a":{"key":"market","fx":"GOLD"},"b":{"key":"woods","fx":"LOVE"}},
      {"a":{"key":"tower","fx":"DMG"},"b":{"key":"library","fx":"XP"}},
      {"a":{"key":"camp","fx":"LOVE"},"b":{"key":"ruins","fx":"GOLD"}},
      {"a":{"key":"lake","fx":"XP"},"b":{"key":"cliff","fx":"DMG"}},
      {"a":{"key":"village","fx":"GOLD"},"b":{"key":"shrine","fx":"XP"}},
      {"a":{"key":"meadow","fx":"LOVE"},"b":{"key":"forge","fx":"DMG"}}
    ],
    "forkFx": {"XP": 1.10, "GOLD": 1.20, "DMG": 1.15, "LOVE": 1.5},
    "forkAgreeGold": 25
  }'::jsonb
$$;

create or replace function bb_world_progress(p_couple uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from bosses where couple_id = p_couple and defeated_at is not null
$$;

create or replace function bb_world_region(p_couple uuid) returns int
language sql stable security definer set search_path = public as $$
  select least(jsonb_array_length(bb_world_cfg()->'regions') - 1, bb_world_progress(p_couple) / (bb_world_cfg()->>'perRegion')::int)
$$;

-- =====================================================================
-- 1. Tablolar
-- =====================================================================
create table if not exists pet_expeditions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  pet_id uuid not null references couple_pets(id) on delete cascade,
  region int not null,
  started_by uuid references app_users(id) on delete set null,
  local_date date not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid,
  loot jsonb
);
create unique index if not exists pet_exp_one_open on pet_expeditions(pet_id) where claimed_at is null;
create index if not exists pet_exp_couple on pet_expeditions(couple_id, started_at desc);

create table if not exists couple_cards (
  couple_id uuid not null references couples(id) on delete cascade,
  card text not null,
  count int not null default 1,
  first_at timestamptz not null default now(),
  primary key (couple_id, card)
);
create table if not exists couple_seeds (
  couple_id uuid not null references couples(id) on delete cascade,
  seed text not null,
  qty int not null default 0 check (qty >= 0),
  primary key (couple_id, seed)
);
create table if not exists garden_plots (
  couple_id uuid not null references couples(id) on delete cascade,
  slot int not null,
  seed text not null,
  growth int not null default 0,
  need int not null,
  planted_by uuid,
  planted_at timestamptz not null default now(),
  last_growth date,
  primary key (couple_id, slot)
);
create table if not exists garden_water (
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  local_date date not null,
  primary key (couple_id, user_id, local_date)
);
create table if not exists garden_flowers (
  couple_id uuid not null references couples(id) on delete cascade,
  seed text not null,
  count int not null default 1,
  first_at timestamptz not null default now(),
  primary key (couple_id, seed)
);
create table if not exists pet_letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  pet_id uuid references couple_pets(id) on delete set null,
  from_user uuid references app_users(id) on delete set null,
  to_user uuid references app_users(id) on delete cascade,
  kind text not null check (kind in ('HEART','NOTE')),
  text text,
  local_date date not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists pet_letters_to on pet_letters(to_user, seen_at);
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  key text not null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (couple_id, key)
);
create table if not exists time_capsules (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  author uuid references app_users(id) on delete set null,
  text text not null,
  open_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists capsule_reads (
  capsule_id uuid not null references time_capsules(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  primary key (capsule_id, user_id)
);
create table if not exists week_forks (
  couple_id uuid not null references couples(id) on delete cascade,
  week_start date not null,
  pair int not null,
  votes jsonb not null default '{}'::jsonb,
  result text check (result in ('A','B')),
  agreed boolean,
  decided_at timestamptz,
  primary key (couple_id, week_start)
);
alter table pet_expeditions enable row level security;
alter table couple_cards enable row level security;
alter table couple_seeds enable row level security;
alter table garden_plots enable row level security;
alter table garden_water enable row level security;
alter table garden_flowers enable row level security;
alter table pet_letters enable row level security;
alter table memories enable row level security;
alter table time_capsules enable row level security;
alter table capsule_reads enable row level security;
alter table week_forks enable row level security;

-- =====================================================================
-- 2. Anılar
-- =====================================================================
create or replace function bb_memory(p_couple uuid, p_key text, p_kind text, p_data jsonb default '{}'::jsonb, p_at timestamptz default now()) returns void
language sql security definer set search_path = public as $$
  insert into memories (couple_id, key, kind, data, created_at) values (p_couple, p_key, p_kind, coalesce(p_data, '{}'::jsonb), coalesce(p_at, now()))
  on conflict (couple_id, key) do nothing
$$;

create or replace function bb_mem_pet_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform bb_memory(new.couple_id, 'pet:' || new.id, 'PET_NEW', jsonb_build_object('name', new.name, 'species', new.species, 'color', new.color), new.created_at);
  elsif new.stage > old.stage then
    perform bb_memory(new.couple_id, 'petstage:' || new.id || ':' || new.stage, 'PET_STAGE',
      jsonb_build_object('name', new.name, 'species', new.species, 'color', new.color, 'stage', new.stage));
  end if;
  return null;
end $$;
drop trigger if exists bb_mem_pet on couple_pets;
create trigger bb_mem_pet after insert or update of stage on couple_pets for each row execute function bb_mem_pet_trg();

/** Canavar yenilince: ilk zafer anısı, her 4 zaferde yeni bölge (anı + ikinize olay) */
create or replace function bb_mem_boss_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; v_per int := (bb_world_cfg()->>'perRegion')::int; v_reg int; m uuid;
begin
  if new.defeated_at is null or old.defeated_at is not null then return null; end if;
  n := bb_world_progress(new.couple_id);
  if n = 1 then perform bb_memory(new.couple_id, 'boss:1', 'FIRST_BOSS', jsonb_build_object('boss', new.boss_key, 'name', new.name), new.defeated_at); end if;
  if n % 10 = 0 then perform bb_memory(new.couple_id, 'boss:' || n, 'BOSSES', jsonb_build_object('n', n), new.defeated_at); end if;
  if n % v_per = 0 and n / v_per < jsonb_array_length(bb_world_cfg()->'regions') then
    v_reg := n / v_per;
    perform bb_memory(new.couple_id, 'region:' || v_reg, 'REGION', jsonb_build_object('region', v_reg), new.defeated_at);
    for m in select user_id from memberships where couple_id = new.couple_id and ended_at is null loop
      perform bb_event(m, 'REGION', jsonb_build_object('region', v_reg));
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists bb_mem_boss on bosses;
create trigger bb_mem_boss after update of defeated_at on bosses for each row execute function bb_mem_boss_trg();

create or replace function bb_mem_combo_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from couple_combos where couple_id = new.couple_id;
  if n in (1, 10, 25, 50, 100, 200, 365, 500) then
    perform bb_memory(new.couple_id, 'combo:' || n, 'COMBO', jsonb_build_object('n', n));
  end if;
  return null;
end $$;
drop trigger if exists bb_mem_combo on couple_combos;
create trigger bb_mem_combo after insert on couple_combos for each row execute function bb_mem_combo_trg();

create or replace function bb_mem_level_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare m int; c couples;
begin
  if new.rewarded_level <= old.rewarded_level then return null; end if;
  c := bb_couple_of(new.user_id);
  if c.id is null then return null; end if;
  foreach m in array array[5, 10, 25, 50, 75, 100, 150, 200] loop
    if old.rewarded_level < m and new.rewarded_level >= m then
      perform bb_memory(c.id, 'level:' || new.user_id || ':' || m, 'LEVEL', jsonb_build_object('user', new.user_id, 'name', (select display_name from app_users where id = new.user_id), 'level', m));
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists bb_mem_level on heroes;
create trigger bb_mem_level after update of rewarded_level on heroes for each row execute function bb_mem_level_trg();

create or replace function bb_mem_sudoku_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'DONE' and old.status <> 'DONE' then
    perform bb_memory(new.couple_id, 'sudoku:1', 'FIRST_SUDOKU', jsonb_build_object('a', new.score_a, 'b', new.score_b));
  end if;
  return null;
end $$;
drop trigger if exists bb_mem_sudoku on sudoku_games;
create trigger bb_mem_sudoku after update of status on sudoku_games for each row execute function bb_mem_sudoku_trg();

-- Geçmişten anılar (bugüne kadar olanlar)
insert into memories (couple_id, key, kind, data, created_at)
select p.couple_id, 'pet:' || p.id, 'PET_NEW', jsonb_build_object('name', p.name, 'species', p.species, 'color', p.color), p.created_at from couple_pets p
on conflict do nothing;
insert into memories (couple_id, key, kind, data, created_at)
select couple_id, 'boss:1', 'FIRST_BOSS', jsonb_build_object('boss', boss_key, 'name', name), defeated_at
from (select distinct on (couple_id) * from bosses where defeated_at is not null order by couple_id, defeated_at) b
on conflict do nothing;
insert into memories (couple_id, key, kind, data, created_at)
select couple_id, 'region:' || (rn / 4), 'REGION', jsonb_build_object('region', rn / 4), defeated_at
from (select couple_id, defeated_at, row_number() over (partition by couple_id order by defeated_at) rn from bosses where defeated_at is not null) b
where rn % 4 = 0 and rn / 4 < 9
on conflict do nothing;
insert into memories (couple_id, key, kind, data, created_at)
select couple_id, 'combo:' || rn, 'COMBO', jsonb_build_object('n', rn), local_date::timestamptz + interval '21 hours'
from (select couple_id, local_date, row_number() over (partition by couple_id order by local_date) rn from couple_combos) x
where rn in (1, 10, 25, 50, 100, 200, 365, 500)
on conflict do nothing;
insert into memories (couple_id, key, kind, data, created_at)
select distinct on (couple_id) couple_id, 'sudoku:1', 'FIRST_SUDOKU', jsonb_build_object('a', score_a, 'b', score_b), finished_at
from sudoku_games where status = 'DONE' order by couple_id, finished_at
on conflict do nothing;
insert into memories (couple_id, key, kind, data, created_at)
select c.id, 'start', 'START', '{}'::jsonb, c.created_at from couples c where exists (select 1 from heroes h join memberships m on m.user_id = h.user_id where m.couple_id = c.id)
on conflict do nothing;

-- =====================================================================
-- 3. Yol ayrımı
-- =====================================================================
create or replace function bb_ensure_fork(p_couple uuid, p_week date) returns week_forks
language plpgsql security definer set search_path = public as $$
declare f week_forks;
begin
  insert into week_forks (couple_id, week_start, pair)
  values (p_couple, p_week, (extract(week from p_week)::int + abs(hashtext(p_couple::text)) % 8) % jsonb_array_length(bb_world_cfg()->'forks'))
  on conflict do nothing;
  select * into f from week_forks where couple_id = p_couple and week_start = p_week;
  return f;
end $$;

/** Bu haftanın yolunun etkisi bu tür mü? (XP/GOLD/DMG/LOVE) → çarpan */
create or replace function bb_fork_mult(p_couple uuid, p_date date, p_fx text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (bb_world_cfg()->'forkFx'->>p_fx)::numeric
    from week_forks f
    where f.couple_id = p_couple and f.week_start = bb_week_start(p_date) and f.result is not null
      and bb_world_cfg()->'forks'->f.pair->(case f.result when 'A' then 'a' else 'b' end)->>'fx' = p_fx
  ), 1)
$$;

create or replace function bb_fork_json(f week_forks, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when f.couple_id is null then null else jsonb_build_object(
    'week', f.week_start, 'pair', f.pair, 'option', bb_world_cfg()->'forks'->f.pair,
    'mine', f.votes->>(p_user::text),
    'partnerVoted', exists (select 1 from jsonb_object_keys(f.votes) k where k <> p_user::text),
    'partnerVote', case when f.result is not null then (select f.votes->>k from jsonb_object_keys(f.votes) k where k <> p_user::text limit 1) end,
    'result', f.result, 'agreed', f.agreed, 'decidedAt', f.decided_at) end
$$;

create or replace function fork_vote(p_choice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; f week_forks; v_partner uuid; v_other text; v_res text; v_fx text; v_mult numeric; m uuid;
begin
  if p_choice not in ('A','B') then raise exception 'INVALID_VALUE'; end if;
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  v_today := bb_local_date(now(), c.timezone);
  f := bb_ensure_fork(c.id, bb_week_start(v_today));
  select * into f from week_forks where couple_id = c.id and week_start = f.week_start for update;
  if f.result is not null or f.votes ? u::text then raise exception 'INVALID_STATE'; end if;
  f.votes := f.votes || jsonb_build_object(u::text, p_choice);
  v_other := f.votes->>(v_partner::text);
  if v_other is null then
    update week_forks set votes = f.votes where couple_id = c.id and week_start = f.week_start;
    perform bb_event(v_partner, 'FORK_VOTE', '{}'::jsonb, u);
  else
    v_res := case when v_other = p_choice then p_choice when random() < 0.5 then 'A' else 'B' end;
    update week_forks set votes = f.votes, result = v_res, agreed = (v_other = p_choice), decided_at = now()
      where couple_id = c.id and week_start = f.week_start;
    -- bugünün yapılmamış görevlerine de hemen uygula
    v_fx := bb_world_cfg()->'forks'->f.pair->(case v_res when 'A' then 'a' else 'b' end)->>'fx';
    v_mult := (bb_world_cfg()->'forkFx'->>v_fx)::numeric;
    if v_fx = 'XP' then
      update quests set xp = round(xp * v_mult)::int where local_date = v_today and not done and user_id in (u, v_partner);
    elsif v_fx = 'GOLD' then
      update quests set gold = round(gold * v_mult)::int where local_date = v_today and not done and user_id in (u, v_partner);
    elsif v_fx = 'DMG' then
      update quests set damage = round(damage * v_mult)::int where local_date = v_today and not done and user_id in (u, v_partner);
    end if;
    if v_other = p_choice then
      perform bb_grant(u, 'FORK', 0, (bb_world_cfg()->>'forkAgreeGold')::int);
      perform bb_grant(v_partner, 'FORK', 0, (bb_world_cfg()->>'forkAgreeGold')::int);
    end if;
    foreach m in array array[u, v_partner] loop
      perform bb_event(m, 'FORK_RESULT', jsonb_build_object('pair', f.pair, 'result', v_res, 'agreed', v_other = p_choice,
        'mine', case when m = u then p_choice else v_other end, 'theirs', case when m = u then v_other else p_choice end,
        'gold', case when v_other = p_choice then (bb_world_cfg()->>'forkAgreeGold')::int else 0 end), case when m = u then v_partner else u end);
    end loop;
  end if;
  return get_game();
end $$;

-- Gün üretimi: yol etkisi (0019 ile aynı, XP/altın/hasar çarpanı eklendi)
create or replace function bb_generate_day(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; d int; v_sides int;
  c couples; ev text; b_mind numeric; b_order numeric; b_spirit numeric; w numeric; k_lib numeric; k_forge numeric; k_garden numeric; k_market numeric; k_mosque numeric;
  v_k numeric; v_g text; v_pet numeric; f_xp numeric; f_gold numeric; f_dmg numeric;
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
  f_xp := bb_fork_mult(c.id, p_date, 'XP'); f_gold := bb_fork_mult(c.id, p_date, 'GOLD'); f_dmg := bb_fork_mult(c.id, p_date, 'DMG');
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
    round(bb_quest_xp(q.base_xp, d, h.class, q.category, q.kind) * b_mind * v_pet * f_xp
      * case when q.category = 'MIND' then k_lib when q.category = 'BODY' then k_forge else 1 end
      * case when (ev = 'MIND_DAY' and q.category = 'MIND') or (ev = 'BODY_DAY' and q.category = 'BODY') then 2 else 1 end)::int,
    round(q.base_xp * (bb_diff(d)->>'mult')::numeric / 2 * b_order * k_market * f_gold * case when q.category = 'ORDER' then k_garden else 1 end
      * case when ev = 'ORDER_DAY' and q.category = 'ORDER' then 2 when ev = 'GOLD_RAIN' and q.kind = 'SIDE' then 3 else 1 end)::int,
    greatest(1, round(bb_quest_xp(q.base_xp, 1, h.class, q.category, q.kind) * v_k * w * b_spirit * v_pet * f_dmg * case when q.category = 'SPIRIT' then k_mosque else 1 end
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

-- Dost sevgisi: yol etkisi "LOVE" ise ×1.5 (0017 ile aynı gövde)
create or replace function bb_pet_love(p_couple uuid, p_amount int, p_reason text, p_pet uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_new int; m uuid; n int := 0; v_amount int;
begin
  if p_couple is null or coalesce(p_amount, 0) <= 0 then return; end if;
  v_amount := round(p_amount * bb_fork_mult(p_couple, bb_local_date(now(), (select timezone from couples where id = p_couple)), 'LOVE'))::int;
  for r in select * from couple_pets where couple_id = p_couple and (p_pet is null or id = p_pet) for update loop
    n := n + 1;
    v_new := bb_pet_stage(r.love + v_amount);
    update couple_pets set love = love + v_amount, stage = greatest(stage, v_new) where id = r.id;
    if v_new > r.stage then
      for m in select user_id from memberships where couple_id = p_couple and ended_at is null loop
        perform bb_event(m, 'PET_STAGE', jsonb_build_object('pet', r.id, 'name', r.name, 'species', r.species, 'color', r.color, 'outfit', r.outfit, 'stage', v_new,
          'bonus', bb_pet_bonus(p_couple)));
      end loop;
    end if;
  end loop;
  if n > 0 then insert into pet_love_log (couple_id, pet_id, amount, reason) values (p_couple, p_pet, v_amount, p_reason); end if;
end $$;

-- =====================================================================
-- 4. Keşif
-- =====================================================================
create or replace function bb_pet_json(p couple_pets, p_user uuid, p_today date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'species', p.species, 'color', p.color, 'name', p.name, 'love', p.love, 'stage', p.stage,
    'outfit', p.outfit, 'createdAt', p.created_at,
    'patMe', exists (select 1 from pet_pats where pet_id = p.id and user_id = p_user and local_date = p_today),
    'patPartner', exists (select 1 from pet_pats where pet_id = p.id and user_id <> p_user and local_date = p_today),
    'away', (select jsonb_build_object('id', e.id, 'region', e.region, 'endsAt', e.ends_at, 'startedAt', e.started_at, 'by', e.started_by)
             from pet_expeditions e where e.pet_id = p.id and e.claimed_at is null),
    'tripsToday', (select count(*) from pet_expeditions e where e.pet_id = p.id and e.local_date = p_today))
$$;

create or replace function pet_explore(p_pet uuid, p_region int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid;
begin
  c := bb_couple_of(u);
  if not exists (select 1 from couple_pets where id = p_pet and couple_id = c.id) then raise exception 'NOT_FOUND'; end if;
  if p_region is null or p_region < 0 or p_region > bb_world_region(c.id) then raise exception 'REGION_LOCKED'; end if;
  if exists (select 1 from pet_expeditions where pet_id = p_pet and claimed_at is null) then raise exception 'PET_AWAY'; end if;
  v_today := bb_local_date(now(), c.timezone);
  if (select count(*) from pet_expeditions where pet_id = p_pet and local_date = v_today) >= (bb_world_cfg()->>'expPerDay')::int then raise exception 'DAILY_LIMIT'; end if;
  insert into pet_expeditions (couple_id, pet_id, region, started_by, local_date, ends_at)
    values (c.id, p_pet, p_region, u, v_today, now() + make_interval(hours => (bb_world_cfg()->>'expHours')::int));
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'PET_EXPLORE', jsonb_build_object('pet', p_pet, 'region', p_region,
    'name', (select name from couple_pets where id = p_pet)), u); end if;
  return get_pets();
end $$;

/** Keşiften dönüş: ikinize altın, dosta sevgi, kart (%75), tohum (%50), hikâye */
create or replace function pet_explore_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; e pet_expeditions; v_gold int; v_card text; v_new boolean := false; v_seed text; v_roll numeric;
  v_reg text; v_loot jsonb; m uuid; v_partner uuid; v_extra int := 0; p couple_pets;
begin
  c := bb_couple_of(u);
  select * into e from pet_expeditions where id = p_id and couple_id = c.id for update;
  if e.id is null then raise exception 'NOT_FOUND'; end if;
  if e.claimed_at is not null then raise exception 'INVALID_STATE'; end if;
  if e.ends_at > now() then raise exception 'NOT_READY'; end if;
  select * into p from couple_pets where id = e.pet_id;
  v_reg := bb_world_cfg()->'regions'->>e.region;
  v_gold := 15 + 4 * e.region + floor(random() * 16)::int;
  -- kart
  if random() < 0.75 then
    v_roll := random();
    v_card := v_reg || '_' || case when v_roll < 0.6 then 1 + floor(random() * 2)::int when v_roll < 0.9 then 3 else 4 end;
    v_new := not exists (select 1 from couple_cards where couple_id = c.id and card = v_card);
    insert into couple_cards (couple_id, card) values (c.id, v_card) on conflict (couple_id, card) do update set count = couple_cards.count + 1;
    if not v_new then v_extra := 10; end if;
  end if;
  -- tohum
  if random() < 0.5 then
    v_seed := case when e.region = 0 then (array['daisy','tulip','rose'])[1 + floor(random() * 3)::int]
      else (select x->>'key' from jsonb_array_elements(bb_world_cfg()->'seeds') x where (x->>'region')::int = e.region limit 1) end;
    insert into couple_seeds (couple_id, seed, qty) values (c.id, v_seed, 1) on conflict (couple_id, seed) do update set qty = couple_seeds.qty + 1;
  end if;
  v_loot := jsonb_build_object('gold', v_gold + v_extra, 'love', 6, 'card', v_card, 'newCard', v_new, 'seed', v_seed,
    'story', floor(random() * 6)::int, 'region', e.region, 'pet', e.pet_id, 'name', p.name, 'species', p.species, 'color', p.color, 'outfit', p.outfit, 'stage', p.stage);
  update pet_expeditions set claimed_at = now(), claimed_by = u, loot = v_loot where id = e.id;
  for m in select user_id from memberships where couple_id = c.id and ended_at is null loop
    perform bb_grant(m, 'EXPLORE', 0, v_gold + v_extra);
  end loop;
  perform bb_pet_love(c.id, 6, 'EXPLORE', e.pet_id);
  if not exists (select 1 from pet_expeditions where couple_id = c.id and claimed_at is not null and id <> e.id) then
    perform bb_memory(c.id, 'explore:1', 'FIRST_EXPLORE', jsonb_build_object('name', p.name, 'species', p.species, 'color', p.color, 'region', e.region));
  end if;
  if v_new and v_card like '%\_4' then
    perform bb_memory(c.id, 'rare:' || v_card, 'RARE_CARD', jsonb_build_object('card', v_card, 'name', p.name));
  end if;
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'PET_BACK', v_loot, u); end if;
  return get_pets() || jsonb_build_object('loot', v_loot);
end $$;

-- =====================================================================
-- 5. Dost elçi
-- =====================================================================
create or replace function pet_send_letter(p_pet uuid, p_kind text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  if p_kind not in ('HEART','NOTE') then raise exception 'INVALID_VALUE'; end if;
  if p_kind = 'NOTE' and (v_text is null or char_length(v_text) > 80) then raise exception 'INVALID_VALUE'; end if;
  if not exists (select 1 from couple_pets where id = p_pet and couple_id = c.id) then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from pet_expeditions where pet_id = p_pet and claimed_at is null) then raise exception 'PET_AWAY'; end if;
  v_today := bb_local_date(now(), c.timezone);
  if (select count(*) from pet_letters where from_user = u and local_date = v_today) >= (bb_world_cfg()->>'letterPerDay')::int then raise exception 'DAILY_LIMIT'; end if;
  insert into pet_letters (couple_id, pet_id, from_user, to_user, kind, text, local_date)
    values (c.id, p_pet, u, v_partner, p_kind, case when p_kind = 'NOTE' then v_text end, v_today);
  perform bb_pet_love(c.id, 1, 'LETTER', p_pet);
  return get_pets();
end $$;

create or replace function pet_letter_seen(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  update pet_letters set seen_at = now() where id = p_id and to_user = u and seen_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- 6. Ortak bahçe
-- =====================================================================
create or replace function bb_seed(p_key text) returns jsonb
language sql immutable as $$
  select x from jsonb_array_elements(bb_world_cfg()->'seeds') x where x->>'key' = p_key
$$;

create or replace function bb_garden_slots(p_couple uuid) returns int
language sql stable security definer set search_path = public as $$
  select (bb_world_cfg()->>'plots')::int + bb_castle_lv(p_couple, 'garden')
$$;

create or replace function get_garden() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid;
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  v_today := bb_local_date(now(), c.timezone);
  return jsonb_build_object(
    'slots', bb_garden_slots(c.id),
    'plots', (select coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'seed', seed, 'growth', growth, 'need', need, 'ready', growth >= need,
        'grewToday', last_growth = v_today, 'plantedAt', planted_at) order by slot), '[]'::jsonb) from garden_plots where couple_id = c.id),
    'seeds', (select coalesce(jsonb_object_agg(seed, qty), '{}'::jsonb) from couple_seeds where couple_id = c.id and qty > 0),
    'flowers', (select coalesce(jsonb_object_agg(seed, count), '{}'::jsonb) from garden_flowers where couple_id = c.id),
    'waterMe', exists (select 1 from garden_water where couple_id = c.id and user_id = u and local_date = v_today),
    'waterPartner', exists (select 1 from garden_water where couple_id = c.id and user_id = v_partner and local_date = v_today),
    'cfg', jsonb_build_object('seeds', bb_world_cfg()->'seeds'));
end $$;

create or replace function garden_buy_seed(p_seed text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; s jsonb := bb_seed(p_seed); v_price int;
begin
  c := bb_couple_of(u);
  if s is null or s->>'price' is null then raise exception 'NOT_FOUND'; end if;
  v_price := (s->>'price')::int;
  if (select gold from heroes where user_id = u for update) < v_price then raise exception 'INSUFFICIENT_GOLD'; end if;
  update heroes set gold = gold - v_price where user_id = u;
  insert into hero_log (user_id, kind, gold) values (u, 'SEED', -v_price);
  insert into couple_seeds (couple_id, seed, qty) values (c.id, p_seed, 1) on conflict (couple_id, seed) do update set qty = couple_seeds.qty + 1;
  return get_garden();
end $$;

create or replace function garden_plant(p_slot int, p_seed text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; s jsonb := bb_seed(p_seed); v_partner uuid;
begin
  c := bb_couple_of(u);
  if s is null then raise exception 'NOT_FOUND'; end if;
  if p_slot is null or p_slot < 0 or p_slot >= bb_garden_slots(c.id) then raise exception 'INVALID_VALUE'; end if;
  if exists (select 1 from garden_plots where couple_id = c.id and slot = p_slot) then raise exception 'INVALID_STATE'; end if;
  update couple_seeds set qty = qty - 1 where couple_id = c.id and seed = p_seed and qty > 0;
  if not found then raise exception 'NOT_OWNED'; end if;
  insert into garden_plots (couple_id, slot, seed, need, planted_by) values (c.id, p_slot, p_seed, (s->>'days')::int, u);
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'GARDEN_PLANT', jsonb_build_object('seed', p_seed), u); end if;
  return get_garden();
end $$;

/** Sula: günde bir kez; ikiniz de suladıysanız bugün her bitki bir evre büyür */
create or replace function garden_water() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid; v_both boolean;
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  v_today := bb_local_date(now(), c.timezone);
  insert into garden_water (couple_id, user_id, local_date) values (c.id, u, v_today) on conflict do nothing;
  if not found then raise exception 'DAILY_LIMIT'; end if;
  v_both := v_partner is not null and exists (select 1 from garden_water where couple_id = c.id and user_id = v_partner and local_date = v_today);
  if v_both then
    update garden_plots set growth = least(need, growth + 1), last_growth = v_today
      where couple_id = c.id and last_growth is distinct from v_today and growth < need;
  elsif v_partner is not null and exists (select 1 from garden_plots where couple_id = c.id) then
    perform bb_event(v_partner, 'GARDEN_WATER', '{}'::jsonb, u);
  end if;
  return get_garden();
end $$;

create or replace function garden_harvest(p_slot int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; pl garden_plots; s jsonb; m uuid; v_partner uuid; v_gold int;
begin
  c := bb_couple_of(u);
  select * into pl from garden_plots where couple_id = c.id and slot = p_slot for update;
  if pl.couple_id is null then raise exception 'NOT_FOUND'; end if;
  if pl.growth < pl.need then raise exception 'NOT_READY'; end if;
  s := bb_seed(pl.seed);
  v_gold := (s->>'gold')::int;
  delete from garden_plots where couple_id = c.id and slot = p_slot;
  insert into garden_flowers (couple_id, seed) values (c.id, pl.seed) on conflict (couple_id, seed) do update set count = garden_flowers.count + 1;
  for m in select user_id from memberships where couple_id = c.id and ended_at is null loop
    perform bb_grant(m, 'HARVEST', 0, v_gold);
  end loop;
  perform bb_pet_love(c.id, 4, 'GARDEN');
  perform bb_memory(c.id, 'harvest:1', 'FIRST_HARVEST', jsonb_build_object('seed', pl.seed));
  if (s->>'region')::int > 0 then perform bb_memory(c.id, 'flower:' || pl.seed, 'RARE_FLOWER', jsonb_build_object('seed', pl.seed)); end if;
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'GARDEN_HARVEST', jsonb_build_object('seed', pl.seed, 'gold', v_gold), u); end if;
  return get_garden() || jsonb_build_object('harvest', jsonb_build_object('seed', pl.seed, 'gold', v_gold));
end $$;

-- =====================================================================
-- 7. Anılar, zaman kapsülü, koleksiyon, harita
-- =====================================================================
create or replace function capsule_write(p_text text, p_months int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_text text := btrim(coalesce(p_text, '')); v_id uuid; v_partner uuid;
begin
  c := bb_couple_of(u);
  if char_length(v_text) < 1 or char_length(v_text) > 1000 then raise exception 'INVALID_VALUE'; end if;
  if p_months not in (1, 3, 6, 12) then raise exception 'INVALID_VALUE'; end if;
  if (select count(*) from time_capsules where author = u and created_at > now() - interval '1 day') >= 3 then raise exception 'DAILY_LIMIT'; end if;
  insert into time_capsules (couple_id, author, text, open_at) values (c.id, u, v_text, now() + make_interval(months => p_months)) returning id into v_id;
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_event(v_partner, 'CAPSULE_NEW', jsonb_build_object('months', p_months), u); end if;
  return get_memories();
end $$;

create or replace function capsule_read(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; t time_capsules;
begin
  c := bb_couple_of(u);
  select * into t from time_capsules where id = p_id and couple_id = c.id;
  if t.id is null or t.open_at > now() then raise exception 'NOT_READY'; end if;
  insert into capsule_reads (capsule_id, user_id) values (p_id, u) on conflict do nothing;
  perform bb_memory(c.id, 'capsule:' || t.id, 'CAPSULE', jsonb_build_object('author', t.author, 'written', t.created_at), t.open_at);
  return get_memories();
end $$;

create or replace function get_memories() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  return jsonb_build_object(
    'memories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'key', key, 'kind', kind, 'data', data, 'at', created_at) order by created_at desc), '[]'::jsonb)
      from memories where couple_id = c.id),
    'capsules', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'author', t.author, 'openAt', t.open_at, 'createdAt', t.created_at,
        'open', t.open_at <= now(), 'read', exists (select 1 from capsule_reads r where r.capsule_id = t.id and r.user_id = u),
        'text', case when t.open_at <= now() then t.text end) order by t.open_at), '[]'::jsonb)
      from time_capsules t where t.couple_id = c.id));
end $$;

create or replace function get_collection() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  return jsonb_build_object(
    'cards', (select coalesce(jsonb_object_agg(card, count), '{}'::jsonb) from couple_cards where couple_id = c.id),
    'flowers', (select coalesce(jsonb_object_agg(seed, count), '{}'::jsonb) from garden_flowers where couple_id = c.id),
    'pets', (select coalesce(jsonb_agg(distinct jsonb_build_object('species', species, 'color', color)), '[]'::jsonb) from couple_pets where couple_id = c.id),
    'wardrobe', (select coalesce(jsonb_agg(item_key), '[]'::jsonb) from pet_wardrobe where couple_id = c.id),
    'bestiary', get_bestiary(),
    'region', bb_world_region(c.id));
end $$;

create or replace function get_world() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  return jsonb_build_object('progress', bb_world_progress(c.id), 'region', bb_world_region(c.id), 'perRegion', (bb_world_cfg()->>'perRegion')::int,
    'regions', jsonb_array_length(bb_world_cfg()->'regions'),
    'defeated', (select coalesce(jsonb_agg(jsonb_build_object('boss', boss_key, 'name', name, 'at', defeated_at) order by defeated_at), '[]'::jsonb)
      from bosses where couple_id = c.id and defeated_at is not null),
    'cards', (select count(*) from couple_cards where couple_id = c.id));
end $$;

-- =====================================================================
-- 8. get_game: dünya, yol ayrımı, elçi postası, dün, bahçe, kapsül
-- =====================================================================
create or replace function get_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; g jsonb; v_today date; v_partner uuid; f week_forks; v_garden boolean;
begin
  g := bb_get_game_core();
  c := bb_couple_of(u);
  if c.id is null then return g; end if;
  v_today := bb_local_date(now(), c.timezone);
  v_partner := bb_partner_of(u);
  if v_partner is not null then f := bb_ensure_fork(c.id, bb_week_start(v_today)); end if;
  v_garden := exists (select 1 from garden_plots where couple_id = c.id);
  return g || jsonb_build_object(
    'pets', (select coalesce(jsonb_agg(bb_pet_json(p, u, v_today) order by p.created_at), '[]'::jsonb) from couple_pets p where p.couple_id = c.id),
    'petBonus', bb_pet_bonus(c.id),
    'world', jsonb_build_object('progress', bb_world_progress(c.id), 'region', bb_world_region(c.id), 'perRegion', (bb_world_cfg()->>'perRegion')::int),
    'fork', bb_fork_json(f, u),
    'petMail', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'pet', l.pet_id, 'kind', l.kind, 'text', l.text, 'at', l.created_at) order by l.created_at), '[]'::jsonb)
      from pet_letters l where l.to_user = u and l.seen_at is null),
    'lettersToday', (select count(*) from pet_letters where from_user = u and local_date = v_today),
    'yesterday', jsonb_build_object(
      'me', (select jsonb_build_object('done', (select count(*) from quests q where q.user_id = u and q.local_date = v_today - 1 and q.done),
        'total', (select count(*) from quests q where q.user_id = u and q.local_date = v_today - 1), 'allDone', d.all_done, 'izin', d.izin, 'hpLost', d.hp_lost)
        from hero_days d where d.user_id = u and d.local_date = v_today - 1),
      'partner', (select jsonb_build_object('done', (select count(*) from quests q where q.user_id = v_partner and q.local_date = v_today - 1 and q.done),
        'total', (select count(*) from quests q where q.user_id = v_partner and q.local_date = v_today - 1), 'allDone', d.all_done, 'izin', d.izin)
        from hero_days d where d.user_id = v_partner and d.local_date = v_today - 1),
      'combo', exists (select 1 from couple_combos where couple_id = c.id and local_date = v_today - 1)),
    'garden', jsonb_build_object('plants', v_garden,
      'ready', (select count(*) from garden_plots where couple_id = c.id and growth >= need),
      'waterMe', exists (select 1 from garden_water where couple_id = c.id and user_id = u and local_date = v_today),
      'waterPartner', exists (select 1 from garden_water where couple_id = c.id and user_id = v_partner and local_date = v_today)),
    'play', coalesce(g->'play', '{}'::jsonb) || jsonb_build_object(
      'sudoku', exists (select 1 from sudoku_games where couple_id = c.id and status = 'ACTIVE' and turn = u),
      'petAdopt', exists (select 1 from pet_adoptions where couple_id = c.id and status = 'PENDING' and started_by <> u and expires_at > now()),
      'capsule', (select t.id from time_capsules t where t.couple_id = c.id and t.open_at <= now()
                  and not exists (select 1 from capsule_reads r where r.capsule_id = t.id and r.user_id = u) order by t.open_at limit 1),
      'explore', exists (select 1 from pet_expeditions where couple_id = c.id and claimed_at is null and ends_at <= now()),
      'fork', f.couple_id is not null and f.result is null and not (f.votes ? u::text)));
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
  get_sudoku(), sudoku_start(int), sudoku_move(int, int), sudoku_pass(), sudoku_cancel(),
  fork_vote(text), pet_explore(uuid, int), pet_explore_claim(uuid), pet_send_letter(uuid, text, text), pet_letter_seen(uuid),
  get_garden(), garden_buy_seed(text), garden_plant(int, text), garden_water(), garden_harvest(int),
  capsule_write(text, int), capsule_read(uuid), get_memories(), get_collection(), get_world()
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'keşif paketi ok' as result;
