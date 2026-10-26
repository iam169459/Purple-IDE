import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Logger, RecentFile } from './types';

const ROOT_KEY = 'purple-workspace-root';

/**
 * Sole owner of workspace-level state: the root folder, recent files, the file
 * tree refresh token and Git status. The editor session never mutates these
 * directly; it calls `refreshAfterWrite` after a successful write.
 */
export function useWorkspace(log: Logger) {
  const [rootFolder, setRootFolderState] = useState<string | null>(() => {
    try { return localStorage.getItem(ROOT_KEY); } catch { return null; }
  });
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [treeVersion, setTreeVersion] = useState(0);
  const [git, setGit] = useState<{ branch: string | null; changeCount: number }>({
    branch: null,
    changeCount: 0,
  });

  const refreshRecent = useCallback(async () => {
    try {
      const result = await window.electronAPI.getRecentFiles();
      if (result.success) setRecentFiles(result.files.slice(0, 20));
    } catch {}
  }, []);

  const addRecent = useCallback((path: string) => {
    void window.electronAPI.addRecentFile(path);
    void refreshRecent();
  }, [refreshRecent]);

  const refreshTree = useCallback(() => setTreeVersion((value) => value + 1), []);

  const refreshGit = useCallback(async () => {
    if (!rootFolder) {
      setGit({ branch: null, changeCount: 0 });
      return;
    }
    try {
      const [branchResult, statusResult] = await Promise.all([
        window.electronAPI.gitCommand('git branch --show-current', rootFolder),
        window.electronAPI.gitCommand('git status --porcelain', rootFolder),
      ]);
      setGit({
        branch: branchResult.success ? branchResult.stdout.trim() || null : null,
        changeCount: statusResult.success
          ? statusResult.stdout.split('\n').filter((line) => line.trim().length > 0).length
          : 0,
      });
    } catch {
      setGit({ branch: null, changeCount: 0 });
    }
  }, [rootFolder]);

  const setRootFolder = useCallback((path: string | null) => {
    setRootFolderState(path);
    try {
      if (path) localStorage.setItem(ROOT_KEY, path);
      else localStorage.removeItem(ROOT_KEY);
    } catch {}
    setTreeVersion((value) => value + 1);
  }, []);

  const openFolder = useCallback(async () => {
    const result = await window.electronAPI.selectDirectory();
    if (!result.success) return;
    setRootFolder(result.path);
    log(`Opened folder ${result.path}`, 'info');
  }, [log, setRootFolder]);

  const applyGitState = useCallback((next: { branch: string | null; changeCount: number }) => {
    setGit(next);
  }, []);

  const refreshAfterWrite = useCallback(() => {
    refreshTree();
    void refreshGit();
    void refreshRecent();
  }, [refreshGit, refreshRecent, refreshTree]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    void refreshGit();
    const onFocus = () => { void refreshGit(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshGit]);

  useEffect(() => {
    if (!rootFolder) return;
    void window.electronAPI.getDirectory(rootFolder).then((result) => {
      if (!result.success) setRootFolder(null);
    });
    // Validate the restored root once, not on every folder change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workspaceName = useMemo(
    () => (rootFolder ? rootFolder.split(/[\\/]/).filter(Boolean).pop() || null : null),
    [rootFolder],
  );

  return {
    rootFolder,
    setRootFolder,
    openFolder,
    workspaceName,
    recentFiles,
    addRecent,
    refreshRecent,
    treeVersion,
    refreshTree,
    refreshAfterWrite,
    git,
    refreshGit,
    applyGitState,
  };
}
