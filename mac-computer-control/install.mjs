#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if (process.platform !== 'darwin') throw new Error('macOS only');
const root = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'), 'extensions', 'mac-computer-control');
if (!process.argv.includes('--apply')) {
  console.log(`Dry run: copy sources to ${target}, build there. Use --apply to install. No permission changes.`);
} else {
  if (existsSync(target)) throw new Error(`Target already exists; inspect before updating: ${target}`);
  mkdirSync(target, { recursive: true });
  for (const f of ['index.ts', 'native.swift', 'build.mjs', 'README.md']) cpSync(join(root, f), join(target, f));
  const r = spawnSync(process.execPath, [join(target, 'build.mjs')], { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error(`Build failed; sources retained at ${target}. Fix build before reload.`);
  console.log(`Installed: ${target}\nRestart Pi or /reload. OFF by default. Grant macOS permissions manually; see README.`);
}
