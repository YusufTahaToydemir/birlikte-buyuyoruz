// Sezon kartı: 3 aylık dönem, kalan gün, ikinizin sezon özeti, geçmiş sezonlar.
import { useEffect, useState } from 'react'
import { getSeason, type Season, type SeasonSummary } from '../lib/game'
import { Icon, Portrait } from '../game/Sprite'
import { sfx } from '../game/sfx'
import { Sheet, toastError, useGame } from '../game/ui'

const SEASON_ICON: Record<string, string> = { 'Kış Yolu': 'moon', 'Bahar Seferi': 'flower', 'Yaz Güneşi': 'sun', 'Güz Hasadı': 'apple' }

export function SeasonCard() {
  const { game } = useGame()
  const [s, setS] = useState<Season | null>(null)
  const [open, setOpen] = useState<SeasonSummary | null>(null)
  const [openName, setOpenName] = useState('')
  useEffect(() => { let on = true; getSeason().then(x => { if (on) setS(x) }).catch(toastError); return () => { on = false } }, [game.hero?.xp])
  if (!s) return null
  const pct = Math.min(100, (s.dayOf / s.days) * 100)
  return (
    <section className="panel p-3 space-y-2" aria-label="Sezon">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xl flex items-center gap-2"><Icon name={SEASON_ICON[s.name] ?? 'moon'} size={24} />Sezon {s.n} · {s.name}</span>
        <span className="font-pixel text-[15px] text-ink2">{s.daysLeft} gün</span>
      </div>
      <div className="bar w-full" style={{ height: 10 }}><i style={{ width: `${pct}%`, background: '#b98aff' }} /></div>
      <button className="w-full" onClick={() => { sfx.open(); setOpen(s.summary); setOpenName(`Sezon ${s.n} · ${s.name}`) }}><Stats summary={s.summary} compact /></button>
      {s.past.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.past.map(p => <button key={p.n} className="panel-dark px-2 py-1 font-pixel text-[13px] flex items-center gap-1" onClick={() => { sfx.click(); setOpen(p.summary); setOpenName(`Sezon ${p.n} · ${p.name}`) }}><Icon name={SEASON_ICON[p.name] ?? 'moon'} size={14} />{p.n}</button>)}
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={<span className="flex items-center gap-2"><Icon name="trophy" size={26} />{openName}</span>}>
        {open && <Stats summary={open} />}
      </Sheet>
    </section>
  )
}

function Stats({ summary, compact }: { summary: SeasonSummary; compact?: boolean }) {
  const { game } = useGame()
  const me = game.hero!, partner = game.partner
  const mine = summary.heroes[me.id], theirs = partner ? summary.heroes[partner.id] : undefined
  const row = (label: string, icon: string, a?: number, b?: number) => (
    <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center font-pixel text-[15px]">
      <span className={`text-right ${a !== undefined && b !== undefined && a > b ? 'text-gold' : 'text-ink'}`}>{a ?? '—'}</span>
      <span className="text-ink2 text-[13px] flex items-center gap-1 px-2"><Icon name={icon} size={14} />{label}</span>
      <span className={`${a !== undefined && b !== undefined && b > a ? 'text-gold' : 'text-ink'}`}>{b ?? '—'}</span>
    </div>
  )
  return (
    <div className="panel-dark p-2 space-y-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <span className="flex justify-end"><Portrait cls={me.class} look={me.look} gear={me.equipped} size={26} /></span>
        <span className="font-pixel text-[13px] text-ink2 px-2">ikiniz</span>
        <span>{partner && <Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={26} />}</span>
      </div>
      {row('Tam gün', 'check', mine?.fullDays, theirs?.fullDays)}
      {row('Görev', 'star', mine?.quests, theirs?.quests)}
      {!compact && row('XP', 'star', mine?.xp, theirs?.xp)}
      {row('En uzun seri', 'flame', mine?.bestStreak, theirs?.bestStreak)}
      {!compact && row('Düello', 'swords', mine?.duelWins, theirs?.duelWins)}
      <div className="grid grid-cols-4 gap-1 pt-1 font-pixel text-center text-[13px]">
        <span className="panel px-1 py-1"><Icon name="heart" size={14} /> {summary.combos}<br /><span className="text-ink2">kombo</span></span>
        <span className="panel px-1 py-1"><Icon name="skull" size={14} /> {summary.bosses}<br /><span className="text-ink2">canavar</span></span>
        <span className="panel px-1 py-1"><Icon name="puzzle" size={14} /> {summary.quizzes + summary.raids}<br /><span className="text-ink2">oyun</span></span>
        <span className="panel px-1 py-1"><Icon name="quill" size={14} /> {summary.notes}<br /><span className="text-ink2">not</span></span>
      </div>
    </div>
  )
}
