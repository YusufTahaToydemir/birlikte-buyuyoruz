// Ortak evcil dostlar: 7 tür, bebek (12x12) ve yetişkin (16x16) çizimi, renkler, aksesuarlar.
// Tuval 24x24: dost alta ortalanır, üstte şapka, yanlarda kanat için yer kalır.
// Aksesuar yerleri çizimden otomatik bulunur: baş üstü (ilk ≥4'lük dolu dizi), gözler ('E'), boyun (tür başına satır).
import { makeGrid, outline, paint, shade, type Grid, type Palette } from '../pixel'

export const PET_CANVAS = 24
export type PetSpecies = 'cat' | 'dog' | 'bunny' | 'fox' | 'owl' | 'dragon' | 'phoenix'
export type PetSlot = 'HEAD' | 'NECK' | 'FACE' | 'BACK' | 'AURA'
export interface PetLook { species: PetSpecies; color: string; stage: number; outfit: Partial<Record<PetSlot, string>> }

const EYE = { E: '#2a1d33', w: '#ffffff' }

interface SpeciesArt {
  name: string
  main: [string, string]           // renk değişiminde boyanan harfler (ana, koyu)
  pal: Palette
  colors: Array<{ name: string; set: Palette }>
  adult: string[]; adultNeck: number
  baby: string[]; babyNeck: number
}

export const PET_SPECIES: Record<PetSpecies, SpeciesArt> = {
  cat: {
    name: 'Kedi', main: ['O', 'o'],
    pal: { O: '#f0a040', o: '#c07020', W: '#fff4e0', P: '#ff8aa0', ...EYE },
    colors: [
      { name: 'Turuncu', set: {} },
      { name: 'Gri', set: { O: '#a8a8bc', o: '#6e6e88' } },
      { name: 'Kara', set: { O: '#3e3650', o: '#262033', E: '#ffd75a', w: '#fff4b0' } },
      { name: 'Kar', set: { O: '#f4f0ff', o: '#c4bcd8', W: '#ffffff' } },
    ],
    adult: [
      '................',
      '..o.......o.....',
      '..oO.....Oo.....',
      '..OOOOOOOOO.....',
      '.OOOOOOOOOOO....',
      '.OOEwOOOEwOO....',
      '.OOEEOOOEEOO....',
      '.OOOOOPOOOOO....',
      '..OOWWWWWOO..o..',
      '...OOOOOOO....O.',
      '..OOOWWWOOO...O.',
      '..OOWWWWWOO..O..',
      '..OOWWWWWOOOOO..',
      '..OOOWWWOOOO....',
      '..oO.oO.oO.oO...',
      '................',
    ], adultNeck: 9,
    baby: [
      '............',
      '.o......o...',
      '.oO....Oo...',
      '.OOOOOOOO...',
      'OOOOOOOOOO..',
      'OEwOOOOEwO..',
      'OEEOOOOEEO..',
      'OOOOPPOOOO..',
      '.OOWWWWOO...',
      '..OWWWWO..o.',
      '..OOOOOOOOo.',
      '..oO..oO....',
    ], babyNeck: 9,
  },
  dog: {
    name: 'Köpek', main: ['O', 'b'],
    pal: { O: '#d8a46a', b: '#8a5a32', W: '#fff4e0', N: '#2a1d33', P: '#ff7a8a', o: '#a87040', ...EYE },
    colors: [
      { name: 'Kahve', set: {} },
      { name: 'Krem', set: { O: '#f2e0b8', b: '#c89a60', o: '#d0b080' } },
      { name: 'Kara', set: { O: '#4a4058', b: '#2a2236', o: '#3a3048', E: '#2a1d33' } },
      { name: 'Kızıl', set: { O: '#d8743a', b: '#8a3a1a', o: '#a85020' } },
    ],
    adult: [
      '................',
      '................',
      '...OOOOOOOO.....',
      '..bOOOOOOOOb....',
      '.bbOOOOOOOObb...',
      '.bbOEwOOEwObb...',
      '.bbOEEOOEEObb...',
      '..bOOWWWWOOb....',
      '...OWWNNWWO.....',
      '....WWPPWW...o..',
      '...OOOOOOOO..O..',
      '..OOOWWWWOOOOO..',
      '..OOWWWWWWOOO...',
      '..OOOWWWWOOO....',
      '..oO.oO.oO.oO...',
      '................',
    ], adultNeck: 10,
    baby: [
      '............',
      '............',
      '..OOOOOOOO..',
      '.bOOOOOOOOb.',
      'bbOEwOOEwObb',
      'bbOEEOOEEObb',
      '.bOOWNNWOOb.',
      '..OWWPPWWO..',
      '...OOOOOO.o.',
      '..OOWWWWOOo.',
      '..OOWWWWOO..',
      '..oO....oO..',
    ], babyNeck: 8,
  },
  bunny: {
    name: 'Tavşan', main: ['W', 'g'],
    pal: { W: '#f6f0ff', g: '#c8bcd8', P: '#ff9ab5', ...EYE },
    colors: [
      { name: 'Kar', set: {} },
      { name: 'Gri', set: { W: '#bcb4cc', g: '#8a8098' } },
      { name: 'Kahve', set: { W: '#c8a07a', g: '#94704c' } },
      { name: 'Benekli', set: { W: '#fff0dc', g: '#d0a070' } },
    ],
    adult: [
      '...W....W.......',
      '..WPW..WPW......',
      '..WPW..WPW......',
      '..WPW..WPW......',
      '..WWWWWWWW......',
      '.WWWWWWWWWW.....',
      '.WWEwWWEwWW.....',
      '.WWEEWWEEWW.....',
      '.WWWWPPWWWW.....',
      '..WWWWWWWW...WW.',
      '..WWWWWWWWW.WWW.',
      '.WWWWWWWWWWWWW..',
      '.WWWWWWWWWWWW...',
      '..gWWWWWWWWg....',
      '..gg.gg.gg.gg...',
      '................',
    ], adultNeck: 9,
    baby: [
      '..W....W....',
      '.WPW..WPW...',
      '.WPW..WPW...',
      '.WWWWWWWW...',
      'WWWWWWWWWW..',
      'WEwWWWWEwW..',
      'WEEWWWWEEW..',
      'WWWWPPWWWW..',
      '.WWWWWWWW...',
      '..WWWWWW.WW.',
      '..WWWWWWWWW.',
      '..gg..gg....',
    ], babyNeck: 9,
  },
  fox: {
    name: 'Tilki', main: ['O', 'o'],
    pal: { O: '#e8622a', o: '#b04418', W: '#ffffff', N: '#2a1d33', ...EYE },
    colors: [
      { name: 'Kızıl', set: {} },
      { name: 'Kar', set: { O: '#eef0ff', o: '#aab4d0', W: '#ffffff' } },
      { name: 'Gece', set: { O: '#5a4a8a', o: '#3a2a66' } },
      { name: 'Altın Kum', set: { O: '#e8b04a', o: '#a87420' } },
    ],
    adult: [
      '.o........o.....',
      '.oO......Oo.....',
      '.OOO....OOO.....',
      '.OOOOOOOOOO.....',
      'OOOOOOOOOOOO....',
      'OOEwOOOOEwOO....',
      'OOEEOOOOEEOO....',
      '.WWWOOOOWWW.....',
      '..WWWWNWWW......',
      '...WWWWWW...OO..',
      '..OOOOOOOO.OOOO.',
      '..OOWWWWOO.OOOO.',
      '..OOWWWWOOOOOWW.',
      '..OOOOOOOOO.WWW.',
      '..oO..oO........',
      '................',
    ], adultNeck: 9,
    baby: [
      '.o......o...',
      '.oO....Oo...',
      '.OOO..OOO...',
      '.OOOOOOOO...',
      'OOOOOOOOOO..',
      'OEwOOOOEwO..',
      'OEEOOOOEEO..',
      '.WWWNNWWW...',
      '..WWWWWW..O.',
      '..OOOOOO.OO.',
      '..OWWWWOOWW.',
      '..oO..oO....',
    ], babyNeck: 9,
  },
  owl: {
    name: 'Baykuş', main: ['B', 'b'],
    pal: { B: '#8a6a4a', b: '#5f4730', W: '#f2e6d0', Y: '#ffd75a', K: '#e8a030', ...EYE },
    colors: [
      { name: 'Ceviz', set: {} },
      { name: 'Kar', set: { B: '#e4e4f0', b: '#a4a4c0' } },
      { name: 'Gece', set: { B: '#4a4a7a', b: '#2e2e55' } },
      { name: 'Pas', set: { B: '#b0603a', b: '#743820' } },
    ],
    adult: [
      '..b.........b...',
      '..bB.......Bb...',
      '..BBBBBBBBBBB...',
      '.BBWWWBBBWWWBB..',
      '.BWYYEWBWYYEWB..',
      '.BWYEEWBWYEEWB..',
      '.BBWWWBKBWWWBB..',
      '.BBBBBBKBBBBBB..',
      '.bBBWBWBWBWBBb..',
      '.bBBBWBWBWBBBb..',
      '.bBBWBWBWBWBBb..',
      '..bBBBBBBBBBb...',
      '...bBBBBBBBb....',
      '....KK...KK.....',
      '................',
      '................',
    ], adultNeck: 8,
    baby: [
      '............',
      '.b........b.',
      '.bBBBBBBBBb.',
      'BBWWWBBWWWBB',
      'BWEwWBBWEwWB',
      'BWEEWKKWEEWB',
      'BBWWWKKWWWBB',
      '.BBBBBBBBBB.',
      '.bBWBWBWBBb.',
      '.bBBWBWBBBb.',
      '..bBBBBBBb..',
      '...KK..KK...',
    ], babyNeck: 7,
  },
  dragon: {
    name: 'Ejder', main: ['G', 'g'],
    pal: { G: '#5fc86a', g: '#2f8a3f', Y: '#f0d090', R: '#ff7a6a', H: '#f5e6b0', ...EYE },
    colors: [
      { name: 'Zümrüt', set: {} },
      { name: 'Gök', set: { G: '#5aa8f0', g: '#2f68b0' } },
      { name: 'Mor', set: { G: '#b07ae8', g: '#7040b0' } },
      { name: 'Kor', set: { G: '#f05a5a', g: '#a83030', R: '#ffd75a' } },
    ],
    adult: [
      '...H......H.....',
      '...GG....GG.....',
      '..GGGGGGGGG.....',
      '.GGGGGGGGGGG..g.',
      '.GGEwGGGEwGG.gg.',
      '.GGEEGGGEEGGggg.',
      '.GGGGGGGGGGGgg..',
      '..GGRGGGRGGgg...',
      '..gGGGGGGGGg....',
      '.ggGYYYYYGGgg...',
      'gg.GYYYYYGG.gg..',
      '...GYYYYYGG...g.',
      '...GGYYYGGGGGgg.',
      '...GGGGGGG......',
      '...gG.gG........',
      '................',
    ], adultNeck: 8,
    baby: [
      '..H....H....',
      '..GG..GG....',
      '.GGGGGGGG...',
      'GGGGGGGGGG..',
      'GEwGGGGEwG..',
      'GEEGGGGEEG.g',
      'GGRGGGGRGGgg',
      '.GGGGGGGGgg.',
      '..GYYYYGG...',
      '.gGYYYYGGg..',
      '..GGYYGGG...',
      '..gG..gG....',
    ], babyNeck: 8,
  },
  phoenix: {
    name: 'Anka', main: ['R', 'O'],
    pal: { R: '#ff5a2a', O: '#ff9a3a', Y: '#ffd75a', K: '#ffd75a', k: '#c99a1e', ...EYE },
    colors: [
      { name: 'Ateş', set: {} },
      { name: 'Buz', set: { R: '#5ab8f0', O: '#a8e8ff', Y: '#ffffff' } },
      { name: 'Gölge', set: { R: '#8a4aff', O: '#c08aff', Y: '#ffd75a' } },
      { name: 'Zümrüt', set: { R: '#3ab86a', O: '#8ae8a0', Y: '#fff09a' } },
    ],
    adult: [
      '......Y.Y.......',
      '.....YRY.Y......',
      '.....RRRR.......',
      '....RRRRRR......',
      '....REwRRR......',
      '....REERRRKk....',
      '.....RRRRR......',
      '..O..RRRRRR..O..',
      '.OOO.RRYYRR.OOO.',
      'OORRRRYYYYRRRROO',
      '.ORRRRYYYYRRRRO.',
      '..ORRRRYYRRRRO..',
      '....RRRRRRRR....',
      '.....R.RR.R.....',
      '....Y..YY..Y....',
      '...Y..Y..Y..Y...',
    ], adultNeck: 6,
    baby: [
      '....Y.Y.....',
      '....RYR.....',
      '...RRRRR....',
      '..RRRRRRR...',
      '..REwRREwR..',
      '..REERREER..',
      '..RRRKKRRR..',
      'O.RRRRRRRR.O',
      'OORRYYYYRROO',
      '.ORRYYYYRRO.',
      '...RRRRRR...',
      '...Y.YY.Y...',
    ], babyNeck: 7,
  },
}
export const SPECIES_ORDER: PetSpecies[] = ['cat', 'dog', 'bunny', 'fox', 'owl', 'dragon', 'phoenix']

/** Satın alınabilen özel renkler (gardırop): ana harfleri boyar */
export const SPECIAL_COLORS: Record<string, { name: string; main: string }> = {
  pink: { name: 'Pembe', main: '#ff9ac8' },
  gold: { name: 'Altın', main: '#ffcc3a' },
}

export const STAGES = ['Bebek', 'Yavru', 'Genç', 'Yetişkin', 'Efsanevi']
/** Ekranda boy: bebek/yavru 12'lik, genç/yetişkin/efsanevi 16'lık çizim */
export const STAGE_SCALE = [0.85, 1, 0.82, 1, 1.06]

// ---------------------------------------------------------------- aksesuarlar
type Acc = { pal: Palette; lines: string[] }
const HEAD: Record<string, Acc & { lift?: number }> = {
  bow: { pal: { P: '#ff6aa8', p: '#c03a78' }, lines: ['PP.PP', 'PPpPP', 'PP.PP'] },
  flower: { pal: { G: '#3fa34d', R: '#ff5a7a', Y: '#ffd75a', B: '#7ab8ff' }, lines: ['.R.Y.B.', 'GGGGGGG'] },
  party: { pal: { R: '#ff4d6d', B: '#4cc9f0', Y: '#ffd75a' }, lines: ['..Y..', '..R..', '.RBR.', '.BRB.', 'RBRBR'] },
  beret: { pal: { R: '#d0405a', r: '#8a1e30' }, lines: ['....r..', '.RRRRR.', 'RRRRRRR', 'rrrrrrr'] },
  helmet: { pal: { S: '#cfd8e8', s: '#7a849a', R: '#ff4d6d' }, lines: ['..R..', '.RSR.', 'SSSSS', 'SsSsS'] },
  wizard: { pal: { B: '#5a4ab8', b: '#3a2a88', Y: '#ffd75a' }, lines: ['....B....', '...BB....', '...BYB...', '..BBBBB..', '..BYBBB..', 'bbbbbbbbb'] },
  crown: { pal: { Y: '#ffcc3a', y: '#c99a1e', R: '#ff4d6d', B: '#4cc9f0' }, lines: ['Y.Y.Y', 'YRYBY', 'yyyyy'] },
  halo: { pal: { Y: '#fff09a' }, lines: ['.YYYYY.', 'Y.....Y', '.YYYYY.'], lift: 2 },
}
const BACK_SIDE: Record<string, Acc> = {
  wings: { pal: { W: '#ffffff', w: '#c8d8f0' }, lines: ['..WW', '.WWW', 'WWWw', 'WWw.', '.w..'] },
  fairy: { pal: { B: '#9ad8ff', P: '#ffb8e0' }, lines: ['.BB.', 'BBBB', 'BBP.', '.PP.', '.P..'] },
}

export interface PetItem { key: string; name: string; slot: PetSlot | 'COLOR'; price: number; stage: number }
/** Sunucudaki bb_pet_items() ile aynı */
export const PET_ITEMS: PetItem[] = [
  { key: 'bow', name: 'Fiyonk', slot: 'HEAD', price: 60, stage: 0 },
  { key: 'flower', name: 'Çiçek Tacı', slot: 'HEAD', price: 90, stage: 0 },
  { key: 'party', name: 'Parti Şapkası', slot: 'HEAD', price: 150, stage: 0 },
  { key: 'beret', name: 'Bere', slot: 'HEAD', price: 150, stage: 0 },
  { key: 'helmet', name: 'Miğfer', slot: 'HEAD', price: 300, stage: 1 },
  { key: 'wizard', name: 'Büyücü Şapkası', slot: 'HEAD', price: 400, stage: 2 },
  { key: 'crown', name: 'Taç', slot: 'HEAD', price: 900, stage: 3 },
  { key: 'halo', name: 'Hale', slot: 'HEAD', price: 1600, stage: 4 },
  { key: 'collar', name: 'Çıngıraklı Tasma', slot: 'NECK', price: 50, stage: 0 },
  { key: 'bowtie', name: 'Papyon', slot: 'NECK', price: 90, stage: 0 },
  { key: 'scarf', name: 'Atkı', slot: 'NECK', price: 140, stage: 0 },
  { key: 'medal', name: 'Kalp Kolye', slot: 'NECK', price: 450, stage: 2 },
  { key: 'goldchain', name: 'Altın Zincir', slot: 'NECK', price: 1000, stage: 3 },
  { key: 'glasses', name: 'Gözlük', slot: 'FACE', price: 120, stage: 0 },
  { key: 'hearts_g', name: 'Kalp Gözlük', slot: 'FACE', price: 220, stage: 1 },
  { key: 'shades', name: 'Güneş Gözlüğü', slot: 'FACE', price: 260, stage: 1 },
  { key: 'bag', name: 'Sırt Çantası', slot: 'BACK', price: 160, stage: 0 },
  { key: 'cape', name: 'Pelerin', slot: 'BACK', price: 220, stage: 1 },
  { key: 'fairy', name: 'Peri Kanadı', slot: 'BACK', price: 600, stage: 2 },
  { key: 'wings', name: 'Melek Kanadı', slot: 'BACK', price: 1200, stage: 3 },
  { key: 'a_hearts', name: 'Kalpler', slot: 'AURA', price: 350, stage: 1 },
  { key: 'a_stars', name: 'Yıldızlar', slot: 'AURA', price: 600, stage: 2 },
  { key: 'a_bubbles', name: 'Baloncuklar', slot: 'AURA', price: 450, stage: 1 },
  { key: 'a_fire', name: 'Alev Halkası', slot: 'AURA', price: 1500, stage: 4 },
  { key: 'pink', name: 'Pembe Boya', slot: 'COLOR', price: 400, stage: 1 },
  { key: 'gold', name: 'Altın Boya', slot: 'COLOR', price: 2000, stage: 4 },
]
export const petItem = (k: string) => PET_ITEMS.find(i => i.key === k)
export const SLOT_INFO: Record<PetSlot | 'COLOR', { name: string; icon: string }> = {
  HEAD: { name: 'Baş', icon: 'crown' },
  NECK: { name: 'Boyun', icon: 'heart' },
  FACE: { name: 'Yüz', icon: 'sun' },
  BACK: { name: 'Sırt', icon: 'cape' },
  AURA: { name: 'Işık', icon: 'sparkle' },
  COLOR: { name: 'Renk', icon: 'pal' },
}

// ---------------------------------------------------------------- çizim
function palFor(sp: SpeciesArt, color: string): Palette {
  if (SPECIAL_COLORS[color]) {
    const m = SPECIAL_COLORS[color].main
    return { ...sp.pal, [sp.main[0]]: m, [sp.main[1]]: shade(m, -0.32) }
  }
  const i = Math.max(0, Math.min(sp.colors.length - 1, Number(color.replace('c', '')) || 0))
  return { ...sp.pal, ...sp.colors[i].set }
}

/** Gövde ölçüleri: baş üstü, baş ortası, gözler, boyun açıklığı, gövde genişliği */
function measure(lines: string[], neckRow: number) {
  let top = 0, cx = Math.floor(lines[0].length / 2)
  for (let y = 0; y < lines.length; y++) {
    const m = lines[y].match(/[^.]{4,}/)
    if (m && m.index !== undefined) { top = y; cx = m.index + (m[0].length - 1) / 2; break }
  }
  const eyes: Array<{ x0: number; x1: number; y0: number; y1: number }> = []
  lines.forEach((l, y) => [...l].forEach((ch, x) => {
    if (ch !== 'E') return
    const e = eyes.find(k => x >= k.x0 - 1 && x <= k.x1 + 1 && y <= k.y1 + 1)
    if (e) { e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y1 = Math.max(e.y1, y) } else eyes.push({ x0: x, x1: x, y0: y, y1: y })
  }))
  const nm = lines[neckRow].match(/[^.]+/)
  const neck = nm && nm.index !== undefined ? { x0: nm.index, x1: nm.index + nm[0].length - 1 } : { x0: 3, x1: 8 }
  let bx0 = 99, bx1 = -1
  for (let y = neckRow; y < Math.min(lines.length, neckRow + 4); y++) {
    const r = lines[y]
    const a = r.search(/[^.]/), b = r.length - 1 - [...r].reverse().join('').search(/[^.]/)
    if (a >= 0) { bx0 = Math.min(bx0, a); bx1 = Math.max(bx1, b) }
  }
  return { top, cx, eyes, neck, neckRow, bx0, bx1 }
}

export function renderPetLook(look: PetLook): Grid {
  const sp = PET_SPECIES[look.species] ?? PET_SPECIES.cat
  const adult = look.stage >= 2
  const lines = adult ? sp.adult : sp.baby
  const w = lines[0].length, h = lines.length
  const ox = Math.floor((PET_CANVAS - w) / 2), oy = PET_CANVAS - h - 1
  const m = measure(lines, adult ? sp.adultNeck : sp.babyNeck)
  const g = makeGrid(PET_CANVAS, PET_CANVAS)
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < PET_CANVAS && y < PET_CANVAS) g[y][x] = c }
  const drawAcc = (a: Acc, x: number, y: number, flip = false) => a.lines.forEach((l, r) => [...l].forEach((ch, c) => {
    const col = a.pal[ch]; if (col) put(x + (flip ? l.length - 1 - c : c), y + r, col)
  }))
  const o = look.outfit ?? {}

  // 1) sırt (gövdenin arkası)
  const backY = oy + m.neckRow
  if (o.BACK === 'cape') {
    for (let r = 0; r < h - m.neckRow - 1; r++) {
      const k = Math.floor(r / 2)
      for (let x = ox + m.bx0 - 1 - k; x <= ox + m.bx1 + 1 + k; x++) put(x, backY + r, r === h - m.neckRow - 2 ? '#8a1e30' : '#d0304a')
    }
  } else if (o.BACK && BACK_SIDE[o.BACK]) {
    const a = BACK_SIDE[o.BACK], aw = a.lines[0].length
    drawAcc(a, ox + m.bx0 - aw + 1, backY - 2, false)
    drawAcc(a, ox + m.bx1, backY - 2, true)
  } else if (o.BACK === 'bag') {
    drawAcc({ pal: { N: '#9a6a3a', n: '#5a3a1a', Y: '#ffd75a' }, lines: ['nnn.', 'NNNN', 'NYNN', 'NNNN'] }, ox + m.bx1 - 1, backY + 1)
  }

  // 2) gövde
  paint(g, [[oy, ox, lines]], palFor(sp, look.color))

  // 3) boyun
  const ny = oy + m.neckRow, nx0 = ox + m.neck.x0, nx1 = ox + m.neck.x1, ncx = Math.round((nx0 + nx1) / 2)
  if (o.NECK === 'collar') { for (let x = nx0; x <= nx1; x++) put(x, ny, '#e04848'); put(ncx, ny + 1, '#ffd75a') }
  else if (o.NECK === 'scarf') { for (let x = nx0; x <= nx1; x++) put(x, ny, (x - nx0) % 2 ? '#c05a1a' : '#ff8a3d'); put(nx1, ny + 1, '#ff8a3d'); put(nx1, ny + 2, '#c05a1a') }
  else if (o.NECK === 'bowtie') drawAcc({ pal: { B: '#4c6af0', b: '#2a3ab0' }, lines: ['BB.BB', 'BBbBB', 'BB.BB'] }, ncx - 2, ny - 1)
  else if (o.NECK === 'medal') { for (let x = nx0; x <= nx1; x += 1) if ((x - nx0) % 2 === 0) put(x, ny, '#ffcc3a'); drawAcc({ pal: { P: '#ff4d6d' }, lines: ['P.P', 'PPP', '.P.'] }, ncx - 1, ny + 1) }
  else if (o.NECK === 'goldchain') { for (let x = nx0; x <= nx1; x++) put(x, ny, '#ffcc3a'); drawAcc({ pal: { Y: '#ffcc3a', B: '#4cc9f0' }, lines: ['YBY', '.Y.'] }, ncx - 1, ny + 1) }

  // 4) yüz
  if (o.FACE && m.eyes.length) {
    const eyes = m.eyes.map(e => ({ x0: ox + e.x0, x1: ox + e.x1, y0: oy + e.y0, y1: oy + e.y1 }))
    if (o.FACE === 'glasses') {
      // ince çerçeve: gözün çevresi, ortada köprü
      const frame = '#e8b830'
      eyes.forEach(b => {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { put(x, b.y0 - 1, frame); put(x, b.y1 + 1, frame) }
        for (let y = b.y0; y <= b.y1; y++) { put(b.x0 - 1, y, frame); put(b.x1 + 1, y, frame) }
      })
    } else {
      // dolgu camlar (güneş / kalp): gözün üstü, dışa bir piksel taşar, parlak nokta
      const lens = o.FACE === 'shades' ? '#1a1a2a' : '#ff4d8d', hi = o.FACE === 'shades' ? '#8ab8ff' : '#ffd0e0'
      eyes.forEach((b, i) => {
        const xa = i === 0 && eyes.length > 1 ? b.x0 - 1 : b.x0, xb = i === eyes.length - 1 && eyes.length > 1 ? b.x1 + 1 : b.x1
        for (let x = xa; x <= xb; x++) for (let y = b.y0; y <= b.y1; y++) put(x, y, lens)
        put(xa + (i === 0 ? 1 : 0), b.y0, hi)
      })
    }
    if (eyes.length >= 2) for (let x = eyes[0].x1 + 1; x < eyes[1].x0; x++) put(x, eyes[0].y0, o.FACE === 'hearts_g' ? '#ff4d8d' : o.FACE === 'glasses' ? '#e8b830' : '#1a1a2a')
  }

  // 5) baş
  const hat = o.HEAD ? HEAD[o.HEAD] : undefined
  if (hat) {
    const hw = hat.lines[0].length, hh = hat.lines.length
    drawAcc(hat, Math.round(ox + m.cx - (hw - 1) / 2), oy + m.top - hh + 1 - (hat.lift ?? 0))
  }
  return outline(g)
}
