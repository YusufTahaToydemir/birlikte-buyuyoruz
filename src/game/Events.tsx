// Olay katmanı: seviye atlama (ödüller, unvan, açılan eşyalar), hasar, bayılma, kombo, boss, bilet parçası, rozet,
// partnerden gelenler (alkış, şifa, altın, düello, kelime, birlikte etkinlik).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ACHIEVEMENTS, markEventsSeen, SKILLS, TICKET_TIERS, titleFor, unlocksAt, type DuelGame, type GameEvent, type TicketTier } from '../lib/game'
import type { HeroClass } from './art/hero'
import { GAME_INFO } from './minigames'
import { BossSprite, HeroSprite, Icon, PetSprite } from './Sprite'
import { fx } from './fx'
import { sfx } from './sfx'
import { toast, useGame } from './ui'

/** Pencere açmadan yalnızca kısa bildirim gösterilen olaylar */
const QUIET = new Set(['WORD_GUESS'])

export function EventOverlay() {
  const { game, go } = useGame()
  const [queue, setQueue] = useState<GameEvent[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const fresh = game.events.filter(e => !seen.current.has(e.id))
    if (fresh.length === 0) return
    fresh.forEach(e => seen.current.add(e.id))
    fresh.filter(e => QUIET.has(e.kind)).forEach(e => { sfx.key(); toast(`${e.from ?? ''} bir kelime tahmin etti`) })
    setQueue(q => [...q, ...fresh.filter(e => !QUIET.has(e.kind))])
    void markEventsSeen(fresh.map(e => e.id)).catch(() => { /* bir sonraki yüklemede tekrar denenir */ })
  }, [game.events])

  const cur = queue[0]
  useEffect(() => {
    if (!cur) return
    const mid = { x: window.innerWidth / 2, y: window.innerHeight * 0.42 }
    switch (cur.kind) {
      case 'LEVEL_UP': sfx.levelUp(); fx.flash('rgba(255,215,90,.5)'); fx.confetti(110); fx.ring(mid.x, mid.y, '#ffd75a'); window.setTimeout(() => fx.sparkle(mid.x, mid.y, 14, '#fff4b0', 90), 300); navigator.vibrate?.([20, 40, 20, 40, 80]); break
      case 'DAY_DAMAGE': sfx.hurt(); fx.flash('rgba(255,40,60,.45)'); fx.shake('game-root', true); navigator.vibrate?.([60, 40, 60]); break
      case 'FAINT': sfx.hurt(); fx.flash('rgba(0,0,0,.6)'); fx.shake('game-root', true); break
      case 'COMBO': sfx.victory(); fx.confetti(70); fx.ring(mid.x, mid.y, '#5bd17c'); break
      case 'BOSS_DEFEATED': sfx.roar(); window.setTimeout(() => sfx.victory(), 400); fx.flash('rgba(255,255,255,.7)'); fx.shake('game-root', true); fx.confetti(160); navigator.vibrate?.([30, 30, 30, 30, 120]); break
      case 'TICKET': case 'TICKET_APPROVED': sfx.ticket(); fx.confetti(50); fx.ring(mid.x, mid.y, '#ffd166'); break
      case 'SHARD': sfx.shard(); fx.sparkle(mid.x, mid.y, 10, '#ffd166', 60); break
      case 'STREAK_SAVED': sfx.heal(); fx.flash('rgba(76,201,240,.35)'); fx.ring(mid.x, mid.y, '#4cc9f0'); break
      case 'SKILL_USED': sfx.roar(); fx.flash('rgba(185,138,255,.35)'); fx.ring(mid.x, mid.y, '#b98aff'); break
      case 'TWIN_BONUS': sfx.coin(); fx.sparkle(mid.x, mid.y, 10, '#ff8ab5', 60); break
      case 'LETTER': sfx.open(); fx.sparkle(mid.x, mid.y, 14, '#ff8ab5', 80); fx.flash('rgba(255,138,181,.25)'); break
      case 'THANKS': sfx.cheer(); break
      case 'THANKS_BOTH': sfx.victory(); fx.confetti(60); break
      case 'QUIZ_RESULT': sfx.victory(); fx.confetti(90); fx.ring(mid.x, mid.y, '#ff8ab5'); break
      case 'QUIZ_WAIT': case 'RAID_WAIT': sfx.roar(); fx.shake(); break
      case 'RAID_DONE': sfx.hit(); window.setTimeout(() => sfx.victory(), 300); fx.shake('game-root', true); fx.confetti(70); break
      case 'WORD_HINT': sfx.sparkle(); break
      case 'CASTLE_BUILT': sfx.hit(); fx.shake(); fx.sparkle(mid.x, mid.y, 10, '#ffcc3a', 70); break
      case 'SEASON_END': sfx.victory(); fx.confetti(150); fx.flash('rgba(185,138,255,.4)'); break
      case 'ACHIEVEMENT': sfx.ticket(); fx.flash('rgba(185,138,255,.4)'); fx.sparkle(mid.x, mid.y, 10, '#d8c4ff', 70); break
      case 'CHEER': sfx.cheer(); fx.sparkle(mid.x, mid.y, 8); break
      case 'HEAL': sfx.heal(); fx.ring(mid.x, mid.y, '#5bd17c'); break
      case 'GIFT': sfx.coin(); break
      case 'DUEL_INVITE': sfx.roar(); fx.shake(); break
      case 'DUEL_RESULT': if (cur.data.result === 'WIN') { sfx.victory(); fx.confetti(80) } else if (cur.data.result === 'LOSE') sfx.hurt(); else sfx.cheer(); break
      case 'WORD_SOLVED': case 'TOGETHER_DONE': sfx.victory(); fx.confetti(80); break
      case 'WORD_FAILED': sfx.undo(); break
      case 'TOGETHER_REQUEST': sfx.cheer(); fx.sparkle(mid.x, mid.y, 8, '#ff8ab5'); break
      default: sfx.click()
    }
  }, [cur])

  if (!cur) return null
  const h = game.hero!
  const d = cur.data as Record<string, number | string>
  const next = () => { sfx.click(); setQueue(q => q.slice(1)) }
  const goTo = (t: 'games' | 'loot') => { sfx.tab(); setQueue(q => q.slice(1)); go(t) }

  let art: ReactNode = null, title: ReactNode = null, sub: ReactNode = null, color = '#ffcc3a', rays = true
  let action: ReactNode = null
  const reward = (xp?: number | string, gold?: number | string) => (
    <span className="flex items-center gap-3">
      {xp !== undefined && <span className="flex items-center gap-1 text-xp"><Icon name="star" size={22} />+{xp}</span>}
      {gold !== undefined && <span className="flex items-center gap-1 text-gold"><Icon name="coin" size={22} />+{gold}</span>}
    </span>
  )
  switch (cur.kind) {
    case 'LEVEL_UP': {
      const lvl = Number(d.level)
      const t = titleFor(lvl), newTitle = t.level === lvl
      const unlocks = unlocksAt(lvl)
      art = <div className="jump"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={4} pose="joy" /></div>
      title = `SEVİYE ${lvl}!`
      sub = (
        <span className="flex flex-col items-center gap-2">
          {newTitle && <span className="stamp text-2xl" style={{ color: t.color }}>« {t.name} »</span>}
          <span className="flex items-center gap-3 flex-wrap justify-center">
            {d.gold !== undefined && <span className="panel-dark px-2 py-1 flex items-center gap-1 text-gold popin"><Icon name="coin" size={22} />+{d.gold}</span>}
            {d.potion && <span className="panel-dark px-2 py-1 flex items-center gap-1 text-hp popin" style={{ animationDelay: '150ms' }}><Icon name={String(d.potion) === 'potion_big' ? 'potion_big' : 'potion'} size={22} />+1</span>}
            <span className="panel-dark px-2 py-1 flex items-center gap-1 text-hp popin" style={{ animationDelay: '300ms' }}><Icon name="heart" size={20} />Dolu</span>
          </span>
          {unlocks.length > 0 && (
            <span className="flex items-center gap-2 text-ink2 text-[16px]"><Icon name="lock" size={16} className="grayscale" />→
              {unlocks.map(u => u.kind === 'PET' ? <PetSprite key={u.key} petKey={u.key} scale={1.6} className="!animate-none" /> : <HeroSprite key={u.key} cls={h.class} look={h.look} gear={{ ...h.equipped, ...(u.kind === 'WEAPON' ? { weapon: u.tier } : u.kind === 'ARMOR' ? { armor: u.tier } : u.kind === 'HEAD' ? { head: u.key } : u.kind === 'CAPE' ? { cape: u.key } : {}) }} scale={1.1} animate={false} />)}
            </span>
          )}
        </span>
      )
      if (unlocks.length > 0) action = <button className="pbtn pbtn-gold flex-1" onClick={() => goTo('loot')}><Icon name="bag" size={20} />Dükkan</button>
      break
    }
    case 'DAY_DAMAGE':
      art = <HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={4} pose="hurt" className="hero-hurt" />
      title = <span className="text-hp">-{d.hp} ❤</span>; color = '#ff4d6d'; rays = false
      sub = <span className="flex items-center gap-1 text-ink2"><Icon name="check" size={18} className="grayscale" />×{d.missed}</span>
      break
    case 'FAINT':
      art = <div className="grayscale rotate-90 translate-y-6"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={3} pose="hurt" animate={false} /></div>
      title = <span className="text-hp">Bayıldın!</span>; color = '#ff4d6d'; rays = false
      sub = <span className="flex items-center gap-1 text-gold"><Icon name="coin" size={20} />-{d.gold}</span>
      break
    case 'COMBO':
      art = (
        <div className="flex items-end gap-2">
          <div className="jump"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={2.5} pose="joy" /></div>
          <Icon name="heart" size={40} className="glow mb-10" />
          {game.partner && <div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={game.partner.class} look={game.partner.look} gear={game.partner.equipped} scale={2.5} pose="joy" /></div>}
        </div>
      )
      title = 'KOMBO!'; color = '#5bd17c'
      sub = <span className="flex items-center gap-3"><span className="flex items-center gap-1 text-gold"><Icon name="coin" size={20} />+{d.gold}</span><span className="flex items-center gap-1 text-hp"><Icon name="sword" size={20} />-{d.damage}</span></span>
      break
    case 'BOSS_DEFEATED':
      art = <BossSprite bossKey={String(d.bossKey ?? 'slime_green')} scale={3.5} className="grayscale-[.6] rotate-[10deg]" />
      title = 'ZAFER!'; sub = (
        <span className="flex flex-col items-center gap-1">
          <span className="text-ink">{String(d.name ?? '')}</span>
          <span className="flex items-center gap-3"><span className="flex items-center gap-1 text-gold"><Icon name="coin" size={22} />+{d.gold}</span><span className="flex items-center gap-1 text-ticket"><Icon name="shard" size={22} />+1</span></span>
        </span>
      )
      break
    case 'SHARD': {
      const n = Number(d.shards), need = Number(d.need ?? 4)
      art = <ShardMeter n={n} need={need} size={64} />
      title = 'Bilet parçası!'; color = '#ffd166'
      sub = <span className="flex items-center gap-1 text-ink">{n}/{need} · {need - n} parça daha <Icon name="ticket" size={20} /></span>
      break
    }
    case 'TICKET': {
      const tier = TICKET_TIERS[(d.tier as TicketTier) ?? 'GREEN'] ?? TICKET_TIERS.GREEN
      art = <div className="relative"><ShardMeter n={4} need={4} size={56} /><span className={`absolute inset-0 grid place-items-center tier-${String(d.tier ?? 'GREEN')}`}><Icon name="ticket" size={110} className="glow popin" /></span></div>
      title = `${tier.name.toLocaleUpperCase('tr-TR')} BİLET!`; color = tier.color
      sub = <span className="flex items-center gap-1 text-ink2"><Icon name="shard" size={18} />4 parça birleşti!{d.tier === 'RED' && <span className="text-hp"> · En nadiri!</span>}</span>
      break
    }
    case 'STREAK_SAVED':
      art = <div className="relative"><Icon name="shield" size={110} className="glow" /><Icon name="flame" size={48} className="absolute inset-0 m-auto" /></div>
      title = 'SERİ KORUNDU'; color = '#4cc9f0'
      sub = <span className="flex items-center gap-1 text-ink">Seri Kalkanı kırıldı, <Icon name="flame" size={18} />{String(d.streak)} serin duruyor</span>
      break
    case 'ACHIEVEMENT': {
      const a = ACHIEVEMENTS.find(x => x.key === d.key)
      art = <div className="panel-dark p-4 popin"><Icon name={a?.icon ?? 'trophy'} size={96} className="glow" /></div>
      title = 'YENİ ROZET'; sub = <span className="text-ink">{a?.name ?? String(d.key)}</span>; color = '#b98aff'
      break
    }
    case 'CHEER':
      art = <Icon name="clap" size={110} className="pop wiggle" />; title = `+${d.xp} XP`; color = '#4cc9f0'
      sub = <span className="text-ink">{cur.from} seni alkışladı!</span>
      break
    case 'HEAL':
      art = <Icon name="heart" size={110} className="glow bob" />; title = <span className="text-ok">{d.full ? 'CAN DOLDU!' : `+${d.hp} ❤`}</span>; color = '#5bd17c'
      sub = <span className="text-ink">{d.full ? `${cur.from} Büyük Şifa kullandı` : `${cur.from} seni iyileştirdi`}</span>
      break
    case 'GIFT':
      art = <Icon name="gift" size={110} className="pop" />; title = `+${d.gold}`
      sub = <span className="text-ink">{cur.from} altın gönderdi</span>
      break
    case 'DUEL_INVITE': {
      const gi = GAME_INFO[String(d.game) as keyof typeof GAME_INFO]
      art = <div className="flex items-end gap-3"><Icon name="swords" size={64} className="wiggle" /><Icon name={gi?.icon ?? 'gamepad'} size={90} className="bob" /></div>
      title = 'DÜELLO!'; color = '#ff4d6d'
      sub = <span className="text-ink">{cur.from} · {gi?.name}</span>
      action = <button className="pbtn pbtn-gold flex-1" onClick={() => goTo('games')}><Icon name="swords" size={20} />Oyna</button>
      break
    }
    case 'DUEL_RESULT': {
      const r = String(d.result)
      const gi = GAME_INFO[String(d.game) as keyof typeof GAME_INFO]
      art = <div className={r === 'WIN' ? 'jump' : ''}><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={3.5} pose={r === 'WIN' ? 'joy' : r === 'LOSE' ? 'hurt' : undefined} /></div>
      title = r === 'WIN' ? 'KAZANDIN!' : r === 'LOSE' ? 'Kaybettin' : 'Berabere'; color = r === 'WIN' ? '#ffcc3a' : r === 'LOSE' ? '#ff4d6d' : '#4cc9f0'; rays = r === 'WIN'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink2 flex items-center gap-1"><Icon name={gi?.icon ?? 'gamepad'} size={20} />{gi?.name}</span><span className="text-3xl"><span className="text-magic">{d.me}</span> – <span className="text-gold">{d.them}</span></span></span>
      break
    }
    case 'WORD_SOLVED':
      art = <div className="flex gap-1">{[...String(d.word)].map((c, i) => <span key={i} className="w-12 h-12 grid place-items-center border-[3px] border-edge rounded-[4px] bg-[#4cbf6a] font-pixel text-3xl tile-flip" style={{ animationDelay: `${i * 90}ms` }}>{c}</span>)}</div>
      title = 'ÇÖZÜLDÜ!'; color = '#5bd17c'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">{cur.from} kelimeyi buldu ({d.tries}. tahmin)</span>{reward(d.xp, d.gold)}</span>
      break
    case 'WORD_FAILED':
      art = <div className="flex gap-1">{[...String(d.word)].map((c, i) => <span key={i} className="w-12 h-12 grid place-items-center border-[3px] border-edge rounded-[4px] bg-[#3e3658] font-pixel text-3xl">{c}</span>)}</div>
      title = 'Olmadı…'; color = '#ff4d6d'; rays = false
      sub = <span className="text-ink">Yarın yeni kelime!</span>
      break
    case 'TOGETHER_REQUEST':
      art = <div className="flex items-end gap-2"><Icon name={String(d.icon ?? 'heart')} size={90} className="bob" /><Icon name="heart" size={40} className="glow" /></div>
      title = 'Birlikte!'; color = '#ff8ab5'
      sub = <span className="text-ink">{cur.from}: “{String(d.title)}” yaptık mı?</span>
      action = <button className="pbtn pbtn-gold flex-1" onClick={() => goTo('games')}><Icon name="check" size={20} />Bak</button>
      break
    case 'TOGETHER_DONE':
      art = (
        <div className="flex items-end gap-2">
          <div className="jump"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={2.4} pose="joy" /></div>
          <Icon name={String(d.icon ?? 'heart')} size={48} className="glow mb-8" />
          {game.partner && <div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={game.partner.class} look={game.partner.look} gear={game.partner.equipped} scale={2.4} pose="joy" /></div>}
        </div>
      )
      title = 'BİRLİKTE!'; color = '#ff8ab5'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">{String(d.title)}</span>{reward(d.xp, d.gold)}</span>
      break
    case 'TICKET_REQUEST': {
      const tier = TICKET_TIERS[(d.tier as TicketTier) ?? 'GREEN'] ?? TICKET_TIERS.GREEN
      art = <span className={`inline-flex tier-${String(d.tier ?? 'GREEN')}`}><Icon name="ticket" size={110} className="glow" /></span>; title = `${tier.name} bilet!`; color = tier.color; rays = false
      sub = <span className="flex flex-col items-center gap-1 text-ink"><span>{cur.from} bir bilet kullanmak istiyor</span>{d.note ? <span className="font-pixel text-gold text-lg">« {String(d.note)} »</span> : null}</span>
      action = <button className="pbtn pbtn-gold flex-1" onClick={() => goTo('loot')}>Bak</button>
      break
    }
    case 'TICKET_APPROVED':
      art = <Icon name="ticket" size={110} className="glow" />; title = 'Onaylandı!'; color = '#5bd17c'
      sub = <span className="text-ink">{cur.from} biletini onayladı</span>
      break
    case 'SKILL_USED': {
      const sk = SKILLS[(d.class as HeroClass) ?? 'WARRIOR'] ?? SKILLS.WARRIOR
      art = (
        <div className="flex items-end gap-3">
          {game.partner && <div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={game.partner.class} look={game.partner.look} gear={game.partner.equipped} scale={2.6} pose="joy" /></div>}
          <Icon name={sk.icon} size={64} className="glow mb-6 bob" />
        </div>
      )
      title = sk.name.toLocaleUpperCase('tr-TR'); color = sk.color
      sub = <span className="text-ink">{cur.from} yeteneğini kullandı · {sk.desc}</span>
      break
    }
    case 'TWIN_BONUS':
      art = <div className="relative"><Icon name={String(d.icon ?? 'check')} size={96} /><Icon name="heart" size={40} className="absolute -right-4 -top-2 glow popin" /></div>
      title = 'ÇİFT!'; color = '#ff8ab5'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">İkiniz de "{String(d.title)}" yaptınız</span>{reward(undefined, d.gold)}</span>
      break
    case 'LETTER':
      art = (
        <div className="panel p-3 relative max-w-[300px]" style={{ background: 'repeating-linear-gradient(0deg, #1f1838 0 26px, #2a2146 26px 28px)' }}>
          <p className="font-pixel text-xl leading-[28px] text-ink text-left">{String(d.text)}</p>
          <Icon name={String(d.stamp ?? 'heart')} size={36} className="absolute -right-3 -bottom-3 glow popin" />
        </div>
      )
      title = 'MEKTUP!'; color = '#ff8ab5'; rays = false
      sub = <span className="text-ink2">{cur.from} sana yazdı</span>
      action = <button className="pbtn pbtn-gold flex-1" onClick={() => goTo('games')}>Cevap yaz</button>
      break
    case 'THANKS':
      art = <Icon name="sparkle" size={96} className="glow" />; title = 'Şükür'; color = '#5bd17c'; rays = false
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">{cur.from}: « {String(d.text)} »</span><span className="text-ink2 text-[15px]">Sen de yazarsan +10 altın</span></span>
      action = <button className="pbtn pbtn-green flex-1" onClick={() => goTo('games')}>Ben de yazayım</button>
      break
    case 'THANKS_BOTH':
      art = <div className="flex items-end gap-2"><HeroSprite cls={h.class} look={h.look} gear={h.equipped} scale={2.4} pose="joy" />{game.partner && <div style={{ transform: 'scaleX(-1)' }}><HeroSprite cls={game.partner.class} look={game.partner.look} gear={game.partner.equipped} scale={2.4} pose="joy" /></div>}</div>
      title = 'İKİ ŞÜKÜR'; color = '#5bd17c'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink text-[15px]">« {String(d.mine)} » · « {String(d.theirs)} »</span>{reward(d.xp, d.gold)}</span>
      break
    case 'QUIZ_RESULT': {
      const m = Number(d.matches)
      art = <div className="flex flex-col items-center gap-1"><div className="font-pixel text-7xl text-gold drop-shadow-[0_4px_0_#000]">{m}<span className="text-3xl text-ink2">/10</span></div><div className="flex gap-0.5">{Array.from({ length: 10 }, (_, i) => <Icon key={i} name="heart" size={18} className={i < m ? 'popin' : 'opacity-25 grayscale'} />)}</div></div>
      title = m >= 8 ? 'KALPTEN KALBE!' : m >= 5 ? 'İYİ TANIYORSUNUZ' : 'DAHA ÇOK SOHBET'; color = '#ff8ab5'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">Çift testi tamamlandı</span>{reward(d.xp, d.gold)}<span className="text-hp flex items-center gap-1"><Icon name="sword" size={16} />-{String(d.damage)} canavar</span></span>
      action = <button className="pbtn pbtn-gold flex-1" onClick={() => goTo('games')}>Sonuçlar</button>
      break
    }
    case 'QUIZ_WAIT':
      art = <Icon name="puzzle" size={96} className="glow bob" />; title = 'Çift Testi'; color = '#b98aff'; rays = false
      sub = <span className="text-ink">{cur.from} cevapladı, sıra sende</span>
      action = <button className="pbtn pbtn-purple flex-1" onClick={() => goTo('games')}>Cevapla</button>
      break
    case 'RAID_WAIT':
      art = <Icon name={GAME_INFO[(d.game as DuelGame) ?? 'TAP']?.icon ?? 'swords'} size={96} className="glow bob" />; title = 'BASKIN!'; color = '#ff4d6d'; rays = false
      sub = <span className="text-ink">{cur.from} {String(d.score)} puan aldı · sen de oyna, canavara birlikte vurun</span>
      action = <button className="pbtn pbtn-red flex-1" onClick={() => goTo('games')}>Oyna</button>
      break
    case 'RAID_DONE':
      art = <div className="relative">{game.boss && <BossSprite bossKey={game.boss.key} scale={3} className="boss-hit" />}<span className="absolute -top-2 left-1/2 -translate-x-1/2 font-pixel text-4xl text-hp drop-shadow-[0_3px_0_#000] popin">-{String(d.damage)}</span></div>
      title = 'BASKIN TAMAM'; color = '#ff4d6d'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">{String(d.me)} + {String(d.them)} puan</span>{reward(10, 10)}</span>
      break
    case 'WORD_HINT':
      art = <span className="font-pixel text-7xl text-gold drop-shadow-[0_4px_0_#000]">{String(d.letter)}</span>; title = 'İpucu'; color = '#ffcc3a'; rays = false
      sub = <span className="text-ink">{cur.from} {String(d.pos)}. harfi açtı</span>
      break
    case 'CASTLE_BUILT':
      art = <div className="relative"><Icon name="crown" size={96} className="glow" /><span className="absolute -bottom-2 left-1/2 -translate-x-1/2 font-pixel text-2xl text-gold drop-shadow-[0_2px_0_#000]">+{String(d.level)}</span></div>
      title = String(d.name).toLocaleUpperCase('tr-TR'); color = '#ffcc3a'; rays = false
      sub = <span className="text-ink">{cur.from} kaleye ekledi · <Icon name="coin" size={16} />{String(d.cost)}</span>
      break
    case 'SEASON_END':
      art = <div className="flex flex-col items-center gap-1"><Icon name="trophy" size={96} className="glow" /><span className="font-pixel text-2xl text-magic">Sezon {String(d.n)} · {String(d.name)}</span></div>
      title = 'SEZON BİTTİ'; color = '#b98aff'
      sub = <span className="flex flex-col items-center gap-1"><span className="text-ink">Özetin Kahraman sekmesinde</span>{reward(undefined, d.gold)}</span>
      break
    default:
      art = <Icon name="sparkle" size={90} />; title = cur.kind
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={next}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-[380px] panel dropin overflow-hidden text-center p-5 pt-6" onClick={e => e.stopPropagation()}>
        {rays && <div className="absolute inset-[-60%] rays opacity-50 pointer-events-none" />}
        <div className="relative flex justify-center items-end min-h-[150px]">{art}</div>
        <div className="relative font-pixel text-4xl mt-3 drop-shadow-[0_3px_0_#000]" style={{ color }}>{title}</div>
        {sub && <div className="relative font-pixel text-xl mt-2 flex justify-center">{sub}</div>}
        <div className="relative flex gap-2 mt-5">
          {action}
          <button className="pbtn pbtn-dark flex-1" onClick={next} autoFocus>Tamam{queue.length > 1 ? ` (${queue.length - 1})` : ''}</button>
        </div>
      </div>
    </div>
  )
}

/** 4 parçalı bilet göstergesi */
export function ShardMeter({ n, need = 4, size = 40 }: { n: number; need?: number; size?: number }) {
  return (
    <span className="inline-grid grid-cols-2 gap-1" aria-label={`${n}/${need} parça`}>
      {Array.from({ length: need }, (_, i) => (
        <span key={i} className={i < n ? (i === n - 1 ? 'popin' : '') : 'opacity-25 grayscale'} style={{ transform: `rotate(${i * 90}deg)` }}>
          <Icon name="shard" size={size} />
        </span>
      ))}
    </span>
  )
}
