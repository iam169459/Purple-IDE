import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './Terminal';

interface Props {
  rootFolder: string | null;
  theme: 'purple-dark' | 'dark-modern' | 'light-modern' | 'high-contrast' | 'purple';
  isVisible: boolean;
  onToggle: () => void;
  newTerminalSignal?: number;
}

const TerminalPanel: React.FC<Props> = ({ rootFolder, theme, isVisible, onToggle, newTerminalSignal = 0 }) => {
  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const autoCreated = useRef(false);
  const handledSignal = useRef(0);

  const createTerminal = useCallback(() => {
    const id = 'term-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const name = `Terminal ${terminals.length + 1}`;
    setTerminals(prev => [...prev, { id, name }]);
    setActiveId(id);
  }, [terminals.length]);

  const closeTerminal = useCallback((id: string) => {
    window.electronAPI.terminalKill(id);
    setTerminals(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeId === id) setActiveId(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
  }, [activeId]);

  const handleCopy = useCallback(() => {
    const termEl = document.querySelector('.terminal-container .xterm-screen');
    if (termEl) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const text = range.toString();
        if (text) {
          navigator.clipboard.writeText(text);
          return;
        }
      }
    }
    navigator.clipboard.readText().then(text => {
      if (text) navigator.clipboard.writeText(text);
    });
  }, []);

  useEffect(() => {
    if (!isVisible || autoCreated.current) return;
    autoCreated.current = true;
    const id = 'term-' + Date.now().toString(36);
    setTerminals([{ id, name: 'Terminal 1' }]);
    setActiveId(id);
  }, [isVisible]);

  useEffect(() => {
    if (newTerminalSignal > handledSignal.current) {
      handledSignal.current = newTerminalSignal;
      createTerminal();
    }
  }, [newTerminalSignal, createTerminal]);

  return (
    <div className={`terminal-panel ${theme === 'light-modern' ? 'light' : theme}`}>
      <div className="terminal-header">
        <div className="terminal-tabs">
          {terminals.map(t => (
            <div
              key={t.id}
              className={`terminal-tab ${activeId === t.id ? 'active' : ''}`}
              onClick={() => setActiveId(t.id)}
            >
              <span>{t.name}</span>
              <button className="terminal-tab-close" onClick={(e) => { e.stopPropagation(); closeTerminal(t.id); }}>×</button>
            </div>
          ))}
        </div>
        <div className="terminal-actions">
          <button className="terminal-action-btn" onClick={handleCopy} title="Copy selected text">⧉</button>
          <button className="terminal-action-btn" onClick={createTerminal} title="New terminal">+</button>
          <button className="terminal-action-btn terminal-close-btn" onClick={onToggle} title="Close terminal">▾</button>
        </div>
      </div>
      <div className="terminal-body">
        {terminals.length === 0 ? (
          <div className="terminal-empty">
            <span>No terminals open.</span>
            <button className="terminal-new-btn" onClick={createTerminal}>+ New Terminal</button>
          </div>
        ) : (
          terminals.map(t => (
            <div key={t.id} style={{ display: t.id === activeId ? 'block' : 'none', width: '100%', height: '100%' }}>
              <Terminal
                id={t.id}
                cwd={rootFolder || undefined}
                theme={theme}
                isVisible={t.id === activeId && isVisible}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TerminalPanel;
