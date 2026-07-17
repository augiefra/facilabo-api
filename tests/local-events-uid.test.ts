import assert from 'node:assert/strict';
import {
  buildFallbackLocalEventId,
  LocalEventItem,
  localEventsToIcs,
  stableLocalEventUid,
} from '../lib/local-events';

function extractUids(ics: string): string[] {
  return [...ics.matchAll(/^UID:(.+)$/gm)].map((match) => match[1].trim());
}

assert.equal(
  stableLocalEventUid('21769447-123456'),
  '21769447-123456@facilabo-local-events',
);

const sharedPrefix = '21769447-metropole-aix-marseille-provence-permanence-adie-aides-et-financement-a-la-creation-d-entreprise-';
const longIdA = `${sharedPrefix}2026-07-20T11:20:00+02:00`;
const longIdB = `${sharedPrefix}2026-07-20T11:40:00+02:00`;
const uidA = stableLocalEventUid(longIdA);
const uidB = stableLocalEventUid(longIdB);
assert.notEqual(uidA, uidB, 'long identifiers that differ after character 120 must not collide');
assert.equal(uidA, stableLocalEventUid(longIdA), 'UID generation must be deterministic');
assert.equal(uidA.split('@')[0].length, 120, 'UID local part must keep the existing 120 character bound');

const fallbackA = buildFallbackLocalEventId({
  targetSlug: 'aix-marseille-provence',
  title: 'Permanence ADIE',
  startDate: '2026-07-20T11:20:00+02:00',
  endDate: '2026-07-20T11:40:00+02:00',
  locationName: 'Agence Marseille Carré Gabriel',
  city: 'Marseille',
});
const fallbackB = buildFallbackLocalEventId({
  targetSlug: 'aix-marseille-provence',
  title: 'Permanence ADIE',
  startDate: '2026-07-20T11:40:00+02:00',
  endDate: '2026-07-20T12:00:00+02:00',
  locationName: 'Agence Marseille Carré Gabriel',
  city: 'Marseille',
});
assert.notEqual(fallbackA, fallbackB, 'fallback identity must include occurrence and location data');

const events: LocalEventItem[] = [
  {
    id: longIdA,
    title: 'Permanence ADIE',
    startDate: '2026-07-20T11:20:00+02:00',
    endDate: '2026-07-20T11:40:00+02:00',
    source: 'openagenda',
  },
  {
    id: longIdB,
    title: 'Permanence ADIE',
    startDate: '2026-07-20T11:40:00+02:00',
    endDate: '2026-07-20T12:00:00+02:00',
    source: 'openagenda',
  },
];
const uids = extractUids(localEventsToIcs('Test', 'Test', events));
assert.equal(uids.length, 2);
assert.equal(new Set(uids).size, 2, 'rendered VEVENTs must have unique UIDs');

console.log('Local events UID contract: OK');
