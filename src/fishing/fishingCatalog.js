/**
 * NUSA STRIKE — Katalog Ikan, Joran, dan Emote Nusantara.
 *
 * Berisi daftar ikan lokal Indonesia (Common, Uncommon, Rare, Mythic),
 * parameter AI dan physics minigame per rarity, daftar upgrade joran,
 * serta stiker/reaksi cepat di dermaga.
 */

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic'];

export const RARITY_CONFIG = {
  common: {
    id: 'common',
    label: 'Common',
    badge: 'UMUM',
    color: '#9ca3af',
    glow: 'rgba(156, 163, 175, 0.35)',
    barHeight: 28,          // % tinggi catch bar dari 100
    progressGain: 28,       // % per detik saat overlap
    progressLoss: 13,       // % per detik saat lepas
    tensionRageRate: 30,    // % per detik saat narik waktu ikan ngamuk
    tensionCalmDecay: 24,   // % per detik saat lepas / ikan tenang
    aiSpeed: 22,            // kecepatan gerak vertikal ikan
    aiDartChance: 0.4,      // peluang pindah target per detik
    rageInterval: [4.2, 6.5],
    rageDuration: [1.1, 1.7],
    weightMultiplier: 1,
  },
  uncommon: {
    id: 'uncommon',
    label: 'Uncommon',
    badge: 'LUMAYAN',
    color: '#2cc597',
    glow: 'rgba(44, 197, 151, 0.45)',
    barHeight: 24,
    progressGain: 25,
    progressLoss: 16,
    tensionRageRate: 38,
    tensionCalmDecay: 22,
    aiSpeed: 36,
    aiDartChance: 0.85,
    rageInterval: [3.2, 5.0],
    rageDuration: [1.3, 2.0],
    weightMultiplier: 1.25,
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    badge: 'LANGKA',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.5)',
    barHeight: 20,
    progressGain: 22,
    progressLoss: 19,
    tensionRageRate: 46,
    tensionCalmDecay: 20,
    aiSpeed: 58,
    aiDartChance: 1.5,      // darter / lompat-lompat
    rageInterval: [2.4, 3.8],
    rageDuration: [1.5, 2.3],
    weightMultiplier: 1.6,
  },
  mythic: {
    id: 'mythic',
    label: 'Mythic',
    badge: 'MITOS NUSANTARA',
    color: '#f5a623',
    glow: 'rgba(245, 166, 35, 0.65)',
    barHeight: 15,          // catch bar mengecil
    progressGain: 19,
    progressLoss: 22,
    tensionRageRate: 56,    // agresif, salah tahan langsung putus
    tensionCalmDecay: 18,
    aiSpeed: 82,
    aiDartChance: 2.3,
    rageInterval: [1.8, 3.0],
    rageDuration: [1.7, 2.6],
    weightMultiplier: 2.2,
  },
};

export const FISH_CATALOG = [
  // Common
  {
    id: 'lele-dumbo',
    name: 'Lele Dumbo',
    region: 'Sungai Jawa',
    rarity: 'common',
    minKg: 0.4,
    maxKg: 2.8,
    baseCoins: 25,
    color: '#64748b',
    accent: '#94a3b8',
    desc: 'Kumis panjang penghuni kolam dan kali deras, tarikannya santai.',
  },
  {
    id: 'mujair-danau',
    name: 'Mujair Danau',
    region: 'Danau Toba',
    rarity: 'common',
    minKg: 0.3,
    maxKg: 1.9,
    baseCoins: 22,
    color: '#78716c',
    accent: '#fb923c',
    desc: 'Ikan favorit pemancing pemula di pinggir dermaga.',
  },
  {
    id: 'nila-merah',
    name: 'Nila Merah',
    region: 'Waduk Jatiluhur',
    rarity: 'common',
    minKg: 0.5,
    maxKg: 2.5,
    baseCoins: 28,
    color: '#ef4444',
    accent: '#fca5a5',
    desc: 'Sisik merah menyala, suka menggigit umpan berkali-kali.',
  },
  {
    id: 'ikangabus',
    name: 'Gabus Rawa',
    region: 'Rawa Kalimantan',
    rarity: 'common',
    minKg: 0.6,
    maxKg: 3.4,
    baseCoins: 32,
    color: '#57534e',
    accent: '#a8a29e',
    desc: 'Predator air tenang yang diam-diam menyambar kail.',
  },

  // Uncommon
  {
    id: 'gurame-padang',
    name: 'Gurame Sabu',
    region: 'Sumatera Barat',
    rarity: 'uncommon',
    minKg: 1.2,
    maxKg: 5.5,
    baseCoins: 60,
    color: '#0d9488',
    accent: '#5eead4',
    desc: 'Badan lebar bertenaga, lumayan bikin joran melengkung.',
  },
  {
    id: 'patin-mahakam',
    name: 'Patin Jambal',
    region: 'Sungai Mahakam',
    rarity: 'uncommon',
    minKg: 1.8,
    maxKg: 8.2,
    baseCoins: 75,
    color: '#0284c7',
    accent: '#7dd3fc',
    desc: 'Perenang cepat arus bawah yang sering mengecoh pelampung.',
  },
  {
    id: 'bawal-bintang',
    name: 'Bawal Bintang',
    region: 'Kepulauan Seribu',
    rarity: 'uncommon',
    minKg: 1.5,
    maxKg: 6.4,
    baseCoins: 70,
    color: '#10b981',
    accent: '#fde047',
    desc: 'Gesit berbelok saat ditarik mendekati permukaan air.',
  },
  {
    id: 'kakap-putih',
    name: 'Kakap Putih (Barramundi)',
    region: 'Muara Papua',
    rarity: 'uncommon',
    minKg: 2.2,
    maxKg: 9.8,
    baseCoins: 88,
    color: '#14b8a6',
    accent: '#ccfbf1',
    desc: 'Suka melompat ke permukaan saat kail menancap.',
  },

  // Rare
  {
    id: 'toman-borneo',
    name: 'Monster Toman',
    region: 'Pedalaman Kapuas',
    rarity: 'rare',
    minKg: 4.5,
    maxKg: 16.5,
    baseCoins: 175,
    color: '#2563eb',
    accent: '#c084fc',
    desc: 'Gigi tajam dan gerakan darter zig-zag yang menguji jempol.',
  },
  {
    id: 'kerapu-macan',
    name: 'Kerapu Macan',
    region: 'Karang Wakatobi',
    rarity: 'rare',
    minKg: 5.0,
    maxKg: 22.0,
    baseCoins: 210,
    color: '#0ea5e9',
    accent: '#f97316',
    desc: 'Menghujam ke dasar karang begitu merasa terpancing.',
  },
  {
    id: 'tenggiri-bangka',
    name: 'Tenggiri Raja',
    region: 'Selat Bangka',
    rarity: 'rare',
    minKg: 6.0,
    maxKg: 26.0,
    baseCoins: 240,
    color: '#3b82f6',
    accent: '#93c5fd',
    desc: 'Torpedo perak yang melesat naik-turun tanpa kenal lelah.',
  },

  // Mythic
  {
    id: 'arwana-super-red',
    name: 'Arwana Super Red',
    region: 'Danau Sentarum',
    rarity: 'mythic',
    minKg: 8.5,
    maxKg: 28.0,
    baseCoins: 520,
    color: '#dc2626',
    accent: '#fbbf24',
    desc: 'Sang Naga Merah Kalimantan. Sisik emas menyala, tarikan brutal!',
  },
  {
    id: 'gt-raja-ampat',
    name: 'Giant Trevally (GT)',
    region: 'Raja Ampat',
    rarity: 'mythic',
    minKg: 18.0,
    maxKg: 65.0,
    baseCoins: 680,
    color: '#d97706',
    accent: '#fef08a',
    desc: 'Raja karang samudra timur. Sekali ngamuk senar langsung menjerit!',
  },
  {
    id: 'coelacanth-bunaken',
    name: 'Raja Laut Purba',
    region: 'Palung Bunaken',
    rarity: 'mythic',
    minKg: 35.0,
    maxKg: 98.0,
    baseCoins: 950,
    color: '#b45309',
    accent: '#38bdf8',
    desc: 'Fosil hidup legendaris Nusantara yang hanya muncul di lemparan sempurna.',
  },
];

export const ROD_CATALOG = [
  {
    id: 'bambu-desa',
    level: 1,
    name: 'Joran Bambu Kuning',
    price: 0,
    barBonus: 0,           // tambahan % tinggi catch bar
    tensionResist: 0,      // pengurangan % laju tension saat ngamuk
    luckBonus: 0,          // bonus peluang ikan langka/mitos
    color: '#a3e635',
    desc: 'Joran bambu lentur warisan kakek. Cukup buat narik lele & gurame.',
  },
  {
    id: 'fiber-pesisir',
    level: 2,
    name: 'Joran Fiber Pesisir',
    price: 180,
    barBonus: 4,
    tensionResist: 0.15,
    luckBonus: 0.08,
    color: '#2cc597',
    desc: 'Serat kaca kuat dengan reel mulus. Catch bar +4%, tahan senar +15%.',
  },
  {
    id: 'karbon-samudra',
    level: 3,
    name: 'Karbon Samudra Pro',
    price: 550,
    barBonus: 8,
    tensionResist: 0.28,
    luckBonus: 0.18,
    color: '#38bdf8',
    desc: 'Batang karbon ringan favorit pemancing turnamen. Catch bar +8%, hoki naik.',
  },
  {
    id: 'pusaka-nusantara',
    level: 4,
    name: 'Pusaka Naga Nusantara',
    price: 1400,
    barBonus: 13,
    tensionResist: 0.42,
    luckBonus: 0.32,
    color: '#f5a623',
    desc: 'Joran emas berukir naga. Senar baja anti-putus & magnet ikan Mythic!',
  },
];

export const QUICK_EMOTES = [
  { id: 'strike', icon: '🎣', label: 'STRIKE!' },
  { id: 'fire', icon: '🔥', label: 'Gacor!' },
  { id: 'laugh', icon: '😂', label: 'Putus wkwk' },
  { id: 'trophy', icon: '🏆', label: 'Mantap!' },
  { id: 'pray', icon: '🙏', label: 'Wangi!' },
  { id: 'shock', icon: '😱', label: 'Monster!' },
];

export const PUBLIC_DOCKS = [
  { code: 'NUSA01', name: 'Dermaga Nusantara #1' },
  { code: 'NUSA02', name: 'Dermaga Nusantara #2' },
  { code: 'NUSA03', name: 'Dermaga Raja Ampat #3' },
];

/**
 * Ambil data joran berdasarkan id (fallback ke bambu-desa).
 */
export function getRodById(rodId) {
  return ROD_CATALOG.find(item => item.id === rodId) || ROD_CATALOG[0];
}

/**
 * Ambil data ikan berdasarkan id.
 */
export function getFishById(fishId) {
  return FISH_CATALOG.find(item => item.id === fishId) || FISH_CATALOG[0];
}

/**
 * Hitung apakah lemparan mengenai sweet spot (power 72..88).
 */
export function evaluateCastAccuracy(power) {
  const p = Number(power) || 0;
  if (p >= 74 && p <= 86) {
    return { tier: 'perfect', label: 'SWEET SPOT!', bonusLuck: 0.28, distancePct: 92 };
  }
  if (p >= 55 && p <= 94) {
    return { tier: 'good', label: 'Lemparan Bagus', bonusLuck: 0.08, distancePct: Math.max(55, Math.min(88, p)) };
  }
  return { tier: 'normal', label: 'Lemparan Pendek', bonusLuck: 0, distancePct: Math.max(28, Math.min(60, p)) };
}

/**
 * Pilih ikan secara deterministik/acak berdasarkan akurasi lemparan dan level joran.
 *
 * @param {object} options
 * @param {number} [options.castPower] 0..100
 * @param {string} [options.rodId]
 * @param {() => number} [options.rng] fungsi random 0..1 (bisa disuntik untuk unit test)
 */
export function rollFishCatch({ castPower = 50, rodId = 'bambu-desa', rng = Math.random } = {}) {
  const rod = getRodById(rodId);
  const cast = evaluateCastAccuracy(castPower);
  const luck = Math.min(0.65, (rod.luckBonus || 0) + (cast.bonusLuck || 0));

  // Bobot dasar: common 55%, uncommon 27%, rare 13%, mythic 5%
  // Luck menggeser peluang dari common ke uncommon/rare/mythic
  const mythicChance = Math.min(0.28, 0.045 + luck * 0.24);
  const rareChance = Math.min(0.38, 0.13 + luck * 0.30);
  const uncommonChance = Math.min(0.42, 0.27 + luck * 0.15);

  const roll = rng();
  let pickedRarity = 'common';
  if (roll < mythicChance) pickedRarity = 'mythic';
  else if (roll < mythicChance + rareChance) pickedRarity = 'rare';
  else if (roll < mythicChance + rareChance + uncommonChance) pickedRarity = 'uncommon';

  const pool = FISH_CATALOG.filter(f => f.rarity === pickedRarity);
  const fish = pool[Math.floor(rng() * pool.length)] || FISH_CATALOG[0];

  const weightSpan = fish.maxKg - fish.minKg;
  const rawWeight = fish.minKg + Math.pow(rng(), 0.85) * weightSpan;
  const weightKg = Math.round(rawWeight * 100) / 100;

  const weightRatio = weightSpan > 0 ? (weightKg - fish.minKg) / weightSpan : 0.5;
  const coins = Math.max(
    10,
    Math.round(fish.baseCoins * (0.85 + weightRatio * 0.65) * (cast.tier === 'perfect' ? 1.2 : 1)),
  );

  return {
    fish,
    rarity: pickedRarity,
    rarityConfig: RARITY_CONFIG[pickedRarity],
    weightKg,
    coins,
    castTier: cast.tier,
    castLabel: cast.label,
    distancePct: cast.distancePct,
  };
}
