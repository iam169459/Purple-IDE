/** Shared tool-call contract injected into every role's system prompt. */

export const TOOL_CONTRACT = `
## TOOL CALL FORMAT
When you need to interact with the workspace, respond with ONLY a JSON array (no prose, no markdown fence) of tool calls:
[
  { "tool": "tool_name", "arguments": { ... } }
]
After tools run you will receive "TOOL RESULT (...)" messages. When the task is complete, respond with a short plain-text summary (no JSON).

## AVAILABLE TOOLS
- read_file { "path": "src/..." }                          -> file content
- list_files { "path": ".", "maxDepth": 2 }                -> entries
- search_files { "pattern": "regex", "path": "." }         -> matching file paths
- search_content { "query": "text", "path": "." }          -> { file, line, text } matches
- write_file { "path": "src/...", "content": "full file" } -> create or full rewrite (use sparingly)
- edit_file { "path": "src/...", "oldString": "exact existing text", "newString": "replacement" } -> targeted edit (PREFERRED)
- apply_patch { "path": "src/...", "diff": "unified diff" } -> apply a unified diff patch (PREFERRED for multi-hunk edits)
- run_code { "command": "shell command" }                   -> run command, returns stdout/stderr/exitCode

## PATCH RULES
- Prefer edit_file / apply_patch over write_file. Only use write_file for genuinely new files.
- Unified diffs must use standard format with @@ hunk headers and context lines.
- Keep edits minimal and surgical. Never reformat unrelated code.`;

export function buildSystemPrompt(base: string): string {
  return `${base}\n${TOOL_CONTRACT}`;
}
