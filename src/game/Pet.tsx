// Ortak evcil dostun ekrandaki hâli: kare şeridi (açık/kırpma/mutlu/kuyruk) + nefes, göz kırpma,
// kuyruk sallama, tepkiler (sevme/sevinç/yeme), uyku ve ışık (aura) parçacıkları.
// Ölçek eski 24'lük tuvale göredir: px = 24 * scale * evre boyu (çağıranlar değişmeden aynı boyu görür).
import type { CSSProperties } from 'react'
import { gridToURL, makeGrid, outline, type Grid } from './pixel'
import { petAnchors, renderPetStrip, STAGE_SCALE, type PetLook } from './art/pets'

export type PetReaction = 'pat' | 'happy' | 'eat'

const OLD_CANVAS = 24
const POS = ['0% 0', '33.333% 0', '66.667% 0', '100% 0'] // PET_FRAMES sırası

const AURA: Record<string, { ch: string; color: string; n: number }> = {
  a_hearts: { ch: '♥', color: '#ff6aa8', n: 4 },
  a_stars: { ch: '★', color: '#ffd75a', n: 5 },
  a_bubbles: { ch: '○', color: '#9ad8ff', n: 5 },
  a_fire: { ch: '✦', color: '#ff8a3d', n: 7 },
}

// küçük piksel parçacıklar (kalp, ışıltı, kırıntı)
function fxGrid(lines: string[], pal: Record<string, string>, line = true): Grid {
  const g = makeGrid(lines[0].length + 2, lines.length + 2)
  lines.forEach((l, y) => [...l].forEach((ch, x) => { if (pal[ch]) g[y + 1][x + 1] = pal[ch] }))
  return line ? outline(g) : g
}
const FX = {
  heart: () => gridToURL('petfx:heart', () => fxGrid(['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], { R: '#ff5a8a', W: '#ffd0e0' })),
  sparkle: () => gridToURL('petfx:sparkle', () => fxGrid(['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'], { Y: '#ffd75a', W: '#ffffff' })),
  crumb: () => gridToURL('petfx:crumb', () => fxGrid(['CC', 'Cc'], { C: '#e8b060', c: '#a8702a' })),
}
type Fx = { k: keyof typeof FX; x: number; y: number; dx: number; dy: number; d: number; s: number }
function fxFor(r: PetReaction, a: ReturnType<typeof petAnchors>): Fx[] {
  const hx = a.cx, hy = a.head - 0.07
  if (r === 'pat') return [
    { k: 'heart', x: hx - 0.12, y: hy, dx: -0.16, dy: -0.3, d: 0, s: 0.2 },
    { k: 'heart', x: hx + 0.02, y: hy - 0.04, dx: 0.02, dy: -0.38, d: 0.15, s: 0.24 },
    { k: 'heart', x: hx + 0.14, y: hy, dx: 0.18, dy: -0.3, d: 0.3, s: 0.2 },
  ]
  if (r === 'happy') return [
    { k: 'sparkle', x: hx - 0.3, y: hy + 0.1, dx: -0.14, dy: -0.18, d: 0, s: 0.16 },
    { k: 'sparkle', x: hx + 0.3, y: hy + 0.06, dx: 0.14, dy: -0.2, d: 0.1, s: 0.16 },
    { k: 'heart', x: hx, y: hy - 0.04, dx: 0, dy: -0.3, d: 0.35, s: 0.22 },
    { k: 'sparkle', x: hx - 0.22, y: hy + 0.3, dx: -0.18, dy: -0.06, d: 0.32, s: 0.13 },
    { k: 'sparkle', x: hx + 0.24, y: hy + 0.32, dx: 0.18, dy: -0.08, d: 0.42, s: 0.13 },
  ]
  return [0, 1, 2, 3].map(i => ({ k: 'crumb' as const, x: hx + (i % 2 ? 0.04 : -0.04), y: a.mouth, dx: (i % 2 ? 1 : -1) * (0.12 + i * 0.04), dy: 0.1 + (i % 3) * 0.04, d: i * 0.18, s: 0.08 }))
}

function hash(s: string) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }

export function PetView({ look, scale = 3, animate = true, className = '', label, reaction = null, reactionKey = 0, sleeping = false }: {
  look: PetLook; scale?: number; animate?: boolean; className?: string; label?: string
  /** Tepki: 'pat' sevme (ezilme + kalpler), 'happy' sevinç (zıplama + ışıltı), 'eat' yeme (çiğneme + kırıntı) */
  reaction?: PetReaction | null
  /** Değişince tepki yeniden oynar; 0/boş iken tepki oynamaz */
  reactionKey?: number
  /** Uyuyor: gözler kapalı, yavaş nefes, uçuşan "z" */
  sleeping?: boolean
}) {
  const key = `pet3:${look.species}:${look.color}:${look.stage}:${JSON.stringify(look.outfit ?? {})}`
  const src = gridToURL(key, () => renderPetStrip(look))
  const px = Math.round(OLD_CANVAS * scale * (STAGE_SCALE[look.stage] ?? 1))
  const aura = look.outfit?.AURA ? AURA[look.outfit.AURA] : undefined
  const legend = look.stage >= 4
  const a = petAnchors(look)
  const playing = reaction && reactionKey ? reaction : null
  const seed = hash(key)
  const vars = { width: px, height: px, '--pd': `-${(seed % 6500) / 1000}s` } as CSSProperties
  const face = [animate && !sleeping ? 'pet-face' : '', playing ? (playing === 'eat' ? 'pet-chew' : 'pet-joy') : ''].join(' ')
  const bodyCls = animate ? (sleeping ? 'pet-sleep' : 'pet-breathe') : ''
  return (
    <span className={`relative inline-block ${className}`} style={vars} aria-label={label} role={label ? 'img' : undefined}>
      {legend && <span className="absolute inset-[12%] rounded-full pet-legend pointer-events-none" />}
      <span key={'r' + reactionKey} className={`absolute inset-0 pet-origin ${playing ? 'pet-r-' + playing : ''}`}>
        <span className={`absolute inset-0 pet-origin ${bodyCls}`}>
          <span className={`px pet-sprite absolute inset-0 ${face}`}
            style={{ backgroundImage: `url("${src}")`, backgroundPosition: POS[sleeping ? 1 : 0], filter: legend ? 'drop-shadow(0 0 4px rgba(255,215,90,.8))' : undefined }} />
        </span>
      </span>
      {aura && Array.from({ length: aura.n }, (_, i) => (
        <span key={i} className="pet-aura absolute pointer-events-none font-pixel leading-none"
          style={{ left: `${10 + ((i * 37) % 80)}%`, top: `${20 + ((i * 53) % 55)}%`, color: aura.color, fontSize: Math.max(8, px * 0.13), animationDelay: `${i * 0.45}s`, textShadow: `0 0 4px ${aura.color}` }}>{aura.ch}</span>
      ))}
      {playing && (
        <span key={'f' + reactionKey} className="absolute inset-0 pointer-events-none">
          {fxFor(playing, a).map((f, i) => {
            const sz = Math.max(6, Math.round(px * f.s))
            return <span key={i} className="px pet-fx" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: sz, height: sz, backgroundImage: `url("${FX[f.k]()}")`, animationDelay: `${f.d}s`, '--dx': `${Math.round(f.dx * px)}px`, '--dy': `${Math.round(f.dy * px)}px` } as CSSProperties} />
          })}
        </span>
      )}
      {sleeping && [0, 1, 2].map(i => (
        <span key={'z' + i} className="pet-z absolute pointer-events-none font-pixel leading-none"
          style={{ left: `${(a.cx + 0.16 + i * 0.07) * 100}%`, top: `${(a.head - 0.02 - i * 0.04) * 100}%`, fontSize: Math.max(11, px * (0.16 + i * 0.04)), animationDelay: `${i * 0.8}s` }}>{i ? 'Z' : 'z'}</span>
      ))}
    </span>
  )
}
