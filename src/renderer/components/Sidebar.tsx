import React from 'react';
import { IconFiles, IconSearch, IconWand, IconSettings } from './icons';

type TabId = 'explorer' | 'search' | 'ai' | 'settings' | 'multiagent';

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  aiActive: boolean;
  onOpenMultiAgent?: () => void;
}

const tabs: { id: TabId; icon: React.FC<{ className?: string; size?: number }>; label: string }[] = [
  { id: 'explorer', icon: IconFiles, label: 'Explorer' },
  { id: 'search', icon: IconSearch, label: 'Search' },
  { id: 'ai', icon: IconWand, label: 'AI Assistant' },
  { id: 'multiagent', icon: IconWand, label: 'Multi-Agent' },
  { id: 'settings', icon: IconSettings, label: 'Settings' },
];

const Sidebar: React.FC<Props> = ({ activeTab, onTabChange, aiActive, onOpenMultiAgent }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === 'ai' ? aiActive : activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`sidebar-tab ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (tab.id === 'multiagent' && onOpenMultiAgent) {
                  onOpenMultiAgent();
                } else {
                  onTabChange(tab.id);
                }
              }}
              title={tab.label}
            >
              <Icon />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Sidebar;
