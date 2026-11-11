// Yalnızca geliştirmede (#/demo): yeni ekranları sahte veriyle çizer. Sunucuya yazmaz; supabase.rpc burada taklit edilir.
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Game, Hero, Partner, Pet } from '../lib/game'
import { GameContext, ToastHost, type GameCtx } from '../game/ui'
import { FxLayer } from '../game/fx'
import { Adventure } from './Adventure'
import { WorldMap } from './WorldMap'
import { Book } from './Book'
import { GardenSheet } from './Garden'
import { PetSheet } from './PetSheet'
import { CapsuleOpen, Morning } from './Moments'
import { EventOverlay } from '../game/Events'

const now = new Date()
const iso = (h = 0) => new Date(now.getTime() + h * 3600000).toISOString()
const today = now.toISOString().slice(0, 10)
const hero = (id: string, name: string, cls: Hero['class'], gender: string): Hero => ({
  id, name, username: name.toLowerCase(), class: cls, look: { gender } as Hero['look'], difficulty: 3, pendingDifficulty: null,
  level: 7, xp: 1200, levelStart: 1100, levelEnd: 1460, hp: 80, maxHp: 120, gold: 640, stats: {}, equipped: { weapon: 1, armor: 1 },
  streak: 5, bestStreak: 9, sound: false, shards: 1, lastSeen: iso(), skillReadyAt: null, remindHour: null, pushSubs: 0, special: false,
})
const ME = hero('me', 'Deneme A', 'WARRIOR', 'M')
const PARTNER: Partner = { ...hero('pa', 'Deneme B', 'MAGE', 'F'), todayDone: 3, todayTotal: 8, todayCodes: [] }
const PET: Pet = { id: 'p1', species: 'fox', color: 'c0', name: 'Kıvılcım', love: 520, stage: 2, outfit: { NECK: 'scarf' } as Pet['outfit'], createdAt: iso(-200), patMe: false, patPartner: true,
  away: { id: 'e1', region: 1, endsAt: iso(-1), startedAt: iso(-5), by: 'pa' }, tripsToday: 1 }
const PET2: Pet = { id: 'p2', species: 'owl', color: 'c1', name: 'Bilge', love: 80, stage: 0, outfit: {}, createdAt: iso(-100), patMe: true, patPartner: false, away: null, tripsToday: 0 }

const GAME = {
  serverTime: iso(), today, weekStart: today, weekEnd: iso(96),
  config: { difficulties: [], cheerXP: 10, cheersPerDay: 3, healAmount: 20, bossGold: 100, comboGold: 20, comboDamage: 50, shardsPerTicket: 4, duelRewardsPerDay: 5 },
  hero: ME, special: { on: false, since: null, hide: [], extra: [], days: 0 }, day: { izin: false, difficulty: 3, event: null },
  quests: [{ id: 'q1', code: 'FAJR', kind: 'DAILY', category: 'SPIRIT', icon: 'fajr', title: 'Sabah namazı', xp: 20, gold: 10, damage: 30, done: false }],
  partner: PARTNER, couple: { id: 'c', hasPartner: true, pendingInvite: null, status: 'ACTIVE' },
  boss: { id: 'b', key: 'golem_moss', name: 'Yosun Golemi', hp: 900, maxHp: 2520, defeated: false, weak: 'BODY', hits: [], byUser: { me: 800, pa: 820 } },
  weekXp: { me: 114, partner: 142 }, cheersLeft: 2, healUsedToday: false, events: [], inventory: {}, achievements: [], tickets: { available: 0, requested: 0, used: 0 },
  incomingRequests: 0, chains: {}, play: { duels: 0, together: 0, word: false, fork: true, explore: true, capsule: 'cap1' },
  pets: [PET, PET2], petBonus: 4, world: { progress: 6, region: 1, perRegion: 4 },
  fork: { week: today, pair: 0, option: { a: { key: 'bridge', fx: 'XP' }, b: { key: 'cave', fx: 'GOLD' } }, mine: null, partnerVoted: true, partnerVote: null, result: null, agreed: null, decidedAt: null },
  petMail: [{ id: 'm1', pet: 'p2', kind: 'NOTE', text: 'Bugün seni çok düşündüm', at: iso(-2) }, { id: 'm2', pet: 'p2', kind: 'HEART', text: null, at: iso(-1) }],
  lettersToday: 1,
  yesterday: { me: { done: 7, total: 8, allDone: false, izin: false, hpLost: 3 }, partner: { done: 8, total: 8, allDone: true, izin: false }, combo: false },
  garden: { plants: true, ready: 1, waterMe: false, waterPartner: true },
} as unknown as Game

/** RPC taklidi: yalnızca bu sayfada */
const FAKE: Record<string, unknown> = {
  get_world: { progress: 6, region: 1, perRegion: 4, regions: 9, defeated: ['slime_green', 'golem_stone', 'dragon_green', 'slime_purple', 'golem_ice', 'dragon_red'].map((b, i) => ({ boss: b, name: b, at: iso(-24 * 7 * (6 - i)) })), cards: 3 },
  get_collection: { cards: { meadow_1: 2, meadow_4: 1, forest_2: 1 }, flowers: { daisy: 3, lavender: 1 }, pets: [{ species: 'fox', color: 'c0' }, { species: 'owl', color: 'c1' }], wardrobe: ['scarf', 'bow'], region: 1,
    bestiary: [{ key: 'slime_green', name: 'Yeşil Balçık', weak: 'BODY', faced: 2, defeated: 2, fastest: 3, next: null }, { key: 'dragon_red', name: 'Kızıl Ejder', weak: null, faced: 0, defeated: 0, fastest: null, next: null }] },
  get_memories: { memories: [
    { id: '1', key: 'region:1', kind: 'REGION', data: { region: 1 }, at: iso(-30) },
    { id: '2', key: 'explore:1', kind: 'FIRST_EXPLORE', data: { name: 'Kıvılcım', region: 0 }, at: iso(-60) },
    { id: '3', key: 'pet:p1', kind: 'PET_NEW', data: { name: 'Kıvılcım', species: 'fox' }, at: iso(-200) },
    { id: '4', key: 'start', kind: 'START', data: {}, at: iso(-400) }],
    capsules: [{ id: 'cap1', author: 'pa', openAt: iso(-1), createdAt: iso(-2000), open: true, read: false, text: 'Üç ay önce bugünü hayal etmiştik. İyi ki birlikteyiz.' },
      { id: 'cap2', author: 'me', openAt: iso(2000), createdAt: iso(-10), open: false, read: false, text: null }] },
  get_garden: { slots: 4, plots: [{ slot: 0, seed: 'daisy', growth: 1, need: 3, ready: false, grewToday: false, plantedAt: iso(-30) }, { slot: 1, seed: 'tulip', growth: 4, need: 4, ready: true, grewToday: true, plantedAt: iso(-90) },
    { slot: 2, seed: 'lavender', growth: 0, need: 4, ready: false, grewToday: false, plantedAt: iso(-1) }], seeds: { daisy: 1, rose: 2 }, flowers: { daisy: 3 }, waterMe: false, waterPartner: true },
  get_pets: { pets: [PET, PET2], wardrobe: ['scarf', 'bow'], pending: null, bonus: 4, slots: 2, priceMult: 2,
    cfg: { species: { cat: { name: "Kedi", price: 400 }, dog: { name: "Köpek", price: 400 }, bunny: { name: "Tavşan", price: 500 }, fox: { name: "Tilki", price: 700 }, owl: { name: "Baykuş", price: 900 }, dragon: { name: "Ejder", price: 2400 }, phoenix: { name: "Anka", price: 4000 } }, stages: [0, 120, 450, 1100, 2500], bonus: [1, 2, 3, 4, 6], cap: 15, baseSlots: 2, maxSlots: 4, priceMult: [1, 2, 3.5, 6], patLove: 3, patBoth: 2 }, log: [{ amount: 6, reason: 'EXPLORE', pet: 'p1', at: iso(-1) }] },
}

let installed = false
function install() {
  if (installed) return
  installed = true
  ;(supabase as unknown as { rpc: (fn: string) => Promise<unknown> }).rpc = async (fn: string) => {
    if (fn in FAKE) return { data: FAKE[fn], error: null }
    if (fn === 'pet_explore_claim') return { data: { ...(FAKE.get_pets as object), loot: { gold: 31, love: 6, card: 'forest_4', newCard: true, seed: 'lavender', story: 2, region: 1, pet: 'p1', name: 'Kıvılcım', species: 'fox', color: 'c0', outfit: {}, stage: 2 } }, error: null }
    return { data: null, error: { message: 'DEMO' } }
  }
}

export function DemoPreview() {
  install()
  const [game, setGame] = useState<Game>(GAME)
  const [view, setView] = useState<string>(() => window.location.hash.split('/')[2] ?? 'adventure')
  const ctx = useMemo<GameCtx>(() => ({ game, setGame, refresh: async () => {}, run: async () => null, go: () => {}, openSettings: () => {}, openPets: () => setView('pets'),
    openMap: () => setView('map'), openBook: () => setView('book'), openGarden: () => setView('garden') }), [game])
  return (
    <GameContext.Provider value={ctx}>
      <div className="mx-auto max-w-[520px] min-h-dvh p-3">
        <div className="flex flex-wrap gap-1 mb-2">
          {['adventure', 'map', 'book', 'garden', 'pets', 'morning', 'capsule'].map(v => <button key={v} className="pbtn pbtn-dark !min-h-[32px] !px-2 text-[13px]" onClick={() => setView(v)}>{v}</button>)}
        </div>
        <Adventure />
        {view === 'map' && <WorldMap onClose={() => setView('adventure')} />}
        {view === 'book' && <Book onClose={() => setView('adventure')} />}
        {view === 'garden' && <GardenSheet onClose={() => setView('adventure')} />}
        {view === 'pets' && <PetSheet onClose={() => setView('adventure')} />}
        {view === 'morning' && <Morning onDone={() => setView('adventure')} />}
        {view === 'capsule' && <CapsuleOpen id="cap1" onDone={() => setView('adventure')} />}
        <EventOverlay />
      </div>
      <FxLayer />
      <ToastHost />
    </GameContext.Provider>
  )
}
