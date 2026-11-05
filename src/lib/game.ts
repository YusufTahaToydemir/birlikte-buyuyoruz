// Oyun sunucusu (Supabase RPC) ile konuşan ince katman. Tüm kurallar sunucuda.
import { supabase, usernameToEmail } from './supabase'
import type { Gear, HeroClass, Look } from '../game/art/hero'

export type Category = 'BODY' | 'MIND' | 'SPIRIT' | 'ORDER'
export interface Hero {
  id: string; name: string; username: string; class: HeroClass; look: Look
  difficulty: number; pendingDifficulty: number | null
  level: number; xp: number; levelStart: number; levelEnd: number
  hp: number; maxHp: number; gold: number
  stats: Partial<Record<Category, number>>
  equipped: Gear & { weapon?: number; armor?: number }
  streak: number; bestStreak: number; sound: boolean
  shards: number; lastSeen: string | null
  skillReadyAt: string | null
  remindHour: number | null; pushSubs: number
  special: boolean
}
export interface Partner extends Hero { todayDone: number; todayTotal: number; todayCodes: string[] }
export type DayEvent = 'SPIRIT_SURGE' | 'MIND_DAY' | 'BODY_DAY' | 'ORDER_DAY' | 'GOLD_RAIN' | 'TWIN' | 'BOSS_RAGE' | 'COMBO_DAY'
export interface Quest { id: string; code: string; kind: 'DAILY' | 'SIDE'; category: Category; icon: string; title: string; xp: number; gold: number; damage: number; done: boolean }
export interface Difficulty { n: number; name: string; mult: number; damage: number; sides: number }
export interface GameEvent { id: string; kind: string; data: Record<string, unknown>; from: string | null; at: string }
export interface Boss { id: string; key: string; name: string; hp: number; maxHp: number; defeated: boolean; weak: Category | null; hits: Array<{ user: string | null; kind: string; damage: number; at: string }>; byUser: Record<string, number> }
export interface Game {
  serverTime: string; today: string; weekStart: string; weekEnd: string
  config: { difficulties: Difficulty[]; cheerXP: number; cheersPerDay: number; healAmount: number; bossGold: number; comboGold: number; comboDamage: number; shardsPerTicket: number; duelRewardsPerDay: number; vapidPublic?: string }
  hero: Hero | null
  special: { on: boolean; since: string | null; hide: string[]; extra: string[]; days: number }
  day: { izin: boolean; difficulty: number; event: DayEvent | null } | null
  quests: Quest[]
  partner: Partner | null
  couple: { id: string; hasPartner: boolean; pendingInvite: { expiresAt: string } | null; status: string }
  boss: Boss | null
  weekXp: { me: number; partner: number | null }
  cheersLeft: number; healUsedToday: boolean
  events: GameEvent[]
  inventory: Record<string, number>
  achievements: string[]
  tickets: { available: number; requested: number; used: number }
  incomingRequests: number
  chains: Record<string, { chain: number; best: number }>
  play: { duels: number; together: number; word: boolean }
}
export interface Delta { xp: number; gold: number; damage: number; defeated?: boolean }
export type TicketTier = 'GREEN' | 'ORANGE' | 'RED'
export interface Ticket { id: string; week: string | null; status: 'AVAILABLE' | 'REQUESTED' | 'USED' | 'ARCHIVED'; source: string | null; tier: TicketTier; createdAt: string }
export interface Redemption { id: string; ticketId: string; requestedBy: string; partnerId: string; status: string; expiresAt: string; resolvedAt: string | null; reversalRequestedBy: string | null; createdAt: string; note: string | null; tier: TicketTier | null }
/** Bilet kademeleri: kullanıcının kendi sistemi (kırmızı en nadir) */
export const TICKET_TIERS: Record<TicketTier, { name: string; color: string; rank: number }> = {
  GREEN: { name: 'Yeşil', color: '#5bd17c', rank: 0 },
  ORANGE: { name: 'Turuncu', color: '#ff8a3d', rank: 1 },
  RED: { name: 'Kırmızı', color: '#ff4d6d', rank: 2 },
}
export interface CalendarDay { d: string; allDone: boolean; izin: boolean; closed: boolean; hpLost: number; done: number; total: number; combo: boolean }
export interface Calendar { month: string; today: string; me: CalendarDay[]; partner: CalendarDay[]; firstDay: string | null; totals: { fullDays: number; combos: number } }
export interface DayQuest { code: string; kind: 'DAILY' | 'SIDE'; category: Category; icon: string; title: string; done: boolean }
export interface DayDetail { date: string; me: DayQuest[]; partner: DayQuest[]; meDay: { izin: boolean; allDone: boolean; hpLost: number } | null; partnerDay: { izin: boolean; allDone: boolean; hpLost: number } | null }

export class ApiError extends Error {
  code: string
  constructor(code: string) { super(code); this.code = code }
}

const ERROR_TEXT: Record<string, string> = {
  UNAUTHENTICATED: 'Oturum kapandı. Tekrar giriş yap.',
  NOT_FOUND: 'Bulunamadı.',
  DAY_LOCKED: 'Bu gün kapandı.',
  LEVEL_LOCKED: 'Seviyen yetmiyor.',
  ALREADY_OWNED: 'Zaten sende var.',
  INSUFFICIENT_GOLD: 'Altının yetmiyor.',
  NOT_OWNED: 'Bu eşya sende yok.',
  NO_PARTNER: 'Önce partnerini davet et.',
  NO_POTION: 'Can iksirin yok.',
  DAILY_LIMIT: 'Bugünlük hakkın bitti.',
  INVALID_STATE: 'Bu işlem şu an yapılamaz.',
  REVERSAL_WINDOW_CLOSED: 'Geri alma süresi doldu.',
  COUPLE_FULL: 'Takım zaten dolu.',
  COUPLE_DISCONNECTED: 'Takım dağıldı.',
  INVALID_SETUP_KEY: 'Kurulum anahtarı geçersiz veya kullanılmış.',
  INVALID_INVITE: 'Davet geçersiz veya süresi dolmuş.',
  USERNAME_TAKEN: 'Bu kullanıcı adı alınmış.',
  INVALID_RECOVERY: 'Kullanıcı adı veya kurtarma kodu hatalı.',
  RATE_LIMITED: 'Çok fazla deneme. 15 dk sonra dene.',
  PASSWORD_LENGTH: 'Şifre 6–128 karakter olmalı.',
  NETWORK: 'Bağlantı yok. İnternetini kontrol et.',
  TOO_MANY_DUELS: 'En fazla 3 açık düello olabilir.',
  DUEL_EXPIRED: 'Bu düellonun süresi doldu.',
  INVALID_WORD: '5 harfli bir kelime yaz.',
  NO_GUESSES_LEFT: 'Tahmin hakkın bitti, sıra eşinde.',
  MAX_HELD: 'En fazla 2 tane taşıyabilirsin.',
  SKILL_COOLDOWN: 'Yeteneğin henüz dolmadı.',
  SKILL_NOTHING: 'Bugün yapılacak görev kalmamış.',
  MAX_LEVEL: 'Bu parça son seviyesinde.',
  NOT_ALLOWED: 'Bu özellik bu karakter için kapalı.',
  UNSUPPORTED: 'Bu cihaz bildirimleri desteklemiyor. iPhone’da önce ana ekrana ekle.',
  DENIED: 'Bildirim izni verilmedi. Telefon ayarlarından açabilirsin.',
  PUSH_SERVICE: 'Google bildirim servisine ulaşılamadı. Wi‑Fi’ı veya mobil veriyi değiştirip tekrar dene; olmazsa Chrome’u kapatıp aç.',
}
export function errorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : String(e)
  if (ERROR_TEXT[code]) return ERROR_TEXT[code]
  if (/fetch|network|TypeError/i.test(code)) return ERROR_TEXT.NETWORK
  return code
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {})
  if (error) throw new ApiError(error.message || 'UNKNOWN')
  return data as T
}

// ---------- Kimlik ----------
export async function signIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
  if (error) throw new ApiError(error.message.includes('rate') ? 'Çok fazla deneme. Biraz bekle.' : 'Kullanıcı adı veya şifre hatalı.')
}
export async function signUp(username: string, password: string, displayName: string, secret: { setupKey?: string; inviteToken?: string }) {
  const { error } = await supabase.auth.signUp({
    email: usernameToEmail(username), password,
    options: { data: { username: username.trim().toLowerCase(), display_name: displayName, setup_key: secret.setupKey ?? '', invite_token: secret.inviteToken ?? '' } },
  })
  if (error) {
    const m = error.message
    if (m.includes('Database error')) throw new ApiError(secret.setupKey ? 'INVALID_SETUP_KEY' : 'INVALID_INVITE')
    if (m.toLowerCase().includes('password')) throw new ApiError('PASSWORD_LENGTH')
    if (m.toLowerCase().includes('already')) throw new ApiError('USERNAME_TAKEN')
    throw new ApiError(m)
  }
}
export async function signOut() {
  await supabase.auth.signOut()
  try { const keep = localStorage.getItem('bb:lastUsername'); localStorage.clear(); if (keep) localStorage.setItem('bb:lastUsername', keep); sessionStorage.clear() } catch { /* yok say */ }
}
export async function recoverWithCode(username: string, code: string, newPassword: string) {
  const r = await rpc<{ ok: boolean; error?: string }>('recover_with_code', { p_username: username, p_code: code, p_new_password: newPassword })
  if (!r.ok) throw new ApiError(r.error ?? 'INVALID_RECOVERY')
}

// ---------- Oyun ----------
export const getGame = () => rpc<Game>('get_game')
export const createHero = (name: string, cls: HeroClass, look: Look, difficulty: number) =>
  rpc<Game>('create_hero', { p_name: name, p_class: cls, p_look: look, p_difficulty: difficulty })
export const updateHero = (p: { name?: string; cls?: HeroClass; look?: Look; sound?: boolean }) =>
  rpc<Hero>('update_hero', { p_name: p.name ?? null, p_class: p.cls ?? null, p_look: p.look ?? null, p_sound: p.sound ?? null })
export const completeQuest = (id: string, done: boolean) => rpc<{ delta: Delta; game: Game }>('complete_quest', { p_quest: id, p_done: done })
export const setIzin = (izin: boolean) => rpc<Game>('set_izin', { p_izin: izin })
export const setDifficulty = (n: number) => rpc<Game>('set_difficulty', { p_n: n })
export const buyItem = (key: string) => rpc<Game>('buy_item', { p_key: key })
export const equipItem = (slot: Slot, value: string | number | null) => rpc<Game>('equip_item', { p_slot: slot, p_value: value === null ? '' : String(value) })
export const drinkPotion = (key: string) => rpc<Game>('use_potion', { p_key: key })
export const socialAction = (kind: 'CHEER' | 'HEAL' | 'GIFT', amount = 0) => rpc<Game>('social_action', { p_kind: kind, p_amount: amount })
export const markEventsSeen = (ids: string[]) => rpc<void>('mark_events_seen', { p_ids: ids })

// ---------- Biletler ----------
export const getTickets = () => rpc<{ serverTime: string; tickets: Ticket[]; redemptions: Redemption[] }>('get_tickets')
export const requestTicket = (ticketId: string, note = '') => rpc<Redemption>('request_ticket', { p_ticket_id: ticketId, p_operation_id: crypto.randomUUID(), p_note: note || null })
export const getCalendar = (month: string) => rpc<Calendar>('get_calendar', { p_month: month })
export const useSkill = () => rpc<Game>('use_skill')
export interface BestiaryEntry { key: string; name: string; weak: Category | null; faced: number; defeated: number; fastest: number | null; next: string | null }
export const getBestiary = () => rpc<BestiaryEntry[]>('get_bestiary')

/** Stat bonusu (%): √stat, en çok 20. Sunucudaki bb_stat_bonus ile aynı. */
export const statBonus = (stat: number) => Math.min(20, Math.floor(Math.sqrt(Math.max(0, stat))))
export const STAT_EFFECT: Record<Category, { what: string; icon: string; unit: (b: number) => string }> = {
  BODY: { what: 'Can', icon: 'heart', unit: b => `+${2 * b} ❤` },
  MIND: { what: 'XP', icon: 'star', unit: b => `+%${b} XP` },
  SPIRIT: { what: 'Hasar', icon: 'sword', unit: b => `+%${b} hasar` },
  ORDER: { what: 'Altın', icon: 'coin', unit: b => `+%${b} altın` },
}

/** Sınıf yetenekleri (haftada 1) */
export const SKILLS: Record<HeroClass, { key: string; name: string; icon: string; desc: string; color: string }> = {
  WARRIOR: { key: 'WAR_CRY', name: 'Savaş Çığlığı', icon: 'swords', desc: 'Bugün kalan görevler canavara 2× hasar vurur', color: '#ff6b5a' },
  MAGE: { key: 'GREAT_SPELL', name: 'Büyük Büyü', icon: 'rune', desc: 'Bugün kalan görevler 2× XP verir', color: '#b98aff' },
  HEALER: { key: 'GREAT_HEAL', name: 'Büyük Şifa', icon: 'heart', desc: 'İkinizin de canı tamamen dolar', color: '#5bd17c' },
  RANGER: { key: 'SCOUT', name: 'Keşif', icon: 'target', desc: 'Bugünün sürpriz görevleri yenilenir, bir fazlası gelir', color: '#ffcc3a' },
}

/** Günün olayları: çift için ortak, sabah belli olur */
export const DAY_EVENTS: Record<DayEvent, { name: string; icon: string; rule: string; color: string; cat?: Category; kind?: 'SIDE' }> = {
  SPIRIT_SURGE: { name: 'Ruh Dalgası', icon: 'moon', rule: 'Ruh görevleri canavara 2× hasar', color: '#ffd75a', cat: 'SPIRIT' },
  MIND_DAY: { name: 'Bilgelik Günü', icon: 'book', rule: 'Zekâ görevleri 2× XP', color: '#6aa8ff', cat: 'MIND' },
  BODY_DAY: { name: 'Güç Günü', icon: 'muscle', rule: 'Güç görevleri 2× XP', color: '#ff6b5a', cat: 'BODY' },
  ORDER_DAY: { name: 'Düzen Günü', icon: 'broom', rule: 'Düzen görevleri 2× altın', color: '#5bd17c', cat: 'ORDER' },
  GOLD_RAIN: { name: 'Altın Yağmuru', icon: 'coin', rule: 'Sürpriz görevler 3× altın', color: '#ffcc3a', kind: 'SIDE' },
  TWIN: { name: 'Çift Gün', icon: 'heart', rule: 'İkiniz de aynı görevi yaparsanız +5 altın', color: '#ff8ab5' },
  BOSS_RAGE: { name: 'Canavar Öfkeli', icon: 'skull', rule: 'Görevler 1.5× hasar, kaçan günde 2× can kaybı', color: '#ff4d6d' },
  COMBO_DAY: { name: 'Kombo Günü', icon: 'sparkle', rule: 'İkiniz de tam gün yaparsanız kombo altını 2×', color: '#b98aff' },
}
export const getDay = (date: string) => rpc<DayDetail>('get_day', { p_date: date })
export const respondRedemption = (id: string, action: 'approve' | 'not_now' | 'withdraw') => rpc<Redemption>('respond_redemption', { p_id: id, p_action: action })

// ---------- Hesap ----------
export const createInvite = () => rpc<{ token: string; expiresAt: string }>('create_invite')
export const generateRecoveryCodes = () => rpc<{ codes: string[]; createdAt: string }>('generate_recovery_codes')
export const recoveryCodesStatus = () => rpc<{ unused: number; used: number; createdAt: string | null }>('recovery_codes_status')
export const deleteAccount = () => rpc<{ ok: boolean }>('delete_account')
export const disconnectCouple = () => rpc<Game>('disconnect_couple')

// ---------- Oyunlar (düello, Günün Kelimesi, birlikte) ----------
export type DuelGame = 'TAP' | 'MEMORY' | 'TIMING' | 'WORDS' | 'SLIDE' | 'MATH' | 'COLOR'
export interface QuizQuestion { id: number; text: string; options: string[]; custom: boolean; me: { self: number; guess: number } | null; partner: { self: number; guess: number } | null }
export interface Quiz { week: string; questions: QuizQuestion[]; mineDone: boolean; theirsDone: boolean; finished: boolean; matches: number | null; history: Array<{ week: string; matches: number }> }
export interface Raid { date: string; game: DuelGame; seed: number; scores: Record<string, number>; damage: number | null; finished: boolean }
export interface Note { id: string; author: string; kind: 'LETTER' | 'THANKS'; text: string; stamp: string | null; date: string; at: string }
export interface WordHint { pos: number; letter: string; by: string }
export interface Duel { id: string; game: DuelGame; seed: number; createdBy: string | null; opponent: string | null; scoreA: number | null; scoreB: number | null; status: 'OPEN' | 'DONE' | 'EXPIRED' | 'CANCELLED'; winner: string | null; createdAt: string; finishedAt: string | null; expiresAt: string }
export interface WordGuess { by: string; word: string; res: string; at: string }
export interface Together { code: string; icon: string; title: string; status: 'PENDING' | 'DONE' | null; proposedBy: string | null; confirmedAt: string | null }
export interface Games {
  duels: Duel[]
  record: { me: number; partner: number; draws: number }
  duelRewardsLeft: number
  word: { date: string; guesses: WordGuess[]; solved: boolean; finished: boolean; answer: string | null; solvedDays: number; hints: WordHint[] } | null
  together: Together[]
  togetherDone: number
  quiz: Quiz | null
  raid: Raid | null
  notes: { letterSent: boolean; thanksMe: string | null; thanksPartner: string | null; total: number }
  config: { togetherXP: number; togetherGold: number; togetherDamage: number }
}
export const getGames = () => rpc<Games>('get_games')
export const duelCreate = (game: DuelGame, seed: number, score: number) => rpc<Games>('duel_create', { p_game: game, p_seed: seed, p_score: Math.round(score) })
export const duelPlay = (id: string, score: number) => rpc<Games>('duel_play', { p_duel: id, p_score: Math.round(score) })
export const duelCancel = (id: string) => rpc<Games>('duel_cancel', { p_duel: id })
export const wordGuess = (word: string) => rpc<Games>('word_guess', { p_word: word })
export const togetherMark = (code: string) => rpc<Games>('together_mark', { p_code: code })
export const togetherCancel = (code: string) => rpc<Games>('together_cancel', { p_code: code })
export const quizAnswer = (answers: Record<number, { self: number; guess: number }>) => rpc<Games>('quiz_answer', { p_answers: answers })
export const quizAdd = (text: string, options: string[]) => rpc<Games>('quiz_add', { p_text: text, p_options: options })
export const noteWrite = (kind: 'LETTER' | 'THANKS', text: string, stamp: string | null = null) => rpc<Games>('note_write', { p_kind: kind, p_text: text, p_stamp: stamp })
export const getNotes = (before: string | null = null, limit = 40) => rpc<Note[]>('get_notes', { p_before: before, p_limit: limit })
export const raidPlay = (score: number) => rpc<Games>('raid_play', { p_score: Math.round(score) })
export const wordHint = () => rpc<Games>('word_hint')
export interface Castle { parts: Record<string, number>; total: number; log: Array<{ key: string; level: number; by: string; at: string }> }
export const getCastle = () => rpc<Castle>('get_castle')
export const castleBuild = (key: string) => rpc<{ castle: Castle; game: Game }>('castle_build', { p_key: key })
export interface SeasonHero { fullDays: number; quests: number; xp: number; bestStreak: number; duelWins: number }
export interface SeasonSummary { heroes: Record<string, SeasonHero>; combos: number; bosses: number; together: number; words: number; quizzes: number; raids: number; notes: number; castle: number }
export interface Season { n: number; name: string; start: string; end: string; daysLeft: number; dayOf: number; days: number; summary: SeasonSummary; past: Array<{ n: number; name: string; start: string; end: string; summary: SeasonSummary }> }
export const getSeason = () => rpc<Season>('get_season')
export const pushSubscribe = (endpoint: string, p256dh: string, auth: string) => rpc<{ ok: boolean; subs: number }>('push_subscribe', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
export const pushUnsubscribe = (endpoint: string | null) => rpc<{ ok: boolean; subs: number }>('push_unsubscribe', { p_endpoint: endpoint })
export const setReminder = (hour: number | null) => rpc<Game>('set_reminder', { p_hour: hour })
/** Eşin bugünü: yapılan görevler (özel gün görevlerinin adı null), 7 günlük çubuk, sayılar, bildirim tercihi */
export interface PartnerFeed {
  hasPartner: boolean; notify: boolean
  today?: Array<{ code: string; kind: 'DAILY' | 'SIDE'; title: string | null; icon: string; at: string | null }>
  week?: Array<{ date: string; done: number; total: number }>
  weekDone?: number; totalDone?: number; weekDamage?: number; badges?: number
}
export const getPartnerFeed = () => rpc<PartnerFeed>('get_partner_feed')
export const setPartnerNotify = (on: boolean) => rpc<{ notify: boolean }>('set_partner_notify', { p_on: on })
/** Özel gün modu: on=true/false aç-kapat, null ise yalnızca listeleri günceller */
export const setSpecial = (on: boolean | null, hide: string[] | null = null, extra: string[] | null = null) => rpc<Game>('set_special', { p_on: on, p_hide: hide, p_extra: extra })
/** Özel günde listeden kalkabilecek görevler (varsayılan: namazlar, Duha/teheccüd, Kur'an, tesbihat) */
export const SPECIAL_HIDE: Array<{ code: string; name: string; icon: string; def: boolean }> = [
  { code: 'FAJR', name: 'Sabah namazı', icon: 'fajr', def: true },
  { code: 'DHUHR', name: 'Öğle namazı', icon: 'dhuhr', def: true },
  { code: 'ASR', name: 'İkindi namazı', icon: 'asr', def: true },
  { code: 'MAGHRIB', name: 'Akşam namazı', icon: 'maghrib', def: true },
  { code: 'ISHA', name: 'Yatsı namazı', icon: 'isha', def: true },
  { code: 'KAZA', name: 'Kaza namazı', icon: 'pray', def: true },
  { code: 'SUNNAH', name: 'Duha / teheccüd', icon: 'moon', def: true },
  { code: 'QURAN', name: 'Kur\'an', icon: 'quran', def: true },
  { code: 'DHIKR', name: 'Tesbihat', icon: 'beads', def: true },
  { code: 'STUDY', name: 'Dinî çalışma', icon: 'lamp', def: false },
]
/** Yerine gelebilecek hafif görevler (ilk üçü varsayılan) */
export const SPECIAL_EXTRA: Array<{ code: string; name: string; icon: string; def: boolean }> = [
  { code: 'SP_DUA', name: 'Dua et', icon: 'pray', def: true },
  { code: 'SP_ISTIGFAR', name: '100 istiğfar', icon: 'beads', def: true },
  { code: 'SP_LISTEN', name: 'Sohbet veya ilmihal dinle', icon: 'music', def: true },
  { code: 'SP_SALAVAT', name: 'Salavat getir', icon: 'sparkle', def: false },
  { code: 'SP_TEFEKKUR', name: '10 dk tefekkür', icon: 'moon', def: false },
  { code: 'SP_SADAKA', name: 'Sadaka ver', icon: 'coin', def: false },
  { code: 'SP_SIYER', name: 'Siyer veya dinî hikâye oku', icon: 'book', def: false },
]
/** Mektup damgaları (piksel ikon adları) */
export const STAMPS = ['heart', 'flower', 'star', 'sun', 'moon', 'gift', 'sparkle', 'coin']

// ---------- Dükkan kataloğu (sunucudakiyle aynı) ----------
export type Slot = 'weapon' | 'armor' | 'head' | 'cape' | 'pet'
export interface ShopItem { key: string; name: string; kind: 'WEAPON' | 'ARMOR' | 'HEAD' | 'CAPE' | 'PET' | 'POTION' | 'CHARM'; tier: number; minLevel: number; price: number; effect: number }
const I = (key: string, name: string, kind: ShopItem['kind'], tier: number, minLevel: number, price: number, effect = 0): ShopItem => ({ key, name, kind, tier, minLevel, price, effect })
export const SHOP: ShopItem[] = [
  I('potion_small', 'Can İksiri', 'POTION', 0, 1, 25, 30),
  I('potion_big', 'Büyük İksir', 'POTION', 0, 6, 60, 80),
  I('streak_shield', 'Seri Kalkanı', 'CHARM', 0, 3, 500, 0),
  I('weapon_1', 'Bronz Silah', 'WEAPON', 1, 3, 100), I('weapon_2', 'Gümüş Silah', 'WEAPON', 2, 10, 400),
  I('weapon_3', 'Altın Silah', 'WEAPON', 3, 22, 1200), I('weapon_4', 'Efsanevi Silah', 'WEAPON', 4, 38, 3000),
  I('weapon_5', 'Ejder Silahı', 'WEAPON', 5, 55, 6000), I('weapon_6', 'Yıldız Silahı', 'WEAPON', 6, 75, 12000),
  I('armor_1', 'Bronz Zırh', 'ARMOR', 1, 3, 100), I('armor_2', 'Gümüş Zırh', 'ARMOR', 2, 10, 400),
  I('armor_3', 'Altın Zırh', 'ARMOR', 3, 22, 1200), I('armor_4', 'Efsanevi Zırh', 'ARMOR', 4, 38, 3000),
  I('armor_5', 'Ejder Zırhı', 'ARMOR', 5, 55, 6000), I('armor_6', 'Yıldız Zırhı', 'ARMOR', 6, 75, 12000),
  I('head_class', 'Sınıf Başlığı', 'HEAD', 0, 2, 60), I('head_flower', 'Çiçek Tacı', 'HEAD', 0, 6, 150), I('head_laurel', 'Defne Tacı', 'HEAD', 0, 16, 700),
  I('head_crown', 'Kral Tacı', 'HEAD', 0, 30, 2500), I('head_circlet', 'Yıldız Tacı', 'HEAD', 0, 60, 8000),
  I('cape_red', 'Kızıl Pelerin', 'CAPE', 0, 3, 80), I('cape_blue', 'Mavi Pelerin', 'CAPE', 0, 3, 80), I('cape_green', 'Orman Pelerini', 'CAPE', 0, 8, 200),
  I('cape_royal', 'Kraliyet Pelerini', 'CAPE', 0, 18, 800), I('cape_shadow', 'Gölge Pelerini', 'CAPE', 0, 34, 2200),
  I('cape_gold', 'Altın Pelerin', 'CAPE', 0, 46, 4000), I('cape_star', 'Yıldızlı Pelerin', 'CAPE', 0, 68, 9000),
  I('pet_cat', 'Kedi', 'PET', 0, 5, 250), I('pet_fox', 'Tilki', 'PET', 0, 12, 600), I('pet_owl', 'Baykuş', 'PET', 0, 20, 1000),
  I('pet_bunny', 'Tavşan', 'PET', 0, 28, 1600), I('pet_dragon', 'Yavru Ejder', 'PET', 0, 42, 3500), I('pet_phoenix', 'Anka Kuşu', 'PET', 0, 80, 15000),
]
export const shopItem = (key: string) => SHOP.find(s => s.key === key)

// ---------- Seviye yolu: ödüller ve unvanlar (sunucudaki bb_level_reward ile aynı) ----------
export const levelStart = (l: number) => (Math.max(l, 1) - 1) * (150 + 15 * Math.max(l, 1))
export function levelReward(l: number): { gold: number; potion: 'potion_small' | 'potion_big' | null } {
  return { gold: 20 + 5 * l + (l % 5 === 0 ? 10 * l : 0), potion: l % 10 === 0 ? 'potion_big' : l % 5 === 0 ? 'potion_small' : null }
}
export const TITLES: Array<{ level: number; name: string; color: string }> = [
  { level: 1, name: 'Çaylak', color: '#c9bde6' },
  { level: 5, name: 'Gezgin', color: '#9ad08a' },
  { level: 10, name: 'Yiğit', color: '#5bd17c' },
  { level: 15, name: 'Akıncı', color: '#4cc9f0' },
  { level: 20, name: 'Kahraman', color: '#6aa8ff' },
  { level: 30, name: 'Şampiyon', color: '#b98aff' },
  { level: 40, name: 'Muhafız', color: '#d08aff' },
  { level: 50, name: 'Usta', color: '#ff8ab5' },
  { level: 60, name: 'Bilge', color: '#ff9a3a' },
  { level: 70, name: 'Efsane', color: '#ffcc3a' },
  { level: 85, name: 'Destan', color: '#ffe680' },
  { level: 100, name: 'Ölümsüz', color: '#7ff7ff' },
]
export const titleFor = (l: number) => [...TITLES].reverse().find(t => l >= t.level) ?? TITLES[0]
/** Bu seviyede açılan dükkan eşyaları */
export const unlocksAt = (l: number) => SHOP.filter(i => i.minLevel === l)

export const ACHIEVEMENTS: Array<{ key: string; name: string; icon: string }> = [
  { key: 'FIRST_QUEST', name: 'İlk Adım', icon: 'check' },
  { key: 'QUESTS_50', name: '50 Görev', icon: 'star' },
  { key: 'QUESTS_250', name: '250 Görev', icon: 'trophy' },
  { key: 'QUESTS_1000', name: '1000 Görev', icon: 'crown' },
  { key: 'EARLY_BIRD', name: 'Erkenci', icon: 'sun' },
  { key: 'BOOKWORM', name: 'Kitap Kurdu', icon: 'book' },
  { key: 'QURAN_30', name: 'Kur\'an Dostu', icon: 'quran' },
  { key: 'ATHLETE', name: 'Atlet', icon: 'muscle' },
  { key: 'STREAK_7', name: '7 Gün Seri', icon: 'flame' },
  { key: 'STREAK_30', name: '30 Gün Seri', icon: 'flame' },
  { key: 'STREAK_100', name: '100 Gün Seri', icon: 'sun' },
  { key: 'CHAIN_30', name: '30 Günlük Zincir', icon: 'flame' },
  { key: 'CHAIN_100', name: '100 Günlük Zincir', icon: 'rune' },
  { key: 'BOSS_1', name: 'Canavar Avcısı', icon: 'swords' },
  { key: 'BOSS_5', name: 'Efsane Avcı', icon: 'crown' },
  { key: 'BOSS_20', name: 'Ejder Terbiyecisi', icon: 'skull' },
  { key: 'LEVEL_5', name: 'Seviye 5', icon: 'stairs' },
  { key: 'LEVEL_10', name: 'Seviye 10', icon: 'shield' },
  { key: 'LEVEL_20', name: 'Seviye 20', icon: 'helmet' },
  { key: 'LEVEL_30', name: 'Seviye 30', icon: 'sword' },
  { key: 'LEVEL_50', name: 'Seviye 50', icon: 'trophy' },
  { key: 'LEVEL_75', name: 'Seviye 75', icon: 'sparkle' },
  { key: 'LEVEL_100', name: 'Seviye 100', icon: 'crown' },
  { key: 'RICH', name: 'Zengin', icon: 'chest' },
  { key: 'MYTHIC_DAY', name: 'Destansı Gün', icon: 'sparkle' },
  { key: 'FRIEND', name: 'Can Dostu', icon: 'clap' },
  { key: 'COMBO', name: 'Kombo', icon: 'heart' },
  { key: 'DUEL_1', name: 'İlk Zafer', icon: 'swords' },
  { key: 'DUEL_10', name: 'Düellocu', icon: 'bolt' },
  { key: 'DUEL_50', name: 'Arena Ustası', icon: 'trophy' },
  { key: 'WORD_1', name: 'İlk Kelime', icon: 'scroll' },
  { key: 'WORD_25', name: 'Kelime Avcısı', icon: 'book' },
  { key: 'TOGETHER_1', name: 'Birlikte', icon: 'heart' },
  { key: 'TOGETHER_20', name: 'Can Yoldaşı', icon: 'gift' },
  { key: 'TICKET_1', name: 'İlk Bilet', icon: 'ticket' },
  { key: 'SKILL_1', name: 'İlk Yetenek', icon: 'bolt' },
  { key: 'SKILL_10', name: 'Yetenek Ustası', icon: 'rune' },
  { key: 'BESTIARY', name: 'Bestiyer Tamam', icon: 'skull' },
  { key: 'QUIZ_1', name: 'İlk Çift Testi', icon: 'puzzle' },
  { key: 'QUIZ_PERFECT', name: 'Kalpten Kalbe', icon: 'heart' },
  { key: 'LETTER_10', name: 'Mektup Dostu', icon: 'quill' },
  { key: 'RAID_5', name: 'Baskıncı', icon: 'swords' },
  { key: 'CASTLE_1', name: 'İlk Taş', icon: 'shield' },
  { key: 'CASTLE_26', name: 'Kale Sahibi', icon: 'crown' },
  { key: 'SEASON_1', name: 'İlk Sezon', icon: 'moon' },
  { key: 'SEASON_4', name: 'Bir Yıl Birlikte', icon: 'heart' },
]

export const CAT_INFO: Record<Category, { name: string; icon: string; color: string }> = {
  BODY: { name: 'Güç', icon: 'muscle', color: '#ff6b5a' },
  MIND: { name: 'Zekâ', icon: 'book', color: '#6aa8ff' },
  SPIRIT: { name: 'Ruh', icon: 'moon', color: '#ffd75a' },
  ORDER: { name: 'Düzen', icon: 'broom', color: '#5bd17c' },
}
