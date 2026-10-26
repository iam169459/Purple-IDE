import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Codi, IconDashboard, IconFileType, IconSearch, IconSettings } from './codicons';

export type ThemeId = 'purple-dark' | 'dark-modern' | 'light-modern' | 'high-contrast';
export type SettingsCategory = 'appearance' | 'editor' | 'ai' | 'about';

export interface WorkbenchSettings {
  theme: ThemeId;
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  aiTemperature: number;
  aiToolsEnabled: boolean;
}

interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}

interface Props {
  settings: WorkbenchSettings;
  initialCategory?: SettingsCategory;
  ollamaModels: string[];
  ollamaState: 'checking' | 'connected' | 'offline';
  aiModel: string;
  onChange: (patch: Partial<WorkbenchSettings>) => void;
  onAiModelChange: (model: string) => void;
  onClose: () => void;
}

const CATEGORIES: { id: SettingsCategory; label: string; icon: React.ElementType }[] = [
  { id: 'appearance', label: 'Appearance', icon: IconDashboard },
  { id: 'editor', label: 'Editor', icon: IconFileType },
  { id: 'ai', label: 'AI', icon: IconSettings },
  { id: 'about', label: 'About', icon: Codi as any },
];

const THEMES: { value: ThemeId; label: string; description: string }[] = [
  { value: 'purple-dark', label: 'Purple Dark', description: 'Deep navy surfaces with a violet accent' },
  { value: 'dark-modern', label: 'Dark Modern', description: 'Neutral dark workbench' },
  { value: 'light-modern', label: 'Light Modern', description: 'Light workbench with violet accents' },
  { value: 'high-contrast', label: 'High Contrast', description: 'Black surfaces with high-contrast borders' },
];

const Toggle: React.FC<{ on: boolean; label: string; onClick: () => void }> = ({ on, label, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    className={`settings-toggle ${on ? 'on' : 'off'}`}
    onClick={onClick}
  />
);

const SettingsView: React.FC<Props> = ({
  settings,
  initialCategory = 'appearance',
  ollamaModels,
  ollamaState,
  aiModel,
  onChange,
  onAiModelChange,
  onClose,
}) => {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  const [filter, setFilter] = useState('');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCategory(initialCategory); }, [initialCategory]);
  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()); }, []);
  useEffect(() => {
    window.electronAPI.getAppInfo().then((info) => {
      if (info.success) setAppInfo(info as AppInfo);
    }).catch(() => {});
  }, []);

  const query = filter.trim().toLowerCase();

  const visibleThemes = useMemo(
    () => THEMES.filter((theme) => !query || `${theme.label} ${theme.description}`.toLowerCase().includes(query)),
    [query],
  );

  const closeOnEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };

  return (
    <div className="settings-view wb-settings" onKeyDown={closeOnEscape}>
      <div className="settings-header wb-settings-header">
        <IconSettings size={16} />
        <h1 className="settings-title">Settings</h1>
        <span className="wb-settings-subtitle">Changes apply immediately</span>
        <button type="button" className="wb-iconbtn wb-settings-close" onClick={onClose} title="Close Settings" aria-label="Close Settings">
          <Codi name="close" size={16} />
        </button>
      </div>

      <div className="settings-body">
        <div className="settings-sidebar">
          <div className="settings-search">
            <IconSearch size={15} />
            <input
              ref={inputRef}
              className="settings-search-input"
              placeholder="Search settings"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="settings-categories">
            {CATEGORIES.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`settings-category ${category === entry.id ? 'active' : ''}`}
                  onClick={() => setCategory(entry.id)}
                  title={entry.label}
                >
                  {entry.id === 'about' ? <Codi name="info" size={15} /> : <Icon size={15} />}
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-content">
          {category === 'appearance' && (
            <div className="wb-settings-section">
              <h2>Color Theme</h2>
              <p className="wb-settings-desc">Select the workbench color theme. Editor syntax colors follow automatically.</p>
              {visibleThemes.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  className={`wb-theme-option ${settings.theme === theme.value ? 'is-selected' : ''}`}
                  onClick={() => onChange({ theme: theme.value })}
                >
                  <span className={`wb-theme-swatch is-${theme.value}`} aria-hidden="true" />
                  <span className="wb-theme-copy">
                    <span className="wb-theme-name">{theme.label}</span>
                    <span className="wb-theme-description">{theme.description}</span>
                  </span>
                  {settings.theme === theme.value && <Codi name="check" size={14} />}
                </button>
              ))}
              {visibleThemes.length === 0 && <div className="settings-empty">No themes match “{filter}”.</div>}
            </div>
          )}

          {category === 'editor' && (
            <div className="wb-settings-section">
              <h2>Editor</h2>
              <p className="wb-settings-desc">Typographic and layout preferences for the Monaco editor.</p>
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Font size</div>
                  <div className="settings-row-desc">Editor font size in pixels ({settings.fontSize}px)</div>
                </div>
                <div className="settings-row-control">
                  <input
                    className="settings-input"
                    type="number"
                    min={10}
                    max={24}
                    step={1}
                    value={settings.fontSize}
                    onChange={(e) => {
                      const next = Math.max(10, Math.min(24, Number(e.target.value) || 13));
                      onChange({ fontSize: next });
                    }}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Word wrap</div>
                  <div className="settings-row-desc">Wrap long lines at the editor viewport width</div>
                </div>
                <div className="settings-row-control">
                  <Toggle on={settings.wordWrap} label="Word wrap" onClick={() => onChange({ wordWrap: !settings.wordWrap })} />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Minimap</div>
                  <div className="settings-row-desc">Show the code minimap on the right edge</div>
                </div>
                <div className="settings-row-control">
                  <Toggle on={settings.minimap} label="Minimap" onClick={() => onChange({ minimap: !settings.minimap })} />
                </div>
              </div>
            </div>
          )}

          {category === 'ai' && (
            <div className="wb-settings-section">
              <h2>AI</h2>
              <p className="wb-settings-desc">Defaults shared by the AI Chat panel and the status bar model chip.</p>
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Local model</div>
                  <div className="settings-row-desc">
                    {ollamaState === 'connected'
                      ? `${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 's'} available from Ollama`
                      : ollamaState === 'checking'
                        ? 'Checking localhost:11434…'
                        : 'Ollama is offline — start it to list local models'}
                  </div>
                </div>
                <div className="settings-row-control">
                  {ollamaModels.length > 0 ? (
                    <select className="settings-select" value={aiModel} onChange={(e) => onAiModelChange(e.target.value)}>
                      {aiModel && !ollamaModels.includes(aiModel) && <option value={aiModel}>{aiModel}</option>}
                      {ollamaModels.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  ) : (
                    <span className="wb-settings-value">{aiModel || 'No model'}</span>
                  )}
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Temperature</div>
                  <div className="settings-row-desc">Lower values are more deterministic ({settings.aiTemperature.toFixed(1)})</div>
                </div>
                <div className="settings-row-control">
                  <input
                    className="settings-input"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={settings.aiTemperature}
                    onChange={(e) => onChange({ aiTemperature: Math.max(0, Math.min(2, Number(e.target.value) || 0)) })}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Agent tools</div>
                  <div className="settings-row-desc">Allow AI Chat to read, write and run files when explicitly asked</div>
                </div>
                <div className="settings-row-control">
                  <Toggle on={settings.aiToolsEnabled} label="Agent tools" onClick={() => onChange({ aiToolsEnabled: !settings.aiToolsEnabled })} />
                </div>
              </div>
            </div>
          )}

          {category === 'about' && (
            <div className="wb-settings-section">
              <h2>About Purple IDE</h2>
              <p className="wb-settings-desc">A desktop code workbench built with Electron, React, Monaco and local Ollama models.</p>
              <dl className="wb-about-grid">
                <dt>Application</dt><dd>{appInfo?.name || 'Purple IDE'}</dd>
                <dt>Version</dt><dd>{appInfo?.version || '0.1.0'}</dd>
                <dt>Electron</dt><dd>{appInfo?.electron || '—'}</dd>
                <dt>Chromium</dt><dd>{appInfo?.chrome || '—'}</dd>
                <dt>Node.js</dt><dd>{appInfo?.node || '—'}</dd>
                <dt>Platform</dt><dd>{appInfo?.platform || navigator.platform}</dd>
              </dl>
              <div className="wb-about-actions">
                <button type="button" className="wb-secondary-btn" onClick={() => void window.electronAPI.showAbout()}>Open System About Panel</button>
              </div>
              <p className="wb-settings-credit">Icons: Codicons by Microsoft, CC BY 4.0. Editor: Monaco (MIT). See THIRD_PARTY_NOTICES.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
