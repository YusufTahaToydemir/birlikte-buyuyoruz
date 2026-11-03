import { useEffect, useState } from 'react'
import { errorText, signIn, signUp } from '../lib/api'
import { Button, Card, Field } from '../components/ui'
import { APP_NAME } from '../App'

type Mode = 'login' | 'setup' | 'invite'

const USERNAME_RE = /^[a-z0-9_]{3,24}$/

/** Bağlantı biçimleri: #/kurulum/<anahtar>  ·  #/davet/<token> */
function parseHash(hash: string): { mode: Mode; secret?: string } {
  const m = /^#\/(kurulum|davet)\/([A-Za-z0-9_-]+)/.exec(hash)
  if (!m) return { mode: 'login' }
  return { mode: m[1] === 'kurulum' ? 'setup' : 'invite', secret: m[2] }
}

export function Auth({ hash }: { hash: string }) {
  const parsed = parseHash(hash)
  const [mode, setMode] = useState<Mode>(parsed.mode)
  useEffect(() => setMode(parsed.mode), [parsed.mode])

  return (
    <div className="px-4 pt-[calc(32px+env(safe-area-inset-top))] pb-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="text-5xl" aria-hidden="true">🌱</div>
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <p className="text-ink-2">Günlük gayretimiz karakterlerimizi geliştirir; birbirimize gösterdiğimiz özen ortak yuvamızı güzelleştirir.</p>
      </div>
      {mode === 'login' && <LoginForm />}
      {mode === 'setup' && <SignupForm kind="setup" secret={parsed.secret ?? ''} onCancel={() => { window.location.hash = ''; setMode('login') }} />}
      {mode === 'invite' && <SignupForm kind="invite" secret={parsed.secret ?? ''} onCancel={() => { window.location.hash = ''; setMode('login') }} />}
      <p className="text-[13px] text-ink-2 text-center">Uygulama kendi beyanlarımızı kaydeder. Biletlerimizin karşılığını aramızda belirleriz.</p>
    </div>
  )
}

function LoginForm() {
  const [username, setUsername] = useState(() => { try { return localStorage.getItem('bb:lastUsername') ?? '' } catch { return '' } })
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('bb:lastUsername') !== null } catch { return false } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await signIn(username, password)
      try { if (remember) localStorage.setItem('bb:lastUsername', username.trim().toLowerCase()); else localStorage.removeItem('bb:lastUsername') } catch { /* yok say */ }
    } catch (err) {
      setError(errorText(err))
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" aria-label="Giriş">
        <Field label="Kullanıcı adı">
          <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)} required />
        </Field>
        <Field label="Şifre">
          <div className="flex gap-2">
            <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="btn btn-soft px-3" aria-pressed={show} onClick={() => setShow(s => !s)}>{show ? 'Gizle' : 'Göster'}</button>
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" className="w-5 h-5" checked={remember} onChange={e => setRemember(e.target.checked)} />
          Kullanıcı adımı bu cihazda hatırla
        </label>
        {error && <p className="text-warn" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</Button>
        <p className="text-[13px] text-ink-2">Şifreni unuttuysan kurtarma kodu akışı bir sonraki sürümde eklenecek; şimdilik kurulumu yapan kişi sunucu üzerinden sıfırlayabilir.</p>
      </form>
    </Card>
  )
}

function SignupForm({ kind, secret, onCancel }: { kind: 'setup' | 'invite'; secret: string; onCancel: () => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uErr = username && !USERNAME_RE.test(username) ? 'Kullanıcı adı 3–24 karakter; yalnızca küçük harf, rakam ve alt çizgi.' : null
  const pErr = password && (password.length < 15 || password.length > 128) ? 'Şifre 15–128 karakter olmalı. Boşluk kullanabilirsin.' : null
  const p2Err = password2 && password2 !== password ? 'Şifreler aynı değil.' : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (uErr || pErr || p2Err || !secret) return
    setBusy(true); setError(null)
    try {
      await signUp(username, password, displayName || username, kind === 'setup' ? { setupKey: secret } : { inviteToken: secret })
      window.location.hash = ''
    } catch (err) {
      setError(errorText(err))
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <h2 className="text-lg font-bold mb-1">{kind === 'setup' ? 'İlk hesabı oluştur' : 'Davetle hesap oluştur'}</h2>
      <p className="text-ink-2 text-[15px] mb-4">
        {kind === 'setup' ? 'Bu bağlantı tek kullanımlıktır ve çift alanını oluşturur.' : 'Bu davet 24 saat geçerlidir ve yalnızca bir kez kullanılabilir.'} Kullanıcı adı ve şifreni yalnızca sen bilirsin.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Kullanıcı adı" error={uErr} hint="Küçük harf, rakam ve alt çizgi; 3–24 karakter.">
          <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required />
        </Field>
        <Field label="Görünen ad" hint="Uygulamada görünecek ad. Sonradan değiştirilebilir.">
          <input className="input" maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Şifre" error={pErr} hint="En az 15 karakter. Uzun bir cümle iyi bir şifredir.">
          <div className="flex gap-2">
            <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="btn btn-soft px-3" aria-pressed={show} onClick={() => setShow(s => !s)}>{show ? 'Gizle' : 'Göster'}</button>
          </div>
        </Field>
        <Field label="Şifre (tekrar)" error={p2Err}>
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} required />
        </Field>
        {error && <p className="text-warn" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !!uErr || !!pErr || !!p2Err}>{busy ? 'Oluşturuluyor…' : 'Hesabı oluştur'}</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>Zaten hesabım var</Button>
      </form>
    </Card>
  )
}
