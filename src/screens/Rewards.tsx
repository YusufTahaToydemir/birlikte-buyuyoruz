import { useCallback, useEffect, useState } from 'react'
import { errorText, getCouple, getHistory, getRewards, purchaseItem, type HistoryData, type Me, type RewardsData } from '../lib/api'
import { Button, Card, Dialog, Spinner, toast } from '../components/ui'
import { formatDateTR, formatDateTimeTR, pct } from '../lib/time'
import { meetsPercent } from '../domain/xp'

const KIND_TR: Record<string, string> = { ACCESSORY: 'Aksesuar', HAND: 'Elde obje', EFFECT: 'Efekt', DECOR: 'Ortak dekor', OUTFIT: 'Kostüm' }
const ITEM_EMOJI: Record<string, string> = { acc_flower_brooch: '🌸', hand_book_cup: '📖☕', effect_glow: '✨', decor_potted_flower: '🪴', decor_cushion: '🛋️', decor_picnic_basket: '🧺', decor_light_chain: '💡' }

export function Rewards({ me, onChange }: { me: Me; onChange: () => void }) {
  const [data, setData] = useState<RewardsData | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [gardenLevel, setGardenLevel] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<RewardsData['catalog'][number] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => Promise.all([getRewards(), getHistory(30), getCouple()]).then(([r, h, c]) => { setData(r); setHistory(h); setGardenLevel(c.couple.gardenLevel) }).catch(e => setError(errorText(e))), [])
  useEffect(() => { void load() }, [load])

  if (error) return <Card><p className="text-warn" role="alert">{error}</p><Button className="mt-3" onClick={() => void load()}>Tekrar dene</Button></Card>
  if (!data || !history) return <Spinner />

  const r = data.rule
  const c1 = data.plannedXP >= r.minimumWeeklyPlannedXP
  const c2 = data.qualifyingDays >= r.minimumQualifyingDays
  const c3 = meetsPercent(data.grossXP, data.plannedXP, r.minimumWeeklyWeightedRatioPercent)
  const available = data.tickets.filter(t => t.status === 'AVAILABLE').length
  const requested = data.tickets.filter(t => t.status === 'REQUESTED').length
  const used = data.tickets.filter(t => t.status === 'USED').length
  const coupleOwned = new Set(data.coupleInventory.map(i => i.itemId))

  const buy = async (item: RewardsData['catalog'][number]) => {
    setBusy(true)
    try {
      await purchaseItem(item.id)
      toast(`${item.name} edinildi.`)
      setConfirm(null)
      await load(); onChange()
    } catch (e) { toast(errorText(e)); setConfirm(null) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-2">Bilet cüzdanı <span className="text-[13px] font-normal text-ink-2">· kişisel</span></h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Kullanılabilir" value={available} highlight />
          <Stat label="Bekleyen" value={requested} />
          <Stat label="Kullanılmış" value={used} />
        </div>
        <p className="text-[13px] text-ink-2 mt-2">Biletin karşılığını uygulama tanımlamaz; aranızda belirlersiniz. Kullanım isteği ve partner onayı akışı Aşama 3’te açılacak.</p>
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
        <p className="text-[13px] text-ink-2 mt-2">Her hafta en fazla bir bilet. Pazar gecesi koşullar tamamsa “Pazartesi 12.00’dan sonra kesinleşecek”.</p>
        {data.lastWeek && (
          <p className="text-[15px] mt-2 pt-2 border-t border-line">
            Geçen hafta: {data.lastWeek.grossXP}/{data.lastWeek.plannedXP} XP · {data.lastWeek.qualifyingDays} uygun gün · {data.lastWeek.eligible ? 'bilet kazanıldı' : 'bilet yok'}
          </p>
        )}
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
    </div>
  )
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
