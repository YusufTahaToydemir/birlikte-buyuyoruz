import { useEffect, useState } from 'react'
import { changePassword, createInvite, errorText, getRewards, proposeRule, respondRule, signOut, updateProfile, updateSharing, type Me, type RewardsData } from '../lib/api'
import { Button, Field, Sheet, toast } from '../components/ui'
import { formatDateTimeTR, formatDateTR } from '../lib/time'

export function Settings({ open, onClose, me, onChange }: { open: boolean; onClose: () => void; me: Me; onChange: () => void }) {
  const [displayName, setDisplayName] = useState(me.displayName)
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', next2: '' })

  const inviteUrl = invite ? `${window.location.origin}${window.location.pathname}#/davet/${invite.token}` : null

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); onChange() } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ayarlar">
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="font-bold">Profil</h3>
          <p className="text-[13px] text-ink-2">Kullanıcı adı: {me.username}</p>
          <Field label="Görünen ad"><input className="input" maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} /></Field>
          <Button variant="soft" disabled={busy || displayName.trim() === me.displayName} onClick={() => void run(() => updateProfile({ displayName }), 'Ad güncellendi.')}>Kaydet</Button>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Görünüm ve hareket</h3>
          <div className="flex gap-2 flex-wrap">
            {([['SYSTEM', 'Sistem ayarı'], ['REDUCED', 'Azaltılmış hareket'], ['FULL', 'Tam']] as const).map(([v, t]) => (
              <button key={v} aria-pressed={me.profile.motion === v} className={`btn min-h-[44px] ${me.profile.motion === v ? 'btn-primary' : 'btn-soft'}`} disabled={busy} onClick={() => void run(() => updateProfile({ motion: v }))}>{t}</button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Mahremiyet · partnerinle paylaş</h3>
          <Toggle label="Günlük toplam yüzde" checked={me.sharing.dailyTotal} disabled={busy} onChange={v => void run(() => updateSharing({ dailyTotal: v }))} />
          <Toggle label="Kalp bakiyesi" checked={me.sharing.hearts} disabled={busy} onChange={v => void run(() => updateSharing({ hearts: v }))} />
          <Toggle label="Bilet bakiyesi" checked={me.sharing.ticketBalance} disabled={busy} onChange={v => void run(() => updateSharing({ ticketBalance: v }))} />
          <p className="text-[13px] text-ink-2">Tek tek görevler, ibadet ayrıntıları ve özel notlar hiçbir zaman paylaşılmaz. Paylaşımı kapatınca partnerinin uygulaması yenilemede eski kopyayı temizler; daha önce alınmış ekran görüntüleri geri çekilemez.</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Çift bağlantısı</h3>
          {me.couple.hasPartner ? <p className="text-[15px]">Partnerin bağlı.</p> : (
            <>
              <p className="text-[15px] text-ink-2">24 saat geçerli, tek kullanımlık davet bağlantısı oluştur ve partnerine güvenli bir kanaldan gönder. Yeni bağlantı eskisini geçersiz kılar.</p>
              {me.couple.pendingInvite && !invite && <p className="text-[13px] text-ink-2">Açık davet var · son: {formatDateTimeTR(me.couple.pendingInvite.expiresAt)}</p>}
              <Button variant="soft" disabled={busy} onClick={() => void run(async () => setInvite(await createInvite()))}>Davet bağlantısı oluştur</Button>
              {inviteUrl && (
                <div className="space-y-2">
                  <textarea readOnly className="input py-2 text-[13px] min-h-[72px]" value={inviteUrl} onFocus={e => e.currentTarget.select()} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => { navigator.clipboard?.writeText(inviteUrl).then(() => toast('Kopyalandı.')).catch(() => toast('Kopyalanamadı; metni seçip kopyala.')) }}>Kopyala</Button>
                    {typeof navigator.share === 'function' && <Button variant="soft" className="flex-1" onClick={() => navigator.share({ title: 'Birlikte Büyüyoruz daveti', url: inviteUrl }).catch(() => undefined)}>Paylaş</Button>}
                  </div>
                  <p className="text-[13px] text-ink-2">Bu bağlantı yalnızca bir kez gösterilir.</p>
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Şifre</h3>
          <Field label="Mevcut şifre"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} /></Field>
          <Field label="Yeni şifre" hint="15–128 karakter"><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} /></Field>
          <Field label="Yeni şifre (tekrar)"><input className="input" type="password" autoComplete="new-password" value={pw.next2} onChange={e => setPw(p => ({ ...p, next2: e.target.value }))} /></Field>
          <Button variant="soft" disabled={busy || pw.next.length < 15 || pw.next !== pw.next2 || !pw.current} onClick={() => void run(async () => { await changePassword(pw.current, pw.next, me.username); setPw({ current: '', next: '', next2: '' }) }, 'Şifre değiştirildi.')}>Şifreyi değiştir</Button>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Kurallar</h3>
          <ul className="text-[13px] text-ink-2 list-disc pl-4 space-y-1">
            <li>Gün 00.00’da kapanır; önceki gün ertesi 12.00’a kadar düzeltilebilir.</li>
            <li>Bilet: haftada en fazla 1; kullanım yalnızca karşılıklı onayla. Bu ikisi değiştirilemez.</li>
            <li>Plan değişiklikleri gelecek Pazartesi yürürlüğe girer (bu sürümde yalnızca ilk kurulumda düzenlenir).</li>
            <li>Beslenme cezası varsayılan kapalı (bu sürümde açma arayüzü yok).</li>
          </ul>
        </section>

        {open && me.couple.hasPartner && <RuleSection me={me} onChange={onChange} />}

        <section className="space-y-2">
          <h3 className="font-bold">Veri</h3>
          <p className="text-[13px] text-ink-2">Dışa aktarma, bildirimler, kurtarma kodları, cihaz oturumları ve hesap silme Aşama 4’te eklenecek. Şimdilik bu işlemler için kurulumu yapan kişiye ulaş.</p>
          <p className="text-[13px] text-ink-2">Verileriniz Supabase (Frankfurt) üzerinde saklanır; servis işletmecisi teknik olarak veritabanına erişebilir.</p>
        </section>

        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void signOut()}>Çıkış yap</Button>
      </div>
    </Sheet>
  )
}

function RuleSection({ me, onChange }: { me: Me; onChange: () => void }) {
  const [data, setData] = useState<RewardsData | null>(null)
  const [form, setForm] = useState({ minimumWeeklyPlannedXP: 500, minimumQualifyingDays: 5, minimumDailyRatioPercent: 60, minimumWeeklyWeightedRatioPercent: 70 })
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = () => getRewards().then(d => { setData(d); const r = d.nextWeekRule; setForm({ minimumWeeklyPlannedXP: r.minimumWeeklyPlannedXP, minimumQualifyingDays: r.minimumQualifyingDays, minimumDailyRatioPercent: r.minimumDailyRatioPercent, minimumWeeklyWeightedRatioPercent: r.minimumWeeklyWeightedRatioPercent }) }).catch(e => toast(errorText(e)))
  useEffect(() => { void load() }, [])
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); await load(); onChange() } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }
  if (!data) return null
  const r = data.rule
  const p = data.pendingRule
  const mine = p?.proposedBy === me.id
  const num = (k: keyof typeof form, min: number, max: number, label: string) => (
    <label className="flex items-center justify-between gap-2 text-[15px] min-h-[44px]">
      <span>{label}</span>
      <input type="number" className="input max-w-[110px] min-h-[40px]" min={min} max={max} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: Number(e.target.value) }))} />
    </label>
  )
  return (
    <section className="space-y-2">
      <h3 className="font-bold">Bilet eşikleri <span className="text-[13px] font-normal text-ink-2">· ileri ayar</span></h3>
      <p className="text-[13px] text-ink-2">Bu hafta geçerli: plan en az {r.minimumWeeklyPlannedXP} XP · {r.minimumQualifyingDays} uygun gün · günlük %{r.minimumDailyRatioPercent} · haftalık %{r.minimumWeeklyWeightedRatioPercent}{r.versionNo > 1 ? ` (sürüm ${r.versionNo})` : ' (varsayılan)'}.
        {data.nextWeekRule.versionNo !== r.versionNo ? ` Gelecek haftadan itibaren: plan ${data.nextWeekRule.minimumWeeklyPlannedXP} · ${data.nextWeekRule.minimumQualifyingDays} gün · günlük %${data.nextWeekRule.minimumDailyRatioPercent} · haftalık %${data.nextWeekRule.minimumWeeklyWeightedRatioPercent}.` : ''}</p>
      {p && (
        <div className="p-3 rounded-[14px] bg-soft text-[15px]">
          <p className="font-semibold">{mine ? 'Önerin partnerinin onayını bekliyor' : 'Partnerin yeni eşikler önerdi'}</p>
          <p className="text-[13px] text-ink-2">Plan {p.rule.minimumWeeklyPlannedXP} XP · {p.rule.minimumQualifyingDays} uygun gün · günlük %{p.rule.minimumDailyRatioPercent} · haftalık %{p.rule.minimumWeeklyWeightedRatioPercent} · {formatDateTimeTR(p.createdAt)}. Onaylanırsa sonraki Pazartesi ({formatDateTR(data.weekStart, { day: 'numeric', month: 'long' })} haftasından sonra) geçerli olur; geçmiş haftalar yeniden değerlendirilmez.</p>
          <div className="flex gap-2 mt-2">
            {mine ? <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void run(() => respondRule(p.id, 'withdraw'), 'Öneri geri çekildi.')}>Geri çek</Button> : (
              <>
                <Button className="min-h-[40px]" disabled={busy} onClick={() => void run(() => respondRule(p.id, 'approve'), 'Onaylandı; gelecek Pazartesi geçerli.')}>Onayla</Button>
                <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void run(() => respondRule(p.id, 'reject'), 'Reddedildi; mevcut kural sürüyor.')}>Reddet</Button>
              </>
            )}
          </div>
        </div>
      )}
      {!editing && <Button variant="soft" className="min-h-[40px]" onClick={() => setEditing(true)}>{p ? 'Yeni öneri (eskisini değiştirir)' : 'Değişiklik öner'}</Button>}
      {editing && (
        <div className="space-y-1">
          {num('minimumWeeklyPlannedXP', 100, 1400, 'Haftalık plan en az (XP)')}
          {num('minimumQualifyingDays', 1, 7, 'Uygun gün sayısı')}
          {num('minimumDailyRatioPercent', 1, 100, 'Günlük oran (%)')}
          {num('minimumWeeklyWeightedRatioPercent', 1, 100, 'Haftalık oran (%)')}
          <p className="text-[13px] text-ink-2">Aynı anda tek açık öneri olur; yeni öneri eski onayları siler. Partnerin onaylayana kadar mevcut kural sürer.</p>
          <div className="flex gap-2">
            <Button variant="soft" className="min-h-[40px]" onClick={() => setEditing(false)}>Vazgeç</Button>
            <Button className="min-h-[40px]" disabled={busy} onClick={() => void run(async () => { await proposeRule(form); setEditing(false) }, 'Öneri gönderildi.')}>Öner</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between min-h-[44px] text-[15px]">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="w-6 h-6" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}
