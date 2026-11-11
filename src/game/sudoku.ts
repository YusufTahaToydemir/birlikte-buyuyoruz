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

// ---------------------------------------------------------------------------
// Mantıksal çözücü ve zorluk derecesi (11 Kasım 2026: "iyi oyuncuyuz, çok kolay geliyor")
//  1 = yalnızca tekler (çıplak / gizli tek) yeter
//  2 = kilitli adaylar, çıplak/gizli ikililer gerekir
//  3 = çıplak üçlü, X-wing, kılıçbalığı, XY-wing gerekir
//  4 = bunlarla da çözülmez (deneme-yanılma ister)
// ---------------------------------------------------------------------------
const bit = (d: number) => 1 << d
const popc = (m: number) => { let n = 0; while (m) { m &= m - 1; n++ } return n }
const digitsOf = (m: number) => { const r: number[] = []; for (let d = 1; d <= 9; d++) if (m & bit(d)) r.push(d); return r }
const ROWS = UNITS.slice(0, 9), COLS = UNITS.slice(9, 18), BOXES = UNITS.slice(18)
const sees = (a: number, b: number) => a !== b && (row(a) === row(b) || col(a) === col(b) || box(a) === box(b))
function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  const out: T[][] = []
  arr.forEach((x, i) => { for (const rest of combos(arr.slice(i + 1), k - 1)) out.push([x, ...rest]) })
  return out
}

/** Hücre için tahtadaki komşulara göre adaylar (bit maskesi) */
export function candidatesOf(board: string, i: number): number {
  let m = 0b1111111110
  for (const p of PEERS[i]) { const ch = board.charCodeAt(p) - 48; if (ch > 0) m &= ~bit(ch) }
  return m
}

/** Bu hücre şu an "tek" mi: tek adayı var ya da rakam birimlerinden birinde yalnızca buraya girebiliyor */
export function isSingle(board: string, i: number, d: number): boolean {
  const m = candidatesOf(board, i)
  if (popc(m) === 1) return true
  for (const u of UNITS) {
    if (!u.includes(i)) continue
    if (u.every(k => k === i || board[k] !== '0' || !(candidatesOf(board, k) & bit(d)))) return true
  }
  return false
}

/** Bulmacanın gerektirdiği en yüksek teknik (1-4) */
export function rateSudoku(puzzle: string, check?: string): number {
  const g = [...puzzle].map(Number)
  const cand = g.map((v, i) => v ? 0 : candidatesOf(puzzle, i))
  let level = 1
  const verify = () => { if (check) for (let i = 0; i < 81; i++) if (!g[i] && !(cand[i] & bit(+check[i]))) throw new Error('yanlış eleme ' + i) }
  const place = (i: number, d: number) => { g[i] = d; cand[i] = 0; for (const p of PEERS[i]) cand[p] &= ~bit(d) }
  const elim = (cells: number[], mask: number) => { let ch = false; for (const c of cells) if (cand[c] & mask) { cand[c] &= ~mask; ch = true } return ch }

  const singles = (): boolean => {
    for (let i = 0; i < 81; i++) if (!g[i] && popc(cand[i]) === 1) { place(i, digitsOf(cand[i])[0]); return true }
    for (const u of UNITS) for (let d = 1; d <= 9; d++) {
      const at = u.filter(k => cand[k] & bit(d))
      if (at.length === 1 && !u.some(k => g[k] === d)) { place(at[0], d); return true }
    }
    return false
  }
  const locked = (): boolean => {
    for (let d = 1; d <= 9; d++) {
      for (const b of BOXES) {
        const at = b.filter(k => cand[k] & bit(d)); if (at.length < 2) continue
        if (at.every(k => row(k) === row(at[0])) && elim(ROWS[row(at[0])].filter(k => box(k) !== box(at[0])), bit(d))) return true
        if (at.every(k => col(k) === col(at[0])) && elim(COLS[col(at[0])].filter(k => box(k) !== box(at[0])), bit(d))) return true
      }
      for (const u of [...ROWS, ...COLS]) {
        const at = u.filter(k => cand[k] & bit(d)); if (at.length < 2) continue
        if (at.every(k => box(k) === box(at[0])) && elim(BOXES[box(at[0])].filter(k => !u.includes(k)), bit(d))) return true
      }
    }
    return false
  }
  const nakedSet = (n: number): boolean => {
    for (const u of UNITS) {
      const empty = u.filter(k => cand[k] && popc(cand[k]) <= n)
      for (const set of combos(empty, n)) {
        const m = set.reduce((a, k) => a | cand[k], 0)
        if (popc(m) === n && elim(u.filter(k => !set.includes(k) && cand[k]), m)) return true
      }
    }
    return false
  }
  const hiddenPair = (): boolean => {
    for (const u of UNITS) for (let a = 1; a <= 9; a++) for (let b = a + 1; b <= 9; b++) {
      const pa = u.filter(k => cand[k] & bit(a)), pb = u.filter(k => cand[k] & bit(b))
      if (pa.length === 2 && pb.length === 2 && pa[0] === pb[0] && pa[1] === pb[1]) {
        const keep = bit(a) | bit(b)
        if (pa.some(k => cand[k] & ~keep)) { pa.forEach(k => { cand[k] &= keep }); return true }
      }
    }
    return false
  }
  const fish = (n: number): boolean => {
    for (let d = 1; d <= 9; d++) for (const [base, cover, pos] of [[ROWS, COLS, col], [COLS, ROWS, row]] as const) {
      const lines = base.map(u => u.filter(k => cand[k] & bit(d))).map((at, li) => ({ li, at })).filter(x => x.at.length >= 2 && x.at.length <= n)
      for (const set of combos(lines, n)) {
        const cs = new Set(set.flatMap(x => x.at.map(pos)))
        if (cs.size !== n) continue
        const own = new Set(set.flatMap(x => x.at))
        if (elim([...cs].flatMap(ci => cover[ci]).filter(k => !own.has(k)), bit(d))) return true
      }
    }
    return false
  }
  const xyWing = (): boolean => {
    const bi = cand.map((_, i) => i).filter(i => popc(cand[i]) === 2)
    for (const p of bi) {
      const [a, b] = digitsOf(cand[p])
      for (const x of bi) {
        if (!sees(p, x) || !(cand[x] & bit(a)) || cand[x] & bit(b)) continue
        const c = cand[x] & ~bit(a)
        for (const y of bi) {
          if (y === x || !sees(p, y) || cand[y] !== (bit(b) | c)) continue
          if (elim(cand.map((_, k) => k).filter(k => k !== x && k !== y && cand[k] && sees(k, x) && sees(k, y)), c)) return true
        }
      }
    }
    return false
  }

  for (let guard = 0; guard < 2000; guard++) {
    verify()
    if (g.every(v => v)) return level
    if (cand.some((m, i) => !g[i] && !m)) return 4
    if (singles()) continue
    if (locked() || nakedSet(2) || hiddenPair()) { level = Math.max(level, 2); continue }
    if (nakedSet(3) || fish(2) || fish(3) || xyWing()) { level = Math.max(level, 3); continue }
    return 4
  }
  return 4
}

/** Tohumdan istenen dereceye uyan, en az ipuçlu bulmaca (aynı tohum → aynı bulmaca) */
export function makeRated(seed: number, level: number, tries = 400): Sudoku & { rating: number } {
  let best: (Sudoku & { rating: number }) | null = null
  for (let k = 0; k < tries; k++) {
    const s = makeSudoku((seed * 31 + k * 104729) >>> 0, 0)
    const rating = rateSudoku(s.puzzle)
    if (rating === level) return { ...s, rating }
    if (rating < 4 && (!best || Math.abs(rating - level) < Math.abs(best.rating - level))) best = { ...s, rating }
  }
  return best!
}

/** Seviyeler (sunucu bankası): dereceye göre */
export const SUDOKU_LEVELS = [
  { n: 1, name: 'Zor', rating: 1 },
  { n: 2, name: 'Uzman', rating: 2 },
  { n: 3, name: 'Usta', rating: 3 },
]
/** Düello bulmacası: kilitli adaylar / ikililer gerektiren, en az ipuçlu */
export const DUEL_RATING = 2

/** Bir birim tamamlandı mı (verilen tahtada hücre i'yi içeren birimler) */
export function completedUnits(board: string, i: number): number {
  return UNITS.filter(u => u.includes(i) && u.every(k => board[k] !== '0')).length
}
