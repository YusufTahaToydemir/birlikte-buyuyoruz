// Olay katmanı: seviye atlama, hasar, bayılma, kombo, boss yenilgisi, bilet, rozet, partnerden gelenler.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ACHIEVEMENTS, markEventsSeen, type GameEvent } from '../lib/game'
import { BossSprite, HeroSprite, Icon } from './Sprite'
import { fx } from './fx'
import { sfx } from './sfx'
import { useGame } from './ui'

export function EventOverlay() {
  const { game, go } = useGame()
  const [queue, setQueue] = useState<GameEvent[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const fresh = game.events.filter(e => !seen.current.has(e.id))
    if (fresh.length === 0) return
    fresh.forEach(e => seen.current.add(e.id))
    setQueue(q => [...q, ...fresh])
    void markEventsSeen(fresh.map(e => e.id)).catch(() => { /* bir sonraki yüklemede tekrar denenir */ })
  }, [game.events])

  const cur = queue[0]
  useEffect(() => {
    if (!cur) return
    switch (cur.kind) {
      case 'LEVEL_UP': sfx.levelUp(); fx.flash('rgba(255,215,90,.5)'); fx.confetti(90); break
      case 'DAY_DAMAGE': sfx.hurt(); fx.flash('rgba(255,40,60,.45)'); fx.shake(); navigator.vibrate?.([60, 40, 60]); break
      case 'FAINT': sfx.hurt(); fx.flash('rgba(0,0,0,.6)'); fx.shake(); break
      case 'COMBO': sfx.victory(); fx.confetti(60); break
      case 'BOSS_DEFEATED': sfx.victory(); fx.flash('rgba(255,255,255,.7)'); fx.confetti(140); navigator.vibrate?.([30, 30, 30, 30, 120]); break
      case 'TICKET': case 'TICKET_APPROVED': sfx.ticket(); fx.confetti(40); break
      case 'ACHIEVEMENT': sfx.ticket(); fx.flash('rgba(185,138,255,.4)'); break
      case 'CHEER': sfx.cheer(); break
      case 'HEAL': sfx.heal(); break
      case 'GIFT': sfx.coin(); break
      default: sfx.click()
    }
  }, [cur])

  if (!cur) return null
  const h = game.hero!
  const d = cur.data as Record<string, number | string>
  const next = () => { sfx.click(); setQueue(q => q.slice(1)) }

  let art: ReactNode = null, title: ReactNode = null, sub: ReactNode = null, color = '#ffcc3a', rays = true
  let action: ReactNode = null
  switch (cur.kind) {
    case 'LEVEL_UP':
      art = <HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={4} pose="joy" />
      title = `SEVİYE ${d.level}!`; sub = <span className="flex items-center gap-1 text-hp"><Icon name="heart" size={20} />Can doldu</span>
      break
    case 'DAY_DAMAGE':
      art = <HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={4} pose="hurt" className="hero-hurt" />
      title = <span className="text-hp">-{d.hp} ❤</span>; color = '#ff4d6d'; rays = false
      sub = <span className="flex items-center gap-1 text-ink2"><Icon name="check" size={18} className="grayscale" />×{d.missed}</span>
      break
    case 'FAINT':
      art = <div className="grayscale rotate-90 translate-y-6"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={3} pose="hurt" animate={false} /></div>
      title = <span className="text-hp">Bayıldın!</span>; color = '#ff4d6d'; rays = false
      sub = <span className="flex items-center gap-1 text-gold"><Icon name="coin" size={20} />-{d.gold}</span>
      break
    case 'COMBO':
      art = (
        <div className="flex items-end gap-2">
          <HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={2.5} pose="joy" />
          <Icon name="heart" size={40} className="glow mb-10" />
          {game.partner && <div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={game.partner.class} look={game.partner.look} gear={game.partner.equipped} scale={2.5} pose="joy" /></div>}
        </div>
      )
      title = 'KOMBO!'; color = '#5bd17c'
      sub = <span className="flex items-center gap-3"><span className="flex items-center gap-1 text-gold"><Icon name="coin" size={20} />+{d.gold}</span><span className="flex items-center gap-1 text-hp"><Icon name="sword" size={20} />-{d.damage}</span></span>
      break
    case 'BOSS_DEFEATED':
      art = <BossSprite bossKey={String(d.bossKey ?? 'slime_green')} scale={3.5} className="grayscale-[.6] rotate-[10deg]" />
      title = 'ZAFER!'; sub = (
        <span className="flex flex-col items-center gap-1">
          <span className="text-ink">{String(d.name ?? '')}</span>
          <span className="flex items-center gap-3"><span className="flex items-center gap-1 text-gold"><Icon name="coin" size={22} />+{d.gold}</span><span className="flex items-center gap-1 text-ticket"><Icon name="ticket" size={22} />+1</span></span>
        </span>
      )
      break
    case 'TICKET':
      art = <Icon name="ticket" size={120} className="glow" />; title = '+1 BİLET'; color = '#ffd166'
      sub = <span className="flex items-center gap-1 text-ink2"><Icon name="check" size={18} />Harika hafta!</span>
      break
    case 'ACHIEVEMENT': {
      const a = ACHIEVEMENTS.find(x => x.key === d.key)
      art = <div className="panel-dark p-4"><Icon name={a?.icon ?? 'trophy'} size={96} className="glow" /></div>
      title = 'YENİ ROZET'; sub = <span className="text-ink">{a?.name ?? String(d.key)}</span>; color = '#b98aff'
      break
    }
    case 'CHEER':
      art = <Icon name="clap" size={110} className="pop" />; title = `+${d.xp} XP`; color = '#4cc9f0'
      sub = <span className="text-ink">{cur.from} seni alkışladı!</span>
      break
    case 'HEAL':
      art = <Icon name="heart" size={110} className="glow" />; title = <span className="text-ok">+{d.hp} ❤</span>; color = '#5bd17c'
      sub = <span className="text-ink">{cur.from} seni iyileştirdi</span>
      break
    case 'GIFT':
      art = <Icon name="gift" size={110} className="pop" />; title = `+${d.gold}`
      sub = <span className="text-ink">{cur.from} altın gönderdi</span>
      break
    case 'TICKET_REQUEST':
      art = <Icon name="ticket" size={110} className="glow" />; title = 'Bilet!'; color = '#ffd166'; rays = false
      sub = <span className="text-ink">{cur.from} bir bilet kullanmak istiyor</span>
      action = <button className="pbtn pbtn-gold flex-1" onClick={() => { setQueue(q => q.slice(1)); go('loot') }}>Bak</button>
      break
    case 'TICKET_APPROVED':
      art = <Icon name="ticket" size={110} className="glow" />; title = 'Onaylandı!'; color = '#5bd17c'
      sub = <span className="text-ink">{cur.from} biletini onayladı</span>
      break
    default:
      art = <Icon name="sparkle" size={90} />; title = cur.kind
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={next}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-[360px] panel dropin overflow-hidden text-center p-5 pt-6" onClick={e => e.stopPropagation()}>
        {rays && <div className="absolute inset-[-60%] rays opacity-50 pointer-events-none" />}
        <div className="relative flex justify-center items-end min-h-[150px]">{art}</div>
        <div className="relative font-pixel text-4xl mt-3 drop-shadow-[0_3px_0_#000]" style={{ color }}>{title}</div>
        {sub && <div className="relative font-pixel text-lg mt-2 flex justify-center">{sub}</div>}
        <div className="relative flex gap-2 mt-5">
          {action}
          <button className="pbtn pbtn-dark flex-1" onClick={next} autoFocus>Tamam{queue.length > 1 ? ` (${queue.length - 1})` : ''}</button>
        </div>
      </div>
    </div>
  )
}
