/**
 * Minimal unified-diff engine: parse LLM-produced `diff` blocks and apply them
 * with tolerant hunk matching (exact context -> trimmed context -> line anchor).
 */

export interface PatchHunk {
  oldStart: number;
  oldLines: string[];
  newLines: string[];
}

export interface PatchResult {
  success: boolean;
  content: string;
  hunksApplied: number;
  hunksTotal: number;
  error?: string;
}

/** Extract the first unified diff from an LLM response (```diff fences or raw @@ blocks). */
export function extractPatch(response: string): string | null {
  const fenced = response.match(/```(?:diff|patch)\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  if (/^@@ -\d+/.test(response.trim())) return response.trim();
  const tagged = response.match(/<patch>\s*\n([\s\S]*?)\n<\/patch>/);
  if (tagged) return tagged[1].trim();
  return null;
}

export function parseUnifiedDiff(diffText: string): PatchHunk[] {
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  const hunks: PatchHunk[] = [];
  let current: PatchHunk | null = null;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (current) hunks.push(current);
      current = { oldStart: parseInt(hunkMatch[1], 10), oldLines: [], newLines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ')) continue;
    if (line === '') continue; // blank lines are noise (true empty context is " " prefixed)
    if (line.startsWith('-')) {
      current.oldLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      current.newLines.push(line.slice(1));
    } else if (line.startsWith(' ')) {
      current.oldLines.push(line.slice(1));
      current.newLines.push(line.slice(1));
    }
    // Ignore '\ No newline at end of file' and anything else
  }
  if (current) hunks.push(current);
  return hunks;
}

function findHunkPosition(fileLines: string[], hunk: PatchHunk, offset: number): number {
  const ctx = hunk.oldLines;
  if (ctx.length === 0) {
    return Math.max(0, Math.min(hunk.oldStart - 1 + offset, fileLines.length));
  }

  const starts = [hunk.oldStart - 1 + offset];
  // Fuzz: try nearby positions before/after the declared start
  for (let d = 1; d <= 20; d++) {
    starts.push(hunk.oldStart - 1 + offset + d);
    starts.push(hunk.oldStart - 1 + offset - d);
  }

  for (const tolerance of [0, 1]) {
    for (const start of starts) {
      if (start < 0 || start + ctx.length > fileLines.length) continue;
      let matched = true;
      for (let i = 0; i < ctx.length; i++) {
        const expected = ctx[i];
        const actual = fileLines[start + i];
        const ok = tolerance === 0
          ? expected === actual
          : expected.trim() === actual.trim();
        if (!ok) { matched = false; break; }
      }
      if (matched) return start;
    }
  }
  return -1;
}

/** Apply a unified diff to content. Returns the patched content. */
export function applyUnifiedDiff(original: string, diffText: string): PatchResult {
  const hunks = parseUnifiedDiff(diffText);
  if (hunks.length === 0) {
    return { success: false, content: original, hunksApplied: 0, hunksTotal: 0, error: 'No valid hunks in patch' };
  }

  const fileLines = original.replace(/\r\n/g, '\n').split('\n');
  let offset = 0;
  let applied = 0;
  const trailingNewline = original.endsWith('\n');
  if (trailingNewline && fileLines[fileLines.length - 1] === '') fileLines.pop();

  for (const hunk of hunks) {
    const pos = findHunkPosition(fileLines, hunk, offset);
    if (pos === -1) {
      return {
        success: false,
        content: original,
        hunksApplied: applied,
        hunksTotal: hunks.length,
        error: `Hunk at line ${hunk.oldStart} could not be applied (context mismatch)`,
      };
    }
    fileLines.splice(pos, hunk.oldLines.length, ...hunk.newLines);
    offset += hunk.newLines.length - hunk.oldLines.length;
    applied++;
  }

  let content = fileLines.join('\n');
  if (trailingNewline || content === '') content += '\n';
  return { success: true, content, hunksApplied: applied, hunksTotal: hunks.length };
}

/** Generate a standard unified diff between two strings (for display / re-apply). */
export function createUnifiedDiff(oldContent: string, newContent: string, contextLines = 3): string {
  const a = oldContent.replace(/\r\n/g, '\n').split('\n');
  const b = newContent.replace(/\r\n/g, '\n').split('\n');

  // LCS diff
  const m = a.length, n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] = a[i - 1] === b[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }
  const ops: Array<{ type: 'same' | 'del' | 'add'; line: string; aLine: number; bLine: number }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'same', line: a[i - 1], aLine: i, bLine: j }); i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      ops.push({ type: 'add', line: b[j - 1], aLine: i + 1, bLine: j }); j--;
    } else {
      ops.push({ type: 'del', line: a[i - 1], aLine: i, bLine: j + 1 }); i--;
    }
  }
  ops.reverse();

  const changed = ops.map(op => op.type !== 'same');
  const isChanged = (idx: number) => {
    for (let d = -contextLines; d <= contextLines; d++) {
      const k = idx + d;
      if (k >= 0 && k < ops.length && changed[k]) return true;
    }
    return false;
  };

  const out: string[] = [];
  let idx = 0;
  while (idx < ops.length) {
    if (!isChanged(idx)) { idx++; continue; }
    const start = idx;
    while (idx < ops.length && isChanged(idx)) idx++;
    const slice = ops.slice(start, idx);
    const aStart = slice.find(op => op.type !== 'add')?.aLine ?? 1;
    const aCount = slice.filter(op => op.type !== 'add').length;
    const bStart = slice.find(op => op.type !== 'del')?.bLine ?? 1;
    const bCount = slice.filter(op => op.type !== 'del').length;
    const body = slice.map(op =>
      op.type === 'same' ? ` ${op.line}` : op.type === 'del' ? `-${op.line}` : `+${op.line}`
    ).join('\n');
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@\n${body}`);
  }
  return out.join('\n');
}
