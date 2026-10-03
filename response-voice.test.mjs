import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// On another machine: npm install --no-save jiti, or set JITI_PATH to host jiti.
const { createJiti } = require(process.env.JITI_PATH || 'jiti');
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { default: factory, speechText, finalAssistantText, backend } = await jiti.import('./response-voice.ts');
const handlers = new Map();
let command;
const spoken = [];
let cancelled = 0;
const ctx = { mode: 'tui', hasUI: true, ui: { notify() {}, setStatus() {} } };
factory({ on(name, fn) { handlers.set(name, fn); }, registerCommand(name, options) { assert.equal(name, 'response-voice'); command = options.handler; } },
  async (text, signal) => {
    spoken.push(text);
    await new Promise(resolve => {
      if (signal.aborted) return resolve();
      signal.addEventListener('abort', () => { cancelled++; resolve(); }, { once: true });
    });
  });
const fire = async (name, event = {}, context = ctx) => handlers.get(name)?.(event, context);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const message = text => ({ role: 'assistant', stopReason: 'stop', content: [{ type: 'thinking', thinking: 'secret' }, { type: 'text', text }] });
async function response(text, context = ctx, outcome = 'completed') {
  await fire('before_agent_start', {}, context);
  await fire('agent_end', { messages: [{ role: 'toolResult', content: [{ type: 'text', text: 'tool secret' }] }, message(text)] }, context);
  await fire('agent_before_settle', { outcome }, context);
  await fire('agent_settled', {}, context);
  await tick();
}
assert.equal(finalAssistantText([message('中文回复')]), '中文回复');
assert.equal(finalAssistantText([{ ...message('partial'), stopReason: 'aborted' }]), '');
assert.equal(finalAssistantText([{ ...message('intermediate'), stopReason: 'toolUse' }]), '');
assert.equal(speechText('# 你好 **世界**\n[说明](https://example.com)\n```js\nsecret\n```'), '你好 世界\n说明\n（代码略。）');
assert.equal(backend('darwin').args[1], 'Tingting');
assert(backend('win32').args.includes('-EncodedCommand'));
assert.equal(backend('linux').command, 'espeak-ng');
await fire('session_start');
await response('默认不要播放'); assert.equal(spoken.length, 0);
await command('on', ctx);
await response('第一条'); assert.deepEqual(spoken, ['第一条']);
await fire('agent_settled'); await tick(); assert.equal(spoken.length, 1);
await response('第二条'); assert.equal(cancelled, 1); assert.equal(spoken.at(-1), '第二条');
await command('off', ctx); await tick(); assert.equal(cancelled, 2);
await response('关闭不播放'); assert.equal(spoken.length, 2);
await command('test', ctx); await tick(); assert.equal(spoken.length, 3);
await command('stop', ctx); await tick();
await response('test 不打开自动播放'); assert.equal(spoken.length, 3);
await command('on', ctx);
await response('不在 RPC 播放', { ...ctx, mode: 'rpc' }); assert.equal(spoken.length, 3);
await response('错误不播放', ctx, 'error'); assert.equal(spoken.length, 3);
await fire('session_start');
await response('新会话重新默认关闭'); assert.equal(spoken.length, 3);
await fire('session_shutdown');
console.log('PASS: default OFF, manual ON/OFF, Chinese backends, final text only, Markdown cleanup, cancellation, one-time consumption, test does not enable, RPC suppression, failure suppression, session reset.');
