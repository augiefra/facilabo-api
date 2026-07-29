import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/api-ci.yml', import.meta.url), 'utf8');

const failures = [];
const expectedLocalDevCommand = 'npx --yes --package=vercel@latest vercel dev --local';
const forbiddenLocalVercelPackages = ['vercel', '@vercel/node'];

if (packageJson.engines?.node !== '22.x') {
  failures.push(`package.json engines.node must be 22.x, got ${packageJson.engines?.node ?? 'missing'}`);
}

if (packageJson.scripts?.dev) {
  failures.push('package.json scripts.dev must stay absent to prevent recursive vercel dev invocation');
}

if (packageJson.scripts?.['dev:local'] !== expectedLocalDevCommand) {
  failures.push(`package.json scripts.dev:local must be "${expectedLocalDevCommand}"`);
}

for (const dependencyGroup of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const packageName of forbiddenLocalVercelPackages) {
    if (packageJson[dependencyGroup]?.[packageName]) {
      failures.push(`package.json must not declare ${packageName} in ${dependencyGroup}`);
    }
  }
}

const lockRoot = packageLock.packages?.[''] ?? {};
for (const dependencyGroup of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const packageName of forbiddenLocalVercelPackages) {
    if (lockRoot[dependencyGroup]?.[packageName]) {
      failures.push(`package-lock root must not declare ${packageName} in ${dependencyGroup}`);
    }
  }
}

for (const packageName of forbiddenLocalVercelPackages) {
  if (packageLock.packages?.[`node_modules/${packageName}`]) {
    failures.push(`package-lock must not contain node_modules/${packageName}`);
  }
}

const requiredWorkflowMarkers = [
  'node-version: 22.x',
  'npm ci',
  'npm run check',
  'npm audit --omit=dev --audit-level=high',
  'npm audit --audit-level=low',
  'schedule:',
  "cron: '17 5 * * 1'",
  'permissions:',
  'contents: read',
];

for (const marker of requiredWorkflowMarkers) {
  if (!workflow.includes(marker)) {
    failures.push(`API CI workflow is missing: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error('Tooling contract: FAILED');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Tooling contract: OK');
console.log('- Node runtime: 22.x');
console.log('- Remote Vercel CLI dependency: absent');
console.log('- Vercel build toolchain used only for erased types: absent');
console.log('- Local emulation: isolated npm run dev:local, ephemeral Vercel CLI');
console.log('- CI gates: install, checks, production audit and full dependency audit');
