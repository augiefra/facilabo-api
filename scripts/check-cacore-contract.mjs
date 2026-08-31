#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function serialize(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function readCanonicalJson(filePath) {
  const body = fs.readFileSync(filePath, 'utf8');
  let value;
  try {
    value = JSON.parse(body);
  } catch (error) {
    throw new Error(`${path.basename(filePath)} is invalid JSON: ${error.message}`);
  }
  assert.equal(
    body,
    serialize(value),
    `${path.basename(filePath)} is non-canonical or contains a duplicate JSON key.`
  );
  return { body, value };
}

function stableUUID(seed) {
  const hex = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
    .join('-')
    .toUpperCase();
}

function compileApiModules() {
  const buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'facilabo-cacore-check-'));
  try {
    execFileSync(
      path.join(repoRoot, 'node_modules', '.bin', 'tsc'),
      ['--outDir', buildDirectory, '--declaration', 'false', '--pretty', 'false'],
      { cwd: repoRoot, stdio: 'inherit' }
    );
    const mappingsModule = require(path.join(buildDirectory, 'lib', 'calendar-mappings.js'));
    return {
      mappings: mappingsModule.getAllMappings(),
      icsHandler: require(path.join(buildDirectory, 'api', 'v1', 'calendars', '[slug].js')).default,
      metadataHandler: require(path.join(buildDirectory, 'api', 'v1', 'calendars', 'metadata', '[slug].js')).default,
    };
  } finally {
    fs.rmSync(buildDirectory, { recursive: true, force: true });
  }
}

function responseRecorder() {
  return {
    body: undefined,
    headers: {},
    statusCode: undefined,
    end() { return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
  };
}

async function proveWorldCupHandlers(icsHandler, metadataHandler, slugs) {
  const previousKillSwitch = process.env.METADATA_KILL_SWITCH;
  process.env.METADATA_KILL_SWITCH = '1';
  try {
    for (const slug of slugs) {
      const requestBase = { headers: {}, query: { slug }, socket: { remoteAddress: '127.0.0.1' } };
      const icsResponse = responseRecorder();
      await icsHandler({ ...requestBase, method: 'HEAD' }, icsResponse);
      assert.equal(icsResponse.statusCode, 200, `ICS handler does not resolve configured World Cup slug ${slug}`);
      assert.equal(icsResponse.headers['Content-Type'], 'text/calendar; charset=utf-8');

      const metadataResponse = responseRecorder();
      await metadataHandler({ ...requestBase, method: 'GET' }, metadataResponse);
      assert.equal(
        metadataResponse.statusCode,
        503,
        `Metadata handler does not resolve ${slug} before the local kill-switch proof point.`
      );
      assert.equal(metadataResponse.body?.meta?.killSwitchActive, true);
    }
  } finally {
    if (previousKillSwitch === undefined) delete process.env.METADATA_KILL_SWITCH;
    else process.env.METADATA_KILL_SWITCH = previousKillSwitch;
  }
}

const dataRoot = path.resolve(argument('--data-root', path.join(repoRoot, 'data')));
const contractFile = readCanonicalJson(path.join(dataRoot, 'cacore-contract.v1.json'));
const apiFile = readCanonicalJson(path.join(dataRoot, 'cacore-api-shadow.v1.json'));
const iosFile = readCanonicalJson(path.join(dataRoot, 'cacore-ios-shadow.v1.json'));
const guardianFile = readCanonicalJson(path.join(dataRoot, 'cacore-guardian-shadow.v1.json'));
const lockFile = readCanonicalJson(path.join(dataRoot, 'cacore-contract.v1.lock.json'));
const contract = contractFile.value;
const apiProjection = apiFile.value;
const iosProjection = iosFile.value;
const guardianProjection = guardianFile.value;
const lock = lockFile.value;
const { mappings, icsHandler, metadataHandler } = compileApiModules();
const mappingSlugs = Object.keys(mappings);
const slugs = contract.entries.map((entry) => entry.slug);
const publicOrderBody = serialize(slugs);

assert.equal(contract.schemaVersion, 1);
assert.equal(contract.serialization, 'JSON sorted keys, two-space indentation, UTF-8, LF final newline');
assert.equal(contract.entries.length, 258, 'CaCORE must fail closed outside the exact 258-slug universe.');
assert.equal(new Set(slugs).size, 258, 'CaCORE contains duplicate slugs.');
assert.deepEqual(slugs, mappingSlugs, 'CaCORE order differs from Object.keys(getAllMappings()).');
assert.deepEqual(apiProjection.entries.map((entry) => entry.slug), mappingSlugs, 'API shadow order drifted.');
assert.equal(lock.entryCount, 258);
assert.deepEqual(contract.publicOrder, { count: 258, sha256: sha256(publicOrderBody) });
assert.equal(lock.publicOrderSha256, sha256(publicOrderBody), 'Public order SHA drifted.');
assert.equal(lock.contractSha256, sha256(contractFile.body), 'Canonical contract SHA drifted.');
assert.deepEqual(
  lock.projectionSha256,
  {
    api: sha256(apiFile.body),
    guardian: sha256(guardianFile.body),
    ios: sha256(iosFile.body),
  },
  'At least one API/iOS/Guardian projection SHA drifted.'
);

assert.deepEqual(
  apiProjection,
  {
    entries: contract.entries.map(({ discovery, iosDeclaration, publicOrder, routes, slug }) => ({
      discovery,
      iosDeclaration,
      publicOrder,
      routes,
      slug,
    })),
    schemaVersion: 1,
  },
  'API projection differs from the canonical contract.'
);
assert.deepEqual(
  guardianProjection,
  {
    entries: contract.entries.map(({ aliases, lifecycle, slug }) => ({
      editionAliases: aliases.editionLabels,
      lifecycle,
      slug,
    })),
    schemaVersion: 1,
  },
  'Guardian projection differs from the canonical contract.'
);

const runtimeFeeds = iosProjection.runtimeFeeds;
const runtimeUUIDs = runtimeFeeds.map((feed) => feed.uuid);
const runtimeSlugs = runtimeFeeds.map((feed) => feed.slug);
assert.equal(runtimeFeeds.length, 211);
assert.equal(new Set(runtimeUUIDs).size, runtimeUUIDs.length, 'Duplicate iOS runtime UUID.');
assert.equal(new Set(runtimeSlugs).size, runtimeSlugs.length, 'Duplicate iOS runtime slug.');
for (const feed of runtimeFeeds) {
  assert.equal(feed.identitySeed, feed.idSeed ?? feed.icsURL, `Identity seed drift for ${feed.slug}`);
  assert.equal(feed.uuid, stableUUID(feed.identitySeed), `Derived UUID drift for ${feed.slug}`);
}
assert.equal(new Set(iosProjection.catalogueFeeds).size, iosProjection.catalogueFeeds.length, 'Duplicate catalogue UUID.');
assert.equal(iosProjection.catalogueFeeds.length, 205);
for (const uuid of iosProjection.catalogueFeeds) {
  assert.ok(runtimeUUIDs.includes(uuid), `Catalogue UUID is absent from the runtime: ${uuid}`);
}

const contractIosBySlug = Object.fromEntries(
  contract.entries.filter((entry) => entry.ios).map((entry) => [entry.slug, entry.ios])
);
for (const feed of runtimeFeeds) {
  const { slug, ...identity } = feed;
  assert.deepEqual({ idSeed: null, ...identity }, contractIosBySlug[slug], `iOS projection drift for ${slug}`);
}

const apiOnlySlugs = contract.entries
  .filter((entry) => entry.iosDeclaration.state === 'API_ONLY')
  .map((entry) => entry.slug);
assert.deepEqual(
  apiOnlySlugs,
  ['religion-multi-cultes', 'stadeReims', 'montpellierHsc', 'saintEtienne'],
  'The four true API-only slugs must be explicit and exclusive.'
);
assert.equal(contract.entries.filter((entry) => entry.discovery.state === 'FEATURE_FLAGGED').length, 7);
assert.deepEqual(
  contract.entries.filter((entry) => entry.discovery.state === 'DECLARED_INACTIVE').map((entry) => entry.slug),
  ['culture-france']
);
assert.equal(contract.entries.filter((entry) => entry.discovery.state === 'VISIBLE').length, 205);
assert.equal(contract.entries.filter((entry) => entry.discovery.discoverable).length, 205);

for (const [index, entry] of contract.entries.entries()) {
  assert.equal(entry.publicOrder, index, `Non-contiguous public order at ${entry.slug}`);
  assert.equal(entry.routes.configurationState, 'MAPPED', `Unmapped route declaration at ${entry.slug}`);
  assert.equal(entry.routes.deliveryURL, mappings[entry.slug].sourceUrl);
  assert.equal(entry.routes.v1IcsPath, `/api/v1/calendars/${entry.slug}`);
  assert.equal(entry.routes.v1MetadataPath, `/api/v1/calendars/metadata/${entry.slug}`);
  assert.ok(['CALENDAR_V1', 'LEGACY_ADAPTER', 'LOCAL_EVENTS_V1', 'SELF_HOSTED_ICS', 'EXTERNAL_ICS'].includes(entry.routes.deliveryKind));
  assert.ok(['VISIBLE', 'HIDDEN', 'MONITORED_ONLY', 'FEATURE_FLAGGED', 'DECLARED_INACTIVE', 'API_ONLY'].includes(entry.discovery.state));
  assert.equal(entry.aliases.routeSlugs.some((alias) => entry.aliases.editionLabels.includes(alias)), false);
}

assert.deepEqual(contract.deepLinks, {
  catalogue: [
    { destination: 'worldCup2026', uri: 'facilabo://catalogue/worldcup-2026' },
    { destination: 'examensParcoursup2026', uri: 'facilabo://catalogue/examens-parcoursup-2026' },
  ],
  live: {
    emittedKinds: ['birthday', 'day', 'event', 'routine', 'subscription'],
    grammar: 'facilabo://live/{kind}/{id?}',
    parserPolicy: 'ANY_NON_EMPTY_KIND',
  },
});
assert.deepEqual(iosProjection.liveDeepLinks, contract.deepLinks.live);

const worldCupSlugs = [
  'worldcup-2026-all',
  'worldcup-2026-belgium',
  'worldcup-2026-big-nights',
  'worldcup-2026-france',
  'worldcup-2026-knockout',
];
for (const slug of worldCupSlugs) {
  const entry = contract.entries.find((candidate) => candidate.slug === slug);
  assert.ok(entry);
  assert.equal(entry.discovery.discoverable, false);
  assert.equal(entry.routes.configurationState, 'MAPPED');
}
await proveWorldCupHandlers(icsHandler, metadataHandler, worldCupSlugs);

console.log('CaCORE contract: OK');
console.log('- entries: 258, exact Object.keys(getAllMappings()) order and unique');
console.log('- discovery: 205 visible; residual 7 feature-flagged + culture-france declared inactive');
console.log('- API-only: religion-multi-cultes, stadeReims, montpellierHsc, saintEtienne');
console.log('- live deep links: generic parser grammar; emitted birthday/day/event/routine/subscription');
console.log('- World Cup: ICS HEAD + metadata mapping resolved locally (kill-switch, no upstream fetch)');
console.log(`- contract SHA-256: ${lock.contractSha256}`);
