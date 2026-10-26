import React, { useEffect, useState } from 'react';

const ROLES = ['planner', 'frontend', 'backend', 'database', 'debugger'] as const;
type Role = (typeof ROLES)[number];
type RoleState = 'idle' | 'active' | 'done' | 'failed';

interface TaskLite {
  id: string;
  role: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

interface Props {
  onOpenSwarm?: () => void;
}

const BADGE_COLORS: Record<RoleState, { bg: string; fg: string }> = {
  idle: { bg: 'var(--bg-badge)', fg: 'var(--text-muted)' },
  active: { bg: 'var(--accent-soft)', fg: 'var(--accent-hover)' },
  done: { bg: 'rgba(90, 209, 156, 0.16)', fg: 'var(--success-text)' },
  failed: { bg: 'var(--error-bg)', fg: 'var(--error-text)' },
};

const ROLE_LABEL: Record<Role, string> = {
  planner: 'Plan',
  frontend: 'FE',
  backend: 'BE',
  database: 'DB',
  debugger: 'Debug',
};

const SwarmStatus: React.FC<Props> = ({ onOpenSwarm }) => {
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  const mergeTasks = (incoming?: TaskLite[]) => {
    if (!incoming) return;
    setTasks(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      for (const t of incoming) map.set(t.id, t);
      return Array.from(map.values());
    });
  };

  useEffect(() => {
    let disposed = false;
    const api = window.electronAPI;
    api.agentGetStatus?.()
      .then((res: any) => {
        if (disposed || !res?.success) return;
        setTasks(res.status?.tasks || []);
        setRunning(!!res.status?.running);
        setActiveAgent(res.status?.activeAgent || null);
      })
      .catch(() => {});

    const unsubs = [
      api.onAgentTaskStart?.((data: any) => {
        mergeTasks(data.task ? [data.task] : data.tasks);
        if (data.task?.status === 'running') { setRunning(true); setActiveAgent(data.task.role); }
        if (data.phase === 'planning') { setRunning(true); setActiveAgent('planner'); }
      }),
      api.onAgentTaskUpdate?.((data: any) => {
        mergeTasks(data.task ? [data.task] : []);
        setActiveAgent(null);
      }),
      api.onAgentComplete?.(() => {
        setRunning(false);
        setActiveAgent(null);
      }),
    ];

    return () => {
      disposed = true;
      unsubs.forEach(u => { if (typeof u === 'function') u(); });
    };
  }, []);

  const stateFor = (role: Role): RoleState => {
    const roleTasks = tasks.filter(t => t.role === role);
    if (roleTasks.some(t => t.status === 'failed')) return 'failed';
    if (role === activeAgent || roleTasks.some(t => t.status === 'running')) return 'active';
    if (roleTasks.length > 0 && roleTasks.every(t => t.status === 'done')) return 'done';
    return 'idle';
  };

  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.electronAPI.agentStop?.();
  };

  return (
    <div
      className="am-strip"
      onClick={() => onOpenSwarm?.()}
      title="Agent swarm status — click to open swarm console"
    >
      {ROLES.map(role => {
        const state = stateFor(role);
        const c = BADGE_COLORS[state];
        return (
          <span
            key={role}
            className={`am-badge ${state === 'active' ? 'active' : ''}`}
            style={{ background: c.bg, color: c.fg }}
          >
            {state === 'active' ? '◆ ' : ''}{ROLE_LABEL[role]}
          </span>
        );
      })}
      {total > 0 && <span className="am-strip-count">{done}/{total}</span>}
      {running && (
        <button className="am-strip-stop" onClick={handleStop} title="Stop swarm">■</button>
      )}
    </div>
  );
};

export default SwarmStatus;
