import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface Props {
  id: string;
  cwd?: string;
  theme: string;
  isVisible: boolean;
}

const Terminal: React.FC<Props> = ({ id, cwd, theme, isVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialized = useRef(false);

  const getXTermTheme = useCallback(() => {
    if (theme === 'light' || theme === 'light-modern') {
      return { background: '#ffffff', foreground: '#1f1b2e', cursor: '#7c3aed', selectionBackground: '#ddd6fe' };
    }
    if (theme === 'purple-dark' || theme === 'purple') {
      return { background: '#0a0714', foreground: '#e8e6f0', cursor: '#a78bfa', selectionBackground: 'rgba(139,92,246,0.30)' };
    }
    if (theme === 'futuristic') {
      return { background: '#04070f', foreground: '#9fdcff', cursor: '#4dd8ff', selectionBackground: 'rgba(77,216,255,0.3)' };
    }
    if (theme === 'cyber') {
      return { background: '#07070f', foreground: '#00f0ff', cursor: '#ff00aa', selectionBackground: 'rgba(0,240,255,0.3)' };
    }
    if (theme === 'neon') {
      return { background: '#0d0221', foreground: '#f0e6ff', cursor: '#ff00ff', selectionBackground: 'rgba(255,0,255,0.3)' };
    }
    if (theme === 'purple') {
      return { background: '#1a1025', foreground: '#e4d5f5', cursor: '#a855f7', selectionBackground: 'rgba(168,85,247,0.3)' };
    }
    if (theme === 'black') {
      return { background: '#000000', foreground: '#e0e0e0', cursor: '#6ea8fe', selectionBackground: 'rgba(110,168,254,0.3)' };
    }
    return { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: '#264f78' };
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current || initialized.current) return;
    initialized.current = true;

    const term = new XTerminal({
      theme: getXTermTheme(),
      fontFamily: '"Cascadia Code", "Fira Code", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    window.electronAPI.terminalCreate(id, cwd);

    term.onData((data: string) => {
      window.electronAPI.terminalWrite(id, data);
    });

    const resizeObs = new ResizeObserver(() => {
      const node = containerRef.current;
      if (!fitAddonRef.current || !node || node.clientWidth === 0 || node.clientHeight === 0) return;
      fitAddonRef.current.fit();
      const { cols, rows } = term;
      window.electronAPI.terminalResize(id, cols, rows);
    });
    resizeObs.observe(containerRef.current);

    const handleData = (_id: string, data: string) => {
      if (_id === id && termRef.current) {
        termRef.current.write(data);
      }
    };

    const handleExit = (_id: string, _code: number) => {
      if (_id === id && termRef.current) {
        termRef.current.writeln('\r\n\x1b[38;5;208m[Process exited]\x1b[0m');
      }
    };

    window.electronAPI.onTerminalData(handleData);
    window.electronAPI.onTerminalExit(handleExit);

    return () => {
      resizeObs.disconnect();
      window.electronAPI.terminalKill(id);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      initialized.current = false;
    };
  }, [id, cwd]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getXTermTheme();
    }
  }, [theme, getXTermTheme]);

  useEffect(() => {
    if (!isVisible || !fitAddonRef.current) return;
    const timer = setTimeout(() => {
      const node = containerRef.current;
      if (!node || node.clientWidth === 0 || node.clientHeight === 0) return;
      fitAddonRef.current?.fit();
    }, 50);
    return () => clearTimeout(timer);
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
};

export default Terminal;
