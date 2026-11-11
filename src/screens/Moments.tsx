// Küçük anlar (0022): günaydın sahnesi (günün ilk açılışı), zaman kapsülünün açılışı, ilk açılış ipuçları.
import { useEffect, useState } from 'react'
import { capsuleRead, getMemories, type Capsule } from '../lib/game'
import { HeroSprite, Icon, SceneBg } from '../game/Sprite'
import { PetView } from '../game/Pet'
import { petLook } from './PetSheet'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { useGame } from '../game/ui'
import { FORK_FX, regionOf } from '../game/world'
import { timeOfDay } from '../game/art/scene'

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* depolama kapalı */ } },
}

/** Günün ilk açılışında (05:00'ten sonra) bir kez: dün ne oldu, eşin ne yaptı, dostlar ne halde, bugün ne var */
export function useMorning(): [boolean, () => void] {
  const { game } = useGame()
  const key = `bb:morning:${game.hero?.id}:${game.today}`
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }).format(new Date()))
  const [show, setShow] = useState(() => !!game.hero && !!game.yesterday?.me && hour >= 5 && hour < 14 && store.get(key) !== '1')
  return [show, () => { store.set(key, '1'); setShow(false) }]
}

export function Morning({ onDone }: { onDone: () => void }) {
  const { game } = useGame()
  const h = game.hero!, partner = game.partner
  const y = game.yesterday
  const region = game.world?.region ?? 0
  const pets = game.pets ?? []
  const fork = game.fork
  useEffect(() => { sfx.levelUp(); window.setTimeout(() => fx.sparkle(window.innerWidth / 2, window.innerHeight * 0.25, 10, '#fff4b0', 70), 600) }, [])
  const row = (i: number, icon: string, children: React.ReactNode, color = '#e8e0ff') => (
    <div className="panel-dark p-2 flex items-center gap-2 riseup" style={{ animationDelay: `${0.5 + i * 0.18}s`, color }}>
      <span className="w-[34px] grid place-items-center shrink-0"><Icon name={icon} size={26} /></span>
      <span className="font-pixel text-[17px] leading-tight flex-1 min-w-0">{children}</span>
    </div>
  )
  const lines: React.ReactNode[] = []
  if (y?.me) lines.push(row(lines.length, y.me.allDone ? 'trophy' : y.me.izin ? 'shield' : 'check',
    y.me.izin ? 'Dün izinliydin' : y.me.allDone ? `Dün tam gün! ${y.me.done}/${y.me.total}` : `Dün ${y.me.done}/${y.me.total} görev${y.me.hpLost ? ` · −${y.me.hpLost} can` : ''}`, y.me.allDone ? '#ffcc3a' : undefined))
  if (partner && y?.partner) lines.push(row(lines.length, 'heart', `${partner.name}: ${y.partner.izin ? 'izinliydi' : `${y.partner.done}/${y.partner.total}${y.partner.allDone ? ' · tam gün!' : ''}`}${y.combo ? ' · kombo!' : ''}`, y.combo ? '#5bd17c' : '#ff8ab5'))
  const back = pets.filter(p => p.away && new Date(p.away.endsAt).getTime() <= Date.now())
  if (back.length) lines.push(row(lines.length, 'bag', `${back.map(p => p.name).join(', ')} keşiften döndü!`, '#b98aff'))
  else if (pets.some(p => !p.patMe && !p.away)) lines.push(row(lines.length, 'pet', `${pets.find(p => !p.patMe && !p.away)!.name} seni bekliyor`, '#ff8ab5'))
  if ((game.petMail?.length ?? 0) > 0) lines.push(row(lines.length, 'scroll', `${partner?.name ?? ''} sana dostla bir şey yollamış`, '#ff8ab5'))
  if (fork && !fork.result && !fork.mine) lines.push(row(lines.length, 'dice', 'Yol ayrımı seni bekliyor', '#b98aff'))
  else if (fork?.result) { const fx2 = FORK_FX[fork.result === 'A' ? fork.option.a.fx : fork.option.b.fx]; if (fx2) lines.push(row(lines.length, fx2.icon, `Bu hafta ${fx2.text}`, fx2.color)) }
  if (game.garden?.plants && !game.garden.waterMe) lines.push(row(lines.length, 'can', 'Bahçe su bekliyor', '#7ec8ff'))

  return (
    <div className="fixed inset-0 z-[56] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Günaydın">
      <div className="panel w-full max-w-[400px] overflow-hidden dropin">
        <div className="relative h-[150px]">
          <SceneBg className="absolute inset-0" seed={h.level} region={region} />
          <div className="absolute inset-0 sunrise" style={{ background: 'radial-gradient(circle at 50% 110%, rgba(255,200,120,.55), transparent 60%)' }} />
          <div className="absolute left-[22%] bottom-2"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={2.6} pose="joy" /></div>
          {partner && <div className="absolute left-[44%] bottom-2"><HeroSprite cls={partner.class} look={partner.look} gear={partner.equipped} scale={2.3} /></div>}
          {pets[0] && !pets[0].away && <div className="absolute left-[66%] bottom-1"><PetView look={petLook(pets[0])} scale={1.9} reaction="happy" reactionKey={1} /></div>}
          <div className="absolute top-2 left-2 panel-dark px-2 py-0.5 font-pixel text-[14px] flex items-center gap-1"><Icon name={regionOf(region).icon} size={14} />{regionOf(region).name}</div>
        </div>
        <div className="p-3 space-y-2">
          <div className="font-pixel text-3xl text-center text-gold drop-shadow-[0_3px_0_#000]">{timeOfDay() === 'dawn' ? 'Hayırlı sabahlar' : 'Günaydın'}, {h.name}!</div>
          {lines}
          <button className="pbtn pbtn-gold w-full text-xl riseup" style={{ animationDelay: `${0.6 + lines.length * 0.18}s` }} onClick={() => { sfx.click(); onDone() }}>
            <Icon name="sun" size={24} />Güne başla
          </button>
        </div>
      </div>
    </div>
  )
}

/** Açılma günü gelen zaman kapsülü: mühür kırılır, mektup okunur */
export function CapsuleOpen({ id, onDone }: { id: string; onDone: () => void }) {
  const { game, refresh } = useGame()
  const [cap, setCap] = useState<Capsule | null>(null)
  const [broken, setBroken] = useState(false)
  useEffect(() => { getMemories().then(m => setCap(m.capsules.find(c => c.id === id) ?? null)).catch(() => onDone()) }, [id, onDone])
  const open = async () => {
    sfx.ticket(); fx.confetti(80); fx.flash('rgba(255,215,90,.35)'); setBroken(true)
    try { const m = await capsuleRead(id); setCap(m.capsules.find(c => c.id === id) ?? cap) } catch { /* yine de göster */ }
  }
  if (!cap) return null
  const fromMe = cap.author === game.hero!.id
  return (
    <div className="fixed inset-0 z-[56] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Zaman kapsülü">
      <div className="panel w-full max-w-[400px] p-4 space-y-3 dropin text-center">
        {!broken ? (
          <>
            <div className="flex justify-center py-3"><Icon name="chest" size={96} className="glow wiggle" /></div>
            <div className="font-pixel text-2xl text-gold">Zaman kapsülü açılıyor!</div>
            <div className="font-pixel text-[16px] text-ink2">{new Date(cap.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihinde {fromMe ? 'sen yazmıştın' : `${game.partner?.name ?? ''} yazmıştı`}</div>
            <button className="pbtn pbtn-gold w-full text-xl" onClick={() => void open()}><Icon name="lock" size={22} />Mührü kır</button>
          </>
        ) : (
          <>
            <div className="flex justify-center"><Icon name="scroll" size={56} className="popin" /></div>
            <p className="font-pixel text-lg leading-snug whitespace-pre-wrap text-left panel-dark p-3">{cap.text}</p>
            <button className="pbtn pbtn-dark w-full" onClick={() => { sfx.click(); void refresh(); onDone() }}>Anılara ekle</button>
          </>
        )}
      </div>
    </div>
  )
}

/** Yeni bir ekranın ilk açılışında tek cümlelik ipucu balonu */
export function Tip({ id, text, icon = 'sparkle', className = '' }: { id: string; text: string; icon?: string; className?: string }) {
  const key = `bb:tip:${id}`
  const [show, setShow] = useState(() => store.get(key) !== '1')
  if (!show) return null
  return (
    <button className={`tip panel w-full p-2 flex items-center gap-2 text-left !border-gold !bg-[#2f2650] ${className}`} onClick={() => { sfx.tick(); store.set(key, '1'); setShow(false) }} aria-label="İpucunu kapat">
      <Icon name={icon} size={26} className="glow shrink-0" />
      <span className="font-pixel text-[16px] leading-tight flex-1">{text}</span>
      <span className="font-pixel text-ink2 text-[14px]">✕</span>
    </button>
  )
}
