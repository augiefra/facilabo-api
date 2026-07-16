import calendarCatalogData from '../data/calendar-catalog.json';
import type { CalendarMapping } from './calendar-mappings';

export const CATALOG_SCHEMA_VERSION = 2 as const;

export const CATALOG_FAMILIES = [
  'sports',
  'administratif',
  'conges',
  'pays',
  'religion',
  'shopping',
  'sorties',
  'reperes',
  'nature',
  'sciences',
] as const;

export type CalendarCatalogFamily = (typeof CATALOG_FAMILIES)[number];

// Mirrors the raw values of CategoryType in the iOS catalog.
export const CATALOG_CATEGORIES = [
  'education',
  'civil',
  'belgique',
  'luxembourg',
  'suisse',
  'canada',
  'ponts',
  'soldes',
  'football',
  'worldCup2026',
  'rugby',
  'f1',
  'wec',
  'motogp',
  'nascar',
  'basketball',
  'tennis',
  'cycling',
  'astronomy',
  'jardin',
  'nature',
  'localEvents',
  'culture',
  'salonsFoires',
  'societe',
  'religion',
  'fiscal',
  'timeChange',
  'ecommerce',
] as const;

export type CalendarCatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export interface CalendarCatalogProjection {
  discoverable: boolean;
  family: CalendarCatalogFamily;
  category?: CalendarCatalogCategory;
}

export interface CalendarListItem {
  slug: string;
  name: string;
  description?: string;
  catalog: CalendarCatalogProjection;
}

export interface CalendarListResponse {
  calendars: CalendarListItem[];
  meta: {
    catalogSchemaVersion: typeof CATALOG_SCHEMA_VERSION;
  };
}

interface RawCatalogEntry {
  discoverable: unknown;
  family: unknown;
  category?: unknown;
}

interface RawCalendarCatalog {
  catalogSchemaVersion: unknown;
  entries: Record<string, RawCatalogEntry>;
}

const rawCatalog = calendarCatalogData as unknown as RawCalendarCatalog;
const knownFamilies = new Set<string>(CATALOG_FAMILIES);
const knownCategories = new Set<string>(CATALOG_CATEGORIES);

const expectedFamilyByCategory: Record<CalendarCatalogCategory, CalendarCatalogFamily> = {
  education: 'conges',
  civil: 'conges',
  belgique: 'pays',
  luxembourg: 'pays',
  suisse: 'pays',
  canada: 'pays',
  ponts: 'conges',
  soldes: 'shopping',
  football: 'sports',
  worldCup2026: 'sports',
  rugby: 'sports',
  f1: 'sports',
  wec: 'sports',
  motogp: 'sports',
  nascar: 'sports',
  basketball: 'sports',
  tennis: 'sports',
  cycling: 'sports',
  astronomy: 'sciences',
  jardin: 'nature',
  nature: 'nature',
  localEvents: 'sorties',
  culture: 'sorties',
  salonsFoires: 'sorties',
  societe: 'reperes',
  religion: 'religion',
  fiscal: 'administratif',
  timeChange: 'conges',
  ecommerce: 'shopping',
};

export function validateCalendarCatalog(
  mappings: Record<string, CalendarMapping>
): string[] {
  const errors: string[] = [];
  const mappingSlugs = Object.keys(mappings);
  const mappingSlugSet = new Set(mappingSlugs);
  const catalogSlugs = Object.keys(rawCatalog.entries);

  if (rawCatalog.catalogSchemaVersion !== CATALOG_SCHEMA_VERSION) {
    errors.push(
      `catalogSchemaVersion must be ${CATALOG_SCHEMA_VERSION}, got ${String(rawCatalog.catalogSchemaVersion)}`
    );
  }

  if (mappingSlugSet.size !== mappingSlugs.length) {
    errors.push('Calendar mappings contain duplicate slugs.');
  }

  for (const slug of mappingSlugs) {
    if (!rawCatalog.entries[slug]) {
      errors.push(`Missing catalog projection for mapping slug: ${slug}`);
    }
  }

  for (const slug of catalogSlugs) {
    const entry = rawCatalog.entries[slug];

    if (!mappingSlugSet.has(slug)) {
      const qualifier = entry.discoverable === true ? 'discoverable ' : '';
      errors.push(`Unknown ${qualifier}catalog slug: ${slug}`);
    }

    if (typeof entry.discoverable !== 'boolean') {
      errors.push(`catalog.${slug}.discoverable must be a boolean.`);
    }

    if (typeof entry.family !== 'string' || !knownFamilies.has(entry.family)) {
      errors.push(`catalog.${slug}.family is not part of the supported taxonomy.`);
    }

    if (
      entry.category !== undefined &&
      (typeof entry.category !== 'string' || !knownCategories.has(entry.category))
    ) {
      errors.push(`catalog.${slug}.category is not a known iOS CategoryType.`);
    }

    if (
      typeof entry.category === 'string' &&
      knownCategories.has(entry.category) &&
      typeof entry.family === 'string' &&
      knownFamilies.has(entry.family)
    ) {
      const expectedFamily = expectedFamilyByCategory[entry.category as CalendarCatalogCategory];
      if (entry.family !== expectedFamily) {
        errors.push(
          `catalog.${slug} maps category ${entry.category} to ${entry.family}; expected ${expectedFamily}.`
        );
      }
    }
  }

  return errors;
}

export function buildCalendarListResponse(
  mappings: Record<string, CalendarMapping>
): CalendarListResponse {
  const errors = validateCalendarCatalog(mappings);
  if (errors.length > 0) {
    throw new Error(`Invalid calendar catalog projection:\n- ${errors.join('\n- ')}`);
  }

  return {
    calendars: Object.entries(mappings).map(([slug, mapping]) => {
      const catalog = rawCatalog.entries[slug] as CalendarCatalogProjection;
      return {
        slug,
        name: mapping.frenchName,
        description: mapping.description,
        catalog: { ...catalog },
      };
    }),
    meta: {
      catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    },
  };
}
