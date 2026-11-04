// Yordamsal piksel manzara: günün saatine göre gökyüzü, güneş/ay, yıldız, dağ, tepe, çimen, ağaç, bulut.
import { rng, shade } from '../pixel'

export type TimeOfDay = 'night' | 'dawn' | 'day' | 'dusk'

export function timeOfDay(date = new Date()): TimeOfDay {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }).format(date))
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

const SKY: Record<TimeOfDay, string[]> = {
  night: ['#0b0f2a', '#121a3d', '#1b2550', '#243063'],
  dawn: ['#3a3f86', '#7a5fa8', '#e07ba0', '#f6b38a'],
  day: ['#5aa9ff', '#7cc0ff', '#a3d6ff', '#cdeaff'],
  dusk: ['#3a2a6a', '#8a3f7a', '#e0605a', '#f5a050'],
}
const LAND: Record<TimeOfDay, { far: string; mid: string; hill: string; grass: string; tree: string }> = {
  night: { far: '#2a2f5a', mid: '#1f2a45', hill: '#1d3a3a', grass: '#22472f', tree: '#173225' },
  dawn: { far: '#7a6aa8', mid: '#5a5a8a', hill: '#4f7a5a', grass: '#5a9a4a', tree: '#2f5a3a' },
  day: { far: '#8fb0d6', mid: '#6a93b0', hill: '#5aae5a', grass: '#6cc24a', tree: '#2f7a3a' },
  dusk: { far: '#8a5a8a', mid: '#6a4a6a', hill: '#4a6a4a', grass: '#5a8a3a', tree: '#2a4a2a' },
}

export function drawScene(canvas: HTMLCanvasElement, w: number, h: number, tod: TimeOfDay, seed = 7) {
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const R = rng(seed)
  const px = (x: number, y: number, c: string, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh) }

  // gökyüzü bantları (dither geçişli)
  const sky = SKY[tod]
  const band = Math.ceil(h * 0.62 / sky.length)
  for (let i = 0; i < sky.length; i++) {
    px(0, i * band, sky[i], w, band)
    if (i < sky.length - 1) for (let x = 0; x < w; x += 2) px(x + ((i * band) % 2), (i + 1) * band - 1, sky[i + 1])
  }
  // yıldızlar
  if (tod === 'night' || tod === 'dawn') for (let i = 0; i < (tod === 'night' ? 40 : 12); i++) px(Math.floor(R() * w), Math.floor(R() * h * 0.45), R() < 0.2 ? '#ffffff' : '#c8d0ff')
  // güneş / ay
  const cx = Math.floor(w * (tod === 'dawn' ? 0.2 : tod === 'dusk' ? 0.78 : 0.8)), cy = Math.floor(h * (tod === 'day' ? 0.16 : tod === 'night' ? 0.18 : 0.36))
  const r = 6
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = x * x + y * y
    if (d <= r * r) {
      if (tod === 'night') { if ((x - 3) * (x - 3) + (y + 1) * (y + 1) > 22) px(cx + x, cy + y, d < 12 ? '#fff6d0' : '#f0e0a0') }
      else px(cx + x, cy + y, tod === 'day' ? (d < 14 ? '#fffbe0' : '#ffe680') : (d < 14 ? '#fff0c0' : '#ffb060'))
    } else if (tod === 'day' && d <= (r + 2) * (r + 2) && (x + y) % 2 === 0) px(cx + x, cy + y, '#fff3b0')
  }
  // bulutlar
  for (let i = 0; i < 4; i++) {
    const bx = Math.floor(R() * w), by = Math.floor(h * (0.08 + R() * 0.25))
    const col = tod === 'night' ? '#2f3a6a' : tod === 'day' ? '#ffffff' : '#f4c0c8'
    const len = 8 + Math.floor(R() * 10)
    px(bx, by, col, len, 2); px(bx + 2, by - 2, col, len - 5, 2); px(bx + 4, by - 3, col, 3, 1)
    px(bx, by + 2, shade(col, -0.12), len, 1)
  }
  const land = LAND[tod]
  // dağlar: üçgen zirveler, gölgeli yamaç, karlı tepe
  const mountains = (base: number, count: number, minH: number, maxH: number, color: string, snow: boolean) => {
    const tops = new Array<number>(w).fill(h)
    const dark = new Array<boolean>(w).fill(false)
    for (let i = 0; i < count; i++) {
      const cxp = Math.floor((i + 0.2 + R() * 0.6) * w / count)
      const mh = minH + Math.floor(R() * (maxH - minH))
      const slope = 0.7 + R() * 0.5
      for (let x = 0; x < w; x++) {
        const y = base - mh + Math.floor(Math.abs(x - cxp) * slope)
        if (y < tops[x]) { tops[x] = y; dark[x] = x > cxp }
      }
    }
    const snowLine = base - Math.floor(maxH * 0.7)
    for (let x = 0; x < w; x++) {
      const y = Math.min(tops[x], base)
      px(x, y, dark[x] ? shade(color, -0.16) : color, 1, h - y)
      if (snow && y < snowLine) px(x, y, dark[x] ? '#c8d4f0' : '#f4f8ff', 1, snowLine - y + (x % 3 === 0 ? 1 : 0))
    }
  }
  mountains(Math.floor(h * 0.64), 5, Math.floor(h * 0.2), Math.floor(h * 0.4), land.far, tod !== 'night')
  mountains(Math.floor(h * 0.7), 7, Math.floor(h * 0.08), Math.floor(h * 0.2), land.mid, false)
  // tepeler (yumuşak)
  for (let x = 0; x < w; x++) {
    const y = Math.floor(h * 0.68 + Math.sin(x / 11 + seed) * 3 + Math.sin(x / 5) * 1.2)
    px(x, y, land.hill, 1, h - y)
  }
  // çimen zemini
  const gy = Math.floor(h * 0.78)
  px(0, gy, land.grass, w, h - gy)
  for (let x = 0; x < w; x++) { if (R() < 0.5) px(x, gy - 1, land.grass); if (R() < 0.18) px(x, gy + 2 + Math.floor(R() * (h - gy - 3)), shade(land.grass, -0.18)) }
  // patika
  for (let y = gy + 2; y < h; y++) { const pw = 6 + (y - gy) * 2; px(Math.floor(w * 0.5 - pw / 2), y, tod === 'night' ? '#3a3a3a' : '#c8a878', pw, 1) }
  // çiçekler
  for (let i = 0; i < 18; i++) px(Math.floor(R() * w), gy + 1 + Math.floor(R() * (h - gy - 2)), ['#ff6a8a', '#ffd75a', '#ffffff', '#b98aff'][Math.floor(R() * 4)])
  // ağaçlar (çam)
  const tree = (tx: number, ty: number, size: number) => {
    for (let i = 0; i < size; i++) {
      const wdt = 1 + Math.floor(i * 0.7)
      px(tx - wdt, ty + i, i % 3 === 2 ? shade(land.tree, -0.25) : land.tree, wdt * 2 + 1, 1)
    }
    px(tx - 1, ty + size, '#5a3a22', 3, 3)
  }
  tree(Math.floor(w * 0.08), gy - 14, 13); tree(Math.floor(w * 0.18), gy - 10, 10)
  tree(Math.floor(w * 0.9), gy - 15, 14); tree(Math.floor(w * 0.97), gy - 9, 9)
}
