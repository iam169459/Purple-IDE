export type AgentMode = 'vibe' | 'plan' | 'ask' | 'edit' | 'review' | 'debug' | 'test';

export interface ModeConfig {
  id: AgentMode;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[] | 'all';
  approvalPolicy: 'auto-read' | 'confirm-writes' | 'confirm-all';
}

export const AGENT_MODES: ModeConfig[] = [
  {
    id: 'vibe',
    name: 'Vibe',
    description: 'Autonomous multi-step agent',
    systemPrompt: 'You are an autonomous coding agent. Plan, execute, test, and iterate until the task is complete. Use tools proactively.',
    allowedTools: 'all',
    approvalPolicy: 'auto-read',
  },
  {
    id: 'plan',
    name: 'Plan',
    description: 'Plan-then-execute',
    systemPrompt: 'You are a planning agent. First create a detailed plan, then execute it step by step. Get approval before major changes.',
    allowedTools: 'all',
    approvalPolicy: 'confirm-writes',
  },
  {
    id: 'ask',
    name: 'Ask',
    description: 'Read-only assistant',
    systemPrompt: 'You are a read-only assistant. Only read and explain code. Do not make changes.',
    allowedTools: ['read_file', 'list_files', 'search_files', 'search_content', 'diagnostics'],
    approvalPolicy: 'confirm-all',
  },
  {
    id: 'edit',
    name: 'Edit',
    description: 'Single-file focused edits',
    systemPrompt: 'You are a focused editor. Make precise, minimal changes to the specified files.',
    allowedTools: ['read_file', 'edit_file', 'write_file'],
    approvalPolicy: 'confirm-writes',
  },
  {
    id: 'review',
    name: 'Review',
    description: 'PR/code review',
    systemPrompt: 'You are a code reviewer. Review for correctness, style, security, and performance. Provide actionable feedback.',
    allowedTools: ['read_file', 'search_content', 'git_diff', 'diagnostics'],
    approvalPolicy: 'confirm-all',
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Debugging assistance',
    systemPrompt: 'You are a debugging expert. Reproduce, diagnose, and fix bugs systematically.',
    allowedTools: 'all',
    approvalPolicy: 'confirm-writes',
  },
  {
    id: 'test',
    name: 'Test',
    description: 'Testing and test generation',
    systemPrompt: 'You are a test engineer. Write comprehensive tests and ensure they pass.',
    allowedTools: 'all',
    approvalPolicy: 'confirm-writes',
  },
];
