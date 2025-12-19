/**
 * Lunar Gardening Calendar Data for 2025
 *
 * Based on verified French gardening calendar sources:
 * - Plant types: aujardin.info, gerbeaud.com
 * - Apogee/Perigee: moonhoroscope.com
 * - Lunar nodes: lune-pratique.fr
 * - Ascending/Descending moon: pleine-lune.org
 *
 * Plant type mapping (based on zodiac element):
 * - Racine (Root): Taurus, Virgo, Capricorn (Earth signs)
 * - Feuille (Leaf): Cancer, Scorpio, Pisces (Water signs)
 * - Fleur (Flower): Gemini, Libra, Aquarius (Air signs)
 * - Fruit: Aries, Leo, Sagittarius (Fire signs)
 *
 * NOTE: Uses sidereal zodiac (real constellations) as per French tradition
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
  // December (verified: nouvelle lune is Dec 20 per aujardin.info)
  '2025-12-04': 'pleine_lune',
  '2025-12-11': 'dernier_quartier',
  '2025-12-20': 'nouvelle_lune',
  '2025-12-27': 'premier_quartier',
};

// Moon zodiac data for 2025 - CORRECTED based on French sources (aujardin.info, gerbeaud.com)
// Uses sidereal zodiac positions as per French lunar gardening tradition
// Format: 'YYYY-MM-DD': 'zodiac_sign' (date when moon enters each sign)
export const MOON_ZODIAC_2025: Record<string, string> = {
  // December 2025 (verified against aujardin.info Dec 15-20)
  // Dec 15=Racine, Dec 17=Fleur+Apogée, Dec 18=Feuille, Dec 20=Fruit+Nouvelle Lune
  '2025-12-01': 'cancer',      // Feuille
  '2025-12-03': 'leo',         // Fruit
  '2025-12-05': 'virgo',       // Racine
  '2025-12-07': 'libra',       // Fleur
  '2025-12-09': 'scorpio',     // Feuille
  '2025-12-11': 'sagittarius', // Fruit
  '2025-12-13': 'capricorn',   // Racine (extends to Dec 16)
  '2025-12-17': 'aquarius',    // Fleur (Apogee)
  '2025-12-18': 'pisces',      // Feuille
  '2025-12-20': 'aries',       // Fruit (Nouvelle lune)
  '2025-12-22': 'taurus',      // Racine
  '2025-12-24': 'gemini',      // Fleur
  '2025-12-26': 'cancer',      // Feuille
  '2025-12-28': 'leo',         // Fruit
  '2025-12-31': 'virgo',       // Racine

  // November 2025
  '2025-11-01': 'taurus',
  '2025-11-03': 'gemini',
  '2025-11-05': 'cancer',      // Perigee
  '2025-11-07': 'leo',
  '2025-11-09': 'virgo',
  '2025-11-11': 'libra',
  '2025-11-13': 'scorpio',
  '2025-11-15': 'sagittarius',
  '2025-11-17': 'capricorn',
  '2025-11-19': 'aquarius',
  '2025-11-21': 'pisces',
  '2025-11-23': 'aries',
  '2025-11-25': 'taurus',
  '2025-11-27': 'gemini',
  '2025-11-29': 'cancer',

  // October 2025
  '2025-10-01': 'pisces',
  '2025-10-03': 'aries',
  '2025-10-05': 'taurus',
  '2025-10-07': 'gemini',
  '2025-10-09': 'cancer',
  '2025-10-11': 'leo',
  '2025-10-13': 'virgo',
  '2025-10-15': 'libra',
  '2025-10-17': 'scorpio',
  '2025-10-19': 'sagittarius',
  '2025-10-21': 'capricorn',
  '2025-10-23': 'aquarius',
  '2025-10-25': 'pisces',
  '2025-10-28': 'aries',
  '2025-10-30': 'taurus',

  // September 2025
  '2025-09-01': 'capricorn',
  '2025-09-03': 'aquarius',
  '2025-09-05': 'pisces',
  '2025-09-07': 'aries',
  '2025-09-09': 'taurus',
  '2025-09-11': 'gemini',
  '2025-09-13': 'cancer',
  '2025-09-15': 'leo',
  '2025-09-17': 'virgo',
  '2025-09-19': 'libra',
  '2025-09-21': 'scorpio',
  '2025-09-23': 'sagittarius',
  '2025-09-25': 'capricorn',
  '2025-09-27': 'aquarius',
  '2025-09-29': 'pisces',

  // August 2025
  '2025-08-01': 'scorpio',
  '2025-08-03': 'sagittarius',
  '2025-08-05': 'capricorn',
  '2025-08-07': 'aquarius',
  '2025-08-09': 'pisces',
  '2025-08-11': 'aries',
  '2025-08-13': 'taurus',
  '2025-08-15': 'gemini',
  '2025-08-17': 'cancer',
  '2025-08-19': 'leo',
  '2025-08-21': 'virgo',
  '2025-08-23': 'libra',
  '2025-08-25': 'scorpio',
  '2025-08-27': 'sagittarius',
  '2025-08-29': 'capricorn',
  '2025-08-31': 'aquarius',

  // July 2025
  '2025-07-01': 'virgo',
  '2025-07-03': 'libra',
  '2025-07-05': 'scorpio',
  '2025-07-07': 'sagittarius',
  '2025-07-09': 'capricorn',
  '2025-07-11': 'aquarius',
  '2025-07-13': 'pisces',
  '2025-07-15': 'aries',
  '2025-07-17': 'taurus',
  '2025-07-19': 'gemini',
  '2025-07-21': 'cancer',
  '2025-07-23': 'leo',
  '2025-07-25': 'virgo',
  '2025-07-27': 'libra',
  '2025-07-29': 'scorpio',
  '2025-07-31': 'sagittarius',

  // June 2025
  '2025-06-01': 'cancer',
  '2025-06-03': 'leo',
  '2025-06-05': 'virgo',
  '2025-06-07': 'libra',
  '2025-06-09': 'scorpio',
  '2025-06-11': 'sagittarius',
  '2025-06-13': 'capricorn',
  '2025-06-15': 'aquarius',
  '2025-06-17': 'pisces',
  '2025-06-19': 'aries',
  '2025-06-21': 'taurus',
  '2025-06-23': 'gemini',
  '2025-06-25': 'cancer',
  '2025-06-27': 'leo',
  '2025-06-29': 'virgo',

  // May 2025
  '2025-05-01': 'taurus',
  '2025-05-03': 'gemini',
  '2025-05-05': 'cancer',
  '2025-05-07': 'leo',
  '2025-05-09': 'virgo',
  '2025-05-11': 'libra',
  '2025-05-13': 'scorpio',
  '2025-05-15': 'sagittarius',
  '2025-05-17': 'capricorn',
  '2025-05-19': 'aquarius',
  '2025-05-21': 'pisces',
  '2025-05-23': 'aries',
  '2025-05-25': 'taurus',
  '2025-05-27': 'gemini',
  '2025-05-29': 'cancer',
  '2025-05-31': 'leo',

  // April 2025
  '2025-04-01': 'capricorn',
  '2025-04-03': 'aquarius',
  '2025-04-05': 'pisces',
  '2025-04-07': 'aries',
  '2025-04-09': 'taurus',
  '2025-04-11': 'gemini',
  '2025-04-13': 'cancer',
  '2025-04-15': 'leo',
  '2025-04-17': 'virgo',
  '2025-04-19': 'libra',
  '2025-04-21': 'scorpio',
  '2025-04-23': 'sagittarius',
  '2025-04-25': 'capricorn',
  '2025-04-27': 'aquarius',
  '2025-04-29': 'pisces',

  // March 2025
  '2025-03-01': 'scorpio',
  '2025-03-03': 'sagittarius',
  '2025-03-05': 'capricorn',
  '2025-03-07': 'aquarius',
  '2025-03-09': 'pisces',
  '2025-03-11': 'aries',
  '2025-03-13': 'taurus',
  '2025-03-15': 'gemini',
  '2025-03-17': 'cancer',
  '2025-03-19': 'leo',
  '2025-03-21': 'virgo',
  '2025-03-23': 'libra',
  '2025-03-25': 'scorpio',
  '2025-03-27': 'sagittarius',
  '2025-03-29': 'capricorn',
  '2025-03-31': 'aquarius',

  // February 2025
  '2025-02-01': 'virgo',
  '2025-02-03': 'libra',
  '2025-02-05': 'scorpio',
  '2025-02-07': 'sagittarius',
  '2025-02-09': 'capricorn',
  '2025-02-11': 'aquarius',
  '2025-02-13': 'pisces',
  '2025-02-15': 'aries',
  '2025-02-17': 'taurus',
  '2025-02-19': 'gemini',
  '2025-02-21': 'cancer',
  '2025-02-23': 'leo',
  '2025-02-25': 'virgo',
  '2025-02-27': 'libra',

  // January 2025
  '2025-01-01': 'gemini',
  '2025-01-03': 'cancer',
  '2025-01-05': 'leo',
  '2025-01-07': 'virgo',
  '2025-01-09': 'libra',
  '2025-01-11': 'scorpio',
  '2025-01-13': 'sagittarius',
  '2025-01-15': 'capricorn',
  '2025-01-17': 'aquarius',
  '2025-01-19': 'pisces',
  '2025-01-21': 'aries',
  '2025-01-23': 'taurus',
  '2025-01-25': 'gemini',
  '2025-01-27': 'cancer',
  '2025-01-29': 'leo',
  '2025-01-31': 'virgo',
};

// Ascending/Descending moon periods for 2025
// Based on pleine-lune.org data
export const MOON_DIRECTION_CHANGES_2025: Array<{ date: string; direction: MoonDirection }> = [
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
  { date: '2025-12-21', direction: 'montante' },  // Changed from Dec 19 per aujardin.info
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
