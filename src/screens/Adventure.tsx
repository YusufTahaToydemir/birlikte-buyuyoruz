// Macera: sahnede kahraman ve haftanın canavarı; görevler tek dokunuşla yapılır.
import { useRef, useState } from 'react'
import { completeQuest, setIzin, drinkPotion, CAT_INFO, type Quest } from '../lib/game'
import { BossSprite, HeroSprite, Icon, PetSprite, SceneBg } from '../game/Sprite'
import { fx } from '../game/fx'
import { sfx } from '../game/sfx'
import { Bar, Segments, Stars, toastError, useGame } from '../game/ui'

export function Adventure() {
  const { game, setGame, run, go } = useGame()
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
      fx.burst(at.x, at.y, '#5bd17c')
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
          fx.burst(b.x, b.y, '#ffffff')
        }, 220)
      }
      const willFinish = q.kind === 'DAILY' && doneDaily + 1 === daily.length
      if (willFinish) window.setTimeout(() => { sfx.victory(); fx.confetti(70); fx.float('GÜN TAMAM!', window.innerWidth / 2, window.innerHeight * 0.4, '#ffcc3a', true) }, 500)
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
      <section className="panel overflow-hidden relative h-[200px]" aria-label="Macera sahnesi">
        <SceneBg className="absolute inset-0" seed={hero.level} />
        {izin && <div className="absolute inset-0 bg-[#3a6ad0]/25" />}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <div className="panel-dark flex items-center gap-1 px-2 py-1 font-pixel text-[15px]" title="Seri">
            <Icon name="flame" size={18} />{hero.streak}
          </div>
          {izin && <div className="panel-dark flex items-center gap-1 px-2 py-1 font-pixel text-[13px] text-xp"><Icon name="shield" size={16} />İzin</div>}
        </div>
        <div className="absolute top-2 right-2 panel-dark px-2 py-1"><Stars n={game.day?.difficulty ?? hero.difficulty} size={12} /></div>
        <div className={`absolute left-[8%] bottom-[10px] ${heroFx}`}>
          <HeroSprite cls={hero.class} look={hero.look} gear={hero.equipped} scale={3} pose={allDone ? 'joy' : hero.hp < hero.maxHp * 0.3 ? 'hurt' : undefined} />
        </div>
        {hero.equipped.pet && <div className="absolute left-[40%] bottom-[18px]"><PetSprite petKey={hero.equipped.pet} scale={2} /></div>}
        {boss && (
          <button className="absolute right-[5%] bottom-[16px] flex flex-col items-center" onClick={() => go('arena')} aria-label={boss.name}>
            {boss.defeated ? (
              <Icon name="chest" size={64} className="glow" />
            ) : (
              <>
                <Bar value={boss.hp} max={boss.maxHp} color="#ff4d6d" className="w-[86px] mb-1" h={12} />
                <div ref={bossRef} className={bossFx}><BossSprite bossKey={boss.key} scale={1.8} className="boss-idle" /></div>
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
            <Icon name="potion" size={26} /><span className="text-[14px]">{potions}</span>
          </button>
        )}
        <button className={`pbtn ${izin ? 'pbtn-blue' : 'pbtn-dark'} !px-3 !min-h-[52px]`} onClick={() => void toggleIzin()} aria-pressed={izin} aria-label="İzinli gün">
          <Icon name="shield" size={26} />
        </button>
      </div>

      {allDone && (
        <div className="panel dropin flex items-center gap-3 p-3 !bg-[#3a2f12]">
          <Icon name="trophy" size={40} className="glow" />
          <div className="font-pixel text-gold text-xl">Günün görevleri tamam!</div>
        </div>
      )}

      {/* Günlük görevler */}
      <ul className="space-y-2">
        {daily.map(q => <QuestCard key={q.id} q={q} onToggle={toggle} busy={q.id in pending} />)}
      </ul>

      {side.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2 font-pixel text-magic text-lg"><Icon name="dice" size={24} />Sürpriz görevler</div>
          <ul className="space-y-2">
            {side.map(q => <QuestCard key={q.id} q={q} onToggle={toggle} busy={q.id in pending} side />)}
          </ul>
        </>
      )}
    </div>
  )
}

function QuestCard({ q, onToggle, busy, side }: { q: Quest; onToggle: (q: Quest, el: HTMLElement) => void; busy: boolean; side?: boolean }) {
  const cat = CAT_INFO[q.category]
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
          <span className="flex items-center gap-3 mt-1 font-pixel text-[14px]">
            <span className="flex items-center gap-1 text-xp"><Icon name="star" size={14} />{q.xp}</span>
            <span className="flex items-center gap-1 text-gold"><Icon name="coin" size={14} />{q.gold}</span>
          </span>
        </span>
        <span className="checkbox">{q.done && <Icon name="check" size={30} />}</span>
      </button>
    </li>
  )
}
