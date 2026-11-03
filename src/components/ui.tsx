import { useEffect, useState, type ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card p-4 ${className}`}>{children}</section>
}

export function Button({ children, variant = 'primary', className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="block">
      <span className="block font-semibold mb-1">{label}</span>
      {children}
      {hint && !error && <span className="block text-[13px] text-ink-2 mt-1">{hint}</span>}
      {error && <span className="block text-[13px] text-warn mt-1" role="alert">{error}</span>}
    </label>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-3 rounded-full bg-soft overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full bg-primary rounded-full transition-[width] duration-500" style={{ width: `${p}%` }} />
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="presentation">
      <button className="absolute inset-0 bg-black/30" aria-label="Kapat" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-[520px] bg-card rounded-t-[20px] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto anim-pop">
        <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" aria-hidden="true" />
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Dialog({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[420px] bg-card rounded-[20px] p-6 text-center anim-pop">
        {children}
      </div>
    </div>
  )
}

let toastListeners: Array<(m: string) => void> = []
export function toast(message: string) { toastListeners.forEach(l => l(message)) }
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    const l = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(null), 3200) }
    toastListeners.push(l)
    return () => { toastListeners = toastListeners.filter(x => x !== l) }
  }, [])
  return (
    <div aria-live="polite" className="fixed left-0 right-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex justify-center pointer-events-none px-4">
      {msg && <div className="bg-ink text-white rounded-[14px] px-4 py-3 text-[15px] shadow-lg anim-pop max-w-[480px]">{msg}</div>}
    </div>
  )
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return <p className="text-ink-2 text-center py-8" role="status">{label}…</p>
}

export function StatusRing({ status }: { status: string }) {
  const base = 'inline-flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0'
  if (status === 'COMPLETED') return <span className={`${base} border-success bg-success text-white text-sm`} aria-hidden="true">✓</span>
  if (status === 'PARTIAL') return <span className={`${base} border-primary`} aria-hidden="true"><span className="w-3 h-3 rounded-full bg-primary" /></span>
  if (status === 'EXCUSED') return <span className={`${base} border-line text-ink-2 text-xs`} aria-hidden="true">–</span>
  if (status === 'MISSED_SELF' || status === 'MISSED_AUTO') return <span className={`${base} border-line text-ink-2 text-xs`} aria-hidden="true">×</span>
  return <span className={`${base} border-line`} aria-hidden="true" />
}

export const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Henüz kayıt yok',
  PARTIAL: 'Kısmen',
  COMPLETED: 'Tamamlandı',
  MISSED_AUTO: 'Yapılmadı olarak kaydedildi · kayıt girilmedi',
  MISSED_SELF: 'Yapılmadı',
  EXCUSED: 'Takip dışı',
}
