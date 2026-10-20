#!/usr/bin/env node
// `npm audit --audit-level=high` with documented exceptions.
//
// Run from a package directory (backend/, mobile/, ...): `node ../.github/scripts/npm-audit.mjs`.
// Fails when the dependency tree has a high or critical advisory, exactly like
// `npm audit --audit-level=high`, unless that advisory is listed in `audit-exceptions.json` next to
// package.json with a justification and an expiry date that has not passed yet:
//
//   [{ "id": "GHSA-xxxx-xxxx-xxxx", "package": "braces", "expires": "2027-01-20",
//      "reason": "Why no safe fix exists and why the risk is acceptable meanwhile." }]
//
// Without that file the script is strictly equivalent to `npm audit --audit-level=high`.
// An expired exception fails the build, so every exception is re-examined. See backend/README.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const EXCEPTIONS_FILE = 'audit-exceptions.json';

const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(run.stdout, run.stderr);
  console.error('npm audit did not return a JSON report.');
  process.exit(1);
}
if (report.error) {
  console.error('npm audit failed:', JSON.stringify(report.error));
  process.exit(1);
}

// Root advisories only: a package flagged because it depends on a vulnerable one points to it
// through a string in `via`, so every blocking finding traces back to one of these objects.
const advisories = new Map();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split('/').pop() || String(via.source);
    const entry = advisories.get(id) ?? { ...via, id, packages: new Set() };
    entry.packages.add(name);
    advisories.set(id, entry);
  }
}

const exceptions = existsSync(EXCEPTIONS_FILE) ? JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8')) : [];
const today = new Date().toISOString().slice(0, 10);
let failed = false;

for (const exception of exceptions) {
  if (!exception.id || !exception.reason || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? '')) {
    console.error(`Invalid entry in ${EXCEPTIONS_FILE} (id, reason and expires are required):`, exception);
    failed = true;
  } else if (exception.expires < today) {
    console.error(`Exception ${exception.id} (${exception.package}) expired on ${exception.expires}: re-check it.`);
    failed = true;
  } else if (!advisories.has(exception.id)) {
    console.warn(`Exception ${exception.id} (${exception.package}) no longer matches anything: remove it.`);
  }
}

for (const advisory of advisories.values()) {
  const exception = exceptions.find((e) => e.id === advisory.id && e.expires >= today);
  const line = `${advisory.severity.toUpperCase()} ${advisory.id} ${advisory.name}: ${advisory.title}`;
  if (exception) {
    console.log(`Accepted until ${exception.expires}: ${line}\n  Reason: ${exception.reason}`);
  } else {
    console.error(`${line}\n  ${advisory.url}\n  Affects: ${[...advisory.packages].join(', ')}`);
    failed = true;
  }
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ` +
    `${counts.low ?? 0} low (packages); ${advisories.size} high/critical advisories, ` +
    `${exceptions.length} documented exceptions.`,
);
if (failed) {
  console.error('Fix: update the dependency (see "Dependency alerts" in backend/README.md).');
  process.exit(1);
}
