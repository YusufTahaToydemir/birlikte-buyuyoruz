// 8-bit sesler: WebAudio ile anlık sentez (dosya yok).
let ctx: AudioContext | null = null
let enabled = true
let master: GainNode | null = null

export function setSoundEnabled(on: boolean) { enabled = on }
export function isSoundEnabled() { return enabled }

function ac(): AudioContext | null {
  if (!enabled) return null
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new C()
      master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.25, slideTo?: number) {
  const a = ac(); if (!a || !master) return
  const t = a.currentTime + start
  const o = a.createOscillator(), g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g); g.connect(master)
  o.start(t); o.stop(t + dur + 0.02)
}

function noise(start: number, dur: number, vol = 0.3, hp = 800) {
  const a = ac(); if (!a || !master) return
  const t = a.currentTime + start
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const src = a.createBufferSource(); src.buffer = buf
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp
  const g = a.createGain(); g.gain.value = vol
  src.connect(f); f.connect(g); g.connect(master)
  src.start(t)
}

const N = { C4: 262, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G6: 1568 }

export const sfx = {
  click: () => tone(N.A5, 0, 0.05, 'square', 0.12),
  tab: () => { tone(N.E5, 0, 0.05, 'square', 0.1); tone(N.A5, 0.05, 0.06, 'square', 0.1) },
  quest: () => { tone(N.C5, 0, 0.07); tone(N.E5, 0.07, 0.07); tone(N.G5, 0.14, 0.12) },
  coin: () => { tone(N.B5, 0.18, 0.06, 'square', 0.18); tone(N.E6, 0.24, 0.18, 'square', 0.18) },
  hit: () => { noise(0.02, 0.12, 0.35, 600); tone(220, 0.02, 0.12, 'sawtooth', 0.2, 80) },
  undo: () => { tone(N.G5, 0, 0.06, 'triangle', 0.2); tone(N.C5, 0.06, 0.1, 'triangle', 0.2) },
  hurt: () => { tone(300, 0, 0.25, 'sawtooth', 0.25, 90); noise(0, 0.15, 0.2, 300) },
  levelUp: () => { [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6].forEach((f, i) => tone(f, i * 0.09, 0.14, 'square', 0.2)); tone(N.G6, 0.65, 0.4, 'triangle', 0.25) },
  victory: () => { [N.G4, N.C5, N.E5, N.G5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.12, 0.18, 'square', 0.22)); noise(0.85, 0.3, 0.15, 2000); tone(N.C6, 0.85, 0.6, 'triangle', 0.3) },
  cheer: () => { tone(N.E5, 0, 0.06, 'triangle', 0.2); tone(N.A5, 0.06, 0.06, 'triangle', 0.2); tone(N.E6, 0.12, 0.12, 'triangle', 0.2) },
  heal: () => { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.06, 0.2, 'sine', 0.2)) },
  buy: () => { tone(N.C6, 0, 0.05); tone(N.G5, 0.05, 0.05); tone(N.C6, 0.1, 0.15) },
  ticket: () => { [N.G5, N.B5, N.E6, N.G6].forEach((f, i) => tone(f, i * 0.1, 0.25, 'triangle', 0.25)); noise(0.4, 0.4, 0.08, 4000) },
  error: () => { tone(160, 0, 0.12, 'square', 0.2); tone(120, 0.12, 0.18, 'square', 0.2) },
  dice: () => { for (let i = 0; i < 6; i++) tone(400 + Math.random() * 500, i * 0.05, 0.04, 'square', 0.12) },
}
