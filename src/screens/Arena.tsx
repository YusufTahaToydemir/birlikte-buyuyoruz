// Arena: haftanın ortak canavarı, XP yarışı, alkış / iyileştir / altın gönder.
import { useRef, useState } from 'react'
import { createInvite, socialAction, type Hero } from '../lib/game'
import { BossSprite, HeroSprite, Icon, Portrait } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Bar, Segments, toastError, useGame } from '../game/ui'
import { online } from './Games'

export function Arena() {
  const { game, run } = useGame()
  const me = game.hero!
  const partner = game.partner
  const boss = game.boss
  const [bossFx, setBossFx] = useState('')
  const [giftOpen, setGiftOpen] = useState(false)
  const bossRef = useRef<HTMLButtonElement>(null)

  const daysLeft = Math.max(0, Math.ceil((new Date(game.weekEnd).getTime() - new Date(game.serverTime).getTime()) / 86400000))
  const myDmg = boss?.byUser[me.id] ?? 0
  const pDmg = partner ? boss?.byUser[partner.id] ?? 0 : 0
  const comboDmg = boss?.byUser.combo ?? 0
  const totalDmg = Math.max(1, myDmg + pDmg + comboDmg)
  const myXp = game.weekXp.me, pXp = game.weekXp.partner ?? 0
  const leader = !partner || myXp === pXp ? null : myXp > pXp ? 'me' : 'partner'
  const healerFree = me.class === 'HEALER' && !game.healUsedToday
  const canHeal = !!partner && partner.hp < partner.maxHp && (healerFree || (game.inventory.potion_small ?? 0) > 0)

  const poke = () => {
    if (!boss || boss.defeated) return
    sfx.hit(); setBossFx(''); requestAnimationFrame(() => setBossFx('boss-hit')); window.setTimeout(() => setBossFx(''), 400)
    const p = fx.fromEl(bossRef.current); fx.burst(p.x + (Math.random() - 0.5) * 40, p.y + (Math.random() - 0.5) * 30, '#ffffff')
  }

  async function social(kind: 'CHEER' | 'HEAL' | 'GIFT', amount = 0) {
    sfx.click()
    const g = await run(() => socialAction(kind, amount))
    if (!g) return
    const t = fx.fromEl(document.getElementById('arena-partner'))
    if (kind === 'CHEER') { sfx.cheer(); fx.fly(window.innerWidth / 2, window.innerHeight - 120, 'arena-partner', 4, 'clap'); fx.float(`+${game.config.cheerXP} XP`, t.x, t.y - 40, '#4cc9f0', true) }
    if (kind === 'HEAL') { sfx.heal(); fx.burst(t.x, t.y, '#5bd17c'); fx.float(`+${g.partner!.hp - partner!.hp} ❤`, t.x, t.y - 40, '#5bd17c', true) }
    if (kind === 'GIFT') { sfx.coin(); const s = fx.fromEl(document.getElementById('hud-gold')); fx.fly(s.x, s.y, 'arena-partner', 6, 'coin'); fx.float(`+${amount}`, t.x, t.y - 40, '#ffcc3a', true); setGiftOpen(false) }
  }

  return (
    <div className="space-y-3">
      {/* Canavar */}
      {boss ? (
        <section className="panel overflow-hidden relative p-3 pt-2" style={{ background: 'linear-gradient(#2a1840, #3a1f3a 60%, #2a2146)' }}>
          <div className="absolute inset-[-50%] rays opacity-40 pointer-events-none" style={{ display: boss.defeated ? 'block' : 'none' }} />
          <div className="relative flex items-center justify-between font-pixel">
            <span className="text-xl">{boss.name}</span>
            <span className="panel-dark px-2 py-0.5 text-[16px] text-ink2 flex items-center gap-1"><Icon name="moon" size={14} />{daysLeft} gün</span>
          </div>
          <div className="relative flex justify-center py-2">
            <button ref={bossRef} className={bossFx} onClick={poke} aria-label={boss.name}>
              <BossSprite bossKey={boss.key} scale={3.4} className={boss.defeated ? 'grayscale opacity-60 rotate-[8deg]' : boss.hp < boss.maxHp * 0.25 ? 'boss-idle boss-angry' : 'boss-idle'} />
            </button>
            {boss.defeated && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="font-pixel text-4xl text-gold rotate-[-8deg] drop-shadow-[0_3px_0_#000]">YENİLDİ!</div>
                <div className="flex gap-2">
                  <span className="panel-dark px-2 py-1 font-pixel text-gold flex items-center gap-1"><Icon name="coin" size={18} />+{game.config.bossGold}</span>
                  <span className="panel-dark px-2 py-1 font-pixel text-ticket flex items-center gap-1"><Icon name="ticket" size={18} />+1</span>
                </div>
              </div>
            )}
          </div>
          <Bar value={boss.hp} max={boss.maxHp} color="#ff4d6d" label={`${boss.hp} / ${boss.maxHp}`} h={24} />
          {/* hasar katkısı */}
          <div className="mt-2 flex h-4 border-[3px] border-edge rounded-[4px] overflow-hidden" aria-label="Hasar katkısı">
            <div style={{ width: `${(myDmg / totalDmg) * 100}%`, background: '#b98aff' }} />
            <div style={{ width: `${(pDmg / totalDmg) * 100}%`, background: '#ffcc3a' }} />
            <div style={{ width: `${(comboDmg / totalDmg) * 100}%`, background: '#5bd17c' }} />
          </div>
          <div className="mt-1 flex justify-between font-pixel text-[15px]">
            <span className="text-magic flex items-center gap-1"><Icon name="sword" size={14} />{myDmg}</span>
            {comboDmg > 0 && <span className="text-ok flex items-center gap-1"><Icon name="heart" size={14} />{comboDmg}</span>}
            {partner && <span className="text-gold flex items-center gap-1">{pDmg}<Icon name="sword" size={14} /></span>}
          </div>
        </section>
      ) : (
        <section className="panel p-4 flex items-center gap-3">
          <Icon name="swords" size={40} />
          <span className="font-pixel text-lg">İlk görevi yap, canavar ortaya çıksın!</span>
        </section>
      )}

      {partner ? (
        <>
          {/* Yarış */}
          <section className="panel p-3" aria-label="Haftalık yarış">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end">
              <Fighter name={me.name} hero={me} xp={myXp} crown={leader === 'me'} color="#b98aff" />
              <div className="font-pixel text-3xl text-hp pb-16 px-1 drop-shadow-[0_3px_0_#000]">VS</div>
              <Fighter name={partner.name} hero={partner} xp={pXp} crown={leader === 'partner'} color="#ffcc3a" id="arena-partner" flip isOnline={online(partner.lastSeen, game.serverTime)} />
            </div>
            <div className="mt-3 panel-dark p-2 space-y-1.5">
              <div className="flex items-center gap-2"><Icon name="check" size={16} /><Segments done={partner.todayDone} total={partner.todayTotal} color="#ffcc3a" /></div>
              <div className="flex items-center gap-2"><Icon name="heart" size={16} /><Bar value={partner.hp} max={partner.maxHp} color="#ff4d6d" label={`${partner.hp}/${partner.maxHp}`} className="flex-1" /></div>
            </div>
          </section>

          {/* Ortak eylemler */}
          <section className="grid grid-cols-3 gap-2">
            <button className="pbtn pbtn-purple flex-col !min-h-[84px] relative" disabled={game.cheersLeft <= 0} onClick={() => void social('CHEER')}>
              <Icon name="clap" size={34} /> Alkış
              <span className="absolute top-1 right-1.5 text-[15px] bg-edge/60 rounded px-1">{game.cheersLeft}</span>
            </button>
            <button className="pbtn pbtn-green flex-col !min-h-[84px] relative" disabled={!canHeal} onClick={() => void social('HEAL')}>
              <Icon name={healerFree ? 'heart' : 'potion'} size={34} /> İyileştir
              {healerFree && <span className="absolute top-1 right-1.5 text-[13px] bg-edge/60 rounded px-1 text-ok">✦</span>}
            </button>
            <button className="pbtn pbtn-gold flex-col !min-h-[84px]" disabled={me.gold < 10} onClick={() => { sfx.click(); setGiftOpen(o => !o) }}>
              <Icon name="gift" size={34} /> Altın
            </button>
          </section>
          {giftOpen && (
            <div className="grid grid-cols-3 gap-2 dropin">
              {[10, 25, 50].map(a => (
                <button key={a} className="pbtn pbtn-dark" disabled={me.gold < a} onClick={() => void social('GIFT', a)}><Icon name="coin" size={20} />{a}</button>
              ))}
            </div>
          )}

          {/* Son vuruşlar */}
          {boss && boss.hits.length > 0 && (
            <section className="panel-dark p-2 space-y-1">
              {boss.hits.slice(0, 6).map((h, i) => {
                const who = h.user === me.id ? me : h.user === partner.id ? partner : null
                return (
                  <div key={i} className="flex items-center gap-2 font-pixel text-[17px]">
                    {who ? <Portrait cls={who.class} look={who.look} gear={who.equipped} size={24} /> : <Icon name="heart" size={24} />}
                    <Icon name="sword" size={16} />
                    <span className="text-hp">-{h.damage}</span>
                    <span className="ml-auto text-ink2 text-[14px]">{new Date(h.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
            </section>
          )}
        </>
      ) : <InviteCard />}
    </div>
  )
}

function Fighter({ name, hero, xp, crown, color, id, flip, isOnline }: { name: string; hero: Hero; xp: number; crown: boolean; color: string; id?: string; flip?: boolean; isOnline?: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-0" id={id}>
      <div className="h-8">{crown && <Icon name="crown" size={32} className="glow pop" />}</div>
      <div style={flip ? { transform: 'scaleX(-1)' } : undefined}>
        <HeroSprite cls={hero.class} look={hero.look} gear={hero.equipped} scale={2.5} />
      </div>
      <div className="font-pixel text-[17px] truncate max-w-full flex items-center gap-1">{isOnline && <span className="w-2.5 h-2.5 rounded-full bg-ok border-2 border-edge shrink-0" title="Çevrimiçi" />}{name}</div>
      <div className="font-pixel text-xl flex items-center gap-1" style={{ color }}><Icon name="star" size={18} />{xp}</div>
      <div className="font-pixel text-[14px] text-ink2">Sv {hero.level}</div>
    </div>
  )
}

function InviteCard() {
  const { game } = useGame()
  const me = game.hero!
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const make = async () => {
    sfx.click(); setBusy(true)
    try {
      const r = await createInvite()
      setLink(`${window.location.origin}${import.meta.env.BASE_URL}#/davet/${r.token}`)
      sfx.ticket()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  const share = async () => {
    if (!link) return
    try {
      if (navigator.share) await navigator.share({ title: 'Birlikte Büyüyoruz', text: 'Takımıma katıl!', url: link })
      else { await navigator.clipboard.writeText(link); sfx.coin() }
    } catch { /* iptal */ }
  }
  return (
    <section className="panel p-4 text-center space-y-3">
      <div className="flex justify-center items-end gap-4">
        <HeroSprite cls={me.class} look={me.look} gear={me.equipped} scale={2.5} />
        <div className="w-[100px] h-[105px] panel-dark grid place-items-center font-pixel text-5xl text-ink2 blinkdot">?</div>
      </div>
      <div className="font-pixel text-xl">Takım arkadaşını çağır</div>
      {!link ? (
        <button className="pbtn pbtn-gold w-full" disabled={busy} onClick={() => void make()}><Icon name="ticket" size={22} />Davet oluştur</button>
      ) : (
        <div className="space-y-2">
          <input className="input text-[15px]" readOnly value={link} onFocus={e => e.currentTarget.select()} />
          <button className="pbtn pbtn-green w-full" onClick={() => void share()}><Icon name="gift" size={22} />Paylaş / kopyala</button>
          <p className="text-[15px] text-ink2">24 saat geçerli, tek kullanımlık.</p>
        </div>
      )}
    </section>
  )
}
