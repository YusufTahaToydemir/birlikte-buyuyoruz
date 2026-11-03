import { describe, expect, it } from 'vitest'
import { coalesce, type QueuedOp } from './offline'

const op = (p: Partial<QueuedOp>): QueuedOp => ({
  id: 'op1', userId: 'u', instanceId: 'i1', date: '2026-11-03', baseRevision: 2, action: 'set_value', value: 10, itemValues: null,
  createdAt: '2026-11-03T10:00:00Z', status: 'pending', ...p,
})

describe('Çevrimdışı kuyruk birleştirme (Şartname §22)', () => {
  it('aynı görevdeki bekleyen düzenleme son değere birleşir, operationId ve temel revision korunur', () => {
    const { ops, replaced } = coalesce([op({})], op({ id: 'op2', value: 20, baseRevision: 5, createdAt: '2026-11-03T10:05:00Z' }))
    expect(ops).toHaveLength(1)
    expect(replaced?.id).toBe('op1')
    expect(ops[0].id).toBe('op1')
    expect(ops[0].value).toBe(20)
    expect(ops[0].baseRevision).toBe(2)
  })
  it('gönderimi başlamış kayıt değiştirilmez; yeni kayıt eklenir', () => {
    const { ops } = coalesce([op({ status: 'sending' })], op({ id: 'op2', value: 20 }))
    expect(ops).toHaveLength(2)
    expect(ops[1].id).toBe('op2')
  })
  it('farklı görevler ayrı kalır', () => {
    const { ops } = coalesce([op({})], op({ id: 'op2', instanceId: 'i2' }))
    expect(ops).toHaveLength(2)
  })
})
