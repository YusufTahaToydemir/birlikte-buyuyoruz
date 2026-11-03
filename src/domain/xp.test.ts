import { describe, expect, it } from 'vitest'
import { checklistXP, choice3XP, currentLevel, levelThreshold, meetsPercent, numericXP, previewXP, statusForValue, timeXP } from './xp'

describe('XP matematiği (Şartname §7)', () => {
  it('20 kelime hedefinde 10 kelime = 6 XP', () => expect(numericXP(12, 10, 20)).toBe(6))
  it('hedef aşımı ek XP vermez', () => expect(numericXP(12, 25, 20)).toBe(12))
  it('30 dk sporda 15 dk = 7, 30 dk = 15', () => {
    expect(numericXP(15, 15, 30)).toBe(7)
    expect(numericXP(15, 30, 30)).toBe(15)
  })
  it('güvenli sınır: hedefin 10 katı üstü hata', () => expect(() => numericXP(12, 201, 20)).toThrow('VALUE_TOO_LARGE'))
  it('kontrol listesi 3/4 = 7 XP', () => expect(checklistXP(10, 3, 4)).toBe(7))
  it('beslenme: 12 / 6 / 0', () => {
    expect(choice3XP(12, 2)).toBe(12)
    expect(choice3XP(12, 1)).toBe(6)
    expect(choice3XP(12, 0)).toBe(0)
  })
  it('kalkış 06.30 kabul, 06.31 ret', () => {
    expect(timeXP(15, 390, 390)).toBe(15)
    expect(timeXP(15, 391, 390)).toBe(0)
  })
  it('önizleme sunucu kurallarıyla aynı', () => {
    expect(previewXP('NUMBER', 12, 20, 'PARTIAL', 10, [], 0)).toBe(6)
    expect(previewXP('CHECKLIST', 10, 1, 'PARTIAL', null, [true, true, true, false], 4)).toBe(7)
    expect(previewXP('BOOLEAN', 8, 1, 'MISSED_SELF', null, [], 0)).toBe(0)
  })
  it('değerden durum türetme', () => {
    expect(statusForValue('NUMBER', 20, 0)).toBe('MISSED_SELF')
    expect(statusForValue('NUMBER', 20, 10)).toBe('PARTIAL')
    expect(statusForValue('NUMBER', 20, 20)).toBe('COMPLETED')
    expect(statusForValue('TIME', 390, 391)).toBe('PARTIAL')
  })
})

describe('Seviye sistemi (Şartname §8)', () => {
  it('eşikler tabloyla uyuşur', () => {
    expect(levelThreshold(1)).toBe(0)
    expect(levelThreshold(2)).toBe(100)
    expect(levelThreshold(3)).toBe(225)
    expect(levelThreshold(5)).toBe(550)
    expect(levelThreshold(10)).toBe(1800)
    expect(levelThreshold(20)).toBe(6175)
    expect(levelThreshold(50)).toBe(34300)
  })
  it('99 XP seviye 1, 100 XP seviye 2', () => {
    expect(currentLevel(99)).toBe(1)
    expect(currentLevel(100)).toBe(2)
  })
  it('seviye 50 üst sınır', () => expect(currentLevel(999999)).toBe(50))
})

describe('Yüzde eşikleri kayan nokta hatasız', () => {
  it('948 planda 664 geçer, 663 geçmez', () => {
    expect(meetsPercent(664, 948, 70)).toBe(true)
    expect(meetsPercent(663, 948, 70)).toBe(false)
  })
  it('plan 0 ise hiçbir eşik sağlanmaz', () => expect(meetsPercent(0, 0, 60)).toBe(false))
})
