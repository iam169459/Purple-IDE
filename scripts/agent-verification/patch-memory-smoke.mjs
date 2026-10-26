/**
 * Smoke tests for the agent patch engine + memory manager.
 * Run: node scripts/agent-verification/patch-memory-smoke.mjs  (after npm run build)
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const dist = path.resolve(import.meta.dirname, '../../dist/main/agents');

// ---------- patchEngine ----------
const { applyUnifiedDiff, createUnifiedDiff, extractPatch } = await import(`${dist}/patchEngine.js`);

const original = `function greet(name) {
  console.log("hello", name);
  return name;
}

function farewell(name) {
  console.log("bye", name);
  return name;
}
`;

// Exact-context patch
const diff1 = `@@ -1,4 +1,4 @@
 function greet(name) {
-  console.log("hello", name);
+  console.log("hi", name);
   return name;
 }
`;
const r1 = applyUnifiedDiff(original, diff1);
assert.ok(r1.success, `exact patch failed: ${r1.error}`);
assert.ok(r1.content.includes('"hi"'), 'replacement missing');
assert.equal(r1.hunksApplied, 1);

// Round-trip: createUnifiedDiff then applyUnifiedDiff
const modified = original.replace('return name;\n}\n\nfunction farewell', 'return name.toUpperCase();\n}\n\nfunction farewell');
const gen = createUnifiedDiff(original, modified);
const r2 = applyUnifiedDiff(original, gen);
assert.ok(r2.success, `round-trip failed: ${r2.error} | diff:\n${gen}`);
assert.equal(r2.content, modified, 'round-trip content mismatch');

// Fuzzy match (patch start line off by a few)
const fuzzy = `@@ -10,2 +10,2 @@
-  console.log("bye", name);
+  console.log("goodbye", name);
`;
const r3 = applyUnifiedDiff(original, fuzzy);
assert.ok(r3.success, `fuzzy patch failed: ${r3.error}`);
assert.ok(r3.content.includes('"goodbye"'));

// Fenced extraction
assert.ok(extractPatch('Here is my patch:\n```diff\n@@ -1,1 +1,1 @@\n-a\n+b\n```\ndone'));
assert.equal(extractPatch('no patch here'), null);

// Insert-only patch (no context lines)
const insert = `@@ -3,0 +4,2 @@
+// inserted line 1
+// inserted line 2
`;
const r4 = applyUnifiedDiff(original, insert);
assert.ok(r4.success, `insert failed: ${r4.error}`);
assert.ok(r4.content.includes('// inserted line 1'));

console.log('patchEngine: PASS');

// ---------- memoryManager ----------
const { memoryManager } = await import(`${dist}/memoryManager.js`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'purple-agent-'));
memoryManager.setWorkspace(tmp);
const memFile = path.join(tmp, '.agent', 'memory.md');
assert.ok(fs.existsSync(memFile), 'memory.md not created');

memoryManager.updateArchitecture('Stack: React + Vite + TS');
memoryManager.updateEndpoints('POST /api/users — create user\nGET /api/users/:id');
memoryManager.updateTaskQueue([
  { id: 'task-1', role: 'frontend', description: 'Build login form', status: 'done' },
  { id: 'task-2', role: 'backend', description: 'Add auth route', status: 'running' },
]);
memoryManager.addGotcha('\x1B[31mError: ECONNREFUSED\x1B[0m at /src/db.ts:12', 'Restart postgres container');

const mem = fs.readFileSync(memFile, 'utf-8');
assert.ok(mem.includes('## Active Architecture'), 'arch section');
assert.ok(mem.includes('Stack: React + Vite + TS'), 'arch content');
assert.ok(mem.includes('POST /api/users'), 'endpoints content');
assert.ok(mem.includes('- [x] **frontend**'), 'task queue done checkbox');
assert.ok(mem.includes('- [~] **backend**'), 'task queue running checkbox');
assert.ok(!mem.includes('\x1B['), 'ANSI leaked into memory');
assert.ok(mem.includes('ECONNREFUSED'), 'gotcha content');

memoryManager.updateArchitecture('Stack: React + Vite + TS + Electron');
const mem2 = fs.readFileSync(memFile, 'utf-8');
assert.equal((mem2.match(/## Active Architecture/g) || []).length, 1, 'section duplicated');

const pruned = memoryManager.pruneAndSummarize('\x1B[32mOK\x1B[0m\n\n\n\n' + 'x'.repeat(100000), 100);
assert.ok(!pruned.includes('\x1B['));
assert.ok(pruned.length < 1000, 'pruning did not cap size');

const compacted = await memoryManager.maybeCompact();
assert.equal(compacted, false, 'compacted below threshold');

console.log('memoryManager: PASS');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('PATCH+MEMORY SMOKE: ALL PASS');
