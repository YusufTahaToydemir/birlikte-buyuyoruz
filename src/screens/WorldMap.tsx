// Sisli dünya haritası (0022): her 4 zafer yeni bir bölgenin sisini açar. Bir sonraki bölge yalnızca "???" görünür.
import { useEffect, useRef, useState } from 'react'
import { getWorld, type WorldState } from '../lib/game'
import { BossSprite, Icon, Portrait, SceneBg } from '../game/Sprite'
import { music } from '../game/music'
import { sfx } from '../game/sfx'
import { toast, toastError, useGame } from '../game/ui'
import { REGIONS } from '../game/world'
import { Tip } from './Moments'

/** Bölge içinde 4 durak: zikzak yol üzerinde yüzde konumları */
const STOPS = [[18, 78], [42, 56], [66, 70], [84, 40]]

export function WorldMap({ onClose }: { onClose: () => void }) {
  const { game } = useGame()
  const me = game.hero!, partner = game.partner
  const [w, setW] = useState<WorldState | null>(null)
  const curRef = useRef<HTMLDivElement>(null)
  useEffect(() => { getWorld().then(setW).catch(toastError) }, [])
  useEffect(() => { if (w) window.setTimeout(() => curRef.current?.scrollIntoView({ block: 'center' }), 50) }, [w])

  const per = w?.perRegion ?? 4
  const region = w?.region ?? game.world?.region ?? 0
  const progress = w?.progress ?? game.world?.progress ?? 0
  const lastRegion = REGIONS.length - 1
  const toNext = region >= lastRegion ? 0 : per - (progress - region * per)

  return (
    <div className="fixed inset-0 z-[45] bg-bg overflow-y-auto" role="dialog" aria-modal="true" aria-label="Dünya haritası">
      <div className="mx-auto max-w-[520px] min-h-dvh px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-8 space-y-3">
        <div className="flex items-center gap-2 sticky top-0 z-10 bg-bg/95 py-1">
          <Icon name="map" size={30} />
          <span className="font-pixel text-2xl flex-1">Harita</span>
          {toNext > 0 && <span className="panel-dark px-2 py-1 font-pixel text-[15px] flex items-center gap-1" title="Sonraki bölgeye kalan zafer"><Icon name="swords" size={15} />{toNext} → ?</span>}
          <button className="pbtn pbtn-dark !min-h-[40px] !px-3" onClick={() => { sfx.close(); onClose() }} aria-label="Kapat">✕</button>
        </div>

        <Tip id="map-v4" icon="map" text="Açık bölgeye dokun, sesini dinle; sisin ardında neler var, birlikte görün." />
        {/* yukarıdan aşağı: uzak bölgeler üstte */}
        <div className="flex flex-col-reverse gap-0">
          {REGIONS.map((rg, i) => {
            const open = i <= region
            const next = i === region + 1
            const hidden = i > region + 1
            const stopsDone = Math.max(0, Math.min(per, progress - i * per))
            const bosses = (w?.defeated ?? []).slice(i * per, i * per + per)
            return (
              <div key={rg.key} ref={i === region ? curRef : undefined} className="relative h-[170px] overflow-hidden border-x-[3px] border-edge first:rounded-b-[6px] last:rounded-t-[6px] last:border-t-[3px] first:border-b-[3px]">
                {open ? (
                  <button className="absolute inset-0" onClick={() => { music.preview(i); sfx.click(); toast(rg.name) }} aria-label={rg.name}>
                    <SceneBg className="absolute inset-0" seed={i * 7 + 3} region={i} />
                  </button>
                ) : <div className={`absolute inset-0 map-fog ${next ? 'map-fog-anim' : ''}`} style={hidden ? { filter: 'brightness(.55)' } : undefined} />}
                {/* yol */}
                {!hidden && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={[[2, 100], ...STOPS, [96, 0]].map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={open ? '#e8c89a' : '#9a9fb8'} strokeWidth="2.2" strokeDasharray="3 2.2" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 4 }} />
                  </svg>
                )}
                {/* duraklar */}
                {open && STOPS.map(([x, y], k) => {
                  const done = k < stopsDone
                  const here = i === region && k === stopsDone
                  const b = bosses[k]
                  return (
                    <div key={k} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x + '%', top: y + '%' }}>
                      {done && b ? <span className="relative block"><BossSprite bossKey={b.boss} scale={0.62} className="grayscale-[.6] opacity-90" /><Icon name="check" size={16} className="absolute -right-1 -bottom-1" /></span>
                        : <span className={`block w-4 h-4 rounded-full border-[3px] border-edge ${here ? 'bg-gold blinkdot' : 'bg-[#e8c89a]'}`} />}
                      {here && (
                        <span className="absolute left-1/2 -top-12 map-mark flex gap-0.5">
                          <span className="panel-dark !p-0.5"><Portrait cls={me.class} look={me.look} gear={me.equipped} size={30} /></span>
                          {partner && <span className="panel-dark !p-0.5"><Portrait cls={partner.class} look={partner.look} gear={partner.equipped} size={30} /></span>}
                        </span>
                      )}
                    </div>
                  )
                })}
                {/* etiket */}
                <div className="absolute top-2 left-2 panel-dark px-2 py-0.5 font-pixel text-[15px] flex items-center gap-1">
                  {open ? <><Icon name={rg.icon} size={15} />{rg.name}</> : next ? <><Icon name="lock" size={14} />???</> : <span className="text-ink2">· · ·</span>}
                </div>
                {next && <div className="absolute inset-0 grid place-items-center pointer-events-none"><span className="font-pixel text-5xl text-[#6a6f8a] drop-shadow-[0_2px_0_#fff8]">?</span></div>}
              </div>
            )
          })}
        </div>
        <p className="font-pixel text-[13px] text-ink2 text-center leading-snug">Her {per} canavar yeni bir bölgenin sisini açar: yeni manzara, müzik ve keşif yeri.</p>
      </div>
    </div>
  )
}
