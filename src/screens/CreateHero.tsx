// Kahraman oluşturma: sınıf → görünüm → ad ve zorluk.
import { useState } from 'react'
import { createHero, type Game } from '../lib/game'
import { CLASS_INFO, HAIR, HIJAB, SKIN, type HeroClass, type Look } from '../game/art/hero'
import { HeroSprite, Icon, Portrait } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Stars, toastError } from '../game/ui'
import { CAT_INFO, type Category } from '../lib/game'

const CLASSES: HeroClass[] = ['WARRIOR', 'MAGE', 'RANGER', 'HEALER']
const CLASS_PERK: Record<HeroClass, string> = {
  WARRIOR: 'Spor görevlerinde +%10',
  MAGE: 'Okuma ve öğrenmede +%10',
  RANGER: 'Düzen ve sürprizlerde +%10',
  HEALER: 'İbadette +%10 · her gün bedava şifa',
}
export const DIFFICULTIES = [
  { n: 1, name: 'Çırak', mult: 1.0, damage: 2 },
  { n: 2, name: 'Acemi', mult: 1.1, damage: 2.25 },
  { n: 3, name: 'Yiğit', mult: 1.35, damage: 2.5 },
  { n: 4, name: 'Kahraman', mult: 1.7, damage: 2.5 },
  { n: 5, name: 'Efsane', mult: 2.1, damage: 2.75 },
  { n: 6, name: 'Destansı', mult: 2.6, damage: 3 },
]
// Zorluğa göre açılan alanlar (5: Duha/teheccüd, 6: kaza namazı)
export const DIFF_UNLOCKS: Record<number, string[]> = { 1: ['moon', 'book', 'sword'], 2: ['sun', 'beads'], 3: ['lamp', 'apple'], 4: ['nocandy'], 5: ['nophone', 'sparkle'], 6: ['pray'] }

export function CreateHero({ onDone }: { onDone: (g: Game) => void }) {
  const [step, setStep] = useState(0)
  const [cls, setCls] = useState<HeroClass>('WARRIOR')
  const [look, setLook] = useState<Look>({ gender: 'F', skin: 0, hair: 0, hairColor: 1 })
  const [name, setName] = useState('')
  const [diff, setDiff] = useState(2)
  const [busy, setBusy] = useState(false)

  const next = () => { sfx.tab(); setStep(s => s + 1) }
  const finish = async () => {
    setBusy(true)
    try {
      const g = await createHero(name.trim(), cls, look, diff)
      sfx.levelUp(); fx.confetti(90); fx.flash('rgba(255,215,90,.4)')
      onDone(g)
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="px-3 pt-[calc(14px+env(safe-area-inset-top))] pb-8 space-y-4">
      <div className="flex justify-center gap-2" aria-label={`Adım ${step + 1}/3`}>
        {[0, 1, 2].map(i => <span key={i} className={`h-3 w-10 border-2 border-edge rounded-[2px] ${i <= step ? 'bg-gold' : 'bg-panel'}`} />)}
      </div>

      {step === 0 && (
        <>
          <h1 className="font-pixel text-3xl text-center">Sınıfını seç</h1>
          <div className="grid grid-cols-2 gap-2">
            {CLASSES.map(c => {
              const info = CLASS_INFO[c]
              const sel = c === cls
              return (
                <button key={c} className={`panel p-2 flex flex-col items-center relative overflow-hidden ${sel ? '!border-gold' : 'opacity-80'}`} onClick={() => { sfx.click(); setCls(c) }} aria-pressed={sel}>
                  {sel && <div className="absolute inset-[-60%] rays opacity-30" />}
                  <div className="relative"><HeroSprite cls={c} look={look} scale={3} pose={sel ? 'joy' : undefined} /></div>
                  <span className="relative font-pixel text-xl" style={{ color: info.color }}>{info.name}</span>
                  <span className="relative flex items-center gap-1 text-[14px] text-ink2 text-center leading-tight min-h-[30px]"><Icon name={CAT_INFO[info.stat as Category].icon} size={16} />{CLASS_PERK[c]}</span>
                </button>
              )
            })}
          </div>
          <button className="pbtn pbtn-gold w-full text-xl" onClick={next}>İleri ▶</button>
        </>
      )}

      {step === 1 && (
        <>
          <div className="panel relative overflow-hidden flex justify-center py-3">
            <div className="absolute inset-[-60%] rays opacity-25" />
            <div className="relative"><HeroSprite cls={cls} look={look} scale={5} /></div>
          </div>
          <LookEditor cls={cls} look={look} onChange={setLook} />
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button className="pbtn pbtn-dark" onClick={() => { sfx.undo(); setStep(0) }}>◀</button>
            <button className="pbtn pbtn-gold text-xl" onClick={next}>İleri ▶</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex items-center gap-3">
            <div className="panel-dark p-1"><Portrait cls={cls} look={look} size={64} /></div>
            <input className="input font-pixel text-xl" placeholder="Kahramanının adı" maxLength={24} value={name} onChange={e => setName(e.target.value)} aria-label="Ad" />
          </div>
          <h2 className="font-pixel text-2xl text-center">Zorluk</h2>
          <DifficultyPicker value={diff} onChange={setDiff} />
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button className="pbtn pbtn-dark" onClick={() => { sfx.undo(); setStep(1) }}>◀</button>
            <button className="pbtn pbtn-green text-xl" disabled={busy || name.trim().length === 0} onClick={() => void finish()}>
              <Icon name="swords" size={24} />Maceraya başla!
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function LookEditor({ cls, look, onChange }: { cls: HeroClass; look: Look; onChange: (l: Look) => void }) {
  const set = (p: Partial<Look>) => { sfx.click(); onChange({ ...look, ...p }) }
  const g = look.gender ?? 'F'
  const hairPal = g === 'F' && look.hair === 2 ? HIJAB : HAIR
  return (
    <div className="panel p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['F', 'M'] as const).map(x => (
          <button key={x} className={`panel-dark py-1 flex justify-center ${g === x ? '!border-gold' : 'opacity-60'}`} onClick={() => set({ gender: x, hair: 0 })} aria-pressed={g === x} aria-label={x === 'F' ? 'Kadın' : 'Erkek'}>
            <Portrait cls={cls} look={{ ...look, gender: x, hair: 0 }} size={52} />
            <span className="font-pixel text-3xl self-center ml-2" style={{ color: x === 'F' ? '#ff8ab5' : '#6aa8ff' }}>{x === 'F' ? '♀' : '♂'}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <button key={i} className={`panel-dark py-1 flex justify-center ${look.hair === i ? '!border-gold' : 'opacity-60'}`} onClick={() => set({ hair: i })} aria-pressed={look.hair === i} aria-label={`Saç ${i + 1}`}>
            <Portrait cls={cls} look={{ ...look, hair: i }} size={48} />
          </button>
        ))}
      </div>
      <div className="flex justify-between gap-1">
        {SKIN.map((p, i) => (
          <button key={i} className={`h-10 flex-1 border-[3px] rounded-[4px] ${look.skin === i ? 'border-gold scale-110' : 'border-edge'}`} style={{ background: p.S }} onClick={() => set({ skin: i })} aria-label={`Ten ${i + 1}`} />
        ))}
      </div>
      <div className="flex justify-between gap-1">
        {hairPal.map((p, i) => (
          <button key={i} className={`h-10 flex-1 border-[3px] rounded-[4px] ${look.hairColor === i ? 'border-gold scale-110' : 'border-edge'}`} style={{ background: `linear-gradient(${p.L}, ${p.H} 50%, ${p.h})` }} onClick={() => set({ hairColor: i })} aria-label={`Renk ${i + 1}`} />
        ))}
      </div>
    </div>
  )
}

export function DifficultyPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DIFFICULTIES.map(d => {
        const sel = d.n === value
        return (
          <button key={d.n} className={`panel p-2 text-left space-y-1 ${sel ? '!border-gold !bg-panel2' : ''}`} onClick={() => { sfx.click(); onChange(d.n) }} aria-pressed={sel}>
            <div className="flex items-center justify-between">
              <span className={`font-pixel text-lg ${sel ? 'text-gold' : ''}`}>{d.name}</span>
            </div>
            <Stars n={d.n} size={11} />
            <div className="flex items-center gap-2 font-pixel text-[15px]">
              <span className="text-gold flex items-center gap-0.5"><Icon name="coin" size={13} />×{d.mult}</span>
              <span className="text-hp flex items-center gap-0.5"><Icon name="heart" size={13} />-{d.damage}</span>
            </div>
            <div className="flex gap-0.5 flex-wrap">
              {Object.entries(DIFF_UNLOCKS).filter(([k]) => Number(k) <= d.n).flatMap(([, v]) => v).map((ic, i) => <Icon key={i} name={ic} size={14} />)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
