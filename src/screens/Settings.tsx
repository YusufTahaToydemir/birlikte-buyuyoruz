import { useEffect, useState } from 'react'
import { changePassword, createInvite, csvCell, deleteAccount, disconnectCouple, errorText, exportMyData, generateRecoveryCodes, getRewards, listSessions, proposeRule, reauthenticate, recoveryCodesStatus, respondRule, revokeOtherSessions, revokeSession, signOut, updateProfile, updateSharing, type DeviceSession, type Me, type RewardsData } from '../lib/api'
import { Button, Dialog, Field, Sheet, toast } from '../components/ui'
import { formatDateTimeTR, formatDateTR } from '../lib/time'
import { queue } from '../lib/offline'
import { PlanEditor } from './PlanEditor'

export function Settings({ open, onClose, me, onChange }: { open: boolean; onClose: () => void; me: Me; onChange: () => void }) {
  const [displayName, setDisplayName] = useState(me.displayName)
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', next2: '' })
  const [planOpen, setPlanOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState<number | null>(null)

  const inviteUrl = invite ? `${window.location.origin}${window.location.pathname}#/davet/${invite.token}` : null

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); onChange() } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }

  const doSignOut = async () => {
    const pending = (await queue.all(me.id)).filter(o => o.status === 'pending' || o.status === 'sending').length
    if (pending > 0) { setSignOutConfirm(pending); return }
    await signOut()
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
          <h3 className="font-bold">Görev planı</h3>
          <p className="text-[13px] text-ink-2">Hedefleri, XP’yi, günleri ve beslenme cezasını düzenle; görev bırak; yeni görev ekle.</p>
          <Button variant="soft" className="min-h-[40px]" onClick={() => setPlanOpen(true)}>Planı düzenle</Button>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Şifre</h3>
          <Field label="Mevcut şifre"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} /></Field>
          <Field label="Yeni şifre" hint="6–128 karakter"><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} /></Field>
          <Field label="Yeni şifre (tekrar)"><input className="input" type="password" autoComplete="new-password" value={pw.next2} onChange={e => setPw(p => ({ ...p, next2: e.target.value }))} /></Field>
          <Button variant="soft" disabled={busy || pw.next.length < 6 || pw.next !== pw.next2 || !pw.current} onClick={() => void run(async () => { await changePassword(pw.current, pw.next, me.username); await revokeOtherSessions().catch(() => undefined); setPw({ current: '', next: '', next2: '' }) }, 'Şifre değiştirildi; diğer oturumlar kapatıldı.')}>Şifreyi değiştir</Button>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Kurallar</h3>
          <ul className="text-[13px] text-ink-2 list-disc pl-4 space-y-1">
            <li>Gün 00.00’da kapanır; önceki gün ertesi 12.00’a kadar düzeltilebilir.</li>
            <li>Bilet: haftada en fazla 1; kullanım yalnızca karşılıklı onayla. Bu ikisi değiştirilemez.</li>
            <li>Hedef, XP, gün ve ceza değişiklikleri gelecek Pazartesi yürürlüğe girer; ad ve açıklama hemen.</li>
            <li>Beslenme cezası varsayılan kapalı; görev planından açılır ve yalnızca “planıma uymadı” kaydında işler.</li>
          </ul>
        </section>

        {open && me.couple.hasPartner && <RuleSection me={me} onChange={onChange} />}

        {open && <RecoverySection />}
        {open && <SessionsSection />}
        {open && <DataSection me={me} />}

        <section className="space-y-2">
          <h3 className="font-bold">Bildirimler</h3>
          <p className="text-[13px] text-ink-2">Bildirimler varsayılan olarak kapalıdır. Web Push bu sürümde henüz etkin değil; 06.30 için telefonunun kendi alarmını kullanman önerilir.</p>
        </section>

        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void doSignOut()}>Çıkış yap</Button>
      </div>

      <Sheet open={planOpen} onClose={() => setPlanOpen(false)} title="Görev planı">
        {planOpen && <PlanEditor onChange={onChange} />}
      </Sheet>

      <Dialog open={signOutConfirm !== null} title="Gönderilmemiş kayıtlar var">
        <div className="space-y-3">
          <p className="font-bold">{signOutConfirm} kayıt henüz gönderilmedi</p>
          <p className="text-[15px]">Çıkış yaparsan bu cihazdaki bekleyen kayıtlar silinir. Bağlantı gelince göndermek için çıkışı erteleyebilirsin.</p>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setSignOutConfirm(null)}>Vazgeç</Button>
            <Button className="flex-1" onClick={() => void signOut()}>Yine de çık</Button>
          </div>
        </div>
      </Dialog>
    </Sheet>
  )
}

function RecoverySection() {
  const [status, setStatus] = useState<{ unused: number; used: number; createdAt: string | null } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { recoveryCodesStatus().then(setStatus).catch(() => undefined) }, [])
  return (
    <section className="space-y-2">
      <h3 className="font-bold">Kurtarma kodları</h3>
      <p className="text-[13px] text-ink-2">Şifreni unutursan bu kodlardan biriyle yeni şifre belirlersin. Her kod tek kullanımlıktır ve yalnızca bir kez gösterilir; güvenli bir yere yaz. E-posta istenmez.</p>
      {status && <p className="text-[13px] text-ink-2">{status.unused} kullanılmamış · {status.used} kullanılmış{status.createdAt ? ` · üretildi: ${formatDateTimeTR(status.createdAt)}` : ''}</p>}
      {codes ? (
        <div className="p-3 rounded-[14px] bg-soft">
          <ul className="grid grid-cols-2 gap-1 font-mono text-[15px]">{codes.map(c => <li key={c}>{c}</li>)}</ul>
          <p className="text-[13px] text-warn mt-2">Bu kodlar bir daha gösterilmeyecek.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="soft" className="min-h-[40px]" onClick={() => { navigator.clipboard?.writeText(codes.join('\n')).then(() => toast('Kopyalandı.')).catch(() => toast('Kopyalanamadı.')) }}>Kopyala</Button>
            <Button className="min-h-[40px]" onClick={() => setCodes(null)}>Kaydettim</Button>
          </div>
        </div>
      ) : (
        <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={async () => { setBusy(true); try { const r = await generateRecoveryCodes(); setCodes(r.codes); setStatus(await recoveryCodesStatus()) } catch (e) { toast(errorText(e)) } finally { setBusy(false) } }}>
          {status && status.unused > 0 ? 'Kodları yenile (eskileri geçersiz olur)' : 'Kurtarma kodları oluştur'}
        </Button>
      )}
    </section>
  )
}

function SessionsSection() {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => listSessions().then(setSessions).catch(() => setSessions([]))
  useEffect(() => { void load() }, [])
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast(ok); await load() } catch (e) { toast(errorText(e)) } finally { setBusy(false) } }
  return (
    <section className="space-y-2">
      <h3 className="font-bold">Cihaz oturumları</h3>
      {!sessions && <p className="text-[13px] text-ink-2">Yükleniyor…</p>}
      <ul className="space-y-1 text-[15px]">
        {sessions?.map(s => (
          <li key={s.id} className="flex items-center justify-between gap-2 min-h-[44px]">
            <span className="min-w-0"><span className="block truncate">{describeAgent(s.userAgent)}{s.current ? ' · bu cihaz' : ''}</span><span className="block text-[13px] text-ink-2">son kullanım {formatDateTimeTR(s.lastUsedAt)}</span></span>
            {!s.current && <Button variant="soft" className="min-h-[40px] px-3" disabled={busy} onClick={() => void run(() => revokeSession(s.id), 'Oturum kapatıldı.')}>Kapat</Button>}
          </li>
        ))}
      </ul>
      {sessions && sessions.length > 1 && <Button variant="ghost" className="min-h-[40px]" disabled={busy} onClick={() => void run(revokeOtherSessions, 'Diğer oturumlar kapatıldı.')}>Diğer tüm oturumları kapat</Button>}
    </section>
  )
}

function describeAgent(ua: string): string {
  if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows bilgisayar'
  if (/Macintosh/.test(ua)) return 'Mac'
  return ua ? 'Tarayıcı' : 'Cihaz'
}

function DataSection({ me }: { me: Me }) {
  const [mode, setMode] = useState<null | 'export' | 'disconnect' | 'delete'>(null)
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const close = () => { setMode(null); setPassword(''); setConfirmText('') }

  const doExport = async (fmt: 'json' | 'csv') => {
    setBusy(true)
    try {
      await reauthenticate(me.username, password)
      const data = await exportMyData(notes)
      let blob: Blob; let name: string
      if (fmt === 'json') { blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); name = `birlikte-${me.username}.json` }
      else {
        const rows: string[] = [['tarih', 'görev', 'hedef', 'birim', 'değer', 'durum', 'xp', 'maxXP', ...(notes ? ['not'] : [])].join(',')]
        for (const d of (data.days as Array<{ date: string; tasks: Array<Record<string, unknown>> }>)) for (const t of d.tasks) {
          rows.push([d.date, t.name, t.target, t.unit, t.value ?? '', t.status, t.earnedXP, t.maxXP, ...(notes ? [t.note ?? ''] : [])].map(csvCell).join(','))
        }
        blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }); name = `birlikte-${me.username}.csv`
      }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
      toast('Dışa aktarıldı.'); close()
    } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }
  const doDisconnect = async () => {
    setBusy(true)
    try { await reauthenticate(me.username, password); await disconnectCouple(); toast('Çift bağlantısı kesildi.'); close(); window.location.reload() }
    catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }
  const doDelete = async () => {
    setBusy(true)
    try { await reauthenticate(me.username, password); await deleteAccount(); await signOut() }
    catch (e) { toast(errorText(e)); setBusy(false) }
  }

  return (
    <section className="space-y-2">
      <h3 className="font-bold">Veri ve hesap</h3>
      <p className="text-[13px] text-ink-2">Verileriniz Supabase (Frankfurt) üzerinde saklanır; servis işletmecisi teknik olarak veritabanına erişebilir. Uçtan uca şifreleme yoktur. Bu işlemler şifrenle yeniden doğrulama ister.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" className="min-h-[40px]" onClick={() => setMode('export')}>Verimi dışa aktar</Button>
        {me.couple.hasPartner && <Button variant="soft" className="min-h-[40px]" onClick={() => setMode('disconnect')}>Çift bağlantısını kes</Button>}
        <Button variant="ghost" className="min-h-[40px] text-warn" onClick={() => setMode('delete')}>Hesabımı sil</Button>
      </div>

      <Dialog open={mode !== null} title={mode === 'export' ? 'Dışa aktar' : mode === 'disconnect' ? 'Çift bağlantısını kes' : 'Hesabı sil'}>
        <div className="space-y-3 text-left">
          {mode === 'export' && (
            <>
              <h3 className="text-lg font-bold">Verimi dışa aktar</h3>
              <p className="text-[15px]">Yalnızca kendi görev geçmişin, XP ve kalp defterin, biletlerin. Partnerinin verisi dahil edilmez.</p>
              <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="w-5 h-5" checked={notes} onChange={e => setNotes(e.target.checked)} /> Özel notlarımı da ekle</label>
            </>
          )}
          {mode === 'disconnect' && (
            <>
              <h3 className="text-lg font-bold">Çift bağlantısını kes</h3>
              <p className="text-[15px]">Karşılıklı erişim hemen biter. Gönderilmemiş bilet istekleri iptal olur; kalan biletlerin kişisel arşive alınır ve bu çiftte kullanılamaz. Partnerinin özel verisi silinmez. Kişisel görev takibin ve kıyafetlerin devam eder; ortak bahçe anı görünümüne geçer. Yeni çiftle birleştirme bu sürümde yoktur. Partnerinin onayı gerekmez.</p>
            </>
          )}
          {mode === 'delete' && (
            <>
              <h3 className="text-lg font-bold text-warn">Hesabı sil</h3>
              <p className="text-[15px]">Notların, görevlerin, oturumların ve kişisel verin canlı sistemden silinir. Ortak etkinlik ve dekor gibi metinsiz ortak kayıtlarda kimliğin kaldırılır; partnerinin verisi korunur. Bu işlem geri alınamaz.</p>
              <Field label="Onaylamak için SİL yaz"><input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} /></Field>
            </>
          )}
          <Field label="Şifren"><input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
          <div className="flex gap-2 flex-wrap">
            <Button variant="soft" className="flex-1" disabled={busy} onClick={close}>Vazgeç</Button>
            {mode === 'export' && <Button className="flex-1" disabled={busy || !password} onClick={() => void doExport('json')}>JSON</Button>}
            {mode === 'export' && <Button className="flex-1" disabled={busy || !password} onClick={() => void doExport('csv')}>CSV</Button>}
            {mode === 'disconnect' && <Button className="flex-1" disabled={busy || !password} onClick={() => void doDisconnect()}>Bağlantıyı kes</Button>}
            {mode === 'delete' && <Button className="flex-1" disabled={busy || !password || confirmText.trim() !== 'SİL'} onClick={() => void doDelete()}>Hesabı sil</Button>}
          </div>
        </div>
      </Dialog>
    </section>
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
