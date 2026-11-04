// Oyunlar: eşinle düello (5 mini oyun), Günün Kelimesi (ortak bulmaca), birlikte etkinlikler.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { duelCancel, duelCreate, duelPlay, getGames, togetherCancel, togetherMark, wordGuess, type Duel, type DuelGame, type Games as GamesState, type Hero } from '../lib/game'
import { renderBoss } from '../game/art/bosses'
import { drawScene, timeOfDay } from '../game/art/scene'
import { DUEL_GAMES, GAME_INFO, MemoryGame, newSeed, SlideGame, TapGame, TimingGame, WordsGame } from '../game/minigames'
import { HeroSprite, Icon, Portrait } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Sheet, toastError, useGame } from '../game/ui'

/** Yapboz resmi: manzara + haftanın canavarı (96x96) */
function puzzleImage(bossKey: string, seed: number) {
  const c = document.createElement('canvas')
  drawScene(c, 96, 96, timeOfDay(), seed % 97)
  const ctx = c.getContext('2d')!
  const g = renderBoss(bossKey)
  const ox = 24, oy = 44
  g.forEach((row, y) => row.forEach((col, x) => { if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x, oy + y, 1, 1) } }))
  return c.toDataURL()
}

type Play = { game: DuelGame; seed: number; mode: 'practice' | 'challenge' | 'respond'; duel?: Duel }

export function online(lastSeen: string | null | undefined, serverTime: string) {
  return !!lastSeen && new Date(serverTime).getTime() - new Date(lastSeen).getTime() < 3 * 60 * 1000
}

export function Games() {
  const { game, refresh } = useGame()
  const me = game.hero!, partner = game.partner
  const [g, setG] = useState<GamesState | null>(null)
  const [intro, setIntro] = useState<DuelGame | null>(null)
  const [play, setPlay] = useState<Play | null>(null)
  const [wordOpen, setWordOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => { try { setG(await getGames()) } catch (e) { toastError(e) } }, [])
  useEffect(() => { void load() }, [load, game.play.duels, game.play.together, game.play.word, game.events.length])

  const incoming = g?.duels.filter(d => d.status === 'OPEN' && d.opponent === me.id) ?? []
  const waiting = g?.duels.filter(d => d.status === 'OPEN' && d.createdBy === me.id) ?? []
  const recent = g?.duels.filter(d => d.status === 'DONE').slice(0, 6) ?? []
  const word = g?.word
  const myGuesses = word?.guesses.filter(x => x.by === me.id).length ?? 0

  const act = async (fn: () => Promise<GamesState>, good?: (r: GamesState) => void) => {
    setBusy(true)
    try { const r = await fn(); setG(r); good?.(r); void refresh() } catch (e) { toastError(e) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      {/* Skor tablosu */}
      <section className="panel relative overflow-hidden p-3" style={{ background: 'linear-gradient(135deg, #2b1d4e, #3a1f3a)' }}>
        <div className="absolute inset-[-60%] rays opacity-20 pointer-events-none" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center">
          <Side hero={me} wins={g?.record.me ?? 0} color="#b98aff" isOnline />
          <div className="flex flex-col items-center px-2">
            <Icon name="swords" size={40} className="wiggle" />
            <span className="font-pixel text-[15px] text-ink2 mt-1">{g?.record.draws ?? 0} beraberlik</span>
          </div>
          {partner ? <Side hero={partner} wins={g?.record.partner ?? 0} color="#ffcc3a" flip isOnline={online(partner.lastSeen, game.serverTime)} />
            : <div className="font-pixel text-ink2 text-center">Eşini davet et<br /><Icon name="heart" size={28} /></div>}
        </div>
      </section>

      {/* Gelen düellolar */}
      {incoming.map(d => (
        <section key={d.id} className="panel p-3 flex items-center gap-3 dropin !border-gold relative overflow-hidden">
          <div className="absolute inset-0 rays opacity-10 pointer-events-none" />
          <div className="relative panel-dark p-1.5 bob"><Icon name={GAME_INFO[d.game].icon} size={40} /></div>
          <div className="relative flex-1 min-w-0">
            <div className="font-pixel text-lg leading-tight">{GAME_INFO[d.game].name}</div>
            <div className="font-pixel text-[15px] text-gold">{partner?.name} meydan okudu!</div>
          </div>
          <button className="relative pbtn pbtn-gold" onClick={() => { sfx.open(); setPlay({ game: d.game, seed: d.seed, mode: 'respond', duel: d }) }}><Icon name="swords" size={22} />Oyna</button>
        </section>
      ))}

      {/* Günün Kelimesi */}
      {partner && word && (
        <button className="panel w-full p-3 flex items-center gap-3 text-left" onClick={() => { sfx.open(); setWordOpen(true) }}>
          <div className="grid grid-cols-5 gap-[3px] shrink-0">
            {Array.from({ length: 10 }, (_, i) => {
              const row = word.guesses[Math.floor(i / 5)]
              const r = row?.res[i % 5]
              return <span key={i} className="w-[14px] h-[14px] border-2 border-edge rounded-[2px]" style={{ background: r === 'G' ? '#5bd17c' : r === 'Y' ? '#ffcc3a' : r === 'B' ? '#4a4166' : '#120d22' }} />
            })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-xl">Günün Kelimesi</div>
            <div className="font-pixel text-[15px] text-ink2">
              {word.solved ? <span className="text-ok">Çözdünüz! ✓</span> : word.finished ? <span className="text-hp">Bulunamadı</span> : `Ortak · ${word.guesses.length}/6 · senin ${3 - myGuesses} hakkın`}
            </div>
          </div>
          {!word.finished && myGuesses < 3 && <span className="w-3 h-3 rounded-full bg-hp border-2 border-edge blinkdot" />}
          <Icon name="scroll" size={34} />
        </button>
      )}

      {/* Birlikte */}
      {partner && g && (
        <section className="panel p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-xl flex items-center gap-2"><Icon name="heart" size={24} />Birlikte</span>
            <span className="font-pixel text-[15px] flex items-center gap-2">
              <span className="text-xp flex items-center gap-0.5"><Icon name="star" size={15} />{g.config.togetherXP}</span>
              <span className="text-gold flex items-center gap-0.5"><Icon name="coin" size={15} />{g.config.togetherGold}</span>
              <span className="text-hp flex items-center gap-0.5"><Icon name="sword" size={15} />{g.config.togetherDamage}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {g.together.map(t => {
              const mine = t.status === 'PENDING' && t.proposedBy === me.id
              const theirs = t.status === 'PENDING' && t.proposedBy !== me.id
              const done = t.status === 'DONE'
              return (
                <div key={t.code} className={`panel-dark p-2 flex flex-col items-center gap-1 text-center relative ${theirs ? '!border-gold' : ''} ${done ? 'opacity-90' : ''}`}>
                  <Icon name={t.icon} size={36} className={theirs ? 'bob' : done ? '' : ''} />
                  <span className="font-pixel text-[15px] leading-tight min-h-[36px] flex items-center">{t.title}</span>
                  {done ? <span className="font-pixel text-ok text-lg stamp flex items-center gap-1"><Icon name="check" size={20} />Tamam</span>
                    : mine ? (
                      <div className="flex items-center gap-1 w-full">
                        <span className="flex-1 font-pixel text-[14px] text-ink2 blinkdot">Onay bekliyor</span>
                        <button className="pbtn pbtn-dark !min-h-[36px] !px-2" disabled={busy} aria-label="Geri al" onClick={() => void act(() => togetherCancel(t.code), () => sfx.undo())}>✕</button>
                      </div>
                    ) : (
                      <button className={`pbtn ${theirs ? 'pbtn-gold glow' : 'pbtn-green'} !min-h-[40px] w-full text-[15px]`} disabled={busy}
                        onClick={e => { const at = fx.fromEl(e.currentTarget); void act(() => togetherMark(t.code), () => {
                          if (theirs) { sfx.victory(); fx.confetti(60); fx.burst(at.x, at.y, '#ff8ab5', 16, 70); fx.float(`+${g.config.togetherXP} XP`, at.x, at.y - 30, '#4cc9f0', true) }
                          else { sfx.cheer(); fx.sparkle(at.x, at.y, 8, '#ff8ab5') }
                        }) }}>
                        {theirs ? <><Icon name="check" size={18} />Onayla</> : <><Icon name="heart" size={18} />Yaptık!</>}
                      </button>
                    )}
                </div>
              )
            })}
          </div>
          <div className="font-pixel text-[14px] text-ink2 text-center">Biri "Yaptık!" der, diğeri onaylar · toplam {g.togetherDone}</div>
        </section>
      )}

      {/* Mini oyunlar */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-pixel text-xl flex items-center gap-2"><Icon name="gamepad" size={26} />Düello</span>
          {g && <span className="font-pixel text-[15px] text-ink2 flex items-center gap-1"><Icon name="gift" size={16} />Bugün {g.duelRewardsLeft} ödül</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DUEL_GAMES.map((k, i) => (
            <button key={k} className={`panel p-2 flex items-center gap-2 text-left relative overflow-hidden ${i === 4 ? 'col-span-2' : ''}`} onClick={() => { sfx.open(); setIntro(k) }}>
              <span className="absolute left-0 top-0 bottom-0 w-[5px]" style={{ background: GAME_INFO[k].color }} />
              <span className="panel-dark p-1 ml-1"><Icon name={GAME_INFO[k].icon} size={36} /></span>
              <span className="font-pixel text-[16px] leading-tight">{GAME_INFO[k].name}</span>
            </button>
          ))}
        </div>
      </section>

      {waiting.length > 0 && (
        <section className="panel-dark p-2 space-y-1.5">
          {waiting.map(d => (
            <div key={d.id} className="flex items-center gap-2 font-pixel text-[16px]">
              <Icon name={GAME_INFO[d.game].icon} size={26} />
              <span className="flex-1 truncate">{GAME_INFO[d.game].name}</span>
              <span className="text-gold">{d.scoreA}</span>
              <span className="text-ink2 text-[14px] blinkdot">bekliyor</span>
              <button className="pbtn pbtn-dark !min-h-[34px] !px-2 text-[14px]" disabled={busy} onClick={() => void act(() => duelCancel(d.id), () => sfx.undo())} aria-label="İptal">✕</button>
            </div>
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section className="panel-dark p-2 space-y-1.5">
          {recent.map(d => {
            const mine = d.createdBy === me.id ? d.scoreA : d.scoreB
            const theirs = d.createdBy === me.id ? d.scoreB : d.scoreA
            const res = !d.winner ? 'draw' : d.winner === me.id ? 'win' : 'lose'
            return (
              <div key={d.id} className="flex items-center gap-2 font-pixel text-[16px]">
                <Icon name={GAME_INFO[d.game].icon} size={24} />
                <span className="flex-1 truncate text-ink2">{GAME_INFO[d.game].name}</span>
                <span className={res === 'win' ? 'text-ok' : res === 'lose' ? 'text-hp' : 'text-ink2'}>{mine} – {theirs}</span>
                {res === 'win' ? <Icon name="crown" size={20} /> : <span className="w-5" />}
              </div>
            )
          })}
        </section>
      )}

      <Sheet open={!!intro} onClose={() => setIntro(null)} title={intro ? <span className="flex items-center gap-2"><Icon name={GAME_INFO[intro].icon} size={28} />{GAME_INFO[intro].name}</span> : null}>
        {intro && (
          <div className="space-y-4">
            <div className="panel-dark p-4 flex flex-col items-center gap-3 relative overflow-hidden">
              <div className="absolute inset-[-60%] rays opacity-20" />
              <Icon name={GAME_INFO[intro].icon} size={96} className="relative bob" />
              <p className="relative font-pixel text-xl text-center">{GAME_INFO[intro].rule}</p>
            </div>
            {partner && (
              <button className="pbtn pbtn-gold w-full text-xl" disabled={waiting.length >= 3} onClick={() => { sfx.go(); setPlay({ game: intro, seed: newSeed(), mode: 'challenge' }); setIntro(null) }}>
                <Icon name="swords" size={26} />{partner.name} ile düello
              </button>
            )}
            <button className="pbtn pbtn-dark w-full" onClick={() => { sfx.click(); setPlay({ game: intro, seed: newSeed(), mode: 'practice' }); setIntro(null) }}>
              <Icon name="target" size={22} />Antrenman
            </button>
            {waiting.length >= 3 && <p className="font-pixel text-[15px] text-ink2 text-center">3 düello eşinin sırasını bekliyor.</p>}
          </div>
        )}
      </Sheet>

      {play && <PlayOverlay play={play} partner={partner} me={me} onClose={() => setPlay(null)} onSubmit={async score => {
        if (play.mode === 'practice') return null
        const r = play.mode === 'challenge' ? await duelCreate(play.game, play.seed, score) : await duelPlay(play.duel!.id, score)
        setG(r); void refresh()
        return play.mode === 'respond' ? r.duels.find(d => d.id === play.duel!.id) ?? null : null
      }} />}

      <Sheet open={wordOpen} onClose={() => setWordOpen(false)} title={<span className="flex items-center gap-2"><Icon name="scroll" size={26} />Günün Kelimesi</span>}>
        {word && partner && <WordBoard g={g!} me={me} partner={partner} busy={busy} onGuess={w => act(() => wordGuess(w), r => {
          const last = r.word?.guesses[r.word.guesses.length - 1]
          last?.res.split('').forEach((c, i) => window.setTimeout(() => sfx.flip(c as 'G' | 'Y' | 'B'), i * 110))
          if (r.word?.solved) window.setTimeout(() => { sfx.victory(); fx.confetti(90); fx.flash('rgba(91,209,124,.35)') }, 600)
          else if (r.word?.finished) window.setTimeout(() => sfx.hurt(), 600)
        })} />}
      </Sheet>
    </div>
  )
}

function Side({ hero, wins, color, flip, isOnline }: { hero: Hero; wins: number; color: string; flip?: boolean; isOnline?: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <div className="relative" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
        <HeroSprite cls={hero.class} look={hero.look} gear={hero.equipped} scale={2.2} />
      </div>
      <div className="font-pixel text-[16px] truncate max-w-full flex items-center gap-1">
        {isOnline && <span className="w-2.5 h-2.5 rounded-full bg-ok border-2 border-edge" title="Çevrimiçi" />}{hero.name}
      </div>
      <div className="font-pixel text-3xl drop-shadow-[0_2px_0_#000]" style={{ color }}>{wins}</div>
    </div>
  )
}

// ---------------------------------------------------------------- oyun katmanı: geri sayım → oyun → sonuç
function PlayOverlay({ play, me, partner, onClose, onSubmit }: { play: Play; me: Hero; partner: Hero | null; onClose: () => void; onSubmit: (score: number) => Promise<Duel | null> }) {
  const [phase, setPhase] = useState<'count' | 'play' | 'send' | 'result'>('count')
  const [count, setCount] = useState(3)
  const [score, setScore] = useState(0)
  const [duel, setDuel] = useState<Duel | null>(null)
  const { game } = useGame()
  const image = useMemo(() => puzzleImage(game.boss?.key ?? 'dragon_green', play.seed), [game.boss?.key, play.seed])
  const info = GAME_INFO[play.game]

  useEffect(() => {
    if (phase !== 'count') return
    if (count === 0) { sfx.go(); const t = window.setTimeout(() => setPhase('play'), 450); return () => clearTimeout(t) }
    sfx.count()
    const t = window.setTimeout(() => setCount(c => c - 1), 650)
    return () => clearTimeout(t)
  }, [phase, count])

  const end = useCallback(async (s: number) => {
    setScore(s); setPhase('send')
    try {
      const d = await onSubmit(s)
      setDuel(d)
      if (d) {
        const win = d.winner === me.id, draw = !d.winner
        if (win) { sfx.victory(); fx.confetti(100); fx.flash('rgba(255,215,90,.4)') } else if (draw) sfx.cheer(); else sfx.hurt()
      } else if (play.mode === 'challenge') { sfx.ticket(); fx.sparkle(window.innerWidth / 2, window.innerHeight / 2, 12) } else sfx.great()
    } catch (e) { toastError(e) }
    setPhase('result')
  }, [onSubmit, me.id, play.mode])

  const theirScore = duel ? (duel.createdBy === me.id ? duel.scoreB : duel.scoreA) : null
  const result = duel ? (!duel.winner ? 'draw' : duel.winner === me.id ? 'win' : 'lose') : null

  return (
    <div className="fixed inset-0 z-[52] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label={info.name}>
      <div className="mx-auto max-w-[520px] min-h-dvh px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-6 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name={info.icon} size={32} />
          <span className="font-pixel text-2xl flex-1">{info.name}</span>
          {play.mode !== 'practice' && <span className="panel-dark px-2 py-1 font-pixel text-[15px] text-gold flex items-center gap-1"><Icon name="swords" size={16} />Düello</span>}
          {phase !== 'send' && <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose() }} aria-label="Kapat">✕</button>}
        </div>

        {phase === 'count' && (
          <div className="flex flex-col items-center justify-center pt-20 gap-6">
            <p className="font-pixel text-xl text-ink2 text-center">{info.rule}</p>
            <div key={count} className="font-pixel text-[120px] leading-none text-gold popin drop-shadow-[0_6px_0_#000]">{count > 0 ? count : 'BAŞLA!'}</div>
          </div>
        )}
        {phase === 'play' && (
          play.game === 'TAP' ? <TapGame seed={play.seed} onEnd={s => void end(s)} />
            : play.game === 'MEMORY' ? <MemoryGame seed={play.seed} onEnd={s => void end(s)} />
              : play.game === 'TIMING' ? <TimingGame seed={play.seed} onEnd={s => void end(s)} />
                : play.game === 'WORDS' ? <WordsGame seed={play.seed} onEnd={s => void end(s)} />
                  : <SlideGame seed={play.seed} image={image} onEnd={s => void end(s)} />
        )}
        {(phase === 'send' || phase === 'result') && (
          <div className="flex flex-col items-center pt-10 gap-4 text-center">
            {result ? (
              <>
                <div className={`font-pixel text-6xl stamp drop-shadow-[0_4px_0_#000] ${result === 'win' ? 'text-gold' : result === 'lose' ? 'text-hp' : 'text-xp'}`}>
                  {result === 'win' ? 'KAZANDIN!' : result === 'lose' ? 'Kaybettin' : 'Berabere'}
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 w-full">
                  <div className="flex flex-col items-center"><div className={result === 'win' ? 'jump' : ''}><HeroSprite cls={me.class} look={me.look} gear={me.equipped} scale={2.4} pose={result === 'win' ? 'joy' : result === 'lose' ? 'hurt' : undefined} /></div><span className="font-pixel text-4xl text-magic">{score}</span></div>
                  <span className="font-pixel text-3xl text-hp pb-6">VS</span>
                  {partner && <div className="flex flex-col items-center"><div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={partner.class} look={partner.look} gear={partner.equipped} scale={2.4} pose={result === 'lose' ? 'joy' : result === 'win' ? 'hurt' : undefined} /></div><span className="font-pixel text-4xl text-gold">{theirScore}</span></div>}
                </div>
              </>
            ) : (
              <>
                <div className="relative"><div className="absolute inset-[-80%] rays opacity-30" /><Icon name={info.icon} size={96} className="relative pop" /></div>
                <div className="font-pixel text-7xl text-gold popin drop-shadow-[0_4px_0_#000]">{score}</div>
                {phase === 'send' ? <p className="font-pixel text-lg text-ink2 blinkdot">Gönderiliyor…</p>
                  : play.mode === 'challenge' ? <p className="font-pixel text-xl text-ok">Meydan okuma gönderildi!<br /><span className="text-ink2 text-[16px]">{partner?.name} oynayınca sonuç gelecek.</span></p>
                    : <p className="font-pixel text-lg text-ink2">Antrenman</p>}
              </>
            )}
            {phase === 'result' && <button className="pbtn pbtn-gold w-full text-xl mt-2" autoFocus onClick={() => { sfx.click(); onClose() }}>Tamam</button>}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Günün Kelimesi
const KEYS = ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ']
function WordBoard({ g, me, partner, busy, onGuess }: { g: GamesState; me: Hero; partner: Hero; busy: boolean; onGuess: (w: string) => Promise<void> }) {
  const w = g.word!
  const [cur, setCur] = useState('')
  const mine = w.guesses.filter(x => x.by === me.id).length
  const theirs = w.guesses.filter(x => x.by === partner.id).length
  const canType = !w.finished && mine < 3 && !busy
  const letterState = useMemo(() => {
    const m: Record<string, 'G' | 'Y' | 'B'> = {}
    for (const x of w.guesses) [...x.word].forEach((ch, i) => {
      const r = x.res[i] as 'G' | 'Y' | 'B'
      if (m[ch] === 'G' || (m[ch] === 'Y' && r === 'B')) return
      m[ch] = r
    })
    return m
  }, [w.guesses])
  const add = useCallback((ch: string) => { if (canType) { sfx.key(); setCur(c => (c.length < 5 ? c + ch : c)) } }, [canType])
  const back = useCallback(() => { sfx.key(); setCur(c => c.slice(0, -1)) }, [])
  const submit = useCallback(async () => {
    if (cur.length !== 5 || !canType) { sfx.error(); return }
    const word = cur; setCur('')
    await onGuess(word)
  }, [cur, canType, onGuess])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { void submit(); return }
      if (e.key === 'Backspace') { back(); return }
      const ch = e.key.toLocaleUpperCase('tr-TR')
      if (/^[A-ZÇĞİÖŞÜ]$/u.test(ch) && !'QWX'.includes(ch)) add(ch)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [add, back, submit])
  const color = (r?: string) => (r === 'G' ? '#4cbf6a' : r === 'Y' ? '#e8b830' : r === 'B' ? '#3e3658' : '#120d22')

  return (
    <div className="space-y-3">
      <div className="flex justify-between font-pixel text-[15px]">
        <span className="flex items-center gap-1"><Portrait cls={me.class} look={me.look} gear={me.equipped} size={22} />{3 - mine} hak</span>
        <span className="text-ink2">{w.solvedDays} gün çözüldü</span>
        <span className="flex items-center gap-1">{3 - theirs} hak<Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={22} /></span>
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 6 }, (_, row) => {
          const gs = w.guesses[row]
          const isCur = !gs && row === w.guesses.length && !w.finished
          const who = gs ? (gs.by === me.id ? me : partner) : isCur ? me : null
          return (
            <div key={row} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0">{who && <Portrait cls={who.class} look={who.look} gear={who.equipped} size={24} />}</span>
              <div className="grid grid-cols-5 gap-1.5 flex-1">
                {Array.from({ length: 5 }, (_, i) => {
                  const ch = gs ? [...gs.word][i] : isCur ? [...cur][i] : ''
                  return (
                    <div key={i} className={`aspect-square border-[3px] rounded-[4px] grid place-items-center font-pixel text-3xl ${gs ? 'tile-flip border-edge' : ch ? 'border-gold pop' : 'border-panel2'}`}
                      style={{ background: color(gs?.res[i]), animationDelay: gs ? `${i * 90}ms` : undefined }}>{ch}</div>
                  )
                })}
              </div>
              <span className="w-6 shrink-0" />
            </div>
          )
        })}
      </div>
      {w.finished ? (
        <div className={`panel-dark p-3 text-center font-pixel text-xl ${w.solved ? 'text-ok' : 'text-hp'}`}>
          {w.solved ? 'Bravo, birlikte çözdünüz!' : 'Kelime:'} <span className="text-gold text-2xl tracking-widest">{w.answer}</span>
        </div>
      ) : mine >= 3 ? (
        <div className="panel-dark p-3 text-center font-pixel text-lg text-ink2">Hakların bitti · sıra {partner.name}'de</div>
      ) : (
        <div className="space-y-1.5 select-none">
          {KEYS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {ri === 2 && <button className="pbtn pbtn-green !min-h-[48px] !px-2 text-[15px]" disabled={cur.length !== 5 || busy} onClick={() => void submit()} aria-label="Gönder">✓</button>}
              {[...row].map(ch => (
                <button key={ch} onClick={() => add(ch)} className="flex-1 max-w-[36px] h-[48px] rounded-[4px] border-2 border-edge font-pixel text-xl"
                  style={{ background: letterState[ch] ? color(letterState[ch]) : '#4a3f72', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.3)' }}>{ch}</button>
              ))}
              {ri === 2 && <button className="pbtn pbtn-dark !min-h-[48px] !px-2" onClick={back} aria-label="Sil">⌫</button>}
            </div>
          ))}
        </div>
      )}
      <p className="font-pixel text-[14px] text-ink2 text-center">
        <span style={{ color: '#5bd17c' }}>■</span> doğru yer · <span style={{ color: '#e8b830' }}>■</span> var ama başka yerde · her biriniz 3 tahmin
      </p>
    </div>
  )
}
