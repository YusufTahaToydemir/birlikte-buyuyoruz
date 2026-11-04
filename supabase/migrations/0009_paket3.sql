-- Kyron · 0009_paket3.sql · "Birlikte" paketi (4 Kasım 2026)
-- 1) Çift testi: haftada 5 soru, kendi cevabın + eşinin cevabını tahmin; eşleşme başına ödül
-- 2) Not defteri: piksel mektup (günde 1) ve şükür satırı (günde 1); hatıra defteri
-- 3) Ortak baskın: ikiniz aynı oyunu oynarsınız, toplam puan canavara hasar
-- 4) Yeni düellolar: Hızlı Hesap (MATH), Renk Tuzağı (COLOR)
-- 5) Günün Kelimesi ipucu: 10 altına bir harf (günde 2)

-- =====================================================================
-- 1. Çift testi
-- =====================================================================
create table if not exists quiz_questions (
  id bigserial primary key,
  couple_id uuid references couples(id) on delete cascade, -- null = herkese açık havuz
  text text not null,
  options jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists quiz_games (
  couple_id uuid not null references couples(id) on delete cascade,
  week_start date not null,
  question_ids bigint[] not null,
  answers jsonb not null default '{}'::jsonb, -- {user: {qid: {self, guess}}}
  finished boolean not null default false,
  matches int,
  primary key (couple_id, week_start)
);
alter table quiz_questions enable row level security;
alter table quiz_games enable row level security;

delete from quiz_questions where couple_id is null;
insert into quiz_questions (text, options) values
  ('En sevdiği tatlı?', '["Baklava","Sütlaç","Çikolata","Künefe"]'),
  ('Sabah ilk ne yapmak ister?', '["Kahve/çay","Biraz daha uyumak","Telefona bakmak","Hemen kalkıp hazırlanmak"]'),
  ('Tatil tercihi?', '["Deniz","Dağ ve doğa","Şehir gezisi","Evde dinlenmek"]'),
  ('En sevdiği mevsim?', '["İlkbahar","Yaz","Sonbahar","Kış"]'),
  ('Çay mı kahve mi?', '["Kesinlikle çay","Kesinlikle kahve","İkisi de","Hiçbiri"]'),
  ('Pazar sabahı ideal plan?', '["Uzun kahvaltı","Yürüyüş","Film/dizi","Ev işi bitirmek"]'),
  ('En çok hangi yemeği özler?', '["Anne yemeği","Döner/kebap","Makarna","Pide/lahmacun"]'),
  ('Hangi süper güç?', '["Uçmak","Görünmez olmak","Zihin okumak","Zamanı durdurmak"]'),
  ('Stresliyken ne yapar?', '["Sessiz kalır","Konuşur","Yemek yer","Yürüyüşe çıkar"]'),
  ('Sinemada ne alır?', '["Patlamış mısır","Nachos","Sadece içecek","Hiçbir şey"]'),
  ('En sevdiği renk?', '["Mavi","Yeşil","Kırmızı/pembe","Siyah/beyaz"]'),
  ('Alışverişte nasıldır?', '["Hızlı alır çıkar","Saatlerce bakar","Liste yapar","İnternetten alır"]'),
  ('Uykusu nasıldır?', '["Erken yatar erken kalkar","Gece kuşu","Her yerde uyur","Zor uyur"]'),
  ('Hediye olarak ne ister?', '["Kitap","Giysi/aksesuar","Deneyim (gezi, etkinlik)","Sürpriz"]'),
  ('Hangi ev hayvanı?', '["Kedi","Köpek","Kuş","Hiçbiri"]'),
  ('Sevdiği kahvaltı?', '["Serpme köy kahvaltısı","Menemen","Simit-peynir","Tost"]'),
  ('Yolculukta ne yapar?', '["Uyur","Manzara izler","Müzik/sohbet dinler","Konuşur"]'),
  ('Hangi hava onu mutlu eder?', '["Güneşli","Yağmurlu","Karlı","Serin ve rüzgârlı"]'),
  ('Boş vaktinde en çok?', '["Kitap okur","Dizi/film","Telefonla oyalanır","Bir şeyler üretir"]'),
  ('Arkadaş ortamında?', '["Konuşkan","Dinleyici","Şakacı","Gözlemci"]'),
  ('En çok hangi meyve?', '["Karpuz","Çilek","Muz","Portakal/mandalina"]'),
  ('Trafikte nasıldır?', '["Sakin","Sabırsız","Şarkı söyler","Sessiz"]'),
  ('Ev işlerinden en sevmediği?', '["Bulaşık","Çamaşır","Süpürmek","Ütü"]'),
  ('Yeni bir yere gidince?', '["Önce yemek","Önce gezi","Önce dinlenme","Önce fotoğraf"]'),
  ('Doğum gününde ne ister?', '["Sürpriz parti","Sakin bir akşam yemeği","Sadece ikimiz","Hediye yeter"]'),
  ('Sıcak içecek tercihi?', '["Salep","Sıcak çikolata","Bitki çayı","Türk kahvesi"]'),
  ('Telefonunda en çok?', '["Mesajlaşma","Sosyal medya","Video","Oyun"]'),
  ('En sevdiği çorba?', '["Mercimek","Ezogelin","Tavuk suyu","Yayla"]'),
  ('Plan yaparken?', '["Her şeyi planlar","Akışına bırakır","Son dakika","Liste yapar ama uymaz"]'),
  ('Hangi hamur işi?', '["Börek","Poğaça","Pizza","Gözleme"]'),
  ('Gece saat 23:00 de?', '["Çoktan uyudu","Dizi izliyor","Kitap okuyor","Telefonda"]'),
  ('Sevdiği spor?', '["Yürüyüş","Futbol","Yüzme","Hiçbiri"]'),
  ('Korku filmi?', '["Bayılır","Asla","Bazen","Gözlerini kapatır"]'),
  ('Bir günlüğüne meslek değiştirse?', '["Aşçı","Öğretmen","Pilot","Çiftçi"]'),
  ('Hangi pizza?', '["Karışık","Sucuklu","Margarita","Vejetaryen"]'),
  ('Kalabalıkta?', '["Enerji alır","Yorulur","Fark etmez","Kaçar"]'),
  ('Kış akşamı?', '["Battaniye ve dizi","Sıcak çorba","Arkadaş ziyareti","Erken uyku"]'),
  ('En sevdiği Türk tatlısı?', '["Kazandibi","Revani","Şekerpare","Tulumba"]'),
  ('Yemek yaparken?', '["Tarife uyar","Göz kararı","Hep aynı yemek","Sipariş verir"]'),
  ('Dondurma?', '["Çikolata","Çilek","Fıstık","Sade/vanilya"]'),
  ('Sabah duşu mu akşam duşu mu?', '["Sabah","Akşam","İkisi de","Değişir"]'),
  ('En sevdiği tatil aktivitesi?', '["Yüzmek","Gezmek","Uyumak","Yemek yemek"]'),
  ('Masa oyunu mu, dışarı mı?', '["Masa oyunu","Dışarı","Film","Uyku"]'),
  ('En çok hangi sebze?', '["Patlıcan","Patates","Ispanak","Biber"]'),
  ('Sürpriz sevgisi?', '["Bayılır","Hiç sevmez","Küçük olsun","Planlı olsun"]'),
  ('Bir evcil hayvana isim verse?', '["Komik bir isim","Klasik bir isim","Yemek ismi","Karakter ismi"]'),
  ('Araba yolculuğunda müzik?', '["Nasheed/ilahi","Pop","Hiç müzik","Sohbet/podcast"]'),
  ('Kahvaltıda olmazsa olmaz?', '["Peynir","Zeytin","Yumurta","Bal/reçel"]'),
  ('Dünyada bir yer görecek olsa?', '["Mekke/Medine","Japonya","İtalya","Kutuplar"]'),
  ('Sıkıldığında?', '["Temizlik yapar","Uyur","Birini arar","Dışarı çıkar"]'),
  ('Hangi çocuk oyunu?', '["Saklambaç","Yakan top","Misket","Ip atlama"]'),
  ('Dışarıda yemek?', '["Ev yemeği lokantası","Fast food","Lüks restoran","Sokak lezzeti"]'),
  ('Yeni yıl / bayram günü?', '["Aile ziyareti","Evde sakin","Gezi","Arkadaşlarla"]'),
  ('Hangi kurabiye?', '["Damla çikolatalı","Un kurabiyesi","Tuzlu","Tarçınlı"]'),
  ('Yağmurlu günde?', '["Camdan izler","Dışarı çıkar","Çay demler","Uyur"]'),
  ('Teknolojiye yaklaşımı?', '["Her yeniliği dener","Alıştığına bağlı","Umursamaz","Bozar"]'),
  ('En sevdiği mola?', '["Kahve molası","Kısa uyku","Yürüyüş","Atıştırmalık"]'),
  ('Hangi meyve suyu?', '["Portakal","Vişne","Şeftali","Hiçbiri"]'),
  ('Sabah kahvaltısında içecek?', '["Çay","Kahve","Süt","Su"]'),
  ('Hediyeyi nasıl açar?', '["Hemen yırtar","Dikkatle açar","Sonra açar","Önce sallar"]'),
  ('Hafta sonu tercih?', '["Aile ziyareti","İkimiz baş başa","Arkadaş buluşması","Yalnız dinlenme"]'),
  ('En sevdiği peynir?', '["Beyaz peynir","Kaşar","Tulum","Lor"]'),
  ('Kamp?', '["Bayılır","Otel daha iyi","Bir gece olur","Asla"]'),
  ('Film türü?', '["Komedi","Aksiyon","Dram","Belgesel"]'),
  ('Yemekte acı?', '["Çok sever","Az","Hiç","Bazen"]'),
  ('Sabah alarmı?', '["Tek seferde kalkar","Erteler","Alarma gerek yok","Beş kez erteler"]'),
  ('Çocukluğunda ne olmak isterdi?', '["Doktor","Öğretmen","Futbolcu/sporcu","Astronot"]'),
  ('Hangi hayvan ona benzer?', '["Kedi","Köpek","Baykuş","Tavşan"]'),
  ('Ev dekorasyonunda?', '["Sade","Renkli","Bitkili","Minimal"]'),
  ('En sevdiği ekmek?', '["Köy ekmeği","Simit","Bazlama","Tost ekmeği"]'),
  ('Bir günü yeniden yaşasa?', '["Düğün günü","Bir tatil günü","Çocukluktan bir gün","Bir bayram sabahı"]'),
  ('Ödül olarak ne ister?', '["Masaj","Dışarıda yemek","Uyku izni","Film seçme hakkı"]'),
  ('Sofrada en sevdiği yer?', '["Pencere kenarı","Karşısında sen","Köşe","Fark etmez"]'),
  ('Hangi kuruyemiş?', '["Fındık","Fıstık","Ceviz","Badem"]'),
  ('Soğuğa mı sıcağa mı dayanıklı?', '["Soğuğa","Sıcağa","İkisine de","Hiçbirine"]'),
  ('Yolculukta hangi koltuk?', '["Cam kenarı","Koridor","Ön","Arka"]'),
  ('Sevdiği çay?', '["Demli","Açık","Şekerli","Limonlu"]'),
  ('En sevdiği ev odası?', '["Mutfak","Salon","Yatak odası","Balkon"]'),
  ('Yeni insanlarla?', '["Hemen kaynaşır","Zamanla ısınır","Çekingen","Seçicidir"]'),
  ('Marketten dönerken?', '["Listeyi tamamlar","Fazladan alır","Atıştırmalık alır","Bir şeyi unutur"]'),
  ('Sahil mi havuz mu?', '["Sahil","Havuz","İkisi de","Hiçbiri"]'),
  ('Sevdiği pasta?', '["Çikolatalı","Meyveli","Cheesecake","Tiramisu"]'),
  ('Konserve/stok yapar mı?', '["Her şeyi stoklar","Günlük alır","Bazen","Hiç"]'),
  ('Hangi saat en verimli?', '["Sabah erken","Öğlen","Akşam","Gece"]'),
  ('Yaz içeceği?', '["Limonata","Ayran","Soğuk çay","Su"]'),
  ('Kitap türü?', '["Roman","Dini/tasavvuf","Kişisel gelişim","Tarih"]'),
  ('En sevdiği hafta günü?', '["Cuma","Cumartesi","Pazar","Pazartesi"]'),
  ('Hangi balık?', '["Hamsi","Somon","Levrek","Balık sevmez"]'),
  ('Bir yemeği hayatı boyunca yese?', '["Pilav","Makarna","Mantı","Kebap"]'),
  ('Hangi anı daha çok sever?', '["Gün doğumu","Gün batımı","Yıldızlı gece","Yağmur sonrası"]'),
  ('Çikolata?', '["Sütlü","Bitter","Beyaz","Fındıklı"]'),
  ('Hangi kokuyu sever?', '["Yağmur kokusu","Taze ekmek","Kahve","Çiçek"]'),
  ('Ev partisi mi dışarı mı?', '["Ev","Dışarı","Piknik","Hiçbiri"]'),
  ('Bir dil öğrenecek olsa?', '["Arapça","İngilizce","İspanyolca","Japonca"]'),
  ('Hangi mantı?', '["Kayseri mantısı","Fırın mantı","Çin mantısı","Mantı sevmez"]'),
  ('Dağınıklığa tepkisi?', '["Hemen toplar","Katlanır","Fark etmez","Hafta sonu toplar"]'),
  ('En çok neyi beklerken heyecanlanır?', '["Tatil","Bayram","Yemek","Misafir"]'),
  ('Sabahları?', '["Neşeli","Sessiz","Huysuz","Hızlı"]'),
  ('Doğada ne yapmak ister?', '["Yürüyüş","Piknik","Fotoğraf","Oturup izlemek"]'),
  ('Sıcak mı soğuk tatlı mı?', '["Sıcak (künefe, sütlaç)","Soğuk (dondurma, puding)","İkisi de","Tatlı yemez"]');

-- Haftanın 5 sorusu: havuz + çiftin kendi soruları; son 12 haftada sorulanlar hariç
create or replace function bb_quiz_game(p_couple uuid, p_week date) returns quiz_games
language plpgsql security definer set search_path = public as $$
declare g quiz_games; ids bigint[];
begin
  select * into g from quiz_games where couple_id = p_couple and week_start = p_week;
  if g.couple_id is not null then return g; end if;
  select coalesce(array_agg(id), '{}') into ids from (
    select q.id from quiz_questions q
    where (q.couple_id is null or q.couple_id = p_couple)
      and q.id <> all (coalesce((select array_agg(x) from quiz_games qg, unnest(qg.question_ids) x where qg.couple_id = p_couple and qg.week_start > p_week - 84), '{}'::bigint[]))
    order by md5(p_couple::text || p_week::text || q.id::text) limit 5) s;
  insert into quiz_games (couple_id, week_start, question_ids) values (p_couple, p_week, ids) on conflict do nothing;
  select * into g from quiz_games where couple_id = p_couple and week_start = p_week;
  return g;
end $$;

create or replace function bb_quiz_json(g quiz_games, p_user uuid, p_partner uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare qs jsonb; mine jsonb := g.answers->p_user::text; theirs jsonb := g.answers->p_partner::text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options, 'custom', q.couple_id is not null,
      'me', case when g.finished then mine->q.id::text end,
      'partner', case when g.finished then theirs->q.id::text end) order by o), '[]'::jsonb)
    into qs from unnest(g.question_ids) with ordinality as t(qid, o) join quiz_questions q on q.id = t.qid;
  return jsonb_build_object('week', g.week_start, 'questions', qs, 'mineDone', mine is not null, 'theirsDone', theirs is not null,
    'finished', g.finished, 'matches', g.matches,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('week', week_start, 'matches', matches) order by week_start desc), '[]'::jsonb)
                from (select week_start, matches from quiz_games where couple_id = g.couple_id and finished order by week_start desc limit 8) h));
end $$;

-- Cevapla: {"<qid>": {"self": 0..3, "guess": 0..3}} (5 soru birden)
create or replace function quiz_answer(p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; ws date; g quiz_games; qid bigint; a jsonb; mine jsonb; theirs jsonb; v_m int := 0; v_xp int; v_gold int;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  ws := bb_week_start(bb_local_date(now(), c.timezone));
  g := bb_quiz_game(c.id, ws);
  if g.answers ? u::text then raise exception 'INVALID_STATE'; end if;
  foreach qid in array g.question_ids loop
    a := p_answers->qid::text;
    if a is null or jsonb_typeof(a->'self') <> 'number' or jsonb_typeof(a->'guess') <> 'number'
       or (a->>'self')::int not between 0 and 3 or (a->>'guess')::int not between 0 and 3 then raise exception 'INVALID_VALUE'; end if;
  end loop;
  select jsonb_object_agg(k::text, jsonb_build_object('self', (p_answers->k::text->>'self')::int, 'guess', (p_answers->k::text->>'guess')::int)) into mine from unnest(g.question_ids) k;
  update quiz_games set answers = answers || jsonb_build_object(u::text, mine) where couple_id = c.id and week_start = ws returning * into g;
  theirs := g.answers->v_partner::text;
  if theirs is not null then
    foreach qid in array g.question_ids loop
      if (mine->qid::text->>'guess')::int = (theirs->qid::text->>'self')::int then v_m := v_m + 1; end if;
      if (theirs->qid::text->>'guess')::int = (mine->qid::text->>'self')::int then v_m := v_m + 1; end if;
    end loop;
    update quiz_games set finished = true, matches = v_m where couple_id = c.id and week_start = ws;
    v_xp := 10 + 5 * v_m; v_gold := 5 * v_m;
    perform bb_grant(u, 'QUIZ', v_xp, v_gold); perform bb_grant(v_partner, 'QUIZ', v_xp, v_gold);
    perform bb_team_hit(c.id, 'QUIZ', 8 * v_m);
    perform bb_event(u, 'QUIZ_RESULT', jsonb_build_object('matches', v_m, 'xp', v_xp, 'gold', v_gold, 'damage', 8 * v_m));
    perform bb_event(v_partner, 'QUIZ_RESULT', jsonb_build_object('matches', v_m, 'xp', v_xp, 'gold', v_gold, 'damage', 8 * v_m), u);
    perform bb_check_achievements(u); perform bb_check_achievements(v_partner);
  else
    perform bb_event(v_partner, 'QUIZ_WAIT', '{}'::jsonb, u);
  end if;
  return get_games();
end $$;

-- Çiftin kendi sorusu (4 şık)
create or replace function quiz_add(p_text text, p_options jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; i int;
begin
  c := bb_couple_of(u);
  if c.id is null then raise exception 'NO_PARTNER'; end if;
  if length(btrim(coalesce(p_text, ''))) not between 3 and 100 then raise exception 'INVALID_VALUE'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then raise exception 'INVALID_VALUE'; end if;
  for i in 0..3 loop
    if jsonb_typeof(p_options->i) <> 'string' or length(btrim(p_options->>i)) not between 1 and 40 then raise exception 'INVALID_VALUE'; end if;
  end loop;
  if (select count(*) from quiz_questions where couple_id = c.id) >= 200 then raise exception 'DAILY_LIMIT'; end if;
  insert into quiz_questions (couple_id, text, options, created_by) values (c.id, btrim(p_text), p_options, u);
  return get_games();
end $$;

-- =====================================================================
-- 2. Not defteri: mektup + şükür
-- =====================================================================
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  author uuid not null references app_users(id) on delete cascade,
  kind text not null check (kind in ('LETTER','THANKS')),
  text text not null,
  stamp text,
  local_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists notes_couple_date on notes(couple_id, local_date desc, created_at desc);
alter table notes enable row level security;

create or replace function note_write(p_kind text, p_text text, p_stamp text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_today date; v_text text; v_other notes;
begin
  if p_kind not in ('LETTER','THANKS') then raise exception 'INVALID_VALUE'; end if;
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  v_text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if length(v_text) not between 1 and 140 then raise exception 'INVALID_VALUE'; end if;
  if exists (select 1 from notes where couple_id = c.id and author = u and kind = p_kind and local_date = v_today) then raise exception 'DAILY_LIMIT'; end if;
  insert into notes (couple_id, author, kind, text, stamp, local_date) values (c.id, u, p_kind, v_text, nullif(left(coalesce(p_stamp, ''), 20), ''), v_today);
  if p_kind = 'LETTER' then
    perform bb_event(v_partner, 'LETTER', jsonb_build_object('text', v_text, 'stamp', p_stamp), u);
  else
    select * into v_other from notes where couple_id = c.id and author = v_partner and kind = 'THANKS' and local_date = v_today;
    if v_other.id is not null then
      perform bb_grant(u, 'THANKS', 5, 10); perform bb_grant(v_partner, 'THANKS', 5, 10);
      perform bb_event(u, 'THANKS_BOTH', jsonb_build_object('mine', v_text, 'theirs', v_other.text, 'gold', 10, 'xp', 5));
      perform bb_event(v_partner, 'THANKS_BOTH', jsonb_build_object('mine', v_other.text, 'theirs', v_text, 'gold', 10, 'xp', 5), u);
    else
      perform bb_event(v_partner, 'THANKS', jsonb_build_object('text', v_text), u);
    end if;
  end if;
  perform bb_check_achievements(u);
  return get_games();
end $$;

create or replace function get_notes(p_before timestamptz default null, p_limit int default 40) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples;
begin
  c := bb_couple_of(u);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'author', n.author, 'kind', n.kind, 'text', n.text, 'stamp', n.stamp, 'date', n.local_date, 'at', n.created_at) order by n.created_at desc), '[]'::jsonb)
    from (select * from notes where couple_id = c.id and (p_before is null or created_at < p_before) order by created_at desc limit least(greatest(p_limit, 1), 100)) n);
end $$;

-- =====================================================================
-- 3. Ortak baskın
-- =====================================================================
create table if not exists raids (
  couple_id uuid not null references couples(id) on delete cascade,
  local_date date not null,
  game text not null,
  seed int not null,
  scores jsonb not null default '{}'::jsonb,
  damage int,
  finished boolean not null default false,
  primary key (couple_id, local_date)
);
alter table raids enable row level security;

create or replace function bb_raid_today(p_couple uuid, p_date date) returns raids
language plpgsql security definer set search_path = public as $$
declare r raids; h int;
begin
  select * into r from raids where couple_id = p_couple and local_date = p_date;
  if r.couple_id is not null then return r; end if;
  h := (('x' || substr(md5(p_couple::text || p_date::text || 'baskin'), 1, 8))::bit(32)::int & 2147483647);
  insert into raids (couple_id, local_date, game, seed) values (p_couple, p_date, (array['TAP','MATH','COLOR','TIMING'])[1 + h % 4], h % 2000000000)
    on conflict do nothing;
  select * into r from raids where couple_id = p_couple and local_date = p_date;
  return r;
end $$;

create or replace function bb_raid_json(r raids) returns jsonb
language sql stable as $$
  select jsonb_build_object('date', r.local_date, 'game', r.game, 'seed', r.seed, 'scores', r.scores, 'damage', r.damage, 'finished', r.finished)
$$;

create or replace function raid_play(p_score int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_today date; r raids; v_score int; v_sum int; v_dmg int; v_max int;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  r := bb_raid_today(c.id, v_today);
  select * into r from raids where couple_id = c.id and local_date = v_today for update;
  if r.scores ? u::text then raise exception 'INVALID_STATE'; end if;
  v_max := bb_game_max(r.game);
  v_score := least(greatest(coalesce(p_score, 0), 0), v_max);
  update raids set scores = scores || jsonb_build_object(u::text, v_score) where couple_id = c.id and local_date = v_today returning * into r;
  if r.scores ? v_partner::text then
    v_sum := v_score + (r.scores->>v_partner::text)::int;
    v_dmg := least(120, round(120.0 * v_sum / (2 * v_max)))::int;
    v_dmg := bb_team_hit(c.id, 'RAID', v_dmg);
    update raids set finished = true, damage = v_dmg where couple_id = c.id and local_date = v_today;
    perform bb_grant(u, 'RAID', 10, 10); perform bb_grant(v_partner, 'RAID', 10, 10);
    perform bb_event(u, 'RAID_DONE', jsonb_build_object('game', r.game, 'me', v_score, 'them', (r.scores->>v_partner::text)::int, 'damage', v_dmg));
    perform bb_event(v_partner, 'RAID_DONE', jsonb_build_object('game', r.game, 'me', (r.scores->>v_partner::text)::int, 'them', v_score, 'damage', v_dmg), u);
    perform bb_check_achievements(u); perform bb_check_achievements(v_partner);
  else
    perform bb_event(v_partner, 'RAID_WAIT', jsonb_build_object('game', r.game, 'score', v_score), u);
  end if;
  return get_games();
end $$;

-- =====================================================================
-- 4. Yeni düellolar + 5. kelime ipucu
-- =====================================================================
alter table duels drop constraint if exists duels_game_check;
alter table duels add constraint duels_game_check check (game in ('TAP','MEMORY','TIMING','WORDS','SLIDE','MATH','COLOR'));
create or replace function bb_game_max(p_game text) returns int
language sql immutable as $$
  select case p_game when 'TAP' then 120 when 'MEMORY' then 40 when 'TIMING' then 500 when 'WORDS' then 60 when 'SLIDE' then 300 when 'MATH' then 40 when 'COLOR' then 40 else 0 end
$$;

alter table word_games add column if not exists hints jsonb not null default '[]'::jsonb;

create or replace function word_hint() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_today date; w word_games; h heroes; v_pos int; g jsonb; v_cost int := 10;
begin
  v_partner := bb_partner_of(u);
  if v_partner is null then raise exception 'NO_PARTNER'; end if;
  c := bb_couple_of(u);
  v_today := bb_local_date(now(), c.timezone);
  w := bb_word_game(c.id, v_today);
  select * into w from word_games where couple_id = c.id and local_date = v_today for update;
  if w.finished then raise exception 'INVALID_STATE'; end if;
  if jsonb_array_length(w.hints) >= 2 then raise exception 'DAILY_LIMIT'; end if;
  select * into h from heroes where user_id = u for update;
  if h.gold < v_cost then raise exception 'INSUFFICIENT_GOLD'; end if;
  -- açığa çıkmamış ilk konum (yeşil harf ya da önceki ipucu değil)
  v_pos := null;
  for i in 1..5 loop
    if not exists (select 1 from jsonb_array_elements(w.guesses) ge where substr(ge->>'res', i, 1) = 'G')
       and not exists (select 1 from jsonb_array_elements(w.hints) x where (x->>'pos')::int = i) then v_pos := i; exit; end if;
  end loop;
  if v_pos is null then raise exception 'INVALID_STATE'; end if;
  update heroes set gold = gold - v_cost where user_id = u;
  insert into hero_log (user_id, kind, gold) values (u, 'HINT', -v_cost);
  update word_games set hints = hints || jsonb_build_object('pos', v_pos, 'letter', substr(w.word, v_pos, 1), 'by', u) where couple_id = c.id and local_date = v_today;
  perform bb_event(v_partner, 'WORD_HINT', jsonb_build_object('pos', v_pos, 'letter', substr(w.word, v_pos, 1)), u);
  return get_games();
end $$;

-- =====================================================================
-- 6. get_games, rozetler, güvenlik
-- =====================================================================
create or replace function get_games() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := bb_current_user(); c couples; v_partner uuid; v_today date; ws date; w word_games; v_limit int; q quiz_games; r raids;
begin
  c := bb_couple_of(u);
  v_partner := bb_partner_of(u);
  v_today := bb_local_date(now(), c.timezone);
  ws := bb_week_start(v_today);
  update duels set status = 'EXPIRED' where couple_id = c.id and status = 'OPEN' and expires_at <= now();
  if v_partner is not null then
    w := bb_word_game(c.id, v_today);
    select * into w from word_games where couple_id = c.id and local_date = v_today;
    q := bb_quiz_game(c.id, ws);
    r := bb_raid_today(c.id, v_today);
  end if;
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
        'date', w.local_date, 'guesses', w.guesses, 'solved', w.solved, 'finished', w.finished, 'hints', w.hints,
        'answer', case when w.finished then w.word end,
        'solvedDays', (select count(*) from word_games where couple_id = c.id and solved)) end,
    'together', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'icon', t.icon, 'title', t.title,
          'status', l.status, 'proposedBy', l.proposed_by, 'confirmedAt', l.confirmed_at)), '[]'::jsonb)
        from bb_together_week(c.id, ws) t left join together_log l on l.couple_id = c.id and l.week_start = ws and l.code = t.code),
    'togetherDone', (select count(*) from together_log where couple_id = c.id and status = 'DONE'),
    'quiz', case when q.couple_id is null then null else bb_quiz_json(q, u, v_partner) end,
    'raid', case when r.couple_id is null then null else bb_raid_json(r) end,
    'notes', jsonb_build_object(
        'letterSent', exists (select 1 from notes where couple_id = c.id and author = u and kind = 'LETTER' and local_date = v_today),
        'thanksMe', (select text from notes where couple_id = c.id and author = u and kind = 'THANKS' and local_date = v_today),
        'thanksPartner', (select text from notes where couple_id = c.id and author = v_partner and kind = 'THANKS' and local_date = v_today),
        'total', (select count(*) from notes where couple_id = c.id)),
    'config', (select jsonb_build_object('togetherXP', value->'togetherXP', 'togetherGold', value->'togetherGold', 'togetherDamage', value->'togetherDamage') from app_config where key = 'game')
  );
end $$;

create or replace function bb_check_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h heroes; v_done int; v_lvl int; k text; v_new text[] := '{}'; c couples; v_boss int; v_wins int; v_words int; v_tog int; v_chain int; v_skill int; v_quiz int; v_letters int; v_raids int;
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
  select coalesce(max(best), 0) into v_chain from quest_chains where user_id = p_user;
  select count(*) into v_skill from hero_log where user_id = p_user and kind = 'SKILL';
  select count(*) into v_quiz from quiz_games where couple_id = c.id and finished;
  select count(*) into v_letters from notes where author = p_user and kind = 'LETTER';
  select count(*) into v_raids from raids where couple_id = c.id and finished;
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
  if v_chain >= 30 then v_new := array_append(v_new, 'CHAIN_30'); end if;
  if v_chain >= 100 then v_new := array_append(v_new, 'CHAIN_100'); end if;
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
  if v_skill >= 1 then v_new := array_append(v_new, 'SKILL_1'); end if;
  if v_skill >= 10 then v_new := array_append(v_new, 'SKILL_10'); end if;
  if (select count(distinct boss_key) from bosses where couple_id = c.id and defeated_at is not null) >= 12 then v_new := array_append(v_new, 'BESTIARY'); end if;
  if v_quiz >= 1 then v_new := array_append(v_new, 'QUIZ_1'); end if;
  if exists (select 1 from quiz_games where couple_id = c.id and finished and matches >= 10) then v_new := array_append(v_new, 'QUIZ_PERFECT'); end if;
  if v_letters >= 10 then v_new := array_append(v_new, 'LETTER_10'); end if;
  if v_raids >= 5 then v_new := array_append(v_new, 'RAID_5'); end if;
  foreach k in array v_new loop
    insert into achievements (user_id, key) values (p_user, k) on conflict do nothing;
    if found then perform bb_event(p_user, 'ACHIEVEMENT', jsonb_build_object('key', k)); end if;
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function get_game(), create_hero(text, text, jsonb, int), update_hero(text, text, jsonb, boolean), complete_quest(uuid, boolean),
  set_izin(boolean), set_difficulty(int), buy_item(text), equip_item(text, text), use_potion(text), social_action(text, int), mark_events_seen(uuid[]),
  get_tickets(), request_ticket(uuid, uuid, text), respond_redemption(uuid, text), request_reversal(uuid),
  create_invite(), generate_recovery_codes(), recovery_codes_status(), revoke_other_sessions(), disconnect_couple(), delete_account(),
  get_games(), duel_create(text, int, int), duel_play(uuid, int), duel_cancel(uuid), word_guess(text), together_mark(text), together_cancel(text),
  get_calendar(date), get_day(date), use_skill(), get_bestiary(),
  quiz_answer(jsonb), quiz_add(text, jsonb), note_write(text, text, text), get_notes(timestamptz, int), raid_play(int), word_hint()
  to authenticated;
grant execute on function recover_with_code(text, text, text) to anon, authenticated;
grant execute on function bb_handle_new_auth_user() to supabase_auth_admin;
grant execute on function bb_hash(text) to supabase_auth_admin;

select 'paket3 ok' as result, (select count(*) from quiz_questions where couple_id is null) as questions;
