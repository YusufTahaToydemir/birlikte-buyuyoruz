import { describe, expect, it } from 'vitest'
import { completedUnits, countSolutions, isSingle, makeRated, makeSudoku, PEERS, rateSudoku } from './sudoku'

describe('sudoku', () => {
  it('aynı tohum aynı bulmaca, tek çözüm, istenen ipucu sayısı', () => {
    const a = makeSudoku(42, 36), b = makeSudoku(42, 36)
    expect(a).toEqual(b)
    expect([...a.puzzle].filter(c => c !== '0').length).toBe(36)
    expect(countSolutions([...a.puzzle].map(Number), 2)).toBe(1)
    ;[...a.puzzle].forEach((c, i) => { if (c !== '0') expect(c).toBe(a.solution[i]) })
    for (let i = 0; i < 81; i++) for (const p of PEERS[i]) expect(a.solution[p]).not.toBe(a.solution[i])
  })
  it('farklı tohum farklı bulmaca', () => {
    expect(makeSudoku(1).puzzle).not.toBe(makeSudoku(2).puzzle)
  })
  it('tamamlanan birim sayısı', () => {
    const s = makeSudoku(7)
    expect(completedUnits(s.solution, 0)).toBe(3)
    expect(completedUnits(s.puzzle.replace(/./, '0'), 0)).toBe(0)
  })
  it('derece: çözücü yanlış eleme yapmaz, istenen derece gelir', () => {
    for (let k = 0; k < 25; k++) { const s = makeSudoku(k * 911 + 5, 0); expect(() => rateSudoku(s.puzzle, s.solution)).not.toThrow() }
    const r = makeRated(77, 2)
    expect(r.rating).toBe(2)
    expect(rateSudoku(r.puzzle)).toBe(2)
    expect(makeRated(77, 2)).toEqual(r)
    expect(countSolutions([...r.puzzle].map(Number), 2)).toBe(1)
  })
  it('tek hücre tespiti: birimdeki son boşluk tektir', () => {
    const s = makeSudoku(9)
    const b = s.solution.slice(0, 4) + '0' + s.solution.slice(5)
    expect(isSingle(b, 4, +s.solution[4])).toBe(true)
  })
})
