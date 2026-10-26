import React from 'react';
import AppLogo from './AppLogo';
import { Codi } from './codicons';
import { shortcutFor } from '../../shared/commands';

interface RecentFileLite {
  path: string;
  name: string;
  timestamp: number;
}

interface Props {
  rootFolder: string | null;
  recentFiles: RecentFileLite[];
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onOpenCommandPalette: () => void;
  onOpenAI: () => void;
  onOpenAgents: () => void;
  onOpenModelPicker: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenRecent: (path: string) => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const shortcut = (id: string) => shortcutFor(id, isMac);

const Action: React.FC<{
  icon: string;
  label: string;
  shortcut?: string;
  onClick: () => void;
}> = ({ icon, label, shortcut, onClick }) => (
  <button type="button" className="wb-welcome-action" onClick={onClick}>
    <Codi name={icon} size={16} />
    <span className="wb-welcome-action-label">{label}</span>
    {shortcut && <kbd>{shortcut}</kbd>}
  </button>
);

const relativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const Welcome: React.FC<Props> = ({
  rootFolder,
  recentFiles,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onOpenCommandPalette,
  onOpenAI,
  onOpenAgents,
  onOpenModelPicker,
  onOpenSettings,
  onOpenShortcuts,
  onOpenRecent,
}) => {
  const workspaceName = rootFolder?.split(/[\\/]/).filter(Boolean).pop() || null;

  return (
    <div className="wb-welcome">
      <div className="wb-welcome-inner">
        <header className="wb-welcome-hero">
          <AppLogo size={58} />
          <div>
            <h1>Purple IDE</h1>
            <p>{workspaceName ? <>Workspace <strong>{workspaceName}</strong></> : 'A focused code workbench with local AI'}</p>
          </div>
        </header>

        <div className="wb-welcome-grid">
          <section className="wb-welcome-section">
            <h2>Start</h2>
            <Action icon="new-file" label="New File" shortcut={shortcut('new-file')} onClick={onNewFile} />
            <Action icon="go-to-file" label="Open File..." shortcut={shortcut('open-file')} onClick={onOpenFile} />
            <Action icon="folder-opened" label="Open Folder..." shortcut={shortcut('open-folder')} onClick={onOpenFolder} />
            <Action icon="search" label="Command Palette" shortcut={shortcut('command-palette')} onClick={onOpenCommandPalette} />
          </section>

          <section className="wb-welcome-section">
            <h2>AI</h2>
            <Action icon="sparkle" label="Open AI Chat" shortcut={shortcut('toggle-ai-chat')} onClick={onOpenAI} />
            <Action icon="organization" label="Show Agents" shortcut={shortcut('show-agents')} onClick={onOpenAgents} />
            <Action icon="server-process" label="Choose Model" onClick={onOpenModelPicker} />
            <Action icon="settings-gear" label="AI Settings" shortcut={shortcut('open-settings')} onClick={onOpenSettings} />
            <div className="wb-welcome-note">
              <Codi name="info" size={13} />
              <span>Chat and agents use the active model. Ollama runs locally on this machine.</span>
            </div>
          </section>

          <section className="wb-welcome-section wb-welcome-recent">
            <h2>Recent</h2>
            {recentFiles.length === 0 ? (
              <div className="wb-welcome-empty">
                <Codi name="history" size={16} />
                <span>Files you open will appear here.</span>
              </div>
            ) : (
              recentFiles.slice(0, 8).map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className="wb-welcome-recent-item"
                  onClick={() => onOpenRecent(file.path)}
                  title={file.path}
                >
                  <Codi name="file" size={14} />
                  <span className="wb-welcome-recent-name">{file.name}</span>
                  <span className="wb-welcome-recent-time">{relativeTime(file.timestamp)}</span>
                </button>
              ))
            )}
          </section>
        </div>

        <footer className="wb-welcome-footer">
          <button type="button" className="wb-welcome-footer-link" onClick={onOpenShortcuts}>
            <Codi name="keyboard" size={14} />
            Keyboard Shortcuts
          </button>
          <button type="button" className="wb-welcome-footer-link" onClick={onOpenSettings}>
            <Codi name="settings-gear" size={14} />
            Settings
          </button>
          <span className="wb-welcome-spacer" />
          <span className="wb-welcome-version">Purple IDE · Monaco · Ollama</span>
        </footer>
      </div>
    </div>
  );
};

export default Welcome;
