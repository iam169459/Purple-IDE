import React, { createContext, useContext } from 'react';
import { useOutputLog } from './output';
import { useWorkspace } from './workspace';
import { useEditorSession } from './editorSession';
import { useLayout } from './layout';
import { useAiSettings } from './ai';

type WorkbenchStore = {
  output: ReturnType<typeof useOutputLog>;
  workspace: ReturnType<typeof useWorkspace>;
  session: ReturnType<typeof useEditorSession>;
  layout: ReturnType<typeof useLayout>;
  ai: ReturnType<typeof useAiSettings>;
};

const WorkbenchContext = createContext<WorkbenchStore | null>(null);

/**
 * One provider, four focused slices. Each slice owns its state outright; the
 * shell composes them and no component keeps a second copy.
 */
export const WorkbenchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const output = useOutputLog();
  const workspace = useWorkspace(output.log);
  const session = useEditorSession({
    log: output.log,
    addRecent: workspace.addRecent,
    refreshAfterWrite: workspace.refreshAfterWrite,
  });
  const layout = useLayout();
  const ai = useAiSettings(output.log);

  return (
    <WorkbenchContext.Provider value={{ output, workspace, session, layout, ai }}>
      {children}
    </WorkbenchContext.Provider>
  );
};

export function useWorkbench(): WorkbenchStore {
  const store = useContext(WorkbenchContext);
  if (!store) throw new Error('useWorkbench must be used inside WorkbenchProvider');
  return store;
}
