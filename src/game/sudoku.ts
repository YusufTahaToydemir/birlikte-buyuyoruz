// Sudoku motoru: tohumdan tek çözümlü bulmaca üretir. Düello (istemci) ve sunucu bulmaca bankası (scripts/make-sudoku.mjs) aynı kodu kullanır.
// Izgara: 81 karakterlik dizi, '0' boş hücre.

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function shuffled<T>(arr: T[], R: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export const row = (i: number) => Math.floor(i / 9)
export const col = (i: number) => i % 9
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3)
/** Her hücrenin 20 komşusu (aynı satır, sütun, kutu) */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter(j => j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))))
/** 27 birim: 9 satır, 9 sütun, 9 kutu */
export const UNITS: number[][] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3))),
]

function canPlace(g: number[], i: number, d: number) {
  for (const p of PEERS[i]) if (g[p] === d) return false
  return true
}

/** Çözüm sayısı (en fazla `limit`'e kadar sayar) */
export function countSolutions(g: number[], limit = 2): number {
  let best = -1, bestN = 10
  for (let i = 0; i < 81; i++) {
    if (g[i]) continue
    let n = 0
    for (let d = 1; d <= 9; d++) if (canPlace(g, i, d)) n++
    if (n === 0) return 0
    if (n < bestN) { bestN = n; best = i; if (n === 1) break }
  }
  if (best < 0) return 1
  let total = 0
  for (let d = 1; d <= 9 && total < limit; d++) {
    if (!canPlace(g, best, d)) continue
    g[best] = d
    total += countSolutions(g, limit - total)
    g[best] = 0
  }
  return total
}

function fill(g: number[], R: () => number): boolean {
  const i = g.indexOf(0)
  if (i < 0) return true
  for (const d of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], R)) {
    if (!canPlace(g, i, d)) continue
    g[i] = d
    if (fill(g, R)) return true
  }
  g[i] = 0
  return false
}

export interface Sudoku { puzzle: string; solution: string }

/** Tohumdan bulmaca: `givens` kadar ipucu kalana dek (tek çözüm korunarak) hücre siler */
export function makeSudoku(seed: number, givens = 36): Sudoku {
  const R = mulberry(seed)
  const sol = Array(81).fill(0)
  fill(sol, R)
  const g = sol.slice()
  let left = 81
  for (const i of shuffled(Array.from({ length: 81 }, (_, k) => k), R)) {
    if (left <= givens) break
    const keep = g[i]
    g[i] = 0
    if (countSolutions(g.slice(), 2) !== 1) g[i] = keep
    else left--
  }
  return { puzzle: g.join(''), solution: sol.join('') }
}

/** Seviyeler: ipucu sayısı */
export const SUDOKU_LEVELS = [
  { n: 1, name: 'Kolay', givens: 40 },
  { n: 2, name: 'Orta', givens: 33 },
  { n: 3, name: 'Zor', givens: 28 },
]
export const DUEL_GIVENS = 36

/** Bir birim tamamlandı mı (verilen tahtada hücre i'yi içeren birimler) */
export function completedUnits(board: string, i: number): number {
  return UNITS.filter(u => u.includes(i) && u.every(k => board[k] !== '0')).length
}
