import { describe, expect, it } from 'vitest'
import { completedUnits, countSolutions, DUEL_GIVENS, makeSudoku, PEERS } from './sudoku'

describe('sudoku', () => {
  it('aynı tohum aynı bulmaca, tek çözüm, istenen ipucu sayısı', () => {
    const a = makeSudoku(42, DUEL_GIVENS), b = makeSudoku(42, DUEL_GIVENS)
    expect(a).toEqual(b)
    expect([...a.puzzle].filter(c => c !== '0').length).toBe(DUEL_GIVENS)
    expect(countSolutions([...a.puzzle].map(Number), 2)).toBe(1)
    // ipuçları çözümle uyumlu, çözüm geçerli
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
})
