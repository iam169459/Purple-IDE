import React from 'react';
import { Codi, IconBranch } from './codicons';

type Theme = 'purple-dark' | 'dark-modern' | 'light-modern' | 'high-contrast';
type OllamaState = 'checking' | 'connected' | 'offline';

interface Props {
  theme: Theme;
  branch: string | null;
  changeCount: number;
  errors: number;
  warnings: number;
  hasEditor: boolean;
  line: number;
  column: number;
  selectionLength: number;
  encoding: string;
  eol: string;
  language: string;
  indent: string;
  model: string;
  ollamaState: OllamaState;
  ollamaModelCount: number;
  onOpenSourceControl: () => void;
  onOpenProblems: () => void;
  onOpenAI: () => void;
  onOpenModelPicker: () => void;
  onOpenSettings: () => void;
}

const THEME_LABEL: Record<Theme, string> = {
  'purple-dark': 'Purple Dark',
  'dark-modern': 'Dark Modern',
  'light-modern': 'Light Modern',
  'high-contrast': 'High Contrast',
};

const StatusBar: React.FC<Props> = ({
  theme,
  branch,
  changeCount,
  errors,
  warnings,
  hasEditor,
  line,
  column,
  selectionLength,
  encoding,
  eol,
  language,
  indent,
  model,
  ollamaState,
  ollamaModelCount,
  onOpenSourceControl,
  onOpenProblems,
  onOpenAI,
  onOpenModelPicker,
  onOpenSettings,
}) => {
  const ollamaLabel = ollamaState === 'connected'
    ? 'Ollama'
    : ollamaState === 'checking'
      ? 'Checking Ollama…'
      : 'Ollama offline';

  return (
    <footer className="wb-status" aria-label="Status Bar">
      <div className="wb-status-left">
        <button
          type="button"
          className="wb-status-item is-clickable"
          onClick={onOpenSourceControl}
          title={branch ? `On branch ${branch}` : 'No Git repository detected'}
        >
          <IconBranch size={13} />
          <span>{branch || 'no branch'}</span>
          {changeCount > 0 && <span className="wb-status-pill">{changeCount}</span>}
        </button>

        <button
          type="button"
          className="wb-status-item is-clickable"
          onClick={onOpenProblems}
          title={`${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`}
        >
          <Codi name="error" size={12} />
          <span>{errors}</span>
          <Codi name="warning" size={12} />
          <span>{warnings}</span>
        </button>

        <button
          type="button"
          className={`wb-status-item is-clickable wb-ollama-status is-${ollamaState}`}
          onClick={onOpenAI}
          title={
            ollamaState === 'connected'
              ? `Ollama connected · ${ollamaModelCount} model${ollamaModelCount === 1 ? '' : 's'} available`
              : ollamaState === 'checking'
                ? 'Checking local Ollama server…'
                : 'Ollama is not reachable at localhost:11434 — run `ollama serve`'
          }
        >
          <span className="wb-status-dot" aria-hidden="true" />
          <span>{ollamaLabel}</span>
        </button>
      </div>

      <div className="wb-status-spacer" />

      <div className="wb-status-right">
        {hasEditor && (
          <>
            <span className="wb-status-item" title="Cursor position">
              Ln {line}, Col {column}
            </span>
            {selectionLength > 0 && (
              <span className="wb-status-item" title="Selected characters">
                {selectionLength} selected
              </span>
            )}
            <span className="wb-status-item" title="Indentation">{indent}</span>
            <span className="wb-status-item" title="File encoding">{encoding}</span>
            <span className="wb-status-item" title="End of line sequence">{eol}</span>
            <span className="wb-status-item" title="Language mode">{language}</span>
          </>
        )}
        <button
          type="button"
          className="wb-status-item is-clickable wb-model-chip"
          onClick={onOpenModelPicker}
          title={model ? `Active model: ${model}` : 'No model selected'}
        >
          <Codi name="sparkle" size={12} />
          <span>{model || 'No model'}</span>
        </button>
        <button
          type="button"
          className="wb-status-item is-clickable wb-theme-chip"
          onClick={onOpenSettings}
          title="Color Theme"
        >
          {THEME_LABEL[theme]}
        </button>
        <button
          type="button"
          className="wb-status-item is-clickable wb-status-icon"
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          <Codi name="settings-gear" size={14} />
        </button>
      </div>
    </footer>
  );
};

export default StatusBar;
