// Multi-agent orchestration types
export type AgentStatus = 'idle' | 'planning' | 'running' | 'done' | 'failed' | 'blocked';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'gemini' | 'groq' | 'deepseek' | 'mistral' | 'ollama' | 'openai-compatible' | 'azure' | 'bedrock' | 'vertex' | 'custom';

export interface AgentProvider {
  endpointType: 'openai' | 'free' | 'ollama' | 'local_other' | 'custom' | ProviderId;
  apiKey: string;
  model: string;
  customEndpoint: string;
  localEndpoint: string;
  freeProvider: 'groq' | 'deepseek' | 'gemini';
  providerId?: ProviderId;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface TeamAgent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  systemPrompt: string;
  provider: AgentProvider;
  tokensIn: number;
  tokensOut: number;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  role: string;
  assignee: string | null;
  dependsOn: string[];
  status: TaskStatus;
  summary?: string;
  result?: string;
  files: string[];
  startedAt?: number;
  finishedAt?: number;
}

export interface BoardPost {
  id: string;
  from: string;
  text: string;
  kind: 'info' | 'result' | 'error' | 'phase';
  timestamp: number;
}

export interface OrchestrationState {
  id: string;
  goal: string;
  projectPath: string | null;
  agents: TeamAgent[];
  tasks: TaskItem[];
  board: BoardPost[];
  status: 'idle' | 'planning' | 'running' | 'done' | 'failed' | 'stopped';
  startedAt: number;
  finishedAt?: number;
  tokensIn: number;
  tokensOut: number;
}