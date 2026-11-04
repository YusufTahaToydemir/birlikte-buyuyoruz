import { describe, expect, it } from 'vitest'
import { WORDS, WORDS_BY_CAT } from './words'

describe('Kelime Düellosu sözlüğü', () => {
  it('400+ kelime, boş alan yok', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(400)
    for (const w of WORDS) { expect(w.en, JSON.stringify(w)).not.toBe(''); expect(w.tr, JSON.stringify(w)).not.toBe('') }
  })
  it('İngilizce ve Türkçe karşılıklar benzersiz (aynı doğru cevap iki şıkta çıkmasın)', () => {
    const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i)
    expect(dup(WORDS.map(w => w.en.toLowerCase()))).toEqual([])
    expect(dup(WORDS.map(w => w.tr.toLocaleLowerCase('tr-TR')))).toEqual([])
  })
  it('her konuda yanlış şık için yeterli kelime var', () => {
    for (const pool of WORDS_BY_CAT) expect(pool.length).toBeGreaterThanOrEqual(20)
  })
})
