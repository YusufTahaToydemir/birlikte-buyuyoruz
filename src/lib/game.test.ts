import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {}, usernameToEmail: (u: string) => u }))
const { ApiError, errorText, SHOP } = await import('./game')
import sql from '../../supabase/migrations/0005_game_v2.sql?raw'

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

describe('hata metinleri', () => {
  it('bilinen kodları Türkçeye çevirir', () => {
    expect(errorText(new ApiError('INSUFFICIENT_GOLD'))).toBe('Altının yetmiyor.')
    expect(errorText(new Error('TypeError: Failed to fetch'))).toMatch(/Bağlantı/)
    expect(errorText(new ApiError('XYZ'))).toBe('XYZ')
  })
})
