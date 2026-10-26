#!/usr/bin/env node
/**
 * Copies the CommonJS preload bundle into dist.
 *
 * The build used to shell out to `cp`, which does not exist on Windows CI
 * runners. Electron sandboxing requires a .cjs preload, and `tsc` does not
 * copy it, so this runs as part of `npm run build:electron`.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const from = path.join(root, 'src', 'main', 'preload.cjs');
const to = path.join(root, 'dist', 'main', 'preload.cjs');

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`Copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
