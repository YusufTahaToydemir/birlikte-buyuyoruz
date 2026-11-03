import { useCallback, useEffect, useState } from 'react'
import { confirmActivity, errorText, getCouple, hideActivity, proposeActivity, respondActivity, toggleDecor, useSkill, type Activity, type CoupleData, type Me } from '../lib/api'
import { Avatar } from '../components/Avatar'
import { Button, Card, Field, Sheet, Spinner, toast } from '../components/ui'
import { formatDateTR, formatDateTimeTR, pct } from '../lib/time'

const GARDEN_SCENE = ['Sade veranda, iki sandalye', 'Küçük çiçek yatağı', 'Ahşap bank ve kitap köşesi', 'Piknik alanı', 'Akşam aydınlatması', 'Küçük kış bahçesi']
const DECOR_EMOJI: Record<string, string> = { decor_potted_flower: '🪴', decor_cushion: '🛋️', decor_picnic_basket: '🧺', decor_light_chain: '💡' }
const SKILL_EMOJI: Record<string, string> = { beside: '👋', flower: '🌸', break: '☕', note: '💌', picnic: '🧺', starry: '🌙' }
const SKILL_TEXT: Record<string, string> = { beside: 'Bugün de yanındayım.', flower: 'Sahnende bir çiçek açtı.', break: 'Birlikte kısa bir mola verelim mi?', picnic: 'Piknik daveti gönderdi.', starry: 'Yıldızlı bir akşam diledi.' }
const ACTIVITY_TYPES: Array<{ id: string; title: string }> = [
  { id: 'WALK', title: 'Birlikte yürüyüş' }, { id: 'READING', title: 'Aynı kitaptan kısa okuma' }, { id: 'ENGLISH', title: 'İngilizce tekrarı' },
  { id: 'TEA', title: 'Ekranlardan uzak çay molası' }, { id: 'DISCUSS', title: 'Ortak okuma ve müzakere' }, { id: 'CUSTOM', title: 'Başka bir şey' },
]
const STATUS_TR: Record<string, string> = { PROPOSED: 'Öneri bekliyor', ACCEPTED: 'Kabul edildi', COMPLETED: 'Tamamlandı', UNCONFIRMED: 'Onaysız arşivlendi', CANCELLED: 'İptal', DECLINED: 'Başka zaman' }

export function Us({ me, onChange }: { me: Me; onChange: () => void }) {
  const [data, setData] = useState<CoupleData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [partnerMood, setPartnerMood] = useState<'neutral' | 'support'>('neutral')
  const [noteOpen, setNoteOpen] = useState(false)
  const [picnicOpen, setPicnicOpen] = useState(false)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => getCouple().then(setData).catch(e => setError(errorText(e))), [])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) toast(ok); await load(); onChange() } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }

  if (error) return <Card><p className="text-warn" role="alert">{error}</p><Button className="mt-3" onClick={() => void load()}>Tekrar dene</Button></Card>
  if (!data) return <Spinner />

  const { couple, partner } = data
  const nextLevelXP = couple.gardenLevels[couple.gardenLevel] ?? null
  const prevLevelXP = couple.gardenLevels[couple.gardenLevel - 1] ?? 0
  const placedDecor = data.decor.filter(d => d.placed)
  const sentToday = data.skillsSentToday
  const animate = me.profile.motion !== 'REDUCED'
  const receivedFlower = data.skillsReceived.some(s => s.skillId === 'flower' && s.at.slice(0, 10) === data.today)

  const send = (skillId: string, payload?: Record<string, string>) => run(async () => {
    await useSkill(skillId, payload)
    setPartnerMood('support'); window.setTimeout(() => setPartnerMood('neutral'), 1200)
  }, 'Gönderildi.')

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <h2 className="font-bold mb-2">Ortak bahçe · seviye {couple.gardenLevel}</h2>
        <div className="relative rounded-[14px] bg-gradient-to-b from-[#FFF4E0] to-[#EAF4EC] h-52 flex items-end justify-center gap-6 px-4" aria-label="Veranda sahnesi (geçici görsel)">
          <div className="absolute inset-x-0 bottom-0 h-10 bg-[#D9E8D5] rounded-b-[14px]" aria-hidden="true" />
          {couple.gardenLevel >= 2 && <span className="absolute left-3 bottom-8 text-2xl" aria-hidden="true">🌷🌼</span>}
          {couple.gardenLevel >= 3 && <span className="absolute right-3 bottom-9 text-2xl" aria-hidden="true">🪑📚</span>}
          {couple.gardenLevel >= 5 && <span className="absolute inset-x-0 top-2 text-center text-xl tracking-[12px]" aria-hidden="true">✨✨✨</span>}
          {placedDecor.length > 0 && <span className="absolute left-1/2 -translate-x-1/2 bottom-2 text-xl" aria-label={placedDecor.map(d => d.name).join(', ')}>{placedDecor.map(d => DECOR_EMOJI[d.itemId] ?? '🎀').join(' ')}</span>}
          {receivedFlower && <span className="absolute left-[18%] top-6 text-2xl anim-pop" aria-label="Partnerinden küçük çiçek">🌸</span>}
          <div className="relative"><Avatar config={me.profile.avatar} equipped={me.profile.equipped} size={92} animate={animate} label={`${me.displayName} karakteri`} /></div>
          {partner ? (
            <div className="relative"><Avatar config={partner.avatar} equipped={partner.equipped} size={92} mood={partnerMood} animate={animate} label={`${partner.displayName} karakteri`} /></div>
          ) : <div className="relative w-[92px] h-[120px] flex items-center justify-center text-ink-2 text-[13px] text-center">Partnerin henüz katılmadı</div>}
        </div>
        <p className="text-[15px] mt-2">{GARDEN_SCENE[couple.gardenLevel - 1]}</p>
        <p className="text-[13px] text-ink-2">Kesinleşmiş ortak XP: {couple.gardenXP}{nextLevelXP ? ` · sonraki seviye ${nextLevelXP} (kalan ${Math.max(0, nextLevelXP - couple.gardenXP)})` : ' · en yüksek seviye'}</p>
        <div className="h-2 rounded-full bg-soft mt-1 overflow-hidden" role="progressbar" aria-label="Bahçe ilerlemesi" aria-valuenow={couple.gardenXP} aria-valuemin={prevLevelXP} aria-valuemax={nextLevelXP ?? couple.gardenXP}>
          <div className="h-full bg-success" style={{ width: nextLevelXP ? `${Math.min(100, ((couple.gardenXP - prevLevelXP) / (nextLevelXP - prevLevelXP)) * 100)}%` : '100%' }} />
        </div>
        {data.decor.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line">
            <p className="font-semibold text-[15px] mb-1">Dekor</p>
            <div className="flex flex-wrap gap-2">
              {data.decor.map(d => (
                <button key={d.itemId} aria-pressed={d.placed} disabled={busy} className={`btn min-h-[40px] ${d.placed ? 'btn-primary' : 'btn-soft'}`} onClick={() => void run(() => toggleDecor(d.itemId, !d.placed))}>
                  {DECOR_EMOJI[d.itemId] ?? '🎀'} {d.name} · {d.placed ? 'sahnede' : 'kaldırıldı'}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-2">{partner ? partner.displayName : 'Partner'}</h2>
        {!partner && <p className="text-[15px] text-ink-2">Ayarlar’dan 24 saat geçerli bir davet bağlantısı oluşturup partnerine gönderebilirsin.</p>}
        {partner && (
          <ul className="space-y-1 text-[15px]">
            <li>Seviye {partner.level}</li>
            {partner.excusedToday && <li className="text-ink-2">Bugün kendi ritminde</li>}
            {partner.todayPlannedXP !== undefined && !partner.excusedToday && <li>Bugün {partner.todayCompleted}/{partner.todayTracked} görev · {pct(partner.todayGrossXP ?? 0, partner.todayPlannedXP)}</li>}
            {partner.hearts !== undefined && <li>Kalp: {partner.hearts}</li>}
            {partner.ticketsAvailable !== undefined && <li>Kullanılabilir bilet: {partner.ticketsAvailable}</li>}
            {partner.todayPlannedXP === undefined && !partner.excusedToday && <li className="text-[13px] text-ink-2">Günlük ayrıntılar paylaşılmıyor. Bu, partnerinin kendi tercihidir.</li>}
          </ul>
        )}
      </Card>

      {partner && (
        <Card>
          <h2 className="font-bold mb-1">Destek gönder</h2>
          <p className="text-[13px] text-ink-2 mb-2">Her beceri günde bir, toplam günde üç. Yanıt zorunlu değildir. XP veya bilet avantajı vermez. Bugün: {sentToday.length}/3</p>
          <ul className="space-y-2">
            {data.skills.map(s => {
              const unlocked = data.myLevel >= s.requiredLevel
              const used = sentToday.includes(s.id)
              const disabled = busy || !unlocked || used || sentToday.length >= 3
              return (
                <li key={s.id} className={`flex items-center gap-3 p-2 rounded-[14px] border border-line ${unlocked ? '' : 'opacity-60'}`}>
                  <span className="text-2xl" aria-hidden="true">{SKILL_EMOJI[s.id]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-[13px] text-ink-2">{unlocked ? (used ? 'Bugün gönderildi' : s.description) : `Seviye ${s.requiredLevel}’de açılır`}</p>
                  </div>
                  <Button variant="soft" className="min-h-[40px] px-3" disabled={disabled}
                    onClick={() => s.id === 'note' ? setNoteOpen(true) : s.id === 'picnic' ? setPicnicOpen(true) : void send(s.id)}>
                    Gönder
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {data.skillsReceived.length > 0 && (
        <Card>
          <h2 className="font-bold mb-2">Sana gelenler</h2>
          <ul className="space-y-2 text-[15px]">
            {data.skillsReceived.map(s => (
              <li key={s.id} className="flex gap-2">
                <span aria-hidden="true">{SKILL_EMOJI[s.skillId] ?? '💛'}</span>
                <div>
                  <p>{s.skillId === 'note' ? s.payload.text : SKILL_TEXT[s.skillId]}</p>
                  <p className="text-[13px] text-ink-2">{s.from} · {formatDateTimeTR(s.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {partner && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">Ortak etkinlikler</h2>
            <Button variant="soft" className="min-h-[40px]" onClick={() => setProposeOpen(true)}>Öner</Button>
          </div>
          <p className="text-[13px] text-ink-2 mb-2">Biri önerir, diğeri kabul eder; yapıldığını ikiniz ayrı ayrı işaretlersiniz. Haftanın ilk tamamlanan etkinliği ikinize 5’er kalp verir. Etkinlik XP üretmez.</p>
          {data.activities.length === 0 && <p className="text-[15px] text-ink-2">Henüz etkinlik yok.</p>}
          <ul className="space-y-2">
            {data.activities.map(a => <ActivityRow key={a.id} a={a} meId={me.id} busy={busy} onAction={run} />)}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-bold mb-2">Anı defteri</h2>
        {data.memories.length === 0 && <p className="text-[15px] text-ink-2">Henüz anı yok. Seviye atlamaları, bahçe açılışları ve ortak etkinlikler burada birikir.</p>}
        <ul className="space-y-1 text-[15px]">
          {data.memories.map((m, i) => (
            <li key={i}>
              {m.type === 'LEVEL' && <>🌸 {m.name} seviye {m.level} oldu</>}
              {m.type === 'ACTIVITY' && <>🤝 {m.title}</>}
              {m.type === 'DECOR' && <>{DECOR_EMOJI[m.itemId ?? ''] ?? '🎀'} Yeni dekor: {m.name}</>}
              <span className="text-[13px] text-ink-2"> · {formatDateTimeTR(m.at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <NoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} busy={busy} onSend={text => { setNoteOpen(false); void send('note', { text }) }} />
      <PicnicSheet open={picnicOpen} onClose={() => setPicnicOpen(false)} busy={busy} today={data.today} onSend={(date, time) => { setPicnicOpen(false); void send('picnic', { date, time }) }} />
      <ProposeSheet open={proposeOpen} onClose={() => setProposeOpen(false)} busy={busy} today={data.today}
        onSend={(type, title, date, time) => { setProposeOpen(false); void run(() => proposeActivity(type, title, date, time), 'Öneri gönderildi.') }} />
    </div>
  )
}

function ActivityRow({ a, meId, busy, onAction }: { a: Activity; meId: string; busy: boolean; onAction: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const mine = a.creatorId === meId
  const iConfirmed = a.confirmedBy.includes(meId)
  const open = a.status === 'PROPOSED' || a.status === 'ACCEPTED'
  return (
    <li className="p-2 rounded-[14px] border border-line">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{a.title}</p>
          <p className="text-[13px] text-ink-2">{formatDateTR(a.date, { day: 'numeric', month: 'long' })}{a.time ? ` · ${a.time.slice(0, 5)}` : ''} · {STATUS_TR[a.status] ?? a.status}{a.status === 'ACCEPTED' && a.confirmedBy.length === 1 ? (iConfirmed ? ' · partnerinin onayı bekleniyor (48 saat)' : ' · senin onayın bekleniyor') : ''}</p>
        </div>
        {!open && <button className="text-[13px] text-ink-2 underline min-h-[44px]" disabled={busy} onClick={() => void onAction(() => hideActivity(a.id))}>Gizle</button>}
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 mt-2">
          {a.status === 'PROPOSED' && !mine && <Button className="min-h-[40px]" disabled={busy} onClick={() => void onAction(() => respondActivity(a.id, 'accept'), 'Kabul edildi.')}>Kabul</Button>}
          {a.status === 'PROPOSED' && !mine && <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void onAction(() => respondActivity(a.id, 'later'))}>Başka zaman</Button>}
          {a.status === 'ACCEPTED' && !iConfirmed && <Button className="min-h-[40px]" disabled={busy} onClick={() => void onAction(() => confirmActivity(a.id), 'Beyanın kaydedildi.')}>Yaptık</Button>}
          {mine && <Button variant="ghost" className="min-h-[40px]" disabled={busy} onClick={() => void onAction(() => respondActivity(a.id, 'cancel'))}>Vazgeç</Button>}
        </div>
      )}
    </li>
  )
}

function NoteSheet({ open, onClose, onSend, busy }: { open: boolean; onClose: () => void; onSend: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Kalpten Not">
      <Field label="Notun" hint={`${text.length}/280 · Bildirimde içerik görünmez, yalnızca “Sana küçük bir not var.”`}>
        <textarea className="input py-2 min-h-[96px]" maxLength={280} value={text} onChange={e => setText(e.target.value)} />
      </Field>
      <Button className="w-full mt-3" disabled={busy || !text.trim()} onClick={() => { onSend(text.trim()); setText('') }}>Gönder</Button>
    </Sheet>
  )
}

function PicnicSheet({ open, onClose, onSend, busy, today }: { open: boolean; onClose: () => void; onSend: (date: string, time: string) => void; busy: boolean; today: string }) {
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Piknik Daveti">
      <div className="space-y-3">
        <Field label="Tarih"><input type="date" className="input" min={today} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Saat (isteğe bağlı)"><input type="time" className="input" value={time} onChange={e => setTime(e.target.value)} /></Field>
        <Button className="w-full" disabled={busy || !date} onClick={() => onSend(date, time)}>Daveti gönder</Button>
      </div>
    </Sheet>
  )
}

function ProposeSheet({ open, onClose, onSend, busy, today }: { open: boolean; onClose: () => void; onSend: (type: string, title: string, date: string, time: string | null) => void; busy: boolean; today: string }) {
  const [type, setType] = useState('WALK')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const preset = ACTIVITY_TYPES.find(t => t.id === type)
  const finalTitle = type === 'CUSTOM' ? title.trim() : (title.trim() || preset?.title || '')
  return (
    <Sheet open={open} onClose={onClose} title="Ortak etkinlik öner">
      <div className="space-y-3">
        <Field label="Tür">
          <select className="input" value={type} onChange={e => setType(e.target.value)}>{ACTIVITY_TYPES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
        </Field>
        <Field label={type === 'CUSTOM' ? 'Ad' : 'Ad (isteğe bağlı)'}><input className="input" maxLength={60} value={title} onChange={e => setTitle(e.target.value)} placeholder={preset?.title} /></Field>
        <Field label="Tarih"><input type="date" className="input" min={today} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Saat (isteğe bağlı)"><input type="time" className="input" value={time} onChange={e => setTime(e.target.value)} /></Field>
        <Button className="w-full" disabled={busy || !finalTitle || !date} onClick={() => { onSend(type, finalTitle, date, time || null); setTitle('') }}>Öner</Button>
      </div>
    </Sheet>
  )
}
