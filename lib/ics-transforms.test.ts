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
  assert.match(corrected, /UID:vacances-guadeloupe-20261219-vacances-de-noel@facilabo\.app/);
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


test('makes all thirteen Etalab holiday ends exclusive, preserving upstream identity and other fields', () => {
  for (const slug of [
    'feries-alsace-moselle', 'feries-guadeloupe', 'feries-guyane',
    'feries-la-reunion', 'feries-martinique', 'feries-mayotte',
    'feries-metropole', 'feries-nouvelle-caledonie', 'feries-polynesie-francaise',
    'feries-saint-barthelemy', 'feries-saint-martin',
    'feries-saint-pierre-et-miquelon', 'feries-wallis-et-futuna',
  ]) {
    for (const [start, end] of [['20261231', '20270101'], ['20280229', '20280301'], ['20270228', '20270301']]) {
      const source = calendar('PRODID:-//DINUM//Jours fériés Métropole//FR', event([
        'UID:stable-upstream-uid', 'DTSTAMP:20260101T000000Z', 'SUMMARY:Jour férié',
        `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${start}`,
      ]));
      const corrected = applyCalendarTransform(slug, source);
      assert.equal(eventBlocks(corrected).find((block) => block.includes('UID:stable-upstream-uid')),
        eventBlocks(source.replace(`DTEND;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`))[0]);
      assert.equal(applyCalendarTransform(slug, corrected), corrected);
    }
  }
});

test('leaves unrelated sources, dates, timed events and existing exclusive ends unchanged', () => {
  const source = calendar('PRODID:-//DINUM//Jours fériés Métropole//FR', ...[
    ['DTSTART;VALUE=DATE:20270230', 'DTEND;VALUE=DATE:20270230'],
    ['DTSTART;VALUE=DATE:20270101', 'DTEND;VALUE=DATE:20270102'],
    ['DTSTART;VALUE=DATE:20270102', 'DTEND;VALUE=DATE:20270101'],
    ['DTSTART:20270101T120000Z', 'DTEND:20270101T120000Z'],
  ].map((lines) => event(['UID:unchanged', ...lines])));
  assert.equal(applyCalendarTransform('feries-guadeloupe', source), source);
  const zeroEnd = calendar('PRODID:-//DINUM//Jours fériés Métropole//FR', event([
    'UID:stable', 'DTSTART;VALUE=DATE:20270101', 'DTEND;VALUE=DATE:20270101',
  ]));
  assert.equal(applyCalendarTransform('unrelated-calendar', zeroEnd), zeroEnd);
  const otherSource = zeroEnd.replace('PRODID:-//DINUM//Jours fériés Métropole//FR', 'PRODID:Other');
  assert.equal(applyCalendarTransform('feries-guadeloupe', otherSource), otherSource);
});


test('adds only the twenty proved territorial dates with stable UIDs and exclusive ends', () => {
  const source = calendar('PRODID:-//DINUM//Jours fériés Métropole//FR');
  const expected: Record<string, string[]> = {
    'feries-nouvelle-caledonie': ['20260924', '20270924', '20280924', '20290924', '20300924'],
    'feries-polynesie-francaise': [
      '20270305', '20270326', '20270629', '20280305', '20280414', '20280629',
      '20290305', '20290330', '20290629', '20300305', '20300419', '20300629',
      '20310305', '20310411', '20310629',
    ],
  };
  for (const [slug, dates] of Object.entries(expected)) {
    const corrected = applyCalendarTransform(slug, source);
    const blocks = eventBlocks(corrected);
    assert.deepEqual(blocks.map((block) => block.match(/DTSTART;VALUE=DATE:(\d+)/)?.[1]), dates);
    for (const block of blocks) {
      const start = block.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/)!;
      const nextDay = new Date(Date.UTC(+start[1], +start[2] - 1, +start[3] + 1));
      assert.ok(block.includes('DTEND;VALUE=DATE:' + nextDay.toISOString().slice(0, 10).replaceAll('-', '')));
      assert.match(block, /URL:https:\/\//);
    }
    assert.equal(applyCalendarTransform(slug, corrected), corrected);
    assert.equal(applyCalendarTransform(slug, source.replace('DINUM', 'Other')), source.replace('DINUM', 'Other'));
  }
});

test('keeps an upstream territorial holiday instead of adding a duplicate date', () => {
  const source = calendar('PRODID:-//DINUM//Jours fériés Métropole//FR', event([
    'UID:official-new-id', 'DTSTART;VALUE=DATE:20260924', 'DTEND;VALUE=DATE:20260925',
    'SUMMARY:Fête de la citoyenneté',
  ]));
  const output = applyCalendarTransform('feries-nouvelle-caledonie', source);
  assert.equal(eventBlocks(output).length, 5);
  assert.ok(output.includes('UID:official-new-id'));
  assert.equal(eventBlocks(output).filter((block) => block.includes('DTSTART;VALUE=DATE:20260924')).length, 1);
});

test('splits the merged Guadeloupe slavery-abolition block back into its two official days', () => {
  const merged = calendar(event([
    'UID:20260918T085808Z-Guadeloupe@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261009',
    'DTEND;VALUE=DATE:20270528',
    'SUMMARY:Abolition de l?esclavage',
  ]), event([
    'UID:20260918T085809Z-Guadeloupe@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261010',
    'DTEND;VALUE=DATE:20270529',
    'SUMMARY:Abolition de l?esclavage(prérentrée Saint-Barthélémy)',
  ]));
  const corrected = applyCalendarTransform('vacances-guadeloupe', merged);

  assert.match(corrected, /DTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261010/);
  assert.match(corrected, /DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261011/);
  assert.equal(applyCalendarTransform('vacances-guadeloupe', corrected), corrected);

  // A regenerated upstream UID keeps matching on the stable suffix, and other
  // territories are never rewritten.
  const regenerated = merged.replace('20260918T085808Z', '20261001T120000Z');
  assert.match(applyCalendarTransform('vacances-guadeloupe', regenerated), /DTEND;VALUE=DATE:20261010/);
  assert.equal(applyCalendarTransform('vacances-guyane', merged), merged);
});

test('stabilizes regenerated Opendatasoft school-holiday UIDs across exports', () => {
  const firstExport = calendar(event([
    'UID:20260918T084701Z-Zone-A@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261017',
    'DTEND;VALUE=DATE:20261103',
    'SUMMARY:Vacances de la Toussaint',
  ]));
  const stabilized = applyCalendarTransform('vacances-zone-a', firstExport);

  assert.match(stabilized, /UID:vacances-zone-a-20261017-vacances-de-la-toussaint@facilabo\.app/);
  assert.equal(applyCalendarTransform('vacances-zone-a', stabilized), stabilized);

  const regenerated = firstExport.replace('20260918T084701Z', '20261024T101112Z');
  assert.match(
    applyCalendarTransform('vacances-zone-a', regenerated),
    /UID:vacances-zone-a-20261017-vacances-de-la-toussaint@facilabo\.app/,
  );

  // Holiday calendars keep the upstream identity that anchors rely on.
  assert.match(applyCalendarTransform('feries-guadeloupe', firstExport), /20260918T084701Z-Zone-A@data\.education\.gouv\.fr/);
});

test('gives zero-length all-day school markers their own day', () => {
  const source = calendar(event([
    'UID:20260918T090443Z-NouvelleCaledonie@data.education.gouv.fr',
    'DTSTART;VALUE=DATE:20261219',
    'DTEND;VALUE=DATE:20261219',
    "SUMMARY:Début des Vacances d'Été",
  ]));
  const output = applyCalendarTransform('vacances-nouvelle-caledonie', source);

  assert.match(output, /DTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261220/);
  assert.equal(applyCalendarTransform('vacances-nouvelle-caledonie', output), output);
});
