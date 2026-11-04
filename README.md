# Birlikte Büyüyoruz

İki kişilik, Türkçe, telefona kurulabilen **piksel RPG** (PWA). Oyun her gün görev verir; görevi yapınca tek dokunuşla işaretlersin, kahramanın XP, altın ve güç kazanır, haftanın ortak canavarına hasar vurur.

Canlı: https://yusuftahatoydemir.github.io/birlikte-buyuyoruz/

## Tasarım kuralları (v2, 4 Kasım 2026)

Kullanıcı geri bildirimi esas alınır; ilk şartname yalnızca arka plan bilgisidir.

- Oyun hissi önce gelir: az yazı, çok görsel, bol efekt (VFX) ve ses (SFX).
- Görevleri oyuncu belirlemez; oyun verir. Görev = tek dokunuş (yaptım / geri al), ek ekran yok.
- 6 zorluk: Çırak, Acemi, Yiğit, Kahraman, Efsane, Mitik. Zorluk arttıkça görev sayısı/hedefi ve ödül çarpanı artar, kaçan görevin can hasarı büyür. Beslenme ve düzen görevleri 3. zorluktan sonra açılır.
- 4 sınıf: Savaşçı (Beden), Büyücü (Zekâ), Şifacı (Ruh, her gün bedava şifa), Okçu (Düzen ve sürpriz görevler). Sınıf alanında %10 bonus.
- Can sistemi: gün sonunda kaçan her görev can götürür, izinli günde hasar yok; can biterse bayılma (canın yarısıyla döner, altının %10'u gider). Sabah biraz can yenilenir.
- Ortak mekanikler: haftalık ortak boss (iki kişinin görevleri vurur), ikiniz de günü tamamlarsanız kombo, alkış (+XP), iyileştirme, altın hediyesi, haftalık XP yarışı (önde olana taç).
- Biletler: boss yenilince ikinize de 1 bilet; haftada yeterince tam gün yapana kişisel 1 bilet. Bilet partnerin onayıyla kullanılır.

## Ekranlar

| Sekme | İçerik |
| --- | --- |
| Macera | Sahne (kahraman, evcil hayvan, boss), günlük ilerleme, izin kalkanı, iksir, görev kartları, sürpriz görevler |
| Arena | Boss ve can çubuğu, hasar katkısı, VS yarış, partner durumu, Alkış / İyileştir / Altın, son vuruşlar, davet |
| Kahraman | Büyük karakter, seri, ekipman yuvaları (silah, zırh, başlık, pelerin, evcil hayvan), güç değerleri, rozetler |
| Hazine | Dükkan (iksir, 4 kademe silah/zırh, başlık, pelerin, evcil hayvan; giymiş önizleme), biletler |
| Ayarlar | Zorluk, ses, görünüm/sınıf/ad, partner daveti, kurtarma kodları, çıkış, hesabı silme |

## Mimari

- **İstemci**: Vite + React + TypeScript + Tailwind, `vite-plugin-pwa` (otomatik güncelleme). Tüm piksel sanat kodla üretilir (`src/game/art/*`: harf haritası + palet → ızgara → otomatik dış çizgi → canvas → önbellekli data URL). Sesler WebAudio ile sentezlenir (`src/game/sfx.ts`), efektler `src/game/fx.tsx`.
- **Sunucu**: Supabase. Tüm oyun kuralları PostgreSQL `SECURITY DEFINER` fonksiyonlarında (`supabase/migrations/0005_game_v2.sql`); tablolarda RLS açık ve doğrudan erişim yok. Gün kapanışı, boss, haftalık bilet ve rozetler `pg_cron` ile dakikalık iş + uygulama açılışında telafi.
- **Kimlik**: kullanıcı adı + şifre (en az 6). İlk hesap tek kullanımlık kurulum bağlantısıyla (`#/kurulum/<anahtar>`), ikinci hesap 24 saatlik davetle (`#/davet/<token>`).

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173/birlikte-buyuyoruz/  (sanat önizlemesi: #/art)
npm test           # istemci testleri
npm run build
```

Sunucu senaryoları: `supabase/tests/game_v2.sql` (SQL editöründe çalıştırılır, sonunda her şey geri alınır).

Yayın: `npm run build` → `dist` içeriği `gh-pages` dalına (404.html ve .nojekyll ile).
