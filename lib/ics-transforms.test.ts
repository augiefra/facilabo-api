import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCalendarTransform } from './ics-transforms.ts';

function calendar(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

function event(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

function eventBlocks(ics: string): string[] {
  return ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
}

test('corrects the two malformed Christmas intervals across regenerated upstream UIDs and is idempotent', () => {
  const guadeloupe = calendar(event([
    'UID:20260831T093815Z-Guadeloupe@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261219',
    'DTEND;VALUE=DATE:20260104',
    'SUMMARY:Vacances de Noël',
  ]));
  const corrected = applyCalendarTransform('vacances-guadeloupe', guadeloupe);

  assert.match(corrected, /DTEND;VALUE=DATE:20270104/);
  assert.match(corrected, /UID:20260831T093815Z-Guadeloupe@data\.education\.gouv\.fr/);
  assert.equal(applyCalendarTransform('vacances-guadeloupe', corrected), corrected);
  assert.equal(applyCalendarTransform('vacances-martinique', guadeloupe), guadeloupe);

  const saintPierre = calendar(event([
    'UID:20260831T094353Z-SaintPierreEtMiquelon@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261218',
    'DTEND;VALUE=DATE:20260104',
    'SUMMARY:Vacances de Noël',
  ]));
  assert.match(
    applyCalendarTransform('vacances-saint-pierre-et-miquelon', saintPierre),
    /DTEND;VALUE=DATE:20270104/
  );
});

test('does not rewrite a school event when the UID or summary does not match', () => {
  const nearMatch = calendar(event([
    'UID:other@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261219',
    'DTEND;VALUE=DATE:20260104',
    'SUMMARY:Vacances de Noël',
  ]));
  assert.equal(applyCalendarTransform('vacances-guadeloupe', nearMatch), nearMatch);
});

test('converts official Mayotte dates to exclusive DTEND and leaves summer open-ended', () => {
  const source = calendar(event([
    'UID:upstream-prerentree@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20260821',
    'DTEND;VALUE=DATE:20260824',
    "SUMMARY:Vacances d'Été(prérentrée Enseignants)",
  ]));
  const transformed = applyCalendarTransform('vacances-mayotte', source);
  const blocks = eventBlocks(transformed);

  assert.equal(blocks.length, 6);
  assert.match(transformed, /UID:vacances-mayotte-2026-2027-toussaint@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20261010[\s\S]*DTEND;VALUE=DATE:20261026/);
  assert.match(transformed, /UID:vacances-mayotte-2026-2027-noel@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20261212[\s\S]*DTEND;VALUE=DATE:20270111/);
  assert.match(transformed, /UID:vacances-mayotte-2026-2027-carnaval@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20270220[\s\S]*DTEND;VALUE=DATE:20270308/);
  assert.match(transformed, /UID:vacances-mayotte-2026-2027-paques@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20270501[\s\S]*DTEND;VALUE=DATE:20270517/);

  const summer = blocks.find((block) => block.includes('vacances-mayotte-2026-2027-ete@facilabo.app'));
  assert.ok(summer);
  assert.match(summer, /DTSTART;VALUE=DATE:20270710/);
  assert.doesNotMatch(summer, /DTEND/);
  assert.equal(applyCalendarTransform('vacances-mayotte', transformed), transformed);
});

test('adds the official 2027 and 2028 New Caledonia periods with stable unique UIDs', () => {
  const transformed = applyCalendarTransform('vacances-nouvelle-caledonie', calendar());
  const blocks = eventBlocks(transformed);
  const uids = blocks.map((block) => block.match(/UID:(.+)/)?.[1].trim());

  assert.equal(blocks.length, 12);
  assert.equal(new Set(uids).size, 12);
  assert.match(transformed, /UID:vacances-nouvelle-caledonie-2027-prerentree@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20270212[\s\S]*DTEND;VALUE=DATE:20270215/);
  assert.match(transformed, /UID:vacances-nouvelle-caledonie-2028-prerentree@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20280211[\s\S]*DTEND;VALUE=DATE:20280214/);
  assert.match(transformed, /UID:vacances-nouvelle-caledonie-2027-periode-1@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20270403[\s\S]*DTEND;VALUE=DATE:20270419/);
  assert.match(transformed, /UID:vacances-nouvelle-caledonie-2028-periode-4@facilabo\.app[\s\S]*DTSTART;VALUE=DATE:20281014[\s\S]*DTEND;VALUE=DATE:20281030/);

  for (const uid of [
    'vacances-nouvelle-caledonie-2027-ete@facilabo.app',
    'vacances-nouvelle-caledonie-2028-ete@facilabo.app',
  ]) {
    const summer = blocks.find((block) => block.includes(uid));
    assert.ok(summer);
    assert.doesNotMatch(summer, /DTEND/);
  }
  assert.equal(applyCalendarTransform('vacances-nouvelle-caledonie', transformed), transformed);
});

test('keeps the relocated Bahrain weekend at Sepang in both F1 feeds', () => {
  const sessions = [
    ['practice-1', '20261002T043000Z', 'F1 Bahrain GP - Practice 1'],
    ['practice-2', '20261002T080000Z', 'F1 Bahrain GP - Practice 2'],
    ['practice-3', '20261003T043000Z', 'F1 Bahrain GP - Practice 3'],
    ['qualifying', '20261003T080000Z', 'F1 Bahrain GP - Qualifying'],
    ['race', '20261004T070000Z', 'F1 Bahrain GP - Race'],
  ].map(([uid, dtstart, summary]) => event([
    `UID:${uid}`,
    `DTSTART:${dtstart}`,
    `SUMMARY:${summary}`,
    'URL:https://better-f1-calendar.vercel.app/event/bahrain-2026',
  ]));
  const source = calendar(...sessions);

  const full = applyCalendarTransform('f1', source);
  assert.equal(eventBlocks(full).length, 5);
  assert.deepEqual(
    eventBlocks(full).map((block) => block.match(/UID:(.+)/)?.[1].trim()),
    ['practice-1', 'practice-2', 'practice-3', 'qualifying', 'race']
  );

  const raceOnly = applyCalendarTransform('f1-races-only', source);
  assert.equal(eventBlocks(raceOnly).length, 1);
  assert.match(raceOnly, /UID:race/);
  assert.match(raceOnly, /DTSTART:20261004T070000Z/);
});
