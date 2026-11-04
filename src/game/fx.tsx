// Görsel efektler: uçan yazılar, parıltı patlaması, uçan altınlar, konfeti, flaş, sarsıntı.
import { useEffect, useState } from 'react'
import { Icon } from './Sprite'

type Item =
  | { id: number; kind: 'float'; x: number; y: number; text: string; color: string; big?: boolean }
  | { id: number; kind: 'burst'; x: number; y: number; color: string }
  | { id: number; kind: 'coin'; x: number; y: number; dx: number; dy: number; delay: number; icon: string }
  | { id: number; kind: 'confetti'; x: number; color: string; delay: number; dur: number; rot: number }
  | { id: number; kind: 'flash'; color: string }

let seq = 1
let listeners: Array<(i: Item, ttl: number) => void> = []
const emit = (i: Item, ttl: number) => listeners.forEach(l => l(i, ttl))
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const fx = {
  float(text: string, x: number, y: number, color = '#ffffff', big = false) { emit({ id: seq++, kind: 'float', x, y, text, color, big }, 1100) },
  burst(x: number, y: number, color = '#ffd75a') { if (!reduced()) emit({ id: seq++, kind: 'burst', x, y, color }, 600) },
  fly(fromX: number, fromY: number, targetId: string, count = 5, icon = 'coin') {
    const t = document.getElementById(targetId)?.getBoundingClientRect()
    if (!t || reduced()) return
    const tx = t.left + t.width / 2, ty = t.top + t.height / 2
    for (let i = 0; i < count; i++) emit({ id: seq++, kind: 'coin', x: fromX + (Math.random() - 0.5) * 30, y: fromY + (Math.random() - 0.5) * 20, dx: tx - fromX, dy: ty - fromY, delay: i * 55, icon }, 900 + i * 55)
  },
  confetti(n = 60) {
    if (reduced()) return
    const colors = ['#ffd75a', '#ff4d6d', '#4cc9f0', '#5bd17c', '#b98aff', '#ffffff']
    for (let i = 0; i < n; i++) emit({ id: seq++, kind: 'confetti', x: Math.random() * 100, color: colors[i % colors.length], delay: Math.random() * 400, dur: 1400 + Math.random() * 900, rot: Math.random() * 720 }, 2800)
  },
  flash(color = 'rgba(255,255,255,.6)') { if (!reduced()) emit({ id: seq++, kind: 'flash', color }, 350) },
  shake(el = 'game-root') {
    if (reduced()) return
    const n = document.getElementById(el)
    if (!n) return
    n.classList.remove('shake'); void n.offsetWidth; n.classList.add('shake')
    window.setTimeout(() => n.classList.remove('shake'), 400)
  },
  fromEl(el: Element | null | undefined) { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 } },
}

export function FxLayer() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    const l = (i: Item, ttl: number) => {
      setItems(arr => [...arr, i])
      window.setTimeout(() => setItems(arr => arr.filter(x => x.id !== i.id)), ttl)
    }
    listeners.push(l)
    return () => { listeners = listeners.filter(x => x !== l) }
  }, [])
  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden" aria-hidden="true">
      {items.map(i => {
        if (i.kind === 'float') return <div key={i.id} className={`fx-float font-pixel ${i.big ? 'text-3xl' : 'text-xl'}`} style={{ left: i.x, top: i.y, color: i.color }}>{i.text}</div>
        if (i.kind === 'burst') return (
          <div key={i.id} className="fx-burst" style={{ left: i.x, top: i.y }}>
            {Array.from({ length: 10 }, (_, k) => <span key={k} style={{ background: i.color, ['--a' as string]: `${k * 36}deg` }} />)}
          </div>
        )
        if (i.kind === 'coin') return (
          <div key={i.id} className="fx-coin" style={{ left: i.x, top: i.y, animationDelay: `${i.delay}ms`, ['--dx' as string]: `${i.dx}px`, ['--dy' as string]: `${i.dy}px` }}>
            <Icon name={i.icon} size={22} />
          </div>
        )
        if (i.kind === 'confetti') return <div key={i.id} className="fx-confetti" style={{ left: `${i.x}%`, background: i.color, animationDelay: `${i.delay}ms`, animationDuration: `${i.dur}ms`, ['--r' as string]: `${i.rot}deg` }} />
        return <div key={i.id} className="fx-flash" style={{ background: i.color }} />
      })}
    </div>
  )
}
