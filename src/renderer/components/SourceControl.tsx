import React, { useCallback, useEffect, useState } from 'react';
import { IconBranch, IconSync, IconX, IconCheck, IconMore } from './codicons';

interface Change {
  path: string;
  status: string;
  staged: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Untracked', '??': 'Untracked', '!': 'Ignored',
};

interface Props {
  rootFolder: string | null;
  onFileSelect: (p: string) => void;
  onStateChange?: (state: { branch: string | null; changeCount: number }) => void;
}

const SourceControl: React.FC<Props> = ({ rootFolder, onFileSelect, onStateChange }) => {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [branch, setBranch] = useState<string | null>(null);

  const git = useCallback(async (args: string[]): Promise<{ ok: boolean; out: string; err: string }> => {
    if (!rootFolder) return { ok: false, out: '', err: 'No workspace' };
    const cmd = ['git', ...args].map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ');
    const res = await (window.electronAPI as any).gitCommand?.(cmd, rootFolder);
    if (!res) return { ok: false, out: '', err: 'gitCommand IPC not available' };
    return { ok: res.success, out: res.stdout || '', err: res.stderr || '' };
  }, [rootFolder]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [br, st] = await Promise.all([
        git(['branch', '--show-current']),
        git(['status', '--porcelain']),
      ]);
      const nextBranch = br.ok ? br.out.trim() || null : null;
      setBranch(nextBranch);
      const parsed: Change[] = [];
      for (const line of (st.ok ? st.out : '').split('\n').filter(Boolean)) {
        const xy = line.slice(0, 2).trim();
        const path = line.slice(3).trim();
        if (!path) continue;
        parsed.push({ path, status: xy, staged: xy.includes('M') || xy.includes('A') || xy.includes('D') });
      }
      setChanges(parsed);
      onStateChange?.({ branch: nextBranch, changeCount: parsed.length });
    } finally {
      setLoading(false);
    }
  }, [git, onStateChange]);

  useEffect(() => { refresh(); }, [rootFolder, git]);

  const stage = useCallback(async (path: string, staged: boolean) => {
    const res = await git(staged ? ['reset', '-q', 'HEAD', '--', path] : ['add', '-q', '--', path]);
    if (res.ok) refresh();
  }, [git, refresh]);

  const discard = useCallback(async (path: string) => {
    const res = await git(['checkout', '--', path]);
    if (res.ok) refresh();
  }, [git, refresh]);

  const commit = useCallback(async () => {
    if (!message.trim()) return;
    const res = await git(['commit', '-q', '-m', message]);
    if (res.ok) { setMessage(''); refresh(); }
  }, [git, message, refresh]);

  return (
    <div className="scm-view">
      <div className="scm-header">
        <div className="scm-title">
          <IconBranch size={14} />
          <span>Source Control</span>
          {branch && <span className="scm-branch">{branch}</span>}
        </div>
        <div className="scm-actions">
          <button type="button" className="scm-icon-btn" onClick={refresh} title="Refresh">
            <IconSync size={14} />
          </button>
          <button type="button" className="scm-icon-btn" onClick={() => {}} title="More actions">
            <IconMore size={14} />
          </button>
        </div>
      </div>
      <div className="scm-count">
        {changes.length} change{changes.length === 1 ? '' : 's'}
      </div>
      <div className="scm-list">
        {loading && <div className="scm-empty">Loading…</div>}
        {changes.length === 0 && !loading && (
          <div className="scm-empty">No changes. Initialize a git repository or make changes to tracked files.</div>
        )}
        {changes.map((c) => (
          <div key={c.path} className={`scm-item ${c.staged ? 'staged' : ''}`}>
            <button
              type="button"
              className={`scm-stage ${c.staged ? 'active' : ''}`}
              onClick={() => stage(c.path, c.staged)}
              title={c.staged ? 'Unstage' : 'Stage'}
            >
              {c.staged ? <IconCheck size={12} /> : <IconX size={12} />}
            </button>
            <button
              type="button"
              className="scm-item-link"
              onClick={() => onFileSelect(rootFolder ? `${rootFolder.replace(/[\\/]+$/, '')}/${c.path}` : c.path)}
              title={c.path}
            >
              <span className="scm-status">{STATUS_LABELS[c.status] || c.status}</span>
              <span className="scm-path">{c.path}</span>
            </button>
            <button type="button" className="scm-icon-btn" onClick={() => discard(c.path)} title="Discard">
              <IconX size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="scm-commit">
        <textarea
          className="scm-commit-input"
          placeholder="Commit message (press Commit)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          spellCheck={false}
        />
        <div className="scm-commit-actions">
          <button
            type="button"
            className="scm-commit-btn"
            onClick={commit}
            disabled={!message.trim() || !rootFolder}
            title="Commit staged changes"
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
};

export default SourceControl;
