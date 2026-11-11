// Zorluk dağılımı ve süre ölçümü (geliştirme aracı): node scripts/sudoku-stats.mjs
import { makeSudoku, rateSudoku, makeRated, countSolutions } from '../src/game/sudoku.ts'

const t0 = performance.now()
const hist = { 1: 0, 2: 0, 3: 0, 4: 0 }
let givens = 0
const N = 300
for (let k = 0; k < N; k++) {
  const s = makeSudoku(k * 7919 + 3, 0)
  hist[rateSudoku(s.puzzle)]++
  givens += [...s.puzzle].filter(c => c !== '0').length
}
console.log('dağılım', hist, 'ort. ipucu', (givens / N).toFixed(1), 'ms/bulmaca', ((performance.now() - t0) / N).toFixed(1))
for (const lv of [1, 2, 3]) {
  const t = performance.now()
  const r = makeRated(12345 + lv, lv)
  console.log('seviye', lv, 'derece', r.rating, 'ipucu', [...r.puzzle].filter(c => c !== '0').length, 'tek çözüm', countSolutions([...r.puzzle].map(Number), 2) === 1, 'ms', (performance.now() - t).toFixed(0))
}
