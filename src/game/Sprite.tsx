import { useEffect, useRef, useState } from 'react'
import { gridToURL } from './pixel'
import { HERO_H, HERO_W, renderHero, renderPortrait, type Gear, type HeroClass, type Look, type Pose } from './art/hero'
import { BOSS_SIZE, PET_SIZE, renderBoss, renderPet } from './art/bosses'
import { renderIcon } from './art/icons'
import { drawScene, timeOfDay } from './art/scene'

const ALIAS: Record<string, string> = { stretch: 'muscle', hp: 'heart', xp: 'star', gold: 'coin', potion_small: 'potion' }

export function Icon({ name, size = 28, className = '', title }: { name: string; size?: number; className?: string; title?: string }) {
  const n = ALIAS[name] ?? name
  const src = gridToURL(`icon:${n}`, () => renderIcon(n))
  return <img src={src} width={size} height={size} alt={title ?? ''} title={title} className={`px inline-block align-middle ${className}`} draggable={false} />
}

export function HeroSprite({ cls, look, gear, scale = 3, pose, className = '', animate = true, label }: {
  cls: HeroClass; look: Look; gear?: Gear; scale?: number; pose?: Pose; className?: string; animate?: boolean; label?: string
}) {
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    if (!animate || pose) return
    let t: number
    const loop = () => { t = window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 140); loop() }, 2600 + Math.random() * 2200) }
    loop()
    return () => window.clearTimeout(t)
  }, [animate, pose])
  const p: Pose = pose ?? (blink ? 'blink' : 'idle')
  const key = `hero:${cls}:${JSON.stringify(look)}:${JSON.stringify(gear ?? {})}:${p}`
  const src = gridToURL(key, () => renderHero(cls, look, gear, p))
  return (
    <img src={src} width={HERO_W * scale} height={HERO_H * scale} alt={label ?? 'Kahraman'} draggable={false}
      className={`px ${animate ? 'hero-idle' : ''} ${className}`} />
  )
}

export function Portrait({ cls, look, gear, size = 48 }: { cls: HeroClass; look: Look; gear?: Gear; size?: number }) {
  const src = gridToURL(`portrait:${cls}:${JSON.stringify(look)}:${gear?.head ?? ''}:${gear?.armor ?? 0}`, () => renderPortrait(cls, look, gear))
  return <img src={src} width={size} height={size} alt="" className="px" draggable={false} />
}

export function BossSprite({ bossKey, scale = 3, className = '', label }: { bossKey: string; scale?: number; className?: string; label?: string }) {
  const src = gridToURL(`boss:${bossKey}`, () => renderBoss(bossKey))
  return <img src={src} width={BOSS_SIZE * scale} height={BOSS_SIZE * scale} alt={label ?? 'Canavar'} className={`px ${className}`} draggable={false} />
}

export function PetSprite({ petKey, scale = 3, className = '' }: { petKey?: string; scale?: number; className?: string }) {
  if (!petKey) return null
  const g = renderPet(petKey)
  if (!g) return null
  const src = gridToURL(`pet:${petKey}`, () => g)
  return <img src={src} width={PET_SIZE * scale} height={PET_SIZE * scale} alt="" className={`px pet-hop ${className}`} draggable={false} />
}

export function SceneBg({ className = '', seed = 7 }: { className?: string; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawScene(ref.current, 128, 72, timeOfDay(), seed) }, [seed])
  return <canvas ref={ref} className={`px w-full h-full ${className}`} aria-hidden="true" />
}
