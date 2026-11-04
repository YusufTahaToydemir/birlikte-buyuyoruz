// Birlikte kartları: çift testi, not defteri (mektup + şükür), ortak baskın.
import { useEffect, useState } from 'react'
import { getNotes, noteWrite, quizAdd, quizAnswer, STAMPS, type Games as GamesState, type Hero, type Note, type Partner, type QuizQuestion } from '../lib/game'
import { GAME_INFO } from '../game/minigames'
import { HeroSprite, Icon, Portrait } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Sheet, toastError } from '../game/ui'

type Act = (fn: () => Promise<GamesState>, good?: (r: GamesState) => void) => Promise<void>

// ---------------------------------------------------------------- Çift testi
export function QuizCard({ g, me, partner, busy, act }: { g: GamesState; me: Hero; partner: Partner; busy: boolean; act: Act }) {
  const q = g.quiz
  const [open, setOpen] = useState<'play' | 'result' | 'add' | null>(null)
  if (!q) return null
  const total = q.questions.length * 2
  return (
    <section className="panel p-3 space-y-2" aria-label="Çift testi">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xl flex items-center gap-2"><Icon name="puzzle" size={24} />Çift Testi</span>
        <button className="font-pixel text-[14px] text-ink2 flex items-center gap-1 panel-dark px-2 py-1" onClick={() => { sfx.click(); setOpen('add') }}><Icon name="quill" size={14} />Soru ekle</button>
      </div>
      {q.finished ? (
        <button className="w-full panel-dark p-3 flex items-center gap-3" onClick={() => { sfx.open(); setOpen('result') }}>
          <div className="flex -space-x-2"><Portrait cls={me.class} look={me.look} gear={me.equipped} size={36} /><Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={36} /></div>
          <div className="flex-1 text-left">
            <div className="font-pixel text-lg"><span className="text-gold">{q.matches}</span><span className="text-ink2">/{total}</span> eşleşme</div>
            <div className="flex gap-0.5">{Array.from({ length: total }, (_, i) => <Icon key={i} name="heart" size={14} className={i < (q.matches ?? 0) ? '' : 'opacity-25 grayscale'} />)}</div>
          </div>
          <span className="font-pixel text-[14px] text-ink2">Sonuçlar ▶</span>
        </button>
      ) : q.mineDone ? (
        <div className="panel-dark p-3 flex items-center gap-3">
          <Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={36} />
          <span className="flex-1 font-pixel text-ink2 blinkdot">{partner.name} henüz cevaplamadı…</span>
        </div>
      ) : (
        <button className="pbtn pbtn-purple w-full text-lg" onClick={() => { sfx.open(); setOpen('play') }}>
          <Icon name="heart" size={22} />Birbirimizi ne kadar tanıyoruz?{q.theirsDone && <span className="text-[13px] bg-edge/50 rounded px-1 ml-1">{partner.name} hazır</span>}
        </button>
      )}
      <div className="flex items-center justify-between font-pixel text-[13px] text-ink2">
        <span>5 soru · kendi cevabın + eşinin tahmini · eşleşme başına +5 altın, +8 hasar</span>
      </div>
      {q.history.length > 0 && (
        <div className="flex gap-1 flex-wrap">{q.history.map(h => <span key={h.week} className="panel-dark px-1.5 py-0.5 font-pixel text-[13px]" title={h.week}><span className="text-gold">{h.matches}</span>/{total}</span>)}</div>
      )}

      <Sheet open={open === 'play'} onClose={() => setOpen(null)} title={<span className="flex items-center gap-2"><Icon name="puzzle" size={26} />Çift Testi</span>}>
        {open === 'play' && <QuizPlay qs={q.questions} me={me} partner={partner} busy={busy} onDone={async ans => { await act(() => quizAnswer(ans), r => {
          if (r.quiz?.finished) { sfx.victory(); fx.confetti(90); fx.flash('rgba(255,138,181,.35)') } else { sfx.ticket(); fx.sparkle(window.innerWidth / 2, window.innerHeight / 2, 10, '#ff8ab5') }
        }); setOpen(null) }} />}
      </Sheet>
      <Sheet open={open === 'result'} onClose={() => setOpen(null)} title={<span className="flex items-center gap-2"><Icon name="heart" size={26} />{q.matches}/{total} eşleşme</span>}>
        {open === 'result' && <QuizResult qs={q.questions} me={me} partner={partner} />}
      </Sheet>
      <Sheet open={open === 'add'} onClose={() => setOpen(null)} title={<span className="flex items-center gap-2"><Icon name="quill" size={26} />Kendi sorunuz</span>}>
        {open === 'add' && <QuizAdd busy={busy} onAdd={async (t, o) => { await act(() => quizAdd(t, o), () => sfx.ticket()); setOpen(null) }} />}
      </Sheet>
    </section>
  )
}

function QuizPlay({ qs, me, partner, busy, onDone }: { qs: QuizQuestion[]; me: Hero; partner: Partner; busy: boolean; onDone: (a: Record<number, { self: number; guess: number }>) => Promise<void> }) {
  const [i, setI] = useState(0)
  const [step, setStep] = useState<'self' | 'guess'>('self')
  const [ans, setAns] = useState<Record<number, { self: number; guess: number }>>({})
  const q = qs[Math.min(i, qs.length - 1)]
  const done = i >= qs.length
  const pick = (o: number) => {
    sfx.click()
    if (step === 'self') { setAns(a => ({ ...a, [q.id]: { self: o, guess: a[q.id]?.guess ?? 0 } })); setStep('guess') }
    else { setAns(a => ({ ...a, [q.id]: { self: a[q.id]?.self ?? 0, guess: o } })); setStep('self'); setI(x => x + 1) }
  }
  if (done) return (
    <div className="space-y-3 text-center">
      <div className="flex justify-center items-end gap-3"><HeroSprite cls={me.class} look={me.look} gear={me.equipped} scale={2.4} pose="joy" /><Icon name="heart" size={40} className="glow mb-6" /><div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={partner.class} look={partner.look} gear={partner.equipped} scale={2.4} /></div></div>
      <p className="font-pixel text-lg">Cevapların hazır. {partner.name} de cevaplayınca eşleşmeler açılır.</p>
      <button className="pbtn pbtn-gold w-full text-xl" disabled={busy} onClick={() => void onDone(ans)}><Icon name="check" size={24} />Gönder</button>
    </div>
  )
  const who = step === 'self' ? me : partner
  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-1">{qs.map((x, k) => <span key={x.id} className={`w-3 h-3 border-2 border-edge ${k < i ? 'bg-ok' : k === i ? 'bg-gold' : 'bg-panel2'}`} />)}</div>
      <div className="panel-dark p-3 text-center font-pixel text-xl leading-tight">{q.text}</div>
      <div className="flex items-center justify-center gap-2 font-pixel text-[16px]" style={{ color: step === 'self' ? '#b98aff' : '#ffcc3a' }}>
        <Portrait cls={who.class} look={who.look} gear={who.equipped} size={28} />{step === 'self' ? 'Senin cevabın?' : `${partner.name} ne der?`}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((o, k) => <button key={k} className="pbtn pbtn-dark !min-h-[64px] text-[16px] leading-tight" onClick={() => pick(k)}>{o}</button>)}
      </div>
    </div>
  )
}

function QuizResult({ qs, me, partner }: { qs: QuizQuestion[]; me: Hero; partner: Partner }) {
  return (
    <div className="space-y-2">
      {qs.map(q => {
        const meGuessed = q.me && q.partner && q.me.guess === q.partner.self
        const theyGuessed = q.me && q.partner && q.partner.guess === q.me.self
        return (
          <div key={q.id} className="panel-dark p-2 space-y-1">
            <div className="font-pixel text-[16px] leading-tight">{q.text}</div>
            <div className="grid grid-cols-2 gap-2 font-pixel text-[14px]">
              <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${meGuessed ? 'bg-ok/20' : 'bg-black/20'}`}>
                <Portrait cls={me.class} look={me.look} gear={me.equipped} size={22} />
                <span className="flex-1 truncate">{q.me ? q.options[q.me.self] : '—'}</span>
                <span className="text-ink2 text-[12px]">tahmin: {q.partner ? q.options[q.partner.guess] : '—'}</span>
                {theyGuessed && <Icon name="check" size={14} />}
              </div>
              <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theyGuessed ? 'bg-ok/20' : 'bg-black/20'}`}>
                <Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={22} />
                <span className="flex-1 truncate">{q.partner ? q.options[q.partner.self] : '—'}</span>
                <span className="text-ink2 text-[12px]">tahmin: {q.me ? q.options[q.me.guess] : '—'}</span>
                {meGuessed && <Icon name="check" size={14} />}
              </div>
            </div>
          </div>
        )
      })}
      <p className="font-pixel text-[13px] text-ink2 text-center">Yeşil kutu: eşin senin cevabını bildi</p>
    </div>
  )
}

function QuizAdd({ busy, onAdd }: { busy: boolean; onAdd: (t: string, o: string[]) => Promise<void> }) {
  const [t, setT] = useState('')
  const [o, setO] = useState(['', '', '', ''])
  const ok = t.trim().length >= 3 && o.every(x => x.trim().length > 0)
  return (
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (ok) void onAdd(t.trim(), o.map(x => x.trim())) }}>
      <input className="input" placeholder="Soru (örn. En sevdiği oyun?)" maxLength={100} value={t} onChange={e => setT(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        {o.map((x, k) => <input key={k} className="input" placeholder={`Şık ${k + 1}`} maxLength={40} value={x} onChange={e => setO(a => a.map((y, j) => (j === k ? e.target.value : y)))} />)}
      </div>
      <p className="font-pixel text-[13px] text-ink2 text-center">Haftalık 5 sorunun arasına karışır; ikiniz de görür.</p>
      <button type="submit" className="pbtn pbtn-gold w-full" disabled={!ok || busy}><Icon name="quill" size={22} />Ekle</button>
    </form>
  )
}

// ---------------------------------------------------------------- Not defteri: mektup + şükür
export function NotesCard({ g, me, partner, busy, act }: { g: GamesState; me: Hero; partner: Partner; busy: boolean; act: Act }) {
  const n = g.notes
  const [open, setOpen] = useState<'letter' | 'history' | null>(null)
  const [thanks, setThanks] = useState('')
  return (
    <section className="panel p-3 space-y-2" aria-label="Not defteri">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-xl flex items-center gap-2"><Icon name="quill" size={24} />Not Defteri</span>
        <button className="font-pixel text-[14px] text-ink2 flex items-center gap-1 panel-dark px-2 py-1" onClick={() => { sfx.open(); setOpen('history') }}><Icon name="book" size={14} />Hatıra · {n.total}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className={`panel-dark p-2 flex flex-col items-center gap-1 ${n.letterSent ? 'opacity-80' : ''}`} disabled={n.letterSent || busy} onClick={() => { sfx.open(); setOpen('letter') }}>
          <Icon name="scroll" size={40} className={n.letterSent ? '' : 'bob'} />
          <span className="font-pixel text-[15px] leading-tight text-center">{n.letterSent ? <span className="text-ok flex items-center gap-1"><Icon name="check" size={14} />Mektup gitti</span> : 'Mektup yaz'}</span>
        </button>
        <div className="panel-dark p-2 flex flex-col items-center gap-1">
          <Icon name="sparkle" size={28} />
          {n.thanksMe ? (
            <span className="font-pixel text-[14px] text-center leading-tight text-ok">« {n.thanksMe} »</span>
          ) : (
            <form className="w-full space-y-1" onSubmit={e => { e.preventDefault(); if (thanks.trim()) void act(() => noteWrite('THANKS', thanks.trim()), r => { setThanks(''); if (r.notes.thanksPartner) { sfx.victory(); fx.confetti(50) } else sfx.cheer() }) }}>
              <input className="input !min-h-[40px] text-[14px]" placeholder="Bugün şükrün ne?" maxLength={140} value={thanks} onChange={e => setThanks(e.target.value)} />
              <button type="submit" className="pbtn pbtn-green w-full !min-h-[36px] text-[14px]" disabled={!thanks.trim() || busy}>Yaz</button>
            </form>
          )}
          {n.thanksPartner && <span className="font-pixel text-[13px] text-ink2 text-center leading-tight flex items-center gap-1"><Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={16} />{n.thanksPartner}</span>}
        </div>
      </div>
      <p className="font-pixel text-[13px] text-ink2 text-center">Günde 1 mektup · ikiniz de şükür yazarsanız +10 altın</p>

      <Sheet open={open === 'letter'} onClose={() => setOpen(null)} title={<span className="flex items-center gap-2"><Icon name="scroll" size={26} />{partner.name}'e mektup</span>}>
        {open === 'letter' && <LetterForm busy={busy} onSend={async (t, s) => { await act(() => noteWrite('LETTER', t, s), () => { sfx.ticket(); fx.fly(window.innerWidth / 2, window.innerHeight / 2, 'hud-gold', 0, 'heart'); fx.sparkle(window.innerWidth / 2, window.innerHeight / 2, 12, '#ff8ab5') }); setOpen(null) }} />}
      </Sheet>
      <Sheet open={open === 'history'} onClose={() => setOpen(null)} title={<span className="flex items-center gap-2"><Icon name="book" size={26} />Hatıra defteri</span>}>
        {open === 'history' && <NotesHistory me={me} partner={partner} />}
      </Sheet>
    </section>
  )
}

function LetterForm({ busy, onSend }: { busy: boolean; onSend: (t: string, s: string) => Promise<void> }) {
  const [t, setT] = useState('')
  const [s, setS] = useState(STAMPS[0])
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (t.trim()) void onSend(t.trim(), s) }}>
      <div className="panel-dark p-3 relative" style={{ background: 'repeating-linear-gradient(0deg, #1f1838 0 26px, #2a2146 26px 28px)' }}>
        <textarea className="w-full bg-transparent font-pixel text-xl leading-[28px] resize-none outline-none min-h-[112px]" maxLength={140} placeholder="Birkaç kelime yeter…" value={t} onChange={e => setT(e.target.value)} autoFocus />
        <Icon name={s} size={36} className="absolute right-2 bottom-2 glow" />
        <span className="absolute right-3 top-2 font-pixel text-[12px] text-ink2">{t.length}/140</span>
      </div>
      <div className="flex justify-center gap-1.5">
        {STAMPS.map(k => <button type="button" key={k} className={`panel-dark p-1 ${s === k ? '!border-gold' : ''}`} onClick={() => { sfx.key(); setS(k) }} aria-label={k}><Icon name={k} size={26} /></button>)}
      </div>
      <button type="submit" className="pbtn pbtn-gold w-full text-xl" disabled={!t.trim() || busy}><Icon name="scroll" size={24} />Gönder</button>
    </form>
  )
}

function NotesHistory({ me, partner }: { me: Hero; partner: Partner }) {
  const [list, setList] = useState<Note[] | null>(null)
  useEffect(() => { let on = true; getNotes().then(l => { if (on) setList(l) }).catch(toastError); return () => { on = false } }, [])
  if (!list) return <div className="py-8 text-center"><Icon name="sparkle" size={40} className="pop" /></div>
  if (list.length === 0) return <p className="font-pixel text-ink2 text-center py-6">Henüz not yok. İlk mektubu sen yaz!</p>
  let lastDate = ''
  return (
    <div className="space-y-2">
      {list.map(n => {
        const who = n.author === me.id ? me : partner
        const head = n.date !== lastDate ? <div className="font-pixel text-[13px] text-ink2 text-center pt-1">{new Date(n.date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</div> : null
        lastDate = n.date
        return (
          <div key={n.id}>
            {head}
            <div className={`flex items-start gap-2 ${n.author === me.id ? 'flex-row-reverse' : ''}`}>
              <Portrait cls={who.class} look={who.look} gear={who.equipped} size={28} />
              <div className={`panel-dark p-2 max-w-[80%] font-pixel text-[15px] leading-tight flex items-start gap-2 ${n.kind === 'THANKS' ? '!border-ok/60' : ''}`}>
                <Icon name={n.kind === 'THANKS' ? 'sparkle' : n.stamp ?? 'scroll'} size={18} className="shrink-0" />
                <span>{n.text}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Ortak baskın
export function RaidCard({ g, me, partner, onPlay }: { g: GamesState; me: Hero; partner: Partner; onPlay: () => void }) {
  const r = g.raid
  if (!r) return null
  const info = GAME_INFO[r.game]
  const mine = r.scores[me.id], theirs = r.scores[partner.id]
  return (
    <section className="panel p-3 flex items-center gap-3 relative overflow-hidden" style={{ borderColor: r.finished ? '#5bd17c' : undefined }} aria-label="Ortak baskın">
      {r.finished && <div className="absolute inset-[-60%] rays opacity-10 pointer-events-none" />}
      <div className="relative panel-dark p-1.5"><Icon name={info.icon} size={40} className={mine === undefined ? 'bob' : ''} /></div>
      <div className="relative flex-1 min-w-0">
        <div className="font-pixel text-lg leading-tight flex items-center gap-1"><Icon name="swords" size={18} />Baskın · {info.name}</div>
        <div className="flex items-center gap-2 mt-1 font-pixel text-[15px]">
          <span className="flex items-center gap-1"><Portrait cls={me.class} look={me.look} gear={me.equipped} size={20} /><span className={mine === undefined ? 'text-ink2' : 'text-magic'}>{mine ?? '?'}</span></span>
          <span className="text-ink2">+</span>
          <span className="flex items-center gap-1"><Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={20} /><span className={theirs === undefined ? 'text-ink2' : 'text-gold'}>{theirs ?? '?'}</span></span>
          {r.finished && <span className="ml-auto text-hp flex items-center gap-1 stamp"><Icon name="sword" size={16} />-{r.damage}</span>}
        </div>
      </div>
      {mine === undefined ? (
        <button className="relative pbtn pbtn-red" onClick={() => { sfx.go(); onPlay() }}><Icon name="swords" size={22} />Oyna</button>
      ) : !r.finished ? (
        <span className="relative font-pixel text-[14px] text-ink2 blinkdot text-right">{partner.name}<br />bekleniyor</span>
      ) : null}
    </section>
  )
}
