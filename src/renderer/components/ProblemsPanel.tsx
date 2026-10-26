import React, { useCallback, useMemo } from 'react';

interface Problem {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
}

interface Props {
  diagnostics: Problem[];
  onFileSelect: (path: string, line?: number) => void;
}

const SEVERITY_LABEL: Record<Problem['severity'], { label: string; color: string }> = {
  error: { label: 'Error', color: '#f48771' },
  warning: { label: 'Warning', color: '#d7ba7d' },
  info: { label: 'Info', color: '#3794ff' },
  hint: { label: 'Hint', color: '#6b9aff' },
};

const ProblemsPanel: React.FC<Props> = ({ diagnostics, onFileSelect }) => {
  const byFile = useMemo(() => {
    const m = new Map<string, Problem[]>();
    for (const d of diagnostics) {
      const arr = m.get(d.file) || [];
      arr.push(d);
      m.set(d.file, arr);
    }
    return m;
  }, [diagnostics]);

  const counts = useMemo(() => {
    let errors = 0, warnings = 0;
    for (const d of diagnostics) {
      if (d.severity === 'error') errors++;
      else if (d.severity === 'warning') warnings++;
    }
    return { errors, warnings };
  }, [diagnostics]);

  return (
    <div className="problems-panel">
      <div className="problems-header">
        <span className="problems-title">Problems</span>
        <span className={`problems-count ${counts.errors > 0 ? 'has-errors' : ''}`}>
          {counts.errors} error{counts.errors === 1 ? '' : 's'}{counts.errors > 0 && counts.warnings > 0 ? ', ' : ''}
          {counts.warnings} warning{counts.warnings === 1 ? '' : 's'}
        </span>
      </div>
      <div className="problems-list">
        {diagnostics.length === 0 && (
          <div className="problems-empty">No problems. Open a file with diagnostics (e.g. TypeScript) to see them here.</div>
        )}
        {Array.from(byFile.entries()).map(([file, problems]) => (
          <div key={file} className="problems-file">
            <div className="problems-file-header" onClick={() => onFileSelect(file)} title={file}>
              <span className="problems-file-name">{file.split('/').pop()}</span>
              <span className="problems-file-path">{file}</span>
            </div>
            <ul className="problems-items">
              {problems.map((p) => {
                const sev = SEVERITY_LABEL[p.severity];
                return (
                  <li key={`${p.file}:${p.line}`} className="problems-item" onClick={() => onFileSelect(p.file, p.line)}>
                    <span className={`problems-severity problems-severity-${p.severity}`} style={{ color: sev.color }}>
                      {sev.label}
                    </span>
                    <span className="problems-line">L{p.line}</span>
                    <span className="problems-message">{p.message}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProblemsPanel;
