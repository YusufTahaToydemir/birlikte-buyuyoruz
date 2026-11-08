// Haftalık boss'lar: 48x48, yarı yordamsal (elips/kutu + elle detay), paletle 6 çeşit.
import { type Grid, type Palette, makeGrid, outline, paint, rng, s, shade } from '../pixel'

export const BOSS_SIZE = 48

interface BossPal { base: string; dark: string; light: string; eye: string; accent: string; mouth: string }
const PALS: Record<string, BossPal> = {
  slime_green: { base: '#5cc95c', dark: '#2f8a3f', light: '#b6f2a8', eye: '#1a1a2a', accent: '#f5c94a', mouth: '#1f5a2a' },
  slime_purple: { base: '#a265d6', dark: '#6a3a9a', light: '#dcb8ff', eye: '#1a1a2a', accent: '#7ff7ff', mouth: '#3f1f5f' },
  golem_stone: { base: '#8a8f9a', dark: '#5a5f6a', light: '#b9bec8', eye: '#5fe0ff', accent: '#5fe0ff', mouth: '#2a2d33' },
  golem_lava: { base: '#4a3a3a', dark: '#2a1f1f', light: '#6a5555', eye: '#ffb03a', accent: '#ff6a2a', mouth: '#1a1010' },
  dragon_green: { base: '#4fa85a', dark: '#2f6f3a', light: '#8fd68a', eye: '#ffe04a', accent: '#f0d090', mouth: '#5a1f1f' },
  dragon_shadow: { base: '#4a3a6a', dark: '#2a1f40', light: '#7a68a0', eye: '#ff3a5a', accent: '#c0a8ff', mouth: '#1a0f25' },
  slime_blue: { base: '#5fb8e8', dark: '#2f7ab0', light: '#c8f0ff', eye: '#1a1a2a', accent: '#ffffff', mouth: '#1f3f6a' },
  slime_gold: { base: '#f0c34a', dark: '#b8922e', light: '#fff0a0', eye: '#1a1a2a', accent: '#ff6a8a', mouth: '#6a4a10' },
  golem_ice: { base: '#a8d8f0', dark: '#6aa0c8', light: '#e8f8ff', eye: '#3a6aff', accent: '#3a6aff', mouth: '#2a4060' },
  golem_moss: { base: '#6a7a5a', dark: '#45523a', light: '#8fa878', eye: '#b8ff5a', accent: '#5bd17c', mouth: '#2a301f' },
  dragon_red: { base: '#c83a3a', dark: '#8a1f24', light: '#ff7a6a', eye: '#ffe04a', accent: '#ffd090', mouth: '#3a0f0f' },
  dragon_gold: { base: '#e0b030', dark: '#a07a10', light: '#fff0a0', eye: '#ff3a3a', accent: '#fff8e0', mouth: '#5a3a0a' },
}

function ellipse(g: Grid, cx: number, cy: number, rx: number, ry: number, color: (x: number, y: number, nx: number, ny: number) => string | null, clipBottom = 99) {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry
    if (nx * nx + ny * ny <= 1 && y <= clipBottom) { const c = color(x, y, nx, ny); if (c) g[y][x] = c }
  }
}

function slime(p: BossPal, king: boolean): Grid {
  const g = makeGrid(BOSS_SIZE, BOSS_SIZE)
  ellipse(g, 24, 32, 21, 16, (_x, _y, nx, ny) => (nx + ny > 0.9 ? p.dark : nx + ny < -0.9 ? p.light : p.base), 45)
  // damlalar
  for (const [x, y] of [[6, 38], [41, 36], [12, 44], [36, 44]] as const) { g[y][x] = p.dark; g[y + 1]?.[x] !== undefined && (g[y + 1][x] = p.dark) }
  // parlaklık
  ellipse(g, 14, 24, 4, 3, () => p.light)
  g[22][12] = '#ffffff'; g[22][13] = '#ffffff'; g[23][12] = '#ffffff'
  const pal: Palette = { E: p.eye, W: '#ffffff', M: p.mouth, F: '#ffffff', B: p.dark, C: p.accent, c: shade(p.accent, -0.3), G: '#e83a5a' }
  paint(g, [
    // kızgın kaşlar
    s(25, 13, 'BBB'), s(26, 15, 'BB'), s(25, 32, 'BBB'), s(26, 31, 'BB'),
    // gözler
    [27, 14, ['WWWW', 'WEEW', 'WEEW', '.WW.']],
    [27, 30, ['WWWW', 'WEEW', 'WEEW', '.WW.']],
    // ağız ve dişler
    s(35, 17, 'MMMMMMMMMMMMMM'), s(36, 18, 'MFMMMMMMMMMMF'.slice(0, 12)), s(37, 20, 'MMMMMMMM'),
    s(36, 18, 'F'), s(36, 29, 'F'),
  ], pal)
  if (king) paint(g, [
    [9, 15, [
      'C...C..C...C'.padEnd(18, '.'),
      'CC.CCCCCC.CC'.padEnd(18, '.'),
      'CCCCCCCCCCCC'.padEnd(18, '.'),
      'cCGCCGGCCGCc'.padEnd(18, '.'),
      'cccccccccccc'.padEnd(18, '.'),
    ]],
  ], pal, 3, 4)
  return outline(g)
}

function golem(p: BossPal, seed: number): Grid {
  const g = makeGrid(BOSS_SIZE, BOSS_SIZE)
  const R = rng(seed)
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let c = p.base
      if (x === x1 || y === y1) c = p.dark
      else if (x === x0 || y === y0) c = p.light
      else if (R() < 0.12) c = R() < 0.5 ? p.dark : p.light
      g[y][x] = c
    }
  }
  box(5, 19, 12, 38)    // sol kol
  box(35, 19, 42, 38)   // sağ kol
  box(13, 37, 21, 46)   // bacaklar
  box(26, 37, 34, 46)
  box(11, 18, 36, 38)   // gövde
  box(16, 6, 31, 19)    // baş
  box(3, 36, 13, 42)    // yumruklar
  box(34, 36, 44, 42)
  // çatlaklar ve çekirdek
  const pal: Palette = { G: p.accent, g: shade(p.accent, -0.35), E: p.eye, D: p.mouth, W: '#ffffff' }
  paint(g, [
    s(10, 18, 'DD'), s(10, 28, 'DD'),
    s(11, 19, 'EE'), s(11, 27, 'EE'), s(12, 19, 'EE'), s(12, 27, 'EE'),
    s(15, 20, 'DDDDDDDD'), s(16, 21, 'D.D.D.D'),
    [24, 21, ['.GGG.', 'GGWGG', 'GWGGG', 'GGGGg', '.ggg.']],
    s(21, 14, 'g'), s(22, 15, 'g'), s(23, 15, 'g'), s(30, 31, 'g'), s(31, 32, 'g'), s(32, 32, 'g'), s(27, 8, 'g'), s(28, 9, 'g'),
  ], pal)
  return outline(g)
}

function dragon(p: BossPal): Grid {
  const g = makeGrid(BOSS_SIZE, BOSS_SIZE)
  // kanatlar (arkada)
  for (let y = 8; y < 34; y++) {
    const span = Math.max(0, Math.floor((y - 8) * 0.55))
    for (let i = 0; i <= span; i++) {
      const lx = 14 - i, rx = 33 + i
      const c = (y + i) % 6 === 0 ? p.dark : shade(p.base, -0.15)
      if (lx >= 0 && y < 34 - i * 0.6) g[y][lx] = c
      if (rx < 48 && y < 34 - i * 0.6) g[y][rx] = c
    }
  }
  // gövde
  ellipse(g, 24, 34, 14, 11, (_x, _y, nx, ny) => (nx + ny > 0.8 ? p.dark : nx + ny < -0.9 ? p.light : p.base), 46)
  // karın
  ellipse(g, 24, 37, 7, 8, (_x, y) => (y % 3 === 0 ? shade(p.accent, -0.2) : p.accent), 45)
  // kuyruk
  for (let i = 0; i < 10; i++) { const x = 37 + i, y = 42 - Math.floor(i * 0.7); if (x < 48) { g[y][x] = p.base; g[y + 1][x] = p.dark } }
  // baş
  ellipse(g, 24, 16, 10, 9, (_x, _y, nx, ny) => (nx + ny > 0.8 ? p.dark : nx + ny < -0.9 ? p.light : p.base))
  ellipse(g, 24, 22, 7, 4, () => shade(p.base, 0.1))
  const pal: Palette = { H: p.accent, h: shade(p.accent, -0.3), E: p.eye, P: '#1a1a1a', N: p.dark, M: p.mouth, F: '#ffffff', L: '#ffb03a', l: '#ff5a2a' }
  paint(g, [
    // boynuzlar
    s(4, 14, 'H'), s(5, 14, 'Hh'), s(6, 15, 'Hh'), s(7, 16, 'Hh'),
    s(4, 33, 'H'), s(5, 32, 'hH'), s(6, 31, 'hH'), s(7, 30, 'hH'),
    // gözler
    s(14, 18, 'EEE'), s(15, 18, 'EPE'), s(14, 27, 'EEE'), s(15, 27, 'EPE'),
    s(12, 17, 'NNNN'), s(12, 27, 'NNNN'),
    // burun delikleri ve ağız
    s(21, 21, 'N'), s(21, 26, 'N'),
    s(24, 19, 'MMMMMMMMMM'), s(25, 19, 'F.F....F.F'.replace(/\./g, 'M')),
    // ateş nefesi kıvılcımı
    s(26, 22, 'LlL'), s(27, 23, 'l'),
    // pençeler
    s(44, 14, 'FFF'), s(44, 31, 'FFF'),
  ], pal)
  return outline(g)
}

export function renderBoss(key: string): Grid {
  const p = PALS[key] ?? PALS.slime_green
  if (key.startsWith('slime')) return slime(p, key === 'slime_green' || key === 'slime_gold')
  if (key.startsWith('golem')) return golem(p, ({ golem_lava: 7, golem_ice: 5, golem_moss: 11 } as Record<string, number>)[key] ?? 3)
  return dragon(p)
}
