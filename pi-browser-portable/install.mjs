#!/usr/bin/env node
// Portable installer: dry-run by default. Does not replace working browser binaries.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');
const installBrowser = process.argv.includes('--install-agent-browser');
const download = process.argv.includes('--download-browser');
const linuxDeps = process.argv.includes('--with-deps');
const vendor = path.join(root, 'vendor', 'pi-agent-browser-native');
const version = process.versions.node.split('.').map(Number);
if (version[0] < 22 || (version[0] === 22 && version[1] < 19)) {
  throw new Error('Node.js >= 22.19.0 is required.');
}
function run(command, args, cwd = root) {
  console.log(`> ${command} ${args.map(a => JSON.stringify(a)).join(' ')}`);
  if (!apply) return;
  const result = spawnSync(command, args, {
    cwd, stdio: 'inherit',
    // npm.cmd on Windows needs cmd.exe. All arguments here are fixed installer values.
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
if (!apply) console.log('DRY RUN: no dependencies, browser downloads, or settings changes.');
console.log('Pi must already be installed (>= 0.87.0).');
run('pi', ['--version']);
// Runtime third-party dependencies only. Host Pi supplies the wildcard peers.
run('npm', ['install', '--omit=dev', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'], vendor);
if (installBrowser) run('npm', ['install', '-g', 'agent-browser@0.38.1']);
if (download) {
  run('agent-browser', linuxDeps ? ['install', '--with-deps'] : ['install']);
} else if (linuxDeps) {
  throw new Error('--with-deps requires --download-browser; Linux system dependencies may need elevated permissions.');
}
run(process.execPath, [path.join(root, 'configure.mjs'), ...(apply ? ['--apply'] : [])]);
run(process.execPath, [path.join(vendor, 'scripts', 'doctor.mjs')]);
console.log(apply
  ? 'Done. Fully quit and restart Pi; then perform the browser smoke test from README.md.'
  : 'Add --apply to execute. Optional: --install-agent-browser --download-browser (Linux: --with-deps).');
