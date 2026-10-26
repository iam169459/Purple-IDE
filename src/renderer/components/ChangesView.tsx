import React, { useState, useEffect, useCallback } from 'react';

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber: number;
  content: string;
}

interface ChangeEntry {
  id: string;
  path: string;
  type: 'ai_write' | 'ai_edit' | 'user_save';
  summary: string;
  timestamp: number;
  diff?: DiffLine[];
}

interface Props {
  onFileSelect: (path: string) => void;
}

const LS_KEY = 'purple-changes-history';

const loadHistory = (): ChangeEntry[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};

const saveHistory = (entries: ChangeEntry[]) => {
  localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, 100)));
};

const ChangesView: React.FC<Props> = ({ onFileSelect }) => {
  const [entries, setEntries] = useState<ChangeEntry[]>(loadHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onDiff = (data: { path: string; diff: DiffLine[]; type: string }) => {
      const name = data.path.split('/').pop() || data.path;
      const entry: ChangeEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        path: data.path,
        type: data.type === 'created' ? 'ai_write' : 'ai_edit',
        summary: data.type === 'created' ? `Created ${name}` : `Edited ${name}`,
        timestamp: Date.now(),
        diff: data.diff,
      };
      setEntries(prev => {
        const next = [entry, ...prev].slice(0, 100);
        saveHistory(next);
        return next;
      });
    };

    const onFileChanged = (data: { path: string; content: string }) => {
      const name = data.path.split('/').pop() || data.path;
      const entry: ChangeEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        path: data.path,
        type: 'user_save',
        summary: `Saved ${name}`,
        timestamp: Date.now(),
      };
      setEntries(prev => {
        const next = [entry, ...prev].slice(0, 100);
        saveHistory(next);
        return next;
      });
    };

    window.electronAPI.onAiToolDiff(onDiff);
    window.electronAPI.onWorkspaceFileChanged(onFileChanged);
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
    localStorage.removeItem(LS_KEY);
  }, []);

  const changeIcon = (t: string) => {
    switch (t) {
      case 'ai_write': return '+';
      case 'ai_edit': return '~';
      case 'user_save': return '💾';
      default: return '•';
    }
  };

  const selected = entries.find(e => e.id === selectedId);
  const addedCount = selected?.diff?.filter(d => d.type === 'added').length || 0;
  const removedCount = selected?.diff?.filter(d => d.type === 'removed').length || 0;
  const contextCount = selected?.diff?.filter(d => d.type === 'context').length || 0;

  return (
    <div className="changes-view">
      <div className="changes-view-header">
        <span>Changes</span>
        <div className="changes-view-actions">
          <span className="changes-count">{entries.length} change{entries.length !== 1 ? 's' : ''}</span>
          {entries.length > 0 && (
            <button className="changes-clear-btn" onClick={clearAll}>Clear All</button>
          )}
        </div>
      </div>
      <div className="changes-view-body">
        <div className="changes-list">
          {entries.length === 0 && (
            <div className="changes-empty">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <p>No changes yet</p>
              <p className="changes-empty-hint">AI file writes and manual saves will appear here</p>
            </div>
          )}
          {entries.map(e => (
            <div
              key={e.id}
              className={`changes-entry ${selectedId === e.id ? 'selected' : ''} changes-entry-${e.type}`}
              onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}
              onDoubleClick={() => onFileSelect(e.path)}
            >
              <span className="changes-entry-icon">{changeIcon(e.type)}</span>
              <span className="changes-entry-summary">{e.summary}</span>
              <span className="changes-entry-time">
                {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {e.diff && (
                <span className="changes-entry-diff-badge">
                  ~{e.diff.length}
                </span>
              )}
            </div>
          ))}
        </div>
        {selected && selected.diff && selected.diff.length > 0 && (
          <div className="changes-diff">
            <div className="changes-diff-header">
              <span className="changes-diff-file" onClick={() => onFileSelect(selected.path)}>
                {selected.path.split('/').pop()}
              </span>
              <span className="changes-diff-stats">
                <span className="changes-diff-added">+{addedCount}</span>
                <span className="changes-diff-removed">-{removedCount}</span>
                <span className="changes-diff-context">{contextCount} ctx</span>
              </span>
            </div>
            <div className="changes-diff-lines">
              {selected.diff.map((d, i) => (
                <div key={i} className={`changes-diff-line changes-diff-${d.type}`}>
                  <span className="changes-diff-prefix">{d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '}</span>
                  <span className="changes-diff-lineno">{d.lineNumber}</span>
                  <span className="changes-diff-text">{d.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {selected && !selected.diff && (
          <div className="changes-diff-empty">
            <p>No diff available for this change</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangesView;
