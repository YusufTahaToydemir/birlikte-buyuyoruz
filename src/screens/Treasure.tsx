// Hazine: dükkan (altınla eşya) ve biletler (3 kademe: yeşil / turuncu / kırmızı; eşin onayıyla kullanılır).
import { useCallback, useEffect, useState } from 'react'
import { buyItem, getTickets, requestTicket, respondRedemption, SHOP, TICKET_TIERS, type Redemption, type ShopItem, type Ticket, type TicketTier } from '../lib/game'
import type { Gear } from '../game/art/hero'
import { BossSprite, HeroSprite, Icon, Portrait } from '../game/Sprite'
import { PetMini } from './PetSheet'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Sheet, toastError, useGame } from '../game/ui'
import { ShardMeter } from '../game/Events'

const HEAD_ICON: Record<string, string> = { head_class: 'helmet', head_flower: 'flower', head_crown: 'crown', head_laurel: 'flower', head_circlet: 'crown' }
const TIER_COLOR = ['#9a8fb8', '#d08a4a', '#cfd8e8', '#ffcc3a', '#b98aff', '#ff6a3a', '#7ff7ff']
const TIERS: TicketTier[] = ['RED', 'ORANGE', 'GREEN']

const GEAR_KINDS = ['WEAPON', 'ARMOR', 'HEAD', 'CAPE']
function gearWith(eq: Gear, i: ShopItem): Gear {
  return { ...eq, ...(i.kind === 'WEAPON' ? { weapon: i.tier } : i.kind === 'ARMOR' ? { armor: i.tier } : i.kind === 'HEAD' ? { head: i.key } : i.kind === 'CAPE' ? { cape: i.key } : {}) }
}

/** Bilet: kademe rengine boyanmış piksel bilet */
export function TicketArt({ tier, size = 40, className = '' }: { tier: TicketTier | null | undefined; size?: number; className?: string }) {
  return <span className={`inline-flex tier-${tier ?? 'GREEN'}`}><Icon name="ticket" size={size} className={className} /></span>
}

function ItemArt({ item, size = 40 }: { item: ShopItem; size?: number }) {
  if (item.kind === 'CHARM') return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <Icon name="shield" size={size} /><Icon name="flame" size={Math.round(size * 0.45)} className="absolute" />
    </span>
  )
  const icon = item.kind === 'POTION' ? item.key === 'potion_big' ? 'potion_big' : 'potion'
    : item.kind === 'WEAPON' ? 'sword' : item.kind === 'ARMOR' ? 'shield' : item.kind === 'HEAD' ? HEAD_ICON[item.key] ?? 'helmet' : 'cape'
  return <Icon name={icon} size={size} />
}

export function Treasure() {
  const { game } = useGame()
  const [tab, setTab] = useState<'shop' | 'tickets'>(game.incomingRequests > 0 ? 'tickets' : 'shop')
  return (
    <div className="space-y-3">
      <div className="panel grid grid-cols-2 p-1 gap-1">
        {(['shop', 'tickets'] as const).map(t => (
          <button key={t} className={`h-12 rounded-[4px] font-pixel text-lg flex items-center justify-center gap-2 relative ${tab === t ? 'bg-panel2 text-gold' : 'text-ink2'}`} onClick={() => { sfx.tab(); setTab(t) }}>
            <Icon name={t === 'shop' ? 'bag' : 'ticket'} size={26} />{t === 'shop' ? 'Dükkan' : 'Biletler'}
            {t === 'tickets' && game.tickets.available > 0 && <span className="text-[16px] text-ticket">{game.tickets.available}</span>}
            {t === 'tickets' && game.incomingRequests > 0 && <span className="absolute top-1.5 right-3 w-3 h-3 rounded-full bg-hp border-2 border-edge blinkdot" />}
          </button>
        ))}
      </div>
      {tab === 'shop' ? <Shop /> : <Tickets />}
    </div>
  )
}

function Shop() {
  const { game, run, openPets } = useGame()
  const h = game.hero!
  const [sel, setSel] = useState<ShopItem | null>(null)
  const pets = game.pets ?? []
  const stackable = (i: ShopItem) => i.kind === 'POTION' || i.kind === 'CHARM'
  const isOwned = (i: ShopItem) => !stackable(i) && (game.inventory[i.key] ?? 0) > 0
  const full = (i: ShopItem) => i.kind === 'CHARM' && (game.inventory[i.key] ?? 0) >= 2

  async function buy(i: ShopItem) {
    const g = await run(() => buyItem(i.key))
    if (!g) return
    sfx.buy(); sfx.coin(); navigator.vibrate?.(20)
    const s = fx.fromEl(document.getElementById('hud-gold'))
    fx.float(`-${i.price}`, s.x, s.y + 24, '#ffcc3a', true)
    fx.flash('rgba(255,215,90,.3)')
    if (!stackable(i)) fx.confetti(40)
    setSel(null)
  }

  const groups: Array<{ kinds: ShopItem['kind'][]; icon: string }> = [
    { kinds: ['POTION', 'CHARM'], icon: 'potion' },
    { kinds: ['WEAPON', 'ARMOR'], icon: 'swords' },
    { kinds: ['HEAD', 'CAPE'], icon: 'crown' },
  ]

  return (
    <>
      {/* Ortak evcil dostlar */}
      <button className="panel w-full p-3 flex items-center gap-3 text-left relative overflow-hidden" onClick={() => { sfx.open(); openPets() }}>
        <div className="absolute inset-[-60%] rays opacity-15 pointer-events-none" />
        <div className="relative flex items-end -space-x-2 min-w-[64px] justify-center">
          {pets.length ? pets.slice(0, 3).map(p => <PetMini key={p.id} pet={p} scale={1.8} />) : <Icon name="egg" size={52} className="egg-wobble" />}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="font-pixel text-xl">Yuva</div>
          <div className="font-pixel text-[15px] text-ink2">{pets.length ? `${pets.length} dost · giydir, sev, büyüt` : 'Birlikte bir dost sahiplenin'}</div>
        </div>
        {(game.petBonus ?? 0) > 0 && <span className="relative font-pixel text-[15px] text-gold flex items-center gap-0.5"><Icon name="sword" size={15} />+%{game.petBonus}</span>}
        {game.play.petAdopt && <span className="relative w-3 h-3 rounded-full bg-hp border-2 border-edge blinkdot" />}
      </button>
      {groups.map(gr => (
        <section key={gr.icon} className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {SHOP.filter(i => gr.kinds.includes(i.kind)).map(i => {
              const locked = h.level < i.minLevel
              const own = isOwned(i)
              const qty = stackable(i) ? game.inventory[i.key] ?? 0 : 0
              return (
                <button key={i.key} className={`panel p-2 flex flex-col items-center gap-1 relative ${locked ? 'opacity-55' : ''}`} onClick={() => { sfx.click(); setSel(i) }}>
                  {i.tier > 0 && <span className="absolute top-1 left-1.5 font-pixel text-[14px]" style={{ color: TIER_COLOR[i.tier] }}>+{i.tier}</span>}
                  {qty > 0 && <span className="absolute top-1 right-1.5 font-pixel text-[14px] text-ink2">×{qty}</span>}
                  <div className="h-[52px] grid place-items-center">{GEAR_KINDS.includes(i.kind) ? <HeroSprite cls={h.class} look={h.look} gear={gearWith(h.equipped, i)} scale={1.25} animate={false} /> : <ItemArt item={i} size={44} />}</div>
                  <span className="font-pixel text-[14px] leading-tight text-center h-[28px] flex items-center">{i.name}</span>
                  {own || full(i) ? <span className="font-pixel text-ok flex items-center gap-1 text-[16px]"><Icon name="check" size={16} /></span>
                    : locked ? <span className="font-pixel text-ink2 flex items-center gap-1 text-[16px]"><Icon name="lock" size={14} />Sv {i.minLevel}</span>
                      : <span className={`font-pixel flex items-center gap-1 text-[16px] ${h.gold >= i.price ? 'text-gold' : 'text-hp'}`}><Icon name="coin" size={14} />{i.price}</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name}>
        {sel && (() => {
          const locked = h.level < sel.minLevel
          const own = isOwned(sel) || full(sel)
          const gear = gearWith(h.equipped, sel)
          return (
            <div className="space-y-4">
              <div className="panel-dark flex items-end justify-center gap-4 py-4 relative overflow-hidden">
                <div className="absolute inset-[-60%] rays opacity-25" />
                {sel.kind === 'POTION' ? (
                  <div className="relative flex flex-col items-center gap-2"><ItemArt item={sel} size={96} /><span className="font-pixel text-2xl text-hp">+{sel.effect} ❤</span></div>
                ) : sel.kind === 'CHARM' ? (
                  <div className="relative flex flex-col items-center gap-2"><ItemArt item={sel} size={96} />
                    <span className="font-pixel text-[16px] text-xp text-center leading-tight flex items-center gap-1">Eksik günde <Icon name="flame" size={18} />serin korunur</span>
                    <span className="font-pixel text-[14px] text-ink2">Kendiliğinden kullanılır · en fazla 2</span></div>
                ) : <div className="relative"><HeroSprite cls={h.class} look={h.look} gear={gear} scale={4} pose="joy" /></div>}
              </div>
              {own ? (
                <div className="font-pixel text-ok text-center text-lg flex items-center justify-center gap-2"><Icon name="check" size={24} />{sel.kind === 'CHARM' ? 'Çantan dolu (2/2)' : 'Sende var'}</div>
              ) : locked ? (
                <div className="pbtn pbtn-dark w-full opacity-70"><Icon name="lock" size={22} />Seviye {sel.minLevel}</div>
              ) : (
                <button className="pbtn pbtn-gold w-full text-xl" disabled={h.gold < sel.price} onClick={() => void buy(sel)}>
                  Al <Icon name="coin" size={24} />{sel.price}
                </button>
              )}
            </div>
          )
        })()}
      </Sheet>
    </>
  )
}

function Tickets() {
  const { game, refresh } = useGame()
  const me = game.hero!
  const partner = game.partner
  const [data, setData] = useState<{ tickets: Ticket[]; redemptions: Redemption[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [use, setUse] = useState<{ tier: TicketTier; note: string } | null>(null)
  const load = useCallback(async () => { try { setData(await getTickets()) } catch (e) { toastError(e) } }, [])
  useEffect(() => { void load() }, [load, game.tickets.available, game.tickets.requested, game.incomingRequests])

  const available = data?.tickets.filter(t => t.status === 'AVAILABLE') ?? []
  const byTier = (t: TicketTier) => available.filter(x => x.tier === t)
  const incoming = data?.redemptions.filter(r => r.partnerId === me.id && r.status === 'REQUESTED' && new Date(r.expiresAt) > new Date()) ?? []
  const mine = data?.redemptions.filter(r => r.requestedBy === me.id && r.status === 'REQUESTED') ?? []
  const history = data?.redemptions.filter(r => r.status === 'APPROVED').slice(0, 6) ?? []

  const act = async (fn: () => Promise<unknown>, good: () => void) => {
    setBusy(true)
    try { await fn(); good(); await Promise.all([load(), refresh()]) } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const send = async () => {
    if (!use) return
    const t = byTier(use.tier)[0]
    if (!t) return
    await act(() => requestTicket(t.id, use.note.trim()), () => { sfx.ticket(); fx.confetti(30) })
    setUse(null)
  }

  return (
    <div className="space-y-3">
      <section className="panel p-4 flex flex-col items-center gap-3" style={{ background: 'radial-gradient(circle at 50% 40%, #ffd16633, transparent 65%), var(--color-panel)' }}>
        <div className="grid grid-cols-3 gap-2 w-full">
          {TIERS.map(t => {
            const n = byTier(t).length
            return (
              <button key={t} className={`panel-dark p-2 flex flex-col items-center gap-1 ${n === 0 ? 'opacity-45' : ''}`} disabled={busy || n === 0 || !partner}
                onClick={() => { sfx.click(); setUse({ tier: t, note: '' }) }} aria-label={`${TICKET_TIERS[t].name} bilet`}>
                <TicketArt tier={t} size={52} className={n > 0 ? 'glow' : 'grayscale'} />
                <span className="font-pixel text-3xl" style={{ color: TICKET_TIERS[t].color }}>{n}</span>
                <span className="font-pixel text-[13px] text-ink2">{TICKET_TIERS[t].name}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          <ShardMeter n={me.shards ?? 0} need={game.config.shardsPerTicket ?? 4} size={26} />
          <span className="font-pixel text-lg text-ticket">{me.shards ?? 0}/{game.config.shardsPerTicket ?? 4}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full font-pixel text-[15px]">
          <div className="panel-dark flex items-center justify-center gap-1 py-1.5">
            {game.boss ? <BossSprite bossKey={game.boss.key} scale={0.5} /> : <Icon name="swords" size={22} />}=<Icon name="shard" size={18} />
          </div>
          <div className="panel-dark flex items-center justify-center gap-1 py-1.5">
            <Icon name="check" size={18} />×5=<Icon name="shard" size={18} />
          </div>
          <div className="panel-dark flex items-center justify-center gap-1 py-1.5">
            4<Icon name="shard" size={18} />=<Icon name="ticket" size={18} />
          </div>
        </div>
      </section>

      {incoming.map(r => (
        <section key={r.id} className="panel p-3 flex items-center gap-3 dropin" style={{ borderColor: TICKET_TIERS[r.tier ?? 'GREEN'].color }}>
          {partner && <Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={48} />}
          <div className="flex-1 min-w-0 font-pixel leading-tight">
            <div className="text-[16px] flex items-center gap-1"><TicketArt tier={r.tier} size={24} />{partner?.name ?? ''}</div>
            {r.note && <div className="text-gold text-[15px] truncate">« {r.note} »</div>}
          </div>
          <button className="pbtn pbtn-green !px-3" disabled={busy} onClick={() => void act(() => respondRedemption(r.id, 'approve'), () => { sfx.victory(); fx.confetti(40) })} aria-label="Onayla"><Icon name="check" size={24} /></button>
          <button className="pbtn pbtn-dark !px-3" disabled={busy} onClick={() => void act(() => respondRedemption(r.id, 'not_now'), () => sfx.undo())} aria-label="Sonra">✕</button>
        </section>
      ))}

      {mine.map(r => (
        <section key={r.id} className="panel-dark p-3 flex items-center gap-3">
          <TicketArt tier={r.tier} size={32} className="blinkdot" />
          <span className="flex-1 min-w-0 font-pixel text-ink2 truncate">{r.note ? `« ${r.note} » · ` : ''}Onay bekliyor…</span>
          <button className="pbtn pbtn-dark !min-h-[40px] text-[16px]" disabled={busy} onClick={() => void act(() => respondRedemption(r.id, 'withdraw'), () => sfx.undo())}>Geri çek</button>
        </section>
      ))}

      {history.length > 0 && (
        <section className="panel-dark p-2 space-y-1">
          {history.map(r => {
            const who = r.requestedBy === me.id ? me : partner
            return (
              <div key={r.id} className="flex items-center gap-2 font-pixel text-[16px] min-w-0">
                {who && <Portrait cls={who.class} look={who.look} gear={who.equipped} size={24} />}
                <TicketArt tier={r.tier} size={18} /><Icon name="check" size={16} />
                {r.note && <span className="text-ink2 text-[14px] truncate">{r.note}</span>}
                <span className="ml-auto text-ink2 text-[14px] shrink-0">{new Date(r.resolvedAt ?? r.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
              </div>
            )
          })}
        </section>
      )}

      <Sheet open={!!use} onClose={() => setUse(null)} title={use ? <span className="flex items-center gap-2"><TicketArt tier={use.tier} size={28} />{TICKET_TIERS[use.tier].name} bilet</span> : null}>
        {use && (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send() }}>
            <div className="panel-dark py-4 grid place-items-center"><TicketArt tier={use.tier} size={96} className="glow" /></div>
            <input className="input" placeholder="Hangi ödül? (isteğe bağlı)" maxLength={80} value={use.note} onChange={e => setUse({ ...use, note: e.target.value })} autoFocus />
            <button type="submit" className="pbtn pbtn-gold w-full text-xl" disabled={busy}><Icon name="ticket" size={24} />{partner?.name ?? 'Eşine'} gönder</button>
          </form>
        )}
      </Sheet>
    </div>
  )
}
