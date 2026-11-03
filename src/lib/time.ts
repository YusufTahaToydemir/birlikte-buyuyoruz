export const TZ = 'Europe/Istanbul'

export function formatDateTR(date: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const d = typeof date === 'string' ? new Date(date.length === 10 ? date + 'T12:00:00' : date) : date
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts }).format(d)
}

export function formatTimeTR(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function formatDateTimeTR(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Dakika (gece yarısından itibaren) -> "06:30" */
export function minutesToClock(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function clockToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(now))
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

export function pct(gross: number, planned: number, digits = 0): string {
  if (planned <= 0) return '—'
  return `%${((gross * 100) / planned).toFixed(digits).replace('.', ',')}`
}
