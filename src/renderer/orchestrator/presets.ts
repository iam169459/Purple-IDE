// Team presets for multi-agent orchestration
import type { AgentProvider } from './types';

export interface PresetAgent {
  name: string;
  role: string;
  emoji: string;
  systemPrompt: string;
}

export interface TeamPreset {
  id: string;
  name: string;
  description: string;
  agents: PresetAgent[];
}

export const TEAM_PRESETS: TeamPreset[] = [
  {
    id: 'fullstack',
    name: 'Full-Stack Build',
    description: 'Architecture → frontend → backend → tests → review',
    agents: [
      {
        name: 'Architect',
        role: 'architect',
        emoji: '🏗',
        systemPrompt: 'You are a senior software architect. Design clean, scalable architectures. Break goals into clear, dependency-ordered tasks. Think about file structure, module boundaries, and interfaces. Do NOT write code — only design and plan.',
      },
      {
        name: 'Frontend',
        role: 'frontend',
        emoji: '🎨',
        systemPrompt: 'You are a senior frontend engineer. Write clean, production-ready frontend code (React/TypeScript/Vite). Use best practices, proper error handling, and accessibility. One tool call per response.',
      },
      {
        name: 'Backend',
        role: 'backend',
        emoji: '⚙',
        systemPrompt: 'You are a senior backend engineer. Write clean, production-ready backend code (Node/Express or Python). Use best practices, proper error handling, and clean architecture. One tool call per response.',
      },
      {
        name: 'Tester',
        role: 'tester',
        emoji: '🧪',
        systemPrompt: 'You are a QA engineer. Write comprehensive tests for the code. Cover edge cases, error handling, and integration points. One tool call per response.',
      },
      {
        name: 'Reviewer',
        role: 'reviewer',
        emoji: '🔍',
        systemPrompt: 'You are a code reviewer. Review the code for correctness, style, security, and performance. Suggest improvements and report issues clearly. One tool call per response.',
      },
    ],
  },
  {
    id: 'feature',
    name: 'Feature Squad',
    description: 'Plan → implement → verify',
    agents: [
      {
        name: 'Planner',
        role: 'planner',
        emoji: '📋',
        systemPrompt: 'You are a software planner. Break the goal into a clear, dependency-ordered task list. Do NOT write code — only plan.',
      },
      {
        name: 'Coder',
        role: 'coder',
        emoji: '💻',
        systemPrompt: 'You are a software engineer. Implement the assigned task cleanly and completely. One tool call per response.',
      },
      {
        name: 'Verifier',
        role: 'verifier',
        emoji: '✅',
        systemPrompt: 'You are a verification engineer. Run tests and verify the implementation works. Report pass/fail clearly.',
      },
    ],
  },
  {
    id: 'bugfix',
    name: 'Bug Hunt',
    description: 'Investigate → fix → validate',
    agents: [
      {
        name: 'Investigator',
        role: 'investigator',
        emoji: '🕵',
        systemPrompt: 'You are a debugging investigator. Reproduce the bug, find the root cause, and report it. One tool call per response.',
      },
      {
        name: 'Fixer',
        role: 'fixer',
        emoji: '🔧',
        systemPrompt: 'You are a bug fixer. Apply a minimal, targeted fix for the reported issue. One tool call per response.',
      },
      {
        name: 'Validator',
        role: 'validator',
        emoji: '✔',
        systemPrompt: 'You are a validation engineer. Verify the fix resolves the bug and introduces no regressions. Report pass/fail.',
      },
    ],
  },
  {
    id: 'docs',
    name: 'Docs & Polish',
    description: 'Write docs, README, comments',
    agents: [
      {
        name: 'Writer',
        role: 'writer',
        emoji: '✍',
        systemPrompt: 'You are a technical writer. Write clear, concise documentation and README files. One tool call per response.',
      },
      {
        name: 'Editor',
        role: 'editor',
        emoji: '✏️',
        systemPrompt: 'You are a documentation editor. Polish existing docs for clarity, consistency, and completeness. One tool call per response.',
      },
    ],
  },
];

export function makeDefaultProvider(): AgentProvider {
  return {
    endpointType: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    customEndpoint: '',
    localEndpoint: 'http://localhost:1234',
    freeProvider: 'groq',
  };
}

export function buildTeamAgents(
  preset: TeamPreset,
  globalProvider: AgentProvider,
  overrides: Record<string, Partial<AgentProvider>>,
): import('./types').TeamAgent[] {
  return preset.agents.map((a, i) => {
    const id = `agent-${i}`;
    const override = overrides[id] || {};
    return {
      id,
      name: a.name,
      role: a.role,
      emoji: a.emoji,
      systemPrompt: a.systemPrompt,
      provider: { ...globalProvider, ...override },
      tokensIn: 0,
      tokensOut: 0,
    };
  });
}