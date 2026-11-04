// Ortak kale: parçalar altınla alınır, ikiniz de katkı verir; bazı parçalar küçük bonus verir.
import { useEffect, useRef, useState } from 'react'
import { castleBuild, getCastle, type Castle as CastleState } from '../lib/game'
import { CASTLE_CATALOG, castleCost, castleTitle, CASTLE_TITLES, drawCastle } from '../game/art/castle'
import { timeOfDay } from '../game/art/scene'
import { Icon, Portrait } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Sheet, toastError, useGame } from '../game/ui'

export function CastleView({ parts, className = '' }: { parts: Record<string, number>; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawCastle(ref.current, parts, timeOfDay()) }, [parts])
  return <canvas ref={ref} className={`px w-full ${className}`} style={{ aspectRatio: '2 / 1', imageRendering: 'pixelated' }} aria-label="Kale" />
}

export function CastlePanel() {
  const { game, setGame } = useGame()
  const me = game.hero!, partner = game.partner
  const [castle, setCastle] = useState<CastleState | null>(null)
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { let on = true; getCastle().then(c => { if (on) setCastle(c) }).catch(toastError); return () => { on = false } }, [])
  if (!castle) return null
  const total = castle.total
  const title = castleTitle(total)
  const next = CASTLE_TITLES.find(t => t[0] > total)

  async function build(key: string) {
    setBusy(true)
    try {
      const r = await castleBuild(key)
      setCastle(r.castle); setGame(r.game)
      sfx.buy(); sfx.hit(); navigator.vibrate?.([20, 30, 40])
      fx.flash('rgba(255,204,58,.3)'); fx.confetti(50); fx.shake('castle-panel')
      const s = fx.fromEl(document.getElementById('hud-gold'))
      fx.float(`-${castleCost(key, (castle!.parts[key] ?? 0))}`, s.x, s.y + 24, '#ffcc3a', true)
      setSel(null)
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <section id="castle-panel" className="panel p-3 space-y-2" aria-label="Kale">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xl flex items-center gap-2"><Icon name="crown" size={24} />{title}</span>
        <span className="font-pixel text-[15px] text-ink2 flex items-center gap-1"><Icon name="shield" size={14} />{total}{next ? ` · ${next[1]} ${next[0]}` : ''}</span>
      </div>
      <div className="panel-dark overflow-hidden"><CastleView parts={castle.parts} /></div>
      {next && <div className="bar w-full" style={{ height: 8 }}><i style={{ width: `${Math.min(100, (total / next[0]) * 100)}%`, background: '#ffcc3a' }} /></div>}
      <button className="pbtn pbtn-gold w-full" onClick={() => { sfx.open(); setOpen(true) }}><Icon name="bag" size={22} />İnşa et</button>
      {castle.log.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {castle.log.slice(0, 4).map(l => {
            const who = l.by === me.id ? me : partner
            return <span key={l.key + l.at} className="panel-dark px-1.5 py-0.5 font-pixel text-[13px] flex items-center gap-1">{who && <Portrait cls={who.class} look={who.look} gear={who.equipped} size={16} />}{CASTLE_CATALOG.find(c => c.key === l.key)?.name} +{l.level}</span>
          })}
        </div>
      )}

      <Sheet open={open} onClose={() => { setOpen(false); setSel(null) }} title={<span className="flex items-center gap-2"><Icon name="crown" size={26} />Kale inşası</span>}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {CASTLE_CATALOG.map(c => {
              const lv = castle.parts[c.key] ?? 0
              const done = lv >= c.max
              const cost = castleCost(c.key, lv)
              return (
                <button key={c.key} className={`panel-dark p-1.5 flex flex-col items-center gap-0.5 relative ${sel === c.key ? '!border-gold' : ''} ${done ? 'opacity-75' : ''}`} onClick={() => { sfx.click(); setSel(c.key) }}>
                  <Icon name={c.icon} size={30} className={lv > 0 ? '' : 'opacity-50 grayscale'} />
                  <span className="font-pixel text-[13px] leading-tight text-center h-[26px] flex items-center">{c.name}</span>
                  <span className="flex gap-0.5">{Array.from({ length: c.max }, (_, i) => <span key={i} className={`w-2 h-2 border border-edge ${i < lv ? 'bg-gold' : 'bg-panel2'}`} />)}</span>
                  {done ? <span className="font-pixel text-[13px] text-ok"><Icon name="check" size={12} /></span>
                    : <span className={`font-pixel text-[13px] flex items-center gap-0.5 ${me.gold >= cost ? 'text-gold' : 'text-hp'}`}><Icon name="coin" size={11} />{cost}</span>}
                  {c.bonus && <Icon name="sparkle" size={10} className="absolute top-1 right-1" />}
                </button>
              )
            })}
          </div>
          {sel && (() => {
            const c = CASTLE_CATALOG.find(x => x.key === sel)!
            const lv = castle.parts[c.key] ?? 0, done = lv >= c.max, cost = castleCost(c.key, lv)
            return (
              <div className="panel p-3 space-y-2 dropin">
                <div className="flex items-center gap-2 font-pixel"><Icon name={c.icon} size={28} /><span className="text-lg">{c.name}</span><span className="text-ink2 text-[14px] ml-auto">{lv}/{c.max}</span></div>
                {c.bonus && <p className="font-pixel text-[14px] text-xp flex items-center gap-1"><Icon name="sparkle" size={14} />{c.bonus}</p>}
                {done ? <div className="font-pixel text-ok text-center">Tamamlandı</div>
                  : <button className="pbtn pbtn-gold w-full" disabled={busy || me.gold < cost} onClick={() => void build(c.key)}>{lv === 0 ? 'İnşa et' : 'Yükselt'} <Icon name="coin" size={20} />{cost}</button>}
              </div>
            )
          })()}
          <p className="font-pixel text-[13px] text-ink2 text-center">Altın kendi kesenden çıkar, kale ikinizin · <Icon name="sparkle" size={12} /> bonus verir</p>
        </div>
      </Sheet>
    </section>
  )
}
