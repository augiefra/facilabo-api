#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = process.cwd();
const buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'facilabo-api-contracts-'));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    path.join(repoRoot, 'node_modules', '.bin', 'tsc'),
    ['--outDir', buildDirectory, '--declaration', 'false', '--pretty', 'false'],
    { cwd: repoRoot, stdio: 'inherit' }
  );

  const mappingsModule = require(path.join(buildDirectory, 'lib', 'calendar-mappings.js'));
  const catalogModule = require(path.join(buildDirectory, 'lib', 'calendar-catalog.js'));
  const mappings = mappingsModule.getAllMappings();

  const mappingGroups = [
    ['FACILABO_CALENDARS', mappingsModule.FACILABO_CALENDARS],
    ['F1_CALENDARS', mappingsModule.F1_CALENDARS],
    ['MOTOGP_CALENDARS', mappingsModule.MOTOGP_CALENDARS],
    ['NASCAR_CALENDARS', mappingsModule.NASCAR_CALENDARS],
    ['NBA_CALENDARS', mappingsModule.NBA_CALENDARS],
    ['FOOTBALL_TEAMS', mappingsModule.FOOTBALL_TEAMS],
    ['EUROPEAN_FOOTBALL_TEAMS', mappingsModule.EUROPEAN_FOOTBALL_TEAMS],
    ['RUGBY_TEAMS', mappingsModule.RUGBY_TEAMS],
  ];

  const slugOwners = new Map();
  for (const [groupName, group] of mappingGroups) {
    for (const slug of Object.keys(group)) {
      const previousOwner = slugOwners.get(slug);
      assert.equal(
        previousOwner,
        undefined,
        `Duplicate slug ${slug} in ${previousOwner} and ${groupName}`
      );
      slugOwners.set(slug, groupName);
    }
  }

  const catalogErrors = catalogModule.validateCalendarCatalog(mappings);
  assert.deepEqual(catalogErrors, [], catalogErrors.join('\n'));

  const response = catalogModule.buildCalendarListResponse(mappings);
  const mappingSlugs = Object.keys(mappings);
  const responseSlugs = response.calendars.map((calendar) => calendar.slug);
  assert.deepEqual(Object.keys(response).sort(), ['calendars', 'meta']);
  assert.equal(response.meta.catalogSchemaVersion, 2);
  assert.deepEqual(
    responseSlugs,
    mappingSlugs,
    'The list projection must return every mapping slug unchanged and in the existing order.'
  );
  assert.equal(new Set(responseSlugs).size, responseSlugs.length, 'The list response contains duplicate slugs.');
  assert.equal(slugOwners.size, mappingSlugs.length, 'Mapping groups and getAllMappings() disagree.');

  const futureUncataloguedSlug = '__contract_test_uncatalogued_slug__';
  const mappingsWithFutureUncataloguedFeed = {
    ...mappings,
    [futureUncataloguedSlug]: {
      sourceUrl: 'https://example.invalid/future.ics',
      frenchName: 'Future feed without catalog projection',
    },
  };
  const futureMappingErrors = catalogModule.validateCalendarCatalog(
    mappingsWithFutureUncataloguedFeed
  );
  assert.ok(
    futureMappingErrors.some((error) => error.includes(futureUncataloguedSlug)),
    'A future mapping without a catalog projection must fail validation.'
  );
  assert.throws(
    () => catalogModule.buildCalendarListResponse(mappingsWithFutureUncataloguedFeed),
    /Missing catalog projection/,
    'The response builder must reject a future mapping without a catalog projection.'
  );

  const calendarsEndpoint = require(
    path.join(buildDirectory, 'api', 'v1', 'calendars', '[slug].js')
  ).default;
  const endpointRequest = {
    method: 'GET',
    query: { slug: 'list' },
    headers: {},
    socket: {},
  };
  const endpointResponse = {
    headers: {},
    statusCode: undefined,
    body: undefined,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  await calendarsEndpoint(endpointRequest, endpointResponse);
  assert.equal(endpointResponse.statusCode, 200);
  assert.deepEqual(endpointResponse.body, response, 'The list endpoint does not expose the validated projection.');
  assert.deepEqual(
    endpointResponse.body.calendars.map((calendar) => calendar.slug),
    mappingSlugs,
    'The endpoint renamed, removed or duplicated at least one mapping slug.'
  );

  const knownFamilies = new Set(catalogModule.CATALOG_FAMILIES);
  const knownCategories = new Set(catalogModule.CATALOG_CATEGORIES);
  let discoverableCount = 0;

  for (const calendar of response.calendars) {
    const mapping = mappings[calendar.slug];
    assert.ok(mapping, `Response slug has no mapping: ${calendar.slug}`);

    // The projection must only append catalog data; legacy fields are pass-through values.
    assert.deepEqual(
      {
        slug: calendar.slug,
        name: calendar.name,
        description: calendar.description,
      },
      {
        slug: calendar.slug,
        name: mapping.frenchName,
        description: mapping.description,
      },
      `Legacy fields changed for ${calendar.slug}`
    );

    assert.ok(calendar.catalog, `Missing catalog projection for ${calendar.slug}`);
    assert.equal(typeof calendar.catalog.discoverable, 'boolean');
    assert.ok(knownFamilies.has(calendar.catalog.family), `Unknown family for ${calendar.slug}`);
    if (calendar.catalog.category !== undefined) {
      assert.ok(knownCategories.has(calendar.catalog.category), `Unknown category for ${calendar.slug}`);
    }

    const catalogKeys = Object.keys(calendar.catalog);
    assert.deepEqual(
      catalogKeys.filter((key) => !['discoverable', 'family', 'category'].includes(key)),
      [],
      `Unsupported catalog fields for ${calendar.slug}`
    );

    if (calendar.catalog.discoverable) {
      discoverableCount += 1;
      assert.ok(mappings[calendar.slug], `Discoverable slug has no mapping: ${calendar.slug}`);
    }
  }

  const notices = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'data', 'update-notices.json'), 'utf8')
  );
  assert.ok(Array.isArray(notices), 'update-notices.json must contain an array.');

  const supportedPlatforms = new Set(['ios', 'android']);
  for (const notice of notices) {
    if (notice.platforms === undefined) continue;
    assert.ok(Array.isArray(notice.platforms), `Notice ${notice.id} platforms must be an array.`);
    assert.equal(
      new Set(notice.platforms).size,
      notice.platforms.length,
      `Notice ${notice.id} contains duplicate platforms.`
    );
    for (const platform of notice.platforms) {
      assert.ok(supportedPlatforms.has(platform), `Notice ${notice.id} has unknown platform ${platform}.`);
    }
  }

  const noticesEndpoint = require(
    path.join(buildDirectory, 'api', 'v1', 'updates', 'notices.js')
  );
  const noticeWithoutPlatforms = {};
  const androidOnlyNotice = { platforms: ['android'] };
  assert.equal(noticesEndpoint.isNoticeVisibleOnPlatform(noticeWithoutPlatforms, 'ios'), true);
  assert.equal(noticesEndpoint.isNoticeVisibleOnPlatform(noticeWithoutPlatforms, 'android'), true);
  assert.equal(noticesEndpoint.isNoticeVisibleOnPlatform(androidOnlyNotice, 'ios'), false);
  assert.equal(noticesEndpoint.isNoticeVisibleOnPlatform(androidOnlyNotice, 'android'), true);

  console.log('Client contracts: OK');
  console.log(`- calendars: ${response.calendars.length}`);
  console.log(`- slug coverage: ${responseSlugs.length}/${mappingSlugs.length}, exact and unique`);
  console.log(`- discoverable: ${discoverableCount}`);
  console.log(`- non-discoverable: ${response.calendars.length - discoverableCount}`);
  console.log('- future uncatalogued mapping: rejected');
  console.log('- legacy fields: unchanged by the projection');
  console.log(`- update notices: ${notices.length} valid`);
  console.log('- notice visibility: absent=ios+android, android=android only');
} finally {
  fs.rmSync(buildDirectory, { recursive: true, force: true });
}
