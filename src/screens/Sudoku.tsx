// Ortak sudoku (sıra tabanlı): aynı tahtada sırayla oynarsınız. Kolay hücre (tek aday / tek yer) +1, mantık isteyen zor hücre +3,
// sırada en çok 3 doğru hamle; yanlış rakam −2 ve sıra eşine geçer. Tahta dolunca çok puanlı kazanır.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSudoku, sudokuCancel, sudokuMove, sudokuPass, sudokuStart, type Hero, type SudokuGame, type SudokuState } from '../lib/game'
import { SUDOKU_LEVELS } from '../game/sudoku'
import { Numpad, OWNER_COLOR, SudokuGrid, useNotes, type CellOwner } from '../game/SudokuBoard'
import { HeroSprite, Icon, Portrait } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Sheet, Stars, toast, toastError, useGame } from '../game/ui'

const side = (g: SudokuGame, me: string) => {
  const a = g.playerA === me
  return { mine: a ? g.scoreA : g.scoreB, theirs: a ? g.scoreB : g.scoreA, myMiss: a ? g.missA : g.missB, myChar: a ? 'a' : 'b' }
}

export function SudokuCard({ me, partner }: { me: Hero; partner: Hero }) {
  const { game } = useGame()
  const [st, setSt] = useState<SudokuState | null>(null)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setSt(await getSudoku()) } catch (e) { toastError(e) } }, [])
  useEffect(() => { void load() }, [load, game.play.sudoku, game.events.length])

  const g = st?.game
  const active = g?.status === 'ACTIVE'
  const myTurn = active && g!.turn === me.id
  const start = async (level: number) => {
    setBusy(true)
    try { const r = await sudokuStart(level); setSt(r); setPick(false); sfx.go(); setOpen(true) } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <>
      <button className={`panel w-full p-3 flex items-center gap-3 text-left relative overflow-hidden ${myTurn ? '!border-gold' : ''}`}
        onClick={() => { sfx.open(); if (active) setOpen(true); else setPick(true) }}>
        {active ? <MiniBoard g={g!} me={me.id} /> : <Icon name="grid" size={44} className={myTurn ? 'bob' : ''} />}
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-xl">Ortak Sudoku</div>
          <div className="font-pixel text-[15px] text-ink2 flex items-center gap-2">
            {active ? (
              <>
                <span style={{ color: OWNER_COLOR.me }}>{side(g!, me.id).mine}</span>–<span style={{ color: OWNER_COLOR.partner }}>{side(g!, me.id).theirs}</span>
                {myTurn ? <span className="text-gold">· Sıra sende!</span> : <span>· sıra {partner.name}'de</span>}
              </>
            ) : g?.status === 'DONE' ? (
              <span>{g.winner === me.id ? <span className="text-ok">Kazandın!</span> : g.winner ? `${partner.name} kazandı` : 'Berabere'} · yeni oyun</span>
            ) : <span>Sırayla aynı tahtada · {st ? `${st.record.me}–${st.record.partner}` : ''}</span>}
          </div>
        </div>
        {myTurn && <span className="w-3 h-3 rounded-full bg-hp border-2 border-edge blinkdot" />}
        <Icon name={active ? 'swords' : 'gamepad'} size={28} />
      </button>

      <Sheet open={pick} onClose={() => setPick(false)} title={<span className="flex items-center gap-2"><Icon name="grid" size={26} />Ortak Sudoku</span>}>
        <div className="space-y-3">
          <div className="panel-dark p-3 font-pixel text-[16px] text-ink2 space-y-1">
            <div className="flex items-center gap-2"><Icon name="check" size={18} /><span className="text-ink">Kolay hücre +1 · zor hücre +3 · yanlış −2</span></div>
            <div className="flex items-center gap-2"><Icon name="swords" size={18} /><span>Sırada en çok 3 hamle · yanlışta sıra eşine</span></div>
            <div className="flex items-center gap-2"><Icon name="crown" size={18} /><span>Tahta dolunca çok puanlı kazanır</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SUDOKU_LEVELS.map(l => (
              <button key={l.n} className="panel p-2 flex flex-col items-center gap-1" disabled={busy} onClick={() => void start(l.n)}>
                <Stars n={l.n} max={3} size={12} />
                <span className="font-pixel text-lg">{l.name}</span>
                              </button>
            ))}
          </div>
        </div>
      </Sheet>

      {open && g && <SudokuCoop initial={st!} me={me} partner={partner} onClose={st2 => { setOpen(false); if (st2) setSt(st2) }} />}
    </>
  )
}

function MiniBoard({ g, me }: { g: SudokuGame; me: string }) {
  const my = side(g, me).myChar
  return (
    <div className="grid grid-cols-9 gap-0 shrink-0 border-2 border-edge" style={{ width: 46, height: 46 }}>
      {Array.from({ length: 81 }, (_, i) => {
        const o = g.owners[i], given = g.puzzle[i] !== '0'
        return <span key={i} style={{ background: given ? '#8a80a8' : o === '.' ? '#120d22' : o === my ? OWNER_COLOR.me : OWNER_COLOR.partner }} />
      })}
    </div>
  )
}

function SudokuCoop({ initial, me, partner, onClose }: { initial: SudokuState; me: Hero; partner: Hero; onClose: (s: SudokuState | null) => void }) {
  const { refresh } = useGame()
  const [st, setSt] = useState(initial)
  const g = st.game!
  const [sel, setSel] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<number | null>(null)
  const [flash, setFlash] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [quit, setQuit] = useState(false)
  const { notes, toggle, placed, clear } = useNotes(`kyron.sudoku.${g.id}`)
  const s = side(g, me.id)
  const myTurn = g.status === 'ACTIVE' && g.turn === me.id
  const prevBoard = useRef(g.board)

  // eşin hamlelerini canlı gör: sıra ondayken 5 sn'de bir yenile
  useEffect(() => {
    if (g.status !== 'ACTIVE' || myTurn) return
    const t = window.setInterval(async () => { try { setSt(await getSudoku()) } catch { /* sonraki deneme */ } }, 5000)
    return () => clearInterval(t)
  }, [g.status, myTurn])
  // tahta değişince: eşin son hamlesini parlat, notları temizle
  useEffect(() => {
    if (g.board === prevBoard.current) return
    const lm = g.lastMove
    if (lm && lm.by !== me.id && lm.cell !== undefined && lm.ok) { setFlash(lm.cell); placed(lm.cell, lm.digit!); sfx.key() }
    prevBoard.current = g.board
  }, [g.board, g.lastMove, me.id, placed])
  // sıra bana geçince haber ver
  const prevTurn = useRef(g.turn)
  useEffect(() => {
    if (g.turn === me.id && prevTurn.current !== me.id && g.status === 'ACTIVE') { sfx.go(); toast('Sıra sende!') }
    prevTurn.current = g.turn
  }, [g.turn, g.status, me.id])

  const owner = (i: number): CellOwner => g.owners[i] === '.' ? null : g.owners[i] === s.myChar ? 'me' : 'partner'

  const digit = async (d: number) => {
    if (sel === null || g.board[sel] !== '0') { sfx.tick(); return }
    if (notesMode) { sfx.key(); toggle(sel, d); return }
    if (!myTurn || busy) { sfx.tick(); toast(`Sıra ${partner.name}'de · not alabilirsin`); return }
    setBusy(true)
    const cell = sel
    try {
      const r = await sudokuMove(cell, d)
      const lm = r.game?.lastMove
      prevBoard.current = r.game?.board ?? prevBoard.current
      setSt(r)
      const el = document.querySelector<HTMLElement>(`[role="gridcell"]:nth-child(${cell + 1})`)
      const at = el ? fx.fromEl(el) : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      if (lm?.ok) {
        placed(cell, d); setFlash(cell); sfx.coin()
        fx.float((lm.pts ?? 1) >= 3 ? `+${lm.pts} Zor!` : `+${lm.pts}`, at.x, at.y - 10, OWNER_COLOR.me, (lm.pts ?? 1) >= 3)
        if ((lm.pts ?? 1) >= 3) { sfx.great(); fx.burst(at.x, at.y, '#7ec8ff', 14, 60) }
        if (r.game?.status === 'DONE') { window.setTimeout(() => { if (r.game!.winner === me.id) { sfx.victory(); fx.confetti(110) } else sfx.cheer() }, 300) }
        else if (r.game?.turn !== me.id) toast(`3 hamle bitti · sıra ${partner.name}'de`)
      } else {
        setBad(cell); sfx.error(); navigator.vibrate?.([40, 30, 40]); window.setTimeout(() => setBad(null), 500)
        fx.float(`−${Math.abs(lm?.pts ?? 2)}`, at.x, at.y - 10, '#ff4d6d', true)
        toast(`Yanlış! Sıra ${partner.name}'de`)
      }
      void refresh()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  const act = async (fn: () => Promise<SudokuState>, after?: () => void) => {
    setBusy(true)
    try { const r = await fn(); setSt(r); after?.(); void refresh() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  const done = g.status !== 'ACTIVE'
  return (
    <div className="fixed inset-0 z-[45] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label="Ortak Sudoku">
      <div className="mx-auto max-w-[520px] min-h-dvh px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-6 space-y-2.5">
        <div className="flex items-center gap-2">
          <Icon name="grid" size={30} />
          <span className="font-pixel text-2xl flex-1">Ortak Sudoku</span>
          <Stars n={g.level} max={3} size={11} />
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose(st) }} aria-label="Kapat">✕</button>
        </div>

        {/* skor ve sıra */}
        <div className="panel p-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className={`flex items-center gap-2 rounded-[4px] p-1 ${myTurn ? 'bg-panel2 ring-2 ring-[#7ec8ff]' : ''}`}>
            <Portrait cls={me.class} look={me.look} gear={me.equipped} size={34} />
            <div className="min-w-0"><div className="font-pixel text-[14px] truncate">{me.name}</div><div className="font-pixel text-2xl leading-none" style={{ color: OWNER_COLOR.me }}>{s.mine}</div></div>
          </div>
          <div className="flex flex-col items-center">
            {done ? <Icon name="crown" size={26} /> : (
              <>
                <span className="font-pixel text-[13px] text-ink2">{myTurn ? 'Senin sıran' : 'Eşinin sırası'}</span>
                <span className="flex gap-1 mt-1">{[0, 1, 2].map(i => <span key={i} className="w-3 h-3 border-2 border-edge rounded-[2px]" style={{ background: i < g.movesLeft ? (myTurn ? OWNER_COLOR.me : OWNER_COLOR.partner) : '#120d22' }} />)}</span>
              </>
            )}
          </div>
          <div className={`flex items-center gap-2 justify-end rounded-[4px] p-1 ${!myTurn && !done ? 'bg-panel2 ring-2 ring-[#ffcc3a]' : ''}`}>
            <div className="min-w-0 text-right"><div className="font-pixel text-[14px] truncate">{partner.name}</div><div className="font-pixel text-2xl leading-none" style={{ color: OWNER_COLOR.partner }}>{s.theirs}</div></div>
            <Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={34} />
          </div>
        </div>

        {done ? (
          <div className="panel p-4 flex flex-col items-center gap-3 text-center relative overflow-hidden">
            <div className="absolute inset-[-60%] rays opacity-25 pointer-events-none" />
            <div className={`relative font-pixel text-5xl stamp drop-shadow-[0_4px_0_#000] ${g.winner === me.id ? 'text-gold' : g.winner ? 'text-hp' : 'text-xp'}`}>
              {g.status === 'CANCELLED' ? 'Bırakıldı' : g.winner === me.id ? 'KAZANDIN!' : g.winner ? 'Kaybettin' : 'Berabere'}
            </div>
            <div className="relative flex items-end gap-4">
              <div className={g.winner === me.id ? 'jump' : ''}><HeroSprite cls={me.class} look={me.look} gear={me.equipped} scale={2.4} pose={g.winner === me.id ? 'joy' : undefined} /></div>
              <div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={partner.class} look={partner.look} gear={partner.equipped} scale={2.4} pose={g.winner && g.winner !== me.id ? 'joy' : undefined} /></div>
            </div>
            {g.status === 'DONE' && <div className="relative font-pixel text-[16px] text-ink2 flex items-center gap-3">
              <span className="text-xp flex items-center gap-1"><Icon name="star" size={18} />+{g.winner ? (g.winner === me.id ? 30 : 15) : 20}</span>
              <span className="text-gold flex items-center gap-1"><Icon name="coin" size={18} />+{g.winner ? (g.winner === me.id ? 40 : 20) : 30}</span>
              <span className="flex items-center gap-1"><Icon name="heart" size={18} />dost +5</span>
            </div>}
          </div>
        ) : null}

        <SudokuGrid puzzle={g.puzzle} board={g.board} owner={owner} selected={sel} onSelect={i => { sfx.tick(); setSel(i) }} notes={notes} bad={bad} flash={flash} />

        {!done && (
          <>
            <Numpad board={g.board} onDigit={d => void digit(d)} notesMode={notesMode} onNotes={() => { sfx.click(); setNotesMode(m => !m) }}
              onErase={() => { if (sel !== null) { sfx.undo(); clear(sel) } }} disabled={busy} />
            <div className="grid grid-cols-2 gap-1.5">
              <button className="pbtn pbtn-dark !min-h-[40px]" disabled={!myTurn || busy} onClick={() => void act(() => sudokuPass(), () => sfx.whoosh())}><Icon name="boot" size={18} />Pas geç</button>
              <button className="pbtn pbtn-dark !min-h-[40px] text-ink2" disabled={busy} onClick={() => { sfx.click(); setQuit(true) }}>Oyunu bırak</button>
            </div>
            {g.lastMove && g.lastMove.by !== me.id && (
              <p className="font-pixel text-[14px] text-ink2 text-center">
                {g.lastMove.pass ? `${partner.name} pas geçti` : g.lastMove.ok ? `${partner.name} +${g.lastMove.pts}` : `${partner.name} yanıldı (${g.lastMove.digit})`}
              </p>
            )}
          </>
        )}
      </div>

      <Sheet open={quit} onClose={() => setQuit(false)} title="Oyunu bırak?">
        <div className="space-y-3">
          <p className="font-pixel text-lg text-ink2 text-center">Ödül verilmez, ikinizin de tahtası kapanır.</p>
          <button className="pbtn pbtn-red w-full" disabled={busy} onClick={() => void act(() => sudokuCancel(), () => { setQuit(false); sfx.undo() })}>Bırak</button>
        </div>
      </Sheet>
    </div>
  )
}
