import assert from 'node:assert/strict';
import test from 'node:test';
import { municipalRssToIcs } from './municipal-rss-events.ts';

const allauchConfig = {
  sourceUrl: 'https://www.allauch.com/flux_rss_agenda',
  userAgent: 'FacilAbo/2.0 local-events-allauch',
  calendarName: 'Agenda officiel d’Allauch',
  calendarDescription: 'Événements officiels publiés par la Ville d’Allauch',
  sourceAttribution: 'Ville d’Allauch',
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
      <description><![CDATA[<p>Concert officiel.</p>]]></description>
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
});
