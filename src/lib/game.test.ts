import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {}, usernameToEmail: (u: string) => u }))
const { ApiError, errorText, SHOP, levelStart, levelReward, unlocksAt, titleFor } = await import('./game')
import sql6 from '../../supabase/migrations/0006_progression_games.sql?raw'
import sql7 from '../../supabase/migrations/0007_paket1.sql?raw'
const sql = sql6 + sql7

describe('dükkan kataloğu', () => {
  it('sunucudaki fiyat, seviye ve kademelerle aynı', () => {
    const rows = [...sql.matchAll(/\('([a-z_0-9]+)','[^']+','([A-Z]+)',(\d+),(\d+),(\d+),(\d+),\d+\)/g)]
    expect(rows.length).toBe(SHOP.length)
    for (const [, key, kind, tier, minLevel, price, effect] of rows) {
      const item = SHOP.find(s => s.key === key)
      expect(item, key).toBeDefined()
      expect(item).toMatchObject({ kind, tier: +tier, minLevel: +minLevel, price: +price, effect: +effect })
    }
  })
})

describe('seviye yolu', () => {
  it('sunucudaki eğri ve ödüllerle aynı', () => {
    expect([levelStart(1), levelStart(2), levelStart(3), levelStart(10)]).toEqual([0, 180, 390, 2700])
    expect(sql).toContain('(greatest(l, 1) - 1)::bigint * (150 + 15 * greatest(l, 1))')
    expect(sql).toContain("'gold', 20 + 5 * l + case when l % 5 = 0 then 10 * l else 0 end")
    expect(levelReward(7)).toEqual({ gold: 55, potion: null })
    expect(levelReward(5)).toEqual({ gold: 95, potion: 'potion_small' })
    expect(levelReward(10)).toEqual({ gold: 170, potion: 'potion_big' })
  })
  it('her eşya bir seviyede açılır, unvanlar sıralı', () => {
    expect(unlocksAt(3).map(i => i.key).sort()).toEqual(['armor_1', 'cape_blue', 'cape_red', 'streak_shield', 'weapon_1'])
    expect(titleFor(1).name).toBe('Çaylak')
    expect(titleFor(57).name).toBe('Usta')
    expect(titleFor(250).name).toBe('Ölümsüz')
  })
})

describe('hata metinleri', () => {
  it('bilinen kodları Türkçeye çevirir', () => {
    expect(errorText(new ApiError('INSUFFICIENT_GOLD'))).toBe('Altının yetmiyor.')
    expect(errorText(new Error('TypeError: Failed to fetch'))).toMatch(/Bağlantı/)
    expect(errorText(new ApiError('XYZ'))).toBe('XYZ')
  })
})
