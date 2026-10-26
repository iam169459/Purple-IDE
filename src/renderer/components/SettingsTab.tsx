import React, { useState } from 'react';

type Theme = 'dark' | 'light' | 'cyber' | 'black' | 'neon' | 'purple' | 'futuristic';

interface Props {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  minimapEnabled: boolean;
  onMinimapChange: (enabled: boolean) => void;
  aiTemperature: number;
  onAiTemperatureChange: (temp: number) => void;
  aiSystemPrompt: string;
  onAiSystemPromptChange: (prompt: string) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;

  // Lifted AI settings
  aiEndpointType: string;
  onAiEndpointTypeChange: (type: any) => void;
  aiApiKey: string;
  onAiApiKeyChange: (key: string) => void;
  aiModel: string;
  onAiModelChange: (model: string) => void;
  aiFreeProvider: string;
  onAiFreeProviderChange: (provider: any) => void;
  aiCustomEndpoint: string;
  onAiCustomEndpointChange: (endpoint: string) => void;
  aiLocalEndpoint: string;
  onAiLocalEndpointChange: (endpoint: string) => void;
  aiToolsEnabled: boolean;
  onAiToolsEnabledChange: (enabled: boolean) => void;
  vibeMode: boolean;
  onVibeModeChange: (enabled: boolean) => void;
}

const SettingsTab: React.FC<Props> = ({
  fontSize, onFontSizeChange,
  minimapEnabled, onMinimapChange,
  aiTemperature, onAiTemperatureChange,
  aiSystemPrompt, onAiSystemPromptChange,
  theme, onThemeChange,
  aiEndpointType, onAiEndpointTypeChange,
  aiApiKey, onAiApiKeyChange,
  aiModel, onAiModelChange,
  aiFreeProvider, onAiFreeProviderChange,
  aiCustomEndpoint, onAiCustomEndpointChange,
  aiLocalEndpoint, onAiLocalEndpointChange,
  aiToolsEnabled, onAiToolsEnabledChange,
  vibeMode, onVibeModeChange,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('editor-word-wrap') !== 'false');
  const [tabSize, setTabSize] = useState(() => parseInt(localStorage.getItem('editor-tab-size') || '2', 10));
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('editor-auto-save') !== 'false');
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('editor-font-family') || 'Cascadia Code, Fira Code, Menlo, monospace');

  const save = (key: string, value: string) => localStorage.setItem(key, value);

  const endpointOptions: { value: string; label: string; desc: string }[] = [
    { value: 'openai', label: 'OpenAI', desc: 'Paid — GPT-4o, GPT-4o-mini' },
    { value: 'free', label: 'Free Tier', desc: 'Groq, DeepSeek, Gemini (free quotas)' },
    { value: 'ollama', label: 'Ollama (Local)', desc: 'Run models on your machine' },
    { value: 'local_other', label: 'Other Local', desc: 'LM Studio, Llama.cpp, Jan, etc.' },
    { value: 'custom', label: 'Custom Endpoint', desc: 'Any OpenAI-compatible API' },
  ];

  const freeProviders: { value: string; label: string; url: string }[] = [
    { value: 'groq', label: 'Groq', url: 'api.groq.com' },
    { value: 'deepseek', label: 'DeepSeek', url: 'api.deepseek.com' },
    { value: 'gemini', label: 'Gemini', url: 'generativelanguage.googleapis.com' },
  ];

  const defaultModels: Record<string, Record<string, string[]>> = {
    openai: { default: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    free: {
      groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
      deepseek: ['deepseek-chat', 'deepseek-coder'],
      gemini: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    },
    ollama: { default: ['llama3.2', 'codellama', 'deepseek-coder', 'qwen2.5-coder'] },
    local_other: { default: ['meta-llama-3-8b-instruct', 'mistral-7b-instruct', 'qwen2.5-coder-7b-instruct'] },
  };

  const FONTS = [
    'Cascadia Code, Fira Code, Menlo, monospace',
    'Fira Code, Cascadia Code, monospace',
    'JetBrains Mono, monospace',
    'Source Code Pro, monospace',
    'Menlo, Monaco, monospace',
    'Consolas, monospace',
  ];

  const TAB_SIZES = [2, 4, 8];

  return (
    <div className="settings-tab-flat">
      {/* ── Appearance ── */}
      <div className="settings-section">
        <div className="settings-section-title">Appearance</div>
        <div className="settings-field">
          <label className="settings-label">Theme</label>
          <div className="settings-theme-grid">
            {([
              { id: 'dark' as Theme, name: 'Dark', icon: '🌙', desc: 'VSCode Dark+' },
              { id: 'futuristic' as Theme, name: 'Futuristic', icon: '🌌', desc: 'Holographic sci-fi HUD' },
              { id: 'black' as Theme, name: 'Black', icon: '⬛', desc: 'AMOLED pure black' },
              { id: 'cyber' as Theme, name: 'Cyber', icon: '⚡', desc: 'Sci-fi neon cyan' },
              { id: 'neon' as Theme, name: 'Neon', icon: '💡', desc: 'Vibrant magenta' },
              { id: 'purple' as Theme, name: 'Purple', icon: '💎', desc: 'Rich violet' },
            ] as { id: Theme; name: string; icon: string; desc: string }[]).map(t => (
              <button
                key={t.id}
                className={`settings-theme-card ${theme === t.id ? 'active' : ''}`}
                onClick={() => onThemeChange(t.id)}
              >
                <span className="settings-theme-icon">{t.icon}</span>
                <span className="settings-theme-name">{t.name}</span>
                <span className="settings-theme-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="settings-section">
        <div className="settings-section-title">Editor</div>

        <div className="settings-field">
          <label className="settings-label">Font Size</label>
          <div className="settings-field-row">
            <input
              type="range" min="10" max="28" step="1"
              value={fontSize}
              onChange={e => onFontSizeChange(Number(e.target.value))}
              className="settings-slider"
            />
            <span className="settings-value">{fontSize}px</span>
          </div>
          <div className="settings-presets">
            {[12, 14, 16, 18, 20].map(s => (
              <button
                key={s}
                className={`settings-preset ${fontSize === s ? 'active' : ''}`}
                onClick={() => onFontSizeChange(s)}
              >{s}</button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Font Family</label>
          <select
            className="settings-select"
            value={fontFamily}
            onChange={e => { setFontFamily(e.target.value); save('editor-font-family', e.target.value); }}
          >
            {FONTS.map(f => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f.split(',')[0].trim()}</option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label className="settings-label">Tab Size</label>
          <div className="settings-presets">
            {TAB_SIZES.map(s => (
              <button
                key={s}
                className={`settings-preset ${tabSize === s ? 'active' : ''}`}
                onClick={() => { setTabSize(s); save('editor-tab-size', String(s)); }}
              >{s} spaces</button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Word Wrap</label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={wordWrap}
              onChange={e => { setWordWrap(e.target.checked); save('editor-word-wrap', String(e.target.checked)); }}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">{wordWrap ? 'On' : 'Off'}</span>
          </label>
        </div>

        <div className="settings-field">
          <label className="settings-label">Minimap</label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={minimapEnabled}
              onChange={e => onMinimapChange(e.target.checked)}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">{minimapEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>

        <div className="settings-field">
          <label className="settings-label">Auto Save</label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={e => { setAutoSave(e.target.checked); save('editor-auto-save', String(e.target.checked)); }}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">{autoSave ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {/* ── AI Agent ── */}
      <div className="settings-section">
        <div className="settings-section-title">AI Agent</div>

        <div className="settings-field">
          <label className="settings-label">Provider</label>
          <div className="settings-endpoint-grid">
            {endpointOptions.map(opt => (
              <button
                key={opt.value}
                className={`settings-endpoint-card ${aiEndpointType === opt.value ? 'active' : ''}`}
                onClick={() => {
                  onAiEndpointTypeChange(opt.value);
                  let dm = '';
                  if (opt.value === 'openai') dm = 'gpt-4o-mini';
                  else if (opt.value === 'free') dm = defaultModels.free?.[aiFreeProvider]?.[0] || 'deepseek-chat';
                  else if (opt.value === 'ollama') dm = defaultModels.ollama.default[0];
                  else if (opt.value === 'local_other') dm = defaultModels.local_other.default[0];
                  if (dm) onAiModelChange(dm);
                }}
              >
                <span className="settings-endpoint-name">{opt.label}</span>
                <span className="settings-endpoint-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {aiEndpointType === 'free' && (
          <div className="settings-field">
            <label className="settings-label">Free Provider</label>
            <div className="settings-presets">
              {freeProviders.map(p => (
                <button
                  key={p.value}
                  className={`settings-preset ${aiFreeProvider === p.value ? 'active' : ''}`}
                  onClick={() => {
                    onAiFreeProviderChange(p.value);
                    const models = defaultModels.free?.[p.value];
                    if (models && models.length > 0) { onAiModelChange(models[0]); }
                  }}
                >{p.label}</button>
              ))}
            </div>
          </div>
        )}

        {(aiEndpointType === 'openai' || aiEndpointType === 'free') && (
          <div className="settings-field">
            <label className="settings-label">API Key</label>
            <div className="settings-api-key-row">
              <input
                type={showApiKey ? 'text' : 'password'}
                className="settings-input"
                value={aiApiKey}
                onChange={e => onAiApiKeyChange(e.target.value)}
                placeholder={aiEndpointType === 'free' ? 'Paste free tier API key...' : 'sk-...'}
              />
              <button
                className="settings-icon-btn"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide' : 'Show'}
              >{showApiKey ? '🙈' : '👁'}</button>
            </div>
            <p className="settings-hint">
              {aiEndpointType === 'free'
                ? `${freeProviders.find(p => p.value === aiFreeProvider)?.label} API key (get free at ${freeProviders.find(p => p.value === aiFreeProvider)?.url})`
                : 'OpenAI API key (get at platform.openai.com)'}
            </p>
          </div>
        )}

        {aiEndpointType === 'custom' && (
          <div className="settings-field">
            <label className="settings-label">Endpoint URL</label>
            <input
              type="text"
              className="settings-input"
              value={aiCustomEndpoint}
              onChange={e => onAiCustomEndpointChange(e.target.value)}
              placeholder="https://api.example.com/v1/chat/completions"
            />
            <p className="settings-hint">Full URL to OpenAI-compatible chat completions endpoint</p>
          </div>
        )}

        {aiEndpointType === 'ollama' && (
          <div className="settings-field">
            <label className="settings-label">Ollama URL</label>
            <input
              type="text"
              className="settings-input"
              value={aiCustomEndpoint || 'http://localhost:11434'}
              onChange={e => onAiCustomEndpointChange(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <p className="settings-hint">Ollama server address (default: http://localhost:11434)</p>
          </div>
        )}

        {aiEndpointType === 'local_other' && (
          <div className="settings-field">
            <label className="settings-label">Local API Endpoint URL</label>
            <input
              type="text"
              className="settings-input"
              value={aiLocalEndpoint}
              onChange={e => onAiLocalEndpointChange(e.target.value)}
              placeholder="http://localhost:1234"
            />
            <p className="settings-hint">OpenAI-compatible server endpoint (e.g. LM Studio default http://localhost:1234, Llama.cpp default http://localhost:8080)</p>
          </div>
        )}

        <div className="settings-field">
          <label className="settings-label">Model</label>
          <input
            type="text"
            className="settings-input"
            value={aiModel}
            onChange={e => onAiModelChange(e.target.value)}
            placeholder="gpt-4o-mini"
          />
          <div className="settings-presets">
            {(aiEndpointType === 'free'
              ? (defaultModels.free?.[aiFreeProvider] || [])
              : aiEndpointType === 'ollama'
                ? (defaultModels.ollama?.default || [])
                : aiEndpointType === 'local_other'
                  ? (defaultModels.local_other?.default || [])
                  : (defaultModels.openai?.default || [])
            ).map((m: string) => (
              <button
                key={m}
                className={`settings-preset ${aiModel === m ? 'active' : ''}`}
                onClick={() => onAiModelChange(m)}
              >{m}</button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Temperature: {aiTemperature.toFixed(1)}</label>
          <div className="settings-field-row">
            <input
              type="range" min="0" max="2" step="0.1"
              value={aiTemperature}
              onChange={e => onAiTemperatureChange(Number(e.target.value))}
              className="settings-slider"
            />
            <span className="settings-value">{aiTemperature.toFixed(1)}</span>
          </div>
          <div className="settings-presets">
            {[0, 0.3, 0.7, 1.0, 1.5].map(t => (
              <button
                key={t}
                className={`settings-preset ${Math.abs(aiTemperature - t) < 0.05 ? 'active' : ''}`}
                onClick={() => onAiTemperatureChange(t)}
              >{t}</button>
            ))}
          </div>
          <p className="settings-hint">Lower = more deterministic, higher = more creative</p>
        </div>

        <div className="settings-field">
          <label className="settings-label">Vibe Mode</label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={vibeMode}
              onChange={e => onVibeModeChange(e.target.checked)}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">{vibeMode ? 'On — AI creates & edits files proactively' : 'Off — Chat only'}</span>
          </label>
        </div>

        <div className="settings-field">
          <label className="settings-label">MCP Tools</label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={aiToolsEnabled}
              onChange={e => onAiToolsEnabledChange(e.target.checked)}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">{aiToolsEnabled ? 'On — AI can read/write/run' : 'Off — Chat only'}</span>
          </label>
        </div>

        <div className="settings-field">
          <label className="settings-label">System Prompt</label>
          <textarea
            className="settings-textarea"
            rows={5}
            value={aiSystemPrompt}
            onChange={e => onAiSystemPromptChange(e.target.value)}
            placeholder="You are a helpful coding assistant integrated into a code editor..."
          />
          <p className="settings-hint">Override the default AI system prompt. Leave empty for default behavior.</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
