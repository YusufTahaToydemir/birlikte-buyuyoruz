# Kyron

İki kişilik, Türkçe, telefona kurulabilen **piksel RPG** (PWA). Oyun her gün görev verir; görevi yapınca tek dokunuşla işaretlersin, kahramanın XP, altın ve güç kazanır, haftanın ortak canavarına hasar vurur.

Canlı: https://yusuftahatoydemir.github.io/birlikte-buyuyoruz/

## Tasarım kuralları (v2, 4 Kasım 2026)

Kullanıcı geri bildirimi esas alınır; ilk şartname yalnızca arka plan bilgisidir.

- Oyun hissi önce gelir: az yazı, çok görsel, bol efekt (VFX) ve ses (SFX).
- Görevleri oyuncu belirlemez; oyun verir. Görev = tek dokunuş (yaptım / geri al), ek ekran yok.
- 6 zorluk: Çırak, Acemi, Yiğit, Kahraman, Efsane, Destansı. Zorluk arttıkça görev sayısı/hedefi ve ödül çarpanı artar (1 / 1.1 / 1.35 / 1.7 / 2.1 / 2.6, her basamak ≈ ×1.4; Destansı'da eksiksiz → Sv 100 ≈ 217 gün). Kaçan görev başına can 2 / 2.25 / 2.5 / 2.5 / 2.75 / 3 (boş gün en fazla ≈ −51). Canavarda eşit katkı: her kahramanın tam günü ≈ 300 hasar, canavar kişi başı 1260 can (0015). Beslenme ve düzen görevleri 3. zorluktan sonra açılır; Duha/teheccüd Efsane'den, kaza namazı (2 vakit) Destansı'da; İngilizce kelime 2/5/10/15/20/30 (0016); spor Kahraman'dan tempolu, Efsane/Destansı'da kadın 50/60, erkek 60/75 dk; sürpriz görevler zorlukla büyür.
- 4 sınıf: Savaşçı (Beden), Büyücü (Zekâ), Şifacı (Ruh, her gün bedava şifa), Okçu (Düzen ve sürpriz görevler). Sınıf alanında %10 bonus.
- Can sistemi: gün sonunda kaçan her görev can götürür, izinli günde hasar yok; can biterse bayılma (canın yarısıyla döner, altının %10'u gider). Sabah biraz can yenilenir.
- Ortak mekanikler: haftalık ortak boss (iki kişinin görevleri vurur), ikiniz de günü tamamlarsanız kombo, alkış (+XP), iyileştirme, altın hediyesi, haftalık XP yarışı (önde olana taç).
- Biletler seyrek (en hızlı 2 haftada 1): 4 bilet parçası = 1 bilet. Parça: boss yenilince ikinize 1, haftada yeterince tam gün yapana 1. Bilet partnerin onayıyla kullanılır.

## İlerleme ve oyunlar (v3, 4 Kasım 2026)

- Seviye sınırı yok. Sv L→L+1 = 150 + 30·L XP: Sv 10 ≈ 2 hafta, Sv 50 ≈ 6 ay, Sv 100 ≈ 1,5 yıl. Her seviyede altın, 5'in katlarında sandık + iksir, unvanlar (Çaylak → Ölümsüz), dükkan eşyaları Sv 80'e kadar açılır (6 kademe silah/zırh, 5 başlık, 7 pelerin, 6 evcil hayvan). Ödül her seviye için bir kez verilir.
- Düello: 5 mini oyun (Balçık Avı, Rün Hafızası, Kritik Vuruş, Kelime Düellosu, Yapboz). Biri oynayıp meydan okur, eşi aynı tohumla aynı oyunu oynar; kazanan +20 XP +30 altın (günde 5 ödül). Antrenman ödülsüz.
- Günün Kelimesi: ortak Wordle; 6 tahmin, kişi başı 3. Çözülünce ikinize ödül.
- Birlikte: haftada 4 gerçek hayat etkinliği; biri "Yaptık!" der, diğeri onaylar → ikinize +40 XP +25 altın, boss'a ortak hasar.
- Müzik: kodla bestelenen 4 çiptune parça (giriş, köy, savaş, oyun), efektlerden ayrı açılıp kapanır.

## Dört paket (v4, 4 Kasım 2026; migrations 0007–0010, testler `supabase/tests/paket1-4.sql`)

- **Aylarca sürsün:** Seri Kalkanı (dükkân, en fazla 2; eksik günde seri korunur), 3 kademeli bilet (Yeşil %60 / Turuncu %30 / Kırmızı %10; her 4. en az turuncu, her 10. kırmızı; isteğe ödül notu), görev zincirleri (üst üste gün sayacı, izin günü korur), ay takvimi (ikinizin günleri, güne dokununca görev listesi), eşin kahramanı sahnede.
- **Derinlik:** statlar işe yarar (bonus % = √stat, en çok 20: Güç → can, Zekâ → XP, Ruh → hasar, Düzen → altın), sınıf yetenekleri haftada bir (Savaş Çığlığı 2× hasar, Büyük Büyü 2× XP, Büyük Şifa ikisinin canı, Keşif yan görev +1), günün olayı (çift için ortak, 12 günde 8; Ruh Dalgası, Bilgelik, Güç, Düzen, Altın Yağmuru, Çift Gün, Canavar Öfkeli, Kombo Günü), canavar zayıflığı ×1.5 ve öfke evresi (son %25 yarım hasar), Bestiyer.
- **Birlikte:** Çift Testi (haftada 5 soru; kendi cevabın + eşinin tahmini; 100 soru havuzu + kendi sorularınız), Not Defteri (günde 1 mektup, günde 1 şükür; ikisi de yazınca +10 altın; hatıra defteri), Ortak Baskın (günün oyunu, iki puanın toplamı canavara en çok 120 hasar), Hızlı Hesap ve Renk Tuzağı düelloları, Günün Kelimesi ipucu (10 altın, günde 2).
- **Eşin görevleri (0014):** eş bir görevi bitirince diğerine "şu görevi tamamladı" bildirimi gider (5 dakikalık döngüde eş başına tek bildirim, 1 dk bekler, gece 23:00-08:00 gitmez, kapatılabilir; özel gün görev adları gizli). Maceradaki eş karakterine dokununca bugünkü görevleri, 7 günlük çubuğu ve dört sayıyı gösteren pencere açılır; yeni görevde karakterin üstünde "+n" balonu çıkar. Özel gün modu (0012-0013) ve rakam yazı tipi (KyronNum) da bu sürümde.
- **Kale ve sezon:** ortak kale (25 parça, altın kendi kesenden, kütüphane/demirci/mescit/bahçe/pazar/kuyu/mutfak küçük bonus verir), 3 aylık sezonlar (1 Kasım 2026'dan; özet, sezon sonu +250 altın), Web Push altyapısı (`supabase/functions/push`, `public/push-sw.js`; pg_cron `bb-push` 5 dakikada bir çağırır; VAPID anahtarları ve PUSH_SECRET Edge Function gizli değerlerinde).

## Ekranlar

| Sekme | İçerik |
| --- | --- |
| Macera | Sahne (kahraman, evcil hayvan, boss, bulut/ateş böceği), günlük ilerleme, izin kalkanı, iksir, görev kartları, sürpriz görevler |
| Arena | Boss ve can çubuğu, hasar katkısı, VS yarış, partner durumu, Alkış / İyileştir / Altın, son vuruşlar, davet |
| Oyun | Düello skoru (çevrimiçi göstergesi), gelen düellolar, Günün Kelimesi, Birlikte etkinlikleri, 5 mini oyun, sonuçlar |
| Kahraman | Büyük karakter, unvan, seviye yolu (sonraki 15 seviyenin ödülleri), ekipman yuvaları, güç değerleri, 33 rozet |
| Hazine | Dükkan (iksir, 6 kademe silah/zırh, başlık, pelerin, evcil hayvan; giymiş önizleme), biletler ve bilet parçaları |
| Ayarlar | Zorluk, efekt sesi, müzik, görünüm/sınıf/ad, partner daveti, kurtarma kodları, çıkış, hesabı silme |

## Mimari

- **İstemci**: Vite + React + TypeScript + Tailwind, `vite-plugin-pwa` (otomatik güncelleme). Tüm piksel sanat kodla üretilir (`src/game/art/*`: harf haritası + palet → ızgara → otomatik dış çizgi → canvas → önbellekli data URL). Sesler WebAudio ile sentezlenir (`src/game/sfx.ts`), müzik `src/game/music.ts`, efektler `src/game/fx.tsx`, mini oyunlar `src/game/minigames.tsx`.
- **Sunucu**: Supabase. Tüm oyun kuralları PostgreSQL `SECURITY DEFINER` fonksiyonlarında (`supabase/migrations/0005_game_v2.sql`, `0006_progression_games.sql`); tablolarda RLS açık ve doğrudan erişim yok. Gün kapanışı, boss, haftalık bilet ve rozetler `pg_cron` ile dakikalık iş + uygulama açılışında telafi.
- **Kimlik**: kullanıcı adı + şifre (en az 6). İlk hesap tek kullanımlık kurulum bağlantısıyla (`#/kurulum/<anahtar>`), ikinci hesap 24 saatlik davetle (`#/davet/<token>`).

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173/birlikte-buyuyoruz/  (sanat önizlemesi: #/art)
npm test           # istemci testleri
npm run build
```

Sunucu senaryoları: `supabase/tests/game_v2.sql` ve `supabase/tests/progression_games.sql` (SQL editöründe çalıştırılır, sonunda her şey geri alınır).

Yayın: `npm run build` → `dist` içeriği `gh-pages` dalına (404.html ve .nojekyll ile).
