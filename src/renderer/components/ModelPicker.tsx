import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Codi } from './codicons';

interface ModelOption {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  models: ModelOption[];
  currentModel: string;
  loading: boolean;
  error: string | null;
  endpointLabel: string;
  onSelect: (model: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

const ModelPicker: React.FC<Props> = ({
  open,
  models,
  currentModel,
  loading,
  error,
  endpointLabel,
  onSelect,
  onRefresh,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((model) => model.label.toLowerCase().includes(q) || model.value.toLowerCase().includes(q)) : models;
  }, [models, query]);

  if (!open) return null;

  return (
    <div className="wb-picker-overlay" onMouseDown={onClose} role="presentation">
      <div className="wb-picker" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Select model">
        <div className="wb-picker-header">
          <Codi name="sparkle" size={15} />
          <span>Select Model</span>
          <button type="button" className="wb-iconbtn" onClick={onRefresh} title="Refresh models" aria-label="Refresh models">
            <Codi name="refresh" size={14} className={loading ? 'codicon-modifier-spin' : ''} />
          </button>
          <button type="button" className="wb-iconbtn" onClick={onClose} title="Close" aria-label="Close">
            <Codi name="close" size={14} />
          </button>
        </div>
        <div className="wb-picker-search">
          <Codi name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter models"
            aria-label="Filter models"
            spellCheck={false}
          />
        </div>
        <div className="wb-picker-list" role="listbox">
          {loading && (
            <div className="wb-picker-status">
              <Codi name="loading" size={16} className="codicon-modifier-spin" />
              <span>Reading models from {endpointLabel}…</span>
            </div>
          )}
          {!loading && error && (
            <div className="wb-picker-status is-error">
              <Codi name="warning" size={16} />
              <div>
                <p>{endpointLabel} is not reachable.</p>
                <span>{error}</span>
              </div>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="wb-picker-status">
              <Codi name="info" size={16} />
              <span>{models.length === 0 ? `No models available from ${endpointLabel}.` : 'No models match the filter.'}</span>
            </div>
          )}
          {!loading && !error && filtered.map((model) => (
            <button
              key={model.value}
              type="button"
              role="option"
              aria-selected={model.value === currentModel}
              className={`wb-picker-item ${model.value === currentModel ? 'is-selected' : ''}`}
              onClick={() => { onSelect(model.value); onClose(); }}
            >
              <Codi name="sparkle" size={14} />
              <span className="wb-picker-name">{model.label}</span>
              {model.value === currentModel && <Codi name="check" size={14} className="wb-picker-check" />}
            </button>
          ))}
        </div>
        <div className="wb-picker-footer">
          <span>{models.length} model{models.length === 1 ? '' : 's'}</span>
          <span>{endpointLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default ModelPicker;
