// Ortak kale: parçalar altınla alınır, seviye arttıkça büyür. Sahne 160×80, piksel piksel çizilir.
import { shade } from '../pixel'
import type { TimeOfDay } from './scene'

export type CastleParts = Record<string, number>

export const CASTLE_CATALOG: Array<{ key: string; name: string; icon: string; cost: number; max: number; bonus?: string }> = [
  { key: 'wall', name: 'Sur', icon: 'shield', cost: 150, max: 3 },
  { key: 'gate', name: 'Kapı', icon: 'lock', cost: 200, max: 2 },
  { key: 'tower_l', name: 'Batı Kulesi', icon: 'stairs', cost: 300, max: 3 },
  { key: 'tower_r', name: 'Doğu Kulesi', icon: 'stairs', cost: 300, max: 3 },
  { key: 'keep', name: 'Ana Kule', icon: 'crown', cost: 600, max: 3 },
  { key: 'flag', name: 'Sancak', icon: 'flame', cost: 100, max: 1 },
  { key: 'garden', name: 'Bahçe', icon: 'flower', cost: 250, max: 3, bonus: 'Düzen görevleri +%1 altın / seviye' },
  { key: 'well', name: 'Kuyu', icon: 'water', cost: 200, max: 2, bonus: '+3 can / seviye' },
  { key: 'library', name: 'Kütüphane', icon: 'book', cost: 400, max: 3, bonus: 'Zekâ görevleri +%1 XP / seviye' },
  { key: 'mosque', name: 'Mescit', icon: 'pray', cost: 500, max: 3, bonus: 'Ruh görevleri +%1 hasar / seviye' },
  { key: 'forge', name: 'Demirci', icon: 'sword', cost: 400, max: 3, bonus: 'Güç görevleri +%1 XP / seviye' },
  { key: 'kitchen', name: 'Mutfak', icon: 'apple', cost: 300, max: 2, bonus: 'Sabah +2 can / seviye' },
  { key: 'market', name: 'Pazar', icon: 'bag', cost: 400, max: 2, bonus: 'Tüm görevler +%1 altın / seviye' },
  { key: 'stable', name: 'Ahır', icon: 'pet', cost: 350, max: 2, bonus: 'Yuvada +1 evcil dost yeri / seviye' },
  { key: 'fountain', name: 'Çeşme', icon: 'water', cost: 250, max: 1 },
  { key: 'orchard', name: 'Meyve Bahçesi', icon: 'apple', cost: 350, max: 2 },
  { key: 'windmill', name: 'Yel Değirmeni', icon: 'gear', cost: 450, max: 1 },
  { key: 'bridge', name: 'Köprü', icon: 'boot', cost: 300, max: 1 },
  { key: 'pond', name: 'Gölet', icon: 'moon', cost: 300, max: 1 },
  { key: 'lantern', name: 'Fenerler', icon: 'lamp', cost: 150, max: 2 },
  { key: 'bell', name: 'Çan Kulesi', icon: 'music', cost: 500, max: 1 },
  { key: 'watchtower', name: 'Gözcü Kulesi', icon: 'target', cost: 450, max: 2 },
  { key: 'bath', name: 'Hamam', icon: 'sparkle', cost: 450, max: 1 },
  { key: 'observatory', name: 'Rasathane', icon: 'star', cost: 700, max: 1 },
  { key: 'banner', name: 'Çift Arması', icon: 'heart', cost: 1000, max: 1 },
]
export const castleCost = (key: string, level: number) => (CASTLE_CATALOG.find(c => c.key === key)?.cost ?? 0) * (level + 1)
export const CASTLE_TITLES: Array<[number, string]> = [[0, 'Boş Arazi'], [3, 'Kamp'], [8, 'Köy'], [16, 'Kasaba'], [26, 'Kale'], [38, 'Saray'], [50, 'Efsane Kale']]
export const castleTitle = (total: number) => [...CASTLE_TITLES].reverse().find(t => total >= t[0])![1]

const C = { stone: '#9a9bb5', stoneD: '#6e6f8a', stoneL: '#c4c5db', roof: '#c23a4a', roofD: '#8a2434', wood: '#8a5a32', woodD: '#5a3a1e', gold: '#ffcc3a', green: '#4fa85a', greenD: '#2f6e3a', water: '#4c9df0', outline: '#160f22', window: '#ffe08a', windowN: '#ffd36a' }

export function drawCastle(canvas: HTMLCanvasElement, parts: CastleParts, tod: TimeOfDay) {
  const w = 160, h = 80
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const px = (x: number, y: number, c: string, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), ww, hh) }
  const lv = (k: string) => parts[k] ?? 0
  const night = tod === 'night' || tod === 'dusk'
  const dim = (c: string) => (night ? shade(c, -0.28) : c)
  const ground = 64

  // gök + zemin
  const sky = tod === 'night' ? ['#0b0f2a', '#1b2550'] : tod === 'dawn' ? ['#3a3f86', '#e07ba0'] : tod === 'dusk' ? ['#3a2a6a', '#e0605a'] : ['#5aa9ff', '#a3d6ff']
  px(0, 0, sky[0], w, 34); px(0, 34, sky[1], w, 30)
  if (tod === 'night') for (let i = 0; i < 26; i++) px((i * 37) % w, (i * 13) % 30, i % 3 ? '#c8d0ff' : '#ffffff')
  px(0, ground, dim('#5aae5a'), w, h - ground); px(0, ground, dim('#6cc24a'), w, 2)
  px(0, ground + 8, dim('#4a8a3a'), w, 1)
  // uzak tepeler
  for (let x = 0; x < w; x++) { const y = 58 - Math.round(4 * Math.sin(x / 11) + 3 * Math.sin(x / 5 + 1)); px(x, y, dim('#3f7a4a'), 1, ground - y) }

  const rect = (x: number, y: number, ww: number, hh: number, c: string) => { px(x - 1, y - 1, C.outline, ww + 2, hh + 2); px(x, y, dim(c), ww, hh) }
  const bricks = (x: number, y: number, ww: number, hh: number) => { for (let yy = y + 2; yy < y + hh; yy += 4) for (let xx = x + ((yy / 4) % 2 ? 2 : 0); xx < x + ww - 1; xx += 5) px(xx, yy, dim(C.stoneD), 2, 1) }
  const crenel = (x: number, y: number, ww: number) => { for (let xx = x; xx < x + ww; xx += 4) { px(xx - 1, y - 3, C.outline, 4, 3); px(xx, y - 2, dim(C.stoneL), 2, 2) } }
  const window_ = (x: number, y: number) => px(x, y, night ? C.windowN : '#3a2a5a', 2, 3)
  const tower = (x: number, y: number, ww: number, hh: number, roof: boolean) => {
    rect(x, y, ww, hh, C.stone); bricks(x, y, ww, hh); crenel(x, y, ww)
    window_(x + Math.floor(ww / 2) - 1, y + 4); if (hh > 14) window_(x + Math.floor(ww / 2) - 1, y + 11)
    if (roof) { for (let i = 0; i < Math.ceil(ww / 2) + 2; i++) px(x - 2 + i, y - 4 - i, i === 0 ? C.outline : dim(C.roof), ww + 4 - 2 * i, 1); px(x - 2, y - 4, C.outline, ww + 4, 1) }
  }

  // köprü + gölet (arka)
  if (lv('pond')) { px(118, ground + 2, C.outline, 30, 8); px(119, ground + 3, dim(C.water), 28, 6); px(122, ground + 4, dim('#8ad0ff'), 8, 1) }
  if (lv('bridge')) { rect(120, ground - 2, 24, 3, C.wood); px(122, ground - 5, dim(C.woodD), 2, 3); px(140, ground - 5, dim(C.woodD), 2, 3) }

  // sur
  const wl = lv('wall')
  if (wl) { const hh = 6 + wl * 3; rect(30, ground - hh, 100, hh, C.stone); bricks(30, ground - hh, 100, hh); crenel(30, ground - hh, 100) }
  // kapı
  const gl = lv('gate')
  if (gl) { const hh = 8 + gl * 3; rect(72, ground - hh, 16, hh, C.stoneD); px(76, ground - hh + 3, C.outline, 8, hh - 3); px(77, ground - hh + 4, dim(C.woodD), 6, hh - 4); if (gl > 1) { px(74, ground - hh - 2, dim(C.stoneL), 12, 2) } }
  // kuleler
  const tl = lv('tower_l'); if (tl) tower(34, ground - 16 - tl * 6, 12, 16 + tl * 6, tl >= 2)
  const tr = lv('tower_r'); if (tr) tower(114, ground - 16 - tr * 6, 12, 16 + tr * 6, tr >= 2)
  const kp = lv('keep'); if (kp) { tower(66, ground - 24 - kp * 8, 28, 24 + kp * 8, kp >= 2); if (kp >= 3) { px(78, ground - 24 - kp * 8 - 4, C.outline, 4, 4); px(79, ground - 24 - kp * 8 - 3, dim(C.gold), 2, 2) } }
  // sancak
  if (lv('flag')) { const y = ground - 24 - Math.max(1, kp) * 8 - 12; px(79, y, C.outline, 1, 12); px(80, y, dim('#ff4d6d'), 7, 4); px(80, y + 4, dim('#b0213a'), 7, 1) }
  // gözcü kulesi
  const wt = lv('watchtower'); if (wt) { rect(8, ground - 14 - wt * 4, 6, 14 + wt * 4, C.wood); px(6, ground - 14 - wt * 4, C.outline, 10, 2); px(7, ground - 14 - wt * 4 - 1, dim(C.woodD), 8, 2); if (night) px(10, ground - 12 - wt * 4, C.gold, 2, 2) }
  // çan kulesi
  if (lv('bell')) { tower(100, ground - 30, 8, 30, true); px(103, ground - 26, dim(C.gold), 3, 3) }
  // rasathane
  if (lv('observatory')) { rect(144, ground - 18, 10, 18, C.stoneD); for (let i = 0; i < 6; i++) px(144 + i, ground - 18 - i, dim('#7ea0ff'), 10 - 2 * i, 1); px(148, ground - 22, dim(C.gold), 2, 3) }
  // yel değirmeni
  if (lv('windmill')) { rect(14, ground - 18, 8, 18, C.stoneL); px(17, ground - 24, C.outline, 2, 6); px(10, ground - 20, dim('#f4f4f4'), 16, 1); px(17, ground - 27, dim('#f4f4f4'), 1, 14); px(17, ground - 21, dim(C.roofD), 2, 2) }
  // demirci / kütüphane / mescit / mutfak / hamam / pazar / ahır: ön sıra küçük binalar
  const house = (x: number, roofCol: string, l: number, sign: string) => { if (!l) return; const hh = 8 + l * 2; rect(x, ground - hh, 14, hh, C.stoneL); for (let i = 0; i < 5; i++) px(x - 1 + i, ground - hh - i - 1, i === 0 ? C.outline : dim(roofCol), 16 - 2 * i, 1); px(x + 6, ground - 5, dim(C.woodD), 3, 5); window_(x + 2, ground - hh + 2); px(x + 10, ground - hh + 2, dim(sign), 2, 2) }
  house(36, C.roof, lv('forge'), '#ff6b5a')
  house(52, '#4c6fd0', lv('library'), '#6aa8ff')
  house(94, '#3fae5a', lv('mosque'), '#ffd75a')
  house(110, '#d08a4a', lv('kitchen'), '#ffcc3a')
  if (lv('mosque')) { px(99, ground - 12 - lv('mosque') * 2 - 7, C.outline, 4, 1); px(100, ground - 12 - lv('mosque') * 2 - 10, dim(C.gold), 2, 3) }
  if (lv('market')) { rect(128, ground - 7, 14, 7, C.wood); for (let i = 0; i < 14; i += 2) px(128 + i, ground - 9, dim(i % 4 ? '#ffcc3a' : '#ff4d6d'), 2, 2) }
  if (lv('stable')) { rect(2, ground - 8, 12, 8, C.woodD); px(4, ground - 4, dim('#d08a4a'), 3, 2); px(8, ground - 4, dim('#f4f4f4'), 3, 2) }
  if (lv('bath')) { rect(146, ground - 9, 12, 9, C.stoneL); for (let i = 0; i < 4; i++) px(148 + i, ground - 9 - i, dim('#7ea0ff'), 8 - 2 * i, 1); if (!night) px(150, ground - 14, '#ffffff', 1, 2) }
  // bahçe / meyve / kuyu / çeşme / fenerler (ön)
  const gd = lv('garden'); for (let i = 0; i < gd * 4; i++) { const x = 40 + i * 5; px(x, ground + 4, dim(i % 2 ? '#ff8ab5' : '#ffcc3a'), 2, 2); px(x, ground + 6, dim(C.greenD), 2, 1) }
  const oc = lv('orchard'); for (let i = 0; i < oc * 3; i++) { const x = 100 + i * 7; px(x + 1, ground + 1, dim(C.woodD), 2, 5); px(x - 1, ground - 3, C.outline, 6, 5); px(x, ground - 2, dim(C.green), 4, 3); px(x + 1, ground - 1, dim('#ff4d6d'), 1, 1) }
  if (lv('well')) { rect(60, ground + 2, 8, 5, C.stoneD); px(61, ground - 2, C.outline, 1, 4); px(66, ground - 2, C.outline, 1, 4); px(60, ground - 3, dim(C.roofD), 8, 1); if (lv('well') > 1) px(63, ground + 3, dim(C.water), 2, 2) }
  if (lv('fountain')) { rect(84, ground + 3, 10, 4, C.stoneL); px(88, ground - 1, dim(C.water), 2, 4); px(86, ground, dim('#8ad0ff'), 1, 1); px(91, ground, dim('#8ad0ff'), 1, 1) }
  const ln = lv('lantern'); for (let i = 0; i < ln * 2; i++) { const x = 26 + i * 36; px(x, ground - 6, C.outline, 1, 6); px(x - 1, ground - 8, night ? C.gold : dim('#d0d0e0'), 3, 2); if (night) px(x - 3, ground - 10, 'rgba(255,220,100,.25)', 7, 6) }
  // çift arması
  if (lv('banner')) { px(74, ground - 36 - Math.max(1, kp) * 8, C.outline, 12, 10); px(75, ground - 35 - Math.max(1, kp) * 8, dim('#4a78f0'), 5, 8); px(80, ground - 35 - Math.max(1, kp) * 8, dim('#f06aa0'), 5, 8); px(78, ground - 33 - Math.max(1, kp) * 8, dim(C.gold), 4, 4) }
}
