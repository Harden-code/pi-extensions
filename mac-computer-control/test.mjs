import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { createJiti } = require(process.env.JITI_PATH || 'jiti');
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: { typebox: process.env.TYPEBOX_PATH || 'typebox' } });
const { default: factory, checkCoordinates } = await jiti.import('./index.ts');
assert.throws(() => checkCoordinates(1, 0.2)); assert.throws(() => checkCoordinates(NaN, 0.2)); checkCoordinates(0, 0.999);
const events = new Map(), tools = new Map(); let command, confirm = true, calls = [], duringConfirm;
const ctx = { mode: 'tui', hasUI: true, ui: { notify() {}, async confirm() { if (duringConfirm) await duringConfirm(); return confirm; } } };
factory({ on: (n, f) => events.set(n, f), registerCommand: (_n, d) => command = d.handler, registerTool: t => tools.set(t.name, t) },
  async (args, input) => {
    calls.push(args[0]);
    if (args[0] === 'status') return { accessibility: true, screenRecording: true };
    if (args[0] === 'capture') { await writeFile(args[1], Buffer.from('fake image')); return { frontApp: 'Test', frontPid: 1, displayId: 1, widthPoints: 100, heightPoints: 100 }; }
    assert.equal(input.action, 'click'); return { posted: true };
  });
const exec = (name, params = {}, context = ctx) => tools.get(name).execute('test', params, undefined, undefined, context);
await events.get('session_start')();
await assert.rejects(exec('mac_screen'), /默认关闭/);
await command('on', ctx);
const shot = await exec('mac_screen'); assert.equal(shot.content[1].type, 'image');
const params = { screenshotId: shot.details.screenshotId, reason: '测试点击', action: 'click', x: 0.2, y: 0.3 };
confirm = false; await assert.rejects(exec('mac_input', params), /用户拒绝/); assert(!calls.includes('action'));
confirm = true; await exec('mac_input', params); assert.equal(calls.filter(x => x === 'action').length, 1);
await assert.rejects(exec('mac_input', params), /重新截图/);
await assert.rejects(exec('mac_screen', {}, { ...ctx, mode: 'rpc' }), /TUI/);
const second = await exec('mac_screen');
duringConfirm = () => command('off', ctx);
await assert.rejects(exec('mac_input', { ...params, screenshotId: second.details.screenshotId }), /默认关闭/);
assert.equal(calls.filter(x => x === 'action').length, 1);
duringConfirm = undefined;
await command('on', ctx); await events.get('session_start')(); await assert.rejects(exec('mac_screen'), /默认关闭/);
await events.get('session_shutdown')();
console.log('PASS: default-off, coordinates, screenshot image, denial no input, single-use screenshot, RPC blocked, off during confirmation, new-session reset. No desktop input sent.');
