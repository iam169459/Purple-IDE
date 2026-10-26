import React, { useState, useCallback, useRef, useEffect } from 'react';
import { IconClose } from './icons';

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

interface Props {
  rootFolder: string | null;
  onFileSelect: (path: string) => void;
  onError: (msg: string) => void;
  hideHeader?: boolean;
}

const SearchPanel: React.FC<Props> = ({ rootFolder, onFileSelect, onError, hideHeader = false }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!rootFolder || !q.trim()) {
      setResults([]);
      setDone(false);
      return;
    }
    setSearching(true);
    setDone(false);
    try {
      const res = await window.electronAPI.searchInFiles(rootFolder, q.trim());
      if (res.success) {
        setResults(res.results);
      } else {
        onError(res.error);
      }
    } catch (err) {
      onError((err as Error).message);
    }
    setSearching(false);
    setDone(true);
  }, [rootFolder, onError]);

  const handleInput = useCallback((val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 400);
  }, [doSearch]);

  const groupByFile = (): { file: string; matches: SearchResult[] }[] => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.file)) map.set(r.file, []);
      map.get(r.file)!.push(r);
    }
    return Array.from(map.entries()).map(([file, matches]) => ({ file, matches }));
  };

  const showFileName = (fp: string) => fp.split('/').pop() || fp;

  return (
    <div className="search-panel">
      {!hideHeader && (
        <div className="search-header">
          <h3>SEARCH</h3>
        </div>
      )}
      {!rootFolder ? (
        <div className="no-folder">
          <p>Open a folder to search files</p>
        </div>
      ) : (
      <>
      <div className="search-input-row">
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Search files..."
          value={query}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doSearch(query); }}
        />
        {query && (
          <button className="search-clear-btn" onClick={() => { setQuery(''); setResults([]); setDone(false); }}>
            <IconClose size={14} />
          </button>
        )}
      </div>
      {searching && <div className="search-status">Searching...</div>}
      {done && !searching && (
        <div className="search-status">
          {results.length > 0 ? `${results.length} results found` : 'No results found'}
        </div>
      )}
      <div className="search-results">
        {groupByFile().map(group => (
          <div key={group.file} className="search-group">
            <div className="search-group-file" title={group.file}>
              <span className="search-group-name">{showFileName(group.file)}</span>
              <span className="search-group-path">{group.file.replace(rootFolder || '', '')}</span>
            </div>
            {group.matches.map((m, i) => (
              <div
                key={i}
                className="search-match"
                onClick={() => onFileSelect(m.file)}
              >
                <span className="search-match-line">{m.line}</span>
                <span className="search-match-text">{m.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
};

export default SearchPanel;
