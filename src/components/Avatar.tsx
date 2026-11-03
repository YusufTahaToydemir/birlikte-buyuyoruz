import type { AvatarConfig } from '../lib/api'

/**
 * GEÇİCİ KARAKTER (yer tutucu). Nihai sanat gelene kadar katmanlı SVG.
 * Katman sırası şartname §3.2 ile aynı: arka efekt → arka saç → gövde/ten → kıyafet → ön saç/başörtüsü → yüz → aksesuar → el objesi → ön efekt.
 * Tüm katmanlar aynı tuvali (0 0 200 260) ve aynı pivotu (ayak zemini y=240, merkez x=100) kullanır.
 */
export const SKIN_TONES = ['#F6D7C3', '#E2B596', '#B98060']
export const HAIR_COLORS = ['#3B2A22', '#7A4A2B', '#C89A6A']
export const OUTFIT_COLORS: Record<string, { main: string; accent: string }> = {
  outfit_starter: { main: '#A7C4B5', accent: '#F6E6EC' },
  outfit_spring: { main: '#F4C2C2', accent: '#FFF4E0' },
  outfit_book: { main: '#8C9DB5', accent: '#F1E4D1' },
  outfit_picnic: { main: '#E8BB60', accent: '#FFFFFF' },
  outfit_evening: { main: '#815266', accent: '#E8BB60' },
  outfit_starry: { main: '#352C3A', accent: '#E8BB60' },
}

export interface AvatarProps {
  config: AvatarConfig
  equipped?: Record<string, string>
  size?: number
  mood?: 'neutral' | 'joy' | 'support'
  animate?: boolean
  className?: string
  label?: string
}

export function Avatar({ config, equipped = {}, size = 160, mood = 'neutral', animate = true, className = '', label }: AvatarProps) {
  const type = config.type ?? 'lady'
  const skin = SKIN_TONES[config.skin ?? 0] ?? SKIN_TONES[0]
  const hairColor = HAIR_COLORS[config.hairColor ?? 0] ?? HAIR_COLORS[0]
  const hairStyle = config.hair ?? 0 // hanımefendi: 0 açık saç, 1 topuz, 2 başörtüsü · beyefendi: 0 kısa, 1 dalgalı, 2 sakallı
  const outfitKey = equipped.outfit ?? config.outfit ?? 'outfit_starter'
  const outfit = OUTFIT_COLORS[outfitKey] ?? OUTFIT_COLORS.outfit_starter
  const headscarf = type === 'lady' && hairStyle === 2
  const smile = mood === 'joy' ? 'M84 118 Q100 134 116 118' : 'M86 118 Q100 128 114 118'

  return (
    <svg
      viewBox="0 0 200 260"
      width={size}
      height={size * 1.3}
      role="img"
      aria-label={label ?? (type === 'lady' ? 'Hanımefendi karakteri' : 'Beyefendi karakteri')}
      className={`${animate ? 'anim-breathe' : ''} ${className}`}
    >
      {/* arka efekt */}
      {equipped.effect === 'effect_glow' && <circle cx="100" cy="130" r="95" fill="#E8BB60" opacity="0.18" />}
      {/* arka saç */}
      {!headscarf && type === 'lady' && hairStyle === 0 && <path d="M58 92 Q52 170 72 190 L128 190 Q148 170 142 92 Z" fill={hairColor} />}
      {/* gövde */}
      <ellipse cx="100" cy="236" rx="46" ry="8" fill="#000" opacity="0.08" />
      <path d="M70 150 Q100 140 130 150 L140 236 L60 236 Z" fill={outfit.main} />
      <path d="M85 150 Q100 146 115 150 L112 200 L88 200 Z" fill={outfit.accent} opacity="0.9" />
      {/* kollar / eller */}
      <path d="M70 156 Q50 180 58 208" stroke={outfit.main} strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M130 156 Q150 180 142 208" stroke={outfit.main} strokeWidth="16" strokeLinecap="round" fill="none" />
      <circle cx="58" cy="210" r="9" fill={skin} />
      <circle cx="142" cy="210" r="9" fill={skin} />
      {/* boyun ve baş */}
      <rect x="90" y="132" width="20" height="18" rx="6" fill={skin} />
      <ellipse cx="100" cy="96" rx="48" ry="50" fill={skin} />
      {/* ön saç / başörtüsü */}
      {headscarf && (
        <>
          <path d="M48 100 Q50 36 100 36 Q150 36 152 100 L152 150 Q130 156 100 156 Q70 156 48 150 Z" fill={outfit.main === '#352C3A' ? '#6B6070' : outfit.main} />
          <ellipse cx="100" cy="100" rx="38" ry="44" fill={skin} />
        </>
      )}
      {!headscarf && type === 'lady' && hairStyle === 0 && <path d="M52 92 Q54 44 100 44 Q146 44 148 92 Q130 70 100 72 Q70 70 52 92 Z" fill={hairColor} />}
      {!headscarf && type === 'lady' && hairStyle === 1 && (
        <>
          <circle cx="100" cy="46" r="18" fill={hairColor} />
          <path d="M52 92 Q54 48 100 48 Q146 48 148 92 Q130 72 100 74 Q70 72 52 92 Z" fill={hairColor} />
        </>
      )}
      {type === 'gent' && hairStyle !== 1 && <path d="M54 86 Q58 46 100 46 Q142 46 146 86 Q124 68 100 70 Q76 68 54 86 Z" fill={hairColor} />}
      {type === 'gent' && hairStyle === 1 && <path d="M50 90 Q54 40 100 42 Q148 40 150 90 Q140 60 100 64 Q60 60 50 90 Z" fill={hairColor} />}
      {type === 'gent' && hairStyle === 2 && <path d="M66 112 Q100 150 134 112 Q128 136 100 140 Q72 136 66 112 Z" fill={hairColor} opacity="0.85" />}
      {/* yüz */}
      <circle cx="84" cy="98" r="4.5" fill="#352C3A" />
      <circle cx="116" cy="98" r="4.5" fill="#352C3A" />
      <path d={smile} stroke="#9A492F" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="74" cy="112" r="6" fill="#F4C2C2" opacity="0.7" />
      <circle cx="126" cy="112" r="6" fill="#F4C2C2" opacity="0.7" />
      {/* aksesuar */}
      {equipped.head === 'acc_flower_brooch' && (
        <g transform="translate(120 150)">
          <circle r="6" fill="#F4C2C2" />
          <circle r="2.5" fill="#E8BB60" />
        </g>
      )}
      {/* el objesi */}
      {equipped.hand === 'hand_book_cup' && <rect x="132" y="196" width="22" height="16" rx="3" fill="#815266" />}
      {/* ön efekt */}
      {mood === 'support' && <text x="150" y="60" fontSize="26" aria-hidden="true">💛</text>}
      {mood === 'joy' && (
        <g className="anim-sparkle" aria-hidden="true">
          <text x="30" y="60" fontSize="22">✨</text>
          <text x="150" y="40" fontSize="18">✨</text>
        </g>
      )}
    </svg>
  )
}
