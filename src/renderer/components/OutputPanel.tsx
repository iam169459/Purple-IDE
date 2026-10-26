import React, { useEffect, useRef } from 'react';
import { Codi } from './codicons';

export type OutputKind = 'info' | 'command' | 'error' | 'success' | 'muted';

export interface OutputLine {
  id: number;
  time: number;
  text: string;
  kind: OutputKind;
}

interface Props {
  lines: OutputLine[];
  running?: boolean;
  activeFileName?: string | null;
  onClear: () => void;
  onRun?: () => void;
}

const formatTime = (time: number) => new Date(time).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const OutputPanel: React.FC<Props> = ({ lines, running = false, activeFileName, onClear, onRun }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <div className="wb-output">
      <div className="wb-output-toolbar">
        <span className="wb-output-channel">
          <span className="wb-output-dot" aria-hidden="true" />
          Purple IDE
        </span>
        {running && <span className="wb-output-running">Running…</span>}
        <span className="wb-output-spacer" />
        {onRun && (
          <button
            type="button"
            className="wb-output-action"
            onClick={onRun}
            title={activeFileName ? `Run ${activeFileName} (F5)` : 'Run the active file (F5)'}
            disabled={!activeFileName}
          >
            <Codi name="play" size={13} />
            <span>Run File</span>
          </button>
        )}
        <button
          type="button"
          className="wb-output-action"
          onClick={onClear}
          title="Clear output"
          disabled={lines.length === 0}
        >
          <Codi name="clear-all" size={13} />
          <span>Clear</span>
        </button>
      </div>
      <div className="wb-output-body" role="log" aria-live="polite">
        {lines.length === 0 ? (
          <div className="wb-output-empty">
            <Codi name="output" size={20} />
            <p>No output yet.</p>
            <span>Open a folder, save a file, or run the active file with F5 to see activity here.</span>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`wb-output-line is-${line.kind}`}>
              <span className="wb-output-time">{formatTime(line.time)}</span>
              <span className="wb-output-text">{line.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default OutputPanel;
