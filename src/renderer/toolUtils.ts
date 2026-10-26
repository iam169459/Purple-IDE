/**
 * Robust tool call extraction from LLM responses.
 * Handles: raw JSON, markdown-fenced JSON, nested braces in strings,
 * conversational text before/after, multiple tool calls.
 */

export interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

/** Find matching closing brace, skipping braces inside strings */
function findMatchingBrace(text: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Strip markdown code fences */
function stripFences(text: string): string {
  return text.replace(/```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gm, '');
}

/**
 * Extract all tool calls from an LLM response.
 * Uses brace-matching (not regex) to correctly handle nested braces in content.
 */
export function extractToolCalls(text: string): ToolCall[] {
  const results: ToolCall[] = [];
  const cleaned = stripFences(text);
  const startPattern = /\{\s*"tool"\s*:\s*"/g;
  let match: RegExpExecArray | null;

  while ((match = startPattern.exec(cleaned)) !== null) {
    const objStart = match.index;
    const objEnd = findMatchingBrace(cleaned, objStart);
    if (objEnd === -1) continue;

    const jsonStr = cleaned.slice(objStart, objEnd + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object' && typeof parsed.tool === 'string' && parsed.arguments && typeof parsed.arguments === 'object') {
        results.push({ tool: parsed.tool, arguments: parsed.arguments });
      }
    } catch { /* skip invalid JSON */ }
    startPattern.lastIndex = objEnd + 1;
  }
  return results;
}

/** Extract a single tool call (first one found) */
export function extractSingleToolCall(text: string): ToolCall | null {
  const calls = extractToolCalls(text);
  return calls.length > 0 ? calls[0] : null;
}

/** Extract unique tool calls (deduplicate by tool+args hash) */
export function extractUniqueToolCalls(text: string): ToolCall[] {
  const all = extractToolCalls(text);
  const seen = new Set<string>();
  return all.filter(tc => {
    const hash = tc.tool + '::' + JSON.stringify(tc.arguments);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true });
}
