// Görsel efektler: uçan yazılar, parıltı patlaması, halka, ışıltı, uçan altınlar (HUD'a çarpınca tık + nabız), konfeti, flaş, sarsıntı.
import { useEffect, useState } from 'react'
import { Icon } from './Sprite'
import { sfx } from './sfx'

type Item =
  | { id: number; kind: 'float'; x: number; y: number; text: string; color: string; big?: boolean }
  | { id: number; kind: 'burst'; x: number; y: number; color: string; n: number; dist: number }
  | { id: number; kind: 'ring'; x: number; y: number; color: string }
  | { id: number; kind: 'spark'; x: number; y: number; color: string; delay: number; size: number }
  | { id: number; kind: 'coin'; x: number; y: number; dx: number; dy: number; delay: number; icon: string }
  | { id: number; kind: 'confetti'; x: number; color: string; delay: number; dur: number; rot: number; drift: number; w: number; h: number }
  | { id: number; kind: 'flash'; color: string }

let seq = 1
let listeners: Array<(i: Item, ttl: number) => void> = []
const emit = (i: Item, ttl: number) => listeners.forEach(l => l(i, ttl))
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function pulse(id: string) {
  const n = document.getElementById(id)
  if (!n) return
  n.classList.remove('hud-pulse'); void n.offsetWidth; n.classList.add('hud-pulse')
}

export const fx = {
  float(text: string, x: number, y: number, color = '#ffffff', big = false) { emit({ id: seq++, kind: 'float', x, y, text, color, big }, 1200) },
  burst(x: number, y: number, color = '#ffd75a', n = 12, dist = 48) { if (!reduced()) emit({ id: seq++, kind: 'burst', x, y, color, n, dist }, 650) },
  ring(x: number, y: number, color = '#ffffff') { if (!reduced()) emit({ id: seq++, kind: 'ring', x, y, color }, 600) },
  sparkle(x: number, y: number, n = 6, color = '#fff4b0', spread = 40) {
    if (reduced()) return
    for (let i = 0; i < n; i++) emit({ id: seq++, kind: 'spark', x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread, color, delay: Math.random() * 300, size: 4 + Math.round(Math.random() * 4) }, 1000)
  },
  fly(fromX: number, fromY: number, targetId: string, count = 5, icon = 'coin') {
    const t = document.getElementById(targetId)?.getBoundingClientRect()
    if (!t) return
    if (reduced()) { pulse(targetId); return }
    const tx = t.left + t.width / 2, ty = t.top + t.height / 2
    for (let i = 0; i < count; i++) {
      const delay = i * 60
      emit({ id: seq++, kind: 'coin', x: fromX + (Math.random() - 0.5) * 34, y: fromY + (Math.random() - 0.5) * 22, dx: tx - fromX, dy: ty - fromY, delay, icon }, 900 + delay)
      window.setTimeout(() => { pulse(targetId); if (icon === 'coin') sfx.coinTick(i); else if (icon === 'star') sfx.xpTick(i) }, 840 + delay)
    }
  },
  confetti(n = 60) {
    if (reduced()) return
    const colors = ['#ffd75a', '#ff4d6d', '#4cc9f0', '#5bd17c', '#b98aff', '#ffffff', '#ff9a3a']
    for (let i = 0; i < n; i++) {
      const long = Math.random() < 0.4
      emit({ id: seq++, kind: 'confetti', x: Math.random() * 100, color: colors[i % colors.length], delay: Math.random() * 450, dur: 1500 + Math.random() * 1100, rot: 360 + Math.random() * 720, drift: (Math.random() - 0.5) * 120, w: long ? 4 : 8, h: long ? 12 : 8 }, 3200)
    }
  },
  flash(color = 'rgba(255,255,255,.6)') { if (!reduced()) emit({ id: seq++, kind: 'flash', color }, 380) },
  shake(el = 'game-root', strong = false) {
    if (reduced()) return
    const n = document.getElementById(el)
    if (!n) return
    const c = strong ? 'shake-strong' : 'shake'
    n.classList.remove('shake', 'shake-strong'); void n.offsetWidth; n.classList.add(c)
    window.setTimeout(() => n.classList.remove(c), 500)
  },
  pulse,
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
        switch (i.kind) {
          case 'float': return <div key={i.id} className={`fx-float font-pixel ${i.big ? 'text-4xl' : 'text-2xl'}`} style={{ left: i.x, top: i.y, color: i.color }}>{i.text}</div>
          case 'burst': return (
            <div key={i.id} className="fx-burst" style={{ left: i.x, top: i.y, ['--d' as string]: `${i.dist}px` }}>
              {Array.from({ length: i.n }, (_, k) => <span key={k} style={{ background: k % 3 === 0 ? '#ffffff' : i.color, ['--a' as string]: `${(k * 360) / i.n + (k % 2) * 8}deg`, width: k % 3 === 0 ? 4 : 7, height: k % 3 === 0 ? 4 : 7 }} />)}
            </div>
          )
          case 'ring': return <div key={i.id} className="fx-ring" style={{ left: i.x, top: i.y, borderColor: i.color }} />
          case 'spark': return <div key={i.id} className="fx-spark" style={{ left: i.x, top: i.y, animationDelay: `${i.delay}ms`, ['--s' as string]: `${i.size}px`, ['--c' as string]: i.color }} />
          case 'coin': return (
            <div key={i.id} className="fx-coin" style={{ left: i.x, top: i.y, animationDelay: `${i.delay}ms`, ['--dx' as string]: `${i.dx}px`, ['--dy' as string]: `${i.dy}px` }}>
              <Icon name={i.icon} size={24} />
            </div>
          )
          case 'confetti': return <div key={i.id} className="fx-confetti" style={{ left: `${i.x}%`, width: i.w, height: i.h, background: i.color, animationDelay: `${i.delay}ms`, animationDuration: `${i.dur}ms`, ['--r' as string]: `${i.rot}deg`, ['--dr' as string]: `${i.drift}px` }} />
          default: return <div key={i.id} className="fx-flash" style={{ background: i.color }} />
        }
      })}
    </div>
  )
}
