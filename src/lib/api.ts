import { supabase, usernameToEmail } from './supabase'
import type { InputType, Status } from '../domain/xp'

// ---------- Tipler ----------
export interface Snapshot {
  code: string
  group_key: string | null
  name: string
  description: string
  icon: string
  category: 'START' | 'WORSHIP' | 'LEARNING' | 'BODY'
  input_type: InputType
  target: number
  unit: string
  max_xp: number
  items: string[]
  sort_order: number
}
export interface Instance {
  id: string
  stableGoalId: string
  status: Status
  value: number | null
  itemValues: boolean[]
  earnedXP: number
  note: string | null
  revision: number
  snapshot: Snapshot
}
export interface Summary {
  id: string
  date: string
  state: 'OPEN' | 'CLOSED_EDITABLE' | 'FINALIZED'
  correctionDeadline: string
  plannedXP: number
  grossXP: number
  penaltyXP: number
  netXP: number
  tracked: number
  completed: number
  excusedAll: boolean
  revision: number
}
export interface Totals { totalXP: number; level: number; levelStart: number; nextLevelXP: number | null }
export interface Me {
  id: string
  username: string
  displayName: string
  profile: { avatar: AvatarConfig; equipped: Record<string, string>; motion: string; onboarded: boolean }
  sharing: { dailyTotal: boolean; categories: boolean; hearts: boolean; ticketBalance: boolean }
  couple: { id: string; timezone: string; status: string; hasPartner: boolean; pendingInvite: { expiresAt: string } | null }
  totals: Totals
  hearts: number
  inventory: string[]
  tickets: { available: number; requested: number; used: number }
  config: Record<string, unknown>
  serverTime: string
}
export interface AvatarConfig { type?: 'lady' | 'gent'; skin?: number; hair?: number; hairColor?: number; outfit?: string }
export interface TodayData {
  serverTime: string
  today: string
  timezone: string
  summary: Summary
  instances: Instance[]
  yesterday: Summary | null
  totals: Totals
  unseenLevels: number[]
  newTickets: { id: string; week: string }[]
}
export interface DayData { serverTime: string; summary: Summary; editable: boolean; instances: Instance[] }
export interface RecordResult {
  instance: Instance
  summary: Summary
  xpDelta: number
  dayGrossXP: number
  dayNetXP: number
  totals: Totals
  correctionDeadline: string
  serverTime: string
}
export interface Activity { id: string; creatorId: string; type: string; title: string; date: string; time: string | null; status: string; confirmedBy: string[]; firstConfirmedAt: string | null; createdAt: string }
export interface CoupleData {
  serverTime: string
  today: string
  myLevel: number
  couple: { id: string; name: string; status: string; gardenXP: number; gardenLevel: number; gardenLevels: number[] }
  partner: null | {
    id: string; displayName: string; avatar: AvatarConfig; equipped: Record<string, string>; level: number; excusedToday: boolean
    todayPlannedXP?: number; todayGrossXP?: number; todayCompleted?: number; todayTracked?: number; hearts?: number; ticketsAvailable?: number
  }
  decor: Array<{ itemId: string; placed: boolean; name: string; assetKey: string }>
  skills: Array<{ id: string; name: string; requiredLevel: number; description: string }>
  memories: Array<{ type: 'LEVEL' | 'ACTIVITY' | 'DECOR'; name?: string; level?: number; title?: string; itemId?: string; at: string }>
  skillsReceived: Array<{ id: string; skillId: string; payload: Record<string, string>; at: string; from: string }>
  skillsSentToday: string[]
  activities: Activity[]
}
export interface RewardsData {
  weekStart: string
  today: string
  firstPartialWeek: boolean
  plannedXP: number
  grossXP: number
  qualifyingDays: number
  rule: { minimumWeeklyPlannedXP: number; minimumQualifyingDays: number; minimumWeeklyWeightedRatioPercent: number; minimumDailyRatioPercent: number; minimumTrackedInstancesPerQualifyingDay: number }
  finalizesAt: string
  hearts: number
  tickets: Array<{ id: string; week: string; status: string; createdAt: string }>
  redemptions: Array<{ id: string; ticketId: string; requestedBy: string; partnerId: string; status: string; expiresAt: string; resolvedAt: string | null; reversedAt: string | null; createdAt: string }>
  lastWeek: null | { weekStart: string; plannedXP: number; grossXP: number; qualifyingDays: number; eligible: boolean }
  catalog: Array<{ id: string; kind: string; name: string; slot: string; requiredLevel: number; requiredGardenLevel: number; price: number; assetKey: string }>
  inventory: string[]
  coupleInventory: Array<{ itemId: string; placed: boolean }>
}
export interface HistoryData {
  today: string
  days: Summary[]
  weeks: Array<{ weekStart: string; plannedXP: number; grossXP: number; qualifyingDays: number; eligible: boolean; detail: Record<string, number> }>
  ledger: Array<{ date: string; delta: number; reason: string; at: string }>
  hearts: Array<{ delta: number; type: string; at: string }>
}

export class ApiError extends Error {
  code: string
  detail: unknown
  constructor(code: string, detail?: unknown) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

export const ERROR_TEXT: Record<string, string> = {
  DAY_LOCKED: 'Bu gün kilitlendi; artık değiştirilemez.',
  REVISION_CONFLICT: 'Bu kayıt başka bir cihazdan değiştirilmiş. Güncel değer yüklendi.',
  VALUE_TOO_LARGE: 'Girdiğin değer hedefin 10 katından büyük olamaz.',
  INVALID_VALUE: 'Geçersiz değer.',
  NOTE_TOO_LONG: 'Not en çok 500 karakter olabilir.',
  UNAUTHENTICATED: 'Oturum bulunamadı. Lütfen tekrar giriş yap.',
  COUPLE_FULL: 'Bu çift alanında zaten iki hesap var.',
  INVALID_INVITE: 'Davet bağlantısı geçersiz veya süresi dolmuş.',
  INVALID_SETUP_KEY: 'Kurulum anahtarı geçersiz veya daha önce kullanılmış.',
  USERNAME_TAKEN: 'Bu kullanıcı adı alınmış.',
  INVALID_USERNAME: 'Kullanıcı adı 3–24 karakter; yalnızca küçük harf, rakam ve alt çizgi.',
  SIGNUP_CLOSED: 'Açık kayıt yok. Davet bağlantısı gerekir.',
  ALREADY_ONBOARDED: 'Kurulum zaten tamamlanmış.',
  TOO_MANY_GOALS: 'En çok 20 aktif görev olabilir.',
  DAILY_XP_LIMIT: 'Günlük planlanan XP 200’ü geçemez.',
  LEVEL_LOCKED: 'Bu içerik seviyenle henüz açılmadı.',
  GARDEN_LOCKED: 'Ortak bahçe seviyesi henüz yeterli değil.',
  ALREADY_OWNED: 'Zaten edinilmiş.',
  INSUFFICIENT_HEARTS: 'Yeterli kalp yok.',
  NOT_OWNED: 'Bu ürün sende yok.',
  OUTFIT_IS_FREE: 'Kıyafetler satın alınmaz; “Giy” ile kullanılır.',
  NO_PARTNER: 'Partnerin henüz katılmadı.',
  SKILL_DAILY_LIMIT: 'Bu beceriyi bugün zaten gönderdin.',
  SKILL_TOTAL_LIMIT: 'Günde en çok üç gönderim yapılabilir.',
  INVALID_STATE: 'Bu işlem şu anki durumda yapılamaz.',
  NOT_ACCEPTED_YET: 'Partnerin henüz kabul etmedi.',
  FORBIDDEN: 'Bu işlem için yetkin yok.',
  NETWORK: 'Bağlantı kurulamadı. İnternetini kontrol et.',
}
export const errorText = (e: unknown): string => {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : String(e)
  return ERROR_TEXT[code] ?? (code.startsWith('TypeError') || code.includes('fetch') ? ERROR_TEXT.NETWORK : code)
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {})
  if (error) {
    // PostgREST hata mesajı: "REVISION_CONFLICT" gibi kodlar; details JSON taşıyabilir
    const msg = error.message || 'UNKNOWN'
    let detail: unknown = error.details
    if (typeof detail === 'string' && detail.startsWith('{')) { try { detail = JSON.parse(detail) } catch { /* ham bırak */ } }
    throw new ApiError(msg, detail)
  }
  return data as T
}

// ---------- Kimlik ----------
export async function signIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
  if (error) throw new ApiError(error.message.includes('rate') ? 'Çok fazla deneme. Biraz bekleyip tekrar dene.' : 'Kullanıcı adı veya şifre hatalı.')
}

export async function signUp(username: string, password: string, displayName: string, secret: { setupKey?: string; inviteToken?: string }) {
  const { error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim().toLowerCase(), display_name: displayName, setup_key: secret.setupKey ?? '', invite_token: secret.inviteToken ?? '' } },
  })
  if (error) {
    const m = error.message
    if (m.includes('Database error')) throw new ApiError(secret.setupKey ? 'INVALID_SETUP_KEY' : 'INVALID_INVITE')
    if (m.toLowerCase().includes('password')) throw new ApiError('Şifre en az 15 karakter olmalı.')
    if (m.toLowerCase().includes('already')) throw new ApiError('USERNAME_TAKEN')
    throw new ApiError(m)
  }
}

export async function signOut() {
  await supabase.auth.signOut()
  try { localStorage.clear(); sessionStorage.clear() } catch { /* yok say */ }
  if ('caches' in window) { try { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.includes('api')).map(k => caches.delete(k))) } catch { /* yok say */ } }
}

export async function changePassword(current: string, next: string, username: string) {
  // Önce mevcut şifreyi doğrula (sunucu ayarı da bunu ister)
  await signIn(username, current)
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) throw new ApiError(error.message)
}

// ---------- Okuma ----------
export const getMe = () => rpc<Me>('get_me')
export const getToday = () => rpc<TodayData>('get_today')
export const getDay = (date: string) => rpc<DayData | null>('get_day', { p_date: date })
export const getCouple = () => rpc<CoupleData>('get_couple')
export const getRewards = () => rpc<RewardsData>('get_rewards')
export const getHistory = (days = 30) => rpc<HistoryData>('get_history', { p_days: days })

// ---------- Yazma ----------
export type TaskAction = 'set_value' | 'set_completed' | 'set_not_done' | 'set_excused' | 'clear'
export function recordTask(instanceId: string, expectedRevision: number, action: TaskAction, opts: { value?: number; itemValues?: boolean[]; note?: string; operationId?: string } = {}) {
  return rpc<RecordResult>('record_task', {
    p_instance_id: instanceId,
    p_operation_id: opts.operationId ?? crypto.randomUUID(),
    p_expected_revision: expectedRevision,
    p_action: action,
    p_value: opts.value ?? null,
    p_item_values: opts.itemValues ?? null,
    p_note: opts.note ?? null,
  })
}
export const excuseDay = (date: string) => rpc<{ summary: Summary; totals: Totals }>('excuse_day', { p_date: date, p_operation_id: crypto.randomUUID() })
export const markLevelSeen = (level: number) => rpc<void>('mark_level_seen', { p_level: level })
export const markTicketsSeen = () => rpc<void>('mark_tickets_seen')
export const updateProfile = (p: { displayName?: string; avatar?: AvatarConfig; motion?: string }) =>
  rpc<Me>('update_profile', { p_display_name: p.displayName ?? null, p_avatar: p.avatar ?? null, p_motion: p.motion ?? null })
export const finishOnboarding = (displayName: string, avatar: AvatarConfig, goals: Array<{ id: string; active?: boolean; target?: number; items?: string[]; name?: string }>) =>
  rpc<Me>('finish_onboarding', { p_display_name: displayName, p_avatar: avatar, p_goals: goals })
export const updateSharing = (p: Partial<Me['sharing']>) => rpc<Me>('update_sharing', { p })
export const createInvite = () => rpc<{ token: string; expiresAt: string }>('create_invite')

// ---------- Aşama 2 ----------
export const equipItem = (slot: 'outfit' | 'head' | 'hand' | 'effect', itemId: string | null) => rpc<Me>('equip_item', { p_slot: slot, p_item_id: itemId })
export const purchaseItem = (itemId: string) => rpc<{ itemId: string; hearts: number }>('purchase_item', { p_item_id: itemId, p_operation_id: crypto.randomUUID() })
export const toggleDecor = (itemId: string, placed: boolean) => rpc<void>('toggle_decor', { p_item_id: itemId, p_placed: placed })
export const useSkill = (skillId: string, payload: Record<string, string> = {}) => rpc<{ id: string; skillId: string }>('use_skill', { p_skill_id: skillId, p_payload: payload })
export const proposeActivity = (type: string, title: string, date: string, time: string | null) => rpc<{ id: string }>('propose_activity', { p_type: type, p_title: title, p_date: date, p_time: time })
export const respondActivity = (id: string, action: 'accept' | 'later' | 'cancel') => rpc<{ id: string; status: string }>('respond_activity', { p_id: id, p_action: action })
export const confirmActivity = (id: string) => rpc<{ id: string; status: string; confirmations: number }>('confirm_activity', { p_id: id })
export const hideActivity = (id: string) => rpc<void>('hide_activity', { p_id: id })

// Kurulumdaki görev listesi (doğrudan tablo okuması; RLS yalnızca kendi satırlarını verir)
export interface GoalRow { id: string; code: string; name: string; description: string; icon: string; category: string; input_type: InputType; target: number; unit: string; weekdays: number[]; max_xp: number; items: string[]; active: boolean; sort_order: number; group_key: string | null }
export async function getMyGoals(): Promise<GoalRow[]> {
  const { data, error } = await supabase.from('goal_versions').select('id, code, name, description, icon, category, input_type, target, unit, weekdays, max_xp, items, active, sort_order, group_key').order('sort_order')
  if (error) throw new ApiError(error.message)
  return (data ?? []) as GoalRow[]
}
