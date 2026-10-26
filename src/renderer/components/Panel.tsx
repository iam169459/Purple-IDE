import React from 'react';
import { Sash } from './Sash';
import OutputPanel from './OutputPanel';
import ProblemsPanel from './ProblemsPanel';
import TerminalPanel from './TerminalPanel';
import { useWorkbench } from '../workbench/WorkbenchProvider';
import type { PanelViewId } from '../workbench/types';

interface Props {
  theme: 'purple-dark' | 'dark-modern' | 'light-modern' | 'high-contrast';
  runningFile: boolean;
  onRun: () => void;
}

const TABS: { id: PanelViewId; label: string; icon: string }[] = [
  { id: 'problems', label: 'Problems', icon: 'error' },
  { id: 'output', label: 'Output', icon: 'output' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
];

/**
 * Bottom panel shell. The terminal view stays mounted while another view is
 * selected so its pty sessions survive tab switches.
 */
const Panel: React.FC<Props> = ({ theme, runningFile, onRun }) => {
  const { layout, session, output, workspace } = useWorkbench();
  const panelVisible = layout.panelVisible;
  const panelHeight = layout.panelHeight;
  const panelView = layout.activePanelView;
  const problemCount = session.errorCount + session.warningCount;

  return (
    <>
      {panelVisible && (
        <Sash
          orientation="horizontal"
          position={panelHeight}
          min={120}
          max={500}
          onChange={layout.resizePanel}
          label="Resize Panel"
        />
      )}
      <section
        className="wb-bottom"
        style={{ height: panelHeight }}
        hidden={!panelVisible}
        aria-label="Panel"
      >
        <div className="wb-bottom-tabs" role="tablist" aria-label="Panel views">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={panelView === tab.id}
              className={`wb-bottom-tab ${panelView === tab.id ? 'is-active' : ''}`}
              onClick={() => layout.setActivePanelView(tab.id)}
            >
              <span className={`codicon codicon-${tab.icon}`} />
              <span>{tab.label}</span>
              {tab.id === 'problems' && problemCount > 0 && (
                <span className="wb-panel-badge">{problemCount}</span>
              )}
            </button>
          ))}
          <div className="wb-bottom-actions">
            <button
              type="button"
              className="wb-iconbtn"
              onClick={onRun}
              title="Run Active File"
              aria-label="Run Active File"
              disabled={!session.activeRecord}
            >
              <span className="codicon codicon-play" />
            </button>
            <button
              type="button"
              className="wb-iconbtn"
              onClick={layout.closePanel}
              title="Close Panel"
              aria-label="Close Panel"
            >
              <span className="codicon codicon-close" />
            </button>
          </div>
        </div>

        <div className="wb-bottom-body">
          <div className="wb-panel-view" hidden={panelView !== 'problems'}>
            <ProblemsPanel
              diagnostics={session.problems}
              onFileSelect={(path, line) => session.selectFile(path, line)}
            />
          </div>
          <div className="wb-panel-view" hidden={panelView !== 'output'}>
            <OutputPanel
              lines={output.lines}
              running={runningFile}
              activeFileName={session.activeRecord?.name || null}
              onClear={output.clear}
              onRun={onRun}
            />
          </div>
          <div className="wb-panel-view" hidden={panelView !== 'terminal'}>
            <TerminalPanel
              rootFolder={workspace.rootFolder}
              theme={theme}
              isVisible={panelVisible && panelView === 'terminal'}
              onToggle={layout.closePanel}
              newTerminalSignal={layout.terminalSignal}
            />
          </div>
        </div>
      </section>
    </>
  );
};

export default Panel;
