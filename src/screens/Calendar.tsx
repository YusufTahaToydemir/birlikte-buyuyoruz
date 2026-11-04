// Takvim: ay görünümü, her gün bir piksel kare (sol yarı ben, sağ yarı eşim). Güne dokununca o günün görevleri.
import { useEffect, useState } from 'react'
import { getCalendar, getDay, type Calendar as Cal, type CalendarDay, type DayDetail, type DayQuest } from '../lib/game'
import { Icon, Portrait } from '../game/Sprite'
import { sfx } from '../game/sfx'
import { Sheet, toastError, useGame } from '../game/ui'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const DOW = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Gün rengi: altın = kombo, yeşil = tam gün, mavi = izin, kırmızı = eksik, gri = henüz yok */
function dayColor(d: CalendarDay | undefined, today: string): string | null {
  if (!d) return null
  if (!d.closed) return d.d === today ? (d.done === d.total && d.total > 0 ? '#5bd17c' : '#3b2f5e') : null
  if (d.combo) return '#ffcc3a'
  if (d.allDone) return '#5bd17c'
  if (d.izin) return '#4cc9f0'
  return d.done > 0 ? '#c94a5e' : '#8a2f44'
}

export function CalendarPanel() {
  const { game } = useGame()
  const me = game.hero!
  const partner = game.partner
  const [month, setMonth] = useState(() => { const t = new Date(game.today + 'T00:00:00'); return new Date(t.getFullYear(), t.getMonth(), 1) })
  const [cal, setCal] = useState<Cal | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const key = iso(month)

  useEffect(() => { let on = true; getCalendar(key).then(c => { if (on) setCal(c) }).catch(toastError); return () => { on = false } }, [key, game.quests])
  useEffect(() => { if (!sel) { setDetail(null); return } let on = true; getDay(sel).then(d => { if (on) setDetail(d) }).catch(toastError); return () => { on = false } }, [sel])

  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const lead = (first.getDay() + 6) % 7
  const nDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const mine = new Map((cal?.me ?? []).map(d => [d.d, d]))
  const theirs = new Map((cal?.partner ?? []).map(d => [d.d, d]))
  const today = cal?.today ?? game.today
  const canNext = iso(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <= today
  const canPrev = !cal?.firstDay || iso(month) > cal.firstDay.slice(0, 8) + '01'
  const shift = (n: number) => { sfx.tab(); setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1)) }

  return (
    <section className="panel p-3 space-y-2" aria-label="Takvim">
      <div className="flex items-center justify-between">
        <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Önceki ay">◀</button>
        <span className="font-pixel text-xl">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => shift(1)} disabled={!canNext} aria-label="Sonraki ay">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-1 font-pixel text-[13px] text-ink2 text-center">{DOW.map(d => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <span key={'l' + i} />)}
        {Array.from({ length: nDays }, (_, i) => {
          const d = iso(new Date(month.getFullYear(), month.getMonth(), i + 1))
          const a = mine.get(d), b = theirs.get(d)
          const ca = dayColor(a, today), cb = dayColor(b, today)
          const isToday = d === today
          const empty = !a && !b
          return (
            <button key={d} disabled={empty} onClick={() => { sfx.click(); setSel(d) }} aria-label={d}
              className={`relative aspect-square panel-dark !p-0 overflow-hidden ${isToday ? '!border-gold' : ''} ${empty ? 'opacity-30' : ''}`}>
              <span className="absolute inset-0 flex">
                <span className="flex-1" style={{ background: ca ?? 'transparent' }} />
                {partner && <span className="flex-1" style={{ background: cb ?? 'transparent' }} />}
              </span>
              {(a?.combo || b?.combo) && <Icon name="heart" size={12} className="absolute top-0.5 right-0.5" />}
              <span className="relative font-pixel text-[13px] leading-none drop-shadow-[0_1px_0_#160f22]">{i + 1}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-pixel text-[13px] text-ink2 justify-center">
        <Leg c="#ffcc3a">Kombo</Leg><Leg c="#5bd17c">Tam gün</Leg><Leg c="#4cc9f0">İzin</Leg><Leg c="#c94a5e">Eksik</Leg>
      </div>
      {cal && (
        <div className="grid grid-cols-2 gap-2 font-pixel text-[15px]">
          <span className="panel-dark py-1 flex items-center justify-center gap-1 text-ok"><Icon name="check" size={16} />{cal.totals.fullDays} tam gün</span>
          <span className="panel-dark py-1 flex items-center justify-center gap-1 text-gold"><Icon name="heart" size={16} />{cal.totals.combos} kombo</span>
        </div>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? new Date(sel + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : null}>
        {detail ? (
          <div className={`grid gap-3 ${partner ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <DayCol who={<Portrait cls={me.class} look={me.look} gear={me.equipped} size={40} />} qs={detail.me} day={detail.meDay} />
            {partner && <DayCol who={<Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={40} />} qs={detail.partner} day={detail.partnerDay} />}
          </div>
        ) : <div className="py-8 text-center"><Icon name="sparkle" size={40} className="pop" /></div>}
      </Sheet>
    </section>
  )
}

function Leg({ c, children }: { c: string; children: string }) {
  return <span className="flex items-center gap-1"><span className="w-3 h-3 border-2 border-edge" style={{ background: c }} />{children}</span>
}

function DayCol({ who, qs, day }: { who: React.ReactNode; qs: DayQuest[]; day: DayDetail['meDay'] }) {
  const daily = qs.filter(q => q.kind === 'DAILY'), side = qs.filter(q => q.kind === 'SIDE')
  const done = daily.filter(q => q.done).length
  return (
    <div className="panel-dark p-2 space-y-2">
      <div className="flex items-center gap-2">{who}
        <span className={`font-pixel text-lg ${day?.allDone ? 'text-ok' : day?.izin ? 'text-xp' : ''}`}>{daily.length === 0 ? '—' : `${done}/${daily.length}`}</span>
        {day?.izin && <Icon name="shield" size={18} />}
        {day?.allDone && <Icon name="trophy" size={18} />}
        {day && day.hpLost > 0 && <span className="font-pixel text-[14px] text-hp ml-auto">-{day.hpLost} ❤</span>}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {[...daily, ...side].map(q => (
          <span key={q.code} className={`relative aspect-square grid place-items-center rounded-[3px] ${q.done ? 'bg-ok/25' : 'bg-black/30'} ${q.kind === 'SIDE' ? 'ring-2 ring-magic/60' : ''}`} title={q.title}>
            <Icon name={q.icon} size={26} className={q.done ? '' : 'opacity-35 grayscale'} />
            {q.done && <Icon name="check" size={12} className="absolute bottom-0 right-0" />}
          </span>
        ))}
      </div>
    </div>
  )
}
