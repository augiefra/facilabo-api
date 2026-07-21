import {
  fetchMunicipalRssAgendaIcs,
  municipalRssToIcs,
  type MunicipalRssCalendarConfig,
} from './municipal-rss-events';

const ALLAUCH_CONFIG: MunicipalRssCalendarConfig = {
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

export function fetchAllauchAgendaIcs(): Promise<string> {
  return fetchMunicipalRssAgendaIcs(ALLAUCH_CONFIG);
}

export function allauchRssToIcs(xml: string): string {
  return municipalRssToIcs(xml, ALLAUCH_CONFIG);
}
