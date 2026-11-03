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

**Tamamlanan (Aşama 2, "oyun hissi")** — `supabase/migrations/0002_phase2.sql`

- Romantik beceriler (§11): seviyeyle açılır; beceri başına günde 1, toplam 3 (sunucuda sayılır); Kalpten Not 280 karakter, HTML etiketleri temizlenir; Piknik Daveti ortak etkinlik önerisi oluşturur. Alıcı tarafında “Sana gelenler”, sahnede çiçek.
- Kalple satın alma (§9): cüzdan satır kilidi, DB tekilliği, idempotency; ortak dekor çift başına bir kez (eşzamanlı ikinci istek ücret ödemeden “Zaten edinilmiş”); seviye ve bahçe seviyesi kontrolü sunucuda. Onay ekranı; geri alınmaz.
- Giydirme: kıyafet/baş/el/efekt yuvaları; sahiplik ve seviye kontrolü sunucuda; seviye düşerse takılı kıyafet başlangıca döner (`bb_effective_equipped`). “Dene” kalıcı değildir.
- Dekor sahneye yerleştirme/kaldırma (iki tarafça), anı defterine düşer.
- Ortak etkinlikler (§12): öner → kabul / başka zaman / vazgeç → iki ayrı “Yaptık” beyanı → COMPLETED; haftanın ilk tamamlanan etkinliğinde kişi başına 5 kalp (`activity:<user>:<hafta>` tekillik anahtarı); 48 saatte ikinci onay gelmezse cron UNCONFIRMED yapar; tamamlanan etkinlik değiştirilemez, gizlenebilir.
- Sunucu testleri (gerçek DB, geri alınarak): iki onay → tamamlandı ve 5'er kalp; haftanın ikinci etkinliğinde kalp yok; tekrar onay, tekrar satın alma, kilitli ürün, bahçe kilidi, yetersiz kalp, günlük beceri sınırı hataları.

**Tamamlanan (Aşama 3, "en değerli ödül")** — `supabase/migrations/0003_phase3.sql`

- Bilet kullanım akışı (§10.3): AVAILABLE → REQUESTED (bilet satır kilidi, aktif istek tekilliği kısmi unique index) → partner “Onayla” (USED) / “Şimdi değil” (AVAILABLE) / sahibi “Vazgeç”; 72 saat yanıtsız istek cron ile AVAILABLE; tekrar onay ikinci tüketim üretmez (mevcut durum döner). Kullanım sonrası 24 saat içinde iki tarafın onayıyla bir kez geri alma (`request_reversal` istek-ve-onay); pencere kapanınca `REVERSAL_WINDOW_CLOSED`.
- Çift kural önerileri (§10.1): aralık doğrulama (100–1400 / 1–7 / %1–100 / %1–100), çift başına tek açık öneri (yenisi eskisini düşürür), öneren onaylayamaz, onay sonrası **gelecek Pazartesi** yürürlük, sürüm numarası; haftalık değerlendirme o haftaya etkin sürümü kullanır (`bb_rule_for_week`), geçmiş haftalar yeniden değerlendirilmez. Haftada en fazla 1 bilet ve karşılıklı onay değiştirilemez.
- Haftalık özet (§14.7): kategori ve görev bazlı olgusal cümleler, uygun gün, bilet sonucu; partnerle kıyas yok. Bu hafta / geçen hafta görünümü.
- Bekleyen iş noktaları: Ödüller (onay bekleyen istek, geri alma), Biz (etkinlik), profil düğmesi (kural önerisi).
- Sunucu testleri (gerçek DB, geri alınarak): §27 no. 29, 30, 31, 32, 33 (+24 saat kapalı pencere), partnerin başkasının biletini isteyememesi, kural önerisi aralık/teklik/yetki/yürürlük.

**Tamamlanan (Aşama 4, "telefonda güvenilir kullanım")** — `supabase/migrations/0004_phase4.sql`, `src/lib/offline.ts`

- Çevrimdışı kayıt kuyruğu (§22): IndexedDB; görev değerleri kuyruğa yazılır, özel notlar alınmaz; satırda “cihazda kaydedildi · gönderilmeyi bekliyor”, XP önizlemesi `*` ile ayrılır. Aynı görevin bekleyen düzenlemeleri son değere birleşir, gönderimi başlamış olan değiştirilmez (birim testli). Bağlantı gelince sırayla gönderim; `DAY_LOCKED` → “süre dolduğu için gönderilemedi” kutusu (geçmişe yazılmaz); `REVISION_CONFLICT` → sunucudaki/cihazdaki değer karşılaştırması ve seçim. Son senkronize Bugün kopyası çevrimdışı gösterilir. Çıkışta kuyruk ve önbellek silinir; bekleyen kayıt varsa uyarı.
- Plan düzenleme (§5): hedef/XP/gün/tür/kontrol listesi/ceza değişiklikleri **gelecek Pazartesi** sürümü olarak kaydedilir (`save_next_week_plan`), aktif hafta değişmez; sınırlar (20 görev, günde 200 XP, şablon 1–20 XP) sessizce kırpılmaz, hangi sınırın aşıldığı söylenir; ad/açıklama/ikon hemen (`rename_goal`); görev bırakma bugünden Pazar’a kadar takip dışı (`pause_goal`, kalan günler EXCUSED üretilir, geçmiş kopyalar silinmez); yeni özel görev eklenir.
- Kurtarma kodları (§24): 8 tek kullanımlık kod, yalnızca bir kez gösterilir, hash saklanır; oturumsuz `recover_with_code`: kullanıcı adı+kod, 15 dakikada 5 deneme (başarısız deneme kalıcı kaydedilir), kullanıcı varlığını açığa çıkarmaz, şifre 15–128, tüm oturumları kapatır.
- Cihaz oturumları: listeleme, tekil kapatma, “diğer tüm oturumları kapat”; şifre değişiminde diğer oturumlar kapanır.
- Dışa aktarma (§25): JSON ve CSV, yeniden şifre doğrulamasıyla; notlar yalnızca istenirse; partner verisi yok; CSV formül enjeksiyonu koruması.
- Çift bağlantısını kesme (§25): bekleyen bilet istekleri iptal, kalan biletler arşiv (`ARCHIVED`), ortak öneriler kapanır, ayrılan kişi tek kişilik alanında devam eder; partnerin verisi silinmez.
- Hesap silme (§25): yeniden doğrulama + “SİL” onayı; kişisel veriler cascade ile silinir, ortak metinsiz kayıtlarda (etkinlik, dekor, kural) kimlik NULL olur.
- Sunucu testleri (gerçek DB, geri alınarak): plan sınırları (günlük 200, şablon XP), değişikliğin gelecek haftaya etkisi (no. 44), görev bırakma, kurtarma (8 kod, aynı hata, kısa şifre, tek kullanım, hız sınırı), export kapsamı, ayrılma, hesap silme (no. 49).

**Henüz yapılmayan (dürüst liste)**

- **Web Push** (§23): VAPID anahtarı ve gönderim için sunucu tarafı (Supabase Edge Function + pg_net) gerekir; bu dağıtım CLI erişim token’ı ister ve kurulmadı. Bildirim tercihleri arayüzü bu yüzden eklenmedi; bildirimler kapalı, uygulama bunu açıkça söyler.
- **Gerçek telefon testi** (Android/iPhone kurulum, Web Push, arka plan davranışı) yapılmadı; yalnızca masaüstü tarayıcıda 375 px emülasyon ve fetch engelleyerek çevrimdışı simülasyonu.
- Yedekleme: ücretsiz planda otomatik yedek yok (bkz. aşağı).
- Plan sürümü değişikliklerinde hatırlatma ayarı (§5 “hatırlatma”) Web Push’a bağlı olduğundan yok.
- Görseller: tüm karakter, sahne, dekor ve ikonlar **geçici** (SVG/emoji yer tutucu). Katman sırası ve pivot kuralı `src/components/Avatar.tsx` içinde korunur; nihai sanat aynı yuvalara oturur.
- Çift kural önerisi ve plan düzenleme dışında kalan “sonraki sürüm” notları: saat dilimi değiştirme, yeni çiftle birleştirme, zamanlayıcı, namaz vakti bildirimi (şartnamede ilk sürüm dışı).

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

1. Supabase projesi aç; `supabase/migrations/` altındaki dosyaları sırayla SQL Editor'de çalıştır (idempotent).
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
