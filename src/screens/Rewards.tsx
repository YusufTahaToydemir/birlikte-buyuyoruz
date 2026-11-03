import { useCallback, useEffect, useState } from 'react'
import { errorText, getCouple, getHistory, getRewards, getWeeklySummary, purchaseItem, requestReversal, requestTicket, respondRedemption, type HistoryData, type Me, type Redemption, type RewardsData, type WeeklySummary } from '../lib/api'
import { Button, Card, Dialog, Sheet, Spinner, toast } from '../components/ui'
import { formatDateTR, formatDateTimeTR, pct } from '../lib/time'
import { meetsPercent } from '../domain/xp'

const KIND_TR: Record<string, string> = { ACCESSORY: 'Aksesuar', HAND: 'Elde obje', EFFECT: 'Efekt', DECOR: 'Ortak dekor', OUTFIT: 'Kostüm' }
const ITEM_EMOJI: Record<string, string> = { acc_flower_brooch: '🌸', hand_book_cup: '📖☕', effect_glow: '✨', decor_potted_flower: '🪴', decor_cushion: '🛋️', decor_picnic_basket: '🧺', decor_light_chain: '💡' }
const CATEGORY_TR: Record<string, string> = { START: 'Gün başlangıcı', WORSHIP: 'İbadet ve maneviyat', LEARNING: 'Öğrenme', BODY: 'Beden ve bakım' }
const RED_STATUS_TR: Record<string, string> = { REQUESTED: 'Yanıt bekleniyor', APPROVED: 'Kullanıldı', DECLINED: 'Şimdi değil', WITHDRAWN: 'Vazgeçildi', EXPIRED: 'Süresi doldu', REVERSED: 'Geri alındı' }

export function Rewards({ me, onChange }: { me: Me; onChange: () => void }) {
  const [data, setData] = useState<RewardsData | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [gardenLevel, setGardenLevel] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<RewardsData['catalog'][number] | null>(null)
  const [ticketConfirm, setTicketConfirm] = useState<string | null>(null)
  const [weekOpen, setWeekOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => Promise.all([getRewards(), getHistory(30), getCouple()]).then(([r, h, c]) => { setData(r); setHistory(h); setGardenLevel(c.couple.gardenLevel) }).catch(e => setError(errorText(e))), [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [load])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); await load(); onChange() } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }

  if (error) return <Card><p className="text-warn" role="alert">{error}</p><Button className="mt-3" onClick={() => void load()}>Tekrar dene</Button></Card>
  if (!data || !history) return <Spinner />

  const r = data.rule
  const c1 = data.plannedXP >= r.minimumWeeklyPlannedXP
  const c2 = data.qualifyingDays >= r.minimumQualifyingDays
  const c3 = meetsPercent(data.grossXP, data.plannedXP, r.minimumWeeklyWeightedRatioPercent)
  const available = data.tickets.filter(t => t.status === 'AVAILABLE')
  const requested = data.tickets.filter(t => t.status === 'REQUESTED').length
  const used = data.tickets.filter(t => t.status === 'USED').length
  const coupleOwned = new Set(data.coupleInventory.map(i => i.itemId))
  const now = new Date(data.serverTime).getTime()
  const openReds = data.redemptions.filter(x => x.status === 'REQUESTED' && new Date(x.expiresAt).getTime() > now)
  const reversible = data.redemptions.filter(x => x.status === 'APPROVED' && now - new Date(x.resolvedAt ?? x.createdAt).getTime() < r.reversalWindowHours * 3600 * 1000)
  const pastReds = data.redemptions.filter(x => !openReds.includes(x) && !reversible.includes(x))

  const buy = async (item: RewardsData['catalog'][number]) => {
    setBusy(true)
    try { await purchaseItem(item.id); toast(`${item.name} edinildi.`); setConfirm(null); await load(); onChange() }
    catch (e) { toast(errorText(e)); setConfirm(null) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-2">Bilet cüzdanı <span className="text-[13px] font-normal text-ink-2">· kişisel</span></h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Kullanılabilir" value={available.length} highlight />
          <Stat label="Bekleyen" value={requested} />
          <Stat label="Kullanılmış" value={used} />
        </div>
        <p className="text-[13px] text-ink-2 mt-2">Biletin karşılığını uygulama tanımlamaz; aranızda belirlersiniz. Kullanım, ikinizin o anki onayına bağlıdır.</p>
        {data.partnerTickets && <p className="text-[13px] text-ink-2">Partnerin: {data.partnerTickets.available} kullanılabilir · {data.partnerTickets.used} kullanılmış</p>}

        {openReds.filter(x => x.partnerId === me.id).map(x => (
          <div key={x.id} className="mt-3 p-3 rounded-[14px] bg-ticket/30 border border-line">
            <p className="font-semibold">Partnerin bir bilet kullanım isteği gönderdi</p>
            <p className="text-[13px] text-ink-2 mb-2">{x.ticketWeek ? `${formatDateTR(x.ticketWeek, { day: 'numeric', month: 'long' })} haftasının bileti · ` : ''}yanıt süresi: {formatDateTimeTR(x.expiresAt)}</p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => void run(() => respondRedemption(x.id, 'approve'), 'Onaylandı; bilet kullanıldı.')}>Onayla</Button>
              <Button variant="soft" className="flex-1" disabled={busy} onClick={() => void run(() => respondRedemption(x.id, 'not_now'), 'Şimdi değil dendi; bilet kullanılabilir kaldı.')}>Şimdi değil</Button>
            </div>
          </div>
        ))}
        {openReds.filter(x => x.requestedBy === me.id).map(x => (
          <div key={x.id} className="mt-3 p-3 rounded-[14px] bg-soft border border-line">
            <p className="font-semibold">Kullanım isteğin gönderildi</p>
            <p className="text-[13px] text-ink-2 mb-2">Partnerin yanıtı bekleniyor. Yanıt gelmezse {formatDateTimeTR(x.expiresAt)} itibarıyla bilet kullanılabilir hâle döner; tüketilmez.</p>
            <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void run(() => respondRedemption(x.id, 'withdraw'), 'Vazgeçildi.')}>Vazgeç</Button>
          </div>
        ))}
        {reversible.map(x => {
          const iRequested = x.reversalRequestedBy === me.id
          const partnerRequested = x.reversalRequestedBy !== null && !iRequested
          return (
            <div key={x.id} className="mt-3 p-3 rounded-[14px] border border-line">
              <p className="font-semibold">Bilet kullanıldı · {formatDateTimeTR(x.resolvedAt ?? x.createdAt)}</p>
              <p className="text-[13px] text-ink-2 mb-2">24 saat içinde iki tarafın onayıyla bir kez geri alınabilir.{iRequested ? ' Geri alma isteğin partnerinin onayını bekliyor.' : partnerRequested ? ' Partnerin geri almak istiyor.' : ''}</p>
              {!iRequested && <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void run(() => requestReversal(x.id), partnerRequested ? 'Geri alındı; bilet kullanılabilir.' : 'Geri alma isteği gönderildi.')}>{partnerRequested ? 'Geri almayı onayla' : 'Kullanımı geri al'}</Button>}
            </div>
          )
        })}

        {available.length > 0 && (
          <ul className="mt-3 space-y-2">
            {available.map(t => (
              <li key={t.id} className="flex items-center gap-3 p-2 rounded-[14px] border border-line">
                <span className="w-12 h-8 rounded-[8px] bg-ticket flex items-center justify-center" aria-hidden="true">🎫</span>
                <div className="flex-1"><p className="font-semibold">Bilet</p><p className="text-[13px] text-ink-2">{formatDateTR(t.week, { day: 'numeric', month: 'long' })} haftası · süresiz</p></div>
                <Button className="min-h-[40px] px-3" disabled={busy || !me.couple.hasPartner || openReds.some(x => x.requestedBy === me.id)} onClick={() => setTicketConfirm(t.id)}>Kullanım isteği</Button>
              </li>
            ))}
          </ul>
        )}
        {pastReds.length > 0 && (
          <details className="mt-3">
            <summary className="text-[15px] font-semibold min-h-[44px] flex items-center cursor-pointer">Bilet geçmişi ({pastReds.length})</summary>
            <ul className="text-[13px] text-ink-2 space-y-1 mt-1">
              {pastReds.map(x => <li key={x.id}>{formatDateTimeTR(x.createdAt)} · {x.requestedBy === me.id ? 'senin biletin' : 'partnerinin bileti'} · {RED_STATUS_TR[x.status]}{x.reversedAt ? ` (${formatDateTimeTR(x.reversedAt)})` : ''}</li>)}
            </ul>
          </details>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Bu haftanın bilet yolu <span className="text-[13px] font-normal text-ink-2">· kişisel</span></h2>
        <p className="text-[13px] text-ink-2 mb-2">{formatDateTR(data.weekStart, { day: 'numeric', month: 'long' })} haftası · kesinleşme: {formatDateTimeTR(data.finalizesAt)}</p>
        {data.firstPartialWeek && <p className="text-[15px] mb-2">Hesap bu hafta açıldı. İlk kısmi haftada XP ve kalp kazanılır; bilet değerlendirmesi ilk tam Pazartesi–Pazar haftasında başlar.</p>}
        <ul className="space-y-2">
          <Cond ok={c1} text={`Planlanan XP en az ${r.minimumWeeklyPlannedXP}`} detail={`${data.plannedXP} XP planlandı (takip dışı hariç)`} />
          <Cond ok={c2} text={`En az ${r.minimumQualifyingDays} uygun gün`} detail={`${data.qualifyingDays} gün · uygun gün: planlı, en az ${r.minimumTrackedInstancesPerQualifyingDay} görev takipte, günlük %${r.minimumDailyRatioPercent}+`} />
          <Cond ok={c3} text={`Haftalık ağırlıklı başarı en az %${r.minimumWeeklyWeightedRatioPercent}`} detail={data.plannedXP > 0 ? `${pct(data.grossXP, data.plannedXP, 1)} · ${data.grossXP}/${data.plannedXP}${!c3 ? ` · %${r.minimumWeeklyWeightedRatioPercent} eşiğine henüz ulaşmadın` : ''}` : 'Henüz plan yok'} />
        </ul>
        <p className="text-[13px] text-ink-2 mt-2">Her hafta en fazla bir bilet. {c1 && c2 && c3 ? 'Koşullar şu an tamam; Pazartesi 12.00’dan sonra kesinleşecek.' : ''}{r.versionNo > 1 ? ` Çiftinizin kural sürümü ${r.versionNo}.` : ''}</p>
        <div className="flex gap-2 mt-3">
          <Button variant="soft" className="flex-1 min-h-[44px]" onClick={() => setWeekOpen(data.weekStart)}>Bu haftanın özeti</Button>
          <Button variant="soft" className="flex-1 min-h-[44px]" onClick={() => setWeekOpen(shiftWeek(data.weekStart, -7))}>Geçen hafta</Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Kalp <span className="text-[13px] font-normal text-ink-2">· kişisel</span></h2>
        <p className="text-2xl font-bold">💗 {data.hearts}</p>
        <p className="text-[13px] text-ink-2 mb-3">Kesinleşen aktif günlerde 2 kalp, %70 ve üstünde +3 kalp; haftanın ilk ortak etkinliğinde 5 kalp. Kalpler para ile alınmaz, devredilmez.</p>
        <h3 className="font-semibold mb-1">Katalog</h3>
        <ul className="space-y-2">
          {data.catalog.filter(c => c.kind !== 'OUTFIT').map(item => {
            const isDecor = item.kind === 'DECOR'
            const owned = isDecor ? coupleOwned.has(item.id) : data.inventory.includes(item.id)
            const locked = isDecor ? gardenLevel < item.requiredGardenLevel : me.totals.level < item.requiredLevel
            const lockText = isDecor ? `Ortak bahçe seviye ${item.requiredGardenLevel}’de açılır` : `Seviye ${item.requiredLevel}’de açılır`
            const canBuy = !owned && !locked && data.hearts >= item.price
            return (
              <li key={item.id} className={`flex items-center gap-3 p-2 rounded-[14px] border border-line ${locked ? 'opacity-60' : ''}`}>
                <span className="text-2xl w-10 text-center" aria-hidden="true">{ITEM_EMOJI[item.id] ?? '🎁'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{item.name} <span className="text-[13px] font-normal text-ink-2">· {KIND_TR[item.kind]}{isDecor ? ' (ortak)' : ' (kişisel)'}</span></p>
                  <p className="text-[13px] text-ink-2">{owned ? (isDecor ? 'Çiftinizde var' : 'Sende var') : locked ? lockText : `${item.price} kalp${data.hearts < item.price ? ' · yetersiz kalp' : ''}`}</p>
                </div>
                {owned ? <span className="text-success" aria-label="Edinilmiş">✓</span> : locked ? <span aria-hidden="true">🔒</span> : (
                  <Button className="min-h-[40px] px-3" disabled={busy || !canBuy} onClick={() => setConfirm(item)}>Al</Button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-2">Son 30 gün</h2>
        <div className="grid grid-cols-10 gap-1" role="list" aria-label="Günlük tamamlanma oranı">
          {history.days.map(d => {
            const ratio = d.plannedXP > 0 ? d.grossXP / d.plannedXP : null
            const bg = ratio === null ? 'bg-line' : ratio >= 0.7 ? 'bg-success' : ratio >= 0.6 ? 'bg-ticket' : ratio > 0 ? 'bg-soft' : 'bg-line'
            return <div key={d.id} role="listitem" className={`aspect-square rounded ${bg}`} title={`${d.date}: ${ratio === null ? 'nötr' : pct(d.grossXP, d.plannedXP)}`} aria-label={`${formatDateTR(d.date, { day: 'numeric', month: 'short' })}: ${ratio === null ? 'nötr' : pct(d.grossXP, d.plannedXP)}`} />
          })}
        </div>
        <p className="text-[13px] text-ink-2 mt-2">Yeşil %70+, sarı %60+, açık pembe başlanmış, gri nötr veya kayıtsız. Seri cezası yoktur; ritim gösterilir.</p>
        <p className="text-[15px] mt-2">En uzun ritim: {longestRhythm(history.days)} gün</p>
      </Card>

      <Card>
        <h2 className="font-bold mb-2">Kazanım geçmişi</h2>
        {history.ledger.length === 0 && history.hearts.length === 0 && <p className="text-[15px] text-ink-2">Henüz kayıt yok.</p>}
        <ul className="text-[15px] space-y-1 max-h-60 overflow-y-auto">
          {history.weeks.slice(0, 4).map(w => <li key={w.weekStart} className="flex justify-between"><span>{formatDateTR(w.weekStart, { day: 'numeric', month: 'short' })} haftası · {w.grossXP}/{w.plannedXP} · {w.qualifyingDays} uygun gün</span><span className={w.eligible ? 'text-success' : 'text-ink-2'}>{w.eligible ? '🎫 bilet' : 'bilet yok'}</span></li>)}
          {history.hearts.slice(0, 10).map((h, i) => <li key={`h${i}`} className="flex justify-between"><span>{formatDateTR(h.at, { day: 'numeric', month: 'short' })} · {HEART_TR[h.type] ?? h.type}</span><span className={h.delta >= 0 ? 'text-success' : 'text-warn'}>{h.delta > 0 ? '+' : ''}{h.delta} 💗</span></li>)}
          {history.ledger.slice(0, 20).map((l, i) => <li key={i} className="flex justify-between"><span>{formatDateTR(l.date, { day: 'numeric', month: 'short' })} · {LEDGER_TR[l.reason] ?? l.reason}</span><span className={l.delta >= 0 ? 'text-success' : 'text-warn'}>{l.delta > 0 ? '+' : ''}{l.delta} XP</span></li>)}
        </ul>
        <p className="text-[13px] text-ink-2 mt-2">Toplam XP: {me.totals.totalXP}</p>
      </Card>

      <Dialog open={confirm !== null} title="Satın alma onayı">
        {confirm && (
          <div className="space-y-3">
            <div className="text-4xl" aria-hidden="true">{ITEM_EMOJI[confirm.id] ?? '🎁'}</div>
            <p className="font-bold">{confirm.name}</p>
            <p className="text-[15px]">{confirm.price} kalp harcanacak. Satın alma geri alınmaz.{confirm.kind === 'DECOR' ? ' Dekor çiftinizin ortak sahnesine eklenir.' : ''}</p>
            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" disabled={busy} onClick={() => setConfirm(null)}>Vazgeç</Button>
              <Button className="flex-1" disabled={busy} onClick={() => void buy(confirm)}>{busy ? 'Alınıyor…' : 'Satın al'}</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={ticketConfirm !== null} title="Bilet kullanım isteği">
        <div className="space-y-3">
          <div className="mx-auto w-20 h-14 rounded-[12px] bg-ticket flex items-center justify-center text-3xl" aria-hidden="true">🎫</div>
          <p className="font-bold">Kullanım isteği gönder</p>
          <p className="text-[15px]">Bilet partnerinin yanıtına kadar rezerve edilir. Partnerin “Şimdi değil” derse ya da {r.requestExpiresHours} saat içinde yanıt gelmezse bilet kullanılabilir hâle döner; tüketilmez. Sen de her an vazgeçebilirsin.</p>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" disabled={busy} onClick={() => setTicketConfirm(null)}>Vazgeç</Button>
            <Button className="flex-1" disabled={busy} onClick={() => { const id = ticketConfirm!; setTicketConfirm(null); void run(() => requestTicket(id), 'İstek gönderildi.') }}>Gönder</Button>
          </div>
        </div>
      </Dialog>

      <Sheet open={weekOpen !== null} onClose={() => setWeekOpen(null)} title="Haftalık özet">
        {weekOpen && <WeekSummary weekStart={weekOpen} meId={me.id} />}
      </Sheet>
    </div>
  )
}

function WeekSummary({ weekStart }: { weekStart: string; meId: string }) {
  const [s, setS] = useState<WeeklySummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setS(null); getWeeklySummary(weekStart).then(setS).catch(e => setErr(errorText(e))) }, [weekStart])
  if (err) return <p className="text-warn">{err}</p>
  if (!s) return <Spinner />
  const t = s.totals
  const sentences: string[] = []
  if (t.days === 0) sentences.push('Bu haftaya ait kayıt yok.')
  else {
    sentences.push(`${t.activeDays} gün en az bir görev kaydettin${t.excusedDays > 0 ? `; ${t.excusedDays} gün takip dışıydı` : ''}.`)
    if (t.plannedXP > 0) sentences.push(`Planlanan ${t.plannedXP} XP’nin ${t.grossXP} XP’sini kazandın (${pct(t.grossXP, t.plannedXP, 1)}).`)
    for (const g of s.goals.slice(0, 3)) if (g.daysDone > 0) sentences.push(`${g.name} için ${g.daysDone} gün hedefe ulaştın.`)
    if (s.result) sentences.push(s.result.eligible ? 'Bu hafta bir bilet hakkı kazandın.' : `Bilet için ${s.result.qualifyingDays}/${s.rule.minimumQualifyingDays} uygun gün ve ${pct(s.result.grossXP, s.result.plannedXP, 1)} ile koşullar tamamlanmadı; bu, bir değer yargısı değildir.`)
    else if (s.isCurrent) sentences.push('Hafta sürüyor; sonuç Pazartesi 12.00’dan sonra kesinleşir.')
    else if (t.finalizedDays < 7) sentences.push('Haftanın bazı günleri henüz kesinleşmedi.')
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-2">{formatDateTR(s.weekStart, { day: 'numeric', month: 'long' })} – {formatDateTR(s.weekEnd, { day: 'numeric', month: 'long' })}</p>
      <ul className="space-y-1 text-[15px]">{sentences.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {s.categories.length > 0 && (
        <div>
          <h3 className="font-semibold mb-1">Kategoriler</h3>
          <ul className="space-y-1 text-[15px]">
            {s.categories.map(c => <li key={c.category} className="flex justify-between"><span>{CATEGORY_TR[c.category] ?? c.category}</span><span>{c.grossXP}/{c.plannedXP} XP · {c.completed}/{c.tracked}</span></li>)}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-7 gap-1" aria-label="Haftanın günleri">
        {s.days.map(d => {
          const ratio = d.plannedXP > 0 ? d.grossXP / d.plannedXP : null
          const bg = ratio === null ? 'bg-line' : ratio >= 0.7 ? 'bg-success text-white' : ratio >= 0.6 ? 'bg-ticket' : ratio > 0 ? 'bg-soft' : 'bg-line'
          return <div key={d.id} className={`rounded-[8px] p-1 text-center text-[13px] ${bg}`}>{formatDateTR(d.date, { weekday: 'short' })}<br />{ratio === null ? '–' : pct(d.grossXP, d.plannedXP)}</div>
        })}
      </div>
      <div className="p-3 rounded-[14px] bg-soft text-[15px]">
        <p className="font-semibold">Gelecek hafta tek küçük değişiklik</p>
        <p className="text-[13px] text-ink-2">Plan düzenleme bir sonraki sürümde; değişiklikler gelecek Pazartesi yürürlüğe girer.</p>
      </div>
    </div>
  )
}

function shiftWeek(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const HEART_TR: Record<string, string> = { DAILY_ACTIVE: 'Aktif gün', DAILY_RATIO: '%70 üstü gün', SHARED_ACTIVITY: 'Ortak etkinlik', PURCHASE: 'Satın alma' }
const LEDGER_TR: Record<string, string> = { 'TASK:set_value': 'Görev kaydı', 'TASK:set_completed': 'Görev tamamlandı', 'TASK:set_not_done': 'Yapılmadı kaydı', 'TASK:set_excused': 'Takip dışı', 'TASK:clear': 'Kayıt kaldırıldı', DAY_CLOSE: 'Gün kapanışı', EXCUSE_DAY: 'Gün takip dışı' }

function longestRhythm(days: HistoryData['days']): number {
  let best = 0, cur = 0
  for (const d of days) {
    if (d.plannedXP === 0) continue
    if (d.grossXP * 100 >= d.plannedXP * 60) { cur += 1; best = Math.max(best, cur) } else cur = 0
  }
  return best
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-[14px] p-2 ${highlight ? 'bg-ticket text-ink' : 'bg-soft'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[13px]">{label}</p>
    </div>
  )
}
function Cond({ ok, text, detail }: { ok: boolean; text: string; detail: string }) {
  return (
    <li className="flex gap-2 items-start">
      <span className={`mt-0.5 inline-flex w-6 h-6 rounded-full items-center justify-center text-sm shrink-0 ${ok ? 'bg-success text-white' : 'bg-soft text-ink-2'}`} aria-hidden="true">{ok ? '✓' : '·'}</span>
      <div><p className="text-[15px] font-semibold">{text} <span className="sr-only">{ok ? '(sağlandı)' : '(henüz değil)'}</span></p><p className="text-[13px] text-ink-2">{detail}</p></div>
    </li>
  )
}
export type { Redemption }
