// Yordamsal piksel manzara: günün saatine göre gökyüzü, güneş/ay, yıldız, dağ, tepe, çimen, ağaç, bulut.
import { rng, shade } from '../pixel'
import { regionOf } from '../world'

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

/** Bölgeye göre gökyüzü: yıldız denizi hep gece, volkan kızıl, bulutların üstü parlak */
const REGION_SKY: Record<string, Partial<Record<TimeOfDay, string[]>>> = {
  volcano: { day: ['#6a2a2a', '#9a3a2a', '#d0602a', '#f0a050'], dusk: ['#3a1a2a', '#7a2a2a', '#c04a2a', '#f08a3a'], dawn: ['#4a2a4a', '#8a3a3a', '#d0603a', '#f0a060'] },
  cave: { day: ['#1a1830', '#24224a', '#2e2c5a', '#3a386a'], dusk: ['#1a1830', '#24224a', '#2e2c5a', '#3a386a'], dawn: ['#1a1830', '#24224a', '#2e2c5a', '#3a386a'], night: ['#0e0c20', '#16142e', '#1e1c3e', '#28264e'] },
  sky: { day: ['#4a90ff', '#7ab8ff', '#b0d8ff', '#e8f4ff'] },
  stars: { day: ['#140a30', '#24164a', '#3a2466', '#5a3a8a'], dawn: ['#140a30', '#24164a', '#3a2466', '#5a3a8a'], dusk: ['#140a30', '#24164a', '#3a2466', '#5a3a8a'], night: ['#0a0520', '#160c38', '#24164a', '#3a2466'] },
  desert: { day: ['#6ab0ff', '#9ac8ff', '#c8e0f8', '#f8e8c8'] },
  swamp: { day: ['#7a9aaa', '#9ab0b8', '#b8c8c8', '#d0d8d0'] },
}
const TOD_SHADE: Record<TimeOfDay, number> = { day: 0, dawn: -0.12, dusk: -0.22, night: -0.5 }

export function drawScene(canvas: HTMLCanvasElement, w: number, h: number, tod: TimeOfDay, seed = 7, region = 0) {
  const reg = regionOf(region)
  if (reg.key === 'stars') tod = 'night'
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const R = rng(seed)
  const px = (x: number, y: number, c: string, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh) }

  // gökyüzü bantları (dither geçişli)
  const sky = REGION_SKY[reg.key]?.[tod] ?? SKY[tod]
  const band = Math.ceil(h * 0.62 / sky.length)
  for (let i = 0; i < sky.length; i++) {
    px(0, i * band, sky[i], w, band)
    if (i < sky.length - 1) for (let x = 0; x < w; x += 2) px(x + ((i * band) % 2), (i + 1) * band - 1, sky[i + 1])
  }
  // yıldızlar
  if (tod === 'night' || tod === 'dawn') for (let i = 0; i < (tod === 'night' ? (reg.key === 'stars' ? 90 : 40) : 12); i++) px(Math.floor(R() * w), Math.floor(R() * h * 0.45), R() < 0.2 ? '#ffffff' : '#c8d0ff')
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
  const land0 = region === 0 ? { ...LAND[tod], path: tod === 'night' ? '#3a3a3a' : '#c8a878' } : null
  const k = TOD_SHADE[tod] * (reg.key === 'cave' || reg.key === 'stars' ? 0.3 : 1)
  const glow = reg.deco === 'rock' || reg.deco === 'crystal' || reg.deco === 'star'
  const land = land0 ?? { far: shade(reg.land.far, k), mid: shade(reg.land.mid, k), hill: shade(reg.land.hill, k), grass: shade(reg.land.grass, k), tree: glow ? reg.land.tree : shade(reg.land.tree, k), path: shade(reg.land.path, k) }
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
  if (reg.key === 'sky') {
    // bulut denizi: dağ yerine kabarık bulut tepeleri
    for (let x = 0; x < w; x++) { const y = Math.floor(h * 0.55 + Math.sin(x / 7 + seed) * 4 + Math.sin(x / 3) * 1.5); px(x, y, shade(land.far, -0.05), 1, h - y) }
  } else mountains(Math.floor(h * 0.64), 5, Math.floor(h * 0.2), Math.floor(h * 0.4), land.far, (tod !== 'night' && region === 0) || !!reg.snow)
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
  // bataklık suyu / lav akıntısı
  if (reg.key === 'swamp') for (let i = 0; i < 4; i++) { const wx = Math.floor(R() * w), wy = gy + 2 + Math.floor(R() * (h - gy - 4)); px(wx, wy, shade('#4a7a8a', k), 10 + Math.floor(R() * 8), 2); px(wx + 2, wy, shade('#8ab8c8', k), 3, 1) }
  if (reg.key === 'volcano') for (let x = 0; x < w; x++) { if (Math.sin(x / 9 + seed) > 0.75) px(x, gy + 1 + Math.floor(Math.sin(x / 4) * 1.5 + 2), x % 3 ? '#ff8a3d' : '#ffd75a', 1, 2) }
  // patika
  for (let y = gy + 2; y < h; y++) { const pw = 6 + (y - gy) * 2; px(Math.floor(w * 0.5 - pw / 2), y, land.path, pw, 1) }
  // çiçek / taş / kar / yıldız tozu
  const dots = reg.key === 'snow' ? ['#ffffff', '#dce8f8'] : reg.key === 'desert' ? ['#c89060', '#f8e0a0'] : reg.key === 'volcano' ? ['#ff6a2a', '#5a3a3a'] : reg.key === 'cave' ? ['#7ef0ff', '#b98aff'] : reg.key === 'stars' || reg.key === 'sky' ? ['#ffe680', '#ffffff'] : reg.key === 'swamp' ? ['#ff9ad0', '#c8e0a0'] : ['#ff6a8a', '#ffd75a', '#ffffff', '#b98aff']
  for (let i = 0; i < 18; i++) px(Math.floor(R() * w), gy + 1 + Math.floor(R() * (h - gy - 2)), dots[Math.floor(R() * dots.length)])
  // ağaçlar (çam)
  const tree = (tx: number, ty: number, size: number) => {
    for (let i = 0; i < size; i++) {
      const wdt = 1 + Math.floor(i * 0.7)
      px(tx - wdt, ty + i, i % 3 === 2 ? shade(land.tree, -0.25) : land.tree, wdt * 2 + 1, 1)
    }
    px(tx - 1, ty + size, '#5a3a22', 3, 3)
  }
  const oak = (tx: number, ty: number, size: number) => {
    px(tx - 1, ty + size - 4, '#5a3a22', 3, 7)
    const r2 = Math.floor(size / 2)
    for (let y = -r2; y <= r2; y++) for (let x = -r2; x <= r2; x++) if (x * x + y * y * 1.3 < r2 * r2) px(tx + x, ty + r2 - 3 + y, (x + y) % 4 === 0 ? shade(land.tree, -0.25) : y < -1 ? shade(land.tree, 0.12) : land.tree)
  }
  const reed = (tx: number, ty: number, size: number) => { for (let i = 0; i < 4; i++) { px(tx + i * 2, ty + 3 + (i % 2) * 2, land.tree, 1, size - (i % 2) * 2); px(tx + i * 2, ty + 1 + (i % 2) * 2, '#7a4a2a', 1, 3) } }
  const cactus = (tx: number, ty: number, size: number) => {
    px(tx - 1, ty, land.tree, 3, size + 3); px(tx - 4, ty + 4, land.tree, 2, 4); px(tx - 4, ty + 7, land.tree, 4, 2); px(tx + 3, ty + 2, land.tree, 2, 5); px(tx + 1, ty + 6, land.tree, 3, 2)
    px(tx, ty + 1, shade(land.tree, 0.25), 1, size)
  }
  const rock = (tx: number, ty: number, size: number) => {
    for (let i = 0; i < size; i++) { const wd = Math.floor(size / 2 - Math.abs(i - size / 2) / 2); px(tx - wd, ty + i + 3, i % 4 === 0 ? '#2a1818' : '#3a2424', wd * 2 + 1, 1) }
    px(tx, ty + 5, land.tree, 1, size - 3); px(tx - 1, ty + 7, '#ffd75a', 1, 2)
  }
  const crystal = (tx: number, ty: number, size: number) => {
    for (const [dx, hh] of [[0, size], [-3, size - 4], [3, size - 6]]) for (let i = 0; i < hh; i++) { const wd = i < 3 ? Math.floor(i / 2) : 1; px(tx + dx - wd, ty + (size - hh) + i + 3, i % 3 === 0 ? '#ffffff' : land.tree, wd * 2 + 1, 1) }
  }
  const cloud = (tx: number, ty: number, size: number) => { const x0 = tx - Math.floor(size / 2), y0 = ty + Math.floor(size / 2); px(x0, y0 + 2, '#ffffff', size, 3); px(x0 + 3, y0, '#ffffff', size - 6, 2); px(x0, y0 + 5, '#dce8f8', size, 1) }
  const starDeco = (tx: number, ty: number, size: number) => { const c = land.tree, y0 = ty + Math.floor(size / 2); px(tx, y0 - 3, c, 1, 7); px(tx - 3, y0, c, 7, 1); px(tx - 1, y0 - 1, '#ffffff', 3, 3) }
  const pine = (tx: number, ty: number, size: number) => { tree(tx, ty, size); if (reg.deco === 'snowpine') for (let i = 0; i < size; i += 3) { const wdt = 1 + Math.floor(i * 0.7); px(tx - wdt, ty + i, '#f4f8ff', wdt * 2 + 1, 1) } }
  const deco = reg.deco === 'oak' ? oak : reg.deco === 'reed' ? reed : reg.deco === 'cactus' ? cactus : reg.deco === 'rock' ? rock : reg.deco === 'crystal' ? crystal : reg.deco === 'cloud' ? cloud : reg.deco === 'star' ? starDeco : pine
  deco(Math.floor(w * 0.08), gy - 14, 13); deco(Math.floor(w * 0.18), gy - 10, 10)
  deco(Math.floor(w * 0.9), gy - 15, 14); deco(Math.floor(w * 0.97), gy - 9, 9)
}
