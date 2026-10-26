import React, { useState, useCallback, useEffect, useRef } from 'react';

interface Props {
  rootFolder: string | null;
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

const QuickOpen: React.FC<Props> = ({ rootFolder, onFileSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (rootFolder) {
      window.electronAPI.searchFiles(rootFolder, '').then(res => {
        if (res.success) setAllFiles(res.files);
      });
    }
  }, [rootFolder]);

  useEffect(() => {
    if (!query.trim()) {
      setFiles(allFiles.slice(0, 100));
    } else {
      const lower = query.toLowerCase();
      const parts = lower.split(/\s+/).filter(Boolean);
      setFiles(allFiles.filter(f => parts.every(p => f.toLowerCase().includes(p))).slice(0, 100));
    }
    setSelected(0);
  }, [query, allFiles]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, files.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (files[selected]) {
        onFileSelect(files[selected]);
        onClose();
      }
    }
  }, [files, selected, onFileSelect, onClose]);

  const showFileName = (fp: string) => fp.split('/').pop() || fp;
  const showDir = (fp: string) => {
    const parts = fp.split('/');
    parts.pop();
    return parts.join('/');
  };

  return (
    <div className="quick-open-overlay" onClick={onClose}>
      <div className="quick-open-dialog" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quick-open-input"
          type="text"
          placeholder="Type to search files..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="quick-open-results">
          {files.map((f, i) => (
            <div
              key={f}
              className={`quick-open-item ${i === selected ? 'selected' : ''}`}
              onClick={() => { onFileSelect(f); onClose(); }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="quick-open-name">{showFileName(f)}</span>
              <span className="quick-open-dir">{showDir(f)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuickOpen;
