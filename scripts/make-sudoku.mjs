// Sunucu bulmaca bankası: her seviyeden 30 en az ipuçlu, dereceli bulmaca üretip migration olarak yazar.
// Seviye 1 Zor (yalnızca tekler, ~23 ipucu), 2 Uzman (kilitli aday / ikili), 3 Usta (X-wing, kılıçbalığı, XY-wing).
// Sunucu her oyunda bunlardan birini rastgele simetriyle (rakam, satır/sütun, bant, devrik) dönüştürür.
// Kullanım: node scripts/make-sudoku.mjs  →  supabase/migrations/0020_sudoku_bank2.sql
import { writeFileSync } from 'node:fs'
import { makeRated, SUDOKU_LEVELS } from '../src/game/sudoku.ts'

const PER_LEVEL = 30
const rows = []
const seen = new Set()
for (const lv of SUDOKU_LEVELS) {
  let n = 0
  for (let k = 0; n < PER_LEVEL; k++) {
    const s = makeRated(5000 * lv.n + k * 7919 + 23, lv.rating)
    if (s.rating !== lv.rating || seen.has(s.puzzle)) continue
    seen.add(s.puzzle); n++
    rows.push(`(${lv.n}, '${s.puzzle}', '${s.solution}')`)
  }
  console.log(lv.name, n)
}
const sql = `-- 0020: Zorlaştırılmış ortak sudoku bankası (scripts/make-sudoku.mjs ile üretildi; elle düzenleme).
-- Kullanıcı isteği (11 Kasım 2026): "iyi sudoku oyuncusuyuz, çok kolay geliyor". Hepsi en az ipuçlu (hiçbir ipucu silinemez).
-- 1 Zor: yalnızca tekler · 2 Uzman: kilitli aday / çıplak-gizli ikili · 3 Usta: üçlü, X-wing, kılıçbalığı, XY-wing.
delete from sudoku_bank;
insert into sudoku_bank (level, puzzle, solution) values
${rows.join(',\n')};
select level, count(*) from sudoku_bank group by level order by level;
`
writeFileSync(new URL('../supabase/migrations/0020_sudoku_bank2.sql', import.meta.url), sql)
console.log('yazıldı', rows.length)
