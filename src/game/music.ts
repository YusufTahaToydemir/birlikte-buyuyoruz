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
  const t = TRACKS[name]
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
  isEnabled: () => enabled,
  setEnabled(on: boolean) {
    enabled = on
    try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* yok say */ }
    if (!on) halt(0.3)
    else if (current) { const c = current; current = null; music.play(c) }
  },
}
