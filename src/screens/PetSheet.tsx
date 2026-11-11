// Yuva: ortak evcil dostlar. Birlikte sahiplenirsiniz (yarı yarıya), sever ve birlikte yaptıklarınızla büyütürsünüz,
// ortak gardıroptan giydirirsiniz. Her dost evresine göre XP ve canavar hasarına küçük bir güç verir.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPets, LOVE_REASON, petAdoptCancel, petAdoptConfirm, petAdoptStart, petBuyItem, petDress, petExplore, petExploreClaim, petPat, petRename, petSendLetter, type Loot, type Pet, type PetsState } from '../lib/game'
import { cardOf, RARITY, REGIONS, regionOf, seedOf, storyOf } from '../game/world'
import { Flower } from './Garden'
import { Tip } from './Moments'
import { PET_ITEMS, PET_SPECIES, SLOT_INFO, SPECIES_ORDER, STAGES, type PetItem, type PetLook, type PetSlot, type PetSpecies } from '../game/art/pets'
import { PetView } from '../game/Pet'
import { Icon, SceneBg } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Bar, Sheet, toast, toastError, useGame } from '../game/ui'

const lookOf = (p: Pet, over?: Partial<PetLook>): PetLook => ({ species: p.species, color: p.color, stage: p.stage, outfit: p.outfit, ...over })
const SLOTS: PetSlot[] = ['HEAD', 'NECK', 'FACE', 'BACK', 'AURA']

export function PetSheet({ onClose }: { onClose: () => void }) {
  const { game, refresh } = useGame()
  const me = game.hero!, partner = game.partner
  const [st, setSt] = useState<PetsState | null>(null)
  const [sel, setSel] = useState<string | null>(null)      // seçili dost; 'new' = sahiplenme
  const [busy, setBusy] = useState(false)
  const [hatch, setHatch] = useState<PetLook | null>(null)

  const load = useCallback(async () => { try { setSt(await getPets()) } catch (e) { toastError(e) } }, [])
  useEffect(() => { void load() }, [load, game.events.length])
  useEffect(() => { if (st && sel === null) setSel(st.pending || st.pets.length === 0 ? 'new' : st.pets[0].id) }, [st, sel])

  const act = useCallback(async (fn: () => Promise<PetsState>, good?: (r: PetsState) => void) => {
    setBusy(true)
    try { const r = await fn(); setSt(r); good?.(r); void refresh(); return r } catch (e) { toastError(e); return null } finally { setBusy(false) }
  }, [refresh])

  const pet = st?.pets.find(p => p.id === sel) ?? null
  const showNew = sel === 'new' || !pet

  return (
    <div className="fixed inset-0 z-[45] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label="Yuva">
      <div className="mx-auto max-w-[520px] min-h-dvh px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-8 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="pet" size={30} />
          <span className="font-pixel text-2xl flex-1">Yuva</span>
          {st && st.bonus > 0 && (
            <span className="panel-dark px-2 py-1 font-pixel text-[15px] flex items-center gap-1" title="Dostlarınızın gücü: XP ve canavar hasarı">
              <Icon name="star" size={15} /><Icon name="sword" size={15} /><span className="text-gold">+%{st.bonus}</span>
            </span>
          )}
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose() }} aria-label="Kapat">✕</button>
        </div>

        {!st ? <div className="font-pixel text-ink2 text-center pt-16 blinkdot">Yükleniyor…</div> : (
          <>
            <Tip id="pets-v4" icon="pet" text="Dostunu sev, keşfe gönder ya da eşine elçi olarak yolla." />
            {/* dost seçici */}
            {(st.pets.length > 0 || st.pending) && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {st.pets.map(p => (
                  <button key={p.id} onClick={() => { sfx.tab(); setSel(p.id) }} aria-label={p.name}
                    className={`panel shrink-0 w-[72px] h-[78px] flex flex-col items-center justify-end pb-1 relative ${sel === p.id ? '!border-gold !bg-panel2' : ''}`}>
                    {!p.patMe && <span className="absolute top-1 right-1"><Icon name="heart" size={14} className="blinkdot" /></span>}
                    <PetView look={lookOf(p)} scale={2} animate={sel === p.id} />
                    <span className="font-pixel text-[12px] truncate max-w-full px-1">{p.name}</span>
                  </button>
                ))}
                {st.pets.length < st.cfg.maxSlots && (
                  <button onClick={() => { sfx.tab(); setSel('new') }} aria-label="Yeni dost"
                    className={`panel shrink-0 w-[72px] h-[78px] flex flex-col items-center justify-center gap-1 ${sel === 'new' ? '!border-gold !bg-panel2' : ''}`}>
                    {st.pending ? <Icon name="egg" size={34} className="egg-wobble" /> : st.pets.length >= st.slots ? <Icon name="lock" size={28} className="opacity-60" /> : <span className="font-pixel text-4xl text-gold leading-none">+</span>}
                    <span className="font-pixel text-[12px] text-ink2">{st.pets.length}/{st.slots}</span>
                  </button>
                )}
              </div>
            )}

            {hatch ? <Hatch look={hatch} onDone={() => { setHatch(null); setSel(null); void load() }} />
              : showNew ? <Adopt st={st} me={me.id} partnerName={partner?.name ?? 'Eşin'} busy={busy} gold={me.gold} hasPartner={!!partner}
                  onStart={(sp, c, n) => act(() => petAdoptStart(sp, c, n), () => { sfx.buy(); fx.sparkle(window.innerWidth / 2, window.innerHeight / 2, 12, '#ff8ab5') })}
                  onConfirm={id => act(() => petAdoptConfirm(id), r => { const p = r.pets[r.pets.length - 1]; if (p) setHatch(lookOf(p)) })}
                  onCancel={id => act(() => petAdoptCancel(id), () => sfx.undo())} />
                : pet && <PetMain pet={pet} st={st} partnerName={partner?.name ?? 'Eşin'} busy={busy} act={act} gold={me.gold} />}

            {/* son sevgiler */}
            {st.log.length > 0 && !showNew && (
              <div className="flex flex-wrap gap-1 justify-center">
                {st.log.slice(0, 6).map((l, i) => (
                  <span key={i} className="panel-dark px-1.5 py-0.5 font-pixel text-[13px] flex items-center gap-1">
                    <Icon name={LOVE_REASON[l.reason]?.icon ?? 'heart'} size={14} />{LOVE_REASON[l.reason]?.name ?? ''} <span className="text-hp">+{l.amount}</span>
                  </span>
                ))}
              </div>
            )}
            {!showNew && (
              <p className="font-pixel text-[13px] text-ink2 text-center leading-snug">
                Birlikte yaptığınız her şey dostlarınızı büyütür. Her dost evresine göre +%1–6 XP ve hasar verir (en çok %{st.cfg.cap}, ertesi günden).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- dostun sayfası
function PetMain({ pet, st, partnerName, busy, act, gold }: {
  pet: Pet; st: PetsState; partnerName: string; busy: boolean; gold: number
  act: (fn: () => Promise<PetsState>, good?: (r: PetsState) => void) => Promise<PetsState | null>
}) {
  const { game } = useGame()
  const [react, setReact] = useState<{ t: 'pat' | 'happy' | 'eat'; k: number }>({ t: 'pat', k: 0 })
  const bump = (t: 'pat' | 'happy' | 'eat') => setReact(o => ({ t, k: o.k + 1 }))
  const [slot, setSlot] = useState<PetSlot>('HEAD')
  const [exploreOpen, setExploreOpen] = useState(false)
  const [letterOpen, setLetterOpen] = useState(false)
  const [loot, setLoot] = useState<Loot | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!pet.away) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [pet.away])
  const awayLeft = pet.away ? Math.max(0, new Date(pet.away.endsAt).getTime() - now) : 0
  const region = game.world?.region ?? 0
  const [buy, setBuy] = useState<PetItem | null>(null)
  const [rename, setRename] = useState(false)
  const [name, setName] = useState(pet.name)
  const stages = st.cfg.stages
  const cur = stages[pet.stage] ?? 0, next = stages[pet.stage + 1]
  const maxStage = Math.max(...st.pets.map(p => p.stage))
  const sp = PET_SPECIES[pet.species]

  const pat = async (e: React.MouseEvent<HTMLElement>) => {
    const at = fx.fromEl(e.currentTarget)
    bump('pat')
    if (pet.patMe) { sfx.tick(); fx.sparkle(at.x, at.y - 20, 4, '#ff8ab5', 30); return }
    await act(() => petPat(pet.id), r => {
      const p = r.pets.find(x => x.id === pet.id)
      sfx.heal(); navigator.vibrate?.(25)
      fx.burst(at.x, at.y - 20, '#ff6aa8', 14, 70)
      fx.float(`+${st.cfg.patLove + (p?.patPartner ? st.cfg.patBoth : 0)} ❤`, at.x, at.y - 60, '#ff6aa8', true)
      if (p && p.stage > pet.stage) { sfx.levelUp(); fx.confetti(90) }
      window.setTimeout(() => bump('happy'), 700)
    })
  }

  const claim = async () => {
    if (!pet.away) return
    setBusyLocal(true)
    try {
      const r = await petExploreClaim(pet.away.id)
      sfx.open(); sfx.levelUp(); fx.confetti(60); navigator.vibrate?.([20, 40, 20])
      setLoot(r.loot); bump('happy')
      void act(async () => r)
    } catch (e) { toastError(e) } finally { setBusyLocal(false) }
  }
  const [busyLocal, setBusyLocal] = useState(false)

  const wear = async (it: PetItem) => {
    const on = pet.outfit[it.slot as PetSlot] === it.key
    await act(() => petDress(pet.id, it.slot as PetSlot, on ? null : it.key), () => { if (on) sfx.undo(); else { sfx.buy(); bump('happy') } })
  }

  const items = PET_ITEMS.filter(i => i.slot === slot)
  return (
    <>
      {/* sahne */}
      <section className="panel overflow-hidden relative h-[236px]">
        <SceneBg className="absolute inset-0" seed={pet.name.length + 3} region={pet.away ? pet.away.region : region} />
        <div className="absolute top-2 left-2 panel-dark px-2 py-1 font-pixel text-[14px] flex items-center gap-2">
          <span className="flex items-center gap-0.5" title="Sen"><Icon name="heart" size={14} className={pet.patMe ? '' : 'opacity-30 grayscale'} />sen</span>
          <span className="flex items-center gap-0.5" title={partnerName}><Icon name="heart" size={14} className={pet.patPartner ? '' : 'opacity-30 grayscale'} />{partnerName}</span>
        </div>
        <div className="absolute top-2 right-2 panel-dark px-2 py-1 font-pixel text-[14px] text-gold">{STAGES[pet.stage]}</div>
        {pet.away ? (
          awayLeft > 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="panel-dark px-3 py-2 flex flex-col items-center gap-1">
                <Icon name="bag" size={40} className="bob" />
                <span className="font-pixel text-lg">{pet.name} keşifte</span>
                <span className="font-pixel text-[15px] text-ink2 flex items-center gap-1"><Icon name={regionOf(pet.away.region).icon} size={14} />{regionOf(pet.away.region).name}</span>
                <span className="font-pixel text-2xl text-gold">{fmtLeft(awayLeft)}</span>
              </div>
            </div>
          ) : (
            <button className="absolute left-1/2 bottom-[14px] -translate-x-1/2 flex flex-col items-center walkin" onClick={() => void claim()} disabled={busyLocal} aria-label={`${pet.name} döndü`}>
              <span className="panel-dark px-2 py-0.5 font-pixel text-[15px] text-gold bob flex items-center gap-1 mb-1"><Icon name="bag" size={16} />Döndü! Karşıla</span>
              <PetView look={lookOf(pet)} scale={5.2} reaction="happy" reactionKey={1} />
            </button>
          )
        ) : (
          <>
            <button className="absolute left-1/2 bottom-[14px] -translate-x-1/2" onClick={e => void pat(e)} disabled={busy} aria-label={`${pet.name}'i sev`}>
              <PetView look={lookOf(pet)} scale={5.2} reaction={react.t} reactionKey={react.k} />
            </button>
            {!pet.patMe && <span className="absolute left-1/2 top-[34px] -translate-x-1/2 font-pixel text-[15px] text-ink panel-dark px-2 py-0.5 bob pointer-events-none flex items-center gap-1"><Icon name="hand" size={16} />Sev</span>}
          </>
        )}
      </section>

      {/* keşif + elçi */}
      <div className="grid grid-cols-2 gap-2">
        <button className="pbtn pbtn-purple !min-h-[56px]" disabled={busy || !!pet.away} onClick={() => { sfx.open(); setExploreOpen(true) }}>
          <Icon name="map" size={26} />Keşfe gönder
        </button>
        <button className="pbtn pbtn-dark !min-h-[56px] relative" disabled={busy || !!pet.away || !game.partner} onClick={() => { sfx.open(); setLetterOpen(true) }}>
          <Icon name="scroll" size={26} />Elçi
          <span className="absolute top-1 right-1.5 font-pixel text-[12px] text-ink2">{Math.max(0, 3 - (game.lettersToday ?? 0))}</span>
        </button>
      </div>

      <ExploreSheet open={exploreOpen} onClose={() => setExploreOpen(false)} pet={pet} region={region} busy={busy}
        onGo={reg => void act(() => petExplore(pet.id, reg), () => { sfx.open(); setExploreOpen(false); toast(`${pet.name} ${regionOf(reg).name} yolunda!`) })} />
      <LetterSheet open={letterOpen} onClose={() => setLetterOpen(false)} pet={pet} partnerName={partnerName} busy={busy}
        onSend={(kind, text) => void act(() => petSendLetter(pet.id, kind, text), () => { sfx.sparkle(); setLetterOpen(false); bump('happy'); toast(`${pet.name} yola çıktı · ${partnerName} açınca görecek`) })} />
      {loot && <LootReveal loot={loot} onClose={() => setLoot(null)} />}

      {/* ad + sevgi çubuğu */}
      <div className="panel p-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <button className="font-pixel text-2xl flex-1 text-left truncate" onClick={() => { sfx.click(); setName(pet.name); setRename(true) }}>{pet.name} <span className="text-ink2 text-[14px]">✎</span></button>
          <span className="font-pixel text-[14px] text-ink2">{sp.name}</span>
          <span className="font-pixel text-[14px] flex items-center gap-0.5"><Icon name="star" size={14} /><Icon name="sword" size={14} /><span className="text-gold">+%{st.cfg.bonus[pet.stage]}</span></span>
        </div>
        <Bar value={next ? pet.love - cur : 1} max={next ? next - cur : 1} color="#ff6aa8" h={18}
          label={<span className="flex items-center gap-1"><Icon name="heart" size={13} />{next ? `${pet.love - cur} / ${next - cur} → ${STAGES[pet.stage + 1]}` : `${pet.love} · Efsanevi`}</span>} />
        <div className="flex justify-between">
          {STAGES.map((s, i) => <span key={s} className={`font-pixel text-[12px] ${i <= pet.stage ? 'text-gold' : 'text-ink2 opacity-50'}`}>{s}</span>)}
        </div>
      </div>

      {/* gardırop */}
      <section className="panel p-2.5 space-y-2">
        <div className="grid grid-cols-5 gap-1">
          {SLOTS.map(s => (
            <button key={s} onClick={() => { sfx.tab(); setSlot(s) }} aria-label={SLOT_INFO[s].name}
              className={`h-12 rounded-[4px] flex flex-col items-center justify-center font-pixel text-[11px] ${slot === s ? 'bg-panel2 text-gold' : 'text-ink2'}`}
              style={slot === s ? { boxShadow: 'inset 0 -3px 0 #ffcc3a' } : undefined}>
              <Icon name={SLOT_INFO[s].icon} size={22} />{SLOT_INFO[s].name}
            </button>
          ))}
        </div>
        {(
          <div className="grid grid-cols-3 gap-2">
            {items.map(it => (
              <ItemCard key={it.key} it={it} pet={pet} owned={st.wardrobe.includes(it.key)} on={pet.outfit[it.slot as PetSlot] === it.key} locked={maxStage < it.stage} gold={gold} busy={busy}
                preview={lookOf(pet, { outfit: { ...pet.outfit, [it.slot]: it.key } })} onWear={() => void wear(it)} onBuy={() => setBuy(it)} />
            ))}
          </div>
        )}
        <p className="font-pixel text-[12px] text-ink2 text-center">Gardırop ortak: bir kez alınır, bütün dostlarınızda kullanılır.</p>
      </section>

      <Sheet open={!!buy} onClose={() => setBuy(null)} title={buy?.name}>
        {buy && (
          <div className="space-y-4">
            <div className="panel-dark flex justify-center py-4 relative overflow-hidden">
              <div className="absolute inset-[-60%] rays opacity-25" />
              <div className="relative"><PetView look={lookOf(pet, { outfit: { ...pet.outfit, [buy.slot]: buy.key } })} scale={6} /></div>
            </div>
            <button className="pbtn pbtn-gold w-full text-xl" disabled={busy || gold < buy.price}
              onClick={() => void act(() => petBuyItem(buy.key), () => {
                sfx.buy(); sfx.coin(); fx.confetti(40)
                const s = fx.fromEl(document.getElementById('hud-gold')); fx.float(`-${buy.price}`, s.x, s.y + 24, '#ffcc3a', true)
                const it = buy; setBuy(null); void wear(it)
              })}>
              Al ve giydir <Icon name="coin" size={24} />{buy.price}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={rename} onClose={() => setRename(false)} title="Dostunun adı">
        <div className="space-y-3">
          <input className="input font-pixel text-xl" maxLength={16} value={name} onChange={e => setName(e.target.value)} aria-label="Ad" autoFocus />
          <button className="pbtn pbtn-gold w-full" disabled={busy || !name.trim()} onClick={() => void act(() => petRename(pet.id, name.trim()), () => { sfx.good(); setRename(false) })}>Kaydet</button>
        </div>
      </Sheet>
    </>
  )
}

const fmtLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}sa ${m % 60}dk` : `${m} dk` }

/** Keşif yeri seçimi: açık bölgeler; sisli olanlar kilitli */
function ExploreSheet({ open, onClose, pet, region, busy, onGo }: { open: boolean; onClose: () => void; pet: Pet; region: number; busy: boolean; onGo: (r: number) => void }) {
  const [pick, setPick] = useState(region)
  useEffect(() => { if (open) setPick(region) }, [open, region])
  const left = 2 - (pet.tripsToday ?? 0)
  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Icon name="map" size={26} />Nereye gitsin?</span>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {REGIONS.map((rg, i) => {
            const locked = i > region
            return (
              <button key={rg.key} disabled={locked} onClick={() => { sfx.click(); setPick(i) }} aria-label={locked ? 'Sisli bölge' : rg.name}
                className={`panel-dark overflow-hidden relative h-[74px] ${pick === i && !locked ? '!border-gold' : ''}`}>
                {locked ? <div className="absolute inset-0 map-fog grid place-items-center font-pixel text-2xl text-[#5a5f7a]">?</div> : (
                  <>
                    <SceneBg className="absolute inset-0" seed={i * 7 + 3} region={i} />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/55 font-pixel text-[12px] leading-tight py-0.5 text-center">{rg.name}</span>
                  </>
                )}
              </button>
            )
          })}
        </div>
        <div className="panel-dark p-2 flex items-center justify-around font-pixel text-[15px]">
          <span className="flex items-center gap-1"><Icon name="moon" size={16} />4 saat</span>
          <span className="flex items-center gap-1"><Icon name="coin" size={16} />ikinize</span>
          <span className="flex items-center gap-1"><Icon name="sparkle" size={16} />kart</span>
          <span className="flex items-center gap-1"><Icon name="flower" size={16} />tohum</span>
        </div>
        <button className="pbtn pbtn-purple w-full text-xl" disabled={busy || left <= 0} onClick={() => onGo(pick)}>
          <Icon name="bag" size={24} />{left > 0 ? `Uğurla · bugün ${left}` : 'Bugün yoruldu'}
        </button>
      </div>
    </Sheet>
  )
}

/** Elçi: dost eşine kalp ya da kısa not götürür */
function LetterSheet({ open, onClose, pet, partnerName, busy, onSend }: { open: boolean; onClose: () => void; pet: Pet; partnerName: string; busy: boolean; onSend: (k: 'HEART' | 'NOTE', t: string | null) => void }) {
  const [text, setText] = useState('')
  useEffect(() => { if (open) setText('') }, [open])
  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Icon name="scroll" size={26} />{partnerName}'e götürsün</span>}>
      <div className="space-y-3">
        <div className="panel-dark flex justify-center py-3 relative overflow-hidden">
          <div className="relative"><PetView look={lookOf(pet)} scale={4} /></div>
          <span className="absolute right-[30%] top-3 envelope"><Icon name="scroll" size={26} /></span>
        </div>
        <button className="pbtn pbtn-red w-full text-xl" disabled={busy} onClick={() => onSend('HEART', null)}><Icon name="heart" size={24} />Kalp gönder</button>
        <div className="flex gap-2">
          <input className="input font-pixel text-lg flex-1" maxLength={80} placeholder="Tek satır not…" value={text} onChange={e => setText(e.target.value)} aria-label="Not" />
          <button className="pbtn pbtn-gold !px-3" disabled={busy || !text.trim()} onClick={() => onSend('NOTE', text.trim())} aria-label="Notu gönder"><Icon name="scroll" size={22} /></button>
        </div>
      </div>
    </Sheet>
  )
}

/** Keşiften dönüş: hikâye, altın, kart çevirme, tohum */
function LootReveal({ loot, onClose }: { loot: Loot; onClose: () => void }) {
  const card = loot.card ? cardOf(loot.card) : null
  const seed = loot.seed ? seedOf(loot.seed) : null
  const [flip, setFlip] = useState(false)
  useEffect(() => { const t = window.setTimeout(() => { setFlip(true); if (card) { if (card.rarity === 3) { sfx.levelUp(); fx.confetti(80) } else sfx.sparkle() } }, 900); return () => clearTimeout(t) }, [card])
  const look: PetLook = { species: loot.species, color: loot.color, stage: loot.stage, outfit: loot.outfit ?? {} }
  return (
    <div className="fixed inset-0 z-[55] bg-black/75 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="panel w-full max-w-[400px] p-4 space-y-3 dropin" onClick={e => e.stopPropagation()}>
        <div className="relative h-[120px] panel-dark overflow-hidden">
          <SceneBg className="absolute inset-0" seed={loot.story + 11} region={loot.region} />
          <div className="absolute left-1/2 bottom-2 -translate-x-1/2"><PetView look={look} scale={3.4} reaction="happy" reactionKey={1} /></div>
        </div>
        <p className="font-pixel text-lg text-center leading-snug">{storyOf(loot.region, loot.story, loot.name)}</p>
        <div className="flex justify-center gap-2 flex-wrap">
          <span className="panel-dark px-2 py-1 font-pixel text-lg text-gold flex items-center gap-1"><Icon name="coin" size={20} />+{loot.gold} ikinize</span>
          <span className="panel-dark px-2 py-1 font-pixel text-lg text-hp flex items-center gap-1"><Icon name="heart" size={20} />+{loot.love}</span>
          {seed && <span className="panel-dark px-2 py-1 font-pixel text-lg flex items-center gap-1"><Flower seed={seed.key} stage={0} size={22} />{seed.name} tohumu</span>}
        </div>
        {card && (
          <div className="flex justify-center" style={{ perspective: 600 }}>
            {flip ? (
              <div className={`cardflip w-[150px] panel-dark overflow-hidden ${card.rarity === 3 ? 'card-rare' : ''}`}>
                <div className="relative h-[84px]"><SceneBg className="absolute inset-0" seed={card.n * 13} region={card.region} />
                  <span className="absolute inset-0 grid place-items-center"><Icon name={card.icon} size={44} className="glow" /></span></div>
                <div className="p-1.5 text-center">
                  <div className="font-pixel text-[15px] leading-tight">{card.name}</div>
                  <div className="font-pixel text-[12px]" style={{ color: RARITY[card.rarity].color }}>{loot.newCard ? 'YENİ · ' : ''}{RARITY[card.rarity].name}</div>
                </div>
              </div>
            ) : <div className="w-[150px] h-[128px] panel-dark grid place-items-center"><Icon name="sparkle" size={40} className="wiggle" /></div>}
          </div>
        )}
        <button className="pbtn pbtn-gold w-full text-xl" onClick={() => { sfx.click(); onClose() }}>Yaşasın!</button>
      </div>
    </div>
  )
}

function ItemCard({ it, owned, on, locked, gold, busy, preview, onWear, onBuy }: {
  it: PetItem; pet: Pet; owned: boolean; on: boolean; locked: boolean; gold: number; busy: boolean; preview: PetLook; onWear: () => void; onBuy: () => void
}) {
  return (
    <button disabled={busy} onClick={() => { sfx.click(); if (owned) onWear(); else if (locked) toast(`Bir dostunuz ${STAGES[it.stage]} olmalı`); else onBuy() }}
      className={`panel-dark p-1.5 flex flex-col items-center gap-0.5 relative ${on ? '!border-gold !bg-panel2' : ''} ${locked && !owned ? 'opacity-55' : ''}`}>
      <PetView look={preview} scale={2.2} animate={false} />
      <span className="font-pixel text-[13px] leading-tight text-center h-[28px] flex items-center">{it.name}</span>
      {owned ? <span className={`font-pixel text-[13px] flex items-center gap-1 ${on ? 'text-gold' : 'text-ok'}`}><Icon name="check" size={13} />{on ? 'Üstünde' : 'Giydir'}</span>
        : locked ? <span className="font-pixel text-[13px] text-ink2 flex items-center gap-1"><Icon name="lock" size={12} />{STAGES[it.stage]}</span>
          : <span className={`font-pixel text-[14px] flex items-center gap-1 ${gold >= it.price ? 'text-gold' : 'text-hp'}`}><Icon name="coin" size={13} />{it.price}</span>}
    </button>
  )
}

// ---------------------------------------------------------------- sahiplenme
function Adopt({ st, me, partnerName, busy, gold, hasPartner, onStart, onConfirm, onCancel }: {
  st: PetsState; me: string; partnerName: string; busy: boolean; gold: number; hasPartner: boolean
  onStart: (sp: PetSpecies, color: string, name: string) => void; onConfirm: (id: string) => void; onCancel: (id: string) => void
}) {
  const [species, setSpecies] = useState<PetSpecies>('cat')
  const [color, setColor] = useState('c0')
  const [name, setName] = useState('')
  const pend = st.pending
  const price = useMemo(() => Math.round(st.cfg.species[species].price * st.priceMult), [st, species])
  const half = Math.ceil(price / 2)

  if (pend) {
    const look: PetLook = { species: pend.species, color: pend.color, stage: 0, outfit: {} }
    const mine = pend.startedBy === me
    return (
      <section className="panel p-4 flex flex-col items-center gap-3 text-center relative overflow-hidden">
        <div className="absolute inset-[-60%] rays opacity-20 pointer-events-none" />
        <div className="relative flex items-end gap-3">
          <Icon name="egg" size={72} className="egg-wobble" />
          <PetView look={look} scale={3.4} />
        </div>
        <div className="relative font-pixel text-2xl">{pend.name} <span className="text-ink2 text-lg">· {PET_SPECIES[pend.species].name}</span></div>
        {mine ? (
          <>
            <p className="relative font-pixel text-lg text-ink2">{partnerName}’in onayı bekleniyor · senin payın ödendi <Icon name="coin" size={16} />{pend.half}</p>
            <button className="relative pbtn pbtn-dark w-full" disabled={busy} onClick={() => onCancel(pend.id)}>Vazgeç (altının geri gelir)</button>
          </>
        ) : (
          <>
            <p className="relative font-pixel text-lg text-ink">{partnerName} bu dostu birlikte sahiplenmek istiyor!</p>
            <button className="relative pbtn pbtn-gold w-full text-xl glow" disabled={busy || gold < pend.rest} onClick={() => onConfirm(pend.id)}>
              <Icon name="heart" size={22} />Sahiplen · <Icon name="coin" size={20} />{pend.rest}
            </button>
            <button className="relative pbtn pbtn-dark w-full" disabled={busy} onClick={() => onCancel(pend.id)}>Şimdi değil</button>
          </>
        )}
      </section>
    )
  }

  if (st.pets.length >= st.slots) return (
    <section className="panel p-4 flex flex-col items-center gap-2 text-center">
      <Icon name="lock" size={56} />
      <p className="font-pixel text-xl">Yuva dolu ({st.pets.length}/{st.slots})</p>
      <p className="font-pixel text-[15px] text-ink2">Arena’daki kalede Ahır yaparsanız yuva büyür (en çok {st.cfg.maxSlots}).</p>
    </section>
  )

  const look: PetLook = { species, color, stage: 0, outfit: {} }
  return (
    <section className="space-y-3">
      <div className="panel overflow-hidden relative h-[170px] flex items-end justify-center pb-3">
        <SceneBg className="absolute inset-0" seed={11} />
        <div className="relative"><PetView look={look} scale={5} /></div>
        <div className="absolute top-2 left-2 panel-dark px-2 py-1 font-pixel text-[14px] flex items-center gap-1"><Icon name="egg" size={16} />Yeni dost · Bebek</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {SPECIES_ORDER.map(s => {
          const p = Math.round(st.cfg.species[s].price * st.priceMult)
          return (
            <button key={s} onClick={() => { sfx.click(); setSpecies(s); setColor('c0') }} aria-pressed={species === s}
              className={`panel p-1 flex flex-col items-center ${species === s ? '!border-gold !bg-panel2' : ''}`}>
              <PetView look={{ species: s, color: 'c0', stage: 0, outfit: {} }} scale={2} animate={species === s} />
              <span className="font-pixel text-[13px]">{PET_SPECIES[s].name}</span>
              <span className="font-pixel text-[12px] text-gold flex items-center gap-0.5"><Icon name="coin" size={11} />{p}</span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-center gap-2">
        {PET_SPECIES[species].colors.map((c, i) => (
          <button key={i} onClick={() => { sfx.click(); setColor('c' + i) }} aria-label={c.name} aria-pressed={color === 'c' + i}
            className={`panel-dark p-1 ${color === 'c' + i ? '!border-gold' : 'opacity-70'}`}>
            <PetView look={{ species, color: 'c' + i, stage: 0, outfit: {} }} scale={1.6} animate={false} />
          </button>
        ))}
      </div>
      <div className="font-pixel text-[13px] text-ink2 text-center -mt-1">Tür ve renk ömür boyu böyle kalır</div>
      <input className="input font-pixel text-xl text-center" maxLength={16} placeholder={`Adı (ör. ${PET_SPECIES[species].name === 'Kedi' ? 'Pamuk' : 'Boncuk'})`} value={name} onChange={e => setName(e.target.value)} aria-label="Dostun adı" />
      {hasPartner ? (
        <button className="pbtn pbtn-gold w-full text-xl" disabled={busy || !name.trim() || gold < half} onClick={() => onStart(species, color, name.trim())}>
          <Icon name="heart" size={22} />Birlikte sahiplen · <Icon name="coin" size={20} />{half}
        </button>
      ) : <div className="pbtn pbtn-dark w-full opacity-70">Önce eşini davet et</div>}
      <p className="font-pixel text-[13px] text-ink2 text-center">Fiyat {price}: yarısı senden, yarısı {partnerName} onaylayınca ondan. {st.pets.length > 0 ? `${st.pets.length + 1}. dost ×${st.priceMult}` : ''}</p>
    </section>
  )
}

// ---------------------------------------------------------------- yumurtadan çıkış
function Hatch({ look, onDone }: { look: PetLook; onDone: () => void }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    sfx.dice()
    const t1 = window.setTimeout(() => { setOut(true); sfx.levelUp(); fx.confetti(120); fx.flash('rgba(255,215,90,.45)') }, 1400)
    return () => clearTimeout(t1)
  }, [])
  return (
    <section className="panel p-6 flex flex-col items-center gap-3 text-center relative overflow-hidden min-h-[300px] justify-center">
      <div className="absolute inset-[-60%] rays opacity-40 pointer-events-none" />
      {out ? <span className="relative popin"><PetView look={look} scale={6} /></span> : <Icon name="egg" size={110} className="relative egg-wobble" />}
      <div className="relative font-pixel text-3xl text-gold drop-shadow-[0_3px_0_#000]">{out ? 'Hoş geldin!' : '…'}</div>
      {out && <button className="relative pbtn pbtn-gold w-full" onClick={() => { sfx.click(); onDone() }}>Yuvaya git</button>}
    </section>
  )
}

/** Sahnede/listede küçük dost (Macera ve Hazine için) */
export function PetMini({ pet, scale = 1.6 }: { pet: Pet; scale?: number }) {
  return <PetView look={lookOf(pet)} scale={scale} />
}
export { lookOf as petLook }
