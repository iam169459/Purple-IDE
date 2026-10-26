/**
 * Parse tool calls from an LLM response string.
 *
 * Handles:
 * - Raw JSON: {"tool":"write_file","arguments":{...}}
 * - Markdown-fenced: ```json {...} ```
 * - Conversational text before/after
 * - Multiple tool calls in one response
 * - Braces inside string values (e.g. "content": "if (x) { return; }")
 */

import type { WebContents } from 'electron';
import { executeTool } from './toolExecutor.js';

export interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * Find the index of the closing brace matching the opening brace at `openIdx`,
 * correctly skipping braces inside JSON strings.
 */
function findMatchingBrace(text: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) and
 * return only the content that looks like JSON.
 */
function stripMarkdownFences(text: string): string {
  return text.replace(/```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gm, '');
}

/**
 * Extract all tool calls from an LLM response string.
 *
 * The response may contain conversational text, markdown formatting,
 * and one or more JSON tool-call objects. This function finds and parses
 * every well-formed tool call it can.
 *
 * @example
 * const calls = extractToolCalls(
 *   'Let me write that file.\n```json\n{"tool":"write_file","arguments":{"path":"test.py","content":"print(1)"}}\n```'
 * );
 * // => [{ tool: "write_file", arguments: { path: "test.py", content: "print(1)" } }]
 */
export function extractToolCalls(text: string): ToolCall[] {
  const results: ToolCall[] = [];
  const cleaned = stripMarkdownFences(text);

  // Regex to find the start of a tool-call JSON object.
  // Uses a non-greedy match for the tool name to handle edge cases.
  const startPattern = /\{\s*"tool"\s*:\s*"/g;
  let match: RegExpExecArray | null;

  while ((match = startPattern.exec(cleaned)) !== null) {
    const objStart = match.index;

    // Find the closing brace for this JSON object
    const objEnd = findMatchingBrace(cleaned, objStart);
    if (objEnd === -1) continue;

    const jsonStr = cleaned.slice(objStart, objEnd + 1);

    try {
      const parsed = JSON.parse(jsonStr);

      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.tool === 'string' &&
        parsed.arguments &&
        typeof parsed.arguments === 'object'
      ) {
        results.push({
          tool: parsed.tool as string,
          arguments: parsed.arguments as Record<string, unknown>,
        });
      }
    } catch {
      // Not valid JSON — skip and continue looking
    }

    // Advance the regex past the current match to avoid re-scanning
    startPattern.lastIndex = objEnd + 1;
  }

  return results;
}

/**
 * Convenience: extract a single tool call.
 * Returns the first valid tool call found, or null.
 */
export function extractSingleToolCall(text: string): ToolCall | null {
  const calls = extractToolCalls(text);
  return calls.length > 0 ? calls[0] : null;
}

/**
 * Called when the LLM has finished streaming a full response.
 * Checks for a tool call, executes it in the background, and sends
 * a clean message to the chat UI (without the raw JSON visible).
 */
export async function handleLLMResponseComplete(
  rawLLMText: string,
  currentWorkspace: string,
  webContents: WebContents,
): Promise<void> {
  const toolCall = extractSingleToolCall(rawLLMText);

  if (toolCall) {
    if (toolCall.tool === 'write_file') {
      try {
        const result = await executeTool(toolCall, currentWorkspace);

        if (!result.success) {
          webContents.send('chat:receive-text', `> ❌ Failed to write file: ${result.error}`);
          return;
        }

        const resolvedPath = result.path || toolCall.arguments.path as string;

        if (!resolvedPath) {
          webContents.send('chat:receive-text', '> ❌ Failed to write file: missing path in tool call');
          return;
        }

        webContents.send('editor:open-or-update-tab', {
          path: resolvedPath,
          name: resolvedPath.split('/').pop() || 'untitled',
          content: toolCall.arguments.content as string,
        });

        webContents.send('workspace:file-changed', {
          path: resolvedPath,
          content: toolCall.arguments.content as string,
        });

        webContents.send('editor:update-content', {
          path: resolvedPath,
          content: toolCall.arguments.content as string,
        });

        const changeType = result.diff ? 'edited' : 'created';
        if (result.diff) {
          webContents.send('ai:tool-diff', {
            path: resolvedPath,
            diff: result.diff,
            type: changeType,
          });
        }

        const cleanedChatText = rawLLMText.replace(
          /\{[\s\S]*\}/,
          `> ⚙️ Successfully updated \`${toolCall.arguments.path}\``,
        );

        webContents.send('chat:receive-text', cleanedChatText);
      } catch (err: any) {
        webContents.send('chat:receive-text', `> ❌ Failed to write file: ${err.message}`);
      }
    }
  } else {
    webContents.send('chat:receive-text', rawLLMText);
  }
}

/**
 * Scan the messages array for the system prompt and, if an active file
 * is set, append a CURRENT ACTIVE FILE directive so the model knows
 * which file to write to when the user doesn't specify one explicitly.
 */
export function injectActiveFile(
  messages: { role: string; content: string }[],
  activeFile: string | null,
): { role: string; content: string }[] {
  if (!activeFile) return messages;

  const directive = `\n\nCURRENT ACTIVE FILE: ${activeFile}\nIf the user asks you to write or modify code without specifying a file, you MUST use this active file path in your write_file tool arguments.`;

  return messages.map(msg => {
    if (msg.role === 'system') {
      // Avoid double-injection on re-iterations
      if (msg.content.includes('CURRENT ACTIVE FILE:')) return msg;
      return { ...msg, content: msg.content + directive };
    }
    return msg;
  });
}
