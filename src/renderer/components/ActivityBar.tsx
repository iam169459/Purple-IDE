import React from 'react';
import { Codi } from './codicons';
import { shortcutFor } from '../../shared/commands';

export type ActivityId = 'explorer' | 'search' | 'source-control' | 'ai-chat' | 'agents' | 'settings' | 'account';

interface Props {
  activeId: ActivityId | null;
  isMac: boolean;
  badges?: Partial<Record<ActivityId, number>>;
  onSelect: (id: ActivityId) => void;
}

interface ActivityEntry {
  id: ActivityId;
  icon: string;
  label: string;
  /** Command whose shortcut is advertised for this entry. */
  command?: string;
}

const TOP_ITEMS: ActivityEntry[] = [
  { id: 'explorer', icon: 'files', label: 'Explorer', command: 'focus-explorer' },
  { id: 'search', icon: 'search', label: 'Search', command: 'focus-search' },
  { id: 'source-control', icon: 'source-control', label: 'Source Control', command: 'focus-source-control' },
  { id: 'ai-chat', icon: 'sparkle', label: 'AI Chat', command: 'toggle-ai-chat' },
  { id: 'agents', icon: 'organization', label: 'Agents', command: 'show-agents' },
];

const BOTTOM_ITEMS: ActivityEntry[] = [
  { id: 'settings', icon: 'settings-gear', label: 'Settings', command: 'open-settings' },
  { id: 'account', icon: 'account', label: 'Account & About' },
];

const formatBadge = (count?: number) => (count && count > 0 ? (count > 99 ? '99+' : String(count)) : null);

const ActivityBar: React.FC<Props> = ({ activeId, isMac, badges, onSelect }) => {
  const renderItem = (entry: ActivityEntry, bottom = false) => {
    const isActive = activeId === entry.id;
    const shortcut = entry.command ? shortcutFor(entry.command, isMac) : '';
    const badge = formatBadge(badges?.[entry.id]);
    return (
      <button
        key={entry.id}
        type="button"
        className={`wb-activity-btn ${bottom ? 'is-bottom' : ''} ${isActive ? 'is-active' : ''}`}
        onClick={() => onSelect(entry.id)}
        aria-label={entry.label}
        aria-pressed={isActive}
        aria-keyshortcuts={shortcut.replace(/[⌘⌥⌃⇧]/g, '')}
        title={`${entry.label}${shortcut ? ` (${shortcut})` : ''}${badge ? ` · ${badge}` : ''}`}
      >
        <Codi name={entry.icon} size={bottom ? 20 : 24} />
        {badge && <span className="wb-activity-badge" aria-hidden="true">{badge}</span>}
      </button>
    );
  };

  return (
    <nav className="wb-activity" aria-label="Activity Bar">
      <div className="wb-activity-top">{TOP_ITEMS.map((entry) => renderItem(entry))}</div>
      <div className="wb-activity-spacer" />
      <div className="wb-activity-bottom">{BOTTOM_ITEMS.map((entry) => renderItem(entry, true))}</div>
    </nav>
  );
};

export default ActivityBar;
