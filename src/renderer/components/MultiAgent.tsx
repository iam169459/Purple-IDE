import React, { useEffect, useRef, useState, useCallback } from 'react';

const MODES = ['vibe', 'plan', 'ask', 'edit', 'review', 'debug'] as const;
type Mode = (typeof MODES)[number];

const MODE_HINT: Record<Mode, string> = {
  vibe: 'Auto-approve all writes, full autonomy',
  plan: 'Plan only — build the task DAG, no execution',
  ask: 'Read-only questions and analysis',
  edit: 'Confirm every write operation',
  review: 'Read-only code review with findings',
  debug: 'Diagnose and patch the latest failure',
};

interface AgentTask {
  id: string;
  role: string;
  description: string;
  dependencies: string[];
  expectedFiles: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
  summary?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  priority: number;
  hasKey: boolean;
  available: boolean;
}

interface ThoughtItem {
  agent: string;
  thought: string;
  ts: number;
  final?: boolean;
}

interface ToolLogItem {
  agent: string;
  tool: string;
  ok?: boolean;
  result?: string;
  ts: number;
}

interface ApprovalRequest {
  requestId: string;
  tool: string;
  path: string;
  preview: string;
}

interface Props {
  rootFolder: string | null;
  onClose: () => void;
}

const ROLE_EMOJI: Record<string, string> = {
  planner: '🧭', frontend: '🎨', backend: '⚙️', database: '🗄️', debugger: '🐛',
};

const STATUS_ICON: Record<string, string> = {
  pending: '○', running: '◐', done: '✓', failed: '✗',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--text-muted)',
  running: 'var(--accent-hover)',
  done: 'var(--success-text)',
  failed: 'var(--error-text)',
};

const PROVIDER_DOT: Record<string, string> = {
  ok: 'var(--success-text)',
  cooling: 'var(--warning-text)',
  nokey: 'var(--text-muted)',
};

const MultiAgent: React.FC<Props> = ({ rootFolder, onClose }) => {
  const [mode, setMode] = useState<Mode>('vibe');
  const [goal, setGoal] = useState('');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [running, setRunning] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [thoughts, setThoughts] = useState<ThoughtItem[]>([]);
  const [toolLog, setToolLog] = useState<ToolLogItem[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [keyInputFor, setKeyInputFor] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [showQueue, setShowQueue] = useState(true);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryText, setMemoryText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'thoughts' | 'tools'>('thoughts');

  const thoughtsEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const refreshProviders = useCallback(async () => {
    try {
      const res = await window.electronAPI.agentGetProviders();
      if (res.success) setProviders(res.providers);
    } catch {}
  }, []);

  const refreshMemory = useCallback(async () => {
    if (!rootFolder) return;
    try {
      const res = await window.electronAPI.agentGetMemory(rootFolder);
      if (res.success) setMemoryText(res.memory);
    } catch {}
  }, [rootFolder]);

  useEffect(() => {
    window.electronAPI.agentGetStatus?.().then((res: any) => {
      if (res?.success) {
        setTasks(res.status?.tasks || []);
        setRunning(!!res.status?.running);
      }
    }).catch(() => {});
    refreshProviders();
    refreshMemory();
  }, [refreshProviders, refreshMemory]);

  useEffect(() => {
    const mergeTasks = (incoming?: AgentTask[]) => {
      if (!incoming) return;
      setTasks(prev => {
        const map = new Map(prev.map(t => [t.id, t]));
        for (const t of incoming) map.set(t.id, t);
        return Array.from(map.values());
      });
    };

    const unsubs: Array<(() => void) | undefined> = [
      window.electronAPI.onAgentTaskStart((data: any) => {
        if (data.phase === 'planning') setPlanning(true);
        if (data.phase === 'planned' && data.tasks) { mergeTasks(data.tasks); setPlanning(false); }
        if (data.task) mergeTasks([data.task]);
      }),
      window.electronAPI.onAgentTaskUpdate((data: any) => {
        if (data.task) mergeTasks([data.task]);
      }),
      window.electronAPI.onAgentThoughtStream((data: any) => {
        if (!data.thought) return;
        setThoughts(prev => {
          const next = [...prev, { agent: data.agent, thought: data.thought, ts: Date.now(), final: data.final }];
          return next.slice(-80);
        });
      }),
      window.electronAPI.onAgentToolCall((data: any) => {
        setToolLog(prev => [...prev.slice(-60), { agent: data.agent, tool: data.tool, ts: Date.now() }]);
        setActiveTab('tools');
      }),
      window.electronAPI.onAgentToolResult((data: any) => {
        setToolLog(prev => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].tool === data.tool && next[i].agent === data.agent && next[i].ok === undefined) {
              next[i] = { ...next[i], ok: data.ok, result: data.result };
              break;
            }
          }
          return next;
        });
      }),
      window.electronAPI.onAgentApprovalRequest((data: any) => {
        setApproval(data);
      }),
      window.electronAPI.onAgentProviderSwitch((data: any) => {
        if (data.failedProvider) {
          setThoughts(prev => [...prev.slice(-79), {
            agent: 'router',
            thought: `Provider ${data.failedProvider} failed (${data.reason}) — failing over`,
            ts: Date.now(),
          }]);
        }
        refreshProviders();
      }),
      window.electronAPI.onAgentComplete(() => {
        setRunning(false);
        setPlanning(false);
        refreshProviders();
        refreshMemory();
      }),
    ];
    return () => unsubs.forEach(u => { if (typeof u === 'function') u(); });
  }, [refreshProviders, refreshMemory]);

  useEffect(() => {
    if (activeTab === 'thoughts') thoughtsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    else logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thoughts, toolLog, activeTab]);

  const handleStart = async () => {
    if (!goal.trim() || !rootFolder) {
      setError(rootFolder ? 'Describe a goal first.' : 'Open a workspace folder first.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    setRunning(true);
    setPlanning(true);
    setThoughts([]);
    setToolLog([]);
    try {
      await window.electronAPI.agentSetMode(mode);
      const res = await window.electronAPI.agentPlan(goal.trim(), rootFolder);
      if (res.success) {
        setTasks(res.tasks);
        if (mode !== 'plan') {
          await window.electronAPI.agentExecute();
        } else {
          setRunning(false);
        }
      } else {
        setError(res.error || 'Planning failed');
        setRunning(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    } finally {
      setPlanning(false);
    }
  };

  const handleStop = async () => {
    await window.electronAPI.agentStop();
    setRunning(false);
    setPlanning(false);
  };

  const handleSaveKey = async (providerId: string) => {
    if (keyDraft.trim()) {
      await window.electronAPI.agentSetKey(providerId, keyDraft.trim());
      setKeyDraft('');
      setKeyInputFor(null);
      refreshProviders();
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (approval) await window.electronAPI.agentApprove(approval.requestId, approved);
    setApproval(null);
  };

  const providerDot = (p: ProviderInfo) =>
    !p.available ? PROVIDER_DOT.cooling : (p.hasKey || p.id === 'ollama') ? PROVIDER_DOT.ok : PROVIDER_DOT.nokey;

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;
  const busy = running || planning;

  return (
    <div className="am-overlay">
      <div className="am-shell">
        {/* Header */}
        <div className="am-header">
          <div className="am-title">
            Agent Swarm
            {busy && (
              <span className="am-sub">
                <span className="am-live-dot" style={{ display: 'inline-block', marginRight: 6 }} />
                {planning ? 'planning…' : `running ${doneCount}/${tasks.length}`}
                {failedCount > 0 && <span style={{ color: 'var(--error-text)' }}> · {failedCount} failed</span>}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {busy ? (
              <button className="am-btn am-btn-danger" onClick={handleStop}>■ Stop</button>
            ) : null}
            <button className="am-btn" onClick={() => setShowMemory(!showMemory)} title="Workspace memory (.agent/memory.md)">🧠</button>
            <button className="am-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Memory drawer */}
        {showMemory && (
          <div className="am-memory">
            <div className="am-card-header" style={{ border: 'none', background: 'transparent', padding: '0 0 8px' }}>
              <span>.agent/memory.md</span>
              <button className="am-btn" style={{ padding: '2px 8px' }} onClick={refreshMemory}>↻</button>
            </div>
            <pre className="am-memory-pre">{memoryText || '(no workspace memory yet)'}</pre>
          </div>
        )}

        {/* Mode selector */}
        <div className="am-modes">
          {MODES.map(m => (
            <button
              key={m}
              className={`am-mode-chip ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
              title={MODE_HINT[m]}
            >{m}</button>
          ))}
        </div>
        <div className="am-mode-hint">{MODE_HINT[mode]}</div>

        {/* Providers */}
        <div className="am-providers">
          {providers.map(p => (
            <button
              key={p.id}
              className="am-provider-chip"
              onClick={() => { setKeyInputFor(keyInputFor === p.id ? null : p.id); setKeyDraft(''); }}
              title={`${p.name} · ${p.model}`}
            >
              <span className="am-provider-dot" style={{ background: providerDot(p) }} />
              {p.name}
            </button>
          ))}
          <span className="am-provider-note">click to set API key · auto-failover on 429/503</span>
        </div>
        {keyInputFor && (
          <div className="am-key-row">
            <input
              autoFocus
              type="password"
              className="am-key-input"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey(keyInputFor); }}
              placeholder={`${keyInputFor} API key`}
            />
            <button className="am-btn am-btn-primary" onClick={() => handleSaveKey(keyInputFor)}>Save</button>
          </div>
        )}

        {/* Goal + launch */}
        <div className="am-goal-row">
          <textarea
            className="am-goal"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart(); }}
            placeholder={rootFolder ? 'Describe the objective for the swarm… (⌘/Ctrl+Enter to launch)' : 'Open a workspace folder first…'}
            disabled={busy}
          />
          <button
            className="am-btn am-btn-primary"
            onClick={handleStart}
            disabled={busy || !goal.trim()}
            style={{ padding: '0 20px' }}
          >
            {planning ? 'Planning…' : running ? 'Running…' : 'Launch'}
          </button>
        </div>

        {error && <div className="am-error">{error}</div>}

        {/* Body */}
        <div className="am-body">
          {tasks.length > 0 && (
            <div className="am-card">
              <div className="am-card-header" onClick={() => setShowQueue(!showQueue)}>
                <span>Task Queue ({doneCount}/{tasks.length} done{failedCount > 0 ? ` · ${failedCount} failed` : ''})</span>
                <span>{showQueue ? '▼' : '▶'}</span>
              </div>
              {showQueue && tasks.map(t => (
                <div key={t.id} className="am-task">
                  <div className="am-task-row">
                    <span className="am-task-status" style={{ color: STATUS_COLOR[t.status] }}>{STATUS_ICON[t.status]}</span>
                    <span className="am-task-role">{ROLE_EMOJI[t.role] || '🤖'}</span>
                    <span className="am-task-desc" style={{ color: t.status === 'failed' ? 'var(--error-text)' : 'var(--text-primary)' }}>
                      {t.description}
                    </span>
                    {t.dependencies.length > 0 && (
                      <span className="am-task-deps">after: {t.dependencies.join(', ')}</span>
                    )}
                  </div>
                  {t.summary && (t.status === 'done' || t.status === 'failed') && (
                    <div className="am-task-summary" style={t.status === 'failed' ? { color: 'var(--error-text)' } : undefined}>
                      {t.summary.slice(0, 300)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="am-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="am-stream-tabs">
              {(['thoughts', 'tools'] as const).map(tab => (
                <button
                  key={tab}
                  className={`am-stream-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}{tab === 'tools' && toolLog.length > 0 ? ` (${toolLog.length})` : ''}
                </button>
              ))}
            </div>
            <div className="am-stream">
              {activeTab === 'thoughts' ? (
                thoughts.length === 0 ? (
                  <div className="am-empty">
                    {busy ? 'Waiting for agent reasoning…' : 'Launch the swarm to see real-time agent reasoning here.'}
                  </div>
                ) : thoughts.map((t, i) => (
                  <div key={i} className="am-thought">
                    <span className="am-thought-agent">{t.agent}</span>
                    <span className={`am-thought-text ${t.final ? 'final' : ''}`}>{t.thought}</span>
                  </div>
                ))
              ) : (
                toolLog.length === 0 ? (
                  <div className="am-empty">No tool calls yet.</div>
                ) : toolLog.map((t, i) => (
                  <div key={i} className="am-tool">
                    <span
                      className="am-tool-status"
                      style={{ color: t.ok === undefined ? 'var(--text-muted)' : t.ok ? 'var(--success-text)' : 'var(--error-text)' }}
                    >
                      {t.ok === undefined ? '…' : t.ok ? '✓' : '✗'}
                    </span>{' '}
                    <span className="am-tool-agent">{t.agent}</span>
                    <span className="am-tool-name">.{t.tool}()</span>
                    {t.result && <div className="am-tool-result">{t.result.slice(0, 200)}</div>}
                  </div>
                ))
              )}
              <div ref={activeTab === 'thoughts' ? thoughtsEndRef : logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Approval gate */}
      {approval && (
        <div className="am-approval">
          <div className="am-approval-card">
            <div className="am-approval-head">
              ⚠ Approval required — <code style={{ color: 'var(--accent-hover)' }}>{approval.tool}</code>
            </div>
            <div className="am-approval-path">
              Target: <code style={{ color: 'var(--text-primary)' }}>{approval.path || '(workspace)'}</code>
            </div>
            <pre className="am-approval-preview">{approval.preview || '(no preview)'}</pre>
            <div className="am-approval-actions">
              <button className="am-btn" onClick={() => handleApprove(false)}>Deny</button>
              <button className="am-btn am-btn-primary" onClick={() => handleApprove(true)}>Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiAgent;
