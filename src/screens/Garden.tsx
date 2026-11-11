// Ortak bahçe (0022): tohum ekersiniz; ikiniz de suladığınız her gün bitki bir evre büyür. Hasat ikinize altın, dostlara mama, deftere çiçek.
import { useCallback, useEffect, useState } from 'react'
import { gardenBuySeed, gardenHarvest, gardenPlant, gardenWater, getGarden, type GardenState } from '../lib/game'
import { gridToURL, makeGrid, outline, shade, type Grid } from '../game/pixel'
import { Icon } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Sheet, toast, toastError, useGame } from '../game/ui'
import { SEEDS, seedOf } from '../game/world'
import { Tip } from './Moments'

type Shape = 'ring' | 'cup' | 'round' | 'spike' | 'star' | 'puff' | 'bell' | 'diamond'
const SHAPE: Record<string, Shape> = {
  daisy: 'ring', tulip: 'cup', rose: 'round', lavender: 'spike', lotus: 'cup', desertrose: 'round',
  snowdrop: 'bell', firelily: 'star', crystal: 'diamond', cloudcotton: 'puff', starflower: 'star',
}

/** 16×16 çiçek: 0 tohum, 1 filiz, 2 tomurcuk, 3 çiçek */
export function renderFlower(key: string, stage: number): Grid {
  const g = makeGrid(16, 16)
  const sd = seedOf(key)
  const petal = sd?.petal ?? '#ff8ab5', center = sd?.center ?? '#ffd75a'
  const leaf = '#4fae4a', leafD = '#2f7a3a', soil = '#7a5232', soilD = '#5a3a22'
  const set = (x: number, y: number, c: string) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c }
  // toprak tümseği
  for (let x = 4; x <= 11; x++) set(x, 15, soilD)
  for (let x = 5; x <= 10; x++) set(x, 14, soil)
  if (stage === 0) { set(7, 13, soil); set(8, 13, soil); set(7, 12, '#e8d8a0'); set(8, 13, '#c8b880'); return outline(g) }
  // sap
  const top = stage === 1 ? 10 : stage === 2 ? 6 : 5
  for (let y = top; y <= 13; y++) set(8, y, leaf)
  // yapraklar
  set(7, 12, leaf); set(6, 11, leaf); set(5, 11, leafD); set(9, 11, leaf); set(10, 10, leaf); set(11, 10, leafD)
  if (stage === 1) { set(7, 9, leaf); set(9, 9, leaf); return outline(g) }
  if (stage === 2) {
    set(7, 5, petal); set(8, 4, petal); set(9, 5, petal); set(8, 5, shade(petal, -0.15)); set(8, 6, leafD)
    return outline(g)
  }
  const cx = 8, cy = 4
  const P = petal, Pd = shade(petal, -0.2), C = center
  switch (SHAPE[key] ?? 'ring') {
    case 'ring':
      for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -3], [-3, 0], [3, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]]) set(cx + dx, cy + dy, (dx + dy) % 2 ? Pd : P)
      set(cx, cy, C); set(cx - 1, cy, C); set(cx + 1, cy, C); set(cx, cy - 1, C); set(cx, cy + 1, C)
      break
    case 'cup':
      for (let y = 0; y < 4; y++) for (let x = -2; x <= 2; x++) set(cx + x, cy - 1 + y, x === 0 ? Pd : P)
      set(cx - 2, cy - 2, P); set(cx, cy - 2, P); set(cx + 2, cy - 2, P); set(cx, cy, C)
      break
    case 'round':
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) set(cx + x, cy + y, (x * y) % 2 ? Pd : P)
      set(cx, cy, C); set(cx - 1, cy - 1, Pd); set(cx + 1, cy + 1, Pd)
      break
    case 'spike':
      for (let y = -3; y <= 2; y++) { set(cx - 1, cy + y, y % 2 ? P : Pd); set(cx + 1, cy + y, y % 2 ? Pd : P); set(cx, cy + y, P) }
      set(cx, cy - 4, P)
      break
    case 'star':
      for (let i = -3; i <= 3; i++) { set(cx + i, cy, P); set(cx, cy + i, P) }
      set(cx - 2, cy - 2, Pd); set(cx + 2, cy - 2, Pd); set(cx - 2, cy + 2, Pd); set(cx + 2, cy + 2, Pd)
      set(cx - 1, cy - 1, P); set(cx + 1, cy - 1, P); set(cx - 1, cy + 1, P); set(cx + 1, cy + 1, P); set(cx, cy, C)
      break
    case 'puff':
      for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) if (x * x / 9 + y * y / 4 <= 1.1) set(cx + x, cy + y, y < 0 ? P : Pd)
      set(cx - 1, cy - 1, C); set(cx + 1, cy, C)
      break
    case 'bell':
      set(cx, cy - 2, leaf); set(cx + 1, cy - 2, leaf); set(cx + 2, cy - 1, leaf)
      for (let y = 0; y < 3; y++) for (let x = -1 - (y > 0 ? 1 : 0); x <= 1 + (y > 0 ? 1 : 0); x++) set(cx + 2 + x, cy + y, y === 2 && x % 2 ? Pd : P)
      set(cx + 2, cy + 3, C)
      break
    case 'diamond':
      for (let y = -3; y <= 3; y++) { const w = 3 - Math.abs(y); for (let x = -w; x <= w; x++) set(cx + x, cy + y, x === 0 || y === 0 ? '#ffffff' : (x + y) % 2 ? Pd : P) }
      break
  }
  return outline(g)
}

export function Flower({ seed, stage, size = 32, className = '' }: { seed: string; stage: number; size?: number; className?: string }) {
  const src = gridToURL(`flower:${seed}:${stage}`, () => renderFlower(seed, stage))
  return <img src={src} width={size} height={size} alt="" draggable={false} className={`px ${className}`} />
}

const stageOf = (growth: number, need: number) => growth >= need ? 3 : growth === 0 ? 0 : growth / need < 0.5 ? 1 : 2

export function GardenSheet({ onClose }: { onClose: () => void }) {
  const { game, refresh } = useGame()
  const me = game.hero!, partner = game.partner
  const [st, setSt] = useState<GardenState | null>(null)
  const [busy, setBusy] = useState(false)
  const [plantAt, setPlantAt] = useState<number | null>(null)
  const [shop, setShop] = useState(false)
  const [rain, setRain] = useState(0)
  const [grown, setGrown] = useState<number[]>([])

  const load = useCallback(async () => { try { setSt(await getGarden()) } catch (e) { toastError(e) } }, [])
  useEffect(() => { void load() }, [load])
  const act = async (fn: () => Promise<GardenState>, good?: (r: GardenState, prev: GardenState | null) => void) => {
    setBusy(true)
    try { const prev = st; const r = await fn(); setSt(r); good?.(r, prev); void refresh(); return r } catch (e) { toastError(e); return null } finally { setBusy(false) }
  }

  const water = () => act(() => gardenWater(), (r, prev) => {
    sfx.heal(); setRain(k => k + 1); navigator.vibrate?.(20)
    const up = r.plots.filter(p => p.grewToday && !prev?.plots.find(q => q.slot === p.slot)?.grewToday).map(p => p.slot)
    if (up.length) { window.setTimeout(() => { sfx.levelUp(); setGrown(up) }, 700); window.setTimeout(() => setGrown([]), 2200) }
    else if (partner && r.plots.length) toast('Şimdi sıra eşinde · ikiniz sulayınca büyür')
  })

  const plotsBySlot = new Map((st?.plots ?? []).map(p => [p.slot, p]))
  const seedsOwned = Object.entries(st?.seeds ?? {}).filter(([, n]) => n > 0)
  return (
    <div className="fixed inset-0 z-[45] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label="Bahçe">
      <div className="mx-auto max-w-[520px] min-h-dvh px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-8 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="flower" size={30} />
          <span className="font-pixel text-2xl flex-1">Bahçe</span>
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose() }} aria-label="Kapat">✕</button>
        </div>
        {!st ? <div className="font-pixel text-ink2 text-center pt-16 blinkdot">Yükleniyor…</div> : (
          <>
            <Tip id="garden-v4" icon="can" text="İkiniz de sulayınca bitkiler büyür; tek kişi yetmez." />
            {/* tarhlar */}
            <section className="panel relative overflow-hidden p-3 pt-11" style={{ background: 'linear-gradient(#7cc0ff 0%, #a3d6ff 34%, #6cc24a 35%, #5aae5a 100%)' }}>
              <div className="absolute top-2 left-2 right-2 flex justify-between font-pixel text-[14px]">
                <span className="panel-dark px-2 py-0.5 flex items-center gap-1"><Icon name="can" size={14} className={st.waterMe ? '' : 'opacity-30 grayscale'} />sen</span>
                {partner && <span className="panel-dark px-2 py-0.5 flex items-center gap-1"><Icon name="can" size={14} className={st.waterPartner ? '' : 'opacity-30 grayscale'} />{partner.name}</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 relative">
                {Array.from({ length: st.slots }, (_, i) => {
                  const p = plotsBySlot.get(i)
                  const stg = p ? stageOf(p.growth, p.need) : -1
                  return (
                    <button key={i} disabled={busy} aria-label={p ? `${seedOf(p.seed)?.name}` : 'Boş tarh'}
                      onClick={() => {
                        if (!p) { sfx.click(); if (seedsOwned.length) setPlantAt(i); else setShop(true); return }
                        if (p.ready) void act(() => gardenHarvest(i), r => {
                          sfx.coin(); sfx.levelUp(); fx.confetti(50)
                          const el = document.getElementById(`plot-${i}`); const at = fx.fromEl(el)
                          fx.float(`+${r.harvest?.gold ?? 0}`, at.x, at.y - 20, '#ffcc3a', true); fx.fly(at.x, at.y, 'hud-gold', 5, 'coin')
                        })
                        else { sfx.tick(); toast(`${seedOf(p.seed)?.name} · ${p.growth}/${p.need} gün`) }
                      }}
                      id={`plot-${i}`}
                      className="relative h-[96px] rounded-[4px] flex items-end justify-center"
                      style={{ background: 'linear-gradient(transparent 55%, #7a5232 55%, #5a3a22 100%)' }}>
                      {p ? (
                        <span key={`${p.slot}-${stg}-${grown.includes(i)}`} className={grown.includes(i) ? 'sprout' : stg === 3 ? 'sway' : ''}>
                          <Flower seed={p.seed} stage={stg} size={64} />
                        </span>
                      ) : <span className="font-pixel text-3xl text-[#c8a878] mb-3">+</span>}
                      {p && <span className="absolute top-1 left-1 right-1 flex gap-[2px]">{Array.from({ length: p.need }, (_, k) => <i key={k} className="h-1.5 flex-1 rounded-sm border border-edge" style={{ background: k < p.growth ? '#5bd17c' : '#120d22' }} />)}</span>}
                      {p?.ready && <span className="absolute top-3 right-1 bob"><Icon name="sparkle" size={16} /></span>}
                      {rain > 0 && p && !p.ready && <span key={rain} className="absolute inset-0 pointer-events-none">{[20, 45, 70].map((x, k) => <i key={k} className="raindrop" style={{ left: x + '%', top: 4, animationDelay: k * 0.15 + 's', animationIterationCount: 2 }} />)}</span>}
                    </button>
                  )
                })}
              </div>
            </section>

            <button className={`pbtn ${st.waterMe ? 'pbtn-dark' : 'pbtn-blue'} w-full text-xl`} disabled={busy || st.waterMe} onClick={() => void water()}>
              <Icon name="can" size={26} />{st.waterMe ? (st.waterPartner || !partner ? 'Bugün sulandı' : `${partner.name} bekleniyor`) : 'Sula'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button className="pbtn pbtn-dark" onClick={() => { sfx.open(); setShop(true) }}><Icon name="bag" size={22} />Tohumlar</button>
              <div className="panel-dark flex items-center justify-center gap-1 font-pixel text-[15px] flex-wrap px-1">
                {Object.entries(st.flowers).length === 0 ? <span className="text-ink2">Henüz hasat yok</span>
                  : Object.entries(st.flowers).map(([k, n]) => <span key={k} className="flex items-center"><Flower seed={k} stage={3} size={22} />{n}</span>)}
              </div>
            </div>
            <p className="font-pixel text-[13px] text-ink2 text-center leading-snug">İkiniz de suladığınız her gün bitkiler bir evre büyür. Hasat ikinize altın, dostlarınıza mama. Nadir tohumlar keşiften gelir.</p>
          </>
        )}
      </div>

      <Sheet open={plantAt !== null} onClose={() => setPlantAt(null)} title="Ne ekelim?">
        <div className="grid grid-cols-3 gap-2">
          {seedsOwned.map(([k, n]) => {
            const sd = seedOf(k)
            return (
              <button key={k} className="panel-dark p-2 flex flex-col items-center gap-0.5" disabled={busy}
                onClick={() => { const at = plantAt!; void act(() => gardenPlant(at, k), () => { sfx.good(); setPlantAt(null); setGrown([at]); window.setTimeout(() => setGrown([]), 900) }) }}>
                <Flower seed={k} stage={3} size={40} />
                <span className="font-pixel text-[14px] leading-tight text-center">{sd?.name}</span>
                <span className="font-pixel text-[12px] text-ink2">{sd?.days} gün · ×{n}</span>
              </button>
            )
          })}
        </div>
        <button className="pbtn pbtn-dark w-full mt-3" onClick={() => { setPlantAt(null); setShop(true) }}><Icon name="bag" size={20} />Tohum al</button>
      </Sheet>

      <Sheet open={shop} onClose={() => setShop(false)} title={<span className="flex items-center gap-2"><Icon name="bag" size={24} />Tohumlar</span>}>
        <div className="grid grid-cols-3 gap-2">
          {SEEDS.map(sd => {
            const n = st?.seeds[sd.key] ?? 0
            const buyable = sd.price !== null
            return (
              <button key={sd.key} className={`panel-dark p-2 flex flex-col items-center gap-0.5 ${!buyable && !n ? 'opacity-50' : ''}`} disabled={busy || !buyable}
                onClick={() => void act(() => gardenBuySeed(sd.key), () => { sfx.buy(); sfx.coin() })}>
                <Flower seed={sd.key} stage={3} size={40} />
                <span className="font-pixel text-[13px] leading-tight text-center">{sd.name}</span>
                <span className="font-pixel text-[12px] text-ink2">{sd.days} gün{n > 0 ? ` · ×${n}` : ''}</span>
                {buyable ? <span className={`font-pixel text-[13px] flex items-center gap-0.5 ${me.gold >= sd.price! ? 'text-gold' : 'text-hp'}`}><Icon name="coin" size={12} />{sd.price}</span>
                  : <span className="font-pixel text-[12px] text-magic flex items-center gap-0.5"><Icon name="map" size={12} />keşif</span>}
              </button>
            )
          })}
        </div>
      </Sheet>
    </div>
  )
}
