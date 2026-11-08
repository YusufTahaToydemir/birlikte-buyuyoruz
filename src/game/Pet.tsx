// Ortak evcil dostun ekrandaki hâli: çizim + evreye göre boy + ışık (aura) parçacıkları + efsanevi parıltı.
import { gridToURL } from './pixel'
import { PET_CANVAS, renderPetLook, STAGE_SCALE, type PetLook } from './art/pets'

const AURA: Record<string, { ch: string; color: string; n: number }> = {
  a_hearts: { ch: '♥', color: '#ff6aa8', n: 4 },
  a_stars: { ch: '★', color: '#ffd75a', n: 5 },
  a_bubbles: { ch: '○', color: '#9ad8ff', n: 5 },
  a_fire: { ch: '✦', color: '#ff8a3d', n: 7 },
}

export function PetView({ look, scale = 3, animate = true, className = '', label }: { look: PetLook; scale?: number; animate?: boolean; className?: string; label?: string }) {
  const key = `pet2:${look.species}:${look.color}:${look.stage}:${JSON.stringify(look.outfit ?? {})}`
  const src = gridToURL(key, () => renderPetLook(look))
  const px = Math.round(PET_CANVAS * scale * (STAGE_SCALE[look.stage] ?? 1))
  const aura = look.outfit?.AURA ? AURA[look.outfit.AURA] : undefined
  const legend = look.stage >= 4
  return (
    <span className={`relative inline-block ${className}`} style={{ width: px, height: px }} aria-label={label} role={label ? 'img' : undefined}>
      {legend && <span className="absolute inset-[12%] rounded-full pet-legend pointer-events-none" />}
      <img src={src} width={px} height={px} alt="" draggable={false} className={`px relative ${animate ? 'pet-hop' : ''}`}
        style={legend ? { filter: 'drop-shadow(0 0 4px rgba(255,215,90,.8))' } : undefined} />
      {aura && Array.from({ length: aura.n }, (_, i) => (
        <span key={i} className="pet-aura absolute pointer-events-none font-pixel leading-none"
          style={{ left: `${10 + ((i * 37) % 80)}%`, top: `${20 + ((i * 53) % 55)}%`, color: aura.color, fontSize: Math.max(8, px * 0.13), animationDelay: `${i * 0.45}s`, textShadow: `0 0 4px ${aura.color}` }}>{aura.ch}</span>
      ))}
    </span>
  )
}
