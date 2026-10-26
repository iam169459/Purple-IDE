import React, { useMemo, useState } from 'react';
import FileExplorer from './FileExplorer';
import SearchPanel from './SearchPanel';
import SourceControl from './SourceControl';
import { Codi } from './codicons';
import { extractSymbols, symbolIcon } from '../symbols';
import { TEAM_PRESETS } from '../orchestrator/presets';

export type SideViewId = 'explorer' | 'search' | 'source-control' | 'agents';

export interface SidebarOpenFile {
  path: string;
  name: string;
  isDirty: boolean;
}

interface RecentFileLite {
  path: string;
  name: string;
  timestamp: number;
}

interface Props {
  view: SideViewId;
  rootFolder: string | null;
  openFiles: SidebarOpenFile[];
  activeFile: string | null;
  activeContent: string;
  languageId: string;
  recentFiles: RecentFileLite[];
  refreshToken: number;
  onSelectFile: (path: string, line?: number) => void;
  onCloseFile: (path: string) => void;
  onSetRootFolder: (path: string) => void;
  onOpenFolder: () => void;
  onOpenFile: () => void;
  onNewFile: () => void;
  onRefresh: () => void;
  onOpenAI: () => void;
  onError: (message: string) => void;
  onSourceStateChange: (state: { branch: string | null; changeCount: number }) => void;
}

const relativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const SidebarSection: React.FC<{
  id: string;
  title: string;
  count?: number;
  defaultCollapsed?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, count, defaultCollapsed = false, actions, children }) => {
  const storageKey = `purple-sidebar-section:${id}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored == null ? defaultCollapsed : stored === 'true';
    } catch {
      return defaultCollapsed;
    }
  });

  const toggle = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try { localStorage.setItem(storageKey, String(next)); } catch {}
      return next;
    });
  };

  return (
    <section className={`wb-section ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="wb-section-header">
        <button type="button" className="wb-section-toggle" onClick={toggle} aria-expanded={!collapsed}>
          <Codi name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
          <span className="wb-section-title">{title}</span>
          {typeof count === 'number' && count > 0 && <span className="wb-section-count">{count}</span>}
        </button>
        {actions && <div className="wb-section-actions">{actions}</div>}
      </div>
      {!collapsed && <div className="wb-section-body">{children}</div>}
    </section>
  );
};

const ExplorerView: React.FC<Props> = ({
  rootFolder,
  openFiles,
  activeFile,
  activeContent,
  languageId,
  recentFiles,
  refreshToken,
  onSelectFile,
  onCloseFile,
  onSetRootFolder,
  onOpenFolder,
  onOpenFile,
  onNewFile,
  onRefresh,
  onError,
}) => {
  const symbols = useMemo(
    () => (activeFile ? extractSymbols(activeContent, languageId) : []),
    [activeFile, activeContent, languageId],
  );

  return (
    <div className="wb-explorer">
      <div className="wb-sidebar-viewheader">
        <span className="wb-sidebar-viewtitle">Explorer</span>
        <div className="wb-sidebar-viewactions">
          <button type="button" className="wb-iconbtn" onClick={onNewFile} title="New File (⌘N)" aria-label="New File">
            <Codi name="new-file" size={15} />
          </button>
          <button type="button" className="wb-iconbtn" onClick={onRefresh} title="Refresh Explorer" aria-label="Refresh Explorer">
            <Codi name="refresh" size={15} />
          </button>
        </div>
      </div>

      <div className="wb-sidebar-scroll">
        <SidebarSection id="open-editors" title="Open Editors" count={openFiles.length}>
          {openFiles.length === 0 ? (
            <div className="wb-sidebar-empty">No open editors</div>
          ) : openFiles.map((file) => (
            <div
              key={file.path}
              className={`wb-open-editor ${activeFile === file.path ? 'is-active' : ''}`}
              onClick={() => onSelectFile(file.path)}
              title={file.path}
            >
              <Codi name="file" size={13} />
              <span className="wb-open-editor-name">{file.name}</span>
              {file.isDirty && <span className="wb-open-editor-dirty" />}
              <button
                type="button"
                className="wb-open-editor-close"
                onClick={(e) => { e.stopPropagation(); onCloseFile(file.path); }}
                title={`Close ${file.name}`}
                aria-label={`Close ${file.name}`}
              >
                <Codi name="close" size={13} />
              </button>
            </div>
          ))}
        </SidebarSection>

        <SidebarSection
          id="workspace"
          title={rootFolder ? rootFolder.split(/[\\/]/).filter(Boolean).pop() || 'Workspace' : 'Workspace'}
          actions={(
            <>
              <button type="button" className="wb-iconbtn wb-iconbtn-sm" onClick={onNewFile} title="New File" aria-label="New File">
                <Codi name="add" size={14} />
              </button>
              <button type="button" className="wb-iconbtn wb-iconbtn-sm" onClick={onOpenFolder} title="Open Folder" aria-label="Open Folder">
                <Codi name="folder-opened" size={14} />
              </button>
            </>
          )}
        >
          <FileExplorer
            rootFolder={rootFolder}
            onFileSelect={(path) => onSelectFile(path)}
            onSetRootFolder={onSetRootFolder}
            onError={onError}
            activeFile={activeFile}
            hideHeader
            showRecent={false}
            refreshToken={refreshToken}
            onOpenFileRequest={onOpenFile}
            onNewFileRequest={onNewFile}
          />
        </SidebarSection>

        <SidebarSection id="outline" title="Outline" count={symbols.length}>
          {!activeFile ? (
            <div className="wb-sidebar-empty">Open a file to see its outline</div>
          ) : symbols.length === 0 ? (
            <div className="wb-sidebar-empty">No symbols found in this file</div>
          ) : symbols.map((symbol, index) => (
            <button
              key={`${symbol.name}-${symbol.line}-${index}`}
              type="button"
              className="wb-outline-item"
              onClick={() => onSelectFile(activeFile, symbol.line)}
              title={`${symbol.name} — line ${symbol.line}`}
            >
              <Codi name={symbolIcon(symbol.kind)} size={13} />
              <span>{symbol.name}</span>
              <span className="wb-outline-line">{symbol.line}</span>
            </button>
          ))}
        </SidebarSection>

        <SidebarSection id="timeline" title="Timeline" count={recentFiles.length} defaultCollapsed>
          {recentFiles.length === 0 ? (
            <div className="wb-sidebar-empty">No recent files</div>
          ) : recentFiles.slice(0, 12).map((file) => (
            <button
              key={`${file.path}-${file.timestamp}`}
              type="button"
              className="wb-timeline-item"
              onClick={() => onSelectFile(file.path)}
              title={file.path}
            >
              <Codi name="file" size={13} />
              <span className="wb-timeline-name">{file.name}</span>
              <span className="wb-timeline-time">{relativeTime(file.timestamp)}</span>
            </button>
          ))}
        </SidebarSection>
      </div>
    </div>
  );
};

const AgentsView: React.FC<{ onOpenAI: () => void }> = ({ onOpenAI }) => (
  <div className="wb-agents-view">
    <div className="wb-sidebar-viewheader">
      <span className="wb-sidebar-viewtitle">Agents</span>
      <span className="wb-sidebar-viewmeta">{TEAM_PRESETS.length} teams</span>
    </div>
    <div className="wb-sidebar-scroll">
      <p className="wb-agents-intro">
        Agent teams use the same local model and tools as AI Chat. Pick a team to see its roles.
      </p>
      {TEAM_PRESETS.map((preset) => (
        <section key={preset.id} className="wb-agent-team">
          <header>
            <div>
              <h3>{preset.name}</h3>
              <p>{preset.description}</p>
            </div>
            <span className="wb-agent-count">{preset.agents.length}</span>
          </header>
          <div className="wb-agent-chips">
            {preset.agents.map((agent) => (
              <span key={`${preset.id}-${agent.role}`} className="wb-agent-chip" title={agent.role}>
                <span className="wb-agent-emoji" aria-hidden="true">{agent.emoji}</span>
                <span>{agent.name}</span>
                <span className="wb-agent-role">{agent.role}</span>
              </span>
            ))}
          </div>
        </section>
      ))}
      <button type="button" className="wb-secondary-btn wb-agents-open" onClick={onOpenAI}>
        <Codi name="sparkle" size={14} />
        Open AI Chat
      </button>
    </div>
  </div>
);

const WorkbenchSidebar: React.FC<Props> = (props) => {
  const { view } = props;

  if (view === 'search') {
    return (
      <div className="wb-sidebar-view">
        <div className="wb-sidebar-viewheader">
          <span className="wb-sidebar-viewtitle">Search</span>
        </div>
        <div className="wb-sidebar-scroll">
          <SearchPanel
            rootFolder={props.rootFolder}
            onFileSelect={(path) => props.onSelectFile(path)}
            onError={props.onError}
            hideHeader
          />
        </div>
      </div>
    );
  }

  if (view === 'source-control') {
    return (
      <div className="wb-sidebar-view">
        <SourceControl
          rootFolder={props.rootFolder}
          onFileSelect={(path) => props.onSelectFile(path)}
          onStateChange={props.onSourceStateChange}
        />
      </div>
    );
  }

  if (view === 'agents') {
    return <AgentsView onOpenAI={props.onOpenAI} />;
  }

  return <ExplorerView {...props} />;
};

export default WorkbenchSidebar;
