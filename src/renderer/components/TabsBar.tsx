import React from 'react';
import { Codi } from './codicons';

export interface Tab {
  id: string;
  name: string;
  path: string;
  isDirty: boolean;
}

interface Props {
  tabs: Tab[];
  activeTab: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNewFile?: () => void;
  onMidClick?: (path: string) => void;
  children?: React.ReactNode;
}

const fileIcon = (path: string): string => {
  if (path.startsWith('untitled:')) return 'file';
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'md' || ext === 'mdx') return 'markdown';
  if (ext === 'json' || ext === 'jsonc') return 'json';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return 'file-media';
  if (['zip', 'gz', 'tar', 'dmg'].includes(ext)) return 'file-binary';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'rb', 'java', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'swift', 'kt', 'sh', 'css', 'scss', 'html', 'vue', 'svelte'].includes(ext)) return 'file-code';
  return 'file';
};

const TabsBar: React.FC<Props> = ({ tabs, activeTab, onSelect, onClose, onNewFile, onMidClick, children }) => {
  const handleMouseDown = (e: React.MouseEvent, path: string) => {
    if (e.button === 1) {
      e.preventDefault();
      (onMidClick || onClose)(path);
    }
  };

  return (
    <div className="wb-tabs" role="tablist" aria-label="Open editors">
      <div className="wb-tabs-scroll">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.path;
          return (
            <div
              key={tab.path}
              className={`wb-tab ${isActive ? 'is-active' : ''} ${tab.isDirty ? 'is-dirty' : ''}`}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              title={tab.path.startsWith('untitled:') ? `${tab.name} (unsaved)` : tab.path}
              onClick={() => onSelect(tab.path)}
              onMouseDown={(e) => handleMouseDown(e, tab.path)}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tab.path); } }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.path); }
                if ((e.key === 'Delete' || e.key === 'Backspace') && !tab.isDirty) { e.preventDefault(); onClose(tab.path); }
              }}
            >
              <Codi name={fileIcon(tab.path)} size={14} className="wb-tab-icon" />
              <span className="wb-tab-name">{tab.name}</span>
              <span className="wb-tab-actions">
                {tab.isDirty && <span className="wb-tab-dirty" title="Unsaved changes" aria-label="Unsaved changes" />}
                <button
                  type="button"
                  className="wb-tab-close"
                  tabIndex={-1}
                  aria-label={`Close ${tab.name}`}
                  title={`Close ${tab.name}`}
                  onClick={(e) => { e.stopPropagation(); onClose(tab.path); }}
                >
                  <Codi name="close" size={14} />
                </button>
              </span>
            </div>
          );
        })}
        {onNewFile && (
          <button type="button" className="wb-tabs-new" onClick={onNewFile} title="New File (⌘N)" aria-label="New File">
            <Codi name="add" size={16} />
          </button>
        )}
      </div>
      {children && <div className="wb-tabs-actions">{children}</div>}
    </div>
  );
};

export default TabsBar;
