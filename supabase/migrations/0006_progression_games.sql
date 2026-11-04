-- Birlikte Büyüyoruz · 0006_progression_games.sql · aylarca sürecek ilerleme + birlikte oyunlar (4 Kasım 2026)
-- Kullanıcı isteği: çok daha fazla seviye ve ödül (ama seviye atlamak sıkıcı olmasın), bilet daha seyrek (≈2 haftada 1),
-- eşle düellolar, ortak bulmacalar ve birlikte yapılan etkinlikler.
--  * Seviye eğrisi: sınırsız. Seviye L→L+1 = 150 + 30·L XP (Sv 10 ≈ 2 hafta, Sv 50 ≈ 6 ay, Sv 100 ≈ 1,5 yıl).
--  * Her seviyede altın ödülü, 5'in katlarında sandık + iksir; ödül bir seviye için yalnızca bir kez (geri alma istismarı yok).
--  * Bilet = 4 bilet parçası. Parça: boss yenince 1, iyi geçen hafta 1 → en hızlı 2 haftada 1 bilet.
--  * Düello (5 mini oyun, aynı tohumla sırayla oynanır), Günün Kelimesi (ortak, kişi başı 3 tahmin), Birlikte etkinlikler (haftalık 4).

-- =====================================================================
-- 1. Kahraman alanları ve ayarlar
-- =====================================================================
alter table heroes add column if not exists rewarded_level int not null default 1;
alter table heroes add column if not exists shards int not null default 0;
alter table heroes add column if not exists last_seen timestamptz;
-- mevcut kahramanlar: şimdiki seviyelerinin ödülleri verilmiş sayılır
update heroes set rewarded_level = greatest(rewarded_level, 1);

update app_config set value = value || '{
  "shardsPerTicket": 4,
  "duelRewardsPerDay": 5,
  "togetherXP": 40, "togetherGold": 25, "togetherDamage": 60,
  "bosses": [
    {"key":"slime_green","name":"Balçık Kral"},
    {"key":"golem_stone","name":"Taş Golem"},
    {"key":"dragon_green","name":"Orman Ejderi"},
    {"key":"slime_purple","name":"Zehir Balçığı"},
    {"key":"golem_lava","name":"Lav Golemi"},
    {"key":"dragon_shadow","name":"Gölge Ejderi"},
    {"key":"slime_blue","name":"Kristal Balçık"},
    {"key":"golem_ice","name":"Buz Golemi"},
    {"key":"dragon_red","name":"Kızıl Ejder"},
    {"key":"slime_gold","name":"Altın Balçık"},
    {"key":"golem_moss","name":"Yosun Devi"},
    {"key":"dragon_gold","name":"Güneş Ejderi"}
  ]
}'::jsonb, updated_at = now() where key = 'game';

-- =====================================================================
-- 2. Seviye eğrisi ve ödüller
-- =====================================================================
create or replace function bb_level_start(l int) returns bigint
language sql immutable as $$ select (greatest(l, 1) - 1)::bigint * (150 + 15 * greatest(l, 1)) $$;

create or replace function bb_level(xp bigint) returns int
language plpgsql immutable as $$
declare l int;
begin
  l := greatest(1, floor((-135 + sqrt(18225 + 60.0 * (150 + greatest(xp, 0)))) / 30)::int);
  while bb_level_start(l + 1) <= xp loop l := l + 1; end loop;
  while l > 1 and bb_level_start(l) > xp loop l := l - 1; end loop;
  return l;
end $$;

create or replace function bb_max_hp(l int) returns int
language sql immutable as $$ select 100 + 4 * (greatest(l, 1) - 1) $$;

-- Seviye ödülü (istemcideki levelReward ile aynı)
create or replace function bb_level_reward(l int) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'gold', 20 + 5 * l + case when l % 5 = 0 then 10 * l else 0 end,
    'potion', case when l % 10 = 0 then 'potion_big' when l % 5 = 0 then 'potion_small' end)
$$;

-- Ödülü verilmemiş seviyeleri öder (her seviye bir kez), canı doldurur, olay yazar
create or replace function bb_award_levels(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_lvl int; l int; r jsonb; v_gold int := 0;
begin
  select * into h from heroes where user_id = p_user for update;
  if h.user_id is null then return; end if;
  v_lvl := bb_level(h.xp);
  if v_lvl <= h.rewarded_level then return; end if;
  for l in h.rewarded_level + 1 .. v_lvl loop
    r := bb_level_reward(l);
    v_gold := v_gold + (r->>'gold')::int;
    if r->>'potion' is not null then
      insert into inventory (user_id, item_key, qty) values (p_user, r->>'potion', 1)
        on conflict (user_id, item_key) do update set qty = inventory.qty + 1;
    end if;
    perform bb_event(p_user, 'LEVEL_UP', jsonb_build_object('level', l, 'gold', (r->>'gold')::int, 'potion', r->>'potion'));
  end loop;
  update heroes set rewarded_level = v_lvl, gold = gold + v_gold, hp = bb_max_hp(v_lvl) where user_id = p_user;
  insert into hero_log (user_id, kind, gold) values (p_user, 'LEVEL_REWARD', v_gold);
end $$;

-- XP + altın ver (oyunlar, etkinlikler) ve seviye ödüllerini işle
create or replace function bb_grant(p_user uuid, p_kind text, p_xp int, p_gold int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update heroes set xp = xp + greatest(p_xp, 0), gold = gold + greatest(p_gold, 0) where user_id = p_user;
  if not found then return; end if;
  insert into hero_log (user_id, kind, xp, gold) values (p_user, p_kind, p_xp, p_gold);
  perform bb_award_levels(p_user);
end $$;

create or replace function bb_today_start(p_user uuid) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare c couples;
begin
  c := bb_couple_of(p_user);
  return bb_local_ts(bb_local_date(now(), coalesce(c.timezone, 'Europe/Istanbul')), time '00:00', coalesce(c.timezone, 'Europe/Istanbul'));
end $$;

-- =====================================================================
-- 3. Dükkan: 6 kademe silah/zırh, daha çok başlık, pelerin, evcil hayvan (Sv 80'e kadar)
-- =====================================================================
insert into shop_items (key, name, kind, tier, min_level, price, effect, sort) values
  ('weapon_1','Bronz Silah','WEAPON',1,3,100,0,10),
  ('weapon_2','Gümüş Silah','WEAPON',2,10,400,0,11),
  ('weapon_3','Altın Silah','WEAPON',3,22,1200,0,12),
  ('weapon_4','Efsanevi Silah','WEAPON',4,38,3000,0,13),
  ('weapon_5','Ejder Silahı','WEAPON',5,55,6000,0,14),
  ('weapon_6','Yıldız Silahı','WEAPON',6,75,12000,0,15),
  ('armor_1','Bronz Zırh','ARMOR',1,3,100,0,20),
  ('armor_2','Gümüş Zırh','ARMOR',2,10,400,0,21),
  ('armor_3','Altın Zırh','ARMOR',3,22,1200,0,22),
  ('armor_4','Efsanevi Zırh','ARMOR',4,38,3000,0,23),
  ('armor_5','Ejder Zırhı','ARMOR',5,55,6000,0,24),
  ('armor_6','Yıldız Zırhı','ARMOR',6,75,12000,0,25),
  ('head_class','Sınıf Başlığı','HEAD',0,2,60,0,30),
  ('head_flower','Çiçek Tacı','HEAD',0,6,150,0,31),
  ('head_laurel','Defne Tacı','HEAD',0,16,700,0,32),
  ('head_crown','Kral Tacı','HEAD',0,30,2500,0,33),
  ('head_circlet','Yıldız Tacı','HEAD',0,60,8000,0,34),
  ('cape_red','Kızıl Pelerin','CAPE',0,3,80,0,40),
  ('cape_blue','Mavi Pelerin','CAPE',0,3,80,0,41),
  ('cape_green','Orman Pelerini','CAPE',0,8,200,0,42),
  ('cape_royal','Kraliyet Pelerini','CAPE',0,18,800,0,43),
  ('cape_shadow','Gölge Pelerini','CAPE',0,34,2200,0,44),
  ('cape_gold','Altın Pelerin','CAPE',0,46,4000,0,45),
  ('cape_star','Yıldızlı Pelerin','CAPE',0,68,9000,0,46),
  ('pet_cat','Kedi','PET',0,5,250,0,50),
  ('pet_fox','Tilki','PET',0,12,600,0,51),
  ('pet_owl','Baykuş','PET',0,20,1000,0,52),
  ('pet_bunny','Tavşan','PET',0,28,1600,0,53),
  ('pet_dragon','Yavru Ejder','PET',0,42,3500,0,54),
  ('pet_phoenix','Anka Kuşu','PET',0,80,15000,0,55),
  ('potion_small','Can İksiri','POTION',0,1,25,30,60),
  ('potion_big','Büyük İksir','POTION',0,6,60,80,61)
on conflict (key) do update set name = excluded.name, kind = excluded.kind, tier = excluded.tier, min_level = excluded.min_level,
  price = excluded.price, effect = excluded.effect, sort = excluded.sort;

-- =====================================================================
-- 4. Bilet parçaları (4 parça = 1 bilet)
-- =====================================================================
create table if not exists shard_log (
  source_key text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  source text not null,
  created_at timestamptz not null default now()
);

create or replace function bb_add_shard(p_user uuid, p_source text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sh int; v_need int := coalesce(((select value from app_config where key = 'game')->>'shardsPerTicket')::int, 4);
begin
  insert into shard_log (source_key, user_id, source) values (p_key, p_user, p_source) on conflict do nothing;
  if not found then return; end if;
  update heroes set shards = shards + 1 where user_id = p_user returning shards into v_sh;
  if v_sh is null then return; end if;
  if v_sh >= v_need then
    update heroes set shards = shards - v_need where user_id = p_user;
    insert into tickets (owner_id, awarded_week_start, rule_version, source, source_key)
      values (p_user, bb_week_start(current_date), 3, 'SHARDS', 'shards:' || p_key) on conflict (source_key) do nothing;
    perform bb_event(p_user, 'TICKET', jsonb_build_object('source', p_source, 'need', v_need));
  else
    perform bb_event(p_user, 'SHARD', jsonb_build_object('source', p_source, 'shards', v_sh, 'need', v_need));
  end if;
end $$;

create or replace function bb_defeat_boss(p_boss uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bosses; m record; v_gold int := coalesce(((select value from app_config where key = 'game')->>'bossGold')::int, 100);
begin
  select * into b from bosses where id = p_boss for update;
  if b.defeated_at is not null then return; end if;
  update bosses set defeated_at = now(), hp = 0 where id = p_boss;
  for m in select user_id from memberships where couple_id = b.couple_id and ended_at is null loop
    update heroes set gold = gold + v_gold where user_id = m.user_id;
    insert into hero_log (user_id, kind, gold, ref) values (m.user_id, 'BOSS', v_gold, p_boss);
    perform bb_event(m.user_id, 'BOSS_DEFEATED', jsonb_build_object('name', b.name, 'gold', v_gold, 'bossKey', b.boss_key));
    perform bb_add_shard(m.user_id, 'BOSS', 'boss:' || p_boss || ':' || m.user_id);
  end loop;
end $$;

create or replace function bb_process_weeks(p_user uuid, p_today date) returns void
language plpgsql security definer set search_path = public as $$
declare wk record; v_full int; v_izin int; v_req int; v_earned boolean;
begin
  for wk in select distinct bb_week_start(local_date) as ws from hero_days where user_id = p_user and bb_week_start(local_date) < bb_week_start(p_today) loop
    if exists (select 1 from hero_weeks where user_id = p_user and week_start = wk.ws) then continue; end if;
    select count(*) filter (where all_done and not izin), count(*) filter (where izin) into v_full, v_izin
      from hero_days where user_id = p_user and local_date between wk.ws and wk.ws + 6 and closed;
    v_req := greatest(3, 5 - v_izin);
    v_earned := v_full >= v_req;
    insert into hero_weeks (user_id, week_start, full_days, izin_days, earned) values (p_user, wk.ws, v_full, v_izin, v_earned) on conflict do nothing;
    if v_earned then perform bb_add_shard(p_user, 'WEEK', 'week:' || p_user || ':' || wk.ws); end if;
  end loop;
end $$;

-- =====================================================================
-- 5. Düellolar (sırayla, aynı tohum)
-- =====================================================================
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  game text not null check (game in ('TAP','MEMORY','TIMING','WORDS','SLIDE')),
  seed int not null,
  created_by uuid references app_users(id) on delete set null,
  opponent uuid references app_users(id) on delete set null,
  score_a int,
  score_b int,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','EXPIRED','CANCELLED')),
  winner uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null
);
create index if not exists duels_couple on duels(couple_id, created_at desc);

create or replace function bb_game_max(p_game text) returns int
language sql immutable as $$
  select case p_game when 'TAP' then 120 when 'MEMORY' then 40 when 'TIMING' then 500 when 'WORDS' then 60 when 'SLIDE' then 300 else 0 end
$$;

create or replace function bb_duel_reward(p_user uuid, p_xp int, p_gold int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_limit int := coalesce(((select value from app_config where key = 'game')->>'duelRewardsPerDay')::int, 5);
begin
  if p_user is null then return false; end if;
  if (select count(*) from hero_log where user_id = p_user and kind = 'DUEL' and created_at >= bb_today_start(p_user)) >= v_limit then return false; end if;
  perform bb_grant(p_user, 'DUEL', p_xp, p_gold);
  return true;
end $$;

create or replace function bb_duel_json(d duels) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', d.id, 'game', d.game, 'seed', d.seed, 'createdBy', d.created_by, 'opponent', d.opponent,
    'scoreA', d.score_a, 'scoreB', case when d.status = 'OPEN' then null else d.score_b end, 'status', d.status, 'winner', d.winner,
    'createdAt', d.created_at, 'finishedAt', d.finished_at, 'expiresAt', d.expires_at)
$$;

-- =====================================================================
-- 6. Günün Kelimesi (ortak Wordle: 6 tahmin, kişi başı 3)
-- =====================================================================
create table if not exists word_list (word text primary key);
create table if not exists word_games (
  couple_id uuid not null references couples(id) on delete cascade,
  local_date date not null,
  word text not null,
  guesses jsonb not null default '[]'::jsonb,
  solved boolean not null default false,
  finished boolean not null default false,
  primary key (couple_id, local_date)
);

insert into word_list (word)
select w from unnest(string_to_array(
  'KİTAP,KALEM,AKŞAM,SABAH,GÜNEŞ,BULUT,ORMAN,DENİZ,NEHİR,ÇİÇEK,BAHAR,KÖPEK,TAVUK,HOROZ,ASLAN,TİLKİ,BALIK,ÖRDEK,KOYUN,İNSAN,' ||
  'ÇOCUK,SEVGİ,HUZUR,SABIR,ŞÜKÜR,NAMAZ,HAYIR,SECDE,HADİS,EKMEK,ÇORBA,PİLAV,KÖFTE,BÖREK,SİMİT,KAHVE,LİMON,ARMUT,KİRAZ,ÇİLEK,' ||
  'KAVUN,HAVUÇ,SOĞAN,BİBER,MARUL,ŞEKER,NOHUT,YUFKA,HELVA,LOKUM,AYRAN,DOLAP,YATAK,PERDE,LAMBA,SALON,BAHÇE,DUVAR,KÖPRÜ,SOKAK,' ||
  'ŞEHİR,SINAV,KAĞIT,SİLGİ,DALGA,GÖLGE,DUMAN,TOHUM,FİDAN,BEYİN,MUTLU,GÜZEL,TATLI,SICAK,SOĞUK,HAFİF,DERİN,GENİŞ,KOLAY,CESUR,' ||
  'GÜÇLÜ,BİLGİ,FİKİR,HAYAL,ŞARKI,MÜZİK,RESİM,TAKIM,ZAFER,EJDER,KILIÇ,İKSİR,ALTIN,GÜMÜŞ,BRONZ,ELMAS,YAKUT,SARAY,PRENS,HAFTA,' ||
  'YARIN,BUGÜN,ÖĞLEN,SEHER,YATSI,ŞAFAK,KARGA,SERÇE,ŞAHİN,GEYİK,ZEBRA,PANDA,KOALA,YUNUS,KUMRU,BEYAZ,SİYAH,YEŞİL,PEMBE,ARABA,' ||
  'YOLCU,BİLET,VALİZ,ÇANTA,TARAK,FIRÇA,SABUN,HAVLU,MAKAS,İPLİK,DÜĞME,CEKET,ÇORAP,ŞAPKA,KAZAK,DAVUL,KEMAN,GİTAR,YÜZME,GÜREŞ,' ||
  'TENİS,VOLEY,CÜMLE,METİN,ROMAN,MASAL,TARİH,KİMYA,FİZİK,DOĞRU,SADIK,NAZİK,TEYZE,YENGE,KUZEN,TORUN,EVLAT,BEBEK,GELİN,DAMAT,' ||
  'KUMAŞ,ÇADIR,FENER,KİLİM,TABAK,KAŞIK,ÇATAL,BIÇAK,TEPSİ,SEPET,LİMAN,KAYIK,KAYAK,PATEN,DÜDÜK,PAZAR,FIRIN,ÇARŞI,MEYVE,SEBZE,' ||
  'BADEM,CEVİZ,İNCİR,VİŞNE,BİLGE,KOMŞU,DAVET,İFTAR,SAHUR,ZEKAT,GÖNÜL,ÖZLEM,GÜLÜŞ,SAYGI,ADRES,TATİL,YAYLA,PINAR,IRMAK,TARLA,' ||
  'ÇAYIR,ÇİMEN,YONCA,ŞOFÖR,TERZİ,PİLOT,ASKER,POLİS,HAKİM,YAZAR,TOPAÇ,BALON,KUKLA,MASKE,KÜREK,ÇEKİÇ,TAHTA,DEMİR,BAKIR,KÖMÜR,' ||
  'İLHAM,NEFES,KUŞAK',
  ',')) as w
where char_length(w) = 5
on conflict do nothing;
delete from word_list where char_length(word) <> 5;

create or replace function bb_word_game(p_couple uuid, p_date date) returns word_games
language plpgsql security definer set search_path = public as $$
declare w word_games;
begin
  select * into w from word_games where couple_id = p_couple and local_date = p_date;
  if w.couple_id is not null then return w; end if;
  insert into word_games (couple_id, local_date, word)
    select p_couple, p_date, wl.word from word_list wl order by md5(p_couple::text || p_date::text || wl.word) limit 1
  on conflict do nothing;
  select * into w from word_games where couple_id = p_couple and local_date = p_date;
  return w;
end $$;

-- G = doğru yer, Y = kelimede var, B = yok (tekrarlı harfler doğru sayılır)
create or replace function bb_word_score(p_guess text, p_word text) returns text
language plpgsql immutable as $$
declare res text[] := array['B','B','B','B','B']; cnt jsonb := '{}'::jsonb; i int; ch text;
begin
  for i in 1..5 loop
    if substr(p_guess, i, 1) = substr(p_word, i, 1) then res[i] := 'G';
    else ch := substr(p_word, i, 1); cnt := jsonb_set(cnt, array[ch], to_jsonb(coalesce((cnt->>ch)::int, 0) + 1)); end if;
  end loop;
  for i in 1..5 loop
    if res[i] <> 'G' then
      ch := substr(p_guess, i, 1);
      if coalesce((cnt->>ch)::int, 0) > 0 then
        res[i] := 'Y'; cnt := jsonb_set(cnt, array[ch], to_jsonb((cnt->>ch)::int - 1));
      end if;
    end if;
  end loop;
  return array_to_string(res, '');
end $$;

-- =====================================================================
-- 7. Birlikte etkinlikler (haftada 4; biri "yaptık" der, diğeri onaylar)
-- =====================================================================
create table if not exists together_catalog (
  code text primary key,
  icon text not null,
  title text not null
);
create table if not exists together_log (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  week_start date not null,
  code text not null,
  proposed_by uuid references app_users(id) on delete set null,
  confirmed_by uuid references app_users(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','DONE')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (couple_id, week_start, code)
);

delete from together_catalog;
insert into together_catalog (code, icon, title) values
  ('T_WALK',    'boot',    'Birlikte yürüyüş'),
  ('T_PRAY',    'pray',    'Birlikte namaz'),
  ('T_READ',    'book',    'Birlikte kitap okuyun'),
  ('T_COOK',    'apple',   'Birlikte yemek yapın'),
  ('T_NOPHONE', 'nophone', 'Telefonsuz akşam'),
  ('T_LISTEN',  'music',   'Birlikte bir sohbet dinleyin'),
  ('T_SPORT',   'muscle',  'Birlikte spor'),
  ('T_QURAN',   'quran',   'Birlikte Kur''an okuyun'),
  ('T_CLEAN',   'broom',   'Ev işini birlikte bitirin'),
  ('T_LETTER',  'quill',   'Birbirinize not yazın'),
  ('T_VISIT',   'heart',   'Bir büyüğü ziyaret edin'),
  ('T_CHARITY', 'coin',    'Birlikte sadaka verin'),
  ('T_SUNSET',  'sun',     'Gün batımını izleyin'),
  ('T_LEARN',   'lamp',    'Birlikte yeni bir şey öğrenin'),
  ('T_PUZZLE',  'puzzle',  'Birlikte bir bulmaca çözün'),
  ('T_STARS',   'moon',    'Yıldızlara bakın'),
  ('T_BREAK',   'sparkle', 'Birlikte kahvaltı hazırlayın'),
  ('T_DHIKR',   'beads',   'Birlikte tesbihat');

create or replace function bb_together_week(p_couple uuid, p_week date) returns setof together_catalog
language sql stable security definer set search_path = public as $$
  select * from together_catalog order by md5(p_couple::text || p_week::text || code) limit 4
$$;

-- Ortak hasar (birlikte etkinlik): boss'a kullanıcısız vuruş
create or replace function bb_team_hit(p_couple uuid, p_kind text, p_damage int) returns int
language plpgsql security definer set search_path = public as $$
declare c couples; b bosses; v_dmg int;
begin
  select * into c from couples where id = p_couple;
  b := bb_ensure_boss(p_couple, bb_week_start(bb_local_date(now(), c.timezone)));
  select * into b from bosses where id = b.id for update;
  if b.id is null or b.defeated_at is not null then return 0; end if;
  v_dmg := least(b.hp, p_damage);
  insert into boss_hits (boss_id, user_id, kind, damage) values (b.id, null, p_kind, v_dmg);
  update bosses set hp = hp - v_dmg where id = b.id returning * into b;
  if b.hp <= 0 then perform bb_defeat_boss(b.id); end if;
  return v_dmg;
end $$;

-- =====================================================================
-- 8. Başarımlar (33)
-- =====================================================================
create or replace function bb_check_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_done int; v_lvl int; k text; v_new text[] := '{}'; c couples; v_boss int; v_wins int; v_words int; v_tog int;
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null then return; end if;
  v_lvl := bb_level(h.xp);
  select count(*) into v_done from quests where user_id = p_user and done;
  c := bb_couple_of(p_user);
  select count(*) into v_boss from bosses where couple_id = c.id and defeated_at is not null;
  select count(*) into v_wins from duels where winner = p_user;
  select count(*) into v_words from word_games where couple_id = c.id and solved;
  select count(*) into v_tog from together_log where couple_id = c.id and status = 'DONE';
  if v_done >= 1 then v_new := array_append(v_new, 'FIRST_QUEST'); end if;
  if v_done >= 50 then v_new := array_append(v_new, 'QUESTS_50'); end if;
  if v_done >= 250 then v_new := array_append(v_new, 'QUESTS_250'); end if;
  if v_done >= 1000 then v_new := array_append(v_new, 'QUESTS_1000'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'WAKE') >= 5 then v_new := array_append(v_new, 'EARLY_BIRD'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'READING') >= 10 then v_new := array_append(v_new, 'BOOKWORM'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'QURAN') >= 30 then v_new := array_append(v_new, 'QURAN_30'); end if;
  if (select count(*) from quests where user_id = p_user and done and code = 'SPORT') >= 20 then v_new := array_append(v_new, 'ATHLETE'); end if;
  if h.best_streak >= 7 then v_new := array_append(v_new, 'STREAK_7'); end if;
  if h.best_streak >= 30 then v_new := array_append(v_new, 'STREAK_30'); end if;
  if h.best_streak >= 100 then v_new := array_append(v_new, 'STREAK_100'); end if;
  if v_boss >= 1 then v_new := array_append(v_new, 'BOSS_1'); end if;
  if v_boss >= 5 then v_new := array_append(v_new, 'BOSS_5'); end if;
  if v_boss >= 20 then v_new := array_append(v_new, 'BOSS_20'); end if;
  if v_lvl >= 5 then v_new := array_append(v_new, 'LEVEL_5'); end if;
  if v_lvl >= 10 then v_new := array_append(v_new, 'LEVEL_10'); end if;
  if v_lvl >= 20 then v_new := array_append(v_new, 'LEVEL_20'); end if;
  if v_lvl >= 30 then v_new := array_append(v_new, 'LEVEL_30'); end if;
  if v_lvl >= 50 then v_new := array_append(v_new, 'LEVEL_50'); end if;
  if v_lvl >= 75 then v_new := array_append(v_new, 'LEVEL_75'); end if;
  if v_lvl >= 100 then v_new := array_append(v_new, 'LEVEL_100'); end if;
  if h.gold >= 1000 then v_new := array_append(v_new, 'RICH'); end if;
  if exists (select 1 from hero_days where user_id = p_user and difficulty = 6 and all_done) then v_new := array_append(v_new, 'MYTHIC_DAY'); end if;
  if (select count(*) from hero_events where from_user = p_user and kind = 'CHEER') >= 10 then v_new := array_append(v_new, 'FRIEND'); end if;
  if exists (select 1 from couple_combos where couple_id = c.id) then v_new := array_append(v_new, 'COMBO'); end if;
  if v_wins >= 1 then v_new := array_append(v_new, 'DUEL_1'); end if;
  if v_wins >= 10 then v_new := array_append(v_new, 'DUEL_10'); end if;
  if v_wins >= 50 then v_new := array_append(v_new, 'DUEL_50'); end if;
  if v_words >= 1 then v_new := array_append(v_new, 'WORD_1'); end if;
  if v_words >= 25 then v_new := array_append(v_new, 'WORD_25'); end if;
  if v_tog >= 1 then v_new := array_append(v_new, 'TOGETHER_1'); end if;
  if v_tog >= 20 then v_new := array_append(v_new, 'TOGETHER_20'); end if;
  if exists (select 1 from tickets where owner_id = p_user) then v_new := array_append(v_new, 'TICKET_1'); end if;
  foreach k in array v_new loop
    insert into achievements (user_id, key) values (p_user, k) on conflict do nothing;
    if found then perform bb_event(p_user, 'ACHIEVEMENT', jsonb_build_object('key', k)); end if;
  end loop;
end $$;

-- =====================================================================
-- 9. Okuma
-- =====================================================================
create or replace function bb_hero_json(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h heroes; au app_users; v_lvl int;
begin
  select * into h from heroes where user_id = p_user;
  if h.user_id is null then return null; end if;
  select * into au from app_users where id = p_user;
  v_lvl := bb_level(h.xp);
  return jsonb_build_object(
    'id', p_user, 'name', au.display_name, 'username', au.username, 'class', h.class, 'look', h.look,
    'difficulty', h.difficulty, 'pendingDifficulty', h.pending_difficulty,
    'level', v_lvl, 'xp', h.xp, 'levelStart', bb_level_start(v_lvl), 'levelEnd', bb_level_start(v_lvl + 1),
    'hp', h.hp, 'maxHp', bb_max_hp(v_lvl), 'gold', h.gold, 'stats', h.stats, 'equipped', h.equipped,
    'streak', h.streak, 'bestStreak', h.best_streak, 'sound', h.sound, 'shards', h.shards, 'lastSeen', h.last_seen);
end $$;

create or replace function get_game() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; v_partner uuid; b bosses; ws date; v_ws_ts timestamptz; v_invite jsonb; w word_games;
begin
  c := bb_couple_of(u);
  perform bb_process_user(u);
  update heroes set last_seen = now() where user_id = u;
  v_partner := bb_partner_of(u);
  if v_partner is not null then perform bb_process_user(v_partner); end if;
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  v_ws_ts := bb_local_ts(ws, time '00:00', c.timezone);
  select * into b from bosses where couple_id = c.id and week_start = ws;
  select * into w from word_games where couple_id = c.id and local_date = v_today;
  select jsonb_build_object('expiresAt', expires_at) into v_invite from invites
    where couple_id = c.id and used_at is null and expires_at > now() order by created_at desc limit 1;
  return jsonb_build_object(
    'serverTime', now(), 'today', v_today, 'weekStart', ws, 'weekEnd', bb_local_ts(ws + 7, time '00:00', c.timezone),
    'config', (select value from app_config where key = 'game'),
    'hero', bb_hero_json(u),
    'day', (select jsonb_build_object('izin', izin, 'difficulty', difficulty) from hero_days where user_id = u and local_date = v_today),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'kind', kind, 'category', category, 'icon', icon, 'title', title,
        'xp', xp, 'gold', gold, 'damage', damage, 'done', done) order by kind, sort, code), '[]'::jsonb) from quests where user_id = u and local_date = v_today),
    'partner', case when v_partner is null then null else bb_hero_json(v_partner) ||
        jsonb_build_object('todayDone', (select count(*) filter (where done) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY'),
                           'todayTotal', (select count(*) from quests where user_id = v_partner and local_date = v_today and kind = 'DAILY')) end,
    'couple', jsonb_build_object('id', c.id, 'hasPartner', v_partner is not null, 'pendingInvite', v_invite, 'status', c.status),
    'boss', case when b.id is null then null else jsonb_build_object('id', b.id, 'key', b.boss_key, 'name', b.name, 'hp', b.hp, 'maxHp', b.max_hp, 'defeated', b.defeated_at is not null,
        'hits', (select coalesce(jsonb_agg(jsonb_build_object('user', h.user_id, 'kind', h.kind, 'damage', h.damage, 'at', h.created_at) order by h.created_at desc), '[]'::jsonb)
                 from (select * from boss_hits where boss_id = b.id order by created_at desc limit 12) h),
        'byUser', (select coalesce(jsonb_object_agg(coalesce(user_id::text, 'combo'), s), '{}'::jsonb) from (select user_id, sum(damage) s from boss_hits where boss_id = b.id group by user_id) q)) end,
    'weekXp', jsonb_build_object(
        'me', (select coalesce(sum(xp), 0) from hero_log where user_id = u and created_at >= v_ws_ts),
        'partner', case when v_partner is null then null else (select coalesce(sum(xp), 0) from hero_log where user_id = v_partner and created_at >= v_ws_ts) end),
    'cheersLeft', greatest(0, (select (value->>'cheersPerDay')::int from app_config where key = 'game')
        - (select count(*) from hero_events where from_user = u and kind = 'CHEER' and created_at >= bb_local_ts(v_today, time '00:00', c.timezone))),
    'healUsedToday', exists (select 1 from hero_events where from_user = u and kind = 'HEAL' and created_at >= bb_local_ts(v_today, time '00:00', c.timezone)),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'data', e.data, 'from', au.display_name, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
        from hero_events e left join app_users au on au.id = e.from_user where e.user_id = u and not e.seen),
    'inventory', (select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb) from inventory where user_id = u and qty > 0),
    'achievements', (select coalesce(jsonb_agg(key), '[]'::jsonb) from achievements where user_id = u),
    'tickets', (select jsonb_build_object('available', count(*) filter (where status = 'AVAILABLE'), 'requested', count(*) filter (where status = 'REQUESTED'), 'used', count(*) filter (where status = 'USED'))
        from tickets where owner_id = u),
    'incomingRequests', (select count(*) from ticket_redemptions where partner_id = u and status = 'REQUESTED' and expires_at > now()),
    'play', jsonb_build_object(
        'duels', (select count(*) from duels where opponent = u and status = 'OPEN' and expires_at > now()),
        'together', (select count(*) from together_log where couple_id = c.id and week_start = ws and status = 'PENDING' and proposed_by <> u),
        'word', coalesce(not w.finished, true) and v_partner is not null
                and (select count(*) from jsonb_array_elements(coalesce(w.guesses, '[]'::jsonb)) g where g->>'by' = u::text) < 3)
  );
end $$;

create or replace function get_games() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_today date; ws date; w word_games; v_limit int;
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  update duels set status = 'EXPIRED' where couple_id = c.id and status = 'OPEN' and expires_at <= now();
  if v_partner is not null then w := bb_word_game(c.id, v_today); end if;
  v_limit := coalesce(((select value from app_config where key = 'game')->>'duelRewardsPerDay')::int, 5);
  return jsonb_build_object(
    'duels', (select coalesce(jsonb_agg(bb_duel_json(d) order by d.created_at desc), '[]'::jsonb) from (
        select * from duels where couple_id = c.id and (status = 'OPEN' or finished_at > now() - interval '7 days') order by created_at desc limit 30) d),
    'record', jsonb_build_object(
        'me', (select count(*) from duels where couple_id = c.id and winner = u),
        'partner', (select count(*) from duels where couple_id = c.id and winner = v_partner and v_partner is not null),
        'draws', (select count(*) from duels where couple_id = c.id and status = 'DONE' and winner is null)),
    'duelRewardsLeft', greatest(0, v_limit - (select count(*) from hero_log where user_id = u and kind = 'DUEL' and created_at >= bb_today_start(u))),
    'word', case when w.couple_id is null then null else jsonb_build_object(
        'date', w.local_date, 'guesses', w.guesses, 'solved', w.solved, 'finished', w.finished,
        'answer', case when w.finished then w.word end,
        'solvedDays', (select count(*) from word_games where couple_id = c.id and solved)) end,
    'together', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'icon', t.icon, 'title', t.title,
          'status', l.status, 'proposedBy', l.proposed_by, 'confirmedAt', l.confirmed_at)), '[]'::jsonb)
        from bb_together_week(c.id, ws) t left join together_log l on l.couple_id = c.id and l.week_start = ws and l.code = t.code),
    'togetherDone', (select count(*) from together_log where couple_id = c.id and status = 'DONE'),
    'config', (select jsonb_build_object('togetherXP', value->'togetherXP', 'togetherGold', value->'togetherGold', 'togetherDamage', value->'togetherDamage') from app_config where key = 'game')
  );
end $$;

-- =====================================================================
-- 10. Yazma: görev (yeni seviye ödülleri), alkış, düello, kelime, etkinlik
-- =====================================================================
create or replace function complete_quest(p_quest uuid, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := bb_current_user(); c couples; q quests; h heroes; v_today date; b bosses; v_dmg int := 0; v_hit boss_hits;
  v_defeated boolean := false;
begin
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  select * into q from quests where id = p_quest and user_id = u for update;
  if q.id is null then raise exception 'NOT_FOUND'; end if;
  if q.local_date <> v_today then raise exception 'DAY_LOCKED'; end if;
  if q.done = p_done then return jsonb_build_object('delta', jsonb_build_object('xp', 0, 'gold', 0, 'damage', 0), 'game', get_game()); end if;
  select * into h from heroes where user_id = u for update;
  b := bb_ensure_boss(c.id, bb_week_start(v_today));
  select * into b from bosses where id = b.id for update;

  if p_done then
    update quests set done = true, done_at = now() where id = q.id;
    update heroes set xp = xp + q.xp, gold = gold + q.gold,
      stats = jsonb_set(stats, array[q.category], to_jsonb(coalesce((stats->>q.category)::int, 0) + 1)) where user_id = u returning * into h;
    insert into hero_log (user_id, kind, xp, gold, ref) values (u, 'QUEST', q.xp, q.gold, q.id);
    if b.defeated_at is null then
      v_dmg := least(b.hp, q.damage);
      insert into boss_hits (boss_id, user_id, quest_id, damage) values (b.id, u, q.id, v_dmg);
      update bosses set hp = hp - v_dmg where id = b.id returning * into b;
      if b.hp <= 0 then perform bb_defeat_boss(b.id); v_defeated := true; end if;
    end if;
    perform bb_award_levels(u);
  else
    update quests set done = false, done_at = null where id = q.id;
    update heroes set xp = greatest(0, xp - q.xp), gold = greatest(0, gold - q.gold),
      stats = jsonb_set(stats, array[q.category], to_jsonb(greatest(0, coalesce((stats->>q.category)::int, 0) - 1))) where user_id = u returning * into h;
    insert into hero_log (user_id, kind, xp, gold, ref) values (u, 'UNDO', -q.xp, -q.gold, q.id);
    select * into v_hit from boss_hits where quest_id = q.id;
    if v_hit.id is not null and b.defeated_at is null then
      update bosses set hp = least(max_hp, hp + v_hit.damage) where id = b.id;
      v_dmg := -v_hit.damage;
    end if;
    delete from boss_hits where quest_id = q.id;
    update heroes set hp = least(hp, bb_max_hp(bb_level(xp))) where user_id = u;
  end if;
  perform bb_check_achievements(u);
  return jsonb_build_object(
    'delta', jsonb_build_object('xp', case when p_done then q.xp else -q.xp end, 'gold', case when p_done then q.gold else -q.gold end, 'damage', v_dmg, 'defeated', v_defeated),
    'game', get_game());
end $$;

create or replace function social_action(p_kind text, p_amount int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid; c couples; v_today_ts timestamptz; h heroes; cfg jsonb := (select value from app_config where key = 'game'); v_heal int;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  v_today_ts := bb_local_ts(bb_local_date(now(), c.timezone), time '00:00', c.timezone);
  select * into h from heroes where user_id = u for update;
  if p_kind = 'CHEER' then
    if (select count(*) from hero_events where from_user = u and kind = 'CHEER' and created_at >= v_today_ts) >= (cfg->>'cheersPerDay')::int then raise exception 'DAILY_LIMIT'; end if;
    update heroes set xp = xp + (cfg->>'cheerXP')::int where user_id = v_partner;
    insert into hero_log (user_id, kind, xp) values (v_partner, 'CHEER', (cfg->>'cheerXP')::int);
    perform bb_event(v_partner, 'CHEER', jsonb_build_object('xp', (cfg->>'cheerXP')::int), u);
    perform bb_award_levels(v_partner);
  elsif p_kind = 'HEAL' then
    if h.class = 'HEALER' and not exists (select 1 from hero_events where from_user = u and kind = 'HEAL' and created_at >= v_today_ts) then
      v_heal := (cfg->>'healAmount')::int;
    else
      update inventory set qty = qty - 1 where user_id = u and item_key = 'potion_small' and qty > 0;
      if not found then raise exception 'NO_POTION'; end if;
      v_heal := 30;
    end if;
    update heroes set hp = least(bb_max_hp(bb_level(xp)), hp + v_heal) where user_id = v_partner;
    insert into hero_log (user_id, kind, hp) values (v_partner, 'HEALED', v_heal);
    perform bb_event(v_partner, 'HEAL', jsonb_build_object('hp', v_heal), u);
  elsif p_kind = 'GIFT' then
    if p_amount not in (10, 25, 50) then raise exception 'INVALID_VALUE'; end if;
    if h.gold < p_amount then raise exception 'INSUFFICIENT_GOLD'; end if;
    update heroes set gold = gold - p_amount where user_id = u;
    update heroes set gold = gold + p_amount where user_id = v_partner;
    insert into hero_log (user_id, kind, gold) values (u, 'GIFT_OUT', -p_amount), (v_partner, 'GIFT_IN', p_amount);
    perform bb_event(v_partner, 'GIFT', jsonb_build_object('gold', p_amount), u);
  else
    raise exception 'INVALID_ACTION';
  end if;
  perform bb_check_achievements(u);
  return get_game();
end $$;

-- Düello: önce oyna, sonra skorla meydan oku
create or replace function duel_create(p_game text, p_seed int, p_score int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); v_partner uuid; c couples; d duels;
begin
  if bb_game_max(p_game) = 0 then raise exception 'INVALID_VALUE'; end if;
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  if (select count(*) from duels where couple_id = c.id and created_by = u and status = 'OPEN' and expires_at > now()) >= 3 then raise exception 'TOO_MANY_DUELS'; end if;
  insert into duels (couple_id, game, seed, created_by, opponent, score_a, expires_at)
    values (c.id, p_game, coalesce(p_seed, 1), u, v_partner, least(greatest(coalesce(p_score, 0), 0), bb_game_max(p_game)), now() + interval '48 hours')
    returning * into d;
  perform bb_event(v_partner, 'DUEL_INVITE', jsonb_build_object('duel', d.id, 'game', p_game), u);
  return get_games();
end $$;

create or replace function duel_play(p_duel uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); d duels; v_score int; v_win uuid; v_lose uuid; v_res text;
begin
  select * into d from duels where id = p_duel and opponent = u for update;
  if d.id is null then raise exception 'NOT_FOUND'; end if;
  if d.status <> 'OPEN' then raise exception 'INVALID_STATE'; end if;
  if d.expires_at <= now() then update duels set status = 'EXPIRED' where id = d.id; raise exception 'DUEL_EXPIRED'; end if;
  v_score := least(greatest(coalesce(p_score, 0), 0), bb_game_max(d.game));
  if v_score > d.score_a then v_win := u; v_lose := d.created_by;
  elsif v_score < d.score_a then v_win := d.created_by; v_lose := u; end if;
  update duels set score_b = v_score, status = 'DONE', winner = v_win, finished_at = now() where id = d.id;
  if v_win is null then
    perform bb_duel_reward(u, 12, 15); perform bb_duel_reward(d.created_by, 12, 15); v_res := 'DRAW';
  else
    perform bb_duel_reward(v_win, 20, 30); perform bb_duel_reward(v_lose, 8, 10);
    v_res := case when v_win = d.created_by then 'WIN' else 'LOSE' end;
  end if;
  if d.created_by is not null then
    perform bb_event(d.created_by, 'DUEL_RESULT', jsonb_build_object('duel', d.id, 'game', d.game, 'me', d.score_a, 'them', v_score, 'result', v_res), u);
    perform bb_check_achievements(d.created_by);
  end if;
  perform bb_check_achievements(u);
  return get_games();
end $$;

create or replace function duel_cancel(p_duel uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user();
begin
  update duels set status = 'CANCELLED', finished_at = now() where id = p_duel and created_by = u and status = 'OPEN';
  if not found then raise exception 'INVALID_STATE'; end if;
  return get_games();
end $$;

create or replace function word_guess(p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_today date; w word_games; g text := trim(coalesce(p_word, '')); r text; n int; v_mine int;
  v_partner uuid; v_xp int; v_gold int;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  if g !~ '^[A-ZÇĞİÖŞÜ]{5}$' then raise exception 'INVALID_WORD'; end if;
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  perform bb_word_game(c.id, v_today);
  select * into w from word_games where couple_id = c.id and local_date = v_today for update;
  if w.finished then raise exception 'INVALID_STATE'; end if;
  select count(*) into v_mine from jsonb_array_elements(w.guesses) x where x->>'by' = u::text;
  if v_mine >= 3 then raise exception 'NO_GUESSES_LEFT'; end if;
  r := bb_word_score(g, w.word);
  n := jsonb_array_length(w.guesses) + 1;
  update word_games set guesses = guesses || jsonb_build_array(jsonb_build_object('by', u, 'word', g, 'res', r, 'at', now())),
      solved = (r = 'GGGGG'), finished = (r = 'GGGGG' or n >= 6)
    where couple_id = c.id and local_date = v_today returning * into w;
  if w.solved then
    v_xp := 15 + 8 * (7 - n); v_gold := 10 + 5 * (7 - n);
    perform bb_grant(u, 'WORD', v_xp, v_gold);
    perform bb_grant(v_partner, 'WORD', v_xp, v_gold);
    perform bb_event(v_partner, 'WORD_SOLVED', jsonb_build_object('word', w.word, 'tries', n, 'xp', v_xp, 'gold', v_gold), u);
    perform bb_check_achievements(u); perform bb_check_achievements(v_partner);
  elsif w.finished then
    perform bb_event(v_partner, 'WORD_FAILED', jsonb_build_object('word', w.word), u);
  else
    perform bb_event(v_partner, 'WORD_GUESS', jsonb_build_object('res', r, 'left', 3 - (select count(*) from jsonb_array_elements(w.guesses) x where x->>'by' = v_partner::text)), u);
  end if;
  return get_games();
end $$;

create or replace function together_mark(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; ws date; l together_log; cfg jsonb := (select value from app_config where key = 'game'); v_dmg int;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  ws := bb_week_start(bb_local_date(now(), c.timezone));
  if not exists (select 1 from bb_together_week(c.id, ws) t where t.code = p_code) then raise exception 'NOT_FOUND'; end if;
  select * into l from together_log where couple_id = c.id and week_start = ws and code = p_code for update;
  if l.id is null then
    insert into together_log (couple_id, week_start, code, proposed_by) values (c.id, ws, p_code, u);
    perform bb_event(v_partner, 'TOGETHER_REQUEST', jsonb_build_object('code', p_code, 'title', (select title from together_catalog where code = p_code), 'icon', (select icon from together_catalog where code = p_code)), u);
  elsif l.status = 'PENDING' and l.proposed_by <> u then
    update together_log set status = 'DONE', confirmed_by = u, confirmed_at = now() where id = l.id;
    perform bb_grant(u, 'TOGETHER', (cfg->>'togetherXP')::int, (cfg->>'togetherGold')::int);
    perform bb_grant(v_partner, 'TOGETHER', (cfg->>'togetherXP')::int, (cfg->>'togetherGold')::int);
    v_dmg := bb_team_hit(c.id, 'TOGETHER', (cfg->>'togetherDamage')::int);
    perform bb_event(v_partner, 'TOGETHER_DONE', jsonb_build_object('code', p_code, 'title', (select title from together_catalog where code = p_code),
      'icon', (select icon from together_catalog where code = p_code), 'xp', (cfg->>'togetherXP')::int, 'gold', (cfg->>'togetherGold')::int, 'damage', v_dmg), u);
    perform bb_check_achievements(u); perform bb_check_achievements(v_partner);
  else
    raise exception 'INVALID_STATE';
  end if;
  return get_games();
end $$;

create or replace function together_cancel(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  delete from together_log where couple_id = c.id and week_start = bb_week_start(bb_local_date(now(), c.timezone)) and code = p_code and status = 'PENDING' and proposed_by = u;
  if not found then raise exception 'INVALID_STATE'; end if;
  return get_games();
end $$;

-- Süresi dolan düellolar dakikalık işte kapanır
create or replace function bb_run_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  for u in select m.user_id from memberships m join heroes h on h.user_id = m.user_id where m.ended_at is null loop
    begin
      perform bb_process_user(u.user_id);
      n := n + 1;
    exception when others then
      insert into audit_events (actor_id, event_type) values (u.user_id, 'JOB_ERROR:' || left(sqlerrm, 80));
    end;
  end loop;
  update ticket_redemptions r set status = 'EXPIRED', resolved_at = now() where r.status = 'REQUESTED' and r.expires_at <= now();
  update tickets tk set status = 'AVAILABLE' where tk.status = 'REQUESTED' and not exists (select 1 from ticket_redemptions r where r.ticket_id = tk.id and r.status = 'REQUESTED');
  update duels set status = 'EXPIRED' where status = 'OPEN' and expires_at <= now();
  delete from idempotency_records where expires_at < now();
  return n;
end $$;

-- =====================================================================
-- 11. Güvenlik: RLS, yalnızca RPC'ler çağrılabilir
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['shard_log','duels','word_list','word_games','together_catalog','together_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_game(), create_hero(text, text, jsonb, int), update_hero(text, text, jsonb, boolean), complete_quest(uuid, boolean),
  set_izin(boolean), set_difficulty(int), buy_item(text), equip_item(text, text), use_potion(text), social_action(text, int), mark_events_seen(uuid[]),
  get_tickets(), request_ticket(uuid, uuid), respond_redemption(uuid, text), request_reversal(uuid),
  create_invite(), generate_recovery_codes(), recovery_codes_status(), revoke_other_sessions(), disconnect_couple(), delete_account(),
  get_games(), duel_create(text, int, int), duel_play(uuid, int), duel_cancel(uuid), word_guess(text), together_mark(text), together_cancel(text)
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'progression + games ok' as result, (select count(*) from word_list) as words, (select count(*) from shop_items) as items;
