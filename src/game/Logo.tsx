// Kyron logosu: piksel amblem (scripts/make-icons.mjs ile aynı çizim) + harf harf düşen altın yazı.
export const EMBLEM_SRC = `${import.meta.env.BASE_URL}icons/emblem.png`

export function Emblem({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`emblem-wrap ${className}`} style={{ width: size, height: size }}>
      <span className="emblem-glow" aria-hidden="true" />
      <img src={EMBLEM_SRC} width={size} height={size} alt="" className="px relative bob" draggable={false} />
    </div>
  )
}

export function Wordmark({ size = 60, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`logo-word ${className}`} style={{ fontSize: size }} role="img" aria-label="Kyron">
      {[...'KYRON'].map((ch, i) => (
        <span key={i} className="logo-ch" data-ch={ch} style={{ animationDelay: `${0.15 + i * 0.09}s, ${1.4 + i * 0.12}s`, '--i': i } as React.CSSProperties} aria-hidden="true">{ch}</span>
      ))}
    </div>
  )
}

/** Açılış: oturum ve oyun yüklenirken tam ekran amblem + yazı + yükleme çubuğu */
export function Splash() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 pb-16" role="status" aria-label="Yükleniyor">
      <Emblem size={128} />
      <Wordmark size={56} />
      <div className="splash-bar mt-4" aria-hidden="true"><span /></div>
    </div>
  )
}
