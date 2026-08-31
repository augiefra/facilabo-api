import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_EVENTS_CONTRACT_VERSION, searchLocalEvents } from './local-events';

function openAgendaEvents(agendaUid: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const begin = new Date(Date.UTC(2030, 0, 1, 8, index)).toISOString();
    const end = new Date(Date.UTC(2030, 0, 1, 9, index)).toISOString();
    return {
      uid: `${agendaUid}-${index}`,
      title: `Événement ${agendaUid}-${index}`,
      timings: [{ begin, end }],
      location: {
        name: `Lieu ${agendaUid}`,
        city: 'Ville test',
        latitude: 48.85,
        longitude: 2.35,
      },
    };
  });
}

async function withMockedOpenAgenda(
  targetEnvName: string,
  targetAgendaUids: string,
  responseForAgenda: (agendaUid: string) => unknown,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAGENDA_PUBLIC_KEY;
  const originalTarget = process.env[targetEnvName];
  process.env.OPENAGENDA_PUBLIC_KEY = 'test-key';
  process.env[targetEnvName] = targetAgendaUids;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const agendaUid = url.match(/\/agendas\/([^/]+)\/events/)?.[1];
    assert.ok(agendaUid, `unexpected OpenAgenda URL: ${url}`);
    return new Response(JSON.stringify(responseForAgenda(agendaUid)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAGENDA_PUBLIC_KEY;
    else process.env.OPENAGENDA_PUBLIC_KEY = originalKey;
    if (originalTarget === undefined) delete process.env[targetEnvName];
    else process.env[targetEnvName] = originalTarget;
  }
}

test('local-events exposes honest truncation when one fetched page cannot prove upstream completeness', async () => {
  await withMockedOpenAgenda(
    'OPENAGENDA_TARGET_MARSEILLE_UIDS',
    '1001,1002,1003',
    (agendaUid) => ({
      total: 100,
      events: openAgendaEvents(agendaUid, 40),
      after: ['next-page'],
    }),
    async () => {
      const payload = await searchLocalEvents({ target: 'marseille', limit: 80, from: '2030-01-01' });

      assert.equal(payload.contractVersion, LOCAL_EVENTS_CONTRACT_VERSION);
      assert.equal(payload.events.length, 80);
      assert.match(payload.note ?? '', /promotion du flux bloquee/);
      const { horizonDays, ...stableCoverage } = payload.coverage;
      assert.ok(horizonDays >= 14);
      assert.deepEqual(stableCoverage, {
        returned: 80,
        limit: 80,
        complete: false,
        truncated: true,
        agendasDiscovered: 3,
        agendasSelected: 3,
        agendasFetched: 3,
        pagesFetched: 3,
        agendaDiscoveryPagesFetched: 0,
        eventPagesFetched: 3,
        upstreamEventsFetched: 120,
        upstreamTotal: 300,
        beforeFiltering: 120,
        afterFiltering: 80,
        futureEventCount: 80,
        snapshotAgeHours: 0,
        cursorsExhausted: false,
      });
      assert.equal(payload.qualification.qualified, false);
      assert.ok(payload.qualification.blockers.includes('DIRECT_MODE_NOT_AUDITABLE'));
      assert.equal(payload.storage.durable, false);
    },
  );
});

test('local-events only claims completeness when every selected upstream page proves it', async () => {
  await withMockedOpenAgenda(
    'OPENAGENDA_TARGET_NANTES_UIDS',
    '2001',
    (agendaUid) => ({
      total: 2,
      events: openAgendaEvents(agendaUid, 2),
      after: null,
    }),
    async () => {
      const payload = await searchLocalEvents({ target: 'nantes', limit: 80, from: '2030-02-01' });

      assert.equal(payload.events.length, 2);
      assert.equal(payload.coverage.returned, 2);
      assert.equal(payload.coverage.limit, 80);
      assert.equal(payload.coverage.complete, true);
      assert.equal(payload.coverage.truncated, false);
      assert.equal(payload.coverage.agendasFetched, 1);
      assert.equal(payload.coverage.pagesFetched, 1);
      assert.equal(payload.coverage.upstreamEventsFetched, 2);
      assert.equal(payload.coverage.upstreamTotal, 2);
    },
  );
});
