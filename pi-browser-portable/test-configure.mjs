import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-browser-config-test-'));
function invoke(dir, apply = true) {
  const r = spawnSync(process.execPath, [path.join(root, 'configure.mjs'), ...(apply ? ['--apply'] : [])], {
    env: { ...process.env, PI_CODING_AGENT_DIR: dir }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
}
try {
  const dir = path.join(temp, 'agent');
  fs.mkdirSync(dir);
  const file = path.join(dir, 'settings.json');
  const original = { defaultProvider: 'keep-me', packages: ['npm:other-package'] };
  fs.writeFileSync(file, JSON.stringify(original));
  invoke(dir, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original);
  invoke(dir);
  const updated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(updated.defaultProvider, 'keep-me');
  assert.equal(updated.packages.length, 2);
  assert.equal(updated.packages[0], 'npm:other-package');
  assert(fs.readdirSync(dir).some(x => x.includes('.browser-backup-')));
  invoke(dir);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).packages.length, 2);
  fs.writeFileSync(file, JSON.stringify({ packages: ['npm:pi-agent-browser-native@0.7.1'] }));
  invoke(dir);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).packages.length, 1);
  console.log('PASS: dry-run, preservation, backup, idempotence, existing npm source detection.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
