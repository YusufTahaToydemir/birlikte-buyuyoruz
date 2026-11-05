// Eşin bugünü: eş karakterine dokununca açılır. Az yazı, çok simge: yapılan görevler, 7 günlük çubuk, dört sayı, bildirim düğmesi.
import { useEffect, useState } from 'react'
import { getPartnerFeed, setPartnerNotify, type Partner, type PartnerFeed } from '../lib/game'
import { HeroSprite, Icon } from '../game/Sprite'
import { sfx } from '../game/sfx'
import { Segments, Sheet, toastError, useGame } from '../game/ui'

const dayName = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short' })

export function PartnerSheet({ open, onClose, partner }: { open: boolean; onClose: () => void; partner: Partner }) {
  const { game } = useGame()
  const [feed, setFeed] = useState<PartnerFeed | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let live = true
    setFailed(false)
    getPartnerFeed().then(f => { if (live) setFeed(f) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [open])

  async function toggleNotify() {
    if (!feed) return
    const next = !feed.notify
    setFeed({ ...feed, notify: next })
    sfx.click()
    try { await setPartnerNotify(next) } catch (e) { setFeed({ ...feed, notify: !next }); toastError(e) }
  }

  const pDone = partner.todayTotal > 0 && partner.todayDone === partner.todayTotal
  const maxBar = Math.max(1, ...(feed?.week ?? []).map(d => d.total))
  const stats: Array<{ icon: string; value: number | string; label: string }> = [
    { icon: 'flame', value: partner.streak, label: 'Seri' },
    { icon: 'check', value: feed?.weekDone ?? '–', label: 'Bu hafta' },
    { icon: 'swords', value: feed?.weekDamage ?? '–', label: 'Hasar' },
    { icon: 'trophy', value: feed?.totalDone ?? '–', label: 'Toplam' },
  ]

  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Icon name="heart" size={24} />{partner.name}</span>}>
      <div className="space-y-3">
        <div className="panel-dark flex items-center gap-3 p-2">
          <div className={pDone ? 'bob' : ''}><HeroSprite cls={partner.class} look={partner.look} gear={partner.equipped} scale={2.4} pose={pDone ? 'joy' : undefined} /></div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="font-pixel text-lg leading-none">{partner.todayDone}/{partner.todayTotal}</div>
            <Segments done={partner.todayDone} total={partner.todayTotal} color={pDone ? '#ffcc3a' : '#5bd17c'} />
          </div>
          {partner.special && <Icon name="shield" size={22} />}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {stats.map(s => (
            <div key={s.label} className="panel-dark py-1.5 text-center">
              <Icon name={s.icon} size={22} />
              <div className="font-pixel text-lg leading-tight">{s.value}</div>
              <div className="font-pixel text-[12px] text-ink2 leading-none">{s.label}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="font-pixel text-[15px] text-ink2 mb-1">Bugün yaptıkları</div>
          {failed ? <div className="font-pixel text-[14px] text-hp">Yüklenemedi</div>
            : !feed ? <div className="font-pixel text-[14px] text-ink2">…</div>
            : (feed.today?.length ?? 0) === 0 ? <div className="panel-dark p-3 font-pixel text-[15px] text-ink2 text-center">Henüz görev yok</div>
            : (
              <div className="grid grid-cols-2 gap-1.5">
                {feed.today!.map(t => (
                  <div key={t.code} className="panel-dark flex items-center gap-2 px-2 py-1.5 min-w-0">
                    <Icon name={t.icon} size={24} />
                    <span className="font-pixel text-[15px] leading-tight truncate">{t.title ?? 'Özel görev'}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        {feed?.week && (
          <div>
            <div className="font-pixel text-[15px] text-ink2 mb-1">Son 7 gün</div>
            <div className="panel-dark flex items-end justify-between gap-1.5 px-2 pt-2 pb-1.5">
              {feed.week.map((d, i) => {
                const full = d.total > 0 && d.done === d.total
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.done}/${d.total}`}>
                    <div className="w-full h-[56px] flex items-end">
                      <div className="w-full border-2 border-edge rounded-[2px]" style={{ height: `${Math.max(6, (d.done / maxBar) * 100)}%`, background: full ? '#ffcc3a' : d.done > 0 ? '#5bd17c' : '#2a2148' }} />
                    </div>
                    <span className={`font-pixel text-[12px] leading-none ${i === 6 ? 'text-gold' : 'text-ink2'}`}>{dayName(d.date)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {feed && (
          <div className="space-y-1">
            <button className={`pbtn ${feed.notify ? 'pbtn-green' : 'pbtn-dark'} w-full`} onClick={() => void toggleNotify()} aria-pressed={feed.notify}>
              <Icon name={feed.notify ? 'bolt' : 'mute'} size={22} />{feed.notify ? 'Görev bildirimi açık' : 'Görev bildirimi kapalı'}
            </button>
            {feed.notify && (game.hero?.pushSubs ?? 0) === 0 && <p className="font-pixel text-[13px] text-ink2 text-center">Telefona gelmesi için Ayarlar → Bildirimleri aç</p>}
          </div>
        )}
      </div>
    </Sheet>
  )
}
