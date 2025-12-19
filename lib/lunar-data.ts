/**
 * Lunar Gardening Calendar Data for 2025-2026
 *
 * Based on astronomical data from:
 * - Moon phases and zodiac positions: astro-seek.com
 * - Apogee/Perigee: moonhoroscope.com
 * - Lunar nodes: lune-pratique.fr
 * - Ascending/Descending moon: pleine-lune.org
 *
 * Plant type mapping (based on zodiac element):
 * - Racine (Root): Taurus, Virgo, Capricorn (Earth signs)
 * - Feuille (Leaf): Cancer, Scorpio, Pisces (Water signs)
 * - Fleur (Flower): Gemini, Libra, Aquarius (Air signs)
 * - Fruit: Aries, Leo, Sagittarius (Fire signs)
 */

export type PlantType = 'racine' | 'feuille' | 'fleur' | 'fruit';
export type MoonDirection = 'montante' | 'descendante';
export type SpecialDay = 'apogee' | 'perigee' | 'noeud_ascendant' | 'noeud_descendant' | null;

export interface LunarDay {
  date: string; // YYYY-MM-DD
  plantType: PlantType;
  moonDirection: MoonDirection;
  zodiacSign: string;
  specialDay: SpecialDay;
  moonPhase?: 'nouvelle_lune' | 'premier_quartier' | 'pleine_lune' | 'dernier_quartier';
}

// Zodiac sign to plant type mapping
export const ZODIAC_TO_PLANT_TYPE: Record<string, PlantType> = {
  // Earth signs = Root days
  'taurus': 'racine',
  'virgo': 'racine',
  'capricorn': 'racine',
  // Water signs = Leaf days
  'cancer': 'feuille',
  'scorpio': 'feuille',
  'pisces': 'feuille',
  // Air signs = Flower days
  'gemini': 'fleur',
  'libra': 'fleur',
  'aquarius': 'fleur',
  // Fire signs = Fruit days
  'aries': 'fruit',
  'leo': 'fruit',
  'sagittarius': 'fruit',
};

export const ZODIAC_FRENCH: Record<string, string> = {
  'aries': 'Bélier',
  'taurus': 'Taureau',
  'gemini': 'Gémeaux',
  'cancer': 'Cancer',
  'leo': 'Lion',
  'virgo': 'Vierge',
  'libra': 'Balance',
  'scorpio': 'Scorpion',
  'sagittarius': 'Sagittaire',
  'capricorn': 'Capricorne',
  'aquarius': 'Verseau',
  'pisces': 'Poissons',
};

export const PLANT_TYPE_INFO: Record<PlantType, { emoji: string; name: string; description: string }> = {
  'racine': {
    emoji: '🥕',
    name: 'Jour Racines',
    description: 'Favorable aux légumes-racines : carottes, radis, betteraves, pommes de terre, navets, ail, oignons'
  },
  'feuille': {
    emoji: '🥬',
    name: 'Jour Feuilles',
    description: 'Favorable aux légumes-feuilles : salades, épinards, choux, poireaux, persil, basilic'
  },
  'fleur': {
    emoji: '🌸',
    name: 'Jour Fleurs',
    description: 'Favorable aux fleurs et légumes-fleurs : artichauts, brocolis, choux-fleurs, roses, lavande'
  },
  'fruit': {
    emoji: '🍅',
    name: 'Jour Fruits',
    description: 'Favorable aux fruits et légumes-fruits : tomates, courgettes, aubergines, poivrons, fraises, arbres fruitiers'
  }
};

// Apogee dates 2025 (Moon farthest from Earth - avoid gardening)
export const APOGEE_2025: string[] = [
  '2025-01-21',
  '2025-02-18',
  '2025-03-17',
  '2025-04-14',
  '2025-05-11',
  '2025-06-07',
  '2025-07-05',
  '2025-08-01',
  '2025-08-29',
  '2025-09-26',
  '2025-10-24',
  '2025-11-20',
  '2025-12-17',
];

// Perigee dates 2025 (Moon closest to Earth - avoid gardening)
export const PERIGEE_2025: string[] = [
  '2025-01-08',
  '2025-02-02',
  '2025-03-01',
  '2025-03-30',
  '2025-04-27',
  '2025-05-26',
  '2025-06-23',
  '2025-07-20',
  '2025-08-14',
  '2025-09-10',
  '2025-10-08',
  '2025-11-05',
  '2025-12-04',
];

// Ascending lunar nodes 2025 (avoid gardening)
export const ASCENDING_NODES_2025: string[] = [
  '2025-01-05',
  '2025-02-01',
  '2025-03-01',
  '2025-03-28',
  '2025-04-25',
  '2025-05-22',
  '2025-06-18',
  '2025-07-15',
  '2025-08-11',
  '2025-09-08',
  '2025-10-05',
  '2025-11-01',
  '2025-11-28',
  '2025-12-25',
];

// Descending lunar nodes 2025 (avoid gardening)
export const DESCENDING_NODES_2025: string[] = [
  '2025-01-19',
  '2025-02-15',
  '2025-03-14',
  '2025-04-10',
  '2025-05-08',
  '2025-06-04',
  '2025-07-01',
  '2025-07-28',
  '2025-08-24',
  '2025-09-21',
  '2025-10-18',
  '2025-11-14',
  '2025-12-11',
];

// Moon phases 2025 (major phases only)
export const MOON_PHASES_2025: Record<string, 'nouvelle_lune' | 'premier_quartier' | 'pleine_lune' | 'dernier_quartier'> = {
  // January
  '2025-01-06': 'premier_quartier',
  '2025-01-13': 'pleine_lune',
  '2025-01-21': 'dernier_quartier',
  '2025-01-29': 'nouvelle_lune',
  // February
  '2025-02-05': 'premier_quartier',
  '2025-02-12': 'pleine_lune',
  '2025-02-20': 'dernier_quartier',
  '2025-02-28': 'nouvelle_lune',
  // March
  '2025-03-06': 'premier_quartier',
  '2025-03-14': 'pleine_lune',
  '2025-03-22': 'dernier_quartier',
  '2025-03-29': 'nouvelle_lune',
  // April
  '2025-04-05': 'premier_quartier',
  '2025-04-13': 'pleine_lune',
  '2025-04-21': 'dernier_quartier',
  '2025-04-27': 'nouvelle_lune',
  // May
  '2025-05-04': 'premier_quartier',
  '2025-05-12': 'pleine_lune',
  '2025-05-20': 'dernier_quartier',
  '2025-05-27': 'nouvelle_lune',
  // June
  '2025-06-03': 'premier_quartier',
  '2025-06-11': 'pleine_lune',
  '2025-06-18': 'dernier_quartier',
  '2025-06-25': 'nouvelle_lune',
  // July
  '2025-07-02': 'premier_quartier',
  '2025-07-10': 'pleine_lune',
  '2025-07-18': 'dernier_quartier',
  '2025-07-24': 'nouvelle_lune',
  // August
  '2025-08-01': 'premier_quartier',
  '2025-08-09': 'pleine_lune',
  '2025-08-16': 'dernier_quartier',
  '2025-08-23': 'nouvelle_lune',
  '2025-08-31': 'premier_quartier',
  // September
  '2025-09-07': 'pleine_lune',
  '2025-09-14': 'dernier_quartier',
  '2025-09-21': 'nouvelle_lune',
  '2025-09-29': 'premier_quartier',
  // October
  '2025-10-07': 'pleine_lune',
  '2025-10-13': 'dernier_quartier',
  '2025-10-21': 'nouvelle_lune',
  '2025-10-29': 'premier_quartier',
  // November
  '2025-11-05': 'pleine_lune',
  '2025-11-12': 'dernier_quartier',
  '2025-11-20': 'nouvelle_lune',
  '2025-11-28': 'premier_quartier',
  // December
  '2025-12-04': 'pleine_lune',
  '2025-12-11': 'dernier_quartier',
  '2025-12-19': 'nouvelle_lune',
  '2025-12-27': 'premier_quartier',
};

// Moon zodiac ingress data for 2025 (date when moon enters each sign)
// Format: 'YYYY-MM-DD': 'zodiac_sign'
// The moon stays in each sign for about 2.5 days
export const MOON_ZODIAC_2025: Record<string, string> = {
  // December 2025
  '2025-12-01': 'aries',
  '2025-12-02': 'taurus',
  '2025-12-04': 'gemini',
  '2025-12-06': 'cancer',
  '2025-12-08': 'leo',
  '2025-12-10': 'virgo',
  '2025-12-12': 'libra',
  '2025-12-15': 'scorpio',
  '2025-12-17': 'sagittarius',
  '2025-12-20': 'capricorn',
  '2025-12-22': 'aquarius',
  '2025-12-25': 'pisces',
  '2025-12-27': 'aries',
  '2025-12-29': 'taurus',
  '2025-12-31': 'gemini',
  // January 2025
  '2025-01-01': 'cancer',
  '2025-01-03': 'leo',
  '2025-01-05': 'virgo',
  '2025-01-08': 'libra',
  '2025-01-10': 'scorpio',
  '2025-01-12': 'sagittarius',
  '2025-01-15': 'capricorn',
  '2025-01-17': 'aquarius',
  '2025-01-19': 'pisces',
  '2025-01-22': 'aries',
  '2025-01-24': 'taurus',
  '2025-01-26': 'gemini',
  '2025-01-28': 'cancer',
  '2025-01-31': 'leo',
  // February 2025
  '2025-02-02': 'virgo',
  '2025-02-04': 'libra',
  '2025-02-06': 'scorpio',
  '2025-02-09': 'sagittarius',
  '2025-02-11': 'capricorn',
  '2025-02-13': 'aquarius',
  '2025-02-16': 'pisces',
  '2025-02-18': 'aries',
  '2025-02-20': 'taurus',
  '2025-02-23': 'gemini',
  '2025-02-25': 'cancer',
  '2025-02-27': 'leo',
  // March 2025
  '2025-03-01': 'virgo',
  '2025-03-04': 'libra',
  '2025-03-06': 'scorpio',
  '2025-03-08': 'sagittarius',
  '2025-03-11': 'capricorn',
  '2025-03-13': 'aquarius',
  '2025-03-15': 'pisces',
  '2025-03-17': 'aries',
  '2025-03-20': 'taurus',
  '2025-03-22': 'gemini',
  '2025-03-24': 'cancer',
  '2025-03-27': 'leo',
  '2025-03-29': 'virgo',
  '2025-03-31': 'libra',
  // April 2025
  '2025-04-02': 'scorpio',
  '2025-04-05': 'sagittarius',
  '2025-04-07': 'capricorn',
  '2025-04-09': 'aquarius',
  '2025-04-11': 'pisces',
  '2025-04-14': 'aries',
  '2025-04-16': 'taurus',
  '2025-04-18': 'gemini',
  '2025-04-21': 'cancer',
  '2025-04-23': 'leo',
  '2025-04-25': 'virgo',
  '2025-04-28': 'libra',
  '2025-04-30': 'scorpio',
  // May 2025
  '2025-05-02': 'sagittarius',
  '2025-05-04': 'capricorn',
  '2025-05-07': 'aquarius',
  '2025-05-09': 'pisces',
  '2025-05-11': 'aries',
  '2025-05-13': 'taurus',
  '2025-05-16': 'gemini',
  '2025-05-18': 'cancer',
  '2025-05-20': 'leo',
  '2025-05-23': 'virgo',
  '2025-05-25': 'libra',
  '2025-05-27': 'scorpio',
  '2025-05-30': 'sagittarius',
  // June 2025
  '2025-06-01': 'capricorn',
  '2025-06-03': 'aquarius',
  '2025-06-05': 'pisces',
  '2025-06-07': 'aries',
  '2025-06-10': 'taurus',
  '2025-06-12': 'gemini',
  '2025-06-14': 'cancer',
  '2025-06-17': 'leo',
  '2025-06-19': 'virgo',
  '2025-06-21': 'libra',
  '2025-06-24': 'scorpio',
  '2025-06-26': 'sagittarius',
  '2025-06-28': 'capricorn',
  // July 2025
  '2025-07-01': 'aquarius',
  '2025-07-03': 'pisces',
  '2025-07-05': 'aries',
  '2025-07-07': 'taurus',
  '2025-07-09': 'gemini',
  '2025-07-12': 'cancer',
  '2025-07-14': 'leo',
  '2025-07-16': 'virgo',
  '2025-07-19': 'libra',
  '2025-07-21': 'scorpio',
  '2025-07-23': 'sagittarius',
  '2025-07-26': 'capricorn',
  '2025-07-28': 'aquarius',
  '2025-07-30': 'pisces',
  // August 2025
  '2025-08-01': 'aries',
  '2025-08-04': 'taurus',
  '2025-08-06': 'gemini',
  '2025-08-08': 'cancer',
  '2025-08-10': 'leo',
  '2025-08-13': 'virgo',
  '2025-08-15': 'libra',
  '2025-08-17': 'scorpio',
  '2025-08-20': 'sagittarius',
  '2025-08-22': 'capricorn',
  '2025-08-24': 'aquarius',
  '2025-08-27': 'pisces',
  '2025-08-29': 'aries',
  '2025-08-31': 'taurus',
  // September 2025
  '2025-09-02': 'gemini',
  '2025-09-05': 'cancer',
  '2025-09-07': 'leo',
  '2025-09-09': 'virgo',
  '2025-09-11': 'libra',
  '2025-09-14': 'scorpio',
  '2025-09-16': 'sagittarius',
  '2025-09-18': 'capricorn',
  '2025-09-21': 'aquarius',
  '2025-09-23': 'pisces',
  '2025-09-25': 'aries',
  '2025-09-28': 'taurus',
  '2025-09-30': 'gemini',
  // October 2025
  '2025-10-02': 'cancer',
  '2025-10-04': 'leo',
  '2025-10-07': 'virgo',
  '2025-10-09': 'libra',
  '2025-10-11': 'scorpio',
  '2025-10-13': 'sagittarius',
  '2025-10-16': 'capricorn',
  '2025-10-18': 'aquarius',
  '2025-10-20': 'pisces',
  '2025-10-23': 'aries',
  '2025-10-25': 'taurus',
  '2025-10-27': 'gemini',
  '2025-10-30': 'cancer',
  // November 2025
  '2025-11-01': 'leo',
  '2025-11-03': 'virgo',
  '2025-11-05': 'libra',
  '2025-11-08': 'scorpio',
  '2025-11-10': 'sagittarius',
  '2025-11-12': 'capricorn',
  '2025-11-14': 'aquarius',
  '2025-11-17': 'pisces',
  '2025-11-19': 'aries',
  '2025-11-21': 'taurus',
  '2025-11-24': 'gemini',
  '2025-11-26': 'cancer',
  '2025-11-28': 'leo',
  '2025-11-30': 'virgo',
};

// Ascending/Descending moon periods for 2025
// The moon is ascending for ~13.5 days, then descending for ~13.5 days
export const MOON_DIRECTION_CHANGES_2025: Array<{ date: string; direction: MoonDirection }> = [
  // Based on data from pleine-lune.org
  { date: '2025-01-01', direction: 'montante' },
  { date: '2025-01-09', direction: 'descendante' },
  { date: '2025-01-23', direction: 'montante' },
  { date: '2025-02-06', direction: 'descendante' },
  { date: '2025-02-19', direction: 'montante' },
  { date: '2025-03-05', direction: 'descendante' },
  { date: '2025-03-19', direction: 'montante' },
  { date: '2025-04-01', direction: 'descendante' },
  { date: '2025-04-15', direction: 'montante' },
  { date: '2025-04-29', direction: 'descendante' },
  { date: '2025-05-13', direction: 'montante' },
  { date: '2025-05-26', direction: 'descendante' },
  { date: '2025-06-09', direction: 'montante' },
  { date: '2025-06-23', direction: 'descendante' },
  { date: '2025-07-06', direction: 'montante' },
  { date: '2025-07-20', direction: 'descendante' },
  { date: '2025-08-03', direction: 'montante' },
  { date: '2025-08-17', direction: 'descendante' },
  { date: '2025-08-30', direction: 'montante' },
  { date: '2025-09-13', direction: 'descendante' },
  { date: '2025-09-27', direction: 'montante' },
  { date: '2025-10-11', direction: 'descendante' },
  { date: '2025-10-24', direction: 'montante' },
  { date: '2025-11-08', direction: 'descendante' },
  { date: '2025-11-21', direction: 'montante' },
  { date: '2025-12-05', direction: 'descendante' },
  { date: '2025-12-19', direction: 'montante' },
];

/**
 * Get the moon direction for a given date
 */
export function getMoonDirection(dateStr: string): MoonDirection {
  const date = new Date(dateStr);
  let direction: MoonDirection = 'montante';

  for (const change of MOON_DIRECTION_CHANGES_2025) {
    const changeDate = new Date(change.date);
    if (date >= changeDate) {
      direction = change.direction;
    } else {
      break;
    }
  }

  return direction;
}

/**
 * Get the zodiac sign for a given date
 */
export function getZodiacSign(dateStr: string): string {
  const date = new Date(dateStr);
  let sign = 'aries';

  // Find the most recent zodiac change before or on this date
  const sortedDates = Object.keys(MOON_ZODIAC_2025).sort();
  for (const d of sortedDates) {
    if (new Date(d) <= date) {
      sign = MOON_ZODIAC_2025[d];
    } else {
      break;
    }
  }

  return sign;
}

/**
 * Get special day status (apogee, perigee, or node)
 */
export function getSpecialDay(dateStr: string): SpecialDay {
  if (APOGEE_2025.includes(dateStr)) return 'apogee';
  if (PERIGEE_2025.includes(dateStr)) return 'perigee';
  if (ASCENDING_NODES_2025.includes(dateStr)) return 'noeud_ascendant';
  if (DESCENDING_NODES_2025.includes(dateStr)) return 'noeud_descendant';
  return null;
}

/**
 * Get all lunar data for a specific date
 */
export function getLunarDay(dateStr: string): LunarDay {
  const zodiacSign = getZodiacSign(dateStr);
  const plantType = ZODIAC_TO_PLANT_TYPE[zodiacSign] || 'racine';
  const moonDirection = getMoonDirection(dateStr);
  const specialDay = getSpecialDay(dateStr);
  const moonPhase = MOON_PHASES_2025[dateStr];

  return {
    date: dateStr,
    plantType,
    moonDirection,
    zodiacSign,
    specialDay,
    moonPhase,
  };
}

/**
 * Generate lunar data for a date range
 */
export function generateLunarCalendar(startDate: string, endDate: string): LunarDay[] {
  const days: LunarDay[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    days.push(getLunarDay(dateStr));
  }

  return days;
}
