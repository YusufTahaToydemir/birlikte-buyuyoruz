// Ortak evcil dostlar: 7 tür, bebek (~18x16) ve yetişkin (~24x22) çizimi, renkler, aksesuarlar.
// Tuval 32x32: dost alta ortalanır, üstte şapka, yanlarda kanat için yer kalır.
// Çizim parçalardan ([y, x, satırlar]) kurulur; aksesuar yerleri çizimden otomatik bulunur:
// baş üstü (ilk ≥6'lık dolu dizi), gözler ('E' kümeleri), boyun (tür başına satır), gövde (boyun altı).
// Kareler: açık / kırpma (göz kapalı) / mutlu (^^) / kuyruk (kuyruk, kulak ya da kanat oynar).
import { makeGrid, outline, shade, type Grid, type Palette } from '../pixel'

export const PET_CANVAS = 32
export type PetSpecies = 'cat' | 'dog' | 'bunny' | 'fox' | 'owl' | 'dragon' | 'phoenix'
export type PetSlot = 'HEAD' | 'NECK' | 'FACE' | 'BACK' | 'AURA'
export interface PetLook { species: PetSpecies; color: string; stage: number; outfit: Partial<Record<PetSlot, string>> }
/** Canlandırma kareleri: açık göz, kırpma/uyku, mutlu (^^), kuyruk sallama */
export type PetFrame = 'open' | 'blink' | 'happy' | 'wag'
export const PET_FRAMES: PetFrame[] = ['open', 'blink', 'happy', 'wag']

// E göz bebeği, w parıltı, '=' kapalı göz çizgisi, '-' bıyık (konturdan sonra çizilir)
const EYE = { E: '#2a1d33', w: '#ffffff', '=': '#2a1d33' }

type Part = [number, number, string[]]
/** Kayan bölge: x0, y0, x1, y1, dx, dy — gövdeye uzak uç en çok kayar */
type Wag = [number, number, number, number, number, number]
interface Body { parts: Part[]; neck: number; wag?: Wag[] }

interface SpeciesArt {
  name: string
  main: [string, string]           // renk değişiminde boyanan harfler (ana, koyu)
  pal: Palette
  colors: Array<{ name: string; set: Palette }>
  eyes?: string                    // göz sayılan harfler (varsayılan 'Ew')
  adult: Body
  baby: Body
}

export const PET_SPECIES: Record<PetSpecies, SpeciesArt> = {
  cat: {
    name: 'Kedi', main: ['O', 'o'],
    pal: { O: '#f0a040', o: '#c07020', W: '#fff4e0', P: '#ff8aa0', m: '#6a3030', '-': '#fff4e0', ...EYE },
    colors: [
      { name: 'Turuncu', set: {} },
      { name: 'Gri', set: { O: '#a8a8bc', o: '#6e6e88', m: '#4a3a50' } },
      { name: 'Kara', set: { O: '#3e3650', o: '#262033', E: '#ffd75a', w: '#fff4b0', '=': '#a898c8', '-': '#d8d0e8', m: '#4a2a3a' } },
      { name: 'Kar', set: { O: '#f4f0ff', o: '#c4bcd8', W: '#ffffff', '-': '#c4bcd8', m: '#8a6a7a' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '....O..........O',
          '....OO........OO',
          '....OPO......OPO',
          '...OOPPOOooOOPPOO',
          '..OOOOOOoOOoOOOOOO',
          '..OOOOOOOOOOOOOOOO',
          '..OOOwEOOOOOOwEOOO',
          '..OOOEEOOOOOOEEOOO',
          '--OOOEEOOPPOOEEOOO--',
          '..OOOOWWmWWmWWOOOO',
          '--.OOOWWWWWWWWOOO.--',
          '....OOOOWWWWOOOO',
        ]],
        [12, 0, [
          '.....OOOOOOOOOO',
          '....OOOOWWWWOOOO',
          '...OOOOWWWWWWOOOO',
          '...OOOOWWWWWWOOOO',
          '...OoOOWWWWWWOOoO',
          '...OoOOWWWWWWOOoO',
          '...OOOOOWWWWOOOOO',
          '...OOOOOOOOOOOOOO',
          '...OOO.WW..WW.OOO',
        ]],
        [7, 17, [
          '....oo',
          '....OO',
          '....OO',
          '....oo',
          '....OO',
          '....OO',
          '....oo',
          '...OO',
          '...OO',
          '..oo',
          '.OO',
          'OO',
        ]],
      ],
      neck: 12, wag: [[20, 7, 23, 16, 2, 0]],
    },
    baby: {
      parts: [
        [0, 0, [
          '...O..........O',
          '...OO........OO',
          '...OPO......OPO',
          '..OOPPOOooOOPPOO',
          '..OOOOOOOOOOOOOO',
          '.OOOwEEOOOOwEEOOO',
          '-OOOEEEOOOOEEEOOO-',
          '.OOOEEEOPPOEEEOOO',
          '-OOPPOOmWWmOOPPOO-',
          '..OOOOOWWWWOOOOO',
        ]],
        [10, 0, [
          '....OOOOOOOOOO',
          '...OOOOWWWWOOOO',
          '...OOOOWWWWOOOO',
          '...OOOOWWWWOOOO',
          '....OOWW..WWOO',
        ]],
        [8, 15, ['..OO', '..oo', '..OO', '..OO', '.oO', 'OO']],
      ],
      neck: 10, wag: [[17, 8, 19, 12, 1, 0]],
    },
  },
  dog: {
    name: 'Köpek', main: ['O', 'b'],
    pal: { O: '#d8a46a', b: '#8a5a32', W: '#fff4e0', N: '#2a1d33', P: '#ff7a8a', o: '#a87040', m: '#5a3020', ...EYE },
    colors: [
      { name: 'Kahve', set: {} },
      { name: 'Krem', set: { O: '#f2e0b8', b: '#c89a60', o: '#d0b080' } },
      { name: 'Kara', set: { O: '#4a4058', b: '#2a2236', o: '#3a3048', E: '#120c18', '=': '#a898c8', W: '#e8dccb' } },
      { name: 'Kızıl', set: { O: '#d8743a', b: '#8a3a1a', o: '#a85020' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '......OOOOOOOO',
          '....OOOOOOOOOOOO',
          '..bbOOOOOOOOOOOObb',
          '.bbbOOOOOOOOOOOObbb',
          '.bbbOOwEOOOOwEOObbb',
          '.bbbOOEEOOOOEEOObbb',
          '.bbbOOEEOWWOEEOObbb',
          '.bbbOOOWNNNNWOOObbb',
          '..bbOOWWWNNWWWOObb',
          '..bbOOWWmWWmWWOObb',
          '...b.OOWWPPWWOO.b',
          '......OOOPPOOO',
        ]],
        [12, 0, [
          '.....OOOOOOOOOO',
          '....OOOOWWWWOOOO',
          '...OOOOWWWWWWObbO',
          '...OOOOWWWWWWbbbO',
          '...OOOOWWWWWWOOOO',
          '...OOOOOWWWWOOOOO',
          '...OOOOOOOOOOOOOO',
          '...OOO.OO..OO.OOO',
          '...ooo.WW..WW.ooo',
        ]],
        [10, 17, ['...O', '..OO', '.OO', '.OO', 'OO']],
      ],
      neck: 12, wag: [[17, 10, 21, 13, 2, 0]],
    },
    baby: {
      parts: [
        [0, 0, [
          '....OOOOOOOOOO',
          '...OOOOOOOOOOOO',
          '.bbOOOOOOOOOOOObb',
          'bbbOOOOOOOOOOOObbb',
          'bbbOOwEEOOwEEOObbb',
          'bbbOOEEEOOEEEOObbb',
          'bbbOOEEEWWEEEOObbb',
          'bbbOPOOWNNWOOPObbb',
          '.bbOOOWmWWmWOOObb',
          '..b.OOOWPPWOOO.b',
        ]],
        [10, 0, [
          '.....OOOOOOOO',
          '....OOOWWWWOOO',
          '....OOOWWWWOOO',
          '....OOOOOOOOOO',
          '....ooWW..WWoo',
        ]],
        [9, 14, ['...O', '..OO', '.OO', 'OO']],
      ],
      neck: 10, wag: [[15, 9, 18, 11, 1, 0]],
    },
  },
  bunny: {
    name: 'Tavşan', main: ['W', 'g'],
    pal: { W: '#f6f0ff', g: '#c8bcd8', L: '#ffffff', P: '#ff9ab5', m: '#8a5a6a', T: '#ffffff', t: '#d8d0e8', ...EYE },
    colors: [
      { name: 'Kar', set: {} },
      { name: 'Gri', set: { W: '#bcb4cc', g: '#8a8098', L: '#e4e0ee', m: '#5a4a60' } },
      { name: 'Kahve', set: { W: '#c8a07a', g: '#94704c', L: '#f0dcc0', m: '#6a4030' } },
      { name: 'Benekli', set: { W: '#fff0dc', g: '#d0a070', S: '#b07a4a', L: '#ffffff' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '.....W......W',
          '....WWW....WWW',
          '....WPW....WPW',
          '....WPW....SPS',
          '....WPW....SPS',
          '....WPW....WPW',
          '....WWW....WWW',
          '...WWWWWWWWWWWW',
          '..WWWWWWWWWWSSSW',
          '..WWWwEWWWWwESSW',
          '..WWWEEWWWWEEWWW',
          '..WWWEEWPPWEEWWW',
          '..WPPWWmWWmWWPPW',
          '...WWWWWWWWWWWW',
        ]],
        [14, 0, [
          '.....WWWWWWWW',
          '....WWWLLLLWWW',
          '...WWWLLLLLLSSW',
          '...WWWLLLLLLSSW',
          '...WWWLLLLLLWWW',
          '...WWWWLLLLWWWW',
          '..WWWg......gWWW',
        ]],
        [19, 3, ['WWWWWWWWWWWW']],
        [16, 15, ['.TT.', 'TTTt', '.tt.']],
      ],
      neck: 14, wag: [[11, 0, 13, 4, 1, 0]],
    },
    baby: {
      parts: [
        [0, 0, [
          '...WW......WW',
          '..WPPW....WPPW',
          '..WPPW....WPPW',
          '..WPPW....WPPW',
          '..WWWWWWWWWWWW',
          '.WWWWWWWWWWSSWW',
          'WWWwEEWWWWwEESWW',
          'WWWEEEWWWWEEEWWW',
          'WWWEEEWPPWEEEWWW',
          '.WPPWWmWWmWWPPW',
          '..WWWWWWWWWWWW',
        ]],
        [11, 0, [
          '....WWWWWWWW',
          '...WWWLLLLSSW',
          '...WWWLLLLWWW',
          '...WWWWWWWWWW',
          '..WWWg....gWWW',
        ]],
        [12, 12, ['..TT.', '.TTTt', '..tt.']],
      ],
      neck: 11, wag: [[10, 0, 13, 3, 1, 0]],
    },
  },
  fox: {
    name: 'Tilki', main: ['O', 'o'],
    pal: { O: '#e8622a', o: '#b04418', W: '#ffffff', N: '#2a1d33', K: '#3a2630', ...EYE },
    colors: [
      { name: 'Kızıl', set: {} },
      { name: 'Kar', set: { O: '#e8ecf8', o: '#a8b0cc', W: '#ffffff', K: '#8a90aa' } },
      { name: 'Gece', set: { O: '#5e5870', o: '#3c364a', W: '#e8e8f2', K: '#1c1824' } },
      { name: 'Altın Kum', set: { O: '#e8b04a', o: '#a87420', K: '#8a5a2a' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '...K........K',
          '...KK......KK',
          '...OWO....OWO',
          '...OWWO..OWWO',
          '..OOOOOOOOOOOO',
          '.OOOOOOOOOOOOOOO',
          '.OOOwEOOOOOOwEOOO',
          '.OOOEEOOOOOOEEOOO',
          '.WWWEEOOOOOOEEWWW',
          'WWWWWWWOOOOWWWWWWW',
          '.WWWWWWWOOWWWWWWW',
          '...WWWWWNNWWWWW',
          '.....WWWWWWWW',
          '.......WWWW',
        ]],
        [14, 0, [
          '.....OOOOOOOO',
          '....OOOWWWWOOO',
          '...OOOOWWWWOOOO',
          '...OOOOWWWWOOOO',
          '...OOOOOWWOOOOO',
          '...OOOOOOOOOOOOOOo',
          '...OO.KK..KK.OO',
          '...KK.KK..KK.KK',
        ]],
        [7, 16, [
          '....WW',
          '...WWWW',
          '..WWWWWW',
          '..oWWWWo',
          '.oOOOOOO',
          '.oOOOOOO',
          '.oOOOOOO',
          '.oOOOOOo',
          'oOOOOOo',
          'oOOOOo',
          'oOOOo',
          'OOo',
        ]],
      ],
      neck: 14, wag: [[17, 7, 23, 15, 1, 0]],
    },
    baby: {
      parts: [
        [0, 0, [
          '...K........K',
          '...KK......KK',
          '...OWO....OWO',
          '..OOWWOOOOOOWWOO',
          '.OOOOOOOOOOOOOOO',
          '.OOOwEEOOOOwEEOOO',
          '.OOOEEEOOOOEEEOOO',
          'WWWWEEEOOOOEEEWWWW',
          '.WWWWWWWOOWWWWWWW',
          '...WWWWWNNWWWWW',
          '.....WWWWWWWW',
        ]],
        [11, 0, [
          '......OOOOOO',
          '.....OOWWWWOO',
          '.....OOWWWWOO',
          '.....OOOOOOOOO',
          '.....KK....KK',
        ]],
        [9, 13, ['....WW', '...WWWW', '...oOOO', '..oOOOO', '.oOOOOo', 'oOOOo']],
      ],
      neck: 11, wag: [[15, 9, 19, 13, 1, 0]],
    },
  },
  owl: {
    name: 'Baykuş', main: ['B', 'b'], eyes: 'EwY',
    pal: { B: '#8a6a4a', b: '#5f4730', W: '#f2e6d0', Y: '#ffd75a', K: '#e8a030', ...EYE },
    colors: [
      { name: 'Ceviz', set: {} },
      { name: 'Kar', set: { B: '#e8e8f4', b: '#a4a4c0', W: '#ffffff', K: '#4a4458' } },
      { name: 'Gece', set: { B: '#6a6878', b: '#45434f', W: '#d8d4e0', Y: '#ffb030' } },
      { name: 'Pas', set: { B: '#b0603a', b: '#743820' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '..b............b',
          '..bB..........Bb',
          '..BBB........BBB',
          '..BBbbBBBBBBbbBB',
          '.BBWWWbBBBBbWWWBB',
          '.BWYYYWBBBBWYYYWB',
          '.BWYwEWBKKBWwEYWB',
          '.BWYEEWBKKBWEEYWB',
          '.BBWWWBBBBBBWWWBB',
        ]],
        [9, 0, [
          '.bBBBBBBBBBBBBBb',
          'bbBBBWWWWWWWWBBBbb',
          'bbbBWWBWWWWBWWBbbb',
          'bBbBWWWWBBWWWWBbBb',
          'bbbBWWBWWWWBWWBbbb',
          '.bbBWWWWBBWWWWBbb',
          '.bbBBWWWWWWWWBBbb',
          '..bbBBBBBBBBBBbb',
          '....BBBBBBBBBB',
          '....KKK....KKK',
        ]],
      ],
      neck: 9, wag: [[0, 10, 2, 15, 0, -1], [15, 10, 17, 15, 0, -1]],
    },
    baby: {
      parts: [
        [0, 0, [
          '.b............b',
          '.bBBBBBBBBBBBBb',
          'BBBBBBBBBBBBBBBB',
          'BBWWWBBBBBBWWWBB',
          'BWYYYWBBBBWYYYWB',
          'BWYwEWBKKBWwEYWB',
          'BWYEEWBKKBWEEYWB',
          'BBWWWBBBBBBWWWBB',
        ]],
        [8, 0, [
          '.bBBBBBBBBBBBBb',
          'bbBBWWWWWWWWBBbb',
          'bbbBWWBWWBWWBbbb',
          'bbbBWWWWWWWWBbbb',
          '.bbBBWWWWWWBBbb',
          '...BBBBBBBBBB',
          '....KK....KK',
        ]],
      ],
      neck: 8, wag: [[0, 9, 2, 12, 0, -1], [13, 9, 15, 12, 0, -1]],
    },
  },
  dragon: {
    name: 'Ejder', main: ['G', 'g'],
    pal: { G: '#5fc86a', g: '#2f8a3f', Y: '#f0d090', y: '#c8a060', R: '#f0a860', H: '#f5e6b0', m: '#2a1d33', P: '#ff9ab5', ...EYE },
    colors: [
      { name: 'Zümrüt', set: {} },
      { name: 'Gök', set: { G: '#5aa8f0', g: '#2f68b0', R: '#ffd890' } },
      { name: 'Mor', set: { G: '#b07ae8', g: '#7040b0', R: '#ffa8d0' } },
      { name: 'Kor', set: { G: '#f05a5a', g: '#a83030', R: '#ffd75a', Y: '#ffd890' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '...H........H',
          '...HH......HH',
          '....HH..gg..HH',
          '...GGGGGGGGGGGG',
          '..GGGGGGGGGGGGGG',
          '.gGGGwEGGGGwEGGGg',
          'ggGGGEEGGGGEEGGGgg',
          '.gGGGEEGGGGEEGGGg',
          '..GGGYYgYYgYYGGG',
          '..GGYYmYYYYmYYGG',
          '...GGYYmmmmYYGG',
          '....GGYYHYYYGG',
        ]],
        [12, 0, [
          '.g...GGGGGGGG...g',
          'ggg.GGGYYYYGGG.ggg',
          'gRggGGYYYYYYGGggRg',
          'gRRgGGyyyyyyGGgRRg',
          '.g.gGGYYYYYYGGg.g.',
          '...GGGyyyyyyGGG',
          '...GGGGYYYYGGGG',
          '...GGGGGGGGGGGG',
          '...GG.GG..GG.GG',
          '...gg.gg..gg.gg',
        ]],
        [12, 15, [
          '......H',
          '.....HHH',
          '......G',
          '.....GG',
          '....GG',
          '...GG',
          '.GGG',
          'GGG',
        ]],
      ],
      neck: 12, wag: [[18, 12, 22, 18, 0, -1], [0, 12, 3, 16, 0, -1], [14, 12, 17, 16, 0, -1]],
    },
    baby: {
      parts: [
        [0, 0, [
          '..H..........H',
          '..HH........HH',
          '...HGGGGGGGGH',
          '.GGGGGGGGGGGGGG',
          'gGGwEEGGGGwEEGGg',
          'ggGEEEGGGGEEEGgg',
          '.gGEEEGYYGEEEGg',
          '..GGGYgYYgYGGG',
          '..GPGYmmmmYGPG',
          '...GGGYHYYGGG',
        ]],
        [10, 0, [
          '.....GGGGGG',
          '..g.GGYYYYGG.g',
          '.gRgGGYYYYGGgRg',
          '..g.GGyyyyGG.g',
          '....GGYYYYGGGGG',
          '....gg....gg',
        ]],
        [11, 15, ['.H', 'HHH', 'GG']],
      ],
      neck: 10, wag: [[13, 11, 18, 14, 0, -1]],
    },
  },
  phoenix: {
    name: 'Anka', main: ['R', 'O'],
    pal: { R: '#ff5a2a', O: '#ff9a3a', Y: '#ffd75a', K: '#ffd75a', k: '#c99a1e', P: '#ffb0b8', ...EYE },
    colors: [
      { name: 'Ateş', set: {} },
      { name: 'Buz', set: { R: '#5ab8f0', O: '#a8e8ff', Y: '#ffffff', P: '#d0f0ff' } },
      { name: 'Gölge', set: { R: '#8a4aff', O: '#c08aff', Y: '#ffd75a' } },
      { name: 'Zümrüt', set: { R: '#3ab86a', O: '#8ae8a0', Y: '#fff09a' } },
    ],
    adult: {
      parts: [
        [0, 0, [
          '......Y..YY..Y',
          '......O..OO..O',
          '.......R.RR.R',
          '.......RRRRRR',
          '......RRRRRRRR',
          '.....RRRRRRRRRR',
          '.....RRwERRwERR',
          '.....RREEKKEERR',
          '......RRRkkRRR',
        ]],
        [9, 0, [
          'Y......RRRRRR......Y',
          'OY....RRYYYYRR....YO',
          'ROY.YRRYYYYYYRRY.YOR',
          '.RROORRYYYYYYRROORR',
          '..RROORRYYYYRROORR',
          '....RRRRRRRRRRRR',
          '.......RRRRRR',
          '.......O.RR.O',
          '......O..OO..O',
          '.....Y...OO...Y',
          '....Y....YY....Y',
        ]],
      ],
      neck: 9, wag: [[0, 9, 4, 14, 0, -1], [15, 9, 19, 14, 0, -1]],
    },
    baby: {
      parts: [
        [0, 0, [
          '.....Y.YY.Y',
          '.....R.RR.R',
          '......RRRR',
          '....RRRRRRRR',
          '...RRRRRRRRRR',
          '..RRwEERRwEERR',
          '..RREEERREEERR',
          '..RREEEKKEEERR',
          '...RPRRkkRRPR',
        ]],
        [9, 0, [
          '....RRRRRRRR',
          '.O..RRYYYYRR..O',
          'OOOORYYYYYYROOOO',
          '.OO.RRYYYYRR.OO',
          '....RRRRRRRR',
          '.....O.YY.O',
          '....Y..YY..Y',
        ]],
      ],
      neck: 9, wag: [[0, 10, 3, 12, 0, -1], [12, 10, 15, 12, 0, -1]],
    },
  },
}
export const SPECIES_ORDER: PetSpecies[] = ['cat', 'dog', 'bunny', 'fox', 'owl', 'dragon', 'phoenix']

/** Satın alınabilen özel renkler (gardırop): ana harfleri boyar */
export const SPECIAL_COLORS: Record<string, { name: string; main: string }> = {
  pink: { name: 'Pembe', main: '#ff9ac8' },
  gold: { name: 'Altın', main: '#ffcc3a' },
}

export const STAGES = ['Bebek', 'Yavru', 'Genç', 'Yetişkin', 'Efsanevi']
/** Ekranda boy: bebek/yavru bebek çizimi, genç/yetişkin/efsanevi yetişkin çizimi */
export const STAGE_SCALE = [0.85, 1, 0.82, 1, 1.06]

// ---------------------------------------------------------------- aksesuarlar
type Acc = { pal: Palette; lines: string[] }
const HEAD: Record<string, Acc & { lift?: number }> = {
  bow: { pal: { P: '#ff6aa8', p: '#c03a78', L: '#ffb8d8' }, lines: ['PP...PP', 'PLPpPLP', 'PPPpPPP', 'PP...PP'] },
  flower: { pal: { G: '#3fa34d', R: '#ff5a7a', Y: '#ffd75a', B: '#7ab8ff', O: '#ff9a3a' }, lines: ['.R...Y...B.', 'ROR.YOY.BYB', 'GGGGGGGGGGG'] },
  party: { pal: { R: '#ff4d6d', B: '#4cc9f0', Y: '#ffd75a' }, lines: ['...Y...', '..YYY..', '...R...', '..RBR..', '..BRB..', '.RBRBR.', 'RBRBRBR'] },
  beret: { pal: { R: '#d0405a', r: '#8a1e30' }, lines: ['.....r...', '..RRRRRR.', '.RRRRRRRR', 'RRRRRRRRR', 'rrrrrrrrr'] },
  helmet: { pal: { S: '#cfd8e8', s: '#7a849a', R: '#ff4d6d' }, lines: ['....R....', '...RRR...', '..SSSSS..', '.SSSSSSS.', 'SSSSSSSSS', 'SsSSsSSsS'] },
  wizard: { pal: { B: '#5a4ab8', b: '#3a2a88', Y: '#ffd75a' }, lines: ['......BB...', '.....BB....', '....BBB....', '....BYB....', '...BBBBB...', '...BBYBB...', '..BBBBBBB..', 'bbbbbbbbbbb'] },
  crown: { pal: { Y: '#ffcc3a', y: '#c99a1e', R: '#ff4d6d', B: '#4cc9f0' }, lines: ['Y...Y...Y', 'YY.YYY.YY', 'YRYYBYYRY', 'yyyyyyyyy'] },
  halo: { pal: { Y: '#fff09a' }, lines: ['.YYYYYYY.', 'Y.......Y', '.YYYYYYY.'], lift: 2 },
}
const BACK_SIDE: Record<string, Acc> = {
  wings: { pal: { W: '#ffffff', w: '#c8d8f0' }, lines: ['WW....', 'WWWW..', '.WWWWW', '.WwWWW', '..wWWW', '...wWW'] },
  fairy: { pal: { B: '#9ad8ff', b: '#c8ecff', P: '#ffb8e0' }, lines: ['BBB...', 'BbBBB.', '.BBBBB', '..PPPP', '.PPPP.', '.PP...'] },
}
const BAG: Acc = { pal: { N: '#9a6a3a', n: '#5a3a1a', Y: '#ffd75a' }, lines: ['.nnn.', 'NNNNN', 'NNYNN', 'NNNNN', 'nnnnn'] }

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

// ---------------------------------------------------------------- yerleşim
function palFor(sp: SpeciesArt, color: string): Palette {
  let p: Palette
  if (SPECIAL_COLORS[color]) {
    const m = SPECIAL_COLORS[color].main
    p = { ...sp.pal, [sp.main[0]]: m, [sp.main[1]]: shade(m, -0.32) }
  } else {
    const i = Math.max(0, Math.min(sp.colors.length - 1, Number(color.replace('c', '')) || 0))
    p = { ...sp.pal, ...sp.colors[i].set }
  }
  if (!p.S) p.S = p[sp.main[0]] // benek yoksa gövde rengi
  return p
}

type Box = { x0: number; x1: number; y0: number; y1: number }
interface Layout {
  cells: string[][]                // tuval boyu harf ızgarası ('.' boş)
  top: number; cx: number          // baş üstü satırı ve ortası
  eyes: Box[]
  neck: { y: number; x0: number; x1: number }
  bx0: number; bx1: number         // gövde genişliği (boyun altı)
  wag: Wag[]
  mid: number                      // çizimin yatay ortası
}

const isOn = (ch: string | undefined) => !!ch && ch !== '.'
function runAt(row: string[], x: number): [number, number] | null {
  if (!isOn(row[x])) return null
  let a = x, b = x
  while (isOn(row[a - 1])) a--
  while (isOn(row[b + 1])) b++
  return [a, b]
}
function longestRun(row: string[]): [number, number] | null {
  let best: [number, number] | null = null
  for (let x = 0; x < row.length; x++) {
    const r = runAt(row, x)
    if (r) { if (!best || r[1] - r[0] > best[1] - best[0]) best = r; x = r[1] }
  }
  return best
}

const layoutCache = new Map<string, Layout>()
function layout(spKey: PetSpecies, adult: boolean): Layout {
  const ck = spKey + (adult ? ':a' : ':b')
  const hit = layoutCache.get(ck)
  if (hit) return hit
  const sp = PET_SPECIES[spKey]
  const body = adult ? sp.adult : sp.baby
  let w = 0, h = 0
  for (const [y, x, ls] of body.parts) { h = Math.max(h, y + ls.length); for (const l of ls) w = Math.max(w, x + l.length) }
  const ox = Math.floor((PET_CANVAS - w) / 2), oy = PET_CANVAS - h - 1
  const cells = Array.from({ length: PET_CANVAS }, () => Array<string>(PET_CANVAS).fill('.'))
  for (const [y, x, ls] of body.parts) ls.forEach((l, r) => [...l].forEach((ch, c) => {
    const yy = oy + y + r, xx = ox + x + c
    if (ch !== '.' && ch !== ' ' && yy >= 0 && yy < PET_CANVAS && xx >= 0 && xx < PET_CANVAS) cells[yy][xx] = ch
  }))

  // baş üstü
  let top = oy, cx = ox + w / 2
  for (let y = 0; y < PET_CANVAS; y++) {
    const r = longestRun(cells[y])
    if (r && r[1] - r[0] >= 5) { top = y; cx = (r[0] + r[1]) / 2; break }
  }
  // gözler: 'E' içeren göz harfi kümeleri
  const eyeSet = sp.eyes ?? 'Ew'
  const seen = new Set<number>()
  const eyes: Box[] = []
  for (let y = 0; y < PET_CANVAS; y++) for (let x = 0; x < PET_CANVAS; x++) {
    if (cells[y][x] !== 'E' || seen.has(y * 64 + x)) continue
    const b: Box = { x0: x, x1: x, y0: y, y1: y }
    const st = [[x, y]]
    seen.add(y * 64 + x)
    while (st.length) {
      const [px, py] = st.pop()!
      b.x0 = Math.min(b.x0, px); b.x1 = Math.max(b.x1, px); b.y0 = Math.min(b.y0, py); b.y1 = Math.max(b.y1, py)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy
        if (ny < 0 || nx < 0 || ny >= PET_CANVAS || nx >= PET_CANVAS || seen.has(ny * 64 + nx) || !eyeSet.includes(cells[ny][nx])) continue
        seen.add(ny * 64 + nx); st.push([nx, ny])
      }
    }
    eyes.push(b)
  }
  eyes.sort((a, b) => a.x0 - b.x0)
  // boyun ve gövde: baş ortasından geçen dizi
  const c0 = Math.round(cx)
  const ny = oy + body.neck
  const nr = runAt(cells[ny], c0) ?? runAt(cells[ny], Math.floor(cx)) ?? longestRun(cells[ny]) ?? [c0 - 3, c0 + 3]
  let bx0 = 99, bx1 = -1
  for (let y = ny + 1; y <= Math.min(PET_CANVAS - 1, ny + 4); y++) {
    const r = runAt(cells[y], c0) ?? runAt(cells[y], Math.floor(cx))
    if (r) { bx0 = Math.min(bx0, r[0]); bx1 = Math.max(bx1, r[1]) }
  }
  if (bx1 < 0) { bx0 = nr[0]; bx1 = nr[1] }
  const wag = (body.wag ?? []).map(([a, b, c, d, dx, dy]): Wag => [a + ox, b + oy, c + ox, d + oy, dx, dy])
  const L: Layout = { cells, top, cx, eyes, neck: { y: ny, x0: nr[0], x1: nr[1] }, bx0, bx1, wag, mid: ox + w / 2 }
  layoutCache.set(ck, L)
  return L
}

/** Göz kapama / mutlu göz / kuyruk sallama: harf ızgarasında */
function frameCells(L: Layout, sp: SpeciesArt, frame: PetFrame): string[][] {
  const c = L.cells.map(r => r.slice())
  if (frame === 'blink' || frame === 'happy') {
    const eyeSet = sp.eyes ?? 'Ew'
    L.eyes.forEach((b, i) => {
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (eyeSet.includes(c[y][x])) c[y][x] = sp.main[0]
      let x0 = b.x0, x1 = b.x1
      if (frame === 'happy' && (x1 - x0) % 2 === 1) { if (i === 0 && L.eyes.length > 1) x0--; else x1++ }
      const cw = x1 - x0 + 1, mid = (x0 + x1) / 2
      for (let x = x0; x <= x1; x++) {
        const d = Math.abs(x - mid)
        const y = frame === 'happy'
          ? Math.min(b.y1, b.y0 + Math.floor((b.y1 - b.y0) / 2) + 1) - (d < 1 ? 1 : 0)   // ^
          : b.y1 - (cw >= 3 && d >= cw / 2 - 0.5 ? 1 : 0)                                  // ‿
        if (c[y]?.[x] !== undefined) c[y][x] = '='
      }
    })
  }
  if (frame === 'wag') for (const [x0, y0, x1, y1, dx, dy] of L.wag) {
    const moved: Array<[number, number, string]> = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isOn(c[y]?.[x])) { moved.push([x, y, c[y][x]]); c[y][x] = '.' }
    for (const [x, y, ch] of moved) {
      const fy = (y1 - y) / Math.max(1, y1 - y0)
      const fx = x0 >= L.mid ? (x - x0) / Math.max(1, x1 - x0) : (x1 - x) / Math.max(1, x1 - x0)
      const nx = x + Math.round(dx * fy), ny = y + Math.round(dy * fx)
      if (c[ny]?.[nx] === '.') c[ny][nx] = ch
    }
  }
  return c
}

/** Parçacık/uyku yazısı yerleşimi için: tuvale oranla baş üstü, göz ve ağız hizası, yatay orta */
export function petAnchors(look: PetLook): { head: number; eyes: number; mouth: number; cx: number } {
  const L = layout(PET_SPECIES[look.species] ? look.species : 'cat', look.stage >= 2)
  const ey = L.eyes.length ? L.eyes[0].y0 : L.top + 3
  const eb = L.eyes.length ? L.eyes[0].y1 : L.top + 5
  return { head: L.top / PET_CANVAS, eyes: ey / PET_CANVAS, mouth: Math.min(L.neck.y, eb + 3) / PET_CANVAS, cx: (L.cx + 0.5) / PET_CANVAS }
}

// ---------------------------------------------------------------- çizim
export function renderPetLook(look: PetLook, frame: PetFrame = 'open'): Grid {
  const spKey: PetSpecies = PET_SPECIES[look.species] ? look.species : 'cat'
  const sp = PET_SPECIES[spKey]
  const L = layout(spKey, look.stage >= 2)
  const cells = frameCells(L, sp, frame)
  const pal = palFor(sp, look.color)
  const N = PET_CANVAS
  const g = makeGrid(N, N)
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c }
  const drawAcc = (a: Acc, x: number, y: number, flip = false) => a.lines.forEach((l, r) => [...l].forEach((ch, c) => {
    const col = a.pal[ch]; if (col) put(x + (flip ? l.length - 1 - c : c), y + r, col)
  }))
  const o = look.outfit ?? {}
  const { neck, bx0, bx1 } = L

  // 1) sırt (gövdenin arkası)
  if (o.BACK === 'cape') {
    let last = neck.y
    for (let y = neck.y; y < N - 1; y++) if (cells[y].some(isOn)) last = y
    const rows = last - neck.y
    for (let r = 0; r < rows; r++) {
      const k = 1 + Math.floor(r / 3)
      for (let x = bx0 - k; x <= bx1 + k; x++) put(x, neck.y + r, r === rows - 1 ? '#8a1e30' : (x === bx0 - k || x === bx1 + k) ? '#a8203a' : '#d0304a')
    }
  } else if (o.BACK && BACK_SIDE[o.BACK]) {
    const a = BACK_SIDE[o.BACK], aw = a.lines[0].length
    drawAcc(a, bx0 - aw + 1, neck.y - 3, false)
    drawAcc(a, bx1, neck.y - 3, true)
  } else if (o.BACK === 'bag') {
    drawAcc(BAG, bx1 - 1, neck.y + 1)
  }

  // 2) gövde ('-' bıyıklar konturdan sonra)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = cells[y][x]
    if (ch === '.' || ch === '-') continue
    const col = pal[ch]; if (col) g[y][x] = col
  }

  // 3) boyun
  const nx0 = neck.x0, nx1 = neck.x1, ny = neck.y, ncx = (nx0 + nx1) / 2
  const midCells = [Math.floor(ncx), Math.ceil(ncx)]
  if (o.NECK === 'collar') {
    for (let x = nx0; x <= nx1; x++) put(x, ny, '#e04848')
    midCells.forEach(x => { put(x, ny + 1, '#ffd75a'); put(x, ny + 2, '#c99a1e') })
  } else if (o.NECK === 'scarf') {
    for (let x = nx0; x <= nx1; x++) { put(x, ny, (x - nx0) % 2 ? '#c05a1a' : '#ff8a3d'); put(x, ny + 1, (x - nx0) % 2 ? '#ff8a3d' : '#c05a1a') }
    put(nx1 - 1, ny + 2, '#ff8a3d'); put(nx1 - 1, ny + 3, '#c05a1a'); put(nx1, ny + 2, '#c05a1a'); put(nx1, ny + 4, '#ff8a3d')
  } else if (o.NECK === 'bowtie') drawAcc({ pal: { B: '#4c6af0', b: '#2a3ab0' }, lines: ['BB.BB', 'BBbBB', 'BB.BB'] }, Math.round(ncx) - 2, ny - 1)
  else if (o.NECK === 'medal') {
    for (let x = nx0; x <= nx1; x++) if ((x - nx0) % 2 === 0) put(x, ny, '#ffcc3a')
    drawAcc({ pal: { P: '#ff4d6d', p: '#ffb0c0' }, lines: ['PP.PP', 'PpPPP', '.PPP.', '..P..'] }, Math.round(ncx) - 2, ny + 1)
  } else if (o.NECK === 'goldchain') {
    for (let x = nx0; x <= nx1; x++) put(x, ny, (x - nx0) % 2 ? '#c99a1e' : '#ffcc3a')
    drawAcc({ pal: { Y: '#ffcc3a', B: '#4cc9f0' }, lines: ['YBY', 'BBB', '.Y.'] }, Math.round(ncx) - 1, ny + 1)
  }

  // 4) yüz
  if (o.FACE && L.eyes.length) {
    const eyes = L.eyes
    if (o.FACE === 'glasses') {
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
        if (o.FACE === 'hearts_g' && b.y1 > b.y0) {
          // kalp: alt köşeler alttaki rengi geri alır
          const back = (x: number, y: number) => { const ch = cells[y]?.[x]; const col = ch && ch !== '.' ? pal[ch] : undefined; g[y][x] = col ?? null }
          back(xa, b.y1); back(xb, b.y1)
        }
        put(xa + 1, b.y0, hi)
      })
    }
    if (eyes.length >= 2) {
      const pad = o.FACE === 'glasses' ? 2 : 1
      for (let x = eyes[0].x1 + pad; x <= eyes[1].x0 - pad; x++) put(x, eyes[0].y0, o.FACE === 'hearts_g' ? '#ff4d8d' : o.FACE === 'glasses' ? '#e8b830' : '#1a1a2a')
    }
  }

  // 5) baş
  const hat = o.HEAD ? HEAD[o.HEAD] : undefined
  if (hat) {
    const hw = hat.lines[0].length, hh = hat.lines.length
    drawAcc(hat, Math.round(L.cx - (hw - 1) / 2), L.top - hh + 1 - (hat.lift ?? 0))
  }

  // 6) kontur + bıyık
  const out = outline(g)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (cells[y][x] === '-' && !g[y][x]) out[y][x] = pal['-'] ?? '#ffffff'
  return out
}

/** Tüm kareler yan yana (PET_FRAMES sırasıyla): CSS ile kare değiştirmek için tek resim */
export function renderPetStrip(look: PetLook): Grid {
  const fs = PET_FRAMES.map(f => renderPetLook(look, f))
  return fs[0].map((_, y) => fs.flatMap(f => f[y]))
}
