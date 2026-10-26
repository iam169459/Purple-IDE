/**
 * End-to-end orchestrator test: plan -> DAG -> tool loop -> file write ->
 * failure -> debugger auto-trigger -> memory sync -> approval gate (edit mode).
 * Run: node --import scripts/agent-verification/register-stub.mjs scripts/agent-verification/orchestrator-e2e.mjs
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

setTimeout(() => { console.error('WATCHDOG: test timed out'); process.exit(2); }, 45000).unref?.();

const log = (...a) => console.log('[e2e]', ...a);

const tmpUser = fs.mkdtempSync(path.join(os.tmpdir(), 'purple-user-'));
process.env.PURPLE_TEST_USERDATA = tmpUser;

const events = [];
const fakeWin = {
  webContents: { send: (ch, data) => events.push([ch, data]) },
  isDestroyed: () => false,
};

const require = createRequire(import.meta.url);
const dist = path.resolve(import.meta.dirname, '../../dist/main/agents');
const { agentOrchestrator } = await import(`${dist}/orchestrator.js`);
agentOrchestrator.setMainWindow(fakeWin);

const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'purple-ws-'));
fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));

function sse(textChunks) {
  const payload = textChunks.map(t => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join('');
  const stream = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close(); },
  });
  return new Response(stream, { status: 200 });
}

const PLANNER_DAG = JSON.stringify({
  tasks: [
    { id: 'task-1', role: 'frontend', description: 'Create src/hello.ts with a hello function', dependencies: [], expectedFiles: ['src/hello.ts'] },
    { id: 'task-2', role: 'backend', description: 'Run the project check', dependencies: ['task-1'], expectedFiles: [] },
  ],
});

let call = 0;
globalThis.fetch = async (url, init) => {
  call++;
  const body = JSON.parse(init.body);
  assert.ok(String(url).includes('/chat/completions'), `unexpected url ${url}`);
  if (!body.stream) throw new Error('expected stream=true from orchestrator');

  if (call === 1) return sse([PLANNER_DAG]);
  if (call === 2) return sse([JSON.stringify([{ tool: 'write_file', arguments: { path: 'src/hello.ts', content: 'export const hello = () => "world";\n' } }])]);
  if (call === 3) return sse(['Created src/hello.ts with the hello function.']);
  if (call === 4) return sse([JSON.stringify([{ tool: 'run_code', arguments: { command: 'node -e "console.error(\'boom: module not found\'); process.exit(1)"' } }])]);
  if (call === 5) return sse(['Checked the project; a failure was detected and handed to the debugger.']);
  if (call === 6) return sse([JSON.stringify([{ tool: 'read_file', arguments: { path: 'package.json' } }])]);
  if (call === 7) return sse(['Diagnosis complete: the failure is an intentionally missing dependency.']);
  throw new Error('unexpected fetch call #' + call);
};

const tasks = await agentOrchestrator.plan('Create a hello module and verify the project', ws);
log('planned', tasks.length, 'tasks');
assert.equal(tasks.length, 2, `planner produced ${tasks.length} tasks`);
const memAfterPlan = fs.readFileSync(path.join(ws, '.agent', 'memory.md'), 'utf-8');
assert.ok(memAfterPlan.includes('[ ] **frontend**'), 'task queue written after plan');
assert.ok(memAfterPlan.includes('Goal: Create a hello module'), 'architecture recorded');

await agentOrchestrator.execute();
log('execute finished');

assert.ok(fs.existsSync(path.join(ws, 'src/hello.ts')), 'frontend agent wrote file');
assert.ok(fs.readFileSync(path.join(ws, 'src/hello.ts'), 'utf-8').includes('export const hello'), 'file content correct');

const channels = events.map(e => e[0]);
for (const ch of ['agent:task-start', 'agent:tool-call', 'agent:tool-result', 'agent:thought-stream', 'agent:complete', 'file-written']) {
  assert.ok(channels.includes(ch), `missing event ${ch}`);
}
const toolCalls = events.filter(e => e[0] === 'agent:tool-call').map(e => e[1]);
assert.ok(toolCalls.some(t => t.tool === 'write_file' && t.agent === 'frontend'));
assert.ok(toolCalls.some(t => t.tool === 'run_code' && t.agent === 'backend'));

const allTasks = agentOrchestrator.getTasks();
const debugTask = allTasks.find(t => t.role === 'debugger');
assert.ok(debugTask, 'debugger task auto-enqueued');
assert.ok(debugTask.description.includes('exit code 1') || debugTask.description.includes('boom'),
  `debugger context missing: ${debugTask.description.slice(0, 150)}`);

const t1 = allTasks.find(t => t.id === 'task-1');
const t2 = allTasks.find(t => t.id === 'task-2');
assert.equal(t1.status, 'done', `task-1: ${t1.status}`);
assert.equal(t2.status, 'failed', `task-2: ${t2.status}`);

const mem = fs.readFileSync(path.join(ws, '.agent', 'memory.md'), 'utf-8');
assert.ok(mem.includes('boom'), 'failure captured in gotchas');
assert.ok(mem.includes('[x] **frontend**'), 'task-1 done in memory');
assert.ok(mem.includes('[!] **backend**'), 'task-2 failed in memory');

console.log('ORCHESTRATOR E2E (vibe flow): ALL PASS');

// ---- Approval gate in edit mode denies writes ----
agentOrchestrator.setMode('edit');
let gateCall = 0;
globalThis.fetch = async () => {
  gateCall++;
  if (gateCall === 1) {
    return sse([JSON.stringify([{ tool: 'write_file', arguments: { path: 'nope.txt', content: 'x' } }])]);
  }
  return sse(['Understood, the write was denied. Nothing else to do.']);
};
agentOrchestrator['tasks'] = [{
  id: 'gate-1', role: 'backend', description: 'try a write', dependencies: [], expectedFiles: [], status: 'pending',
}];
events.length = 0;
// Safety net: auto-deny any further approval requests so the suite can never hang.
const denyPoller = setInterval(() => {
  for (const e of events) {
    if (e[0] === 'agent:approval-request') agentOrchestrator.resolveApproval(e[1].requestId, false);
  }
}, 25);
const execPromise = agentOrchestrator.execute();
await execPromise;
clearInterval(denyPoller);
const gateEvents = events.filter(e => e[0] === 'agent:approval-request');
assert.ok(gateEvents.length >= 1, 'approval request emitted in edit mode');
assert.equal(gateEvents[0][1].tool, 'write_file');
assert.ok(!fs.existsSync(path.join(ws, 'nope.txt')), 'denied write must not touch disk');
const deniedPaths = events.filter(e => e[0] === 'agent:approval-response' && !e[1].approved);
assert.ok(deniedPaths.length >= 1, 'denial recorded');
console.log('APPROVAL GATE (edit mode): PASS');

fs.rmSync(ws, { recursive: true, force: true });
fs.rmSync(tmpUser, { recursive: true, force: true });
