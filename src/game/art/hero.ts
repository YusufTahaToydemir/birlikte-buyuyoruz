// Piksel kahraman: 32x32 gövde, 40x42 tuval (şapka ve silah taşması için).
// Katman sırası: pelerin → arka saç/sadak → gövde → kıyafet → ön saç/başörtüsü → sakal → başlık → silah → kontur.
import { type Block, type Grid, type Palette, makeGrid, outline, paint, s } from '../pixel'

export type HeroClass = 'WARRIOR' | 'MAGE' | 'RANGER' | 'HEALER'
export interface Look { gender?: 'F' | 'M'; skin?: number; hair?: number; hairColor?: number }
export interface Gear { weapon?: number; armor?: number; head?: string; cape?: string; pet?: string }
export type Pose = 'idle' | 'blink' | 'joy' | 'hurt'

export const HERO_W = 40
export const HERO_H = 42
const OX = 4, OY = 7

// ---------------------------------------------------------------- paletler
export const SKIN: Palette[] = [
  { S: '#ffdcc0', s: '#efb896', N: '#e3a985', B: '#ffa3a3' },
  { S: '#f1bf94', s: '#d39a6c', N: '#c88c5f', B: '#ee8f80' },
  { S: '#c98d5f', s: '#a76d43', N: '#9a6239', B: '#d67766' },
  { S: '#8e5b3c', s: '#6f432a', N: '#643a24', B: '#a95b4c' },
]
export const HAIR: Palette[] = [
  { H: '#2a2130', h: '#17121d', L: '#4b3d5a' },
  { H: '#6b4226', h: '#47291a', L: '#91603a' },
  { H: '#a8462a', h: '#762c17', L: '#d26a43' },
  { H: '#e3b850', h: '#b38a2b', L: '#f7dc8a' },
  { H: '#c9c3d6', h: '#958fa6', L: '#efeaf7' },
  { H: '#3b2a55', h: '#24183a', L: '#5e4785' },
]
export const HIJAB: Palette[] = [
  { H: '#2f3d73', h: '#1e2850', L: '#4a5c9e' },
  { H: '#7d2546', h: '#561731', L: '#a8375f' },
  { H: '#6f906a', h: '#4f6c4b', L: '#94b38e' },
  { H: '#cfae82', h: '#a5875f', L: '#e8cfa8' },
  { H: '#9a83c6', h: '#73609c', L: '#bca9e0' },
  { H: '#2b2a33', h: '#18171d', L: '#46444f' },
]

type TierPal = Palette
const W = (A: string, a: string, L: string, T: string, t: string, K: string, k: string, G: string, P: string, p: string, O: string, o: string): TierPal => ({ A, a, L, T, t, K, k, G, P, p, O, o })

export const OUTFIT: Record<HeroClass, TierPal[]> = {
  WARRIOR: [
    W('#8a5a32', '#663f21', '#b07a48', '#7d7f86', '#55575e', '#3d2a1c', '#d8b13a', '#c33333', '#4d3b2e', '#36281f', '#3a2a1e', '#241810'),
    W('#c07a3a', '#8f5524', '#eaa868', '#a8642a', '#7a451a', '#4a2f1c', '#f0c34a', '#e04040', '#5b5f69', '#40434b', '#4a2f1c', '#2c1b10'),
    W('#a9b4c2', '#76808f', '#e6edf5', '#8792a1', '#5c6573', '#3a3550', '#d8e2ee', '#3a8ef0', '#4b5263', '#353a47', '#3b4150', '#252a34'),
    W('#e0b232', '#a77d16', '#fff0a0', '#c8961e', '#8f6a10', '#5a2a1a', '#ffffff', '#e83a5a', '#6a2b2b', '#4a1d1d', '#5a2a1a', '#3a170e'),
    W('#5a2f8f', '#3c1d63', '#9468d0', '#ecc65a', '#b8922e', '#24163a', '#7ff7ff', '#7ff7ff', '#2c1d45', '#1d1230', '#24163a', '#140c22'),
  ],
  MAGE: [
    W('#3c5aa8', '#2a3f7a', '#5f7fd0', '#d8b13a', '#a8831e', '#7a2f2f', '#f0c34a', '#f5d75a', '#2a3f7a', '#1d2d58', '#3a2a1e', '#241810'),
    W('#2f8f8a', '#1f6662', '#52bdb6', '#e6c86a', '#b0913a', '#5a2f6a', '#f0c34a', '#fff0a0', '#1f6662', '#164a47', '#3a2a1e', '#241810'),
    W('#6a3aa8', '#4b2878', '#9264d6', '#d9dce6', '#a3a8b8', '#2a1d45', '#ffffff', '#7ff7ff', '#4b2878', '#341a55', '#2a1d45', '#1a1030'),
    W('#a82f3c', '#78202a', '#d6505e', '#f0c34a', '#b8922e', '#3a1520', '#ffffff', '#fff0a0', '#78202a', '#55141c', '#3a1520', '#240c12'),
    W('#22225a', '#15153b', '#3e3e8f', '#9ff3ff', '#5fc6d6', '#0e0e26', '#ffffff', '#ffffff', '#15153b', '#0c0c26', '#0e0e26', '#06060f'),
  ],
  RANGER: [
    W('#4f8a3c', '#376629', '#77b35a', '#7a5230', '#57391f', '#3d2a1c', '#d8b13a', '#d8b13a', '#5a4632', '#403223', '#4a3322', '#2e1f14'),
    W('#3f7a4f', '#2a5a37', '#62a877', '#8f5a2c', '#663f1c', '#3d2a1c', '#f0c34a', '#f0c34a', '#4a3a2a', '#33281c', '#4a3322', '#2e1f14'),
    W('#2f5f4f', '#1f4236', '#4f8f77', '#5f6670', '#3f454d', '#252a30', '#d8e2ee', '#7fd0ff', '#2f3540', '#20252d', '#252a30', '#16191e'),
    W('#5f7a2f', '#43571f', '#8fae4a', '#c8961e', '#8f6a10', '#3a2a10', '#fff0a0', '#ff6a3a', '#4a3a1a', '#332810', '#3a2a10', '#241a08'),
    W('#1f8f6a', '#136048', '#3fd6a0', '#2a2a3a', '#18181f', '#101018', '#7ff7ff', '#7ff7ff', '#1d2a33', '#131c22', '#101018', '#08080c'),
  ],
  HEALER: [
    W('#efe4cf', '#c9b996', '#fffaf0', '#c9a227', '#94761a', '#a07a4a', '#f0c34a', '#e86a8a', '#d9cdb4', '#b3a68a', '#8a6a4a', '#5f4730'),
    W('#f2ede4', '#c8c0b0', '#ffffff', '#4a8ad6', '#2f62a3', '#7a5a3a', '#cfe6ff', '#e86a8a', '#c8c0b0', '#a59d8e', '#6a5a4a', '#4a3e32'),
    W('#eef1f6', '#c2c8d4', '#ffffff', '#b8c4d4', '#8792a1', '#5c6573', '#ffffff', '#7fd0ff', '#c2c8d4', '#9aa2b0', '#5c6573', '#3f454d'),
    W('#fff8e6', '#e6d4a6', '#ffffff', '#e8b830', '#b08414', '#a07a2a', '#ffffff', '#ff6a8a', '#e6d4a6', '#c4b07e', '#8a6a2a', '#5f4a1a'),
    W('#ffffff', '#d9d2f0', '#ffffff', '#ffd75a', '#d4a83a', '#9a7ad6', '#7ff7ff', '#7ff7ff', '#e4defa', '#bdb4e0', '#9a7ad6', '#6a50a8'),
  ],
}

const WEAPON_TIERS = [
  { L: '#e2e2e2', A: '#9a9a9a', T: '#6b4a2a', t: '#4a3018', G: '#5fa8ff', g: '#2f6fd0' },
  { L: '#f6c896', A: '#c27a3a', T: '#8f5524', t: '#5f3612', G: '#5fe08a', g: '#2fa056' },
  { L: '#f7fbff', A: '#aab6c4', T: '#76808f', t: '#4f5866', G: '#b07aff', g: '#7a45d0' },
  { L: '#fff4b0', A: '#e0b030', T: '#c8961e', t: '#8f6a10', G: '#ffd75a', g: '#d0a020' },
  { L: '#e2ffff', A: '#5fd3e8', T: '#ecc65a', t: '#b8922e', G: '#7ff7ff', g: '#3fb8d6' },
]
const WOOD = { K: '#7a5230', k: '#57391f', W: '#f2f2f2' }

// ---------------------------------------------------------------- gövde
const BODY: Block = [6, 0, [
  '...........SSSSSSSSSS...........',
  '.........SSSSSSSSSSSSSS.........',
  '........SSSSSSSSSSSSSSSS........',
  '........SSSSSSSSSSSSSSSS........',
  '........SSSSSSSSSSSSSSSS........',
  '........SSSwESSSSSSwESSS........',
  '........SSSEESSSSSSEESSS........',
  '........SSSEESSSSSSEESSS........',
  '........SBBSSSSSSSSSSBBS........',
  '........SSSSSSSMMSSSSSSS........',
  '........sSSSSSSSSSSSSSSs........',
  '.........ssSSSSSSSSSSss.........',
  '...........ssssssssss...........',
  '..............NNNN..............',
  '.......UUUUUUUUUUUUUUUUUU.......',
  '.......UUUUUUUUUUUUUUUUUU.......',
  '.......UUUUUUUUUUUUUUUUUU.......',
  '.......UUUUUUUUUUUUUUUUUU.......',
  '.......UUUUUUUUUUUUUUUUUU.......',
  '.......UUUUUUUUUUUUUUUUUU.......',
  '.......SS.UUUUUUUUUUUU.SS.......',
  '.......ss.UUUUUUUUUUUU.ss.......',
  '...........PPPP..PPPP...........',
  '...........PPpp..PPpp...........',
  '..........OOOOO..OOOOO..........',
  '..........ooooo..ooooo..........',
]]

const BLINK: Block[] = [s(11, 11, 'SS'), s(11, 19, 'SS'), s(12, 11, 'SS'), s(12, 19, 'SS'), s(13, 11, 'EE'), s(13, 19, 'EE')]
const JOY: Block[] = [s(11, 11, 'SS'), s(11, 19, 'SS'), s(12, 11, 'EE'), s(12, 19, 'EE'), s(13, 11, 'SS'), s(13, 19, 'SS'), s(11, 10, 'E'), s(11, 13, 'E'), s(11, 18, 'E'), s(11, 21, 'E'), s(15, 14, 'MMMM'), s(16, 15, 'mm')]
const HURT: Block[] = [s(11, 11, 'ES'), s(11, 19, 'SE'), s(12, 11, 'SE'), s(12, 19, 'ES'), s(13, 11, 'ES'), s(13, 19, 'SE'), s(15, 15, 'SS'), s(15, 14, 'MMMM')]
const FEMALE_FACE: Block[] = [s(11, 10, 'E'), s(11, 21, 'E'), s(10, 10, 'E'), s(10, 21, 'E')]
const BROWS: Block[] = [s(9, 11, 'YY'), s(9, 19, 'YY')]

// ---------------------------------------------------------------- saç modelleri
const HAIR_M_SHORT: Block[] = [
  s(3, 11, 'HHHHHHHHHH'),
  s(4, 9, 'HHHHHHHHHHHHHH'),
  s(5, 8, 'HHHHLLHHHHHHHHHh'),
  s(6, 7, 'HHHHLLLHHHHHHHHHHh'),
  s(7, 7, 'HHHHHHHHHhHHHHHHHh'),
  s(8, 7, 'HH'), s(8, 10, 'HHH'), s(8, 14, 'HHhH'), s(8, 19, 'HH'), s(8, 23, 'Hh'),
  s(9, 7, 'H'), s(9, 24, 'h'), s(10, 7, 'h'), s(10, 24, 'h'),
]
const HAIR_M_SPIKY: Block[] = [
  s(0, 11, 'H'), s(0, 16, 'H'), s(0, 20, 'H'),
  s(1, 10, 'HH'), s(1, 14, 'HHH'), s(1, 19, 'HHH'),
  s(2, 9, 'HHHLHHHHHHHHh'),
  s(3, 8, 'HHHLLHHHHHLHHHHh'),
  s(4, 7, 'HHHHLLHHHHLLHHHHHh'),
  s(5, 7, 'HHHHHHHHHHHHHHHHHh'),
  s(6, 6, 'HHHHHHHHHHHHHHHHHHHh'),
  s(7, 7, 'HHhHHHHhHHHHhHHHHh'),
  s(8, 7, 'HH'), s(8, 11, 'H'), s(8, 15, 'HH'), s(8, 20, 'H'), s(8, 23, 'hH'),
  s(9, 7, 'H'), s(9, 24, 'h'), s(10, 7, 'h'), s(10, 24, 'h'),
]
const BEARD: Block[] = [
  s(14, 8, 'h'), s(14, 23, 'h'),
  s(15, 8, 'Hh'), s(15, 13, 'HH'), s(15, 17, 'HH'), s(15, 22, 'hH'),
  s(16, 8, 'HHHHHHHHHHHHHHHH'),
  s(17, 9, 'hHHHHHHHHHHHHh'),
  s(18, 11, 'hHHHHHHHh'),
  s(19, 13, 'hHHHh'),
]
const HAIR_F_LONG_BACK: Block[] = [
  ...Array.from({ length: 15 }, (_, i) => s(8 + i, 5, i % 4 === 3 ? 'hHH' : 'HHH')),
  ...Array.from({ length: 15 }, (_, i) => s(8 + i, 24, i % 4 === 1 ? 'HHh' : 'HHH')),
  s(23, 6, 'Hh'), s(23, 24, 'hH'), s(24, 6, 'h'), s(24, 25, 'h'),
]
const HAIR_F_LONG_FRONT: Block[] = [
  s(3, 11, 'HHHHHHHHHH'),
  s(4, 9, 'HHHHHHHHHHHHHH'),
  s(5, 8, 'HHHLLLHHHHHHHHHh'),
  s(6, 7, 'HHHHLLHHHHHHHHHHHh'),
  s(7, 7, 'HHHHHHHHHHHHHHHHHh'),
  s(8, 7, 'HHHHHH'), s(8, 17, 'HHHHHHHh'),
  s(9, 7, 'HHHH'), s(9, 21, 'HHHh'),
  s(10, 7, 'HH'), s(10, 23, 'Hh'),
  ...Array.from({ length: 8 }, (_, i) => s(11 + i, 7, 'H')),
  ...Array.from({ length: 8 }, (_, i) => s(11 + i, 24, 'h')),
]
const HAIR_F_BUN: Block[] = [
  s(0, 13, 'HHHH'), s(1, 12, 'HHLHHh'), s(2, 12, 'HHHHHh'), s(3, 13, 'hhhh'),
  s(3, 9, 'HHH'), s(3, 19, 'HHH'),
  s(4, 8, 'HHHHHHHHHHHHHHHh'),
  s(5, 7, 'HHHLLHHHHHHHHHHHHh'),
  s(6, 7, 'HHHHLLHHHHHHHHHHHh'),
  s(7, 7, 'HHHHHHHHHHHHHHHHHh'),
  s(8, 7, 'HHHHH'), s(8, 13, 'H'), s(8, 18, 'HHHHHh'),
  s(9, 7, 'HHH'), s(9, 22, 'HHh'),
  s(10, 7, 'HH'), s(10, 23, 'Hh'),
  s(11, 7, 'H'), s(11, 24, 'h'), s(12, 7, 'H'), s(12, 24, 'h'),
  s(4, 21, 'R'), s(3, 22, 'R'),
]
const HIJAB_BLOCK: Block[] = [
  s(2, 12, 'HHHHHHHH'),
  s(3, 10, 'HHHHHHHHHHHH'),
  s(4, 8, 'HHHHLLHHHHHHHHHh'),
  s(5, 7, 'HHHHLLLHHHHHHHHHHh'),
  s(6, 6, 'HHHHHLHHHHHHHHHHHHHh'),
  s(7, 6, 'HHHHHHHHHHHHHHHHHHHh'),
  s(8, 6, 'HHH'), s(8, 23, 'HHh'),
  ...Array.from({ length: 8 }, (_, i) => s(9 + i, 6, 'HHH')),
  ...Array.from({ length: 8 }, (_, i) => s(9 + i, 23, 'HHh')),
  s(17, 6, 'HHHH'), s(17, 22, 'HHHh'),
  s(18, 6, 'HHHHHHHHHHHHHHHHHHHh'),
  s(19, 5, 'HHHHHHLHHHHHHHHHHHHHHh'),
  s(20, 5, 'hHHHHHHHHHHHHHHHHHHHHh'),
  s(21, 6, 'hHHHHHHHHHHHHHHHHHHh'),
  s(22, 8, 'hhHHHHHHHHHHHhhh'),
]

// ---------------------------------------------------------------- kıyafetler
const OUTFIT_BLOCKS: Record<HeroClass, Block[]> = {
  WARRIOR: [[20, 0, [
    '......TTTTTAAAAAAAAAATTTTT......',
    '......tTLTtALAAAAAAAatTLTt......',
    '.......aAaALLAATTAAAAaaAa.......',
    '.......aAaALAAATTAAAAaaAa.......',
    '.......aAaAAAAATTAAAAaaAa.......',
    '.......TTTKKKKKkkKKKKKTTT.......',
    '..........aAAAAaaAAAAa..........',
    '..........tTTt.tt.tTTt..........',
  ]], s(23, 15, 'GG')],
  MAGE: [[20, 0, [
    '........AAAAAATTTTAAAAAa........',
    '.......AAAAAAAATTAAAAAAAa.......',
    '......aAAALAAAAGGAAAAAAAAa......',
    '......aAAALAAAAAAAAAAAAAAa......',
    '.....aAAAAaAAAAAAAAAAaAAAAa.....',
    '.....TTTTTKKKKKkkKKKKKTTTTT.....',
    '..........aAAAAAAAAAAa..........',
    '.........aAAAAAAAAAAAAa.........',
    '.........aAAAAAAAAAAAAa.........',
    '.........TTTTTTTTTTTTTT.........',
  ]], s(26, 15, 'TT'), s(27, 15, 'TT'), s(28, 15, 'TT')],
  RANGER: [[20, 0, [
    '........AAAATTTTTTTTAAAA........',
    '.......aAAATLTTTTTTtTAAAa.......',
    '.......aAaATLTTTTTTtTAaAa.......',
    '.......aAaATTTTTTTTtTAaAa.......',
    '.......aAaATTTTGTTTtTAaAa.......',
    '.......TTTKKKKKkkKKKKKTTT.......',
    '..........aAAAAAAAAAAa..........',
    '..........aAAAAaaAAAAa..........',
  ]], s(20, 20, 'K'), s(21, 19, 'K'), s(22, 18, 'K'), s(23, 17, 'K'), s(24, 16, 'K')],
  HEALER: [[20, 0, [
    '........TAAAAAAAAAAAAAAT........',
    '.......aAAAAAAATTAAAAAAAa.......',
    '.......aAaALAAATTAAAAaaAa.......',
    '.......aAaALAAGTTGAAAaaAa.......',
    '.......aAaAAAAGGGGAAAaaAa.......',
    '.......TTTAAAAAGGAAAAaTTT.......',
    '..........aAAAATTAAAAa..........',
    '.........aAAAAATTAAAAAa.........',
    '.........aAAAAATTAAAAAa.........',
    '.........TTTTTTTTTTTTTT.........',
  ]], s(20, 9, 'TT'), s(20, 21, 'TT')],
}

const QUIVER: Block[] = [s(10, 24, 'R.R'), s(11, 24, 'WRW'), s(12, 25, 'KK'), ...Array.from({ length: 8 }, (_, i) => s(13 + i, 25, 'Kk'))]

// ---------------------------------------------------------------- silahlar
const SWORD: Block = [6, 23, [
  '..L...',
  '..LA..',
  '..LA..', '..LA..', '..LA..', '..LA..', '..LA..', '..LA..', '..LA..', '..LA..',
  '..LA..', '..LA..', '..LA..', '..LA..', '..LA..', '..LA..', '..LA..', '..LA..',
  'TTTTTT',
  '.tKKt.',
  '..KK..',
  '..kk..',
  '..GG..',
]]
const STAFF: Block = [-1, 24, [
  '.GGG.',
  'GLGGg',
  'GGGGg',
  '.gGg.',
  'T.K.T',
  '.TKT.',
  ...Array.from({ length: 26 }, (_, i) => (i % 6 === 5 ? '..k..' : '..K..')),
]]
const BOW: Block = [12, 25, [
  'WKK.', 'W.K.', 'W..K', 'W..K', 'W..K', 'W..K', 'W..K', 'W.K.', 'W.K.',
  'W.k.', 'W.k.', 'W.k.', 'W.K.', 'W.K.', 'W..K', 'W..K', 'W..K', 'W.K.', 'WK..',
]]
const SCEPTER: Block = [3, 24, [
  '.G.G.',
  'GGGGG',
  'GLGGG',
  '.GGg.',
  '..g..',
  '.TTT.',
  ...Array.from({ length: 24 }, (_, i) => (i % 5 === 4 ? '..t..' : '..T..')),
]]

// ---------------------------------------------------------------- başlıklar
const HEAD_CLASS: Record<HeroClass, Block[]> = {
  WARRIOR: [
    s(0, 15, 'RR'), s(1, 14, 'RrRR'), s(2, 14, 'RRrR'),
    s(3, 10, 'TTTTTTTTTTTT'),
    s(4, 9, 'TLLAAAAAAAAAAT'),
    s(5, 8, 'TLAAAAAAAAAAAAAT'),
    s(6, 7, 'TLAAAAAAAAAAAAAAaT'),
    s(7, 7, 'TAAAAAAAAAAAAAAAaT'),
    s(8, 7, 'TTTTTTTTTTTTTTTTTT'),
    s(9, 7, 'Ta'), s(9, 23, 'aT'), s(10, 7, 'Ta'), s(10, 23, 'aT'), s(11, 7, 'T'), s(11, 24, 'T'),
  ],
  MAGE: [[-3, 0, [
    '...............AA...............',
    '..............AAAa..............',
    '.............AALAAa.............',
    '............AALAAAAa............',
    '...........AALAGAAAAa...........',
    '..........AALAAAAAAAAa..........',
    '.........AAAAAAAAAAAAAa.........',
    '........TTTTTTTkkTTTTTTT........',
    '.....AAAAAAAAAAAAAAAAAAAAAa.....',
    '......aaaaaaaaaaaaaaaaaaaa......',
  ]]],
  RANGER: [
    s(1, 13, 'AAAAA'), s(2, 11, 'AAAAAAAAA'),
    s(3, 10, 'AAAAAAAAAAAA'),
    s(4, 8, 'AAAALLAAAAAAAAAa'),
    s(5, 7, 'AAAALLLAAAAAAAAAAa'),
    s(6, 6, 'AAAAALAAAAAAAAAAAAAa'),
    s(7, 6, 'AAAAAAAAAAAAAAAAAAAa'),
    s(8, 6, 'AAa'), s(8, 23, 'aAa'),
    ...Array.from({ length: 8 }, (_, i) => s(9 + i, 6, 'AAa')),
    ...Array.from({ length: 8 }, (_, i) => s(9 + i, 23, 'aAa')),
    s(17, 6, 'AAAA'), s(17, 22, 'AAAa'),
    s(18, 6, 'aAAAAAAAAAAAAAAAAAAa'),
    s(19, 7, 'aaAAAAAAAAAAAAAAaa'),
    s(2, 23, 'Aa'), s(3, 24, 'Aa'), s(4, 25, 'a'),
  ],
  HEALER: [s(7, 8, 'tTTTTTTTTTTTTTTt'), s(8, 9, 't'), s(8, 22, 't'), s(6, 14, 'TGGT'), s(5, 15, 'GG')],
}
const HEAD_FLOWER: Block[] = [s(3, 9, '.R..Y..P..R..'), s(4, 8, 'gRgYgYgPgRgYgPg'), s(5, 9, 'g.g.g.g.g.g.g')]
const HEAD_CROWN: Block[] = [[-1, 9, [
  '.T....TT....T.',
  '.TT..TTTT..TT.',
  '.TTTTTTTTTTTT.',
  '.tGtRtGGtRtGt.',
  '.tttttttttttt.',
]]]
const HEAD_CROWN_PAL: Palette = { T: '#f5c94a', t: '#b8922e', G: '#7ff7ff', R: '#e83a5a' }
const HEAD_FLOWER_PAL: Palette = { g: '#5aa84a', R: '#ff6a8a', Y: '#ffd75a', P: '#b98aff' }

const CAPE: Block = [19, 0, [
  '........CCCCCCCCCCCCCCCC........',
  ...Array.from({ length: 10 }, () => '......cCCCCCCCCCCCCCCCCCCc......'),
  '.......cCCcCCcCCcCCcCCcc........',
]]
export const CAPES: Record<string, Palette> = {
  cape_red: { C: '#c0303a', c: '#8a1f28' },
  cape_blue: { C: '#2f5fb0', c: '#1f3f7a' },
  cape_royal: { C: '#6a2fa0', c: '#45206a' },
  cape_gold: { C: '#e0b232', c: '#a77d16' },
}

// ---------------------------------------------------------------- birleştir
export function renderHero(cls: HeroClass, look: Look, gear: Gear = {}, pose: Pose = 'idle'): Grid {
  const g = makeGrid(HERO_W, HERO_H)
  const gender = look.gender ?? 'F'
  const hairStyle = look.hair ?? 0
  const hijab = gender === 'F' && hairStyle === 2
  const skin = SKIN[look.skin ?? 0] ?? SKIN[0]
  const hairPal = (hijab ? HIJAB : HAIR)[look.hairColor ?? 0] ?? HAIR[0]
  const armorTier = Math.max(0, Math.min(4, gear.armor ?? 0))
  const weaponTier = Math.max(0, Math.min(4, gear.weapon ?? 0))
  const outfit = OUTFIT[cls][armorTier]
  const face: Palette = { ...skin, E: '#2a1d33', w: '#ffffff', M: gender === 'F' ? '#d4566c' : '#b8505a', m: '#7a2a35', Y: hijab ? '#3a2a22' : (hairPal.h as string), U: outfit.A, P: outfit.P, p: outfit.p, O: outfit.O, o: outfit.o }
  const hp: Palette = { ...hairPal, R: '#ff6a8a' }

  if (gear.cape && CAPES[gear.cape]) paint(g, [CAPE], CAPES[gear.cape], OX, OY)
  if (!hijab && gender === 'F' && hairStyle === 0) paint(g, HAIR_F_LONG_BACK, hp, OX, OY)
  if (cls === 'RANGER') paint(g, QUIVER, { R: '#e04a3a', W: '#f2f2f2', K: outfit.T, k: outfit.t }, OX, OY)

  paint(g, [BODY], face, OX, OY)
  paint(g, BROWS, face, OX, OY)
  if (gender === 'F') paint(g, FEMALE_FACE, face, OX, OY)
  if (pose === 'blink') paint(g, BLINK, face, OX, OY)
  if (pose === 'joy') paint(g, JOY, face, OX, OY)
  if (pose === 'hurt') paint(g, HURT, face, OX, OY)

  paint(g, OUTFIT_BLOCKS[cls], outfit, OX, OY)

  if (hijab) paint(g, HIJAB_BLOCK, hp, OX, OY)
  else if (gender === 'F') paint(g, hairStyle === 1 ? HAIR_F_BUN : HAIR_F_LONG_FRONT, hp, OX, OY)
  else {
    paint(g, hairStyle === 1 ? HAIR_M_SPIKY : HAIR_M_SHORT, hp, OX, OY)
    if (hairStyle === 2) paint(g, BEARD, hp, OX, OY)
  }

  if (gear.head === 'head_class') {
    const pal = cls === 'HEALER' ? { T: outfit.T, t: outfit.t, G: outfit.G } : { ...outfit, R: '#d63a4a', r: '#9a2030', k: outfit.k }
    paint(g, HEAD_CLASS[cls], pal, OX, OY)
  } else if (gear.head === 'head_flower') paint(g, HEAD_FLOWER, HEAD_FLOWER_PAL, OX, OY)
  else if (gear.head === 'head_crown') paint(g, HEAD_CROWN, HEAD_CROWN_PAL, OX, OY)

  const wp = { ...WEAPON_TIERS[weaponTier], ...WOOD }
  if (cls === 'WARRIOR') paint(g, [SWORD], { ...wp, K: '#4a2f1c', k: '#2e1d10' }, OX, OY)
  if (cls === 'MAGE') paint(g, [STAFF], { ...wp, T: wp.T }, OX, OY)
  if (cls === 'RANGER') paint(g, [BOW], { ...wp, K: weaponTier >= 3 ? wp.A : '#8a5a32', k: wp.T }, OX, OY)
  if (cls === 'HEALER') paint(g, [SCEPTER], { ...wp, G: ['#e86a8a', '#ff8ab0', '#7fd0ff', '#ff6a8a', '#7ff7ff'][weaponTier], g: ['#b8456a', '#d0608a', '#4fa0d6', '#c8456a', '#3fb8d6'][weaponTier] }, OX, OY)

  return outline(g)
}

/** Yüz portresi (HUD için): baş bölgesi */
export function renderPortrait(cls: HeroClass, look: Look, gear: Gear = {}): Grid {
  const full = renderHero(cls, look, { ...gear, cape: undefined }, 'idle')
  const top = 3, left = 6, size = 28
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => full[top + y]?.[left + x] ?? null))
}

export const CLASS_INFO: Record<HeroClass, { name: string; stat: string; color: string }> = {
  WARRIOR: { name: 'Savaşçı', stat: 'BODY', color: '#ff6b5a' },
  MAGE: { name: 'Büyücü', stat: 'MIND', color: '#6aa8ff' },
  RANGER: { name: 'Okçu', stat: 'ORDER', color: '#5bd17c' },
  HEALER: { name: 'Şifacı', stat: 'SPIRIT', color: '#ffd75a' },
}
