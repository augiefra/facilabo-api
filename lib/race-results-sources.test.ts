import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJolpicaF1Results, scrapeF1Results } from './f1-scraper';
import {
  parseMotoGPClassification,
  selectLatestMotoGPEvent,
  selectLatestMotoGPRaceSession,
  selectMotoGPCategory,
} from './motogp-scraper';

test('maps a complete Jolpica F1 podium to the stable FacilAbo contract', () => {
  const result = parseJolpicaF1Results({
    MRData: { RaceTable: { Races: [{
      season: '2026', round: '11', raceName: 'Hungarian Grand Prix', date: '2026-07-26',
      Circuit: { circuitName: 'Hungaroring' },
      Results: [
        { position: '2', points: '18', Driver: { driverId: 'verstappen', givenName: 'Max', familyName: 'Verstappen' }, Constructor: { name: 'Red Bull' }, Time: { time: '+15.080' } },
        { position: '1', points: '25', Driver: { driverId: 'norris', givenName: 'Lando', familyName: 'Norris' }, Constructor: { name: 'McLaren' }, Time: { time: '1:39:56.180' } },
        { position: '3', points: '15', Driver: { driverId: 'antonelli', givenName: 'Andrea Kimi', familyName: 'Antonelli' }, Constructor: { name: 'Mercedes' }, Time: { time: '+18.728' } },
      ],
    }] } },
  }, '2026-07-29T09:00:00.000Z');

  assert.equal(result.source, 'api.jolpi.ca');
  assert.deepEqual(result.podium.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(result.podium[0].driver, 'Lando Norris');
  assert.equal(result.podium[0].id, 'f1_2026_11_1_norris');
});

test('rejects incomplete F1 podiums instead of caching an empty fresh result', () => {
  assert.throws(
    () => parseJolpicaF1Results({ MRData: { RaceTable: { Races: [{ season: '2026', round: '1', Results: [] }] } } }),
    /0\/3 podium positions/,
  );
});

test('propagates an F1 upstream error instead of manufacturing a success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  try {
    await assert.rejects(() => scrapeF1Results(), /jolpica-f1 fetch failed: 404/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('selects the latest MotoGP main race and maps its official podium', () => {
  const now = new Date('2026-07-29T09:00:00.000Z');
  const event = selectLatestMotoGPEvent([
    { id: 'test', date_end: '2026-07-20', status: 'FINISHED', test: true },
    { id: 'future', date_end: '2026-08-01', status: 'FINISHED', test: false },
    { id: 'older', date_end: '2026-06-28', status: 'FINISHED', test: false },
    { id: 'germany', name: 'GRAND PRIX OF GERMANY', date_end: '2026-07-12', status: 'FINISHED', test: false, circuit: { name: 'Sachsenring' } },
  ], now);
  assert.equal(event?.id, 'germany');
  assert.equal(selectMotoGPCategory([
    { id: 'moto2', legacy_id: 2, name: 'Moto2™' },
    { id: 'motogp', legacy_id: 3, name: 'MotoGP™' },
  ])?.id, 'motogp');

  const session = selectLatestMotoGPRaceSession([
    { id: 'sprint', type: 'SPR', status: 'FINISHED', date: '2026-07-11T15:00:00Z' },
    { id: 'race', type: 'RAC', status: 'FINISHED', date: '2026-07-12T14:00:00Z', circuit: 'Sachsenring', event: event ?? undefined },
  ], now);
  assert.equal(session?.id, 'race');

  const result = parseMotoGPClassification(session!, { classification: [
    { position: 3, rider: { id: 'raul', full_name: 'Raul Fernandez' }, team: { name: 'Trackhouse MotoGP Team' }, gap: { first: '5.104' }, time: '40:58.252', points: 16 },
    { position: 1, rider: { id: 'marc', full_name: 'Marc Marquez' }, team: { name: 'Ducati Lenovo Team' }, gap: { first: '0.000' }, time: '40:53.148', points: 25 },
    { position: 2, rider: { id: 'ogura', full_name: 'Ai Ogura' }, team: { name: 'Trackhouse MotoGP Team' }, gap: { first: '1.996' }, time: '40:55.144', points: 20 },
  ] }, '2026-07-29T09:00:00.000Z');

  assert.equal(result.source, 'motogp.com');
  assert.deepEqual(result.podium.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(result.podium[1].time, '+1.996s');
  assert.equal(result.podium[0].id, 'motogp_race_1_marc');
});

test('rejects incomplete MotoGP podiums instead of caching an empty fresh result', () => {
  assert.throws(
    () => parseMotoGPClassification({ id: 'race', type: 'RAC', status: 'FINISHED', date: '2026-07-12T14:00:00Z', circuit: 'Sachsenring', event: { name: 'German Grand Prix' } }, { classification: [] }),
    /0\/3 podium positions/,
  );
});
