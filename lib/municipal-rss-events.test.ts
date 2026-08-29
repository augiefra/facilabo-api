import assert from 'node:assert/strict';
import test from 'node:test';
import { antibesRssToIcs } from './antibes-events.ts';
import { municipalRssToIcs } from './municipal-rss-events.ts';

const allauchConfig = {
  sourceUrl: 'https://www.allauch.com/flux_rss_agenda',
  userAgent: 'FacilAbo/2.0 local-events-allauch',
  calendarName: 'Agenda officiel d’Allauch',
  calendarDescription: 'Événements officiels publiés par la Ville d’Allauch',
  uidPrefix: 'sorties-ville-allauch',
  prodId: '-//FacilAbo//Agenda officiel Allauch RSS//FR',
  fallbackLocation: 'Allauch',
  categories: ['Sorties', 'Agenda ville', 'Allauch'],
};

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:ev="http://purl.org/rss/1.0/modules/event/"
  xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"
  xmlns:art="https://www.allauch.com/rss/art">
  <channel>
    <item>
      <title>Concert du soir</title>
      <link>https://www.allauch.com/agenda/concert-du-soir/</link>
      <category>Musique</category>
      <description><![CDATA[
        <h2>Concert officiel</h2>
        <p>Première partie.<br />Entrée libre.</p>
        <blockquote><p>Une soirée pour tous.</p></blockquote>
        <ul><li>Accueil à 18 h</li><li>Début à 19 h</li></ul>
      ]]></description>
      <ev:startdate>2026-07-24T21:00:00+02:00</ev:startdate>
      <ev:enddate>2026-07-24T22:00:00+02:00</ev:enddate>
      <ev:location>Bastide de Fontvieille</ev:location>
      <geo:lat>43.32273021871184</geo:lat>
      <geo:long>5.4912591153147305</geo:long>
      <guid isPermaLink="false">0119731</guid>
    </item>
    <item>
      <title>Fête de la bière</title>
      <link>https://www.allauch.com/agenda/fete-de-la-biere/</link>
      <ev:startdate>2026-08-29T18:00:00+02:00</ev:startdate>
      <ev:enddate>2026-08-29T00:00:00+02:00</ev:enddate>
      <ev:location>Allauch</ev:location>
      <guid isPermaLink="false">0119769</guid>
    </item>
    <item>
      <title>Fête de la Saint-Laurent</title>
      <link>https://www.allauch.com/agenda/fete-de-la-saint-laurent-2/</link>
      <art:enddate>2027-08-06T00:00:00+02:00</art:enddate>
      <ev:startdate>2026-08-06T00:00:00+02:00</ev:startdate>
      <ev:enddate>2026-08-15T00:00:00+02:00</ev:enddate>
      <guid isPermaLink="false">0119736</guid>
    </item>
  </channel>
</rss>`;

test('Allauch RSS is converted into stable and calendar-safe events', () => {
  const ics = municipalRssToIcs(fixture, allauchConfig);
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  const description = unfolded.match(/DESCRIPTION:([^\r\n]*)/)?.[1];

  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(ics, /UID:sorties-ville-allauch-0119731@facilabo\.app/);
  assert.match(ics, /DTSTART:20260724T190000Z/);
  assert.match(ics, /DTEND:20260724T200000Z/);
  assert.match(ics, /GEO:43\.32273021871184;5\.4912591153147305/);
  assert.match(ics, /UID:sorties-ville-allauch-0119769@facilabo\.app/);
  assert.match(ics, /DTSTART:20260829T160000Z/);
  assert.match(ics, /DTEND:20260829T220000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260806/);
  assert.match(ics, /DTEND;VALUE=DATE:20260816/);
  assert.match(ics, /LOCATION:Allauch/);
  assert.doesNotMatch(ics, /2027/);
  assert.equal(
    description,
    'Concert officiel\\n\\nPremière partie.\\nEntrée libre.\\n\\nUne soirée pour tous.\\n\\n• Accueil à 18 h\\n\\n• Début à 19 h',
  );
  assert.doesNotMatch(description ?? '', /Catégorie:|Source:|https?:\/\//);
  assert.equal(description?.includes('\\\\n'), false);
  assert.match(unfolded, /CATEGORIES:Sorties,Agenda ville,Allauch,Musique/);
  assert.equal(
    (unfolded.match(/https:\/\/www\.allauch\.com\/agenda\/concert-du-soir\//g) ?? []).length,
    1,
  );
});

test('Antibes keeps editorial text separate from URL and categories', () => {
  const antibesFixture = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:ev="http://purl.org/rss/1.0/modules/event/">
    <channel>
      <item>
        <title>Festival du port</title>
        <link>https://www.antibes-juanlespins.com/agenda/festival-du-port</link>
        <category>Musique</category>
        <description><![CDATA[<h2>Au programme</h2><p>Concert.<br>Entrée libre.</p>]]></description>
        <ev:startdate>2026-09-12T19:00:00+02:00</ev:startdate>
        <ev:enddate>2026-09-12T22:00:00+02:00</ev:enddate>
        <guid isPermaLink="false">antibes-42</guid>
      </item>
    </channel>
  </rss>`;

  const unfolded = antibesRssToIcs(antibesFixture).replace(/\r\n[ \t]/g, '');
  const description = unfolded.match(/DESCRIPTION:([^\r\n]*)/)?.[1];

  assert.equal(description, 'Au programme\\n\\nConcert.\\nEntrée libre.');
  assert.doesNotMatch(description ?? '', /Catégorie:|Source:|https?:\/\//);
  assert.match(unfolded, /CATEGORIES:Sorties,Agenda ville,Antibes,Musique/);
  assert.equal(
    (unfolded.match(/https:\/\/www\.antibes-juanlespins\.com\/agenda\/festival-du-port/g) ?? []).length,
    1,
  );
});

test('Antibes deterministically deduplicates semantic RSS duplicates and preserves distinct occurrences', () => {
  const item = (guid: string, title: string, start: string, end: string, location: string) => `
    <item>
      <title>${title}</title>
      <link>https://www.antibes-juanlespins.com/agenda/${guid}</link>
      <description><![CDATA[<p>Lieu : ${location}</p>]]></description>
      <ev:startdate>${start}</ev:startdate>
      <ev:enddate>${end}</ev:enddate>
      <guid isPermaLink="false">${guid}</guid>
    </item>`;
  const antibesFixture = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:ev="http://purl.org/rss/1.0/modules/event/">
      <channel>
        ${item('news-4496', 'EN ATTENDANT   GODOT - Théâtre Antibéa', '2026-11-13T20:30:00+01:00', '2026-11-15T18:00:00+01:00', 'Antibéa Théâtre')}
        ${item('news-4495', 'En attendant Godot – Théâtre Antibéa', '2026-11-13T20:30:00+01:00', '2026-11-15T18:00:00+01:00', 'Antibea theatre')}
        ${item('news-4503', 'Duos sur canapé - Théâtre Antibéa', '2027-01-15T20:30:00+01:00', '2027-01-17T18:00:00+01:00', 'Antibéa Théâtre')}
        ${item('news-4501', 'Duos sur canapé – Théâtre Antibéa', '2027-01-15T20:30:00+01:00', '2027-01-17T18:00:00+01:00', 'Antibea theatre')}
        ${item('news-4510', 'En attendant Godot – Théâtre Antibéa', '2026-11-20T20:30:00+01:00', '2026-11-20T22:00:00+01:00', 'Antibéa Théâtre')}
        ${item('news-4511', 'En attendant Godot – Théâtre Antibéa', '2026-11-13T20:30:00+01:00', '2026-11-15T18:00:00+01:00', 'Salle des Associations')}
      </channel>
    </rss>`;

  const ics = antibesRssToIcs(antibesFixture);

  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 4);
  assert.match(ics, /UID:sorties-ville-antibes-news-4495@facilabo\.app/);
  assert.doesNotMatch(ics, /UID:sorties-ville-antibes-news-4496@facilabo\.app/);
  assert.match(ics, /UID:sorties-ville-antibes-news-4501@facilabo\.app/);
  assert.doesNotMatch(ics, /UID:sorties-ville-antibes-news-4503@facilabo\.app/);
  assert.match(ics, /UID:sorties-ville-antibes-news-4510@facilabo\.app/);
  assert.match(ics, /UID:sorties-ville-antibes-news-4511@facilabo\.app/);
});
