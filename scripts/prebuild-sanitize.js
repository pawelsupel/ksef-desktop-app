#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const riskyFiles = [
  'src/backend/debug-invoice.xml',
  'src/backend/debug-parsed.json',
  'src/backend/debug-parsed-manual.json',
  'src/backend/debug-struktura.json',
  'src/backend/backend.out',
  'src/backend/ksef.db',
  'ksef.db',
  'dist/backend/ksef.db',
];

const found = [];
for (const rel of riskyFiles) {
  const abs = path.join(repoRoot, rel);
  if (fs.existsSync(abs)) {
    found.push(rel);
  }
}

// Check build.files for ksef.db
const packageJsonPath = path.join(repoRoot, 'package.json');
let buildFiles = [];
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  buildFiles = Array.isArray(pkg?.build?.files) ? pkg.build.files : [];
} catch (err) {
  console.error('ERROR: Could not read package.json:', err.message);
  process.exit(2);
}

const bundledDb = buildFiles.filter((f) => typeof f === 'string' && f.toLowerCase().includes('ksef.db'));

if (found.length > 0) {
  console.error('ERROR: Risky files present in repo (PII/debug/db):');
  for (const f of found) console.error(`  - ${f}`);
}

if (bundledDb.length > 0) {
  console.error('ERROR: package.json build.files includes ksef.db:');
  for (const f of bundledDb) console.error(`  - ${f}`);
  console.error('Remove it from build.files before release.');
}

if (found.length > 0 || bundledDb.length > 0) {
  process.exit(1);
}

console.log('OK: No risky debug/db files found, and ksef.db not bundled.');
