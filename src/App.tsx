import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { supabase } from './lib/supabase'
import { getGame, signOut, type Game } from './lib/game'
import { Auth } from './screens/Auth'
import { CreateHero } from './screens/CreateHero'
import { Adventure } from './screens/Adventure'
import { Arena } from './screens/Arena'
import { HeroScreen } from './screens/HeroScreen'
import { Treasure } from './screens/Treasure'
import { SettingsSheet } from './screens/SettingsSheet'
import { EventOverlay } from './game/Events'
import { FxLayer } from './game/fx'
import { Icon, Portrait } from './game/Sprite'
import { setSoundEnabled, sfx } from './game/sfx'
import { Bar, GameContext, Spinner, ToastHost, toastError, type GameCtx, type TabId } from './game/ui'

export const APP_NAME = 'Birlikte Büyüyoruz'

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
  const hash = useHash()
  useRegisterSW({ immediate: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <div id="game-root" className="min-h-dvh">
      <div className="mx-auto max-w-[520px] min-h-dvh relative">
        {session === undefined ? <Spinner /> : !session ? <Auth hash={hash} /> : <GameRoot key={session.user.id} />}
      </div>
      <FxLayer />
      <ToastHost />
    </div>
  )
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'quest', label: 'Macera', icon: 'sword' },
  { id: 'arena', label: 'Arena', icon: 'swords' },
  { id: 'hero', label: 'Kahraman', icon: 'helmet' },
  { id: 'loot', label: 'Hazine', icon: 'chest' },
]

function GameRoot() {
  const [game, setGameState] = useState<Game | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('quest')
  const [settings, setSettings] = useState(false)
  const busy = useRef(0)

  const setGame = useCallback((g: Game) => setGameState(g), [])
  const refresh = useCallback(async () => {
    if (busy.current > 0) return
    try { setLoadError(null); setGameState(await getGame()) } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      if (m === 'UNAUTHENTICATED') { await signOut(); return }
      setLoadError(m)
    }
  }, [])
  const run = useCallback(async (fn: () => Promise<Game>) => {
    busy.current++
    try { const g = await fn(); setGameState(g); return g } catch (e) { toastError(e); return null } finally { busy.current-- }
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const v = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', v)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [refresh])

  useEffect(() => { setSoundEnabled(game?.hero?.sound ?? true) }, [game?.hero?.sound])

  const go = useCallback((t: TabId) => { sfx.tab(); setTab(t); window.scrollTo({ top: 0 }) }, [])
  const ctx = useMemo<GameCtx | null>(() => game ? { game, setGame, refresh, run, go, openSettings: () => setSettings(true) } : null, [game, setGame, refresh, run, go])

  if (!game || !ctx) return loadError ? (
    <div className="p-6 text-center space-y-4 pt-24">
      <Icon name="heart" size={56} />
      <p className="font-pixel text-lg">Bağlantı kurulamadı</p>
      <button className="pbtn pbtn-gold w-full" onClick={() => void refresh()}>Tekrar dene</button>
      <button className="pbtn pbtn-dark w-full" onClick={() => void signOut()}>Çıkış</button>
    </div>
  ) : <Spinner />

  if (!game.hero) return <CreateHero onDone={setGame} />

  const badge: Partial<Record<TabId, boolean>> = {
    loot: game.incomingRequests > 0,
    arena: game.couple.hasPartner && game.cheersLeft > 0,
  }

  return (
    <GameContext.Provider value={ctx}>
      <Hud />
      <main className="px-3 pt-2 pb-[calc(92px+env(safe-area-inset-bottom))]">
        {tab === 'quest' && <Adventure />}
        {tab === 'arena' && <Arena />}
        {tab === 'hero' && <HeroScreen />}
        {tab === 'loot' && <Treasure />}
      </main>
      <nav aria-label="Ana menü" className="fixed bottom-0 left-0 right-0 z-40">
        <div className="mx-auto max-w-[520px] px-2 pb-[calc(6px+env(safe-area-inset-bottom))]">
          <ul className="panel grid grid-cols-4 p-1 gap-1">
            {TABS.map(t => (
              <li key={t.id}>
                <button
                  className={`relative w-full h-[62px] rounded-[4px] flex flex-col items-center justify-center gap-0.5 font-pixel text-[13px] transition-colors ${tab === t.id ? 'bg-panel2 text-gold' : 'text-ink2'}`}
                  style={tab === t.id ? { boxShadow: 'inset 0 -3px 0 #ffcc3a, inset 0 2px 0 rgba(255,255,255,.08)' } : undefined}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => go(t.id)}
                >
                  <Icon name={t.icon} size={30} className={tab === t.id ? 'pop' : 'opacity-80'} />
                  {t.label}
                  {badge[t.id] && <span className="absolute top-1.5 right-[22%] w-3 h-3 rounded-full bg-hp border-2 border-edge blinkdot" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <EventOverlay />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </GameContext.Provider>
  )
}

function Hud() {
  const ctx = useGameSafe()
  if (!ctx) return null
  const h = ctx.game.hero!
  const xpIn = h.xp - h.levelStart, xpNeed = h.levelEnd - h.levelStart
  const low = h.hp < h.maxHp * 0.3
  return (
    <header className="sticky top-0 z-30 px-3 pt-[calc(6px+env(safe-area-inset-top))] pb-1.5 bg-bg/90 backdrop-blur-sm">
      <div className="panel flex items-center gap-2 p-1.5">
        <button className="relative shrink-0 panel-dark p-0.5" onClick={() => ctx.go('hero')} aria-label="Kahramanım">
          <Portrait cls={h.class} look={h.look} gear={h.equipped} size={46} />
          <span id="hud-level" className="absolute -bottom-2 -right-2 font-pixel text-[12px] leading-none px-1.5 py-1 rounded-[3px] border-2 border-edge bg-magic text-white">{h.level}</span>
        </button>
        <div className="flex-1 min-w-0 space-y-1 pl-1">
          <div className="flex items-center gap-1">
            <Icon name="heart" size={16} className={low ? 'blinkdot' : ''} />
            <Bar id="hud-hp" value={h.hp} max={h.maxHp} color="#ff4d6d" label={`${h.hp}/${h.maxHp}`} className="flex-1" h={18} />
          </div>
          <div className="flex items-center gap-1">
            <Icon name="star" size={16} />
            <Bar id="hud-xp" value={xpIn} max={xpNeed} color="#4cc9f0" label={`${xpIn}/${xpNeed}`} className="flex-1" h={18} />
          </div>
        </div>
        <div id="hud-gold" className="panel-dark flex items-center gap-1 px-2 h-[40px] font-pixel text-gold text-lg shrink-0">
          <Icon name="coin" size={20} />{h.gold}
        </div>
        <button className="pbtn pbtn-dark !min-h-[40px] !px-2 shrink-0" onClick={() => { sfx.click(); ctx.openSettings() }} aria-label="Ayarlar">
          <Icon name="gear" size={22} />
        </button>
      </div>
    </header>
  )
}

function useGameSafe() { return useContext(GameContext) }
