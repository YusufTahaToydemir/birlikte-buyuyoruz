// Sunucu bulmaca bankası: her seviyeden 24 tek çözümlü bulmaca üretip migration olarak yazar.
// Sunucu her oyunda bunlardan birini rastgele simetriyle (rakam, satır/sütun, bant, devrik) dönüştürür.
// Kullanım: node scripts/make-sudoku.mjs  →  supabase/migrations/0018_sudoku_bank.sql
import { writeFileSync } from 'node:fs'
import { makeSudoku, SUDOKU_LEVELS } from '../src/game/sudoku.ts'

const PER_LEVEL = 24
const rows = []
for (const lv of SUDOKU_LEVELS) {
  for (let k = 0; k < PER_LEVEL; k++) {
    const s = makeSudoku(1000 * lv.n + k * 7919 + 17, lv.givens)
    rows.push(`(${lv.n}, '${s.puzzle}', '${s.solution}')`)
  }
}
const sql = `-- 0018: Ortak sudoku bulmaca bankası (scripts/make-sudoku.mjs ile üretildi; elle düzenleme).
delete from sudoku_bank;
insert into sudoku_bank (level, puzzle, solution) values
${rows.join(',\n')};
select count(*) as sudoku_bank from sudoku_bank;
`
writeFileSync(new URL('../supabase/migrations/0018_sudoku_bank.sql', import.meta.url), sql)
console.log('yazıldı', rows.length)
