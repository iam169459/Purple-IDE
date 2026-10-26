import React from 'react';
import AppLogo from './AppLogo';
import { Codi, IconArrowLeft, IconArrowRight, IconLayoutPanel, IconLayoutSidebar, IconSearch, IconSparkle, IconClose, IconMinus } from './codicons';
import { shortcutFor } from '../../shared/commands';

interface Props {
  isMac: boolean;
  isMaximized: boolean;
  workspaceName: string | null;
  sidebarVisible: boolean;
  panelVisible: boolean;
  aiVisible: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onToggleSidebar: () => void;
  onTogglePanel: () => void;
  onToggleAIChat: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenCommandPalette: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

const TitleBar: React.FC<Props> = ({
  isMac,
  isMaximized,
  workspaceName,
  sidebarVisible,
  panelVisible,
  aiVisible,
  canGoBack,
  canGoForward,
  onToggleSidebar,
  onTogglePanel,
  onToggleAIChat,
  onGoBack,
  onGoForward,
  onOpenCommandPalette,
  onMinimize,
  onMaximize,
  onClose,
}) => {
  const mod = isMac ? '⌘' : 'Ctrl';
  const projectLabel = workspaceName || 'Purple IDE';

  return (
    <header className={`wb-titlebar ${isMac ? 'is-mac' : 'is-win'}`}>
      <div className="wb-titlebar-left">
        <span className="wb-brand" aria-label="Purple IDE">
          <AppLogo size={18} />
          <span className="wb-brand-name">Purple IDE</span>
        </span>

        <div className="wb-nav-group" role="group" aria-label="Navigation">
          <button
            type="button"
            className="wb-iconbtn wb-navbtn"
            onClick={onGoBack}
            disabled={!canGoBack}
            title={`Go Back (${shortcutFor('go-back', isMac)})`}
            aria-label="Go Back"
          >
            <IconArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="wb-iconbtn wb-navbtn"
            onClick={onGoForward}
            disabled={!canGoForward}
            title={`Go Forward (${shortcutFor('go-forward', isMac)})`}
            aria-label="Go Forward"
          >
            <IconArrowRight size={16} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="wb-command-center"
        onClick={onOpenCommandPalette}
        title={`Command Palette (${shortcutFor('command-palette', isMac)})`}
        aria-label={`Open command palette. Search ${projectLabel}`}
      >
        <IconSearch size={14} />
        <span className="wb-command-center-label">Search {projectLabel}</span>
        <span className="wb-command-center-keys">
          <kbd>{mod}</kbd><kbd>⇧</kbd><kbd>P</kbd>
        </span>
      </button>

      <div className="wb-titlebar-right">
        <button
          type="button"
          className={`wb-iconbtn wb-layout-btn ${sidebarVisible ? 'is-active' : ''}`}
          onClick={onToggleSidebar}
          title={`Toggle Primary Side Bar (${shortcutFor('toggle-sidebar', isMac)})`}
          aria-label="Toggle Primary Side Bar"
          aria-pressed={sidebarVisible}
        >
          <IconLayoutSidebar size={18} />
        </button>
        <button
          type="button"
          className={`wb-iconbtn wb-layout-btn ${panelVisible ? 'is-active' : ''}`}
          onClick={onTogglePanel}
          title={`Toggle Panel (${shortcutFor('toggle-panel', isMac)})`}
          aria-label="Toggle Panel"
          aria-pressed={panelVisible}
        >
          <IconLayoutPanel size={18} />
        </button>
        <button
          type="button"
          className={`wb-iconbtn wb-layout-btn wb-ai-toggle ${aiVisible ? 'is-active' : ''}`}
          onClick={onToggleAIChat}
          title={`Toggle AI Chat (${shortcutFor('toggle-ai-chat', isMac)})`}
          aria-label="Toggle AI Chat"
          aria-pressed={aiVisible}
        >
          <IconSparkle size={18} />
        </button>

        {!isMac && (
          <div className="wb-window-controls">
            <button type="button" className="wb-windowbtn" onClick={onMinimize} title="Minimize" aria-label="Minimize">
              <IconMinus size={14} />
            </button>
            <button type="button" className="wb-windowbtn" onClick={onMaximize} title={isMaximized ? 'Restore' : 'Maximize'} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
              <Codi name={isMaximized ? 'chrome-restore' : 'chrome-maximize'} size={14} />
            </button>
            <button type="button" className="wb-windowbtn wb-windowbtn-close" onClick={onClose} title="Close" aria-label="Close">
              <IconClose size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TitleBar;
