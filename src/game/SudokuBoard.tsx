// Sudoku tahtası + rakam tuşları (düello ve ortak oyun aynı bileşeni kullanır) ve düello oyunu.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { box, col, DUEL_GIVENS, makeSudoku, row } from './sudoku'
import { Icon } from './Sprite'
import { fx } from './fx'
import { sfx } from './sfx'

export type CellOwner = 'me' | 'partner' | null
export const OWNER_COLOR = { me: '#7ec8ff', partner: '#ffcc3a' }

export function SudokuGrid({ puzzle, board, owner, selected, onSelect, notes, bad, flash }: {
  puzzle: string; board: string; owner?: (i: number) => CellOwner; selected: number | null; onSelect: (i: number) => void
  notes?: Record<number, number[]>; bad?: number | null; flash?: number | null
}) {
  const selDigit = selected !== null ? board[selected] : '0'
  return (
    <div className="mx-auto w-full max-w-[360px] aspect-square grid grid-cols-9 select-none border-[3px] border-edge rounded-[4px] overflow-hidden bg-[#120d22]" role="grid" aria-label="Sudoku">
      {Array.from({ length: 81 }, (_, i) => {
        const v = board[i], given = puzzle[i] !== '0', who = given ? null : owner?.(i) ?? null
        const peer = selected !== null && (row(i) === row(selected) || col(i) === col(selected) || box(i) === box(selected))
        const same = v !== '0' && v === selDigit
        const bg = i === bad ? '#7a2038' : i === selected ? '#4a3f8a' : same ? '#3a3470' : peer ? '#241d40' : (box(i) % 2 ? '#1a1430' : '#1f1838')
        const bR = col(i) % 3 === 2 && col(i) < 8, bB = row(i) % 3 === 2 && row(i) < 8
        return (
          <button key={i} role="gridcell" aria-label={`${row(i) + 1}. satır ${col(i) + 1}. sütun ${v === '0' ? 'boş' : v}`}
            onPointerDown={() => onSelect(i)}
            className={`relative grid place-items-center font-pixel leading-none ${i === bad ? 'shake' : ''} ${i === flash ? 'pop' : ''}`}
            style={{ background: bg, borderRight: `${bR ? 3 : 1}px solid ${bR ? '#0a0714' : '#2e2650'}`, borderBottom: `${bB ? 3 : 1}px solid ${bB ? '#0a0714' : '#2e2650'}`,
              color: given ? '#f2eee6' : who ? OWNER_COLOR[who] : '#f2eee6', fontSize: 'min(6.4vw, 26px)' }}>
            {v !== '0' ? v : notes?.[i]?.length ? (
              <span className="absolute inset-[2px] grid grid-cols-3 text-[min(2.4vw,10px)] text-ink2 leading-none">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <span key={d} className="grid place-items-center">{notes[i].includes(d) ? d : ''}</span>)}
              </span>
            ) : ''}
          </button>
        )
      })}
    </div>
  )
}

export function Numpad({ board, onDigit, onErase, notesMode, onNotes, disabled }: {
  board: string; onDigit: (d: number) => void; onErase?: () => void; notesMode?: boolean; onNotes?: () => void; disabled?: boolean
}) {
  const left = useMemo(() => { const c = Array(10).fill(9); for (const ch of board) if (ch !== '0') c[+ch]--; return c }, [board])
  return (
    <div className="space-y-1.5 mx-auto w-full max-w-[360px]">
      <div className="grid grid-cols-9 gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
          <button key={d} disabled={disabled || left[d] <= 0} onClick={() => onDigit(d)}
            className={`h-[54px] rounded-[4px] border-2 border-edge font-pixel text-2xl flex flex-col items-center justify-center leading-none ${left[d] <= 0 ? 'opacity-25' : ''} ${notesMode ? 'text-ink2' : ''}`}
            style={{ background: notesMode ? '#2a2146' : '#4a3f72', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.3)' }}>
            {d}<span className="text-[10px] text-ink2 mt-0.5">{left[d] > 0 ? left[d] : ''}</span>
          </button>
        ))}
      </div>
      {(onNotes || onErase) && (
        <div className="grid grid-cols-2 gap-1.5">
          {onNotes && <button className={`pbtn ${notesMode ? 'pbtn-gold' : 'pbtn-dark'} !min-h-[40px]`} onClick={onNotes} disabled={disabled}><Icon name="quill" size={18} />Not {notesMode ? 'açık' : ''}</button>}
          {onErase && <button className="pbtn pbtn-dark !min-h-[40px]" onClick={onErase} disabled={disabled}>⌫ Sil</button>}
        </div>
      )}
    </div>
  )
}

/** Notları hücre başına tutar; bir rakam yerleşince komşulardan düşer */
export function useNotes(storeKey?: string) {
  const [notes, setNotes] = useState<Record<number, number[]>>(() => {
    if (!storeKey) return {}
    try { return JSON.parse(localStorage.getItem(storeKey) ?? '{}') } catch { return {} }
  })
  useEffect(() => { if (storeKey) try { localStorage.setItem(storeKey, JSON.stringify(notes)) } catch { /* yok say */ } }, [notes, storeKey])
  const toggle = useCallback((i: number, d: number) => setNotes(n => {
    const cur = n[i] ?? []
    return { ...n, [i]: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort() }
  }), [])
  const placed = useCallback((i: number, d: number) => setNotes(n => {
    const out: Record<number, number[]> = {}
    for (const [k, v] of Object.entries(n)) {
      const c = +k
      if (c === i) continue
      out[c] = row(c) === row(i) || col(c) === col(i) || box(c) === box(i) ? v.filter(x => x !== d) : v
    }
    return out
  }), [])
  const clear = useCallback((i: number) => setNotes(n => { const o = { ...n }; delete o[i]; return o }), [])
  return { notes, toggle, placed, clear }
}

/** Düello: 15 dk; çözünce 1000 − sn/2 − 30×hata (en az 400), çözemezsen doğru hücre × 6; 5 hata oyunu bitirir */
const SUDOKU_MS = 15 * 60 * 1000
export function SudokuDuel({ seed, onEnd }: { seed: number; onEnd: (score: number) => void }) {
  const s = useMemo(() => makeSudoku(seed, DUEL_GIVENS), [seed])
  const [board, setBoard] = useState(s.puzzle)
  const [sel, setSel] = useState<number | null>(null)
  const [miss, setMiss] = useState(0)
  const [bad, setBad] = useState<number | null>(null)
  const [flash, setFlash] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [ended, setEnded] = useState(false)
  const { notes, toggle, placed, clear } = useNotes()
  useEffect(() => { if (ended) return; const t = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [ended])
  const el = now - start
  const filled = [...board].filter((c, i) => c !== '0' && s.puzzle[i] === '0').length

  const finish = useCallback((solved: boolean, b: string, mistakes: number) => {
    setEnded(true)
    const secs = Math.floor((Date.now() - start) / 1000)
    const mine = [...b].filter((c, i) => c !== '0' && s.puzzle[i] === '0').length
    const score = solved ? Math.max(400, 1000 - Math.floor(secs / 2) - 30 * mistakes) : mine * 6
    if (solved) { sfx.victory(); fx.confetti(70) } else sfx.timeUp()
    window.setTimeout(() => onEnd(score), solved ? 1000 : 400)
  }, [onEnd, s.puzzle, start])
  useEffect(() => { if (!ended && el >= SUDOKU_MS) finish(false, board, miss) }, [el, ended, finish, board, miss])

  const digit = (d: number) => {
    if (ended || sel === null || board[sel] !== '0') { sfx.tick(); return }
    if (notesMode) { sfx.key(); toggle(sel, d); return }
    if (s.solution[sel] === String(d)) {
      const nb = board.slice(0, sel) + d + board.slice(sel + 1)
      setBoard(nb); placed(sel, d); setFlash(sel); sfx.coin()
      if (!nb.includes('0')) finish(true, nb, miss)
    } else {
      const m = miss + 1
      setMiss(m); setBad(sel); sfx.error(); navigator.vibrate?.(40)
      window.setTimeout(() => setBad(null), 450)
      if (m >= 5) finish(false, board, m)
    }
  }
  const left = Math.max(0, SUDOKU_MS - el)
  return (
    <div className="space-y-2.5">
      <div className="panel-dark flex items-center justify-between px-3 py-2 font-pixel">
        <span className="text-xl flex items-center gap-2"><Icon name="grid" size={22} />{filled}/{81 - DUEL_GIVENS}</span>
        <span className="flex gap-0.5" aria-label={`${miss}/5 hata`}>{Array.from({ length: 5 }, (_, i) => <Icon key={i} name="heart" size={16} className={i < 5 - miss ? '' : 'opacity-25 grayscale'} />)}</span>
        <span className={`text-lg ${left < 60000 ? 'text-hp' : 'text-ink2'}`}>{Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')}</span>
      </div>
      <SudokuGrid puzzle={s.puzzle} board={board} owner={() => 'me'} selected={sel} onSelect={i => { sfx.tick(); setSel(i) }} notes={notes} bad={bad} flash={flash} />
      <Numpad board={board} onDigit={digit} notesMode={notesMode} onNotes={() => { sfx.click(); setNotesMode(m => !m) }} onErase={() => { if (sel !== null) { sfx.undo(); clear(sel) } }} disabled={ended} />
    </div>
  )
}
