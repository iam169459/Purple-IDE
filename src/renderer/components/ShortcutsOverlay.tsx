import React, { useEffect, useMemo } from 'react';
import { Codi } from './codicons';
import { COMMANDS, formatAccelerator } from '../../shared/commands';

interface Props {
  open: boolean;
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const mod = isMac ? '⌘' : 'Ctrl';

const GROUP_FOR_CATEGORY: Record<string, string> = {
  File: 'General',
  Preferences: 'General',
  Help: 'General',
  View: 'View',
  AI: 'View',
  Terminal: 'View',
  Go: 'Navigation',
  Run: 'Navigation',
};

const GROUPS = ['General', 'View', 'Navigation'];

const ShortcutsOverlay: React.FC<Props> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groups = useMemo(
    () => GROUPS.map((title) => ({
      title,
      items: COMMANDS
        .filter((command) => command.accelerator && command.palette !== false)
        .filter((command) => (GROUP_FOR_CATEGORY[command.category] || 'General') === title)
        .map((command) => ({
          label: command.label,
          keys: formatAccelerator(command.accelerator as string, isMac),
        })),
    })).filter((group) => group.items.length > 0),
    [],
  );

  if (!open) return null;

  return (
    <div className="wb-shortcuts-overlay" onMouseDown={onClose} role="presentation">
      <div className="wb-shortcuts" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <header className="wb-shortcuts-header">
          <Codi name="keyboard" size={17} />
          <h2>Keyboard Shortcuts</h2>
          <button type="button" className="wb-iconbtn" onClick={onClose} title="Close" aria-label="Close">
            <Codi name="close" size={15} />
          </button>
        </header>
        <div className="wb-shortcuts-body">
          {groups.map((group) => (
            <section key={group.title} className="wb-shortcuts-group">
              <h3>{group.title}</h3>
              {group.items.map((item) => (
                <div key={item.label} className="wb-shortcut-row">
                  <span>{item.label}</span>
                  <kbd>{item.keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
        <footer className="wb-shortcuts-footer">
          Editor: <kbd>{mod}F</kbd> find, <kbd>{isMac ? '⌥' : 'Alt'}↑/{isMac ? '⌥' : 'Alt'}↓</kbd> add cursor
        </footer>
      </div>
    </div>
  );
};

export default ShortcutsOverlay;
