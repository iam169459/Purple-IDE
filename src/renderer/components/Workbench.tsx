import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TitleBar from './TitleBar';
import ActivityBar, { type ActivityId } from './ActivityBar';
import StatusBar from './StatusBar';
import { Sash } from './Sash';
import TabsBar from './TabsBar';
import Editor, { type EditorHandle, languageIdForPath } from './Editor';
import WorkbenchSidebar from './WorkbenchSidebar';
import AIAgent from './AIAgent';
import Welcome from './Welcome';
import Panel from './Panel';
import CommandPalette from './CommandPalette';
import QuickOpen from './QuickOpen';
import ModelPicker from './ModelPicker';
import ShortcutsOverlay from './ShortcutsOverlay';
import SettingsView, { type WorkbenchSettings, type SettingsCategory, type ThemeId } from './SettingsView';
import { TEAM_PRESETS } from '../orchestrator/presets';
import { WorkbenchProvider, useWorkbench } from '../workbench/WorkbenchProvider';
import { useCommands, type CommandActions } from '../workbench/useCommands';
import { ENDPOINT_LABELS } from '../workbench/ai';
import type { SideViewId } from '../workbench/types';
import '../styles/index.css';
import '@vscode/codicons/dist/codicon.css';

const SETTINGS_KEY = 'purple-settings-v2';

const DEFAULT_SETTINGS: WorkbenchSettings = {
  theme: 'purple-dark',
  fontSize: 13,
  wordWrap: false,
  minimap: true,
  aiTemperature: 0.3,
  aiToolsEnabled: true,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const loadSettings = (): WorkbenchSettings => {
  let stored: Partial<WorkbenchSettings> = {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) stored = JSON.parse(raw) as Partial<WorkbenchSettings>;
  } catch {}
  const themes: ThemeId[] = ['purple-dark', 'dark-modern', 'light-modern', 'high-contrast'];
  return {
    theme: stored.theme && themes.includes(stored.theme) ? stored.theme : DEFAULT_SETTINGS.theme,
    fontSize: clamp(Number(stored.fontSize) || 13, 10, 24),
    wordWrap: Boolean(stored.wordWrap),
    minimap: stored.minimap !== false,
    aiTemperature: clamp(Number(stored.aiTemperature) || 0, 0, 2),
    aiToolsEnabled: stored.aiToolsEnabled !== false,
  };
};

const WorkbenchShell: React.FC = () => {
  const { output, workspace, session, layout, ai } = useWorkbench();
  const { rootFolder, recentFiles, workspaceName } = workspace;
  const {
    openPath,
    newFile,
    save: saveActive,
    saveAs,
    saveAll,
    closeActive,
    cycle,
    goBack,
    goForward,
    applyExternalContent,
    reloadFromDisk,
  } = session;
  const {
    toggleSidebar,
    togglePanel,
    toggleAi,
    showPanel,
    toggleTerminal,
    newTerminal,
    showSideView: showSideViewRaw,
    resizeSidebar,
    resizeAi,
  } = layout;

  const [settings, setSettings] = useState<WorkbenchSettings>(loadSettings);
  const [isMac, setIsMac] = useState(typeof navigator !== 'undefined' && navigator.platform.includes('Mac'));
  const [isMaximized, setIsMaximized] = useState(false);
  const [runningFile, setRunningFile] = useState(false);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('appearance');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const editorRef = useRef<EditorHandle>(null);

  // Let the main process know when unsaved work exists so a required
  // (critical) update is never allowed to restart the app mid-edit.
  useEffect(() => {
    const dirtyCount = session.files.filter((file) => file.isDirty).length;
    window.electronAPI.reportDirtyState(dirtyCount);
  }, [session.files]);

  const updateSettings = useCallback((patch: Partial<WorkbenchSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const openSettings = useCallback((category: SettingsCategory = 'appearance') => {
    setSettingsCategory(category);
    setSettingsOpen(true);
  }, []);

  const showSideView = useCallback((view: SideViewId) => {
    setSettingsOpen(false);
    showSideViewRaw(view);
  }, [showSideViewRaw]);

  const showAgents = useCallback(() => showSideView('agents'), [showSideView]);

  const openFileDialog = useCallback(async () => {
    const result = await window.electronAPI.selectFile();
    if (result.success) await openPath(result.path);
  }, [openPath]);

  const openQuickOpen = useCallback(() => {
    if (rootFolder) setQuickOpenOpen(true);
    else void openFileDialog();
  }, [rootFolder, openFileDialog]);

  const runActiveFile = useCallback(async () => {
    const file = session.activeRecord;
    if (!file) {
      showPanel('output');
      output.log('No active file to run.', 'error');
      return;
    }
    if (file.untitled) {
      showPanel('output');
      output.log('Save the untitled file before running it.', 'error');
      return;
    }
    if (file.isDirty && !(await saveActive(file.path))) return;
    showPanel('output');
    setRunningFile(true);
    output.log(`$ run ${file.name}`, 'command');
    try {
      const result = await window.electronAPI.runCode(file.path);
      if (!result.success) {
        output.log(`Run failed: ${result.error}`, 'error');
        return;
      }
      const stdout = result.stdout.trim();
      const stderr = result.stderr.trim();
      stdout.split('\n').filter(Boolean).slice(-200).forEach((line) => output.log(line, 'info'));
      stderr.split('\n').filter(Boolean).slice(-200).forEach((line) => output.log(line, 'error'));
      if (!stdout && !stderr) output.log('(no output)', 'muted');
      output.log(
        `Process exited with code ${result.exitCode ?? '—'}`,
        result.exitCode === 0 ? 'success' : 'error',
      );
    } catch (error) {
      output.log(`Run failed: ${(error as Error).message}`, 'error');
    } finally {
      setRunningFile(false);
    }
  }, [output, saveActive, showPanel]);

  const actions = useMemo<CommandActions>(() => ({
    'new-file': newFile,
    'open-file': () => { void openFileDialog(); },
    'open-folder': () => { void workspace.openFolder(); },
    save: () => { void saveActive(); },
    'save-as': () => { if (session.activeFile) void saveAs(session.activeFile); },
    'save-all': () => { void saveAll(); },
    'close-editor': closeActive,
    'command-palette': () => setCommandPaletteOpen(true),
    'quick-open': openQuickOpen,
    'toggle-sidebar': toggleSidebar,
    'toggle-panel': togglePanel,
    'toggle-ai-chat': toggleAi,
    'show-agents': showAgents,
    'focus-explorer': () => showSideView('explorer'),
    'focus-search': () => showSideView('search'),
    'focus-source-control': () => showSideView('source-control'),
    'show-problems': () => showPanel('problems'),
    'show-output': () => showPanel('output'),
    'toggle-terminal': toggleTerminal,
    'new-terminal': newTerminal,
    'run-file': () => { void runActiveFile(); },
    'open-settings': () => openSettings('appearance'),
    'keyboard-shortcuts': () => setShortcutsOpen(true),
    'select-model': () => setModelPickerOpen(true),
    'go-back': goBack,
    'go-forward': goForward,
    'next-editor': () => cycle(1),
    'previous-editor': () => cycle(-1),
    'editor-action': (payload) => editorRef.current?.runAction(String(payload || '')),
    theme: (payload) => updateSettings({ theme: payload as ThemeId }),
  }), [
    closeActive, cycle, goBack, goForward, newFile, newTerminal, openFileDialog, openQuickOpen,
    openSettings, runActiveFile, saveActive, saveAll, saveAs, session.activeFile, showAgents,
    showPanel, showSideView, toggleAi, togglePanel, toggleSidebar, toggleTerminal, updateSettings,
    workspace.openFolder,
  ]);

  const { paletteCommands, run } = useCommands(actions, isMac);
  const runRef = useRef(run);
  runRef.current = run;

  const activityId: ActivityId | null = settingsOpen
    ? (settingsCategory === 'about' ? 'account' : 'settings')
    : layout.sidebarVisible
      ? layout.activeSideView
      : layout.aiVisible
        ? 'ai-chat'
        : null;

  const handleActivitySelect = useCallback((id: ActivityId) => {
    if (id === 'ai-chat') {
      if (!layout.aiVisible) toggleAi();
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.ai-input')?.focus());
      return;
    }
    if (id === 'settings') {
      openSettings('appearance');
      return;
    }
    if (id === 'account') {
      openSettings('about');
      return;
    }
    showSideView(id);
  }, [layout.aiVisible, openSettings, showSideView, toggleAi]);

  const activeLanguageId = session.metrics?.languageId
    || (session.activeFile ? languageIdForPath(session.activeFile) : 'plaintext');

  useEffect(() => {
    document.documentElement.classList.remove('theme-purple-dark', 'theme-dark-modern', 'theme-light-modern', 'theme-high-contrast');
    document.documentElement.classList.add(`theme-${settings.theme}`);
    document.documentElement.setAttribute('data-theme', settings.theme);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      localStorage.setItem('purple-theme', settings.theme);
    } catch {}
  }, [settings]);

  useEffect(() => {
    window.electronAPI.getPlatform().then(({ platform }) => setIsMac(platform === 'darwin')).catch(() => {});
    window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
    return window.electronAPI.onWindowStateChange(setIsMaximized);
  }, []);

  useEffect(() => {
    return window.electronAPI.onMenuCommand((command, payload) => runRef.current(command, payload));
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileWritten((data) => {
      applyExternalContent(data.resolvedPath, data.content);
      workspace.refreshTree();
    });
    return unsubscribe;
  }, [applyExternalContent, workspace.refreshTree]);

  useEffect(() => {
    return window.electronAPI.onFileChange((path) => { void reloadFromDisk(path); });
  }, [reloadFromDisk]);

  useEffect(() => {
    const unsubscribeDiff = window.electronAPI.onAiToolDiff((data) => {
      output.log(`${data.type === 'created' ? 'Created' : 'Updated'} ${data.path.split(/[\\/]/).pop()} via AI`, 'info');
      workspace.refreshTree();
    });
    const unsubscribeRun = window.electronAPI.onAiToolRun((data) => {
      if (data.command) output.log(`$ ${data.command}`, 'command');
      const text = [data.stdout, data.stderr].filter(Boolean).join('\n').trim();
      if (text) text.split('\n').slice(-80).forEach((line) => output.log(line, data.stderr ? 'error' : 'info'));
      if (data.exitCode != null) {
        output.log(`AI command exited with code ${data.exitCode}`, data.exitCode === 0 ? 'success' : 'error');
      }
    });
    return () => { unsubscribeDiff(); unsubscribeRun(); };
  }, [output.log, workspace.refreshTree]);

  return (
    <div className="purple-shell">
      <TitleBar
        isMac={isMac}
        isMaximized={isMaximized}
        workspaceName={workspaceName}
        sidebarVisible={layout.sidebarVisible}
        panelVisible={layout.panelVisible}
        aiVisible={layout.aiVisible}
        canGoBack={session.canGoBack}
        canGoForward={session.canGoForward}
        onToggleSidebar={toggleSidebar}
        onTogglePanel={togglePanel}
        onToggleAIChat={toggleAi}
        onGoBack={goBack}
        onGoForward={goForward}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onMinimize={() => window.electronAPI.minimize()}
        onMaximize={() => window.electronAPI.maximize()}
        onClose={() => window.electronAPI.close()}
      />

      <div className="wb-body">
        <ActivityBar
          activeId={activityId}
          isMac={isMac}
          badges={{
            'source-control': workspace.git.changeCount,
            'ai-chat': 0,
            agents: TEAM_PRESETS.length,
          }}
          onSelect={handleActivitySelect}
        />

        {layout.sidebarVisible && (
          <aside className="wb-sidebar" style={{ width: layout.sidebarWidth }} aria-label="Primary Side Bar">
            <WorkbenchSidebar
              view={layout.activeSideView}
              rootFolder={rootFolder}
              openFiles={session.files.map((file) => ({ path: file.path, name: file.name, isDirty: file.isDirty }))}
              activeFile={session.activeFile}
              activeContent={session.activeContent}
              languageId={activeLanguageId}
              recentFiles={recentFiles}
              refreshToken={workspace.treeVersion}
              onSelectFile={session.selectFile}
              onCloseFile={(path) => { void session.closeFile(path); }}
              onSetRootFolder={workspace.setRootFolder}
              onOpenFolder={() => { void workspace.openFolder(); }}
              onOpenFile={() => { void openFileDialog(); }}
              onNewFile={session.newFile}
              onRefresh={workspace.refreshTree}
              onOpenAI={() => { if (!layout.aiVisible) layout.toggleAi(); }}
              onError={output.log}
              onSourceStateChange={workspace.applyGitState}
            />
          </aside>
        )}
        {layout.sidebarVisible && (
          <Sash
            orientation="vertical"
            position={layout.sidebarWidth}
            min={240}
            max={480}
            onChange={layout.resizeSidebar}
            label="Resize Primary Side Bar"
          />
        )}

        <main className="wb-main">
          <div className="wb-main-top">
            {session.tabs.length > 0 && (
              <TabsBar
                tabs={session.tabs}
                activeTab={session.activeFile}
                onSelect={session.selectFile}
                onClose={(path) => { void session.closeFile(path); }}
                onNewFile={session.newFile}
              >
                <button
                  type="button"
                  className="wb-iconbtn"
                  onClick={() => { void runActiveFile(); }}
                  title="Run Active File (F5)"
                  aria-label="Run Active File"
                  disabled={!session.activeRecord}
                >
                  <span className="codicon codicon-play" style={{ fontSize: 14 }} />
                </button>
              </TabsBar>
            )}
            {session.activeFile && session.activeRecord ? (
              <Editor
                ref={editorRef}
                filePath={session.activeFile}
                content={session.activeRecord.content}
                rootFolder={rootFolder}
                onUpdate={session.updateContent}
                fontSize={settings.fontSize}
                theme={settings.theme}
                wordWrap={settings.wordWrap}
                minimap={settings.minimap}
                revealLine={session.reveal?.line}
                revealNonce={session.reveal?.nonce}
                onStateChange={session.reportState}
                onDiagnostics={session.reportDiagnostics}
              />
            ) : (
              <Welcome
                rootFolder={rootFolder}
                recentFiles={recentFiles}
                onNewFile={session.newFile}
                onOpenFile={() => { void openFileDialog(); }}
                onOpenFolder={() => { void workspace.openFolder(); }}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                onOpenAI={() => { if (!layout.aiVisible) layout.toggleAi(); }}
                onOpenAgents={showAgents}
                onOpenModelPicker={() => setModelPickerOpen(true)}
                onOpenSettings={() => openSettings('appearance')}
                onOpenShortcuts={() => setShortcutsOpen(true)}
                onOpenRecent={(path) => { void session.openPath(path); }}
              />
            )}
          </div>

          <Panel theme={settings.theme} runningFile={runningFile} onRun={() => { void runActiveFile(); }} />
        </main>

        {layout.aiVisible && (
          <Sash
            orientation="vertical"
            position={layout.aiWidth}
            min={320}
            max={720}
            onChange={layout.resizeAi}
            label="Resize AI Chat"
            className="wb-ai-sash"
          />
        )}
        {layout.aiVisible && (
          <aside className="wb-ai-panel" style={{ width: layout.aiWidth }} aria-label="AI Chat">
            <AIAgent
              aiToolsEnabled={settings.aiToolsEnabled}
              onAiToolsEnabledChange={(enabled) => updateSettings({ aiToolsEnabled: enabled })}
              aiTemperature={settings.aiTemperature}
              onOpenSwarm={showAgents}
              onClose={layout.toggleAi}
            />
          </aside>
        )}
      </div>

      <StatusBar
        theme={settings.theme}
        branch={workspace.git.branch}
        changeCount={workspace.git.changeCount}
        errors={session.errorCount}
        warnings={session.warningCount}
        hasEditor={Boolean(session.activeRecord)}
        line={session.metrics?.line ?? 1}
        column={session.metrics?.column ?? 1}
        selectionLength={session.metrics?.selectionLength ?? 0}
        encoding={session.activeRecord ? 'UTF-8' : '—'}
        eol={session.metrics?.eol ?? '—'}
        language={session.metrics?.language ?? '—'}
        indent={session.metrics ? `${session.metrics.insertSpaces ? 'Spaces' : 'Tabs'}: ${session.metrics.tabSize}` : '—'}
        model={ai.model}
        ollamaState={ai.ollamaState}
        ollamaModelCount={ai.ollamaModels.length}
        onOpenSourceControl={() => showSideView('source-control')}
        onOpenProblems={() => layout.showPanel('problems')}
        onOpenAI={() => { if (!layout.aiVisible) layout.toggleAi(); }}
        onOpenModelPicker={() => setModelPickerOpen(true)}
        onOpenSettings={() => openSettings('appearance')}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={paletteCommands}
      />

      {quickOpenOpen && rootFolder && (
        <QuickOpen
          rootFolder={rootFolder}
          onFileSelect={(path) => { void session.openPath(path); }}
          onClose={() => setQuickOpenOpen(false)}
        />
      )}

      <ModelPicker
        open={modelPickerOpen}
        models={ai.modelOptions}
        currentModel={ai.model}
        loading={ai.endpointType === 'ollama' ? ai.ollamaLoading : ai.endpointType === 'local_other' ? ai.localLoading : false}
        error={ai.endpointType === 'ollama' ? ai.ollamaError : ai.endpointType === 'local_other' ? ai.localError : null}
        endpointLabel={ENDPOINT_LABELS[ai.endpointType]}
        onSelect={ai.setModel}
        onRefresh={() => {
          if (ai.endpointType === 'ollama') void ai.refreshOllama();
          else if (ai.endpointType === 'local_other') void ai.refreshLocal();
        }}
        onClose={() => setModelPickerOpen(false)}
      />

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {settingsOpen && (
        <div className="wb-settings-overlay" onMouseDown={() => setSettingsOpen(false)} role="presentation">
          <div className="wb-settings-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <SettingsView
              settings={settings}
              initialCategory={settingsCategory}
              ollamaModels={ai.ollamaModels}
              ollamaState={ai.ollamaState}
              aiModel={ai.model}
              onChange={updateSettings}
              onAiModelChange={ai.setModel}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const Workbench: React.FC = () => (
  <WorkbenchProvider>
    <WorkbenchShell />
  </WorkbenchProvider>
);

export default Workbench;
