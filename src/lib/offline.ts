// Çevrimdışı kayıt kuyruğu ve sınırlı önbellek (Şartname §22).
// Kurallar: yalnızca görev değerleri kuyruğa yazılır; özel notlar çevrimdışı kopyaya alınmaz.
// Cihaz zamanı bilgilendirme içindir; süre sunucuda kontrol edilir. Süresi dolan kayıt geçmişe yazılmaz, "gönderilemedi" kutusuna düşer.
import type { Instance, TodayData } from './api'
import type { TaskAction } from './api'

export interface QueuedOp {
  id: string            // = operationId (sunucu idempotency anahtarı)
  userId: string
  instanceId: string
  date: string
  baseRevision: number
  action: TaskAction
  value: number | null
  itemValues: boolean[] | null
  createdAt: string     // cihaz zamanı, yalnızca bilgi
  status: 'pending' | 'sending' | 'expired' | 'conflict' | 'error'
  error?: string
  serverInstance?: Instance
  goalName?: string
}

const DB_NAME = 'bb-offline'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('NO_IDB')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[]): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const r = fn(t.objectStore(store))
    const last = Array.isArray(r) ? r[r.length - 1] : r
    t.oncomplete = () => { db.close(); resolve(last?.result as T) }
    t.onerror = () => { db.close(); reject(t.error) }
    t.onabort = () => { db.close(); reject(t.error) }
  })
}

export const queue = {
  async all(userId: string): Promise<QueuedOp[]> {
    try {
      const rows = await tx<QueuedOp[]>('queue', 'readonly', s => s.getAll())
      return (rows ?? []).filter(r => r.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    } catch { return [] }
  },
  async put(op: QueuedOp): Promise<void> {
    try { await tx('queue', 'readwrite', s => s.put(op)) } catch { /* depolama yoksa sessiz */ }
  },
  async remove(id: string): Promise<void> {
    try { await tx('queue', 'readwrite', s => s.delete(id)) } catch { /* yok say */ }
  },
  async clear(): Promise<void> {
    try { await tx('queue', 'readwrite', s => s.clear()); await tx('cache', 'readwrite', s => s.clear()) } catch { /* yok say */ }
  },
}

export const cache = {
  async getToday(userId: string): Promise<TodayData | null> {
    try { return (await tx<TodayData | undefined>('cache', 'readonly', s => s.get(`today:${userId}`))) ?? null } catch { return null }
  },
  async setToday(userId: string, data: TodayData): Promise<void> {
    // Özel notlar çevrimdışı kopyaya alınmaz
    const copy: TodayData = { ...data, instances: data.instances.map(i => ({ ...i, note: null })) }
    try { await tx('cache', 'readwrite', s => s.put(copy, `today:${userId}`)) } catch { /* yok say */ }
  },
}

/** Aynı görev için gönderilmemiş art arda düzenlemeler son istenen değere birleştirilir (gönderimi başlamış olan değiştirilmez). */
export function coalesce(existing: QueuedOp[], next: QueuedOp): { ops: QueuedOp[]; replaced: QueuedOp | null } {
  const idx = existing.findIndex(o => o.instanceId === next.instanceId && o.status === 'pending')
  if (idx === -1) return { ops: [...existing, next], replaced: null }
  const replaced = existing[idx]
  const merged: QueuedOp = { ...next, id: replaced.id, baseRevision: replaced.baseRevision, createdAt: replaced.createdAt }
  const ops = [...existing]; ops[idx] = merged
  return { ops, replaced }
}

/** Bekleyen kaydın yerel önizlemesi: durum ve XP sunucu onayına kadar "bekliyor" sayılır. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export type FlushResult = { sent: number; expired: number; conflicts: number; errors: number }

/** Kuyruğu sırayla gönderir. send() REVISION_CONFLICT / DAY_LOCKED kodlarını fırlatmalıdır. */
export async function flush(
  userId: string,
  send: (op: QueuedOp) => Promise<{ instance: Instance }>,
  onApplied?: (op: QueuedOp, result: { instance: Instance }) => void,
): Promise<FlushResult> {
  const res: FlushResult = { sent: 0, expired: 0, conflicts: 0, errors: 0 }
  const ops = await queue.all(userId)
  for (const op of ops) {
    if (op.status !== 'pending' && op.status !== 'error') continue
    await queue.put({ ...op, status: 'sending' })
    try {
      const r = await send(op)
      await queue.remove(op.id)
      onApplied?.(op, r)
      res.sent += 1
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      const detail = (e as { detail?: unknown }).detail
      if (code === 'DAY_LOCKED') { await queue.put({ ...op, status: 'expired', error: code }); res.expired += 1 }
      else if (code === 'REVISION_CONFLICT') { await queue.put({ ...op, status: 'conflict', error: code, serverInstance: detail as Instance }); res.conflicts += 1 }
      else if (code === 'NOT_FOUND' || code === 'INVALID_VALUE' || code === 'VALUE_TOO_LARGE' || code === 'INVALID_ACTION') { await queue.put({ ...op, status: 'error', error: code }); res.errors += 1 }
      else { await queue.put({ ...op, status: 'pending' }); res.errors += 1; break } // ağ hatası: dur, sonra tekrar
    }
  }
  return res
}
