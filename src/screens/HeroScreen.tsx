// Kahraman: büyük karakter vitrini, güç değerleri, ekipman yuvaları, rozetler.
import { useEffect, useRef, useState } from 'react'
import { ACHIEVEMENTS, CAT_INFO, equipItem, levelReward, SHOP, STAT_EFFECT, statBonus, titleFor, TITLES, unlocksAt, type Category, type Hero, type Slot } from '../lib/game'
import { CLASS_INFO, type Gear } from '../game/art/hero'
import { HeroSprite, Icon } from '../game/Sprite'
import { PetMini } from './PetSheet'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Bar, Sheet, useGame } from '../game/ui'
import { CalendarPanel } from './Calendar'
import { SeasonCard } from './Season'

const SLOTS: Array<{ slot: Slot; icon: string; kind: string }> = [
  { slot: 'weapon', icon: 'sword', kind: 'WEAPON' },
  { slot: 'armor', icon: 'shield', kind: 'ARMOR' },
  { slot: 'head', icon: 'helmet', kind: 'HEAD' },
  { slot: 'cape', icon: 'cape', kind: 'CAPE' },
]
const CATS: Category[] = ['BODY', 'MIND', 'SPIRIT', 'ORDER']

export function HeroScreen() {
  const { game, run, openPets } = useGame()
  const pet = game.pets?.[0]
  const h = game.hero!
  const [slot, setSlot] = useState<Slot | null>(null)
  const [pose, setPose] = useState<'joy' | undefined>()
  const info = CLASS_INFO[h.class]
  const maxStat = Math.max(10, ...CATS.map(c => h.stats[c] ?? 0))
  const tier = (s: Slot) => (s === 'weapon' ? h.equipped.weapon ?? 0 : s === 'armor' ? h.equipped.armor ?? 0 : 0)

  const owned = (s: Slot) => {
    const kind = SLOTS.find(x => x.slot === s)!.kind
    return SHOP.filter(i => i.kind === kind && (game.inventory[i.key] ?? 0) > 0)
  }

  async function equip(s: Slot, value: string | number | null) {
    sfx.buy()
    const g = await run(() => equipItem(s, value))
    if (g) { setSlot(null); setPose('joy'); fx.flash('rgba(255,215,90,.25)'); window.setTimeout(() => setPose(undefined), 900) }
  }

  const tap = (e: React.MouseEvent) => { sfx.cheer(); setPose('joy'); fx.burst(e.clientX, e.clientY, info.color); window.setTimeout(() => setPose(undefined), 700) }

  return (
    <div className="space-y-3">
      {/* Vitrin */}
      <section className="panel relative overflow-hidden" style={{ background: `radial-gradient(circle at 50% 60%, ${info.color}33, transparent 60%), #241c3e` }}>
        <div className="absolute inset-[-60%] rays opacity-30 pointer-events-none" />
        <div className="relative flex flex-col items-center pt-3 pb-2">
          <div className="font-pixel text-2xl">{h.name}</div>
          <div className="font-pixel text-[17px] flex items-center gap-2" style={{ color: info.color }}>
            {info.name}<span className="text-ink2">·</span><span className="text-magic">Seviye {h.level}</span>
          </div>
          <div className="font-pixel text-lg" style={{ color: titleFor(h.level).color }}>« {titleFor(h.level).name} »
          </div>
          <button className="relative mt-1" onClick={tap} aria-label="Kahraman">
            <HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={5} pose={pose} />
            <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[130px] h-[14px] rounded-[50%] bg-black/35 -z-10" />
          </button>
          {pet && <button className="absolute right-5 bottom-5" onClick={() => { sfx.open(); openPets() }} aria-label={pet.name}><PetMini pet={pet} scale={2.6} /></button>}
          <div className="flex gap-2 mt-1">
            <span className="panel-dark px-2 py-1 font-pixel flex items-center gap-1"><Icon name="flame" size={18} />{h.streak}</span>
            <span className="panel-dark px-2 py-1 font-pixel flex items-center gap-1 text-gold"><Icon name="trophy" size={18} />{h.bestStreak}</span>
          </div>
        </div>
      </section>

      <LevelRoad h={h} />

      <SeasonCard />

      <CalendarPanel />

      {/* Ekipman */}
      <section className="grid grid-cols-5 gap-2" aria-label="Ekipman">
        {SLOTS.map(s => {
          const eq = s.slot === 'weapon' || s.slot === 'armor' ? tier(s.slot) > 0 : !!h.equipped[s.slot]
          return (
            <button key={s.slot} className={`panel aspect-square grid place-items-center relative ${eq ? '!bg-panel2' : ''}`} onClick={() => { sfx.click(); setSlot(s.slot) }} aria-label={s.slot}>
              <Icon name={s.icon} size={36} className={eq ? '' : 'opacity-35'} />
              {(s.slot === 'weapon' || s.slot === 'armor') && tier(s.slot) > 0 && <span className="absolute bottom-0.5 right-1 font-pixel text-[14px] text-gold">+{tier(s.slot)}</span>}
            </button>
          )
        })}
        <button className={`panel aspect-square grid place-items-center relative ${pet ? '!bg-panel2' : ''}`} onClick={() => { sfx.open(); openPets() }} aria-label="Yuva">
          {pet ? <PetMini pet={pet} scale={1.7} /> : <Icon name="pet" size={36} className="opacity-35" />}
          {(game.petBonus ?? 0) > 0 && <span className="absolute bottom-0.5 right-1 font-pixel text-[13px] text-gold">+%{game.petBonus}</span>}
        </button>
      </section>

      {/* Güç değerleri */}
      <section className="panel p-3 space-y-2" aria-label="Güç değerleri">
        {CATS.map(c => (
          <div key={c} className="flex items-center gap-2">
            <Icon name={CAT_INFO[c].icon} size={26} />
            <span className="font-pixel w-[58px] text-[17px]">{CAT_INFO[c].name}</span>
            <Bar value={h.stats[c] ?? 0} max={maxStat} color={CAT_INFO[c].color} label={h.stats[c] ?? 0} className="flex-1" h={20} />
            <span className="font-pixel text-[13px] w-[78px] text-right flex items-center justify-end gap-0.5" style={{ color: CAT_INFO[c].color }} title={`${STAT_EFFECT[c].what} bonusu`}>
              <Icon name={STAT_EFFECT[c].icon} size={12} />{STAT_EFFECT[c].unit(statBonus(h.stats[c] ?? 0))}
            </span>
          </div>
        ))}
        <div className="font-pixel text-[13px] text-ink2 text-center">Her görev kendi gücünü +1 artırır · bonus = √güç (en çok %20)</div>
      </section>

      {/* Rozetler */}
      <section className="panel p-3">
        <div className="font-pixel text-lg mb-2 flex items-center gap-2"><Icon name="trophy" size={22} />{game.achievements.length}/{ACHIEVEMENTS.length}</div>
        <div className="grid grid-cols-6 gap-1.5">
          {ACHIEVEMENTS.map(a => {
            const got = game.achievements.includes(a.key)
            return (
              <div key={a.key} className={`panel-dark aspect-square grid place-items-center relative ${got ? '' : 'opacity-40'}`} title={a.name}>
                <Icon name={got ? a.icon : 'lock'} size={28} className={got ? '' : 'grayscale'} />
              </div>
            )
          })}
        </div>
      </section>

      <Sheet open={slot !== null} onClose={() => setSlot(null)} title={slot ? <span className="flex items-center gap-2"><Icon name={SLOTS.find(s => s.slot === slot)!.icon} size={26} /></span> : null}>
        {slot && <SlotPicker slot={slot} />}
      </Sheet>
    </div>
  )

  function SlotPicker({ slot }: { slot: Slot }) {
    const items = owned(slot)
    const isTier = slot === 'weapon' || slot === 'armor'
    const options: Array<{ key: string; label: string; value: string | number | null; gear: Gear; active: boolean }> = [
      { key: 'none', label: isTier ? 'Başlangıç' : 'Yok', value: isTier ? 0 : null, gear: { ...h.equipped, [slot]: isTier ? 0 : undefined }, active: isTier ? tier(slot) === 0 : !h.equipped[slot] },
      ...items.map(i => ({ key: i.key, label: i.name, value: isTier ? i.tier : i.key, gear: { ...h.equipped, [slot]: isTier ? i.tier : i.key }, active: isTier ? tier(slot) === i.tier : h.equipped[slot] === i.key })),
    ]
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {options.map(o => (
            <button key={o.key} className={`panel p-1 flex flex-col items-center ${o.active ? '!border-gold' : ''}`} onClick={() => !o.active && void equip(slot, o.value)}>
              <HeroSprite cls={h.class} look={h.look} gear={o.gear} scale={2} animate={false} />
              <span className="font-pixel text-[14px] text-center leading-tight mt-1">{o.label}</span>
              {o.active && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
        {items.length === 0 && <p className="font-pixel text-ink2 text-center flex items-center justify-center gap-2"><Icon name="chest" size={22} />Hazine'den al</p>}
      </div>
    )
  }
}

/** Seviye yolu: sonraki seviyelerin ödülleri (altın, iksir, unvan, açılan eşyalar) */
function LevelRoad({ h }: { h: Hero }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo({ left: 0 }) }, [h.level])
  const pct = Math.max(0, Math.min(1, (h.xp - h.levelStart) / Math.max(1, h.levelEnd - h.levelStart)))
  const levels = Array.from({ length: 15 }, (_, i) => h.level + 1 + i)
  const nextTitle = TITLES.find(t => t.level > h.level)
  return (
    <section className="panel p-3 space-y-2" aria-label="Seviye yolu">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xl flex items-center gap-2"><Icon name="stairs" size={24} />Seviye yolu</span>
        {nextTitle && <span className="font-pixel text-[15px] text-ink2">Sv {nextTitle.level}: <span style={{ color: nextTitle.color }}>{nextTitle.name}</span></span>}
      </div>
      <div ref={ref} className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {levels.map((l, i) => {
          const r = levelReward(l)
          const u = unlocksAt(l)
          const t = TITLES.find(x => x.level === l)
          const big = l % 5 === 0
          return (
            <div key={l} className={`snap-start shrink-0 w-[92px] panel-dark p-1.5 flex flex-col items-center gap-1 relative ${i === 0 ? '!border-gold' : ''} ${big ? '!bg-[#2f2450]' : ''}`}>
              {i === 0 && <div className="absolute left-0 bottom-0 h-[4px] bg-xp" style={{ width: `${pct * 100}%` }} />}
              <span className="font-pixel text-[15px] text-magic">Sv {l}</span>
              <div className="h-[44px] grid place-items-center">
                {u.length > 0 ? (<HeroSprite cls={h.class} look={h.look} gear={{ ...h.equipped, ...(u[0].kind === 'WEAPON' ? { weapon: u[0].tier } : u[0].kind === 'ARMOR' ? { armor: u[0].tier } : u[0].kind === 'HEAD' ? { head: u[0].key } : u[0].kind === 'CAPE' ? { cape: u[0].key } : {}) }} scale={1} animate={false} />)
                  : big ? <Icon name="chest" size={40} className={i < 5 ? 'glow' : ''} /> : <Icon name="coin" size={30} />}
              </div>
              <span className="font-pixel text-[15px] text-gold flex items-center gap-0.5"><Icon name="coin" size={14} />{r.gold}</span>
              {r.potion && <Icon name={r.potion === 'potion_big' ? 'potion_big' : 'potion'} size={18} />}
              {t && <span className="font-pixel text-[13px] leading-none text-center" style={{ color: t.color }}>{t.name}</span>}
              {u.length > 1 && <span className="font-pixel text-[13px] text-ink2">+{u.length - 1} eşya</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
