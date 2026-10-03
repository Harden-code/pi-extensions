#!/usr/bin/env node
// Copy one self-contained extension to the default user discovery directory.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, 'response-voice.ts');
const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
const target = path.resolve(agentDir, 'extensions', 'response-voice.ts');
const data = fs.readFileSync(source);
if (!process.argv.includes('--apply')) {
  console.log(`Dry run: copy ${source} → ${target}\nUse --apply to install. Existing different files are never overwritten.`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    if (!fs.readFileSync(target).equals(data)) throw new Error(`Target differs; review before replacing: ${target}`);
    console.log(`Already installed: ${target}`);
  } else {
    fs.writeFileSync(target, data, { flag: 'wx', mode: 0o600 });
    console.log(`Installed: ${target}`);
  }
  console.log('Run /reload or restart Pi. Speech remains OFF until /response-voice on.');
}
