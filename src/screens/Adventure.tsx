// Macera: sahnede kahraman ve haftanın canavarı; görevler tek dokunuşla yapılır.
import { useRef, useState, type ReactNode } from 'react'
import { completeQuest, setIzin, setSpecial, drinkPotion, useSkill, CAT_INFO, DAY_EVENTS, SKILLS, type Quest } from '../lib/game'
import { BossSprite, HeroSprite, Icon, SceneAmbient, SceneBg } from '../game/Sprite'
import { PetMini } from './PetSheet'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Bar, Segments, Sheet, Stars, toastError, useGame } from '../game/ui'
import { timeOfDay } from '../game/art/scene'
import { online } from './Games'
import { PartnerSheet } from './PartnerSheet'

export function Adventure() {
  const { game, setGame, run, go, openPets } = useGame()
  const hero = game.hero!
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [heroFx, setHeroFx] = useState('')
  const [bossFx, setBossFx] = useState('')
  const bossRef = useRef<HTMLDivElement>(null)

  const quests = game.quests.map(q => (q.id in pending ? { ...q, done: pending[q.id] } : q))
  const daily = quests.filter(q => q.kind === 'DAILY')
  const side = quests.filter(q => q.kind === 'SIDE')
  const doneDaily = daily.filter(q => q.done).length
  const allDone = daily.length > 0 && doneDaily === daily.length
  const izin = game.day?.izin ?? false
  const boss = game.boss
  const partner = game.partner
  const chainOf = (q: Quest) => (q.kind === 'DAILY' ? (game.chains?.[q.code]?.chain ?? 0) + (q.done ? 1 : 0) : 0)
  const evKey = game.day?.event ?? null
  const ev = evKey ? DAY_EVENTS[evKey] : null
  const skill = SKILLS[hero.class]
  const readyAt = hero.skillReadyAt ? new Date(hero.skillReadyAt).getTime() : 0
  const skillLeftMs = Math.max(0, readyAt - new Date(game.serverTime).getTime())
  const skillReady = skillLeftMs === 0
  const [skillOpen, setSkillOpen] = useState(false)
  // Eşin yeni tamamladığı görev sayısı (en son pencereyi açtığından beri); gün değişince sıfırdan sayılır
  const seenKey = `kyron.pseen.${game.today}`
  const [pSeen, setPSeen] = useState(() => { try { return Number(localStorage.getItem(seenKey) ?? 0) } catch { return 0 } })
  const [partnerOpen, setPartnerOpen] = useState(false)
  const pCount = partner?.todayCodes?.length ?? 0
  const newDone = Math.max(0, pCount - pSeen)
  function openPartner() {
    sfx.click(); setPartnerOpen(true); setPSeen(pCount)
    try { localStorage.setItem(seenKey, String(pCount)) } catch { /* depolama kapalı */ }
  }
  /** Görev kartındaki küçük rozetler: olay çarpanı, canavar zayıflığı, çift gün */
  const badgesOf = (q: Quest): ReactNode[] => {
    const out: ReactNode[] = []
    if (ev && evKey) {
      const hit = (ev.cat && ev.cat === q.category) || (ev.kind === 'SIDE' && q.kind === 'SIDE') || evKey === 'BOSS_RAGE'
      if (hit) out.push(<span key="ev" className="flex items-center gap-0.5" style={{ color: ev.color }}><Icon name={ev.icon} size={14} />{evKey === 'GOLD_RAIN' ? '×3' : evKey === 'BOSS_RAGE' ? '×1.5' : '×2'}</span>)
      if (evKey === 'TWIN' && q.kind === 'DAILY' && partner?.todayCodes?.includes(q.code)) out.push(<span key="twin" className="flex items-center gap-0.5 text-[#ff8ab5]"><Icon name="heart" size={14} />+5</span>)
    }
    if (boss && !boss.defeated && boss.weak === q.category) out.push(<span key="weak" className="flex items-center gap-0.5 text-hp"><Icon name="sword" size={14} />×1.5</span>)
    return out
  }
  async function castSkill() {
    const g = await run(() => useSkill())
    if (!g) return
    setSkillOpen(false)
    fx.flash(skill.color + '66'); fx.ring(window.innerWidth / 2, window.innerHeight * 0.3, skill.color); fx.confetti(40); navigator.vibrate?.([30, 30, 60])
    if (hero.class === 'WARRIOR') sfx.roar(); else if (hero.class === 'HEALER') sfx.heal(); else if (hero.class === 'MAGE') sfx.sparkle(); else sfx.dice()
    fx.float(skill.name.toLocaleUpperCase('tr-TR'), window.innerWidth / 2, window.innerHeight * 0.3, skill.color, true)
  }
  const potions = (game.inventory.potion_small ?? 0) + (game.inventory.potion_big ?? 0)

  const play = (cls: string, set: (s: string) => void) => { set(''); requestAnimationFrame(() => set(cls)); window.setTimeout(() => set(''), 600) }

  async function toggle(q: Quest, el: HTMLElement) {
    if (q.id in pending) return
    const next = !q.done
    setPending(p => ({ ...p, [q.id]: next }))
    const at = fx.fromEl(el.querySelector('.checkbox'))
    if (next) {
      sfx.quest(); sfx.coin()
      navigator.vibrate?.(15)
      fx.burst(at.x, at.y, '#5bd17c', 14, 52); fx.sparkle(at.x, at.y, 5, '#c8ffd8', 30)
      fx.float(`+${q.xp} XP`, at.x - 30, at.y - 6, '#4cc9f0')
      fx.float(`+${q.gold}`, at.x + 24, at.y - 6, '#ffcc3a')
      fx.fly(at.x, at.y, 'hud-gold', Math.min(6, Math.max(2, Math.round(q.gold / 3))), 'coin')
      fx.fly(at.x, at.y, 'hud-xp', 3, 'star')
      if (boss && !boss.defeated) {
        play('hero-attack', setHeroFx)
        window.setTimeout(() => {
          sfx.hit(); play('boss-hit', setBossFx)
          const b = fx.fromEl(bossRef.current)
          fx.float(`-${q.damage}`, b.x, b.y - 30, '#ff4d6d', true)
          fx.burst(b.x, b.y, '#ffffff', 14, 56); fx.ring(b.x, b.y, '#ffd75a'); fx.shake('quest-scene')
        }, 220)
      }
      const willFinish = q.kind === 'DAILY' && doneDaily + 1 === daily.length
      if (willFinish) window.setTimeout(() => { sfx.victory(); fx.confetti(90); fx.flash('rgba(255,215,90,.35)'); fx.ring(window.innerWidth / 2, window.innerHeight * 0.4, '#ffd75a'); fx.float('GÜN TAMAM!', window.innerWidth / 2, window.innerHeight * 0.4, '#ffcc3a', true) }, 500)
    } else sfx.undo()
    try {
      const r = await completeQuest(q.id, next)
      setGame(r.game)
    } catch (e) { toastError(e) } finally {
      setPending(p => { const c = { ...p }; delete c[q.id]; return c })
    }
  }

  async function toggleIzin() {
    sfx.click()
    const g = await run(() => setIzin(!izin))
    if (g) { if (!izin) { sfx.heal(); fx.flash('rgba(120,180,255,.35)') } }
  }

  async function drink() {
    const key = (game.inventory.potion_small ?? 0) > 0 ? 'potion_small' : 'potion_big'
    const g = await run(() => drinkPotion(key))
    if (g) { sfx.heal(); const p = fx.fromEl(document.getElementById('hud-hp')); fx.float(`+${g.hero!.hp - hero.hp} ❤`, p.x, p.y + 10, '#ff4d6d', true); fx.burst(p.x, p.y, '#ff4d6d') }
  }

  return (
    <div className="space-y-3">
      {/* Sahne */}
      <section id="quest-scene" className="panel overflow-hidden relative h-[210px]" aria-label="Macera sahnesi">
        <SceneBg className="absolute inset-0" seed={hero.level} />
        <SceneAmbient />
        {izin && <div className="absolute inset-0 bg-[#3a6ad0]/25" />}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <div className="panel-dark flex items-center gap-1 px-2 py-1 font-pixel text-[17px]" title="Seri">
            <Icon name="flame" size={18} />{hero.streak}
          </div>
          {izin && <div className="panel-dark flex items-center gap-1 px-2 py-1 font-pixel text-[15px] text-xp"><Icon name="shield" size={16} />İzin</div>}
        </div>
        <div className="absolute top-2 right-2 panel-dark px-2 py-1"><Stars n={game.day?.difficulty ?? hero.difficulty} size={12} /></div>
        <div className={`absolute left-[8%] bottom-[10px] ${heroFx}`}>
          <HeroSprite cls={hero.class} look={hero.look} gear={hero.equipped} scale={3} pose={allDone ? 'joy' : hero.hp < hero.maxHp * 0.3 ? 'hurt' : undefined} />
        </div>
        {(game.pets ?? []).slice(0, 2).map((p, i) => (
          <button key={p.id} className="absolute z-10" style={{ left: i === 0 ? '55%' : '45%', bottom: i === 0 ? 8 : 2 }} onClick={() => { sfx.open(); openPets() }} aria-label={p.name}>
            {!p.patMe && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bob"><Icon name="heart" size={14} /></span>}
            <PetMini pet={p} scale={2.1} />
          </button>
        ))}
        {(game.pets ?? []).length === 0 && game.play.petAdopt && (
          <button className="absolute z-10 left-[56%] bottom-[12px]" onClick={() => { sfx.open(); openPets() }} aria-label="Yeni dost"><Icon name="egg" size={34} className="egg-wobble" /></button>
        )}
        {partner && (() => {
          const pDone = partner.todayTotal > 0 && partner.todayDone === partner.todayTotal
          const pOn = online(partner.lastSeen, game.serverTime)
          return (
            <>
              <button className={`absolute left-[36%] bottom-[10px] ${pDone ? 'bob' : ''}`} style={{ opacity: pOn || pDone ? 1 : 0.78 }} onClick={openPartner} aria-label={`${partner.name}: bugün`}>
                {newDone > 0 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 panel-dark flex items-center gap-0.5 px-1.5 py-0.5 font-pixel text-[14px] text-ok bob whitespace-nowrap"><Icon name="check" size={14} />+{newDone}</span>}
                {!pOn && !pDone && newDone === 0 && <span className="absolute -top-4 left-1/2 font-pixel text-[13px] text-ink2 zz">z z</span>}
                <HeroSprite cls={partner.class} look={partner.look} gear={partner.equipped} scale={2.6} pose={pDone ? 'joy' : undefined} label={partner.name} />
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-edge ${pOn ? 'bg-ok' : 'bg-ink2/40'}`} />
                {partner.special && <span className="absolute -top-2 -left-2"><Icon name="shield" size={16} /></span>}
              </button>
            </>
          )
        })()}
        {timeOfDay() === 'night' && <div className="absolute left-[29%] bottom-[8px] firelight"><Icon name="flame" size={22} /></div>}
        {boss && (
          <button className="absolute right-[5%] bottom-[16px] flex flex-col items-center" onClick={() => go('arena')} aria-label={boss.name}>
            {boss.defeated ? (
              <Icon name="chest" size={64} className="glow" />
            ) : (
              <>
                <Bar value={boss.hp} max={boss.maxHp} color="#ff4d6d" className="w-[86px] mb-1" h={12} />
                <div ref={bossRef} className={`relative ${bossFx}`}>
                  <BossSprite bossKey={boss.key} scale={1.8} className={boss.hp < boss.maxHp * 0.25 ? 'boss-idle boss-angry' : 'boss-idle'} />
                  {boss.weak && <span className="absolute -left-3 -top-1 panel-dark !p-0.5 grid place-items-center" title={`Zayıf: ${CAT_INFO[boss.weak].name}`}><Icon name={CAT_INFO[boss.weak].icon} size={16} /></span>}
                  {boss.hp < boss.maxHp * 0.25 && <span className="absolute -right-2 -top-2 font-pixel text-[12px] text-hp blinkdot drop-shadow-[0_1px_0_#000]">ÖFKE</span>}
                </div>
              </>
            )}
          </button>
        )}
      </section>

      {/* Günlük ilerleme + izin + iksir */}
      <div className="flex items-center gap-2">
        <div className="panel flex-1 flex items-center gap-2 px-3 h-[52px]">
          <span className="font-pixel text-lg shrink-0 w-12">{doneDaily}/{daily.length}</span>
          <Segments done={doneDaily} total={daily.length} color={allDone ? '#ffcc3a' : '#5bd17c'} />
        </div>
        {hero.hp < hero.maxHp && potions > 0 && (
          <button className="pbtn pbtn-red !px-2.5 !min-h-[52px]" onClick={() => void drink()} aria-label="İksir iç">
            <Icon name="potion" size={26} /><span className="text-[16px]">{potions}</span>
          </button>
        )}
        <button className={`pbtn ${skillReady ? 'pbtn-purple' : 'pbtn-dark'} !px-3 !min-h-[52px] relative`} onClick={() => { sfx.click(); setSkillOpen(true) }} aria-label={skill.name}>
          <Icon name={skill.icon} size={26} className={skillReady ? 'glow' : 'opacity-50'} />
          {!skillReady && <span className="absolute -bottom-1.5 right-0.5 font-pixel text-[11px] text-ink2 bg-edge px-1 rounded">{Math.ceil(skillLeftMs / 86400000)}g</span>}
        </button>
        <button className={`pbtn ${izin ? 'pbtn-blue' : 'pbtn-dark'} !px-3 !min-h-[52px]`} onClick={() => void toggleIzin()} aria-pressed={izin} aria-label="İzinli gün">
          <Icon name="shield" size={26} />
        </button>
      </div>

      {game.special.on && (
        <div className="panel p-2 flex items-center gap-3 dropin !border-xp" aria-label="Özel gün modu">
          <span className="panel-dark w-[46px] h-[46px] grid place-items-center shrink-0"><Icon name="shield" size={34} className="glow" /></span>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-lg leading-tight text-xp">Özel gün modu · {game.special.days}. gün</div>
            <div className="font-pixel text-[14px] text-ink2 leading-tight">{game.special.days >= 7 ? 'Hâlâ açık mı? Bittiyse kapat.' : 'İbadet görevleri yerine hafif görevler. XP aynı.'}</div>
          </div>
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3 text-[15px]" onClick={() => { sfx.click(); void run(() => setSpecial(false)) }}>Kapat</button>
        </div>
      )}

      {ev && (
        <div className="panel p-2 flex items-center gap-3 dropin" style={{ borderColor: ev.color }} aria-label="Günün olayı">
          <span className="panel-dark w-[46px] h-[46px] grid place-items-center shrink-0"><Icon name={ev.icon} size={34} className="glow" /></span>
          <div className="min-w-0">
            <div className="font-pixel text-lg leading-tight" style={{ color: ev.color }}>{ev.name}</div>
            <div className="font-pixel text-[14px] text-ink2 leading-tight">{ev.rule}</div>
          </div>
        </div>
      )}

      {partner && <PartnerSheet open={partnerOpen} onClose={() => setPartnerOpen(false)} partner={partner} />}

      <Sheet open={skillOpen} onClose={() => setSkillOpen(false)} title={<span className="flex items-center gap-2"><Icon name={skill.icon} size={26} />{skill.name}</span>}>
        <div className="space-y-3">
          <div className="panel-dark relative overflow-hidden flex items-end justify-center gap-3 py-4" style={{ background: `radial-gradient(circle at 50% 70%, ${skill.color}44, transparent 65%), #1f1838` }}>
            <div className="absolute inset-[-60%] rays opacity-25 pointer-events-none" />
            <div className="relative"><HeroSprite cls={hero.class} look={hero.look} gear={hero.equipped} scale={3.5} pose="joy" /></div>
            <Icon name={skill.icon} size={56} className="relative glow bob" />
          </div>
          <p className="font-pixel text-center text-lg leading-tight">{skill.desc}</p>
          <div className="flex justify-center"><span className="panel-dark px-2 py-1 font-pixel text-[14px] text-ink2 flex items-center gap-1"><Icon name="moon" size={14} />Haftada 1</span></div>
          {skillReady ? (
            <button className="pbtn pbtn-purple w-full text-xl" onClick={() => void castSkill()}><Icon name={skill.icon} size={24} />Kullan</button>
          ) : (
            <div className="pbtn pbtn-dark w-full opacity-70"><Icon name="lock" size={22} />{Math.ceil(skillLeftMs / 3600000) >= 48 ? `${Math.ceil(skillLeftMs / 86400000)} gün sonra` : `${Math.ceil(skillLeftMs / 3600000)} saat sonra`}</div>
          )}
        </div>
      </Sheet>

      {allDone && (
        <div className="panel dropin flex items-center gap-3 p-3 !bg-[#3a2f12]">
          <Icon name="trophy" size={40} className="glow" />
          <div className="font-pixel text-gold text-xl">Günün görevleri tamam!</div>
        </div>
      )}

      {/* Günlük görevler */}
      <ul className="space-y-2">
        {daily.map(q => <QuestCard key={q.id} q={q} onToggle={toggle} busy={q.id in pending} chain={chainOf(q)} badges={badgesOf(q)} />)}
      </ul>

      {side.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2 font-pixel text-magic text-lg"><Icon name="dice" size={24} />Sürpriz görevler</div>
          <ul className="space-y-2">
            {side.map(q => <QuestCard key={q.id} q={q} onToggle={toggle} busy={q.id in pending} side badges={badgesOf(q)} />)}
          </ul>
        </>
      )}
    </div>
  )
}

function QuestCard({ q, onToggle, busy, side, chain = 0, badges = [] }: { q: Quest; onToggle: (q: Quest, el: HTMLElement) => void; busy: boolean; side?: boolean; chain?: number; badges?: ReactNode[] }) {
  const cat = CAT_INFO[q.category]
  const chainColor = chain >= 30 ? '#ff4d6d' : chain >= 7 ? '#ffcc3a' : '#ff8a3d'
  return (
    <li>
      <button
        className={`quest panel relative w-full flex items-center gap-3 p-2 pl-3 text-left ${q.done ? 'done' : ''} ${side ? '!border-[#5a3a9a]' : ''}`}
        onClick={e => onToggle(q, e.currentTarget)}
        aria-pressed={q.done}
        disabled={busy}
      >
        <span className="absolute left-0 top-2 bottom-2 w-[5px] rounded-r-[2px]" style={{ background: cat.color }} aria-hidden="true" />
        <span className={`panel-dark w-[52px] h-[52px] grid place-items-center shrink-0 ${q.done ? 'opacity-60' : ''}`}><Icon name={q.icon} size={38} /></span>
        <span className="flex-1 min-w-0">
          <span className={`block font-pixel text-[18px] leading-tight ${q.done ? 'text-ink2 line-through decoration-2' : ''}`}>{q.title}</span>
          <span className="flex items-center gap-3 mt-1 font-pixel text-[16px]">
            <span className="flex items-center gap-1 text-xp"><Icon name="star" size={14} />{q.xp}</span>
            <span className="flex items-center gap-1 text-gold"><Icon name="coin" size={14} />{q.gold}</span>
            {chain >= 2 && <span className={`flex items-center gap-0.5 ${chain >= 7 ? 'glow' : ''}`} style={{ color: chainColor }} title={`${chain} gün üst üste`}><Icon name="flame" size={14} />{chain}</span>}
            {badges}
          </span>
        </span>
        <span className="checkbox">{q.done && <Icon name="check" size={30} className="popin" />}</span>
        {q.done && <span className="absolute inset-0 overflow-hidden rounded-[4px] pointer-events-none"><span className="shine" /></span>}
      </button>
    </li>
  )
}
