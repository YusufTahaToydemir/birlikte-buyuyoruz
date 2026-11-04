// Kyron uygulama ikonları: gece göğünde çapraz kılıçlar + iki renkli kalkan (ikiniz) + altın K.
// Piksel ızgarada çizilir, en yakın komşu ile büyütülür. Çalıştır: npm run icons
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]

/** G×G ızgara; o = amblemin kaydırması (maskable için küçük amblem), bg = gök zemini, round = köşe kırpma */
function draw(G, o, { bg = true, round = false, emblem = true } = {}) {
  const px = new Uint8Array(G * G * 4)
  const set = (x, y, c) => {
    x += o; y += o
    if (x < 0 || y < 0 || x >= G || y >= G) return
    px.set(hex(c), (y * G + x) * 4)
  }
  const raw = (x, y, c) => px.set(hex(c), (y * G + x) * 4)

  if (bg) {
    const c = (G - 1) / 2
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const d = Math.hypot(x - c, y - c * 0.8) / G
      const dither = (x + y) % 2 === 0 ? 0.015 : -0.015
      const v = d + dither
      raw(x, y, v < 0.2 ? '#3a2a6a' : v < 0.3 ? '#2e2256' : v < 0.42 ? '#231a42' : '#17112a')
    }
    // yıldızlar (ızgara oranında)
    for (const [fx, fy, col] of [[0.12, 0.14, '#ffe9a8'], [0.84, 0.1, '#ffffff'], [0.9, 0.62, '#b98aff'], [0.08, 0.7, '#4cc9f0'], [0.22, 0.9, '#ffe9a8'], [0.78, 0.88, '#ffffff'], [0.5, 0.05, '#b98aff']]) {
      const x = Math.round(fx * (G - 1)), y = Math.round(fy * (G - 1))
      raw(x, y, col)
    }
    if (round) {
      const cut = [4, 2, 1, 1]
      for (let i = 0; i < cut.length; i++) for (let k = 0; k < cut[i]; k++) for (const [x, y] of [[k, i], [G - 1 - k, i], [k, G - 1 - i], [G - 1 - k, G - 1 - i]]) px.set([0, 0, 0, 0], (y * G + x) * 4)
    }
  }
  if (!emblem) return { px, G }

  // ---- çapraz kılıçlar (32'lik ızgarada) ----
  const sword = (m) => {
    const X = (x) => (m ? 31 - x : x)
    for (let i = 4; i <= 21; i++) {
      set(X(i), i, '#f4f8ff')
      set(X(i + 1), i, '#aebbd4')
      set(X(i), i + 1, '#5d6a86')
    }
    set(X(4), 4, '#ffffff')
    for (let k = -3; k <= 3; k++) { set(X(22 + k), 22 - k, '#ffcc3a'); set(X(22 + k), 23 - k, '#a86a12') }
    set(X(23), 23, '#7a4a2a'); set(X(24), 24, '#5a3418'); set(X(24), 23, '#8f5a32')
    for (const [dx, dy, c] of [[25, 25, '#ffe066'], [26, 25, '#ffcc3a'], [25, 26, '#ffcc3a'], [26, 26, '#a86a12']]) set(X(dx), dy, c)
  }
  sword(false); sword(true)

  // ---- kalkan (şekil maskesi): x 9..22, y 7..27, yumuşak kavisle sivri uç ----
  const S = new Set()
  const inS = (x, y) => S.has(x * 64 + y)
  for (let y = 7; y <= 27; y++) {
    const t = y <= 18 ? 0 : (y - 18) / 9
    const inset = Math.min(6, Math.round(6 * t ** 1.6))
    for (let x = 9 + inset; x <= 22 - inset; x++) S.add(x * 64 + y)
  }
  const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const n8 = [...n4, [1, 1], [1, -1], [-1, 1], [-1, -1]]
  for (let y = 5; y <= 29; y++) for (let x = 7; x <= 24; x++) {
    if (!inS(x, y) && n8.some(([dx, dy]) => inS(x + dx, y + dy))) set(x, y, '#0c0816')
  }
  const L = ['#5a86ff', '#3f68dc', '#2f4fb4'], R = ['#ff74a8', '#e0518c', '#b5386e']
  for (let y = 7; y <= 27; y++) for (let x = 7; x <= 24; x++) {
    if (!inS(x, y)) continue
    const rim = n4.some(([dx, dy]) => !inS(x + dx, y + dy))
    if (rim) { set(x, y, y === 7 || x <= 15 ? '#ffe066' : '#d99a1c'); continue }
    const bevel = n4.some(([dx, dy]) => !inS(x + dx * 2, y + dy * 2))
    const left = x <= 15
    const shade = y >= 22 ? 2 : y >= 16 ? 1 : 0
    set(x, y, bevel && (y <= 9 || x <= 11) ? (left ? '#9cb6ff' : '#ffb0cf') : (left ? L : R)[shade])
  }
  // altın K, koyu dış çizgili
  const K = ['XX...XX', 'XX..XX.', 'XX.XX..', 'XXXX...', 'XXX....', 'XXXX...', 'XX.XX..', 'XX..XX.', 'XX...XX']
  const kx = 12, ky = 10
  const inK = (x, y) => K[y - ky]?.[x - kx] === 'X'
  for (let y = ky - 1; y <= ky + 9; y++) for (let x = kx - 1; x <= kx + 7; x++) {
    if (!inK(x, y) && n8.some(([dx, dy]) => inK(x + dx, y + dy))) set(x, y, '#160f22')
  }
  K.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'X') set(kx + i, ky + j, j < 3 ? '#fff6c4' : j < 6 ? '#ffe066' : '#ffc23a') }))
  // parıltı
  for (const [x, y, c] of [[27, 12, '#ffffff'], [26, 12, '#ffe9a8'], [28, 12, '#ffe9a8'], [27, 11, '#ffe9a8'], [27, 13, '#ffe9a8']]) set(x, y, c)
  return { px, G }
}

const png = ({ px, G }, size) =>
  sharp(Buffer.from(px), { raw: { width: G, height: G, channels: 4 } }).resize(size, size, { kernel: 'nearest' }).png()

mkdirSync('public/icons', { recursive: true })
await png(draw(32, 0, { round: true }), 192).toFile('public/icons/icon-192.png')
await png(draw(32, 0, { round: true }), 512).toFile('public/icons/icon-512.png')
await png(draw(40, 4), 512).toFile('public/icons/icon-maskable-512.png')
await png(draw(32, 0), 180).toFile('public/icons/apple-touch-icon.png')
await png(draw(32, 0, { round: true }), 64).toFile('public/icons/favicon-64.png')
// uygulama içi amblem (saydam zemin): açılış ve başlık ekranı
await png(draw(32, 0, { bg: false }), 256).toFile('public/icons/emblem.png')
console.log('Kyron ikonları yazıldı')
