/**
 * Failover tests for the model router (simulated 429 / 503 / ECONNREFUSED / abort).
 * Run: node --import scripts/agent-verification/register-stub.mjs scripts/agent-verification/router-failover.mjs
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'purple-router-'));
process.env.PURPLE_TEST_USERDATA = tmp;

const require = createRequire(import.meta.url);
const dist = path.resolve(import.meta.dirname, '../../dist/main/agents');
const { modelRouter } = await import(`${dist}/modelRouter.js`);

const originalFetch = globalThis.fetch;
let calls = [];

function sseResponse(chunks) {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

// ---- Test 1: 429 on gemini -> failover to groq (non-streaming) ----
modelRouter.setKey('gemini', 'test-gemini-key');
modelRouter.setKey('groq', 'test-groq-key');

globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(init.body) });
  if (calls.length === 1) {
    return new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });
  }
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'from-groq' } }],
    model: 'llama-3.3-70b-versatile',
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  }), { status: 200 });
};

const r1 = await modelRouter.chat([{ role: 'user', content: 'hello' }], { temperature: 0.2 });
assert.equal(r1.content, 'from-groq', `expected from-groq, got ${r1.content}`);
assert.equal(r1.provider, 'groq');
assert.ok(calls[0].url.includes('generativelanguage.googleapis.com'), 'first call should hit gemini');
assert.ok(calls[1].url.includes('api.groq.com'), 'second call should hit groq');
assert.equal(modelRouter.isAvailable('gemini'), false, 'gemini should be cooling down after 429');
console.log('Test 1 (429 failover, non-stream): PASS');

// ---- Test 2: 429 mid-stream -> failover, stream completes on next provider ----
calls = [];
const internal = modelRouter;
internal['cooldowns'].delete('gemini');

globalThis.fetch = async (url, init) => {
  calls.push(String(url));
  if (!JSON.parse(init.body).stream) {
    return new Response(JSON.stringify({ error: { message: 'rl' } }), { status: 429 });
  }
  if (calls.length === 1) {
    return new Response(JSON.stringify({ error: { message: 'rl' } }), { status: 429 });
  }
  return sseResponse([
    'data: {"choices":[{"delta":{"content":"he"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);
};

let deltas = [];
const r2 = await modelRouter.chatStream(
  [{ role: 'user', content: 'hi' }],
  { temperature: 0.2 },
  { onDelta: (d) => deltas.push(d) }
);
assert.equal(r2.content, 'hello', `stream content: ${r2.content}`);
assert.deepEqual(deltas, ['he', 'llo']);
assert.equal(r2.provider, 'groq');
console.log('Test 2 (429 failover, streaming): PASS');

// ---- Test 3: connection refused -> failover ----
calls = [];
internal['cooldowns'].delete('gemini');
internal['cooldowns'].delete('groq');

globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).includes('groq')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'from-openrouter' } }] }), { status: 200 });
  }
  const err = new TypeError('fetch failed');
  err.cause = { code: 'ECONNREFUSED' };
  throw err;
};

const r3 = await modelRouter.chat([{ role: 'user', content: 'x' }], {});
assert.ok(['from-openrouter', 'from-ollama'].includes(r3.content), `got ${r3.content}`);
assert.notEqual(r3.provider, 'gemini', 'should not have stayed on gemini');
console.log('Test 3 (ECONNREFUSED failover): PASS');

// ---- Test 4: total outage -> clear error ----
calls = [];
for (const id of ['gemini', 'groq', 'openrouter', 'ollama']) internal['cooldowns'].delete(id);
modelRouter.setKey('openrouter', 'test-or-key');

globalThis.fetch = async () => {
  const err = new TypeError('fetch failed');
  err.cause = { code: 'ECONNREFUSED' };
  throw err;
};

await assert.rejects(
  () => modelRouter.chat([{ role: 'user', content: 'x' }], {}),
  /All providers failed/
);
console.log('Test 4 (total outage raises clear error): PASS');

// ---- Test 5: abort propagation ----
for (const id of ['gemini', 'groq', 'openrouter', 'ollama']) internal['cooldowns'].delete(id);
globalThis.fetch = async (url, init) => {
  return new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
};
const ac = new AbortController();
setTimeout(() => ac.abort(), 30);
await assert.rejects(
  () => modelRouter.chat([{ role: 'user', content: 'x' }], { signal: ac.signal }),
  (err) => err.name === 'AbortError' || /abort/i.test(err.message)
);
console.log('Test 5 (abort propagation): PASS');

globalThis.fetch = originalFetch;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ROUTER FAILOVER: ALL PASS');
