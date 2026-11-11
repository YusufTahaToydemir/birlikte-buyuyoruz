// Arka plan müziği: çiptune, tamamen kodla bestelenir (dosya yok).
// Her parça tohumlu bir melodi üretir (A A' B A, 16 ölçü) → her açılışta aynı, akılda kalan bir döngü.
import { audio, audioOut, noiseBuffer, onDuck } from './sfx'

export type TrackName = 'title' | 'town' | 'battle' | 'arcade'
interface Track { bpm: number; root: number; minor: boolean; prog: number[]; seed: number; drums: 'soft' | 'battle' | 'arcade'; swing?: number; bassOct?: boolean; arp16?: boolean }

const TRACKS: Record<TrackName, Track> = {
  title: { bpm: 84, root: 60, minor: false, prog: [0, 5, 3, 4], seed: 11, drums: 'soft' },
  town: { bpm: 100, root: 65, minor: false, prog: [0, 4, 5, 3, 0, 3, 4, 0], seed: 7, drums: 'soft', swing: 0.08 },
  battle: { bpm: 140, root: 57, minor: true, prog: [0, 5, 2, 6], seed: 23, drums: 'battle', bassOct: true },
  arcade: { bpm: 148, root: 67, minor: false, prog: [0, 3, 5, 4], seed: 5, drums: 'arcade', arp16: true, bassOct: true },
}
/** Haritadaki bölgeye göre köy müziği (0 = Yeşil Vadi, yukarıdaki 'town') */
const REGION_TOWN: Track[] = [
  TRACKS.town,
  { bpm: 92, root: 62, minor: true, prog: [0, 5, 3, 4, 0, 5, 6, 4], seed: 31, drums: 'soft', swing: 0.06 },
  { bpm: 78, root: 57, minor: true, prog: [0, 3, 5, 4], seed: 41, drums: 'soft' },
  { bpm: 96, root: 64, minor: true, prog: [0, 6, 5, 4, 0, 6, 3, 4], seed: 53, drums: 'soft', swing: 0.1 },
  { bpm: 86, root: 69, minor: false, prog: [0, 3, 4, 0, 5, 3, 4, 4], seed: 61, drums: 'soft' },
  { bpm: 120, root: 55, minor: true, prog: [0, 6, 5, 6], seed: 71, drums: 'battle', bassOct: true },
  { bpm: 82, root: 63, minor: true, prog: [0, 5, 2, 3], seed: 83, drums: 'soft', arp16: true },
  { bpm: 104, root: 72, minor: false, prog: [0, 4, 5, 3, 0, 4, 3, 4], seed: 97, drums: 'soft', arp16: true },
  { bpm: 72, root: 60, minor: false, prog: [0, 5, 3, 4, 5, 3, 4, 0], seed: 101, drums: 'soft', arp16: true },
]
type Ambient = 'birds' | 'forest' | 'frogs' | 'wind' | 'snow' | 'fire' | 'drips' | 'sky' | 'stars'
const AMBIENT: Ambient[] = ['birds', 'forest', 'frogs', 'wind', 'snow', 'fire', 'drips', 'sky', 'stars']
let region = 0

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10]
const RHYTHMS = ['x.x.x.x.', 'x..xx.x.', 'xxx.x...', 'x.xxx.x.', 'x...x.xx', 'xx.xx.x.', 'x.x.xx..', 'x..x..x.']

const KEY = 'bb:music'
let enabled = (() => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } })()
let current: TrackName | null = null
let bus: GainNode | null = null
let timer: number | null = null
let step = 0
let nextTime = 0
let song: { lead: Array<{ step: number; midi: number; len: number }>; track: Track } | null = null
let pulse25: PeriodicWave | null = null, pulse12: PeriodicWave | null = null
const VOL = 0.55

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function pulseWave(a: AudioContext, duty: number) {
  const n = 32, real = new Float32Array(n), imag = new Float32Array(n)
  for (let k = 1; k < n; k++) { real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI); imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI) }
  return a.createPeriodicWave(real, imag)
}

/** Tohumlu melodi: güçlü vuruşlarda akor sesleri, arada adım adım hareket */
function compose(t: Track) {
  const R = rng(t.seed)
  const scale = t.minor ? MINOR : MAJOR
  const deg = (d: number) => t.root + 12 + 12 * Math.floor(d / 7) + scale[((d % 7) + 7) % 7]
  const phrase = (bars: number[], endRoot: boolean) => {
    const out: Array<{ step: number; deg: number; len: number }> = []
    let prev = 2 + Math.floor(R() * 3)
    bars.forEach((root, b) => {
      const rh = RHYTHMS[Math.floor(R() * RHYTHMS.length)]
      const last = b === bars.length - 1
      for (let i = 0; i < 8; i++) {
        if (rh[i] !== 'x') continue
        if (last && endRoot && i > 4) continue
        const chord = [root, root + 2, root + 4, root + 7]
        let d: number
        if (i % 4 === 0) d = chord.reduce((best, c) => (Math.abs(c - prev) < Math.abs(best - prev) ? c : best), chord[0])
        else d = R() < 0.6 ? prev + (R() < 0.5 ? 1 : -1) : chord[Math.floor(R() * 3)]
        d = Math.max(-1, Math.min(9, d)); prev = d
        let len = 1; while (i + len < 8 && rh[i + len] !== 'x' && len < 3) len++
        out.push({ step: b * 8 + i, deg: d, len })
      }
      if (last && endRoot) out.push({ step: b * 8 + 4, deg: root + 7 > 9 ? root : root + 7, len: 4 })
    })
    return out
  }
  const prog = t.prog.length === 4 ? [...t.prog, ...t.prog] : t.prog
  const A = phrase(prog.slice(0, 4), false)
  const A2 = phrase(prog.slice(4, 8), true)
  const B = phrase(prog.slice(0, 4).map(r => (r + 3) % 7), false)
  const lead: Array<{ step: number; midi: number; len: number }> = []
  const put = (p: typeof A, offsetBars: number) => p.forEach(n => lead.push({ step: (n.step + offsetBars * 8) * 2, midi: deg(n.deg), len: n.len * 2 }))
  put(A, 0); put(A2, 4); put(B, 8); put(A2, 12)
  return lead
}

function chordRoot(t: Track, bar: number) {
  const p8 = t.prog.length === 4 ? [...t.prog, ...t.prog] : t.prog
  const form = [...p8, ...p8.slice(0, 4).map(r => (r + 3) % 7), ...p8.slice(4, 8)]
  return form[bar % 16]
}

function note(a: AudioContext, wave: OscillatorType | PeriodicWave, midi: number, t: number, dur: number, vol: number, out: AudioNode) {
  const o = a.createOscillator(), g = a.createGain()
  if (wave instanceof PeriodicWave) o.setPeriodicWave(wave); else o.type = wave
  o.frequency.setValueAtTime(midiHz(midi), t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.008)
  g.gain.setValueAtTime(vol * 0.7, t + Math.min(dur * 0.4, 0.08))
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02)
}

function drum(a: AudioContext, kind: 'kick' | 'snare' | 'hat', t: number, vol: number, out: AudioNode) {
  if (kind === 'kick') {
    const o = a.createOscillator(), g = a.createGain()
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.18)
    return
  }
  const src = a.createBufferSource(); src.buffer = noiseBuffer(a)
  const f = a.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800
  const g = a.createGain(); const dur = kind === 'hat' ? 0.03 : 0.11
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02)
}

/** Ortam sesleri: kuş, baykuş, kurbağa, rüzgâr, kor, damla, çan, yıldız ışıltısı */
function ambient(a: AudioContext, kind: Ambient, t: number, out: AudioNode) {
  const R = Math.random
  const chirp = (f0: number, f1: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
    const o = a.createOscillator(), g = a.createGain(); o.type = type
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur)
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, at + dur)
    o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02)
  }
  const whoosh = (at: number, dur: number, vol: number, freq: number) => {
    const src = a.createBufferSource(); src.buffer = noiseBuffer(a)
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, at); f.frequency.linearRampToValueAtTime(freq * 1.6, at + dur); f.Q.value = 1.2
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + dur * 0.45); g.gain.linearRampToValueAtTime(0.0001, at + dur)
    src.connect(f); f.connect(g); g.connect(out); src.start(at, R() * 0.4); src.stop(at + dur + 0.05)
  }
  switch (kind) {
    case 'birds': { const f = 2400 + R() * 1400; for (let i = 0; i < 2 + Math.floor(R() * 3); i++) chirp(f, f * (1.2 + R() * 0.4), t + i * 0.09, 0.07, 0.025) } break
    case 'forest': if (R() < 0.5) { chirp(420, 380, t, 0.28, 0.035); chirp(400, 360, t + 0.4, 0.4, 0.03) } else chirp(3200, 4200, t, 0.05, 0.02); break
    case 'frogs': for (let i = 0; i < 2 + Math.floor(R() * 3); i++) chirp(150 + R() * 40, 110, t + i * 0.12, 0.08, 0.04, 'square'); break
    case 'wind': whoosh(t, 2.4, 0.035, 500); break
    case 'snow': whoosh(t, 2.8, 0.03, 900); if (R() < 0.4) chirp(2637, 2600, t + 0.6, 1.2, 0.015); break
    case 'fire': for (let i = 0; i < 4; i++) whoosh(t + R() * 0.8, 0.05, 0.05, 2500 + R() * 2000); chirp(60, 40, t, 1.2, 0.04, 'triangle'); break
    case 'drips': { const f = 1100 + R() * 700; chirp(f, f * 0.5, t, 0.12, 0.04); chirp(f * 0.9, f * 0.45, t + 0.35 + R() * 0.3, 0.1, 0.025) } break
    case 'sky': whoosh(t, 2, 0.02, 1200); chirp(1568, 1560, t + 0.3, 1.4, 0.016); chirp(2093, 2090, t + 0.6, 1.2, 0.012); break
    case 'stars': for (let i = 0; i < 3; i++) chirp(2600 + R() * 1800, 2600 + R() * 1800, t + i * 0.18, 0.5, 0.012); break
  }
}

function schedule() {
  const a = audio(); if (!a || !bus || !song) return
  const t = song.track
  const s16 = 60 / t.bpm / 4
  const scale = t.minor ? MINOR : MAJOR
  while (nextTime < a.currentTime + 0.15) {
    const loopStep = step % 256
    const bar = Math.floor(loopStep / 16), inBar = loopStep % 16
    const swing = t.swing && inBar % 4 === 2 ? s16 * t.swing * 4 : 0
    const time = nextTime + swing
    // melodi
    for (const n of song.lead) if (n.step === loopStep) note(a, pulse25!, n.midi, time, n.len * s16 * 0.95, 0.07, bus)
    // bas
    const root = chordRoot(t, bar)
    const bassMidi = t.root - 12 + 12 * Math.floor(root / 7) + scale[((root % 7) + 7) % 7]
    if (t.bassOct) { if (inBar % 2 === 0) note(a, 'triangle', bassMidi + (inBar % 4 === 2 ? 12 : 0), time, s16 * 1.8, 0.16, bus) }
    else if (inBar % 8 === 0 || inBar === 6 || inBar === 14) note(a, 'triangle', bassMidi + (inBar === 14 ? 7 : 0), time, s16 * (inBar % 8 === 0 ? 5 : 2), 0.17, bus)
    // arpej
    const chord = [root, root + 2, root + 4, root + 7].map(d => t.root + 12 * Math.floor(d / 7) + scale[((d % 7) + 7) % 7])
    if (t.arp16 || inBar % 2 === 0) note(a, pulse12!, chord[(t.arp16 ? inBar : inBar / 2) % 4] + 12, time, s16 * 0.9, t.drums === 'soft' ? 0.022 : 0.03, bus)
    // ortam sesi (köy müziğinde, bölgeye göre; her 2 ölçüde bir şans)
    if (current === 'town' && inBar === 4 && bar % 2 === 1 && Math.random() < 0.7) ambient(a, AMBIENT[region] ?? 'birds', time, bus)
    // davul
    if (t.drums === 'soft') {
      if (inBar === 0 || inBar === 10) drum(a, 'kick', time, 0.12, bus)
      if (inBar % 4 === 2) drum(a, 'hat', time, 0.025, bus)
    } else {
      if (inBar % 8 === 0 || (t.drums === 'arcade' && inBar === 10)) drum(a, 'kick', time, 0.2, bus)
      if (inBar % 8 === 4) drum(a, 'snare', time, 0.09, bus)
      if (inBar % 2 === 0) drum(a, 'hat', time, inBar % 4 === 2 ? 0.035 : 0.02, bus)
      if (t.drums === 'battle' && bar % 4 === 3 && inBar >= 12) drum(a, 'snare', time, 0.06, bus)
    }
    nextTime += s16
    step++
  }
}

function start(name: TrackName) {
  const a = audio(); const out = audioOut(); if (!a || !out) return
  if (!bus) {
    bus = a.createGain(); bus.gain.value = 0; bus.connect(out)
    pulse25 = pulseWave(a, 0.25); pulse12 = pulseWave(a, 0.125)
    onDuck(sec => {
      if (!bus || !enabled) return
      const now = a.currentTime
      bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now)
      bus.gain.linearRampToValueAtTime(VOL * 0.15, now + 0.08); bus.gain.setValueAtTime(VOL * 0.15, now + sec)
      bus.gain.linearRampToValueAtTime(VOL, now + sec + 0.8)
    })
  }
  const t = name === 'town' ? REGION_TOWN[region] ?? TRACKS.town : TRACKS[name]
  song = { lead: compose(t), track: t }
  step = 0; nextTime = a.currentTime + 0.12
  const now = a.currentTime
  bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(VOL, now + 1.2)
  if (timer === null) timer = window.setInterval(schedule, 40)
}

function halt(fade = 0.4) {
  const a = audio()
  if (bus && a) { const now = a.currentTime; bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + fade) }
  window.setTimeout(() => { if (timer !== null && (!enabled || document.hidden || !current)) { window.clearInterval(timer); timer = null } }, fade * 1000 + 50)
}

let unlocked = false
function whenUnlocked(fn: () => void) {
  if (unlocked) { fn(); return }
  const go = () => { unlocked = true; window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); fn() }
  window.addEventListener('pointerdown', go, { once: true }); window.addEventListener('keydown', go, { once: true })
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) halt(0.1)
  else if (enabled && current && unlocked) start(current)
})

export const music = {
  play(name: TrackName) {
    if (current === name && timer !== null) return
    current = name
    if (!enabled) return
    whenUnlocked(() => { if (current === name && enabled && !document.hidden) { if (timer !== null && bus) { halt(0.35); window.setTimeout(() => current === name && start(name), 380) } else start(name) } })
  },
  stop() { current = null; halt() },
  /** Haritadaki bölge değişince köy müziği ve ortam sesi değişir */
  setRegion(n: number) {
    const next = Math.max(0, Math.min(REGION_TOWN.length - 1, n | 0))
    if (next === region) return
    region = next
    if (current === 'town' && timer !== null && enabled) { halt(0.35); window.setTimeout(() => current === 'town' && start('town'), 380) }
  },
  /** Bir bölgenin ortam sesini hemen çalar (harita önizlemesi) */
  preview(n: number) { const a = audio(); const out = audioOut(); if (a && out && enabled) ambient(a, AMBIENT[n] ?? 'birds', a.currentTime + 0.05, out) },
  isEnabled: () => enabled,
  setEnabled(on: boolean) {
    enabled = on
    try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* yok say */ }
    if (!on) halt(0.3)
    else if (current) { const c = current; current = null; music.play(c) }
  },
}
