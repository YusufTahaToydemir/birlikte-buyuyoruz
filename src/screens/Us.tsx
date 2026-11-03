import { useCallback, useEffect, useState } from 'react'
import { errorText, getCouple, type CoupleData, type Me } from '../lib/api'
import { Avatar } from '../components/Avatar'
import { Button, Card, Spinner } from '../components/ui'
import { formatDateTimeTR, pct } from '../lib/time'

const GARDEN_SCENE = ['Sade veranda, iki sandalye', 'Küçük çiçek yatağı', 'Ahşap bank ve kitap köşesi', 'Piknik alanı', 'Akşam aydınlatması', 'Küçük kış bahçesi']

export function Us({ me }: { me: Me }) {
  const [data, setData] = useState<CoupleData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => getCouple().then(setData).catch(e => setError(errorText(e))), [])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  if (error) return <Card><p className="text-warn" role="alert">{error}</p><Button className="mt-3" onClick={() => void load()}>Tekrar dene</Button></Card>
  if (!data) return <Spinner />

  const { couple, partner } = data
  const nextLevelXP = couple.gardenLevels[couple.gardenLevel] ?? null
  const prevLevelXP = couple.gardenLevels[couple.gardenLevel - 1] ?? 0

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <h2 className="font-bold mb-2">Ortak bahçe · seviye {couple.gardenLevel}</h2>
        <div className="relative rounded-[14px] bg-gradient-to-b from-[#FFF4E0] to-[#EAF4EC] h-52 flex items-end justify-center gap-6 px-4" aria-label="Veranda sahnesi (geçici görsel)">
          <div className="absolute inset-x-0 bottom-0 h-10 bg-[#D9E8D5] rounded-b-[14px]" aria-hidden="true" />
          {couple.gardenLevel >= 2 && <span className="absolute left-4 bottom-8 text-2xl" aria-hidden="true">🌷🌼</span>}
          {couple.gardenLevel >= 3 && <span className="absolute right-4 bottom-9 text-2xl" aria-hidden="true">🪑📚</span>}
          {couple.gardenLevel >= 5 && <span className="absolute inset-x-0 top-2 text-center text-xl tracking-[12px]" aria-hidden="true">✨✨✨</span>}
          <div className="relative"><Avatar config={me.profile.avatar} equipped={me.profile.equipped} size={92} animate={me.profile.motion !== 'REDUCED'} label={`${me.displayName} karakteri`} /></div>
          {partner ? (
            <div className="relative"><Avatar config={partner.avatar} equipped={partner.equipped} size={92} animate={me.profile.motion !== 'REDUCED'} label={`${partner.displayName} karakteri`} /></div>
          ) : <div className="relative w-[92px] h-[120px] flex items-center justify-center text-ink-2 text-[13px] text-center">Partnerin henüz katılmadı</div>}
        </div>
        <p className="text-[15px] mt-2">{GARDEN_SCENE[couple.gardenLevel - 1]}</p>
        <p className="text-[13px] text-ink-2">Kesinleşmiş ortak XP: {couple.gardenXP}{nextLevelXP ? ` · sonraki seviye ${nextLevelXP} (kalan ${Math.max(0, nextLevelXP - couple.gardenXP)})` : ' · en yüksek seviye'}</p>
        <div className="h-2 rounded-full bg-soft mt-1 overflow-hidden" role="progressbar" aria-label="Bahçe ilerlemesi" aria-valuenow={couple.gardenXP} aria-valuemin={prevLevelXP} aria-valuemax={nextLevelXP ?? couple.gardenXP}>
          <div className="h-full bg-success" style={{ width: nextLevelXP ? `${Math.min(100, ((couple.gardenXP - prevLevelXP) / (nextLevelXP - prevLevelXP)) * 100)}%` : '100%' }} />
        </div>
      </Card>

      <Card>
        <h2 className="font-bold mb-2">{partner ? partner.displayName : 'Partner'}</h2>
        {!partner && (
          <p className="text-[15px] text-ink-2">{me.couple.hasPartner ? 'Yükleniyor…' : 'Ayarlar’dan 24 saat geçerli bir davet bağlantısı oluşturup partnerine gönderebilirsin.'}</p>
        )}
        {partner && (
          <ul className="space-y-1 text-[15px]">
            <li>Seviye {partner.level}</li>
            {partner.excusedToday && <li className="text-ink-2">Bugün kendi ritminde</li>}
            {partner.todayPlannedXP !== undefined && !partner.excusedToday && (
              <li>Bugün {partner.todayCompleted}/{partner.todayTracked} görev · {pct(partner.todayGrossXP ?? 0, partner.todayPlannedXP)}</li>
            )}
            {partner.hearts !== undefined && <li>Kalp: {partner.hearts}</li>}
            {partner.ticketsAvailable !== undefined && <li>Kullanılabilir bilet: {partner.ticketsAvailable}</li>}
            {partner.todayPlannedXP === undefined && !partner.excusedToday && <li className="text-[13px] text-ink-2">Günlük ayrıntılar paylaşılmıyor. Bu, partnerinin kendi tercihidir.</li>}
          </ul>
        )}
        <p className="text-[13px] text-ink-2 mt-2">Destek gönderme ve ortak etkinlikler bir sonraki sürümde (Aşama 2) açılacak.</p>
      </Card>

      {data.skillsReceivedToday.length > 0 && (
        <Card>
          <h2 className="font-bold mb-2">Sana gelenler</h2>
          <ul className="space-y-1 text-[15px]">{data.skillsReceivedToday.map(s => <li key={s.id}>💛 {s.skillId} · {formatDateTimeTR(s.at)}</li>)}</ul>
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
              {m.type === 'DECOR' && <>🪴 Yeni dekor: {m.itemId}</>}
              <span className="text-[13px] text-ink-2"> · {formatDateTimeTR(m.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
