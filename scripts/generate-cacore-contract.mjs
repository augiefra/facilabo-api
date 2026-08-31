#!/usr/bin/env node

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
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function serialize(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(`CaCORE generation refused: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractSwiftFeedDeclarations(source) {
  const propertyPattern = /^    var ([A-Za-z0-9_]+): CalendarFeed \{/gm;
  const properties = [...source.matchAll(propertyPattern)];
  const bySlug = new Map();
  const localTargetToCalendarSlug = new Map(
    [...source.matchAll(/case "([^"]+)": return "([^"]+)"/g)]
      .map((match) => [match[1], match[2]])
  );

  for (const [index, match] of properties.entries()) {
    const start = match.index;
    const end = properties[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);
    const directSlug = body.match(/\bslug:\s*"([^"]+)"/)?.[1];
    const targetSlug = body.match(/targetSlug:\s*"([^"]+)"/)?.[1];
    const slug = directSlug
      ?? (targetSlug ? localTargetToCalendarSlug.get(targetSlug) : undefined)
      ?? body.match(/\\\(proxyBaseURL\)\/([A-Za-z0-9_-]+)/)?.[1]
      ?? body.match(/api\/v1\/calendars\/([A-Za-z0-9_-]+)/)?.[1];
    if (!slug) continue;
    if (bySlug.has(slug)) fail(`duplicate iOS feed declaration for ${slug}`);
    bySlug.set(slug, { symbol: match[1] });
  }

  const localEventsBody = source.match(
    /var allLocalEventsFeeds: \[CalendarFeed\] \{[\s\S]*?return \[([\s\S]*?)\n        \]/
  )?.[1];
  if (!localEventsBody || !source.includes('guard FacilAboFeatureFlags.localEventsEnabled else { return [] }')) {
    fail('unable to derive the effective local-events feature gate from FeedRepository.swift');
  }
  const gatedSymbols = new Set(
    localEventsBody
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^[A-Za-z0-9_]+$/.test(value))
  );
  return { bySlug, gatedSymbols };
}

function extractLiveDeepLinkContract(appDeepLinkSource, candidateBuilderSource) {
  const acceptsAnyNonEmptyKind = appDeepLinkSource.includes(
    'case ("live", let components) where !components.isEmpty:'
  );
  if (!acceptsAnyNonEmptyKind) fail('AppDeepLink live parser grammar is no longer the expected generic non-empty kind');

  const emittedKinds = [...candidateBuilderSource.matchAll(/facilabo:\/\/live\/([A-Za-z0-9_-]+)\//g)]
    .map((match) => match[1]);
  const uniqueKinds = [...new Set(emittedKinds)].sort();
  if (uniqueKinds.length === 0) fail('no emitted live deep-link kind found');
  return {
    emittedKinds: uniqueKinds,
    grammar: 'facilabo://live/{kind}/{id?}',
    parserPolicy: 'ANY_NON_EMPTY_KIND',
  };
}

function deliveryKind(sourceURL) {
  if (sourceURL.includes('/api/v1/local-events/')) return 'LOCAL_EVENTS_V1';
  if (sourceURL.includes('/api/calendar/')) return 'LEGACY_ADAPTER';
  if (sourceURL.includes('/api/v1/calendars/')) return 'CALENDAR_V1';
  if (sourceURL.includes('raw.githubusercontent.com/augiefra/facilabo/')) return 'SELF_HOSTED_ICS';
  return 'EXTERNAL_ICS';
}

function resolvedGuardianContract(raw, profiles) {
  const profile = raw.profile ? profiles[raw.profile] : undefined;
  if (raw.profile && !profile) fail(`unknown Guardian profile ${raw.profile}`);
  return { ...(profile ?? {}), ...raw };
}

function compileApiModules() {
  const buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'facilabo-cacore-build-'));
  try {
    execFileSync(
      path.join(repoRoot, 'node_modules', '.bin', 'tsc'),
      ['--outDir', buildDirectory, '--declaration', 'false', '--pretty', 'false'],
      { cwd: repoRoot, stdio: 'inherit' }
    );
    const mappingsModule = require(path.join(buildDirectory, 'lib', 'calendar-mappings.js'));
    const catalogModule = require(path.join(buildDirectory, 'lib', 'calendar-catalog.js'));
    const mappings = mappingsModule.getAllMappings();
    return { mappings, response: catalogModule.buildCalendarListResponse(mappings) };
  } finally {
    fs.rmSync(buildDirectory, { recursive: true, force: true });
  }
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  const body = serialize(value);
  fs.writeFileSync(path.join(directory, name), body);
  return body;
}

const iosSnapshotPath = argument('--ios-snapshot');
const guardianRegistryPath = argument('--guardian-registry');
const iosFeedRepositoryPath = argument('--ios-feed-repository');
const iosFeatureFlagsPath = argument('--ios-feature-flags');
const iosAppDeepLinkPath = argument('--ios-app-deep-link');
const iosLiveActivityBuilderPath = argument('--ios-live-activity-builder');
const outputDirectory = path.resolve(argument('--output-dir', path.join(repoRoot, 'data')));

if (
  !iosSnapshotPath
  || !guardianRegistryPath
  || !iosFeedRepositoryPath
  || !iosFeatureFlagsPath
  || !iosAppDeepLinkPath
  || !iosLiveActivityBuilderPath
) {
  fail('iOS snapshot, Guardian registry and all four iOS source paths are required');
}

const iosSnapshot = readJson(path.resolve(iosSnapshotPath));
const guardian = readJson(path.resolve(guardianRegistryPath));
const iosFeedRepositorySource = fs.readFileSync(path.resolve(iosFeedRepositoryPath), 'utf8');
const iosFeatureFlagsSource = fs.readFileSync(path.resolve(iosFeatureFlagsPath), 'utf8');
const appDeepLinkSource = fs.readFileSync(path.resolve(iosAppDeepLinkPath), 'utf8');
const candidateBuilderSource = fs.readFileSync(path.resolve(iosLiveActivityBuilderPath), 'utf8');
const iosDeclarations = extractSwiftFeedDeclarations(iosFeedRepositorySource);
const liveDeepLinks = extractLiveDeepLinkContract(appDeepLinkSource, candidateBuilderSource);
const { mappings, response } = compileApiModules();
const slugs = Object.keys(mappings);
const catalogBySlug = Object.fromEntries(response.calendars.map((item) => [item.slug, item.catalog]));
const iosBySlug = Object.fromEntries(iosSnapshot.runtimeFeeds.map((feed) => [feed.slug, feed]));

if (slugs.length !== 258 || new Set(slugs).size !== 258) fail(`API order is ${slugs.length}, expected 258 unique slugs`);
if (guardian.universe?.expectedCount !== 258) fail('Guardian expectedCount is not 258');
if (guardian.baselinePublishedSlugs.length !== 258) fail('Guardian baseline does not contain 258 slugs');
if (JSON.stringify(guardian.baselinePublishedSlugs) !== JSON.stringify(slugs)) fail('Guardian order differs from API public order');
if (Object.keys(guardian.contracts).length !== 258) fail('Guardian does not contain 258 contracts');
if (iosSnapshot.runtimeFeeds.length !== 211 || new Set(iosSnapshot.runtimeFeeds.map((feed) => feed.slug)).size !== 211) {
  fail('iOS runtime identity snapshot is not the expected 211 unique feeds');
}
if (iosSnapshot.catalogueFeeds.length !== 205) fail('iOS catalogue projection is not the expected 205 feeds');
if (!/static let localEventsEnabled\s*=\s*false/.test(iosFeatureFlagsSource)) {
  fail('localEventsEnabled must be explicitly false for this shadow projection');
}
if (JSON.stringify(iosSnapshot.liveDeepLinks) !== JSON.stringify(liveDeepLinks)) {
  fail('iOS live deep-link snapshot differs from parser/emitter sources');
}

for (const slug of Object.keys(iosBySlug)) {
  if (!mappings[slug]) fail(`iOS slug is not served by the API: ${slug}`);
}

const entries = slugs.map((slug, publicOrder) => {
  const mapping = mappings[slug];
  const catalog = catalogBySlug[slug];
  const ios = iosBySlug[slug] ?? null;
  const rawGuardian = guardian.contracts[slug];
  if (!rawGuardian) fail(`missing Guardian contract for ${slug}`);
  const lifecycle = resolvedGuardianContract(rawGuardian, guardian.profiles);
  const editionAliases = lifecycle.expectedEdition?.aliases ?? [];
  const declaration = iosDeclarations.bySlug.get(slug) ?? null;
  const isFeatureFlagged = declaration !== null && iosDeclarations.gatedSymbols.has(declaration.symbol);

  let discoveryState = 'API_ONLY';
  if (ios?.discoveryOrder !== null && ios?.discoveryOrder !== undefined) discoveryState = 'VISIBLE';
  else if (ios) discoveryState = 'HIDDEN';
  else if (lifecycle.releaseScope === 'UNRELEASED_MONITORED') discoveryState = 'MONITORED_ONLY';
  else if (isFeatureFlagged) discoveryState = 'FEATURE_FLAGGED';
  else if (declaration) discoveryState = 'DECLARED_INACTIVE';

  const iosDeclaration = ios
    ? { gate: null, state: 'RUNTIME', symbol: null }
    : declaration
      ? {
          gate: isFeatureFlagged ? 'FacilAboFeatureFlags.localEventsEnabled' : null,
          state: isFeatureFlagged ? 'FEATURE_FLAGGED' : 'DECLARED_INACTIVE',
          symbol: declaration.symbol,
        }
      : { gate: null, state: 'API_ONLY', symbol: null };

  return {
    aliases: {
      editionLabels: editionAliases,
      routeSlugs: [],
    },
    discovery: {
      category: catalog.category ?? null,
      discoverable: catalog.discoverable,
      family: catalog.family,
      state: discoveryState,
    },
    ios: ios && {
      category: ios.category,
      discoveryOrder: ios.discoveryOrder,
      icsURL: ios.icsURL,
      idSeed: ios.idSeed ?? null,
      identitySeed: ios.identitySeed,
      runtimeOrder: ios.runtimeOrder,
      uuid: ios.uuid,
    },
    iosDeclaration,
    lifecycle: {
      editorialState: lifecycle.editorialState,
      monitorOnly: lifecycle.monitorOnly === true,
      releaseScope: lifecycle.releaseScope ?? 'PUBLIC',
      stateReason: lifecycle.stateReason ?? null,
    },
    publicOrder,
    routes: {
      configurationState: 'MAPPED',
      deliveryKind: deliveryKind(mapping.sourceUrl),
      deliveryURL: mapping.sourceUrl,
      v1IcsPath: `/api/v1/calendars/${slug}`,
      v1MetadataPath: `/api/v1/calendars/metadata/${slug}`,
    },
    slug,
  };
});

const publicOrderBody = serialize(slugs);
const generatedApiOnlySlugs = entries
  .filter((entry) => entry.iosDeclaration.state === 'API_ONLY')
  .map((entry) => entry.slug);
if (JSON.stringify(generatedApiOnlySlugs) !== JSON.stringify([
  'religion-multi-cultes',
  'stadeReims',
  'montpellierHsc',
  'saintEtienne',
])) {
  fail(`derived API-only vector is unexpected: ${generatedApiOnlySlugs.join(', ')}`);
}
if (entries.filter((entry) => entry.discovery.state === 'FEATURE_FLAGGED').length !== 7) {
  fail('the residual post-A discovery vector must contain seven effectively feature-gated feeds');
}
if (JSON.stringify(entries.filter((entry) => entry.discovery.state === 'DECLARED_INACTIVE').map((entry) => entry.slug)) !== JSON.stringify(['culture-france'])) {
  fail('culture-france must remain the only residual declared-inactive feed');
}
const contract = {
  deepLinks: {
    catalogue: [
      {
        destination: 'worldCup2026',
        uri: 'facilabo://catalogue/worldcup-2026',
      },
      {
        destination: 'examensParcoursup2026',
        uri: 'facilabo://catalogue/examens-parcoursup-2026',
      },
    ],
    live: liveDeepLinks,
  },
  entries,
  publicOrder: {
    count: slugs.length,
    sha256: sha256(publicOrderBody),
  },
  schemaVersion: 1,
  serialization: 'JSON sorted keys, two-space indentation, UTF-8, LF final newline',
};

const apiProjection = {
  entries: entries.map(({ discovery, iosDeclaration, publicOrder, routes, slug }) => ({
    discovery,
    iosDeclaration,
    publicOrder,
    routes,
    slug,
  })),
  schemaVersion: 1,
};
const iosProjection = {
  catalogueFeeds: iosSnapshot.catalogueFeeds,
  fixedCatalogueDeepLinks: iosSnapshot.fixedCatalogueDeepLinks,
  liveDeepLinks: iosSnapshot.liveDeepLinks,
  runtimeFeeds: iosSnapshot.runtimeFeeds,
  schemaVersion: 1,
  subscriptionPersistenceKeys: [
    'subscribed_feeds',
    'followed_feeds',
    'historically_followed_feeds',
    'added_to_calendar_feeds',
    'historically_added_to_calendar_feeds',
    'free_unlocked_feeds_v2',
    'subscription_state_v1',
  ],
};
const guardianProjection = {
  entries: entries.map(({ aliases, lifecycle, slug }) => ({
    editionAliases: aliases.editionLabels,
    lifecycle,
    slug,
  })),
  schemaVersion: 1,
};

const contractBody = serialize(contract);
const apiBody = serialize(apiProjection);
const iosBody = serialize(iosProjection);
const guardianBody = serialize(guardianProjection);
const lock = {
  contractSha256: sha256(contractBody),
  entryCount: entries.length,
  projectionSha256: {
    api: sha256(apiBody),
    guardian: sha256(guardianBody),
    ios: sha256(iosBody),
  },
  publicOrderSha256: sha256(publicOrderBody),
  schemaVersion: 1,
};

writeJson(outputDirectory, 'cacore-contract.v1.json', contract);
writeJson(outputDirectory, 'cacore-api-shadow.v1.json', apiProjection);
writeJson(outputDirectory, 'cacore-ios-shadow.v1.json', iosProjection);
writeJson(outputDirectory, 'cacore-guardian-shadow.v1.json', guardianProjection);
writeJson(outputDirectory, 'cacore-contract.v1.lock.json', lock);

console.log(`CaCORE v1 generated: ${entries.length} entries`);
console.log(`- public order: ${lock.publicOrderSha256}`);
console.log(`- contract: ${lock.contractSha256}`);
