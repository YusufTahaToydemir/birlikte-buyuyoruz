// Başlık ekranı: giriş, kurulum/davet ile hesap açma, kurtarma kodu.
import { useEffect, useState, type ReactNode } from 'react'
import { errorText, recoverWithCode, signIn, signUp } from '../lib/game'
import { BossSprite, HeroSprite, Icon, SceneBg } from '../game/Sprite'
import { sfx } from '../game/sfx'
import { music } from '../game/music'

type Mode = 'login' | 'setup' | 'invite' | 'recover'
const USERNAME_RE = /^[a-z0-9_]{3,24}$/

/** Bağlantı biçimleri: #/kurulum/<anahtar>  ·  #/davet/<token> */
function parseHash(hash: string): { mode: Mode; secret?: string } {
  const m = /^#\/(kurulum|davet)\/([A-Za-z0-9_-]+)/.exec(hash)
  if (!m) return { mode: 'login' }
  return { mode: m[1] === 'kurulum' ? 'setup' : 'invite', secret: m[2] }
}

export function Auth({ hash }: { hash: string }) {
  useEffect(() => { music.play('title') }, [])
  const parsed = parseHash(hash)
  const [mode, setMode] = useState<Mode>(parsed.mode)
  useEffect(() => setMode(parsed.mode), [parsed.mode])
  const back = () => { window.location.hash = ''; setMode('login') }

  return (
    <div className="px-3 pt-[calc(12px+env(safe-area-inset-top))] pb-8 space-y-4">
      <section className="panel overflow-hidden relative h-[220px]">
        <SceneBg className="absolute inset-0" seed={3} />
        <div className="absolute left-[6%] bottom-[12px]"><HeroSprite cls="WARRIOR" look={{ gender: 'M', hair: 2, skin: 1, hairColor: 0 }} gear={{ weapon: 2, armor: 2 }} scale={2.6} /></div>
        <div className="absolute left-[33%] bottom-[12px]"><HeroSprite cls="HEALER" look={{ gender: 'F', hair: 2, skin: 0, hairColor: 4 }} gear={{ weapon: 2, armor: 2, head: 'head_flower' }} scale={2.6} /></div>
        <div className="absolute right-[5%] bottom-[18px]"><BossSprite bossKey="dragon_green" scale={2.1} className="boss-idle" /></div>
        <h1 className="absolute top-3 left-0 right-0 text-center font-pixel text-[34px] leading-none text-gold drop-shadow-[0_3px_0_#160f22]" style={{ WebkitTextStroke: '1px #160f22' }}>Birlikte<br />Büyüyoruz</h1>
      </section>
      {mode === 'login' && <LoginForm onRecover={() => setMode('recover')} />}
      {mode === 'recover' && <RecoverForm onCancel={() => setMode('login')} />}
      {(mode === 'setup' || mode === 'invite') && <SignupForm kind={mode} secret={parsed.secret ?? ''} onCancel={back} />}
    </div>
  )
}

function Field({ icon, children, error }: { icon: string; children: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2"><Icon name={icon} size={26} />{children}</span>
      {error && <span className="block text-[15px] text-hp mt-1 ml-9">{error}</span>}
    </label>
  )
}

function LoginForm({ onRecover }: { onRecover: () => void }) {
  const [username, setUsername] = useState(() => { try { return localStorage.getItem('bb:lastUsername') ?? '' } catch { return '' } })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); sfx.click()
    setBusy(true); setError(null)
    try {
      await signIn(username, password)
      sfx.levelUp()
      try { localStorage.setItem('bb:lastUsername', username.trim().toLowerCase()) } catch { /* yok say */ }
    } catch (err) { sfx.error(); setError(errorText(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="panel p-4 space-y-3" aria-label="Giriş">
      <Field icon="helmet"><input className="input" placeholder="Kullanıcı adı" autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)} required /></Field>
      <Field icon="lock"><input className="input" placeholder="Şifre" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
      {error && <p className="text-hp font-pixel text-center" role="alert">{error}</p>}
      <button type="submit" className="pbtn pbtn-gold w-full text-xl" disabled={busy}><Icon name="swords" size={24} />{busy ? '…' : 'Başla'}</button>
      <button type="button" className="w-full text-[16px] text-ink2 underline py-1" onClick={onRecover}>Şifremi unuttum</button>
    </form>
  )
}

function RecoverForm({ onCancel }: { onCancel: () => void }) {
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const pErr = password && password.length < 6 ? 'En az 6 karakter' : null
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pErr) return
    setBusy(true); setError(null)
    try { await recoverWithCode(username, code, password); setDone(true); sfx.ticket() } catch (err) { sfx.error(); setError(errorText(err)) } finally { setBusy(false) }
  }
  if (done) return (
    <div className="panel p-4 space-y-3 text-center">
      <Icon name="check" size={56} />
      <p className="font-pixel text-lg">Şifre yenilendi</p>
      <button className="pbtn pbtn-gold w-full" onClick={onCancel}>Giriş yap</button>
    </div>
  )
  return (
    <form onSubmit={submit} className="panel p-4 space-y-3">
      <Field icon="helmet"><input className="input" placeholder="Kullanıcı adı" autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)} required /></Field>
      <Field icon="scroll"><input className="input font-mono" placeholder="ABCD-EFGH" autoCapitalize="characters" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required /></Field>
      <Field icon="lock" error={pErr}><input className="input" placeholder="Yeni şifre" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
      {error && <p className="text-hp font-pixel text-center" role="alert">{error}</p>}
      <button type="submit" className="pbtn pbtn-gold w-full" disabled={busy || !!pErr}>Şifreyi yenile</button>
      <button type="button" className="pbtn pbtn-dark w-full" onClick={onCancel}>◀ Geri</button>
    </form>
  )
}

function SignupForm({ kind, secret, onCancel }: { kind: 'setup' | 'invite'; secret: string; onCancel: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uErr = username && !USERNAME_RE.test(username) ? '3–24 karakter: küçük harf, rakam, _' : null
  const pErr = password && password.length < 6 ? 'En az 6 karakter' : null
  const p2Err = password2 && password2 !== password ? 'Şifreler aynı değil' : null
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (uErr || pErr || p2Err || !secret) return
    setBusy(true); setError(null)
    try {
      await signUp(username, password, username, kind === 'setup' ? { setupKey: secret } : { inviteToken: secret })
      sfx.levelUp(); window.location.hash = ''
    } catch (err) { sfx.error(); setError(errorText(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="panel p-4 space-y-3">
      <div className="font-pixel text-xl text-center flex items-center justify-center gap-2">
        <Icon name={kind === 'setup' ? 'crown' : 'ticket'} size={28} />{kind === 'setup' ? 'Yeni macera' : 'Takıma katıl'}
      </div>
      <Field icon="helmet" error={uErr}><input className="input" placeholder="Kullanıcı adı" autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required /></Field>
      <Field icon="lock" error={pErr}><input className="input" placeholder="Şifre (en az 6)" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
      <Field icon="lock" error={p2Err}><input className="input" placeholder="Şifre tekrar" type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} required /></Field>
      {error && <p className="text-hp font-pixel text-center" role="alert">{error}</p>}
      <button type="submit" className="pbtn pbtn-gold w-full text-xl" disabled={busy || !!uErr || !!pErr || !!p2Err}><Icon name="swords" size={24} />Hesabı aç</button>
      <button type="button" className="w-full text-[16px] text-ink2 underline py-1" onClick={onCancel}>Zaten hesabım var</button>
    </form>
  )
}
