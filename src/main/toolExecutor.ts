import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { ToolCall } from './toolParser.js';
import { applyUnifiedDiff } from './agents/patchEngine.js';

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber: number;
  content: string;
}

export interface ToolResult {
  success: boolean;
  path?: string;
  content?: string;
  files?: string[];
  entries?: { name: string; type: 'file' | 'directory' }[];
  matches?: { file: string; line: number; text: string }[];
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: string;
  diff?: DiffLine[];
  oldContent?: string;
  status?: string;
  branch?: string;
  commits?: { hash: string; message: string; author: string; date: string }[];
  dependencies?: Record<string, string>;
  tools?: { name: string; description: string }[];
  platform?: string;
  arch?: string;
  nodeVersion?: string;
  workspaceRoot?: string;
  name?: string;
  version?: string;
  description?: string;
  scripts?: string[];
  gitBranch?: string;
}

/** Resolve a path relative to workspace root */
function resolvePath(rawPath: string, workspaceRoot: string): string {
  const isAbsolute = path.isAbsolute(rawPath) || rawPath.startsWith('/');
  return isAbsolute ? rawPath : path.join(workspaceRoot, rawPath);
}

/** Check if path is within workspace (security) */
function isPathSafe(resolvedPath: string, workspaceRoot: string): boolean {
  if (!workspaceRoot) return true;
  try {
    const realRoot = path.resolve(workspaceRoot);
    const realPath = path.resolve(resolvedPath);
    return realPath.startsWith(realRoot + path.sep) || realPath === realRoot;
  } catch {
    return false;
  }
}

/**
 * Compute a line-level diff between two strings using LCS.
 * Falls back to a simple range diff for very large files.
 */
const MAX_DIFF_LINES = 2000;

export function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
    return simpleRangeDiff(oldLines, newLines);
  }
  return lcsDiff(oldLines, newLines);
}

function lcsDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? lcs[i - 1][j - 1] + 1
        : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  const temp: DiffLine[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: 'context', lineNumber: i, content: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      temp.push({ type: 'added', lineNumber: j, content: newLines[j - 1] });
      j--;
    } else {
      temp.push({ type: 'removed', lineNumber: i, content: oldLines[i - 1] });
      i--;
    }
  }

  result.push(...temp.reverse());
  return result;
}

function simpleRangeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let start = 0;
  const minLen = Math.min(oldLines.length, newLines.length);

  while (start < minLen && oldLines[start] === newLines[start]) {
    result.push({ type: 'context', lineNumber: start + 1, content: oldLines[start] });
    start++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  for (let i = start; i <= oldEnd; i++) {
    result.push({ type: 'removed', lineNumber: i + 1, content: oldLines[i] });
  }
  for (let i = start; i <= newEnd; i++) {
    result.push({ type: 'added', lineNumber: i + 1, content: newLines[i] });
  }

  for (let i = oldEnd + 1; i < oldLines.length; i++) {
    result.push({ type: 'context', lineNumber: i + 1, content: oldLines[i] });
  }
  for (let i = newEnd + 1; i < newLines.length; i++) {
    result.push({ type: 'context', lineNumber: i + 1, content: newLines[i] });
  }

  return result;
}

/** Recursively list files in a directory */
function listFilesRecursive(dir: string, maxDepth: number = 5, currentDepth: number = 0): string[] {
  if (currentDepth >= maxDepth) return [];
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__') {
          results.push(...listFilesRecursive(fullPath, maxDepth, currentDepth + 1));
        }
      } else {
        results.push(fullPath);
      }
    }
  } catch {}

  return results;
}

/** Search for content in files */
function searchContent(dir: string, query: string, maxResults: number = 50): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];
  const files = listFilesRecursive(dir);

  for (const file of files) {
    if (results.length >= maxResults) break;
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(query)) {
          results.push({ file, line: i + 1, text: lines[i].trim() });
          if (results.length >= maxResults) break;
        }
      }
    } catch {}
  }

  return results;
}

/** Run a shell command and return result */
function runCommand(command: string, cwd: string, timeout: number = 30000): Promise<ToolResult> {
  return new Promise(resolve => {
    const isWin = process.platform === 'win32';
    const proc = spawn(isWin ? 'cmd' : 'bash', [isWin ? '/c' : '-c', command], {
      cwd,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' } as Record<string, string>,
    });

    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: true, stdout, stderr, exitCode: null, error: 'Timed out' });
    }, timeout);

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: true, stdout, stderr, exitCode: code });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}

export async function executeTool(call: ToolCall, workspaceRoot: string): Promise<ToolResult> {
  const args = call.arguments;
  const tool = call.tool;

  // ==================== FILE OPERATIONS ====================

  if (tool === 'write_file') {
    const rawPath = args.path as string | undefined;
    const content = args.content as string | undefined;
    if (!rawPath || typeof content !== 'string') {
      return { success: false, error: 'write_file missing "path" or "content"' };
    }
    if (/^__[^/]+__$/.test(rawPath)) {
      return { success: false, error: `Cannot write to reserved virtual path "${rawPath}"` };
    }
    const resolvedPath = resolvePath(rawPath, workspaceRoot);
    if (!isPathSafe(resolvedPath, workspaceRoot)) {
      return { success: false, error: 'Path is outside workspace' };
    }

    let oldContent = '';
    let diff: DiffLine[] | undefined;
    if (fs.existsSync(resolvedPath)) {
      oldContent = fs.readFileSync(resolvedPath, 'utf-8');
      diff = computeDiff(oldContent, content);
    }

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(resolvedPath, content, 'utf-8');
    return { success: true, path: resolvedPath, diff, oldContent };
  }

  if (tool === 'read_file') {
    const rawPath = args.path as string | undefined;
    if (!rawPath) return { success: false, error: 'read_file missing "path"' };
    const resolvedPath = resolvePath(rawPath, workspaceRoot);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${rawPath}` };
    }
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return { success: true, path: resolvedPath, content };
  }

  if (tool === 'edit_file') {
    const rawPath = args.path as string | undefined;
    const oldText = args.oldString as string | undefined;
    const newText = args.newString as string | undefined;
    if (!rawPath || oldText === undefined || newText === undefined) {
      return { success: false, error: 'edit_file requires "path", "oldString", and "newString"' };
    }
    const resolvedPath = resolvePath(rawPath, workspaceRoot);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${rawPath}` };
    }
    const oldContent = fs.readFileSync(resolvedPath, 'utf-8');
    if (!oldContent.includes(oldText)) {
      return { success: false, error: 'oldString not found in file' };
    }
    const newContent = oldContent.replace(oldText, newText);
    const diff = computeDiff(oldContent, newContent);
    await fs.promises.writeFile(resolvedPath, newContent, 'utf-8');
    return { success: true, path: resolvedPath, diff, oldContent };
  }

  if (tool === 'apply_patch') {
    const rawPath = args.path as string | undefined;
    const diffText = (args.diff as string | undefined) || (args.patch as string | undefined);
    if (!rawPath || !diffText) {
      return { success: false, error: 'apply_patch requires "path" and "diff"' };
    }
    const resolvedPath = resolvePath(rawPath, workspaceRoot);
    if (!isPathSafe(resolvedPath, workspaceRoot)) {
      return { success: false, error: 'Path is outside workspace' };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${rawPath}` };
    }
    const oldContent = fs.readFileSync(resolvedPath, 'utf-8');
    const patchResult = applyUnifiedDiff(oldContent, diffText);
    if (!patchResult.success) {
      return { success: false, error: patchResult.error, stdout: `Applied ${patchResult.hunksApplied}/${patchResult.hunksTotal} hunks` };
    }
    const diff = computeDiff(oldContent, patchResult.content);
    await fs.promises.writeFile(resolvedPath, patchResult.content, 'utf-8');
    return { success: true, path: resolvedPath, diff, oldContent, status: `applied ${patchResult.hunksApplied}/${patchResult.hunksTotal} hunks` };
  }

  if (tool === 'delete_file') {
    const rawPath = args.path as string | undefined;
    if (!rawPath) return { success: false, error: 'delete_file missing "path"' };
    const resolvedPath = resolvePath(rawPath, workspaceRoot);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${rawPath}` };
    }
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      fs.rmSync(resolvedPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolvedPath);
    }
    return { success: true, path: resolvedPath };
  }

  if (tool === 'list_files') {
    const rawPath = (args.path as string) || '.';
    const maxDepth = (args.maxDepth as number) || 3;
    const resolvedPath = resolvePath(rawPath, workspaceRoot);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${rawPath}` };
    }

    const entries: { name: string; type: 'file' | 'directory' }[] = [];
    try {
      const dirEntries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          entries.push({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
          });
        }
      }
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    return { success: true, path: resolvedPath, entries };
  }

  if (tool === 'search_files') {
    const pattern = args.pattern as string || '';
    const rawPath = (args.path as string) || '.';
    const resolvedPath = resolvePath(rawPath, workspaceRoot);

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${rawPath}` };
    }

    const allFiles = listFilesRecursive(resolvedPath);
    const regex = new RegExp(pattern, 'i');
    const matches = allFiles.filter(f => regex.test(path.basename(f))).slice(0, 100);

    return { success: true, files: matches };
  }

  if (tool === 'search_content') {
    const query = args.query as string || '';
    const rawPath = (args.path as string) || '.';
    const resolvedPath = resolvePath(rawPath, workspaceRoot);

    if (!query) return { success: false, error: 'search_content missing "query"' };
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${rawPath}` };
    }

    const matches = searchContent(resolvedPath, query);
    return { success: true, matches };
  }

  // ==================== TERMINAL OPERATIONS ====================

  if (tool === 'run_code') {
    const command = args.command as string | undefined;
    if (!command) return { success: false, error: 'run_code missing "command"' };
    return runCommand(command, workspaceRoot);
  }

  if (tool === 'read_terminal') {
    // Handled by renderer via IPC
    return { success: true };
  }

  // ==================== GIT OPERATIONS ====================

  if (tool === 'git_status') {
    const result = await runCommand('git status --porcelain', workspaceRoot);
    if (!result.success) return result;
    return { success: true, status: result.stdout || 'clean' };
  }

  if (tool === 'git_diff') {
    const file = args.file as string | undefined;
    const cmd = file ? `git diff ${file}` : 'git diff';
    const result = await runCommand(cmd, workspaceRoot);
    return { success: true, content: result.stdout || '(no changes)' };
  }

  if (tool === 'git_commit') {
    const message = args.message as string | undefined;
    if (!message) return { success: false, error: 'git_commit missing "message"' };
    await runCommand('git add -A', workspaceRoot);
    return await runCommand(`git commit -m "${message.replace(/"/g, '\\"')}"`, workspaceRoot);
  }

  if (tool === 'git_log') {
    const count = (args.count as number) || 10;
    const result = await runCommand(`git log --oneline -${count}`, workspaceRoot);
    if (!result.success) return result;

    const commits = (result.stdout || '').split('\n').filter(Boolean).map(line => {
      const [hash, ...rest] = line.split(' ');
      return { hash, message: rest.join(' '), author: '', date: '' };
    });

    return { success: true, commits };
  }

  // ==================== CODE OPERATIONS ====================

  if (tool === 'lint_code') {
    const file = args.file as string | undefined;
    const cmd = file ? `npx eslint ${file} 2>&1 || true` : 'npx eslint . 2>&1 || true';
    const result = await runCommand(cmd, workspaceRoot, 60000);
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  }

  if (tool === 'format_code') {
    const file = args.path as string | undefined;
    if (!file) return { success: false, error: 'format_code missing "path"' };
    const cmd = `npx prettier --write ${file}`;
    const result = await runCommand(cmd, workspaceRoot, 30000);
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  }

  if (tool === 'type_check') {
    const cmd = fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))
      ? 'npx tsc --noEmit 2>&1'
      : 'echo "No tsconfig.json found"';
    const result = await runCommand(cmd, workspaceRoot, 60000);
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  }

  if (tool === 'run_tests') {
    const pattern = args.pattern as string | undefined;
    let cmd = '';
    if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8'));
      if (pkg.scripts?.test) {
        cmd = pattern ? `npm test -- --testPathPattern=${pattern}` : 'npm test';
      } else {
        cmd = 'npx jest 2>&1 || npx vitest run 2>&1 || echo "No test runner found"';
      }
    } else {
      cmd = 'npx jest 2>&1 || npx vitest run 2>&1 || echo "No test runner found"';
    }
    const result = await runCommand(cmd, workspaceRoot, 120000);
    return { success: true, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  if (tool === 'build_project') {
    let cmd = '';
    if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8'));
      if (pkg.scripts?.build) {
        cmd = 'npm run build';
      } else if (pkg.scripts?.compile) {
        cmd = 'npm run compile';
      }
    } else if (fs.existsSync(path.join(workspaceRoot, 'Makefile'))) {
      cmd = 'make';
    } else if (fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) {
      cmd = 'cargo build';
    } else if (fs.existsSync(path.join(workspaceRoot, 'go.mod'))) {
      cmd = 'go build ./...';
    } else if (fs.existsSync(path.join(workspaceRoot, 'setup.py')) || fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) {
      cmd = 'python -m build 2>&1 || echo "No build command available"';
    } else {
      return { success: false, error: 'No build system detected' };
    }
    const result = await runCommand(cmd, workspaceRoot, 120000);
    return { success: true, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  // ==================== PROJECT INFO ====================

  if (tool === 'list_dependencies') {
    const deps: Record<string, string> = {};
    if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8'));
      Object.assign(deps, pkg.dependencies || {}, pkg.devDependencies || {});
    }
    return { success: true, dependencies: deps };
  }

  if (tool === 'get_project_info') {
    const info: Record<string, any> = {};
    if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8'));
      info.name = pkg.name;
      info.version = pkg.version;
      info.description = pkg.description;
      info.scripts = Object.keys(pkg.scripts || {});
    }
    if (fs.existsSync(path.join(workspaceRoot, '.git'))) {
      const branch = await runCommand('git branch --show-current', workspaceRoot);
      info.gitBranch = branch.stdout?.trim();
    }
    return { success: true, ...info };
  }

  // ==================== SYSTEM INFO ====================

  if (tool === 'get_system_info') {
    return {
      success: true,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      workspaceRoot,
    };
  }

  return { success: false, error: `Unknown tool: ${tool}` };
}
