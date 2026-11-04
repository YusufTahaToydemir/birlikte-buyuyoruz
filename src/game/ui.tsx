// Ortak oyun arayüzü parçaları: çubuk, alt sayfa, bildirim, oyun durumu bağlamı.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Game } from '../lib/game'
import { errorText } from '../lib/game'
import { sfx } from './sfx'
import { Icon } from './Sprite'

export function Bar({ value, max, color, label, className = '', id, h = 16 }: { value: number; max: number; color: string; label?: ReactNode; className?: string; id?: string; h?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`bar ${className}`} id={id} style={{ height: h }} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <i style={{ width: `${pct}%`, background: color }} />
      {label !== undefined && <b>{label}</b>}
    </div>
  )
}

/** Parçalı ilerleme: her görev bir blok */
export function Segments({ done, total, color = '#5bd17c' }: { done: number; total: number; color?: string }) {
  return (
    <div className="flex gap-[3px] w-full">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="h-3 flex-1 border-2 border-edge rounded-[2px]" style={{ background: i < done ? color : '#120d22', boxShadow: i < done ? 'inset 0 2px 0 rgba(255,255,255,.35)' : 'none' }} />
      ))}
    </div>
  )
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[520px] max-h-[88dvh] overflow-y-auto panel rounded-b-none slideup p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-3">
          <div className="font-pixel text-xl">{title}</div>
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose() }} aria-label="Kapat">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- kısa bildirim ----
let toastFn: ((t: string, kind: 'err' | 'ok') => void) | null = null
export const toast = (text: string, kind: 'err' | 'ok' = 'ok') => toastFn?.(text, kind)
export const toastError = (e: unknown) => { sfx.error(); toast(errorText(e), 'err') }
export function ToastHost() {
  const [t, setT] = useState<{ text: string; kind: 'err' | 'ok'; id: number } | null>(null)
  useEffect(() => {
    toastFn = (text, kind) => {
      const id = Date.now()
      setT({ text, kind, id })
      window.setTimeout(() => setT(c => (c?.id === id ? null : c)), 2600)
    }
    return () => { toastFn = null }
  }, [])
  if (!t) return null
  return (
    <div className="fixed left-0 right-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 pointer-events-none">
      <div role="status" className={`dropin panel px-4 py-2 font-pixel flex items-center gap-2 ${t.kind === 'err' ? '!bg-[#5a1a2a]' : '!bg-[#1f4a2f]'}`}>
        <Icon name={t.kind === 'err' ? 'heart' : 'check'} size={20} /> {t.text}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-label="Yükleniyor">
      <div className="pop"><Icon name="sparkle" size={48} className="glow" /></div>
    </div>
  )
}

// ---- oyun durumu ----
export interface GameCtx {
  game: Game
  setGame: (g: Game) => void
  refresh: () => Promise<void>
  /** Sunucu çağrısı → yeni durum; hata olursa bildirim */
  run: (fn: () => Promise<Game>) => Promise<Game | null>
  go: (tab: TabId) => void
  openSettings: () => void
}
export type TabId = 'quest' | 'arena' | 'games' | 'hero' | 'loot'
export const GameContext = createContext<GameCtx | null>(null)
export const useGame = () => {
  const c = useContext(GameContext)
  if (!c) throw new Error('GameContext yok')
  return c
}

export function Stars({ n, max = 6, size = 14 }: { n: number; max?: number; size?: number }) {
  return (
    <span className="inline-flex gap-[2px]" aria-label={`${n}/${max}`}>
      {Array.from({ length: max }, (_, i) => <Icon key={i} name="star" size={size} className={i < n ? '' : 'opacity-20 grayscale'} />)}
    </span>
  )
}
