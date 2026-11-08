// Düello mini oyunları. Hepsi tohumludur: aynı tohumla iki kişi birebir aynı oyunu oynar.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DuelGame } from '../lib/game'
import { BossSprite, Icon } from './Sprite'
import { fx } from './fx'
import { sfx } from './sfx'
import { WORDS, WORDS_BY_CAT } from './words'

export const GAME_INFO: Record<DuelGame, { name: string; icon: string; rule: string; color: string; max: number }> = {
  TAP: { name: 'Balçık Avı', icon: 'slime', rule: 'Balçıklara vur! Altın +3, kafatası −2', color: '#5bd17c', max: 120 },
  MEMORY: { name: 'Rün Hafızası', icon: 'rune', rule: 'Yanan taşlara aynı sırayla bas', color: '#b98aff', max: 40 },
  TIMING: { name: 'Kritik Vuruş', icon: 'target', rule: 'Ok ortadayken dokun · 5 tur', color: '#ff4d6d', max: 500 },
  WORDS: { name: 'Kelime Düellosu', icon: 'scroll', rule: 'İngilizce kelimenin Türkçesini seç', color: '#4cc9f0', max: 60 },
  SLIDE: { name: 'Yapboz', icon: 'puzzle', rule: 'Parçaları kaydır, resmi tamamla', color: '#ffcc3a', max: 300 },
  MATH: { name: 'Hızlı Hesap', icon: 'lamp', rule: 'İşlemin sonucunu seç · 30 sn', color: '#ff8a3d', max: 40 },
  COLOR: { name: 'Renk Tuzağı', icon: 'pal', rule: 'Bazen yazıyı, bazen rengi seç · 30 sn', color: '#ff8ab5', max: 40 },
  SUDOKU: { name: 'Sudoku', icon: 'grid', rule: 'Her satır, sütun ve kutuya 1–9 · hızlı çöz, az hata yap', color: '#7ec8ff', max: 1000 },
}
export const DUEL_GAMES: DuelGame[] = ['TAP', 'MEMORY', 'TIMING', 'WORDS', 'MATH', 'COLOR', 'SLIDE', 'SUDOKU']

export function mulberry(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export function shuffle<T>(arr: T[], R: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
export const newSeed = () => Math.floor(Math.random() * 2_000_000_000)

type GameProps = { seed: number; onEnd: (score: number) => void }

// ---------------------------------------------------------------- ortak: süre çubuğu
function TimeBar({ left, total }: { left: number; total: number }) {
  const pct = Math.max(0, left / total) * 100
  return (
    <div className="bar w-full" style={{ height: 14 }}>
      <i style={{ width: `${pct}%`, background: pct < 25 ? '#ff4d6d' : '#ffcc3a', transition: 'none' }} />
    </div>
  )
}
function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    let r = 0
    const loop = () => { setNow(performance.now()); r = requestAnimationFrame(loop) }
    r = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(r)
  }, [active])
  return now
}

// ---------------------------------------------------------------- 1) Balçık Avı
const TAP_MS = 25000
type Pop = { t: number; cell: number; type: 'slime' | 'gold' | 'skull'; life: number }
function tapPlan(seed: number): Pop[] {
  const R = mulberry(seed), out: Pop[] = []
  const busyUntil = Array(9).fill(0)
  let t = 600
  while (t < TAP_MS - 400) {
    const k = t / TAP_MS
    const life = 1150 - 520 * k
    const free = [...Array(9).keys()].filter(c => busyUntil[c] < t)
    if (free.length) {
      const cell = free[Math.floor(R() * free.length)]
      const r = R()
      const type = r < 0.12 ? 'gold' : r < 0.27 ? 'skull' : 'slime'
      out.push({ t, cell, type, life })
      busyUntil[cell] = t + life + 120
    }
    t += 720 - 380 * k + R() * 160
    if (R() < 0.25 + 0.3 * k) t -= 200
  }
  return out
}
export function TapGame({ seed, onEnd }: GameProps) {
  const plan = useMemo(() => tapPlan(seed), [seed])
  const [start] = useState(() => performance.now())
  const [hit, setHit] = useState<Set<number>>(new Set())
  const [score, setScore] = useState(0)
  const [ended, setEnded] = useState(false)
  const now = useNow(!ended)
  const el = now - start
  const scoreRef = useRef(0)
  useEffect(() => {
    if (!ended && el >= TAP_MS) { setEnded(true); sfx.timeUp(); onEnd(scoreRef.current) }
  }, [el, ended, onEnd])
  const tap = (i: number, p: Pop, e: React.PointerEvent) => {
    if (hit.has(i) || ended) return
    setHit(h => new Set(h).add(i))
    const d = p.type === 'gold' ? 3 : p.type === 'skull' ? -2 : 1
    scoreRef.current = Math.max(0, scoreRef.current + d); setScore(scoreRef.current)
    if (p.type === 'skull') { sfx.bad(); fx.shake('play-area'); navigator.vibrate?.(40) } else if (p.type === 'gold') sfx.great(); else sfx.good()
    fx.burst(e.clientX, e.clientY, p.type === 'gold' ? '#ffcc3a' : p.type === 'skull' ? '#ff4d6d' : '#5bd17c', 10, 40)
    fx.float(d > 0 ? `+${d}` : `${d}`, e.clientX, e.clientY - 20, d > 0 ? '#ffcc3a' : '#ff4d6d')
  }
  return (
    <div className="space-y-3">
      <Hud score={score} left={TAP_MS - el} total={TAP_MS} />
      <div id="play-area" className="grid grid-cols-3 gap-2 select-none touch-none">
        {Array.from({ length: 9 }, (_, cell) => {
          const idx = plan.findIndex(p => p.cell === cell && el >= p.t && el < p.t + p.life)
          const p = idx >= 0 ? plan[idx] : null
          const shown = p && !hit.has(idx)
          return (
            <button key={cell} className="relative aspect-square panel-dark !rounded-[50%/40%] overflow-hidden grid place-items-end justify-center"
              style={{ background: 'radial-gradient(ellipse at 50% 80%, #0a0614 40%, #241a3e 70%)' }}
              onPointerDown={e => p && shown && tap(idx, p, e)} aria-label={`Delik ${cell + 1}`}>
              {shown && (
                <span key={idx} className="popin mb-2">
                  <Icon name={p.type === 'gold' ? 'coin' : p.type === 'skull' ? 'skull' : 'slime'} size={64} className={p.type === 'gold' ? 'glow' : ''} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 2) Rün Hafızası
const PADS = [
  { c: '#ff5a6a', d: '#8a1f2e' }, { c: '#4cc9f0', d: '#1f5a7a' }, { c: '#5bd17c', d: '#1f6a3a' }, { c: '#ffcc3a', d: '#8a6a10' },
]
export function MemoryGame({ seed, onEnd }: GameProps) {
  const seq = useMemo(() => { const R = mulberry(seed); return Array.from({ length: 42 }, () => Math.floor(R() * 4)) }, [seed])
  const [len, setLen] = useState(3)
  const [lit, setLit] = useState<number | null>(null)
  const [phase, setPhase] = useState<'show' | 'input' | 'over'>('show')
  const [pos, setPos] = useState(0)
  const [best, setBest] = useState(0)
  useEffect(() => {
    if (phase !== 'show') return
    const speed = Math.max(260, 560 - len * 18)
    const timers: number[] = []
    seq.slice(0, len).forEach((p, i) => {
      timers.push(window.setTimeout(() => { setLit(p); sfx.pad(p) }, 500 + i * speed))
      timers.push(window.setTimeout(() => setLit(null), 500 + i * speed + speed * 0.6))
    })
    timers.push(window.setTimeout(() => { setPhase('input'); setPos(0) }, 500 + len * speed))
    return () => timers.forEach(clearTimeout)
  }, [phase, len, seq])
  const press = (i: number, e: React.PointerEvent) => {
    if (phase !== 'input') return
    setLit(i); window.setTimeout(() => setLit(l => (l === i ? null : l)), 180)
    if (seq[pos] !== i) {
      sfx.bad(); fx.shake('play-area'); setPhase('over'); navigator.vibrate?.(60)
      window.setTimeout(() => onEnd(best), 700)
      return
    }
    sfx.pad(i)
    if (pos + 1 === len) {
      setBest(len); sfx.great(); fx.burst(e.clientX, e.clientY, PADS[i].c)
      if (len >= 40) { setPhase('over'); window.setTimeout(() => onEnd(40), 600); return }
      setPhase('show'); setLen(l => l + 1)
    } else setPos(p => p + 1)
  }
  return (
    <div className="space-y-3">
      <div className="panel-dark flex items-center justify-between px-3 py-2 font-pixel">
        <span className="text-xl flex items-center gap-2"><Icon name="rune" size={26} />{best}</span>
        <span className={`text-lg ${phase === 'input' ? 'text-ok' : 'text-ink2'}`}>{phase === 'show' ? 'İzle…' : phase === 'input' ? 'Sıra sende!' : 'Bitti'}</span>
        <span className="text-lg text-ink2">{pos}/{len}</span>
      </div>
      <div id="play-area" className="grid grid-cols-2 gap-3 select-none touch-none">
        {PADS.map((p, i) => (
          <button key={i} onPointerDown={e => press(i, e)} aria-label={`Taş ${i + 1}`}
            className="aspect-square rounded-[10px] border-[4px] border-edge grid place-items-center transition-transform"
            style={{ background: lit === i ? p.c : p.d, boxShadow: lit === i ? `0 0 30px ${p.c}, inset 0 4px 0 rgba(255,255,255,.5)` : 'inset 0 4px 0 rgba(255,255,255,.12), inset 0 -6px 0 rgba(0,0,0,.3)', transform: lit === i ? 'scale(.96)' : 'none' }}>
            <Icon name="rune" size={56} className={lit === i ? '' : 'opacity-40'} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 3) Kritik Vuruş
export function TimingGame({ seed, onEnd }: GameProps) {
  const rounds = useMemo(() => { const R = mulberry(seed); return Array.from({ length: 5 }, (_, i) => ({ target: 0.2 + R() * 0.6, speed: 0.55 + i * 0.22 + R() * 0.15, phase: R() })) }, [seed])
  const [round, setRound] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const [frozen, setFrozen] = useState<number | null>(null)
  const [t0, setT0] = useState(() => performance.now())
  const now = useNow(frozen === null && round < 5)
  const r = rounds[Math.min(round, 4)]
  const tri = (x: number) => { const m = x % 2; return m < 1 ? m : 2 - m }
  const cur = frozen ?? tri(((now - t0) / 1000) * r.speed + r.phase)
  const total = scores.reduce((a, b) => a + b, 0)
  const [label, setLabel] = useState<{ t: string; c: string } | null>(null)
  const stop = (e: React.PointerEvent) => {
    if (frozen !== null || round >= 5) return
    const d = Math.abs(cur - r.target)
    const s = Math.max(0, Math.round(100 - d * 420))
    setFrozen(cur); setScores(x => [...x, s])
    const l = s >= 92 ? { t: 'KRİTİK!', c: '#ffcc3a' } : s >= 65 ? { t: 'İyi!', c: '#5bd17c' } : s >= 25 ? { t: 'Sıyırdı', c: '#4cc9f0' } : { t: 'Iska', c: '#ff4d6d' }
    setLabel(l)
    if (s >= 92) { sfx.crit(); fx.flash('rgba(255,215,90,.35)'); fx.burst(e.clientX, e.clientY, '#ffcc3a', 16, 70) } else if (s >= 25) sfx.hit(); else sfx.bad()
    window.setTimeout(() => {
      setLabel(null)
      if (round + 1 >= 5) { onEnd(total + s); setRound(5); return }
      setRound(x => x + 1); setFrozen(null); setT0(performance.now())
    }, 900)
  }
  return (
    <div className="space-y-4 select-none" onPointerDown={stop}>
      <div className="panel-dark flex items-center justify-between px-3 py-2 font-pixel">
        <span className="text-xl text-gold flex items-center gap-2"><Icon name="target" size={26} />{total}</span>
        <span className="flex gap-1">{Array.from({ length: 5 }, (_, i) => <span key={i} className={`w-4 h-4 border-2 border-edge rounded-[2px] ${i < round ? 'bg-gold' : i === round ? 'bg-panel2 blinkdot' : 'bg-bg2'}`} />)}</span>
      </div>
      <div className="relative flex justify-center h-[150px] items-end">
        <div className={frozen !== null && (scores[scores.length - 1] ?? 0) >= 25 ? 'boss-hit' : 'boss-idle'}><BossSprite bossKey={['slime_green', 'golem_stone', 'dragon_green', 'golem_lava', 'dragon_shadow'][Math.min(round, 4)]} scale={2.6} /></div>
        {label && <div className="absolute top-2 font-pixel text-4xl stamp drop-shadow-[0_3px_0_#000]" style={{ color: label.c }}>{label.t}</div>}
      </div>
      <div id="play-area" className="relative h-[56px] panel-dark overflow-hidden">
        <div className="absolute inset-y-0" style={{ left: `${(r.target - 0.12) * 100}%`, width: '24%', background: 'rgba(91,209,124,.25)' }} />
        <div className="absolute inset-y-0" style={{ left: `${(r.target - 0.05) * 100}%`, width: '10%', background: 'rgba(255,204,58,.45)' }} />
        <div className="absolute inset-y-0 w-[3px] bg-gold" style={{ left: `${r.target * 100}%` }} />
        <div className="absolute -top-0.5 bottom-0 w-[8px] -ml-[4px] bg-white border-2 border-edge" style={{ left: `${cur * 100}%` }} />
      </div>
      <div className="pbtn pbtn-red w-full text-2xl !min-h-[72px]"><Icon name="sword" size={32} />VUR!</div>
    </div>
  )
}

// ---------------------------------------------------------------- 4) Kelime Düellosu (İngilizce → Türkçe)
const WORDS_MS = 30000
export function WordsGame({ seed, onEnd }: GameProps) {
  const qs = useMemo(() => {
    const R = mulberry(seed)
    const order = shuffle([...WORDS.keys()], R)
    return order.map(i => {
      const wrong = new Set<number>()
      const pool = WORDS_BY_CAT[WORDS[i].cat]
      while (wrong.size < 3) { const j = pool[Math.floor(R() * pool.length)]; if (j !== i) wrong.add(j) }
      const opts = shuffle([i, ...wrong], R)
      return { en: WORDS[i].en, answer: i, opts }
    })
  }, [seed])
  const [start] = useState(() => performance.now())
  const [qi, setQi] = useState(0)
  const [score, setScore] = useState(0)
  const [flash, setFlash] = useState<{ i: number; ok: boolean } | null>(null)
  const [ended, setEnded] = useState(false)
  const now = useNow(!ended)
  const el = now - start
  const scoreRef = useRef(0)
  useEffect(() => { if (!ended && el >= WORDS_MS) { setEnded(true); sfx.timeUp(); onEnd(scoreRef.current) } }, [el, ended, onEnd])
  const q = qs[qi % qs.length]
  const pick = (o: number, e: React.PointerEvent) => {
    if (flash || ended) return
    const ok = o === q.answer
    setFlash({ i: o, ok })
    if (ok) { scoreRef.current++; setScore(scoreRef.current); sfx.good(); fx.burst(e.clientX, e.clientY, '#5bd17c', 8, 34) } else { sfx.bad(); fx.shake('play-area') }
    window.setTimeout(() => { setFlash(null); setQi(x => x + 1) }, ok ? 260 : 650)
  }
  return (
    <div className="space-y-3">
      <Hud score={score} left={WORDS_MS - el} total={WORDS_MS} icon="scroll" />
      <div key={qi} className="panel p-5 text-center dropin">
        <div className="font-pixel text-4xl text-xp break-words">{q.en}</div>
      </div>
      <div id="play-area" className="grid grid-cols-2 gap-2">
        {q.opts.map(o => {
          const st = flash && (o === q.answer ? 'ok' : flash.i === o ? 'bad' : '')
          return (
            <button key={o} onPointerDown={e => pick(o, e)}
              className={`pbtn !min-h-[68px] text-lg leading-tight ${st === 'ok' ? 'pbtn-green' : st === 'bad' ? 'pbtn-red' : 'pbtn-dark'}`}>
              {WORDS[o].tr}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 5) Yapboz (3x3 kaydırmalı)
const SLIDE_MS = 120000
export function SlideGame({ seed, onEnd, image }: GameProps & { image: string }) {
  const startBoard = useMemo(() => {
    const R = mulberry(seed)
    const b = [0, 1, 2, 3, 4, 5, 6, 7, 8] // 8 = boşluk
    let blank = 8, prev = -1
    for (let k = 0; k < 80; k++) {
      const r = Math.floor(blank / 3), c = blank % 3
      const nb = [r > 0 ? blank - 3 : -1, r < 2 ? blank + 3 : -1, c > 0 ? blank - 1 : -1, c < 2 ? blank + 1 : -1].filter(x => x >= 0 && x !== prev)
      const n = nb[Math.floor(R() * nb.length)]
      ;[b[blank], b[n]] = [b[n], b[blank]]; prev = blank; blank = n
    }
    if (b.every((v, i) => v === i)) { [b[7], b[8]] = [b[8], b[7]]; [b[6], b[7]] = [b[7], b[6]] }
    return b
  }, [seed])
  const [board, setBoard] = useState(startBoard)
  const [moves, setMoves] = useState(0)
  const [start] = useState(() => performance.now())
  const [ended, setEnded] = useState(false)
  const now = useNow(!ended)
  const el = now - start
  const correct = board.filter((v, i) => v === i && v !== 8).length
  const finish = useCallback((solved: boolean, mv: number, ms: number) => {
    setEnded(true)
    const score = solved ? Math.max(40, 300 - mv * 2 - Math.floor(ms / 1000)) : correct * 4
    if (solved) { sfx.victory(); fx.confetti(50) } else sfx.timeUp()
    window.setTimeout(() => onEnd(score), solved ? 900 : 300)
  }, [onEnd, correct])
  useEffect(() => { if (!ended && el >= SLIDE_MS) finish(false, moves, el) }, [el, ended, finish, moves])
  const tap = (i: number) => {
    if (ended) return
    const blank = board.indexOf(8)
    const adj = (Math.abs(i - blank) === 3) || (Math.abs(i - blank) === 1 && Math.floor(i / 3) === Math.floor(blank / 3))
    if (!adj) { sfx.tick(); return }
    const nb = board.slice(); [nb[i], nb[blank]] = [nb[blank], nb[i]]
    setBoard(nb); setMoves(m => m + 1); sfx.slide()
    if (nb.every((v, k) => v === k)) finish(true, moves + 1, el)
  }
  return (
    <div className="space-y-3">
      <div className="panel-dark flex items-center justify-between px-3 py-2 font-pixel">
        <span className="text-xl flex items-center gap-2"><Icon name="puzzle" size={24} />{moves}</span>
        <span className="text-lg text-ok">{correct}/8</span>
        <span className="text-lg text-ink2">{Math.max(0, Math.ceil((SLIDE_MS - el) / 1000))} sn</span>
      </div>
      <div id="play-area" className="relative mx-auto w-full max-w-[330px] aspect-square panel-dark p-1 grid grid-cols-3 gap-1 select-none">
        {board.map((v, i) => (
          <button key={v} onPointerDown={() => tap(i)} aria-label={v === 8 ? 'Boş' : `Parça ${v + 1}`}
            className={`relative rounded-[4px] ${v === 8 && !ended ? 'opacity-0' : 'border-2 border-edge'} px`}
            style={{ order: i, backgroundImage: `url(${image})`, backgroundSize: '300% 300%', backgroundPosition: `${(v % 3) * 50}% ${Math.floor(v / 3) * 50}%`, imageRendering: 'pixelated', backgroundColor: '#2a2146' }}>
            {v === i && v !== 8 && !ended && <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-ok border border-edge" />}
          </button>
        ))}
      </div>
      <div className="flex justify-center items-center gap-2 text-ink2 font-pixel text-[15px]">
        <span className="panel-dark p-1"><img src={image} width={44} height={44} className="px" alt="" /></span>Hedef resim
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 6) Hızlı Hesap
const QUICK_MS = 30000
type Choice = { prompt: ReactNode; answer: number; opts: string[] }
/** Ortak çekirdek: 30 sn, 4 şık, doğru +1, yanlış kart titrer */
function QuickGame({ seed, onEnd, icon, make, big }: GameProps & { icon: string; make: (R: () => number, i: number) => Choice; big?: boolean }) {
  const qs = useMemo(() => { const R = mulberry(seed); return Array.from({ length: 60 }, (_, i) => make(R, i)) }, [seed, make])
  const [start] = useState(() => performance.now())
  const [qi, setQi] = useState(0)
  const [score, setScore] = useState(0)
  const [flash, setFlash] = useState<{ i: number; ok: boolean } | null>(null)
  const [ended, setEnded] = useState(false)
  const now = useNow(!ended)
  const el = now - start
  const scoreRef = useRef(0)
  useEffect(() => { if (!ended && el >= QUICK_MS) { setEnded(true); sfx.timeUp(); onEnd(scoreRef.current) } }, [el, ended, onEnd])
  const q = qs[qi % qs.length]
  const pick = (o: number, e: React.PointerEvent) => {
    if (flash || ended) return
    const ok = o === q.answer
    setFlash({ i: o, ok })
    if (ok) { scoreRef.current++; setScore(scoreRef.current); sfx.good(); fx.burst(e.clientX, e.clientY, '#5bd17c', 8, 34) } else { sfx.bad(); fx.shake('play-area') }
    window.setTimeout(() => { setFlash(null); setQi(x => x + 1) }, ok ? 220 : 600)
  }
  return (
    <div className="space-y-3">
      <Hud score={score} left={QUICK_MS - el} total={QUICK_MS} icon={icon} />
      <div key={qi} className="panel p-5 text-center dropin min-h-[92px] grid place-items-center">{q.prompt}</div>
      <div id="play-area" className="grid grid-cols-2 gap-2">
        {q.opts.map((label, o) => {
          const st = flash && (o === q.answer ? 'ok' : flash.i === o ? 'bad' : '')
          return (
            <button key={o} onPointerDown={e => pick(o, e)}
              className={`pbtn !min-h-[68px] leading-tight ${big ? 'text-3xl' : 'text-xl'} ${st === 'ok' ? 'pbtn-green' : st === 'bad' ? 'pbtn-red' : 'pbtn-dark'}`}>{label}</button>
          )
        })}
      </div>
    </div>
  )
}
const makeMath = (R: () => number, i: number): Choice => {
  const hard = i >= 12
  const kind = R()
  let a: number, b: number, v: number, text: string
  if (kind < 0.4) { a = 2 + Math.floor(R() * (hard ? 60 : 20)); b = 2 + Math.floor(R() * (hard ? 60 : 20)); v = a + b; text = `${a} + ${b}` }
  else if (kind < 0.7) { a = 10 + Math.floor(R() * (hard ? 80 : 30)); b = 1 + Math.floor(R() * Math.min(a - 1, hard ? 40 : 15)); v = a - b; text = `${a} − ${b}` }
  else { a = 2 + Math.floor(R() * (hard ? 12 : 9)); b = 2 + Math.floor(R() * (hard ? 12 : 9)); v = a * b; text = `${a} × ${b}` }
  const wrong = new Set<number>()
  while (wrong.size < 3) { const d = (Math.floor(R() * 7) - 3) || (R() < 0.5 ? 10 : -10); const w = v + d; if (w !== v && w >= 0) wrong.add(w) }
  const opts = shuffle([v, ...wrong], R)
  return { prompt: <span className="font-pixel text-5xl text-warn">{text}</span>, answer: opts.indexOf(v), opts: opts.map(String) }
}
export function MathGame(p: GameProps) { return <QuickGame {...p} icon="lamp" make={makeMath} big /> }

// ---------------------------------------------------------------- 7) Renk Tuzağı (Stroop)
const COLORS: Array<[string, string]> = [['KIRMIZI', '#ff4d6d'], ['MAVİ', '#4c9df0'], ['YEŞİL', '#5bd17c'], ['SARI', '#ffcc3a'], ['MOR', '#b98aff'], ['TURUNCU', '#ff8a3d']]
const makeColor = (R: () => number, i: number): Choice => {
  const word = Math.floor(R() * COLORS.length)
  let ink = Math.floor(R() * COLORS.length)
  if (i < 3) ink = word // ısınma
  const askInk = i >= 3 && R() < 0.55
  const answer = askInk ? ink : word
  const wrong = new Set<number>()
  while (wrong.size < 3) { const w = Math.floor(R() * COLORS.length); if (w !== answer) wrong.add(w) }
  const opts = shuffle([answer, ...wrong], R)
  return {
    prompt: (
      <span className="flex flex-col items-center gap-2">
        <span className="font-pixel text-[15px] text-ink2 flex items-center gap-1">{askInk ? <><Icon name="pal" size={16} />RENGİ seç</> : <><Icon name="scroll" size={16} />YAZIYI seç</>}</span>
        <span className="font-pixel text-5xl drop-shadow-[0_3px_0_#000]" style={{ color: COLORS[ink][1] }}>{COLORS[word][0]}</span>
      </span>
    ),
    answer: opts.indexOf(answer), opts: opts.map(c => COLORS[c][0]),
  }
}
export function ColorGame(p: GameProps) { return <QuickGame {...p} icon="pal" make={makeColor} /> }

function Hud({ score, left, total, icon = 'star' }: { score: number; left: number; total: number; icon?: string }) {
  return (
    <div className="panel-dark p-2 space-y-1.5">
      <div className="flex items-center justify-between font-pixel">
        <span key={score} className="text-2xl text-gold flex items-center gap-2 pop"><Icon name={icon} size={26} />{score}</span>
        <span className="text-lg text-ink2">{Math.max(0, Math.ceil(left / 1000))} sn</span>
      </div>
      <TimeBar left={left} total={total} />
    </div>
  )
}
