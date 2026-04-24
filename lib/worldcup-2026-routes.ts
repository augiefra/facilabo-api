export const WORLD_CUP_2026_ALL_SLUG = 'worldcup-2026-all';

const WORLD_CUP_2026_ROUTE_MATCHES: Record<string, number[]> = {
  'worldcup-2026-france': [
    17,
    42,
    61,
  ],
  'worldcup-2026-belgium': [
    16,
    39,
    64,
  ],
  'worldcup-2026-knockout': [
    73,
    74,
    75,
    76,
    77,
    78,
    79,
    80,
    81,
    82,
    83,
    84,
    85,
    86,
    87,
    88,
    89,
    90,
    91,
    92,
    93,
    94,
    95,
    96,
    97,
    98,
    99,
    100,
    101,
    102,
    103,
    104,
  ],
  'worldcup-2026-big-nights': [
    1,
    7,
    16,
    17,
    22,
    36,
    39,
    42,
    61,
    64,
    89,
    90,
    91,
    92,
    93,
    94,
    95,
    96,
    97,
    98,
    99,
    100,
    101,
    102,
    103,
    104,
  ],
};

export function getWorldCup2026MatchNumbers(slug: string): Set<number> | undefined {
  const matchNumbers = WORLD_CUP_2026_ROUTE_MATCHES[slug];
  if (!matchNumbers) {
    return undefined;
  }
  return new Set(matchNumbers);
}

