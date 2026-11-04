// Basit piksel motoru: harf haritaları + palet → ızgara → kontur → canvas / dataURL.
export type Palette = Record<string, string | undefined>
export type Grid = (string | null)[][]
/** [y, x, satırlar] — '.' ve ' ' saydam */
export type Block = [number, number, string[]]

export const OUTLINE = '#160f22'

export function makeGrid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null))
}

export function paint(grid: Grid, blocks: Block[], pal: Palette, ox = 0, oy = 0) {
  const h = grid.length, w = grid[0].length
  for (const [y0, x0, lines] of blocks) {
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r]
      for (let c = 0; c < line.length; c++) {
        const ch = line[c]
        if (ch === '.' || ch === ' ') continue
        const color = pal[ch]
        if (!color) continue
        const y = y0 + r + oy, x = x0 + c + ox
        if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = color
      }
    }
  }
}

/** Tek satırlık kısa yazım: [y, x, 'ABC'] */
export const s = (y: number, x: number, str: string): Block => [y, x, [str]]

export function outline(grid: Grid, color = OUTLINE): Grid {
  const h = grid.length, w = grid[0].length
  const out = grid.map(r => r.slice())
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x]) continue
    if ((y > 0 && grid[y - 1][x]) || (y < h - 1 && grid[y + 1][x]) || (x > 0 && grid[y][x - 1]) || (x < w - 1 && grid[y][x + 1])) out[y][x] = color
  }
  return out
}

export function drawGrid(canvas: HTMLCanvasElement, grid: Grid) {
  const h = grid.length, w = grid[0].length
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grid[y][x]
    if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1) }
  }
}

const urlCache = new Map<string, string>()
export function gridToURL(key: string, make: () => Grid): string {
  const hit = urlCache.get(key)
  if (hit) return hit
  if (typeof document === 'undefined') return ''
  const c = document.createElement('canvas')
  drawGrid(c, make())
  const url = c.toDataURL()
  urlCache.set(key, url)
  return url
}

/** Tekrarlanabilir rastgele (sahne ve doku için) */
export function rng(seed: number) {
  let t = seed >>> 0
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 }
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt }
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}
