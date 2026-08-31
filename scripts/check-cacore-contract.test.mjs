#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const checker = path.join(repoRoot, 'scripts', 'check-cacore-contract.mjs');
const files = [
  'cacore-contract.v1.json',
  'cacore-api-shadow.v1.json',
  'cacore-ios-shadow.v1.json',
  'cacore-guardian-shadow.v1.json',
  'cacore-contract.v1.lock.json',
];

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

function fixtureDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'facilabo-cacore-negative-'));
  for (const name of files) {
    fs.copyFileSync(path.join(repoRoot, 'data', name), path.join(directory, name));
  }
  return directory;
}

function run(directory) {
  return spawnSync(process.execPath, [checker, '--data-root', directory], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('rejects a duplicate JSON key before validating the contract', () => {
  const directory = fixtureDirectory();
  try {
    const contractPath = path.join(directory, 'cacore-contract.v1.json');
    const body = fs.readFileSync(contractPath, 'utf8');
    fs.writeFileSync(contractPath, body.replace('{\n', '{\n  "schemaVersion": 1,\n'));
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /non-canonical or contains a duplicate JSON key/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects non-canonical JSON bytes', () => {
  const directory = fixtureDirectory();
  try {
    const lockPath = path.join(directory, 'cacore-contract.v1.lock.json');
    fs.appendFileSync(lockPath, ' ');
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /non-canonical or contains a duplicate JSON key/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects drift in the iOS projection SHA', () => {
  const directory = fixtureDirectory();
  try {
    const iosPath = path.join(directory, 'cacore-ios-shadow.v1.json');
    const projection = JSON.parse(fs.readFileSync(iosPath, 'utf8'));
    projection.testMarker = 'drift';
    fs.writeFileSync(iosPath, serialize(projection));
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /projection SHA drifted/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
