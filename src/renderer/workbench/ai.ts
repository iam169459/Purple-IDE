import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Logger } from './types';

export type EndpointType = 'openai' | 'free' | 'ollama' | 'local_other' | 'custom' | 'mcp';
export type FreeProvider = 'groq' | 'deepseek' | 'gemini' | 'nvidia';

export interface ModelOption {
  value: string;
  label: string;
}

interface FreeProviderDefinition {
  label: string;
  endpoint: string;
  keyPlaceholder: string;
  models: ModelOption[];
}

/** Cloud presets. The endpoint and its models move together. */
export const FREE_PROVIDERS: Record<FreeProvider, FreeProviderDefinition> = {
  groq: {
    label: 'Groq (free)',
    endpoint: 'https://api.groq.com/openai',
    keyPlaceholder: 'gsk_... (Groq API key)',
    models: [
      { value: 'llama3-70b-8192', label: 'Llama 3 70B' },
      { value: 'llama3-8b-8192', label: 'Llama 3 8B' },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
      { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    ],
  },
  deepseek: {
    label: 'DeepSeek (free)',
    endpoint: 'https://api.deepseek.com',
    keyPlaceholder: 'sk-... (DeepSeek API key)',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek V3' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' },
    ],
  },
  gemini: {
    label: 'Google Gemini (free)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyPlaceholder: 'AIza... (Gemini API key)',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
  },
  nvidia: {
    label: 'NVIDIA (free)',
    endpoint: 'https://api.nvidia.com/v1',
    keyPlaceholder: 'sk-... (NVIDIA API key)',
    models: [
      { value: 'meta-llama-3-8b-instruct', label: 'Llama 3 8B Instruct' },
      { value: 'meta-llama-3-70b-instruct', label: 'Llama 3 70B Instruct' },
      { value: 'nemotron', label: 'Nemotron' },
      { value: 'mixtral-8x7b-instruct', label: 'Mixtral 8x7B Instruct' },
    ],
  },
};

export const OPENAI_MODELS: ModelOption[] = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
];

export const ENDPOINT_LABELS: Record<EndpointType, string> = {
  openai: 'OpenAI',
  free: 'Free cloud',
  ollama: 'Ollama',
  local_other: 'Local server',
  custom: 'Custom',
  mcp: 'MCP server',
};

interface AiPrefs {
  endpointType: EndpointType;
  model: string;
  freeProvider: FreeProvider;
  customEndpoint: string;
  localEndpoint: string;
  vibeMode: boolean;
}

const AI_KEY = 'purple-ai-prefs-v2';
const MODEL_KEY = 'ai-model';

const ENDPOINTS: EndpointType[] = ['openai', 'free', 'ollama', 'local_other', 'custom', 'mcp'];
const PROVIDERS: FreeProvider[] = ['groq', 'deepseek', 'gemini', 'nvidia'];

const readPrefs = (): AiPrefs => {
  let stored: Partial<AiPrefs> = {};
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (raw) stored = JSON.parse(raw) as Partial<AiPrefs>;
  } catch {}
  let legacyModel = '';
  try { legacyModel = localStorage.getItem(MODEL_KEY) || ''; } catch {}
  return {
    endpointType: stored.endpointType && ENDPOINTS.includes(stored.endpointType) ? stored.endpointType : 'ollama',
    model: stored.model || legacyModel || '',
    freeProvider: stored.freeProvider && PROVIDERS.includes(stored.freeProvider) ? stored.freeProvider : 'groq',
    customEndpoint: stored.customEndpoint || '',
    localEndpoint: stored.localEndpoint || 'http://localhost:1234',
    vibeMode: Boolean(stored.vibeMode),
  };
};

const defaultModelFor = (
  endpoint: EndpointType,
  freeProvider: FreeProvider,
  ollamaModels: string[],
  localModels: string[],
): string => {
  if (endpoint === 'openai') return OPENAI_MODELS[0].value;
  if (endpoint === 'free') return FREE_PROVIDERS[freeProvider]?.models[0]?.value || '';
  if (endpoint === 'ollama') return ollamaModels[0] || '';
  if (endpoint === 'local_other') return localModels[0] || 'meta-llama-3-8b-instruct';
  return '';
};

/**
 * Sole owner of the model catalog and endpoint settings. The status bar, the
 * model picker, Settings and the AI panel all read this one slice.
 */
export function useAiSettings(log: Logger) {
  const initial = useMemo(readPrefs, []);
  const [endpointType, setEndpointType] = useState<EndpointType>(initial.endpointType);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState('');
  const [freeProvider, setFreeProvider] = useState<FreeProvider>(initial.freeProvider);
  const [customEndpoint, setCustomEndpoint] = useState(initial.customEndpoint);
  const [localEndpoint, setLocalEndpoint] = useState(initial.localEndpoint);
  const [vibeMode, setVibeMode] = useState(initial.vibeMode);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaState, setOllamaState] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localState, setLocalState] = useState<'idle' | 'checking' | 'connected' | 'offline'>('idle');
  const [localError, setLocalError] = useState<string | null>(null);

  const refreshOllama = useCallback(async () => {
    setOllamaState('checking');
    setOllamaError(null);
    try {
      const result = await window.electronAPI.ollamaListModels();
      if (result.success) {
        setOllamaModels(result.models);
        setOllamaState('connected');
        if (result.models.length === 0) setOllamaError('No models installed. Run `ollama pull <model>`.');
      } else {
        setOllamaModels([]);
        setOllamaState('offline');
        setOllamaError(result.error || 'Could not reach Ollama at localhost:11434');
      }
    } catch (error) {
      setOllamaModels([]);
      setOllamaState('offline');
      setOllamaError((error as Error).message);
    }
  }, []);

  const refreshLocal = useCallback(async () => {
    setLocalState('checking');
    setLocalError(null);
    try {
      const result = await window.electronAPI.localListModels(localEndpoint);
      if (result.success) {
        setLocalModels(result.models);
        setLocalState('connected');
        if (result.models.length === 0) setLocalError('No models found. Check your local server.');
      } else {
        setLocalModels([]);
        setLocalState('offline');
        setLocalError(result.error || 'Failed to connect. Is LM Studio / Llama.cpp running?');
      }
    } catch (error) {
      setLocalModels([]);
      setLocalState('offline');
      setLocalError((error as Error).message);
    }
  }, [localEndpoint]);

  useEffect(() => { void refreshOllama(); }, [refreshOllama]);
  useEffect(() => {
    if (endpointType === 'local_other') void refreshLocal();
  }, [endpointType, localEndpoint, refreshLocal]);

  /* Keep the selected Ollama model valid without touching other endpoints. */
  useEffect(() => {
    if (endpointType !== 'ollama' || ollamaModels.length === 0) return;
    if (!ollamaModels.includes(model)) setModel(ollamaModels[0]);
  }, [endpointType, ollamaModels, model]);

  useEffect(() => {
    try {
      localStorage.setItem(AI_KEY, JSON.stringify({
        endpointType, model, freeProvider, customEndpoint, localEndpoint, vibeMode,
      }));
      if (model) localStorage.setItem(MODEL_KEY, model);
    } catch {}
  }, [endpointType, model, freeProvider, customEndpoint, localEndpoint, vibeMode]);

  const chooseEndpoint = useCallback((next: EndpointType) => {
    setEndpointType(next);
    const fallback = defaultModelFor(next, freeProvider, ollamaModels, localModels);
    if (fallback) setModel(fallback);
  }, [freeProvider, localModels, ollamaModels]);

  const chooseFreeProvider = useCallback((next: FreeProvider) => {
    setFreeProvider(next);
    const fallback = FREE_PROVIDERS[next]?.models[0]?.value;
    if (fallback) setModel(fallback);
  }, []);

  const modelOptions = useMemo<ModelOption[]>(() => {
    switch (endpointType) {
      case 'openai': return OPENAI_MODELS;
      case 'free': return FREE_PROVIDERS[freeProvider]?.models || [];
      case 'ollama': return ollamaModels.map((name) => ({ value: name, label: name }));
      case 'local_other': return localModels.length > 0
        ? localModels.map((name) => ({ value: name, label: name }))
        : (model ? [{ value: model, label: model }] : []);
      case 'mcp': return model ? [{ value: model, label: 'MCP Server' }] : [];
      default: return model ? [{ value: model, label: model }] : [];
    }
  }, [endpointType, freeProvider, localModels, model, ollamaModels]);

  const effectiveEndpoint = useMemo(() => {
    if (endpointType === 'openai') return 'https://api.openai.com';
    if (endpointType === 'ollama') return 'http://localhost:11434';
    if (endpointType === 'local_other') return localEndpoint || 'http://localhost:1234';
    if (endpointType === 'free') return FREE_PROVIDERS[freeProvider]?.endpoint || '';
    if (endpointType === 'mcp') return customEndpoint || 'http://localhost:3999';
    return customEndpoint;
  }, [customEndpoint, endpointType, freeProvider, localEndpoint]);

  const setModelFromPicker = useCallback((next: string) => {
    setModel(next);
    log(`Model set to ${next}`, 'info');
  }, [log]);

  return {
    endpointType,
    setEndpointType,
    chooseEndpoint,
    freeProvider,
    setFreeProvider,
    chooseFreeProvider,
    model,
    setModel: setModelFromPicker,
    rawSetModel: setModel,
    apiKey,
    setApiKey,
    customEndpoint,
    setCustomEndpoint,
    localEndpoint,
    setLocalEndpoint,
    vibeMode,
    setVibeMode,
    ollamaModels,
    ollamaState,
    ollamaError,
    ollamaLoading: ollamaState === 'checking',
    refreshOllama,
    localModels,
    localState,
    localError,
    localLoading: localState === 'checking',
    refreshLocal,
    modelOptions,
    effectiveEndpoint,
    endpointLabel: ENDPOINT_LABELS[endpointType],
  };
}
