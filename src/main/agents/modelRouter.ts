import { app, safeStorage, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderType = 'gemini' | 'groq' | 'openrouter' | 'ollama';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  type: ProviderType;
  priority: number;
  maxRetries: number;
  keyRequired: boolean;
  contextWindow: number;
  enabled: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface StreamCallbacks {
  onDelta?: (delta: string, full: string) => void;
  shouldAbort?: () => boolean;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const COOLDOWN_MS = 60_000;
const CONNECT_TIMEOUT_MS = 30_000;
const STREAM_IDLE_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export class ModelRouter {
  private providers: ProviderConfig[] = [
    {
      id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.0-flash', type: 'gemini', priority: 1, maxRetries: 2,
      keyRequired: true, contextWindow: 1_000_000, enabled: true,
    },
    {
      id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile', type: 'groq', priority: 2, maxRetries: 2,
      keyRequired: true, contextWindow: 128_000, enabled: true,
    },
    {
      id: 'openrouter', name: 'OpenRouter Free', baseUrl: 'https://openrouter.ai/api/v1',
      model: 'deepseek/deepseek-chat-v3-0324:free', type: 'openrouter', priority: 3, maxRetries: 2,
      keyRequired: true, contextWindow: 64_000, enabled: true,
    },
    {
      id: 'ollama', name: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5-coder:7b', type: 'ollama', priority: 4, maxRetries: 1,
      keyRequired: false, contextWindow: 32_000, enabled: true,
    },
  ];

  private keys: Record<string, string> = {};
  private keysPath = '';
  private loaded = false;
  private cooldowns = new Map<string, number>();
  private lastUsed: string | null = null;
  private mainWindow: BrowserWindow | null = null;

  private ensureLoaded() {
    if (this.loaded) return;
    try {
      this.keysPath = path.join(app.getPath('userData'), 'api-keys.enc');
      this.keys = this.loadKeys();
    } catch {}
    this.loaded = true;
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  private emit(event: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  // ------------------------------- Key storage ------------------------------

  private loadKeys(): Record<string, string> {
    try {
      if (!fs.existsSync(this.keysPath)) return {};
      const raw = fs.readFileSync(this.keysPath);
      if (safeStorage.isEncryptionAvailable()) {
        return JSON.parse(safeStorage.decryptString(raw));
      }
      // Fallback: base64 plaintext (safeStorage unavailable, e.g. Linux without keyring)
      return JSON.parse(Buffer.from(raw.toString('utf-8'), 'base64').toString('utf-8'));
    } catch {
      return {};
    }
  }

  private saveKeys() {
    this.ensureLoaded();
    try {
      const json = JSON.stringify(this.keys);
      let data: Buffer;
      if (safeStorage.isEncryptionAvailable()) {
        data = safeStorage.encryptString(json);
      } else {
        data = Buffer.from(Buffer.from(json, 'utf-8').toString('base64'), 'utf-8');
      }
      fs.mkdirSync(path.dirname(this.keysPath), { recursive: true });
      fs.writeFileSync(this.keysPath, data);
    } catch {}
  }

  setKey(providerId: string, key: string) {
    this.ensureLoaded();
    if (key) this.keys[providerId] = key;
    else delete this.keys[providerId];
    this.saveKeys();
  }

  getKey(providerId: string): string | undefined {
    this.ensureLoaded();
    return this.keys[providerId] || undefined;
  }

  // ------------------------------- Health ----------------------------------

  private markDown(providerId: string) {
    this.cooldowns.set(providerId, Date.now() + COOLDOWN_MS);
  }

  isAvailable(providerId: string): boolean {
    const until = this.cooldowns.get(providerId);
    if (!until) return true;
    if (Date.now() >= until) {
      this.cooldowns.delete(providerId);
      return true;
    }
    return false;
  }

  getLastUsed(): string | null {
    return this.lastUsed;
  }

  // ------------------------------- Chain -----------------------------------

  private chain(): ProviderConfig[] {
    return [...this.providers]
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  private isRetryableError(err: any): boolean {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return false;
    if (err?.status && RETRYABLE_STATUS.has(err.status)) return true;
    const code = err?.cause?.code || err?.code;
    return code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
           code === 'EAI_AGAIN' || code === 'ECONNRESET' || err?.name === 'TypeError';
  }

  private chatUrl(provider: ProviderConfig): string {
    return `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private headers(provider: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.getKey(provider.id);
    if (key) headers['Authorization'] = `Bearer ${key}`;
    if (provider.type === 'openrouter') {
      headers['HTTP-Referer'] = 'https://purple-ide.app';
      headers['X-Title'] = 'Purple IDE';
    }
    return headers;
  }

  private buildBody(provider: ProviderConfig, messages: ChatMessage[], options: ChatOptions, stream: boolean) {
    return JSON.stringify({
      model: options.model || provider.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
      stream,
    });
  }

  private fail(provider: ProviderConfig, from: string, reason: string) {
    this.emit('agent:provider-switch', {
      from, to: null, failedProvider: provider.id, reason,
      chain: this.chain().map(p => ({ id: p.id, available: this.isAvailable(p.id) })),
    });
  }

  private succeed(provider: ProviderConfig) {
    if (this.lastUsed !== provider.id) {
      this.emit('agent:provider-switch', { from: this.lastUsed, to: provider.id, reason: 'failover-success' });
      this.lastUsed = provider.id;
    }
  }

  // ------------------------------- Non-streaming ---------------------------

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const errors: string[] = [];
    for (const provider of this.chain()) {
      if (!this.isAvailable(provider.id)) {
        errors.push(`${provider.id}: cooling down`);
        continue;
      }
      if (provider.keyRequired && !this.getKey(provider.id)) {
        errors.push(`${provider.id}: no API key`);
        continue;
      }
      for (let attempt = 0; attempt <= provider.maxRetries; attempt++) {
        try {
          const result = await this.callOnce(provider, messages, options);
          this.succeed(provider);
          return result;
        } catch (err: any) {
          if (options.signal?.aborted) throw err;
          const status = err?.status;
          errors.push(`${provider.id}#${attempt}: ${err?.message || err}`);
          if (status === 429 || status === 503) {
            // Rate limited / unavailable — stop retrying this provider, move on.
            this.markDown(provider.id);
            this.fail(provider, this.lastUsed || '', `HTTP ${status}`);
            break;
          }
          if (this.isRetryableError(err)) {
            if (attempt === provider.maxRetries) {
              this.markDown(provider.id);
              this.fail(provider, this.lastUsed || '', err?.message || 'connection error');
            }
            continue;
          }
          throw err;
        }
      }
    }
    throw new Error(`All providers failed: ${errors.join('; ')}`);
  }

  private async callOnce(provider: ProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    const timeout = AbortSignal.timeout(CONNECT_TIMEOUT_MS + 90_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const res = await fetch(this.chatUrl(provider), {
      method: 'POST',
      headers: this.headers(provider),
      body: this.buildBody(provider, messages, options, false),
      signal,
    });
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      provider: provider.id,
      model: data.model || provider.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }

  // ------------------------------- Streaming -------------------------------

  async chatStream(messages: ChatMessage[], options: ChatOptions = {}, callbacks: StreamCallbacks = {}): Promise<ChatResult> {
    const errors: string[] = [];
    for (const provider of this.chain()) {
      if (!this.isAvailable(provider.id)) {
        errors.push(`${provider.id}: cooling down`);
        continue;
      }
      if (provider.keyRequired && !this.getKey(provider.id)) {
        errors.push(`${provider.id}: no API key`);
        continue;
      }
      try {
        const result = await this.streamOnce(provider, messages, options, callbacks);
        this.succeed(provider);
        return result;
      } catch (err: any) {
        if (options.signal?.aborted) throw err;
        errors.push(`${provider.id}: ${err?.message || err}`);
        this.markDown(provider.id);
        this.fail(provider, this.lastUsed || '', err?.message || 'stream failed');
      }
    }
    throw new Error(`All providers failed (stream): ${errors.join('; ')}`);
  }

  private async streamOnce(
    provider: ProviderConfig,
    messages: ChatMessage[],
    options: ChatOptions,
    callbacks: StreamCallbacks
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort, { once: true });
    const idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);

    let full = '';
    try {
      const res = await fetch(this.chatUrl(provider), {
        method: 'POST',
        headers: this.headers(provider),
        body: this.buildBody(provider, messages, options, true),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      if (!res.body) throw new Error('Empty response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        if (callbacks.shouldAbort?.()) { controller.abort(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        idleTimer.refresh();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta: string = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              full += delta;
              callbacks.onDelta?.(delta, full);
            }
          } catch {}
        }
      }
      return { content: full, provider: provider.id, model: provider.model };
    } finally {
      clearTimeout(idleTimer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  // ------------------------------- Info ------------------------------------

  getProviders(): ProviderConfig[] {
    return this.providers;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export const modelRouter = new ModelRouter();
