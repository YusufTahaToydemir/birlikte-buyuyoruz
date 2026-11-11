// Koleksiyon defteri (0022): anılar + zaman kapsülü, keşif kartları, çiçekler, dostlar ve süsler, canavarlar.
// Bulunmayanlar "?" görünür: boş kutular tamamlamaya çağırır.
import { useEffect, useState } from 'react'
import { capsuleWrite, getCollection, getMemories, type Collection, type MemoriesState } from '../lib/game'
import { BossSprite, Icon, SceneBg } from '../game/Sprite'
import { PetView } from '../game/Pet'
import { PET_ITEMS, PET_SPECIES, SPECIES_ORDER } from '../game/art/pets'
import { sfx } from '../game/sfx'
import { fx } from '../game/fx'
import { toastError, useGame } from '../game/ui'
import { CARDS, memoryText, RARITY, REGIONS, SEEDS } from '../game/world'
import { Flower } from './Garden'
import { Tip } from './Moments'

type Tab = 'mem' | 'cards' | 'flowers' | 'pets' | 'beasts'
const TABS: Array<{ id: Tab; name: string; icon: string }> = [
  { id: 'mem', name: 'Anılar', icon: 'scroll' }, { id: 'cards', name: 'Kartlar', icon: 'sparkle' }, { id: 'flowers', name: 'Çiçek', icon: 'flower' },
  { id: 'pets', name: 'Dost', icon: 'pet' }, { id: 'beasts', name: 'Canavar', icon: 'skull' },
]
const fmtDate = (s: string) => new Date(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })

export function Book({ onClose }: { onClose: () => void }) {
  const { game } = useGame()
  const [tab, setTab] = useState<Tab>('mem')
  const [col, setCol] = useState<Collection | null>(null)
  const [mem, setMem] = useState<MemoriesState | null>(null)
  useEffect(() => { getCollection().then(setCol).catch(toastError); getMemories().then(setMem).catch(toastError) }, [])

  const cardsOwned = col ? CARDS.filter(c => col.cards[c.key]).length : 0
  const flowersOwned = col ? SEEDS.filter(s => col.flowers[s.key]).length : 0
  return (
    <div className="fixed inset-0 z-[45] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label="Defter">
      <div className="mx-auto max-w-[520px] min-h-dvh px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-8 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="book" size={30} />
          <span className="font-pixel text-2xl flex-1">Defter</span>
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose() }} aria-label="Kapat">✕</button>
        </div>
        <div className="panel grid grid-cols-5 gap-0.5 p-1 sticky top-0 z-10">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { sfx.tab(); setTab(t.id) }} aria-pressed={tab === t.id}
              className={`h-12 rounded-[4px] flex flex-col items-center justify-center font-pixel text-[12px] ${tab === t.id ? 'bg-panel2 text-gold' : 'text-ink2'}`}
              style={tab === t.id ? { boxShadow: 'inset 0 -3px 0 #ffcc3a' } : undefined}>
              <Icon name={t.icon} size={22} />{t.name}
            </button>
          ))}
        </div>

        <Tip id="book-v4" icon="book" text="Birlikte bulduğunuz her şey burada; soru işaretleri sizi bekliyor." />
        {tab === 'mem' && <Memories mem={mem} setMem={setMem} />}

        {tab === 'cards' && col && (
          <>
            <div className="font-pixel text-center text-ink2">{cardsOwned} / {CARDS.length} kart</div>
            {REGIONS.map((rg, ri) => {
              const open = ri <= col.region
              return (
                <section key={rg.key} className="space-y-1.5">
                  <div className="font-pixel text-[15px] flex items-center gap-1" style={{ color: open ? rg.color : '#6a6f8a' }}><Icon name={open ? rg.icon : 'lock'} size={15} />{open ? rg.name : '???'}</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CARDS.filter(c => c.region === ri).map(c => {
                      const n = col.cards[c.key] ?? 0
                      return n > 0 ? (
                        <div key={c.key} className={`panel-dark overflow-hidden ${c.rarity === 3 ? 'card-rare' : ''}`}>
                          <div className="relative h-[52px]"><SceneBg className="absolute inset-0" seed={c.n * 13} region={c.region} /><span className="absolute inset-0 grid place-items-center"><Icon name={c.icon} size={30} className="glow" /></span>
                            {n > 1 && <span className="absolute top-0.5 right-0.5 font-pixel text-[11px] bg-black/60 px-1 rounded">×{n}</span>}</div>
                          <div className="font-pixel text-[11px] leading-tight text-center p-0.5 min-h-[26px] flex items-center justify-center" style={{ color: RARITY[c.rarity].color }}>{c.name}</div>
                        </div>
                      ) : (
                        <div key={c.key} className="panel-dark h-[82px] grid place-items-center font-pixel text-2xl text-[#4a4f6a]">?</div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
            <p className="font-pixel text-[13px] text-ink2 text-center">Kartları dostlarınız keşiften getirir. Nadir kartlar altın çerçevelidir.</p>
          </>
        )}

        {tab === 'flowers' && col && (
          <>
            <div className="font-pixel text-center text-ink2">{flowersOwned} / {SEEDS.length} çiçek</div>
            <div className="grid grid-cols-3 gap-2">
              {SEEDS.map(sd => {
                const n = col.flowers[sd.key] ?? 0
                return (
                  <div key={sd.key} className="panel-dark p-2 flex flex-col items-center gap-0.5">
                    {n > 0 ? <Flower seed={sd.key} stage={3} size={48} className="sway" /> : <span className="h-[48px] grid place-items-center font-pixel text-3xl text-[#4a4f6a]">?</span>}
                    <span className="font-pixel text-[13px] text-center leading-tight">{n > 0 ? sd.name : '???'}</span>
                    {n > 0 && <span className="font-pixel text-[12px] text-ink2">×{n}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'pets' && col && (
          <>
            <div className="font-pixel text-center text-ink2">{col.pets.length} / {SPECIES_ORDER.length * 4} dost</div>
            <div className="grid grid-cols-4 gap-1.5">
              {SPECIES_ORDER.flatMap(sp => PET_SPECIES[sp].colors.map((_, ci) => {
                const has = col.pets.some(p => p.species === sp && p.color === 'c' + ci)
                return (
                  <div key={sp + ci} className="panel-dark h-[72px] grid place-items-center">
                    {has ? <PetView look={{ species: sp, color: 'c' + ci, stage: 3, outfit: {} }} scale={1.9} />
                      : <span style={{ filter: 'brightness(0) opacity(.35)' }}><PetView look={{ species: sp, color: 'c' + ci, stage: 3, outfit: {} }} scale={1.9} animate={false} /></span>}
                  </div>
                )
              }))}
            </div>
            <div className="font-pixel text-center text-ink2 pt-2">{col.wardrobe.length} / {PET_ITEMS.filter(i => i.slot !== 'COLOR').length} süs</div>
            <div className="flex flex-wrap gap-1 justify-center">
              {PET_ITEMS.filter(i => i.slot !== 'COLOR').map(it => (
                <span key={it.key} className={`panel-dark px-1.5 py-0.5 font-pixel text-[13px] ${col.wardrobe.includes(it.key) ? 'text-gold' : 'text-[#4a4f6a]'}`}>{col.wardrobe.includes(it.key) ? it.name : '???'}</span>
              ))}
            </div>
          </>
        )}

        {tab === 'beasts' && col && (
          <>
            <div className="font-pixel text-center text-ink2">{col.bestiary.filter(b => b.defeated > 0).length} / {col.bestiary.length} canavar</div>
            <div className="grid grid-cols-3 gap-2">
              {col.bestiary.map(b => (
                <div key={b.key} className="panel-dark p-1.5 flex flex-col items-center gap-0.5">
                  {b.faced > 0 ? <BossSprite bossKey={b.key} scale={1.3} className={b.defeated ? '' : 'grayscale'} /> : <span className="h-[62px] grid place-items-center font-pixel text-3xl text-[#4a4f6a]">?</span>}
                  <span className="font-pixel text-[13px] text-center leading-tight">{b.faced > 0 ? b.name : '???'}</span>
                  {b.defeated > 0 && <span className="font-pixel text-[12px] text-gold flex items-center gap-0.5"><Icon name="swords" size={12} />×{b.defeated}{b.fastest ? ` · ${b.fastest} gün` : ''}</span>}
                </div>
              ))}
            </div>
          </>
        )}
        {!col && tab !== 'mem' && <div className="font-pixel text-ink2 text-center pt-10 blinkdot">Yükleniyor…</div>}
        <span className="sr-only">{game.today}</span>
      </div>
    </div>
  )
}

function Memories({ mem, setMem }: { mem: MemoriesState | null; setMem: (m: MemoriesState) => void }) {
  const { game } = useGame()
  const me = game.hero!, partner = game.partner
  const [text, setText] = useState('')
  const [months, setMonths] = useState(3)
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)
  const names = { me: 'Sen', partner: partner?.name, myId: me.id }
  const seal = async () => {
    setBusy(true)
    try { const r = await capsuleWrite(text.trim(), months); setMem(r); setText(''); setWriting(false); sfx.ticket(); fx.sparkle(window.innerWidth / 2, window.innerHeight / 2, 12, '#ffcc3a', 70) }
    catch (e) { toastError(e) } finally { setBusy(false) }
  }
  if (!mem) return <div className="font-pixel text-ink2 text-center pt-10 blinkdot">Yükleniyor…</div>
  const sealed = mem.capsules.filter(c => !c.open)
  return (
    <div className="space-y-3">
      {/* zaman kapsülü */}
      <section className="panel p-3 space-y-2" style={{ background: 'linear-gradient(#2a2146, #1f1838)' }}>
        <div className="flex items-center gap-2">
          <Icon name="chest" size={30} className={sealed.length ? 'glow' : ''} />
          <span className="font-pixel text-xl flex-1">Zaman kapsülü</span>
          {!writing && <button className="pbtn pbtn-gold !min-h-[40px] !px-3" onClick={() => { sfx.open(); setWriting(true) }}><Icon name="quill" size={20} />Yaz</button>}
        </div>
        {writing && (
          <div className="space-y-2 dropin">
            <textarea className="input font-pixel text-lg w-full min-h-[110px]" maxLength={1000} placeholder="Gelecekteki ikinize…" value={text} onChange={e => setText(e.target.value)} aria-label="Kapsül mektubu" />
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 3, 6, 12].map(m => (
                <button key={m} className={`pbtn ${months === m ? 'pbtn-purple' : 'pbtn-dark'} !min-h-[40px]`} onClick={() => { sfx.click(); setMonths(m) }}>{m} ay</button>
              ))}
            </div>
            <button className="pbtn pbtn-gold w-full" disabled={busy || !text.trim()} onClick={() => void seal()}><Icon name="lock" size={20} />Mühürle</button>
          </div>
        )}
        {sealed.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sealed.map(c => (
              <div key={c.id} className="panel-dark shrink-0 px-2 py-1.5 flex flex-col items-center gap-0.5 min-w-[92px]">
                <Icon name="chest" size={26} />
                <span className="font-pixel text-[12px] text-ink2">{c.author === me.id ? 'senden' : partner?.name ?? ''}</span>
                <span className="font-pixel text-[13px] text-gold">{fmtDate(c.openAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* açılmış kapsüller */}
      {mem.capsules.filter(c => c.open && c.text).map(c => (
        <div key={c.id} className="panel p-3 space-y-1 !border-gold">
          <div className="font-pixel text-[14px] text-ink2 flex items-center gap-1"><Icon name="scroll" size={14} />{c.author === me.id ? 'Sen yazmıştın' : `${partner?.name ?? ''} yazmıştı`} · {fmtDate(c.createdAt)}</div>
          <p className="font-pixel text-lg leading-snug whitespace-pre-wrap">{c.text}</p>
        </div>
      ))}

      {/* anı kartları */}
      <div className="relative pl-5 space-y-2">
        <span className="absolute left-2 top-2 bottom-2 w-[3px] bg-edge rounded" aria-hidden="true" />
        {mem.memories.map(m => {
          const t = memoryText(m.kind, m.data, names)
          return (
            <div key={m.id} className="relative panel p-2 flex items-center gap-2">
              <span className="absolute -left-[19px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-edge" style={{ background: t.color }} />
              <span className="panel-dark w-[44px] h-[44px] grid place-items-center shrink-0"><Icon name={t.icon} size={30} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-pixel text-[17px] leading-tight" style={{ color: t.color }}>{t.title}</span>
                <span className="block font-pixel text-[13px] text-ink2">{fmtDate(m.at)}</span>
              </span>
            </div>
          )
        })}
        {mem.memories.length === 0 && <p className="font-pixel text-ink2 text-center">Birlikte yaşadıklarınız burada birikecek.</p>}
      </div>
    </div>
  )
}
