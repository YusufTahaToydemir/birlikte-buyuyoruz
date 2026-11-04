// 8-bit sesler: WebAudio ile anlık sentez (dosya yok). Müzik de aynı ses bağlamını kullanır (music.ts).
let ctx: AudioContext | null = null
let enabled = true
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let duckUntil = 0

export function setSoundEnabled(on: boolean) { enabled = on }
export function isSoundEnabled() { return enabled }

/** Ortak ses bağlamı (ses kapalı olsa da müzik için açılabilir) */
export function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!C) return null
      ctx = new C()
      master = ctx.createGain(); master.gain.value = 0.4
      // yumuşak sınırlayıcı: üst üste binen seslerde cızırtı olmasın
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15
      master.connect(comp); comp.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}
export function audioOut(): AudioNode | null { audio(); return master }

function ac(): AudioContext | null { return enabled ? audio() : null }

/** Müzik, büyük efektlerin altında kısa süre kısılır */
export const duckMusic = (sec = 1.2) => { duckUntil = performance.now() + sec * 1000; duckListeners.forEach(l => l(sec)) }
const duckListeners: Array<(sec: number) => void> = []
export const onDuck = (l: (sec: number) => void) => { duckListeners.push(l) }
export const isDucked = () => performance.now() < duckUntil

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.22, slideTo?: number, attack = 0.005) {
  const a = ac(); if (!a || !master) return
  const t = a.currentTime + start
  const o = a.createOscillator(), g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g); g.connect(master)
  o.start(t); o.stop(t + dur + 0.03)
}

export function noiseBuffer(a: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf
  const buf = a.createBuffer(1, a.sampleRate, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

function noise(start: number, dur: number, vol = 0.3, freq = 800, type: BiquadFilterType = 'highpass') {
  const a = ac(); if (!a || !master) return
  const t = a.currentTime + start
  const src = a.createBufferSource(); src.buffer = noiseBuffer(a)
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f); f.connect(g); g.connect(master)
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02)
}

const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568, C7: 2093 }
const arp = (notes: number[], step: number, dur: number, type: OscillatorType = 'square', vol = 0.18, delay = 0) => notes.forEach((f, i) => tone(f, delay + i * step, dur, type, vol))

export const sfx = {
  click: () => { tone(N.A5, 0, 0.045, 'square', 0.09); tone(N.E6, 0.02, 0.03, 'triangle', 0.06) },
  tab: () => { tone(N.E5, 0, 0.05, 'square', 0.09); tone(N.B5, 0.05, 0.07, 'square', 0.09) },
  open: () => { tone(300, 0, 0.12, 'triangle', 0.12, 900); noise(0, 0.1, 0.05, 3000) },
  close: () => tone(700, 0, 0.1, 'triangle', 0.1, 260),
  quest: () => { arp([N.C5, N.E5, N.G5], 0.06, 0.08, 'square', 0.17); tone(N.C6, 0.18, 0.18, 'square', 0.17); tone(N.E6, 0.18, 0.22, 'triangle', 0.1) },
  coin: () => { tone(N.B5, 0.16, 0.06, 'square', 0.15); tone(N.E6, 0.22, 0.2, 'square', 0.15) },
  /** Uçan altın ikonları HUD'a çarptıkça artan perdeli tık */
  coinTick: (i: number) => tone(1200 + i * 90, 0, 0.05, 'square', 0.06),
  xpTick: (i: number) => tone(900 + i * 140, 0, 0.06, 'triangle', 0.07),
  hit: () => { noise(0.0, 0.14, 0.32, 500); tone(240, 0, 0.14, 'sawtooth', 0.18, 70); tone(90, 0, 0.18, 'sine', 0.3, 40) },
  crit: () => { noise(0, 0.2, 0.35, 400); tone(320, 0, 0.2, 'sawtooth', 0.2, 60); tone(N.E6, 0.05, 0.12, 'square', 0.12); tone(N.G6, 0.1, 0.16, 'square', 0.1) },
  roar: () => { tone(110, 0, 0.5, 'sawtooth', 0.16, 60); noise(0, 0.45, 0.12, 300, 'lowpass') },
  undo: () => { tone(N.G5, 0, 0.06, 'triangle', 0.18); tone(N.C5, 0.06, 0.1, 'triangle', 0.18) },
  hurt: () => { duckMusic(0.8); tone(300, 0, 0.25, 'sawtooth', 0.22, 90); noise(0, 0.15, 0.2, 300) },
  levelUp: () => {
    duckMusic(2)
    arp([N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6], 0.085, 0.13, 'square', 0.17)
    arp([N.C4, N.G4, N.C5], 0.17, 0.2, 'triangle', 0.2)
    tone(N.G6, 0.62, 0.5, 'triangle', 0.2); tone(N.C6, 0.62, 0.6, 'square', 0.1)
    noise(0.62, 0.5, 0.05, 5000)
  },
  victory: () => {
    duckMusic(2.2)
    arp([N.G4, N.C5, N.E5, N.G5, N.E5, N.G5, N.C6], 0.11, 0.16, 'square', 0.18)
    arp([N.C4, N.C4, N.G4, N.C5], 0.22, 0.2, 'triangle', 0.22)
    noise(0.8, 0.35, 0.12, 2000); tone(N.C6, 0.8, 0.7, 'triangle', 0.26); tone(N.E6, 0.8, 0.7, 'square', 0.08)
  },
  cheer: () => arp([N.E5, N.A5, N.E6], 0.06, 0.1, 'triangle', 0.18),
  heal: () => { arp([N.C5, N.E5, N.G5, N.C6, N.E6], 0.06, 0.25, 'sine', 0.17); noise(0.1, 0.4, 0.03, 6000) },
  buy: () => { tone(N.C6, 0, 0.05); tone(N.G5, 0.05, 0.05); tone(N.C6, 0.1, 0.15) },
  ticket: () => { duckMusic(1.5); arp([N.G5, N.B5, N.E6, N.G6], 0.1, 0.25, 'triangle', 0.22); noise(0.4, 0.4, 0.07, 4000) },
  shard: () => { arp([N.E6, N.B5, N.E6, N.G6], 0.05, 0.12, 'triangle', 0.16); noise(0.15, 0.3, 0.05, 6000) },
  sparkle: () => { arp([N.C7, N.G6, N.E6, N.C7], 0.04, 0.08, 'triangle', 0.08); noise(0, 0.25, 0.04, 7000) },
  error: () => { tone(160, 0, 0.12, 'square', 0.18); tone(120, 0.12, 0.18, 'square', 0.18) },
  dice: () => { for (let i = 0; i < 6; i++) tone(400 + Math.random() * 500, i * 0.05, 0.04, 'square', 0.1) },
  whoosh: () => noise(0, 0.22, 0.12, 1200, 'bandpass'),
  // mini oyunlar
  count: () => tone(N.A4, 0, 0.12, 'square', 0.16),
  go: () => { tone(N.A5, 0, 0.25, 'square', 0.18); tone(N.E6, 0, 0.25, 'triangle', 0.1) },
  good: () => { tone(N.E6, 0, 0.05, 'square', 0.12); tone(N.A5 * 2, 0.04, 0.07, 'square', 0.1) },
  great: () => arp([N.C6, N.E6, N.G6], 0.04, 0.08, 'square', 0.12),
  bad: () => { tone(200, 0, 0.12, 'sawtooth', 0.14, 120) },
  pad: (i: number) => tone([N.C5, N.E5, N.G5, N.B5, N.D6][i % 5], 0, 0.28, 'square', 0.16),
  slide: () => { tone(500, 0, 0.05, 'triangle', 0.1, 700); noise(0, 0.04, 0.04, 2500) },
  tick: () => tone(1800, 0, 0.02, 'square', 0.05),
  key: () => tone(1100 + Math.random() * 300, 0, 0.03, 'square', 0.06),
  flip: (res: 'G' | 'Y' | 'B') => tone(res === 'G' ? N.G5 : res === 'Y' ? N.E5 : N.C5, 0, 0.1, res === 'B' ? 'triangle' : 'square', 0.12),
  timeUp: () => { duckMusic(1); arp([N.G5, N.E5, N.C5], 0.12, 0.14, 'square', 0.16) },
}
