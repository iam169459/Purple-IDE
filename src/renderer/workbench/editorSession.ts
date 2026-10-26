import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorMetrics, EditorProblem } from '../components/Editor';
import type { Logger, OpenFile, RevealRequest } from './types';

interface Options {
  log: Logger;
  addRecent: (path: string) => void;
  refreshAfterWrite: () => void;
}

const basename = (filePath: string) => filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;

/**
 * Sole owner of the editor session: open files, active tab, dirty markers,
 * cursor/selection metrics, diagnostics and the back/forward history.
 */
export function useEditorSession({ log, addRecent, refreshAfterWrite }: Options) {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<EditorMetrics | null>(null);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, EditorProblem[]>>({});

  const filesRef = useRef<OpenFile[]>([]);
  const activeRef = useRef<string | null>(null);
  const navRef = useRef<{ entries: string[]; index: number }>({ entries: [], index: -1 });
  const [, setNavVersion] = useState(0);
  const untitledRef = useRef(0);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { activeRef.current = activeFile; }, [activeFile]);

  const recordNavigation = useCallback((path: string) => {
    const nav = navRef.current;
    const entries = nav.entries.slice(0, nav.index + 1);
    if (entries[entries.length - 1] !== path) entries.push(path);
    navRef.current = { entries, index: entries.length - 1 };
    setNavVersion((value) => value + 1);
  }, []);

  const openPath = useCallback(async (
    path: string,
    options?: { line?: number; record?: boolean },
  ): Promise<boolean> => {
    const existing = filesRef.current.find((file) => file.path === path);
    if (existing) {
      setActiveFile(path);
      if (options?.record !== false) recordNavigation(path);
      if (options?.line) setReveal({ path, line: options.line, nonce: Date.now() });
      return true;
    }

    const result = await window.electronAPI.openFile(path);
    if (!result.success) {
      log(`Cannot open ${basename(path)}: ${result.error}`, 'error');
      return false;
    }
    setFiles((previous) => previous.some((file) => file.path === path)
      ? previous
      : [...previous, {
          path,
          name: basename(path),
          content: result.content,
          savedContent: result.content,
          isDirty: false,
          untitled: false,
        }]);
    setActiveFile(path);
    if (options?.record !== false) recordNavigation(path);
    if (options?.line) setReveal({ path, line: options.line, nonce: Date.now() });
    log(`Opened ${basename(path)}`, 'muted');
    addRecent(path);
    return true;
  }, [addRecent, log, recordNavigation]);

  const selectFile = useCallback((path: string, line?: number) => {
    void openPath(path, { line });
  }, [openPath]);

  const newFile = useCallback(() => {
    untitledRef.current += 1;
    const id = `untitled:${untitledRef.current}`;
    const name = `Untitled-${untitledRef.current}`;
    setFiles((previous) => [...previous, {
      path: id,
      name,
      content: '',
      savedContent: '',
      isDirty: false,
      untitled: true,
    }]);
    setActiveFile(id);
    recordNavigation(id);
    log(`Created ${name}`, 'muted');
  }, [log, recordNavigation]);

  const updateContent = useCallback((content: string) => {
    const path = activeRef.current;
    if (!path) return;
    setFiles((previous) => previous.map((file) => file.path === path
      ? { ...file, content, isDirty: content !== file.savedContent }
      : file));
  }, []);

  const saveAs = useCallback(async (path: string): Promise<string | null> => {
    const file = filesRef.current.find((entry) => entry.path === path);
    if (!file) return null;
    const result = await window.electronAPI.saveFileAs(file.untitled ? file.name : file.path, file.content);
    if (!result.success) {
      if (result.error !== 'Canceled') log(`Save failed: ${result.error}`, 'error');
      return null;
    }
    const newPath = result.path;
    setFiles((previous) => previous.map((entry) => entry.path === path
      ? { ...entry, path: newPath, name: basename(newPath), savedContent: entry.content, isDirty: false, untitled: false }
      : entry));
    if (activeRef.current === path) setActiveFile(newPath);
    navRef.current.entries = navRef.current.entries.map((entry) => entry === path ? newPath : entry);
    setNavVersion((value) => value + 1);
    log(`Saved ${basename(newPath)}`, 'success');
    addRecent(newPath);
    refreshAfterWrite();
    return newPath;
  }, [addRecent, log, refreshAfterWrite]);

  const save = useCallback(async (path?: string): Promise<boolean> => {
    const target = path || activeRef.current;
    if (!target) return false;
    const file = filesRef.current.find((entry) => entry.path === target);
    if (!file) return false;
    if (file.untitled) return Boolean(await saveAs(target));
    const result = await window.electronAPI.saveFile(file.path, file.content);
    if (!result.success) {
      log(`Save failed for ${file.name}: ${result.error}`, 'error');
      return false;
    }
    setFiles((previous) => previous.map((entry) => entry.path === file.path
      ? { ...entry, savedContent: entry.content, isDirty: false }
      : entry));
    log(`Saved ${file.name}`, 'success');
    addRecent(file.path);
    refreshAfterWrite();
    return true;
  }, [addRecent, log, refreshAfterWrite, saveAs]);

  const saveAll = useCallback(async () => {
    for (const file of filesRef.current.filter((entry) => entry.isDirty)) {
      await save(file.path);
    }
  }, [save]);

  const closeFile = useCallback(async (path: string) => {
    const current = filesRef.current;
    const index = current.findIndex((file) => file.path === path);
    const file = current[index];
    if (!file) return;

    let closePath = path;
    if (file.isDirty) {
      const decision = await window.electronAPI.confirmUnsaved(file.name);
      if (!decision.success || decision.choice === 'cancel') return;
      if (decision.choice === 'save') {
        if (file.untitled) {
          const newPath = await saveAs(path);
          if (!newPath) return;
          closePath = newPath;
        } else if (!(await save(path))) {
          return;
        }
      }
    }

    const nextFiles = filesRef.current;
    const closingIndex = nextFiles.findIndex((entry) => entry.path === path);
    const remaining = nextFiles.filter((entry) => entry.path !== path && entry.path !== closePath);
    setFiles(remaining);
    setDiagnostics((previous) => {
      const next = { ...previous };
      delete next[path];
      delete next[closePath];
      return next;
    });
    if (activeRef.current === path || activeRef.current === closePath) {
      const next = remaining[Math.min(Math.max(closingIndex, 0), remaining.length - 1)];
      setActiveFile(next?.path || null);
      if (!next) setMetrics(null);
    }
  }, [save, saveAs]);

  const closeActive = useCallback(() => {
    if (activeRef.current) void closeFile(activeRef.current);
  }, [closeFile]);

  const cycle = useCallback((direction: number) => {
    const current = filesRef.current;
    if (current.length === 0) return;
    const index = current.findIndex((file) => file.path === activeRef.current);
    const next = current[(index + direction + current.length) % current.length];
    setActiveFile(next.path);
    recordNavigation(next.path);
  }, [recordNavigation]);

  const goBack = useCallback(() => {
    const nav = navRef.current;
    if (nav.index <= 0) return;
    nav.index -= 1;
    setNavVersion((value) => value + 1);
    void openPath(nav.entries[nav.index], { record: false });
  }, [openPath]);

  const goForward = useCallback(() => {
    const nav = navRef.current;
    if (nav.index >= nav.entries.length - 1) return;
    nav.index += 1;
    setNavVersion((value) => value + 1);
    void openPath(nav.entries[nav.index], { record: false });
  }, [openPath]);

  const reportState = useCallback((state: EditorMetrics) => setMetrics(state), []);

  const reportDiagnostics = useCallback((file: string, problems: EditorProblem[]) => {
    setDiagnostics((previous) => ({ ...previous, [file]: problems }));
  }, []);

  const applyExternalContent = useCallback((path: string, content: string) => {
    setFiles((previous) => previous.map((file) => file.path === path && !file.isDirty
      ? { ...file, content, savedContent: content, isDirty: false }
      : file));
  }, []);

  const reloadFromDisk = useCallback(async (path: string) => {
    const file = filesRef.current.find((entry) => entry.path === path);
    if (!file || file.isDirty) return;
    const result = await window.electronAPI.openFile(path);
    if (result.success) applyExternalContent(path, result.content);
  }, [applyExternalContent]);

  const activeRecord = useMemo(
    () => files.find((file) => file.path === activeFile) || null,
    [files, activeFile],
  );

  const activeContent = activeRecord?.content || '';

  const tabs = useMemo(
    () => files.map((file) => ({ id: file.path, name: file.name, path: file.path, isDirty: file.isDirty })),
    [files],
  );

  const problems = useMemo(() => Object.values(diagnostics).flat(), [diagnostics]);
  const errorCount = useMemo(
    () => problems.filter((problem) => problem.severity === 'error').length,
    [problems],
  );
  const warningCount = useMemo(
    () => problems.filter((problem) => problem.severity === 'warning').length,
    [problems],
  );

  return {
    files,
    activeFile,
    activeRecord,
    activeContent,
    tabs,
    metrics,
    reveal: reveal && reveal.path === activeFile ? reveal : null,
    diagnostics,
    problems,
    errorCount,
    warningCount,
    canGoBack: navRef.current.index > 0,
    canGoForward: navRef.current.index >= 0 && navRef.current.index < navRef.current.entries.length - 1,
    openPath,
    selectFile,
    newFile,
    updateContent,
    save,
    saveAs,
    saveAll,
    closeFile,
    closeActive,
    cycle,
    goBack,
    goForward,
    reportState,
    reportDiagnostics,
    applyExternalContent,
    reloadFromDisk,
  };
}
