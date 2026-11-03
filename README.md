# Birlikte Büyüyoruz

İki yetişkin hayat arkadaşına özel, Türkçe, telefon odaklı PWA. Günlük görevler → XP → seviye, kıyafet, kalp, bilet.
Ürün kuralları için tek kaynak: `Birlikte_Buyuyoruz_Uygulama_Sartnamesi.md` (sürüm 1.0, 3 Kasım 2026).

## Durum (3 Kasım 2026)

**Tamamlanan (Aşama 1, "dikey çalışan temel")**

- Tek kullanımlık kurulum anahtarı ile çift alanı + ilk hesap; 24 saat geçerli tek kullanımlık davetle ikinci hesap. Açık kayıt yok.
- Kullanıcı adı + şifre girişi (en az 15 karakter, sunucuda zorlanır). Şifre değişiminde mevcut şifre zorunlu.
- İlk kurulum: karakter (tip, ten, saç/başörtüsü, saç rengi), görünen ad, başlangıç görevlerini gözden geçirme (aç/kapat, hedef, sünnet listesi), paylaşım açıklaması.
- Başlangıç planı (14 şablon, §5) ve sürümlü ekonomi ayarları (`app_config.economy`, §26) seed edilmiş.
- Günlük görev örnekleri sunucuda üretilir; Bugün ekranı: ikili tek dokunuş, sayısal/süre, saat (06.30), kontrol listesi, beslenme üçlü seçim, özel not, "yapılmadı", "takip dışı", kaydı kaldırma.
- XP matematiği, seviye eşikleri, günlük brüt/net, isteğe bağlı beslenme cezası (varsayılan kapalı), XP defteri; seviye kutlaması (kullanıcı+seviye başına bir kez).
- Gece kapanışı (PENDING → MISSED_AUTO), ertesi gün 12.00 düzeltme sınırı, kilitleme, günlük kalp (2 + 3), haftalık değerlendirme ve bilet üretimi — hepsi PostgreSQL'de, `pg_cron` ile her dakika; uygulama açılınca da aynı iş kullanıcı için anında koşar (gecikme telafisi).
- Idempotency (`operationId`), revision çakışması (409 eşdeğeri), gün satırı kilidi, DB tekillik anahtarları (kalp, bilet, haftalık sonuç).
- Biz: iki karakterli sahne, ortak bahçe seviyesi, partner özeti **yalnızca izin verilen alanlarla** (sunucu allowlist), anı defteri.
- Karakterim: kıyafet giy/dene (seviyeyle açılır), görünüm düzenleme, beceri listesi.
- Ödüller: bilet cüzdanı (kullanılabilir/bekleyen/kullanılmış), haftalık bilet yolu (üç koşul ayrı), kalp, 30 gün ritim ızgarası, en uzun ritim, kazanım geçmişi.
- Ayarlar: ad, hareket tercihi, paylaşım izinleri, davet oluşturma, şifre değiştirme, çıkış (yerel veri temizlenir).
- PWA: manifest, ikonlar (geçici), service worker yalnızca statik kabuğu önbellekler; API yanıtları önbelleğe alınmaz. "Güncelleme hazır" uyarısı.
- Testler: 14 birim testi (XP/seviye/yüzde), 14 sunucu senaryosu (`supabase/tests/server_rules.sql`, §27: 2,3,4,5,7,11,12,14,16,17,18,36,39,45) gerçek veritabanında geçti; test geri alınarak çalışır.

**Henüz yapılmayan (dürüst liste)**

- Aşama 2: romantik beceri gönderme, kalple satın alma (aksesuar/dekor), ortak etkinlik öner/onayla, dekor yerleştirme. Tablolar ve katalog hazır; RPC'ler ve arayüz yok.
- Aşama 3: bilet kullanım isteği / partner onayı / 72 saat / geri alma; çift kural önerileri. Tablolar hazır, akış yok. Bilet **kazanma** çalışıyor.
- Aşama 4: çevrimdışı IndexedDB kuyruğu, Web Push, kurtarma kodları, cihaz oturumları listesi, dışa aktarma, hesap silme, çift bağlantısını kesme, plan düzenleme (gelecek Pazartesi), beslenme cezasını açma arayüzü, haftalık özet ekranı.
- Gerçek telefon testi (Android/iPhone kurulum) yapılmadı; yalnızca masaüstü tarayıcıda 375 px emülasyon.
- Görseller: tüm karakter, sahne, dekor ve ikonlar **geçici** (SVG/emoji yer tutucu). Katman sırası ve pivot kuralı `src/components/Avatar.tsx` içinde korunur; nihai sanat aynı yuvalara oturur.

## Şartnameden bilinçli sapmalar (teknik, README'de belirtilmesi istenen)

| Konu | Şartname | Burada | Neden |
|---|---|---|---|
| Yığın | Next.js + Prisma + Docker + ayrı worker | Vite/React statik PWA (GitHub Pages) + Supabase (Postgres, Auth, pg_cron) | Kullanıcı kararı: sunucu kiralamadan, ücretsiz katmanda. Sunucu otoritesi aynen korunur: tüm iş kuralları `SECURITY DEFINER` PostgreSQL fonksiyonlarında. |
| Oturum | HttpOnly cookie | Supabase Auth JWT, tarayıcı deposunda | Statik barındırmada cookie basacak sunucu yok. Çıkışta tüm yerel depo temizlenir. |
| Şifre hash | Argon2id | Supabase Auth (bcrypt) | Bakımı yapılan hazır bileşen; özel kripto yazılmadı. |
| Kullanıcı adı | Sadece kullanıcı adı | `kullaniciadi@birlikte.local` sentetik e-posta ile Supabase Auth; e-posta onayı kapalı | Gerçek e-posta toplanmaz. |
| Worker | Ayrı süreç | `pg_cron` her dakika `bb_run_jobs()` | Aynı garanti: uygulama kapalıyken de çalışır; gecikmiş günleri sırayla telafi eder. |
| Rate limit | Hesap+IP 5/15dk | Supabase Auth yerleşik sınırları | Dashboard'dan ayarlanabilir. |

Bilinen denetim notu: `npm audit` yalnızca derleme zamanı araçlarında (workbox-build bağımlılıkları) orta seviye uyarılar verir; telefona giden koda dahil değildir.

## Kurulum

1. Supabase projesi aç; `supabase/migrations/0001_schema.sql` dosyasını SQL Editor'de çalıştır (idempotent).
2. Auth → Sign In / Providers: **Confirm email kapalı**, Email → **Minimum password length 15**, "Require current password when updating" açık.
3. pg_cron: `create extension if not exists pg_cron; select cron.schedule('bb-jobs-minutely','* * * * *','select bb_run_jobs()');`
4. Kurulum anahtarı üret (yüksek entropili rastgele metin), SHA-256 hash'ini `setup_keys` tablosuna yaz. Düz anahtar yalnızca ilk kişiye verilir: `https://<site>/#/kurulum/<anahtar>`.
5. `.env.production` içine `VITE_SUPABASE_URL` ve `VITE_SUPABASE_KEY` (publishable key; herkese açık olması tasarım gereğidir, veriyi RLS korur).
6. `npm ci && npm test && npm run build`; `dist/` klasörünü `gh-pages` dalına yayınla (veya `docs/github-actions-deploy.yml.example` iş akışını `.github/workflows/` altına koy).

İkinci hesap: ilk kişi Ayarlar → "Davet bağlantısı oluştur" → bağlantıyı güvenli kanaldan gönderir (24 saat, tek kullanım).

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173/birlikte-buyuyoruz/
npm test
npm run build
npm run icons    # geçici ikonları yeniden üretir
```

Sunucu testleri: `supabase/tests/server_rules.sql` dosyasını iki test hesabı varken SQL Editor'de çalıştır; sonuçlar bilinçli bir exception mesajında listelenir ve tüm değişiklikler geri alınır.

## Yedek ve geri yükleme

Supabase ücretsiz planda otomatik günlük yedek yoktur. Önerilen: haftalık `pg_dump` (Supabase Dashboard → Database → Backups veya CLI). Şartnamedeki RPO/RTO hedefi bu planda **sağlanmamıştır**; Pro plana geçilirse günlük yedek ve PITR açılır.

## Gizlilik notu

Görev ve ibadet kayıtları hassas kabul edilir. Üçüncü taraf analitik, reklam SDK'sı ve oturum kaydı yoktur. Servis işletmecisi (Supabase, Frankfurt) teknik olarak veritabanına erişebilir; uçtan uca şifreleme yoktur. Partner API'si izin verilmeyen alanları hiç döndürmez (`get_couple`).
