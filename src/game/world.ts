// Keşif paketi verileri (0022): bölgeler, keşif kartları, tohumlar, yol ayrımı, keşif hikâyeleri, anı başlıkları.
// Sunucu yalnızca anahtarları tutar; adlar, renkler ve simgeler burada.

export interface Region {
  key: string; name: string; icon: string; color: string
  /** sahne paleti: uzak dağ, yakın dağ, tepe, zemin, ağaç; süs türü */
  land: { far: string; mid: string; hill: string; grass: string; tree: string; path: string }
  deco: 'pine' | 'oak' | 'reed' | 'cactus' | 'snowpine' | 'rock' | 'crystal' | 'cloud' | 'star'
  snow?: boolean
  ambient: 'birds' | 'forest' | 'frogs' | 'wind' | 'snow' | 'fire' | 'drips' | 'sky' | 'stars'
}

export const REGIONS: Region[] = [
  { key: 'meadow', name: 'Yeşil Vadi', icon: 'flower', color: '#6cc24a', deco: 'pine', ambient: 'birds',
    land: { far: '#8fb0d6', mid: '#6a93b0', hill: '#5aae5a', grass: '#6cc24a', tree: '#2f7a3a', path: '#c8a878' } },
  { key: 'forest', name: 'Fısıltı Ormanı', icon: 'apple', color: '#3f9a4a', deco: 'oak', ambient: 'forest',
    land: { far: '#6a9a8a', mid: '#3f6a4a', hill: '#2f7a3a', grass: '#3f9a3f', tree: '#1f5a2a', path: '#9a7a50' } },
  { key: 'swamp', name: 'Sisli Bataklık', icon: 'water', color: '#5a8a6a', deco: 'reed', ambient: 'frogs',
    land: { far: '#7a8a9a', mid: '#4a6a6a', hill: '#3f5a4a', grass: '#4a6a3a', tree: '#2a3f2a', path: '#5a6a4a' } },
  { key: 'desert', name: 'Altın Çöl', icon: 'sun', color: '#e0b050', deco: 'cactus', ambient: 'wind',
    land: { far: '#e0b080', mid: '#c89060', hill: '#e8c070', grass: '#f0d088', tree: '#4a9a4a', path: '#d8a860' } },
  { key: 'snow', name: 'Buzul Dağları', icon: 'shard', color: '#a8d8f0', deco: 'snowpine', snow: true, ambient: 'snow',
    land: { far: '#c8d8f0', mid: '#9ab0d0', hill: '#dce8f8', grass: '#eef6ff', tree: '#2f5a5a', path: '#b8c8e0' } },
  { key: 'volcano', name: 'Ateş Dağı', icon: 'flame', color: '#ff6a2a', deco: 'rock', ambient: 'fire',
    land: { far: '#6a3a3a', mid: '#4a2a2a', hill: '#3a2424', grass: '#2a1c1c', tree: '#ff6a2a', path: '#ff8a3d' } },
  { key: 'cave', name: 'Kristal Mağaralar', icon: 'rune', color: '#7ef0ff', deco: 'crystal', ambient: 'drips',
    land: { far: '#3a3a6a', mid: '#2a2a50', hill: '#24244a', grass: '#30305a', tree: '#7ef0ff', path: '#4a4a7a' } },
  { key: 'sky', name: 'Bulutların Üstü', icon: 'star', color: '#ffe680', deco: 'cloud', ambient: 'sky',
    land: { far: '#ffffff', mid: '#e8f0ff', hill: '#f4f8ff', grass: '#ffffff', tree: '#ffd75a', path: '#ffe9a8' } },
  { key: 'stars', name: 'Yıldız Denizi', icon: 'sparkle', color: '#c0a8ff', deco: 'star', ambient: 'stars',
    land: { far: '#3a2a6a', mid: '#2a1f50', hill: '#4a3a8a', grass: '#5a4aa0', tree: '#ffe680', path: '#8a7ad0' } },
]
export const regionOf = (n: number) => REGIONS[Math.max(0, Math.min(REGIONS.length - 1, n))]

/** Keşif kartları: her bölgede 4 kart; 1-2 sık, 3 seyrek, 4 nadir */
const CARD_DEFS: Record<string, Array<[string, string]>> = {
  meadow: [['Gelincik Tarlası', 'flower'], ['Kayıp Kuzu', 'heart'], ['Eski Kuyu', 'water'], ['Gökkuşağı', 'sparkle']],
  forest: [['Yaban Elması', 'apple'], ['Ateşböceği', 'lamp'], ['Peri Halkası', 'rune'], ['Ormanın Kalbi', 'shard']],
  swamp: [['Nilüfer Gölü', 'flower'], ['Kurbağa Kral', 'crown'], ['Sis Feneri', 'lamp'], ['Batık Sandık', 'chest']],
  desert: [['Vaha', 'water'], ['Kervan', 'bag'], ['Çöl Gecesi', 'moon'], ['Kayıp Hazine', 'coin']],
  snow: [['Buz Sarkıtı', 'shard'], ['Sıcak Çorba', 'potion'], ['Kuzey Işıkları', 'sparkle'], ['Kristal Taç', 'crown']],
  volcano: [['Lav Gölü', 'flame'], ['Obsidyen', 'shard'], ['Demirci Ocağı', 'sword'], ['Anka Tüyü', 'quill']],
  cave: [['Yankı', 'music'], ['Parlayan Mantar', 'lamp'], ['Eski Rünler', 'rune'], ['Kristal Kalp', 'heart']],
  sky: [['Bulut Kalesi', 'shield'], ['Rüzgâr Çanı', 'music'], ['Yıldız Kayması', 'star'], ['Gök Tapınağı', 'pray']],
  stars: [['Kuyruklu Yıldız', 'star'], ['Ay Bahçesi', 'moon'], ['Takımyıldız', 'sparkle'], ['Sonsuzluk', 'heart']],
}
export interface Card { key: string; region: number; n: number; name: string; icon: string; rarity: 1 | 2 | 3 }
export const CARDS: Card[] = REGIONS.flatMap((r, ri) => CARD_DEFS[r.key].map(([name, icon], i) => ({
  key: `${r.key}_${i + 1}`, region: ri, n: i + 1, name, icon, rarity: (i < 2 ? 1 : i === 2 ? 2 : 3) as 1 | 2 | 3,
})))
export const cardOf = (k: string) => CARDS.find(c => c.key === k)
export const RARITY = { 1: { name: 'Sık', color: '#c8d0e0' }, 2: { name: 'Seyrek', color: '#4cc9f0' }, 3: { name: 'Nadir', color: '#ffcc3a' } } as const

/** Tohumlar (sunucudaki bb_world_cfg ile aynı anahtarlar) */
export interface Seed { key: string; name: string; petal: string; center: string; region: number; days: number; price: number | null; gold: number }
export const SEEDS: Seed[] = [
  { key: 'daisy', name: 'Papatya', petal: '#ffffff', center: '#ffd75a', region: 0, days: 3, price: 20, gold: 15 },
  { key: 'tulip', name: 'Lale', petal: '#ff4d6d', center: '#ffd75a', region: 0, days: 4, price: 40, gold: 28 },
  { key: 'rose', name: 'Gül', petal: '#d6304a', center: '#8a1f2a', region: 0, days: 5, price: 70, gold: 50 },
  { key: 'lavender', name: 'Lavanta', petal: '#b98aff', center: '#7a5ad0', region: 1, days: 4, price: null, gold: 35 },
  { key: 'lotus', name: 'Nilüfer', petal: '#ff9ad0', center: '#fff0a0', region: 2, days: 4, price: null, gold: 40 },
  { key: 'desertrose', name: 'Çöl Gülü', petal: '#ff8a3d', center: '#ffe680', region: 3, days: 5, price: null, gold: 50 },
  { key: 'snowdrop', name: 'Kardelen', petal: '#eef8ff', center: '#9ad8a0', region: 4, days: 5, price: null, gold: 55 },
  { key: 'firelily', name: 'Ateş Zambağı', petal: '#ff5a1a', center: '#ffd75a', region: 5, days: 6, price: null, gold: 70 },
  { key: 'crystal', name: 'Kristal Çiçek', petal: '#7ef0ff', center: '#ffffff', region: 6, days: 6, price: null, gold: 80 },
  { key: 'cloudcotton', name: 'Bulut Pamuğu', petal: '#ffffff', center: '#cfe8ff', region: 7, days: 7, price: null, gold: 95 },
  { key: 'starflower', name: 'Yıldız Çiçeği', petal: '#ffe680', center: '#ff9ad0', region: 8, days: 7, price: null, gold: 120 },
]
export const seedOf = (k: string) => SEEDS.find(s => s.key === k)

/** Yol ayrımı seçenekleri ve etkileri */
export const FORK_OPTIONS: Record<string, { name: string; icon: string }> = {
  bridge: { name: 'Köprü', icon: 'stairs' }, cave: { name: 'Mağara', icon: 'lamp' },
  river: { name: 'Nehir', icon: 'water' }, pass: { name: 'Dağ Geçidi', icon: 'boot' },
  market: { name: 'Pazar', icon: 'coin' }, woods: { name: 'Koru', icon: 'flower' },
  tower: { name: 'Gözcü Kulesi', icon: 'shield' }, library: { name: 'Kütüphane', icon: 'book' },
  camp: { name: 'Kamp Ateşi', icon: 'flame' }, ruins: { name: 'Harabeler', icon: 'chest' },
  lake: { name: 'Göl', icon: 'water' }, cliff: { name: 'Uçurum', icon: 'swords' },
  village: { name: 'Köy', icon: 'bag' }, shrine: { name: 'Mabet', icon: 'pray' },
  meadow: { name: 'Çayır', icon: 'flower' }, forge: { name: 'Demirhane', icon: 'sword' },
}
export const FORK_FX: Record<string, { text: string; icon: string; color: string }> = {
  XP: { text: '+%10 XP', icon: 'star', color: '#4cc9f0' },
  GOLD: { text: '+%20 altın', icon: 'coin', color: '#ffcc3a' },
  DMG: { text: '+%15 hasar', icon: 'sword', color: '#ff4d6d' },
  LOVE: { text: 'Dost sevgisi ×1.5', icon: 'heart', color: '#ff8ab5' },
}

/** Keşif hikâyeleri ({n} = dostun adı) */
const STORIES: Record<string, string[]> = {
  meadow: ['{n} kelebek kovaladı, sonunda bir tanesi burnuna kondu.', '{n} çayırda yuvarlandı, her yeri çiçek oldu.', '{n} bir kuzuyla arkadaş oldu.',
    '{n} eski kuyuya bakıp kendi yansımasına havladı… ya da miyavladı.', '{n} yel değirmeninin gölgesinde uyuyakaldı.', '{n} size bir avuç yaban çileği getirdi.'],
  forest: ['{n} yaşlı bir baykuşla sohbet etti.', '{n} ateşböceklerini saydı, 37\'de şaşırdı.', '{n} bir sincapla fındık pazarlığı yaptı.',
    '{n} peri halkasının içine girdi, biraz parladı.', '{n} yosunlu bir kütüğün üstünde kestirdi.', '{n} ormanda kaybolmadı, çünkü sizi düşündü.'],
  swamp: ['{n} bir kurbağa korosunu dinledi.', '{n} sisin içinde bir fener gördü ve izledi.', '{n} nilüfer yaprağında sallandı.',
    '{n} çamura bastı, ama pek umursamadı.', '{n} bataklık kralının tacını bir an taktı.', '{n} sisli suda yıldızları saydı.'],
  desert: ['{n} bir vahada serinledi.', '{n} kervanla biraz yol yürüdü.', '{n} kum tepesinden kaydı, çok eğlendi.',
    '{n} çöl gecesinde yıldızların altında uyudu.', '{n} bir kertenkeleyle yarıştı, berabere bitti.', '{n} kumda parlayan bir şey buldu.'],
  snow: ['{n} ilk kez kar yedi, beğendi.', '{n} kuzey ışıklarını seyretti.', '{n} kızakla kaydı ve kahkaha attı.',
    '{n} bir kardan adama atkı taktı.', '{n} sıcak çorba kokusunun peşinden gitti.', '{n} buz sarkıtlarında kendini on kere gördü.'],
  volcano: ['{n} lavın kenarında marshmallow kızarttı.', '{n} bir demirciye körük çekti.', '{n} obsidyen taşlarında kayboldu, sonra buldu kendini.',
    '{n} sıcaktan biraz pembeleşti.', '{n} bir anka kuşunun tüyünü buldu.', '{n} dağın kalbini dinledi: güm güm.'],
  cave: ['{n} yankısıyla saklambaç oynadı.', '{n} parlayan mantarların arasında dans etti.', '{n} eski rünleri okumaya çalıştı.',
    '{n} damlaların müziğini dinledi.', '{n} bir yarasa ile dost oldu.', '{n} kristallerin içinde gökkuşağı buldu.'],
  sky: ['{n} bir bulutun üstünde zıpladı.', '{n} rüzgâr çanlarını çaldı.', '{n} kayan bir yıldıza dilek tuttu.',
    '{n} uçan bir balinanın sırtına bindi.', '{n} gök tapınağında huzur buldu.', '{n} yukarıdan evinizi gördü ve el salladı.'],
  stars: ['{n} kuyruklu yıldızın peşine takıldı.', '{n} ay bahçesinde çiçek kokladı.', '{n} takımyıldızlara sizin adınızı verdi.',
    '{n} sonsuzluğa baktı, sizi özledi.', '{n} bir yıldızı cebine koymaya çalıştı.', '{n} galaksinin en tatlı dostu seçildi.'],
}
export const storyOf = (region: number, idx: number, name: string) => (STORIES[regionOf(region).key][idx % 6] ?? '').replace('{n}', name)

/** Anı kartlarının başlığı ve simgesi */
export function memoryText(kind: string, d: Record<string, unknown>, names: { me: string; partner?: string; myId: string }): { title: string; icon: string; color: string } {
  const who = (id: unknown) => (id === names.myId ? names.me : names.partner ?? '')
  const stage = ['Bebek', 'Yavru', 'Genç', 'Yetişkin', 'Efsanevi'][Number(d.stage) || 0]
  switch (kind) {
    case 'START': return { title: 'Maceranın başladığı gün', icon: 'heart', color: '#ff8ab5' }
    case 'PET_NEW': return { title: `${d.name} yuvaya geldi`, icon: 'egg', color: '#ff8ab5' }
    case 'PET_STAGE': return { title: `${d.name} artık ${stage}`, icon: 'pet', color: '#ff8ab5' }
    case 'FIRST_BOSS': return { title: `İlk zafer: ${d.name}`, icon: 'swords', color: '#ff4d6d' }
    case 'BOSSES': return { title: `${d.n}. canavar yenildi`, icon: 'trophy', color: '#ffcc3a' }
    case 'REGION': return { title: `Yeni bölge: ${regionOf(Number(d.region)).name}`, icon: regionOf(Number(d.region)).icon, color: regionOf(Number(d.region)).color }
    case 'COMBO': return { title: `${d.n}. kombo günü`, icon: 'heart', color: '#5bd17c' }
    case 'LEVEL': return { title: `${String(d.name ?? who(d.user))} Sv ${d.level}`, icon: 'star', color: '#4cc9f0' }
    case 'FIRST_SUDOKU': return { title: 'İlk ortak sudoku', icon: 'grid', color: '#7ec8ff' }
    case 'FIRST_EXPLORE': return { title: `${d.name} ilk keşfinden döndü`, icon: 'bag', color: '#b98aff' }
    case 'RARE_CARD': return { title: `Nadir kart: ${cardOf(String(d.card))?.name ?? ''}`, icon: cardOf(String(d.card))?.icon ?? 'sparkle', color: '#ffcc3a' }
    case 'FIRST_HARVEST': return { title: `İlk hasat: ${seedOf(String(d.seed))?.name ?? ''}`, icon: 'flower', color: '#5bd17c' }
    case 'RARE_FLOWER': return { title: `${seedOf(String(d.seed))?.name ?? 'Nadir çiçek'} açtı`, icon: 'flower', color: seedOf(String(d.seed))?.petal ?? '#ff8ab5' }
    case 'CAPSULE': return { title: 'Zaman kapsülü açıldı', icon: 'scroll', color: '#ffcc3a' }
    default: return { title: kind, icon: 'star', color: '#c8d0e0' }
  }
}
