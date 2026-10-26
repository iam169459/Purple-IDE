import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Codi, IconSearch } from './codicons';

export interface CommandItem {
  id: string;
  label: string;
  detail?: string;
  category?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

/** Small fuzzy scorer: earlier and more contiguous matches rank higher. */
function fuzzyScore(query: string, text: string): { score: number; matched: boolean } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, matched: true };
  let j = 0;
  let consecutive = 0;
  let bestConsecutive = 0;
  let firstMatch = -1;
  let matched = true;
  for (let i = 0; i < q.length; i++) {
    const idx = t.indexOf(q[i], j);
    if (idx === -1) { matched = false; break; }
    if (firstMatch === -1) firstMatch = idx;
    if (idx === j) { consecutive++; bestConsecutive = Math.max(bestConsecutive, consecutive); }
    else consecutive = 1;
    j = idx + 1;
  }
  const score = matched ? (firstMatch * 1000 - bestConsecutive * 100 + q.length) : -1;
  return { score, matched };
}

const CommandPalette: React.FC<Props> = ({ open, onClose, commands }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const raw = query.trim();
    return commands
      .map((command) => ({
        ...command,
        score: raw ? fuzzyScore(raw, `${command.label} ${command.detail || ''} ${command.category || ''}`).score : 0,
        matched: raw ? fuzzyScore(raw, `${command.label} ${command.detail || ''} ${command.category || ''}`).matched : true,
      }))
      .filter((command) => command.matched)
      .sort((a, b) => b.score - a.score);
  }, [query, commands]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    // Focus synchronously: requestAnimationFrame is throttled while the window
    // is in the background, which used to leave the palette without a caret.
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown, true);
    return () => window.removeEventListener('keydown', onWindowKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('.command-palette-item.selected');
    node?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const execute = useCallback(async (command: CommandItem | undefined) => {
    if (!command) return;
    onClose();
    await command.run();
  }, [onClose]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, Math.max(filtered.length - 1, 0))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); void execute(filtered[selected]); }
  }, [filtered, selected, onClose, execute]);

  if (!open) return null;

  const raw = query.trim();

  return (
    <div className="command-palette-overlay" onMouseDown={onClose} role="presentation">
      <div className="command-palette wb-command-palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="command-palette-header">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            className="command-palette-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKey}
            placeholder="Type a command…"
            aria-label="Command"
            spellCheck={false}
          />
          <span className="wb-command-palette-esc">Esc</span>
        </div>
        <div className="command-palette-list" role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-palette-empty">No matching commands</div>
          ) : filtered.map((item, index) => {
            const hotStart = raw ? item.label.toLowerCase().indexOf(raw.toLowerCase()) : -1;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={`command-palette-item ${index === selected ? 'selected' : ''}`}
                onMouseEnter={() => setSelected(index)}
                onClick={() => void execute(item)}
              >
                <span className="command-palette-category">{item.category || 'Command'}</span>
                <span className="command-palette-label">
                  {hotStart >= 0 ? (
                    <>
                      {item.label.slice(0, hotStart)}
                      <mark>{item.label.slice(hotStart, hotStart + raw.length)}</mark>
                      {item.label.slice(hotStart + raw.length)}
                    </>
                  ) : item.label}
                </span>
                {item.detail && <span className="command-palette-detail">{item.detail}</span>}
                {item.shortcut && <kbd className="command-palette-shortcut">{item.shortcut}</kbd>}
                <Codi name="chevron-right" size={12} className="command-palette-chevron" />
              </button>
            );
          })}
        </div>
        <div className="command-palette-footer">
          <span>{filtered.length} command{filtered.length === 1 ? '' : 's'}</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>⏎</kbd> run · <kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
