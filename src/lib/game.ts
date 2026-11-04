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
}
export interface Partner extends Hero { todayDone: number; todayTotal: number }
export interface Quest { id: string; code: string; kind: 'DAILY' | 'SIDE'; category: Category; icon: string; title: string; xp: number; gold: number; damage: number; done: boolean }
export interface Difficulty { n: number; name: string; mult: number; damage: number; sides: number }
export interface GameEvent { id: string; kind: string; data: Record<string, unknown>; from: string | null; at: string }
export interface Boss { id: string; key: string; name: string; hp: number; maxHp: number; defeated: boolean; hits: Array<{ user: string | null; kind: string; damage: number; at: string }>; byUser: Record<string, number> }
export interface Game {
  serverTime: string; today: string; weekStart: string; weekEnd: string
  config: { difficulties: Difficulty[]; cheerXP: number; cheersPerDay: number; healAmount: number; bossGold: number; comboGold: number; comboDamage: number }
  hero: Hero | null
  day: { izin: boolean; difficulty: number } | null
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
}
export interface Delta { xp: number; gold: number; damage: number; defeated?: boolean }
export interface Ticket { id: string; week: string | null; status: 'AVAILABLE' | 'REQUESTED' | 'USED' | 'ARCHIVED'; source: string | null; createdAt: string }
export interface Redemption { id: string; ticketId: string; requestedBy: string; partnerId: string; status: string; expiresAt: string; resolvedAt: string | null; reversalRequestedBy: string | null; createdAt: string }

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
export const requestTicket = (ticketId: string) => rpc<Redemption>('request_ticket', { p_ticket_id: ticketId, p_operation_id: crypto.randomUUID() })
export const respondRedemption = (id: string, action: 'approve' | 'not_now' | 'withdraw') => rpc<Redemption>('respond_redemption', { p_id: id, p_action: action })

// ---------- Hesap ----------
export const createInvite = () => rpc<{ token: string; expiresAt: string }>('create_invite')
export const generateRecoveryCodes = () => rpc<{ codes: string[]; createdAt: string }>('generate_recovery_codes')
export const recoveryCodesStatus = () => rpc<{ unused: number; used: number; createdAt: string | null }>('recovery_codes_status')
export const deleteAccount = () => rpc<{ ok: boolean }>('delete_account')
export const disconnectCouple = () => rpc<Game>('disconnect_couple')

// ---------- Dükkan kataloğu (sunucudakiyle aynı) ----------
export type Slot = 'weapon' | 'armor' | 'head' | 'cape' | 'pet'
export interface ShopItem { key: string; name: string; kind: 'WEAPON' | 'ARMOR' | 'HEAD' | 'CAPE' | 'PET' | 'POTION'; tier: number; minLevel: number; price: number; effect: number }
const I = (key: string, name: string, kind: ShopItem['kind'], tier: number, minLevel: number, price: number, effect = 0): ShopItem => ({ key, name, kind, tier, minLevel, price, effect })
export const SHOP: ShopItem[] = [
  I('potion_small', 'Can İksiri', 'POTION', 0, 1, 25, 30),
  I('potion_big', 'Büyük İksir', 'POTION', 0, 6, 60, 80),
  I('weapon_1', 'Bronz Silah', 'WEAPON', 1, 3, 100), I('weapon_2', 'Gümüş Silah', 'WEAPON', 2, 8, 300),
  I('weapon_3', 'Altın Silah', 'WEAPON', 3, 15, 800), I('weapon_4', 'Efsanevi Silah', 'WEAPON', 4, 25, 2000),
  I('armor_1', 'Bronz Zırh', 'ARMOR', 1, 3, 100), I('armor_2', 'Gümüş Zırh', 'ARMOR', 2, 8, 300),
  I('armor_3', 'Altın Zırh', 'ARMOR', 3, 15, 800), I('armor_4', 'Efsanevi Zırh', 'ARMOR', 4, 25, 2000),
  I('head_class', 'Sınıf Başlığı', 'HEAD', 0, 2, 60), I('head_flower', 'Çiçek Tacı', 'HEAD', 0, 4, 120), I('head_crown', 'Kral Tacı', 'HEAD', 0, 20, 1500),
  I('cape_red', 'Kızıl Pelerin', 'CAPE', 0, 3, 80), I('cape_blue', 'Mavi Pelerin', 'CAPE', 0, 3, 80),
  I('cape_royal', 'Kraliyet Pelerini', 'CAPE', 0, 12, 400), I('cape_gold', 'Altın Pelerin', 'CAPE', 0, 22, 1200),
  I('pet_cat', 'Kedi', 'PET', 0, 5, 250), I('pet_fox', 'Tilki', 'PET', 0, 10, 500), I('pet_owl', 'Baykuş', 'PET', 0, 15, 800), I('pet_dragon', 'Yavru Ejder', 'PET', 0, 25, 2000),
]
export const shopItem = (key: string) => SHOP.find(s => s.key === key)

export const ACHIEVEMENTS: Array<{ key: string; name: string; icon: string }> = [
  { key: 'FIRST_QUEST', name: 'İlk Adım', icon: 'check' },
  { key: 'QUESTS_50', name: '50 Görev', icon: 'star' },
  { key: 'QUESTS_250', name: '250 Görev', icon: 'trophy' },
  { key: 'EARLY_BIRD', name: 'Erkenci', icon: 'sun' },
  { key: 'BOOKWORM', name: 'Kitap Kurdu', icon: 'book' },
  { key: 'QURAN_30', name: 'Kur\'an Dostu', icon: 'quran' },
  { key: 'ATHLETE', name: 'Atlet', icon: 'muscle' },
  { key: 'STREAK_7', name: '7 Gün Seri', icon: 'flame' },
  { key: 'STREAK_30', name: '30 Gün Seri', icon: 'flame' },
  { key: 'BOSS_1', name: 'Canavar Avcısı', icon: 'swords' },
  { key: 'BOSS_5', name: 'Efsane Avcı', icon: 'crown' },
  { key: 'LEVEL_5', name: 'Seviye 5', icon: 'stairs' },
  { key: 'LEVEL_10', name: 'Seviye 10', icon: 'shield' },
  { key: 'LEVEL_20', name: 'Seviye 20', icon: 'helmet' },
  { key: 'RICH', name: 'Zengin', icon: 'chest' },
  { key: 'MYTHIC_DAY', name: 'Mitik Gün', icon: 'sparkle' },
  { key: 'FRIEND', name: 'Can Dostu', icon: 'clap' },
  { key: 'COMBO', name: 'Kombo', icon: 'heart' },
]

export const CAT_INFO: Record<Category, { name: string; icon: string; color: string }> = {
  BODY: { name: 'Güç', icon: 'muscle', color: '#ff6b5a' },
  MIND: { name: 'Zekâ', icon: 'book', color: '#6aa8ff' },
  SPIRIT: { name: 'Ruh', icon: 'moon', color: '#ffd75a' },
  ORDER: { name: 'Düzen', icon: 'broom', color: '#5bd17c' },
}
