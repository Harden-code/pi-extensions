#!/usr/bin/env node
// Only configures the browser package; never prints unrelated settings or credentials.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(root, 'vendor', 'pi-agent-browser-native');
const agentDir = process.env.PI_CODING_AGENT_DIR
  ? path.resolve(process.env.PI_CODING_AGENT_DIR.replace(/^~(?=$|\/)/, os.homedir()))
  : path.join(os.homedir(), '.pi', 'agent');
const settingsPath = path.join(agentDir, 'settings.json');
const apply = process.argv.includes('--apply');
const original = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : null;
const settings = original === null ? {} : JSON.parse(original);
if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
  throw new Error('settings.json must contain a JSON object; no changes made.');
}
if (settings.packages !== undefined && !Array.isArray(settings.packages)) {
  throw new Error('settings.packages must be an array; no changes made.');
}
const packages = settings.packages ?? [];
function isBrowserPackage(item) {
  const source = typeof item === 'string' ? item : item?.source;
  if (typeof source !== 'string') return false;
  if (/^npm:pi-agent-browser-native(?:@|$)/.test(source)) return true;
  if (source.includes('github.com/fitchmultz/pi-agent-browser-native')) return true;
  const local = source.startsWith('~') ? source.replace(/^~/, os.homedir()) : source;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(agentDir, local), 'package.json'), 'utf8'));
    return manifest.name === 'pi-agent-browser-native';
  } catch { return false; }
}
const existing = packages.filter(isBrowserPackage);
if (existing.length) {
  console.log(`Detected ${existing.length} existing browser package source(s). Configuration unchanged to avoid duplicate tools.`);
  console.log('If tools are disabled by resource filters, CLI flags, or extensions exclusions, inspect those settings manually.');
  if (existing.length > 1) process.exitCode = 1;
} else {
  console.log(`Settings: ${settingsPath}`);
  console.log(`Local browser package: ${vendor}`);
  if (!fs.existsSync(path.join(vendor, 'dist', 'extensions', 'agent-browser', 'index.js'))) {
    throw new Error('Local vendor entry missing; no changes made.');
  }
  if (!apply) {
    console.log('Dry run only. Run node configure.mjs --apply to append the local package.');
  } else {
    fs.mkdirSync(agentDir, { recursive: true });
    if (original !== null) {
      const backup = `${settingsPath}.browser-backup-${Date.now()}`;
      fs.writeFileSync(backup, original, { mode: 0o600, flag: 'wx' });
      console.log(`Backup saved: ${backup}`);
    }
    settings.packages = [...packages, vendor];
    const temp = `${settingsPath}.browser-tmp-${process.pid}`;
    try {
      fs.writeFileSync(temp, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, settingsPath);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    console.log('Browser package configured. Fully quit and restart Pi.');
  }
}
