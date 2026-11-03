import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { supabase } from './lib/supabase'
import { getMe, type Me } from './lib/api'
import { Auth } from './screens/Auth'
import { Onboarding } from './screens/Onboarding'
import { Today } from './screens/Today'
import { Us } from './screens/Us'
import { Character } from './screens/Character'
import { Rewards } from './screens/Rewards'
import { Settings } from './screens/Settings'
import { Button, Spinner, ToastHost } from './components/ui'

export const APP_NAME = 'Birlikte Büyüyoruz'
export type Tab = 'today' | 'us' | 'me' | 'rewards'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'today', label: 'Bugün', icon: '☀️' },
  { id: 'us', label: 'Biz', icon: '🏡' },
  { id: 'me', label: 'Karakterim', icon: '🧑‍🎨' },
  { id: 'rewards', label: 'Ödüller', icon: '🎁' },
]

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hash = useHash()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reloadMe = useCallback(async () => {
    try {
      setMeError(null)
      setMe(await getMe())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'UNAUTHENTICATED') { await supabase.auth.signOut(); return }
      setMeError(msg)
    }
  }, [])

  useEffect(() => {
    if (session) void reloadMe()
    else { setMe(null); setSettingsOpen(false); setTab('today') }
  }, [session, reloadMe])

  if (session === undefined) return <Shell><Spinner /></Shell>

  // Davet ve kurulum bağlantıları oturum yokken çalışır
  if (!session) return <Shell><Auth hash={hash} /></Shell>

  if (!me) {
    return (
      <Shell>
        {meError ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-warn" role="alert">Hesap bilgisi yüklenemedi: {meError}</p>
            <Button onClick={() => void reloadMe()}>Tekrar dene</Button>
            <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>Çıkış yap</Button>
          </div>
        ) : <Spinner />}
      </Shell>
    )
  }

  if (!me.profile.onboarded) return <Shell><Onboarding me={me} onDone={reloadMe} /></Shell>

  return (
    <Shell>
      <header className="flex items-center justify-between px-4 pt-[calc(8px+env(safe-area-inset-top))] pb-2">
        <h1 className="text-lg font-bold">{APP_NAME}</h1>
        <button className="tap relative rounded-full bg-soft text-primary font-bold" aria-label="Ayarlar ve profil" onClick={() => setSettingsOpen(true)}>
          {me.displayName.slice(0, 1).toUpperCase()}
          {(me.attention?.rules ?? 0) > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-warn" aria-label="Bekleyen kural önerisi" />}
        </button>
      </header>
      {needRefresh && (
        <div className="mx-4 mb-2 card p-3 flex items-center justify-between gap-2 text-[15px]">
          <span>Güncelleme hazır.</span>
          <Button variant="soft" className="min-h-[40px]" onClick={() => void updateServiceWorker(true)}>Yenile</Button>
        </div>
      )}
      <main className="px-4 pb-[calc(84px+env(safe-area-inset-bottom))]">
        {tab === 'today' && <Today me={me} onTotalsChange={reloadMe} />}
        {tab === 'us' && <Us me={me} onChange={reloadMe} />}
        {tab === 'me' && <Character me={me} onChange={reloadMe} />}
        {tab === 'rewards' && <Rewards me={me} onChange={reloadMe} />}
      </main>
      <nav aria-label="Ana menü" className="fixed bottom-0 left-0 right-0 bg-card border-t border-line">
        <ul className="mx-auto max-w-[520px] grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {TABS.map(t => {
            const a = me.attention ?? { redemptions: 0, reversals: 0, rules: 0, activities: 0 }
            const pending = t.id === 'rewards' ? a.redemptions + a.reversals : t.id === 'us' ? a.activities : 0
            return (
              <li key={t.id}>
                <button
                  className={`relative w-full min-h-[56px] flex flex-col items-center justify-center text-[13px] font-semibold ${tab === t.id ? 'text-primary' : 'text-ink-2'}`}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => setTab(t.id)}
                >
                  <span aria-hidden="true" className="text-xl leading-none mb-0.5">{t.icon}</span>
                  {t.label}
                  {pending > 0 && <span className="absolute top-2 right-[22%] w-2.5 h-2.5 rounded-full bg-warn" aria-label={`${pending} bekleyen`} />}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} me={me} onChange={reloadMe} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-[520px] min-h-dvh">{children}</div>
      <ToastHost />
    </div>
  )
}
