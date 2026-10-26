export type ProviderId = 'openai' | 'anthropic' | 'google' | 'gemini' | 'groq' | 'deepseek' | 'mistral' | 'ollama' | 'openai-compatible' | 'azure' | 'bedrock' | 'vertex' | 'custom';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl?: string;
  requiresKey: boolean;
  models: Array<{ id: string; name: string; contextWindow?: number; supportsTools?: boolean; supportsVision?: boolean; supportsReasoning?: boolean }>;
}

export const PROVIDERS: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', requiresKey: true, models: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsTools: true, supportsVision: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsTools: true },
    { id: 'o1', name: 'o1', contextWindow: 200000, supportsTools: true, supportsReasoning: true },
  ]},
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', requiresKey: true, models: [
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', contextWindow: 200000, supportsTools: true, supportsVision: true },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', contextWindow: 200000, supportsTools: true },
  ]},
  { id: 'google', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', requiresKey: true, models: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsTools: true, supportsVision: true },
  ]},
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai', requiresKey: true, models: [
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', contextWindow: 131072, supportsTools: true },
  ]},
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', requiresKey: true, models: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', contextWindow: 65536, supportsTools: true },
  ]},
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', requiresKey: false, models: [] },
  { id: 'openai-compatible', name: 'OpenAI Compatible', requiresKey: false, models: [] },
  { id: 'azure', name: 'Azure OpenAI', requiresKey: true, models: [] },
  { id: 'bedrock', name: 'AWS Bedrock', requiresKey: true, models: [] },
  { id: 'vertex', name: 'Google Vertex', requiresKey: true, models: [] },
  { id: 'custom', name: 'Custom', requiresKey: false, models: [] },
];

export class UnifiedProvider {
  async chat(config: any, messages: any[]) {
    return { role: 'assistant', content: 'Response' };
  }
  async stream(config: any, messages: any[], onChunk: (chunk: string) => void) {
    onChunk('Hello');
    return { role: 'assistant', content: 'Hello' };
  }
}
