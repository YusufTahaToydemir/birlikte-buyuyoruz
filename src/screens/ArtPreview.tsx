// Geliştirme için sanat önizlemesi: #/art
import { BossSprite, HeroSprite, Icon, SceneBg } from '../game/Sprite'
import type { HeroClass } from '../game/art/hero'
import { useState } from 'react'
import { PetView, type PetReaction } from '../game/Pet'
import { PET_SPECIES, SPECIES_ORDER, renderPetStrip, type PetLook } from '../game/art/pets'
import { gridToURL } from '../game/pixel'

const OUTFITS: PetLook['outfit'][] = [{}, { HEAD: 'bow', NECK: 'collar' }, { HEAD: 'party', FACE: 'glasses', BACK: 'bag' }, { HEAD: 'wizard', NECK: 'scarf', BACK: 'cape' }, { HEAD: 'crown', NECK: 'goldchain', FACE: 'shades', BACK: 'wings', AURA: 'a_stars' }, { HEAD: 'halo', NECK: 'medal', FACE: 'hearts_g', BACK: 'fairy', AURA: 'a_hearts' }, { HEAD: 'beret', NECK: 'bowtie' }, { HEAD: 'helmet', AURA: 'a_fire' }, { HEAD: 'flower', AURA: 'a_bubbles' }]

const CLASSES: HeroClass[] = ['WARRIOR', 'MAGE', 'RANGER', 'HEALER']
const ICONS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'sun', 'quran', 'book', 'scroll', 'sword', 'beads', 'moon', 'lamp', 'apple', 'nocandy', 'nophone', 'water', 'boot', 'hand', 'heart', 'broom', 'muscle', 'pray', 'quill', 'coin', 'bed', 'sparkle', 'stairs', 'music', 'puzzle', 'star', 'potion', 'potion_big', 'ticket', 'crown', 'shield', 'chest', 'flame', 'dice', 'gear', 'sound', 'mute', 'trophy', 'gift', 'lock', 'swords', 'bag', 'helmet', 'check', 'clap', 'pet', 'cape', 'flower']

export function ArtPreview() {
  return (
    <div className="p-4 space-y-6">
      <div className="h-40 panel overflow-hidden"><SceneBg /></div>
      <div className="flex flex-wrap gap-4 items-end">
        {CLASSES.map(c => <HeroSprite key={c + 'f'} cls={c} look={{ gender: 'F', hair: 0, skin: 0, hairColor: 1 }} scale={4} />)}
        {CLASSES.map(c => <HeroSprite key={c + 'h'} cls={c} look={{ gender: 'F', hair: 2, skin: 1, hairColor: 1 }} scale={4} />)}
        {CLASSES.map(c => <HeroSprite key={c + 'm'} cls={c} look={{ gender: 'M', hair: 2, skin: 2, hairColor: 0 }} scale={4} />)}
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        {[0, 1, 2, 3, 4].map(t => <HeroSprite key={'w' + t} cls="WARRIOR" look={{ gender: 'M', hair: 1, skin: 1, hairColor: 2 }} gear={{ weapon: t, armor: t, head: t === 2 ? 'head_class' : t === 4 ? 'head_crown' : undefined, cape: t >= 3 ? 'cape_royal' : undefined }} scale={4} />)}
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        {[0, 1, 2, 3, 4].map(t => <HeroSprite key={'m' + t} cls="MAGE" look={{ gender: 'F', hair: 1, skin: 3, hairColor: 3 }} gear={{ weapon: t, armor: t, head: t >= 1 ? 'head_class' : undefined }} scale={4} />)}
        {[0, 2, 4].map(t => <HeroSprite key={'r' + t} cls="RANGER" look={{ gender: 'M', hair: 0, skin: 0, hairColor: 1 }} gear={{ weapon: t, armor: t, head: t === 4 ? 'head_class' : undefined, cape: 'cape_blue' }} scale={4} />)}
        {[0, 2, 4].map(t => <HeroSprite key={'h' + t} cls="HEALER" look={{ gender: 'F', hair: 2, skin: 0, hairColor: 4 }} gear={{ weapon: t, armor: t, head: t === 4 ? 'head_class' : 'head_flower' }} scale={4} />)}
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        {['slime_green', 'golem_stone', 'dragon_green', 'slime_purple', 'golem_lava', 'dragon_shadow'].map(b => <BossSprite key={b} bossKey={b} scale={3} />)}
      </div>
      <PetLab />
      {SPECIES_ORDER.map(sp => (
        <div key={sp} className="space-y-1">
          <div className="flex flex-wrap gap-2 items-end bg-[#3a3060] p-2">
            {[0, 1, 2, 3, 4].map(st => <PetView key={st} look={{ species: sp, color: 'c0', stage: st, outfit: {} }} scale={3} />)}
            <PetView look={{ species: sp, color: 'gold', stage: 4, outfit: {} }} scale={3} animate={false} />
            <PetView look={{ species: sp, color: 'pink', stage: 1, outfit: {} }} scale={3} animate={false} />
          </div>
          <div className="flex flex-wrap gap-1 items-end bg-[#4a6a3a] p-2">
            {PET_SPECIES[sp].colors.map((_, c) => <PetView key={'b' + c} look={{ species: sp, color: 'c' + c, stage: 0, outfit: {} }} scale={2.1} animate={false} />)}
            {PET_SPECIES[sp].colors.map((_, c) => <PetView key={'a' + c} look={{ species: sp, color: 'c' + c, stage: 3, outfit: {} }} scale={2.1} animate={false} />)}
          </div>
          <div className="flex flex-wrap gap-2 items-end bg-[#2a5040] p-2">
            {OUTFITS.map((o, i) => <PetView key={i} look={{ species: sp, color: 'c' + (i % 4), stage: i % 2 ? 0 : 3, outfit: o }} scale={3} animate={false} />)}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        {ICONS.map(i => <div key={i} className="flex flex-col items-center text-[10px] text-ink2"><Icon name={i} size={42} />{i}</div>)}
      </div>
    </div>
  )
}

// tepki ve kare denemesi
function PetLab() {
  const [r, setR] = useState<{ t: PetReaction | null; k: number }>({ t: null, k: 0 })
  const [sleep, setSleep] = useState(false)
  const play = (t: PetReaction) => setR(p => ({ t, k: p.k + 1 }))
  return (
    <div className="space-y-2 bg-[#2a2448] p-2">
      <div className="flex gap-2">
        {(['pat', 'happy', 'eat'] as const).map(t => <button key={t} className="pbtn" onClick={() => play(t)}>{t}</button>)}
        <button className="pbtn" onClick={() => setSleep(s => !s)}>{sleep ? 'uyandır' : 'uyut'}</button>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        {SPECIES_ORDER.map((sp, i) => <PetView key={sp} look={{ species: sp, color: 'c' + (i % 4), stage: i % 2 ? 0 : 3, outfit: {} }} scale={3} reaction={r.t} reactionKey={r.k} sleeping={sleep} />)}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        {SPECIES_ORDER.map((sp, i) => <PetView key={sp} look={{ species: sp, color: 'c' + (i % 4), stage: i % 2 ? 3 : 0, outfit: {} }} scale={2.1} reaction={r.t} reactionKey={r.k} sleeping={sleep} />)}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <PetView look={{ species: 'cat', color: 'c0', stage: 3, outfit: { HEAD: 'bow' } }} scale={6} reaction={r.t} reactionKey={r.k} sleeping={sleep} />
        <PetView look={{ species: 'dragon', color: 'c1', stage: 0, outfit: {} }} scale={6} reaction={r.t} reactionKey={r.k} sleeping={sleep} />
      </div>
      <div id="strips" className="flex flex-wrap gap-2 bg-[#5a5a7a] p-2">
        {SPECIES_ORDER.flatMap(sp => [0, 3].map(st => {
          const look: PetLook = { species: sp, color: 'c0', stage: st, outfit: {} }
          return <img key={sp + st} className="px" width={512} height={128} alt="" src={gridToURL('strip:' + sp + st, () => renderPetStrip(look))} />
        }))}
      </div>
    </div>
  )
}
