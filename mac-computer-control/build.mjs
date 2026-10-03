#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
if (process.platform !== 'darwin') throw new Error('macOS only');
mkdirSync(join(root, 'bin'), { recursive: true });
const output = join(root, 'bin', 'mac-computer-helper');
const result = spawnSync('/usr/bin/xcrun', ['swiftc', '-O', join(root, 'native.swift'), '-o', output], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error('Build failed. Install Xcode Command Line Tools: xcode-select --install');
const sign = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', 'local.pi.mac-computer-helper', output], { stdio: 'inherit' });
if (sign.error || sign.status !== 0) throw new Error('Ad-hoc signing failed');
console.log(`Built for ${process.arch}: ${output}. Rebuild on destination Mac; permissions may need reapproval after rebuilding.`);
