import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IconFolder, IconFolderOpened, IconFile, IconPlus, IconChevronRight, IconChevronDown, IconFileSubmodule, IconSearch, IconRefresh } from './codicons';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FileNode extends FileItem {
  children: FileNode[];
  loaded: boolean;
}

interface ContextMenu {
  x: number;
  y: number;
  node: FileNode | null;
  parentDir: string | null;
}

interface Props {
  rootFolder: string | null;
  onFileSelect: (filePath: string) => void;
  onSetRootFolder: (folderPath: string) => void;
  onError: (msg: string) => void;
  activeFile?: string | null;
  hideHeader?: boolean;
  showRecent?: boolean;
  refreshToken?: number;
  onOpenFileRequest?: () => void;
  onNewFileRequest?: () => void;
}

const FileExplorer: React.FC<Props> = ({
  rootFolder,
  onFileSelect,
  onSetRootFolder,
  onError,
  activeFile,
  hideHeader = false,
  showRecent: showRecentProp = true,
  refreshToken = 0,
  onOpenFileRequest,
  onNewFileRequest,
}) => {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingInDir, setCreatingInDir] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder'>('file');
  const [clipboard, setClipboard] = useState<{ sourcePath: string; action: 'copy' | 'cut' } | null>(null);
  const [recentFiles, setRecentFiles] = useState<{ path: string; name: string; timestamp: number }[]>([]);
  const [showRecent, setShowRecent] = useState(showRecentProp);
  const renameRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const pathUtil = {
    basename: (p: string) => p.split('/').pop() || '',
    dirname: (p: string) => { const i = p.lastIndexOf('/'); return i > 0 ? p.substring(0, i) : p; },
    join: (...parts: string[]) => parts.join('/'),
  };

  useEffect(() => {
    if (rootFolder) {
      loadChildren(rootFolder, true);
    } else {
      setRootNodes([]);
    }
    window.electronAPI.getRecentFiles().then(res => {
      if (res.success) setRecentFiles(res.files);
    });
  }, [rootFolder, refreshToken]);

  useEffect(() => { setShowRecent(showRecentProp); }, [showRecentProp]);

  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!rootFolder) return;
    (async () => {
      const res = await window.electronAPI.gitCommand('git status --porcelain', rootFolder);
      if (res.success) {
        const map: Record<string, string> = {};
        for (const line of res.stdout.split('\n').filter(Boolean)) {
          const code = line.slice(0, 2).trim();
          const p = line.slice(3).trim();
          if (p) map[p] = code;
        }
        setGitStatus(map);
      }
    })();
  }, [rootFolder]);

  useEffect(() => {
    if (renamingPath && renameRef.current) {
      renameRef.current.value = pathUtil.basename(renamingPath);
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingPath]);

  useEffect(() => {
    if (creatingInDir && createRef.current) {
      createRef.current.value = '';
      createRef.current.focus();
    }
  }, [creatingInDir]);

  const loadChildren = async (dirPath: string, isRoot: boolean) => {
    setLoadingPaths(prev => new Set(prev).add(dirPath));
    try {
      const result = await window.electronAPI.getDirectory(dirPath);
      if (result.success && result.files) {
        const sorted: FileNode[] = result.files
          .map(f => ({ ...f, children: [], loaded: false }))
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        if (isRoot) {
          setRootNodes(sorted);
        } else {
          setRootNodes(prev => updateTreeNode(prev, dirPath, sorted));
        }
      }
    } catch (error) {
      onError('Failed to load directory: ' + (error as Error).message);
    } finally {
      setLoadingPaths(prev => { const n = new Set(prev); n.delete(dirPath); return n; });
    }
  };

  const updateTreeNode = (nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] =>
    nodes.map(n => {
      if (n.path === targetPath) return { ...n, children, loaded: true };
      if (n.children.length > 0) return { ...n, children: updateTreeNode(n.children, targetPath, children) };
      return n;
    });

  const refreshParent = (childPath: string) => {
    const parent = pathUtil.dirname(childPath);
    if (parent !== childPath) loadChildren(parent, parent === rootFolder);
  };

  const handleFolderClick = useCallback(async (node: FileNode) => {
    const willExpand = !expandedPaths.has(node.path);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      willExpand ? next.add(node.path) : next.delete(node.path);
      return next;
    });
    if (willExpand && !node.loaded) {
      await loadChildren(node.path, false);
    }
  }, [expandedPaths]);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode | null, parentDir: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node, parentDir });
  };

  const closeMenu = () => setContextMenu(null);

  const handleRename = (node: FileNode) => { closeMenu(); setRenamingPath(node.path); };

  const submitRename = async () => {
    if (!renamingPath || !renameRef.current) return;
    const newName = renameRef.current.value.trim();
    if (!newName || newName === pathUtil.basename(renamingPath)) {
      setRenamingPath(null);
      return;
    }
    try {
      const result = await window.electronAPI.renameEntry(renamingPath, newName);
      if (result.success) {
        refreshParent(renamingPath);
      } else {
        onError(result.error || 'Rename failed');
      }
    } catch (err) {
      onError('Rename failed: ' + (err as Error).message);
    }
    setRenamingPath(null);
  };

  const handleDelete = async (node: FileNode) => {
    closeMenu();
    const msg = `Delete ${node.isDirectory ? 'folder' : 'file'} "${node.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      const result = await window.electronAPI.deleteEntry(node.path);
      if (result.success) {
        refreshParent(node.path);
      } else {
        onError(result.error || 'Delete failed');
      }
    } catch (err) {
      onError('Delete failed: ' + (err as Error).message);
    }
  };

  const handleCopy = (node: FileNode) => { closeMenu(); setClipboard({ sourcePath: node.path, action: 'copy' }); };
  const handleCut = (node: FileNode) => { closeMenu(); setClipboard({ sourcePath: node.path, action: 'cut' }); };

  const handlePaste = async (targetDir: string) => {
    closeMenu();
    if (!clipboard) return;
    try {
      const fn = clipboard.action === 'copy' ? window.electronAPI.copyEntry : window.electronAPI.moveEntry;
      const result = await fn(clipboard.sourcePath, targetDir);
      if (result.success) {
        refreshParent(targetDir);
        if (clipboard.action === 'cut') refreshParent(pathUtil.dirname(clipboard.sourcePath));
        setClipboard(null);
      } else {
        onError(result.error || 'Paste failed');
      }
    } catch (err) {
      onError('Paste failed: ' + (err as Error).message);
    }
  };

  const handleNewFile = (parentDir: string) => { closeMenu(); setCreatingInDir(parentDir); setCreatingType('file'); };
  const handleNewFolder = (parentDir: string) => { closeMenu(); setCreatingInDir(parentDir); setCreatingType('folder'); };

  const submitCreate = async () => {
    if (!creatingInDir || !createRef.current) return;
    const name = createRef.current.value.trim();
    if (!name) { setCreatingInDir(null); return; }
    try {
      const result = creatingType === 'file'
        ? await window.electronAPI.createFile(creatingInDir, name)
        : await window.electronAPI.createDirectory(creatingInDir, name);
      if (result.success) {
        loadChildren(creatingInDir, creatingInDir === rootFolder);
        setExpandedPaths(prev => new Set(prev).add(creatingInDir));
      } else {
        onError(result.error || 'Creation failed');
      }
    } catch (err) {
      onError('Creation failed: ' + (err as Error).message);
    }
    setCreatingInDir(null);
  };

  const renderTree = (nodes: FileNode[], depth: number = 0) => (
    <ul style={{ marginLeft: depth > 0 ? 0 : 0, listStyle: 'none' }}>
      {nodes.map(node => (
        <li key={node.path}>
          <div
            className={`file-item ${node.isDirectory ? 'folder' : 'file'} ${activeFile === node.path ? 'selected' : ''}`}
            onClick={() => node.isDirectory ? handleFolderClick(node) : onFileSelect(node.path)}
            onContextMenu={e => handleContextMenu(e, node, pathUtil.dirname(node.path))}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            <span className="icon">
              {node.isDirectory ? (
                loadingPaths.has(node.path) ? <IconRefresh size={16} /> :
                expandedPaths.has(node.path) ? <IconFolderOpened size={16} /> : <IconFolder size={16} />
              ) : (
                <IconFile size={16} />
              )}
            </span>
            {renamingPath === node.path ? (
              <input
                ref={renameRef}
                className="inline-input"
                onClick={e => e.stopPropagation()}
                onBlur={submitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') setRenamingPath(null);
                }}
              />
            ) : (
              <span className="name">{node.name}</span>
            )}
            {!node.isDirectory && gitStatus[node.path] && (
              <span className="git-badge" title={gitStatus[node.path]}>{gitStatus[node.path]}</span>
            )}
          </div>
          {node.isDirectory && expandedPaths.has(node.path) && (
            <>
              {node.children.length > 0 && renderTree(node.children, depth + 1)}
              {creatingInDir === node.path && (
                <div className="file-item new-item" style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}>
                  <span className="icon">{creatingType === 'file' ? <IconFile size={16} /> : <IconFolder size={16} />}</span>
                  <input
                    ref={createRef}
                    className="inline-input"
                    placeholder={creatingType === 'file' ? 'filename.ext' : 'folder name'}
                    onBlur={submitCreate}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitCreate();
                      if (e.key === 'Escape') setCreatingInDir(null);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );

  const menuItems = (ctx: ContextMenu) => {
    const items: { label: string; action: () => void; separator?: boolean }[] = [];
    if (ctx.node) {
      if (!ctx.node.isDirectory) {
        items.push({ label: 'Open', action: () => { closeMenu(); onFileSelect(ctx.node!.path); } });
      }
      items.push({ label: 'Rename', action: () => handleRename(ctx.node!) });
      items.push({ label: 'Copy', action: () => handleCopy(ctx.node!) });
      items.push({ label: 'Cut', action: () => handleCut(ctx.node!) });
      items.push({ label: 'Delete', action: () => handleDelete(ctx.node!), separator: true });
    }
    const targetDir = ctx.node?.isDirectory ? ctx.node.path : ctx.parentDir!;
    items.push({ label: 'New File', action: () => handleNewFile(targetDir) });
    items.push({ label: 'New Folder', action: () => handleNewFolder(targetDir) });
    if (clipboard) {
      items.push({ label: clipboard.action === 'copy' ? 'Paste' : 'Paste', action: () => handlePaste(targetDir), separator: true });
    }
    return items;
  };

  return (
    <div className="file-explorer" onClick={closeMenu} onContextMenu={e => {
      if (rootFolder) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, node: null, parentDir: rootFolder });
      }
    }}>
      {!hideHeader && (
        <div className="explorer-header">
          <h3>Explorer</h3>
          <div className="explorer-actions">
            <button className="icon-btn" title="New File" onClick={e => { e.stopPropagation(); if (rootFolder) handleNewFile(rootFolder); else onNewFileRequest?.(); }}>
              <IconPlus size={16} />
            </button>
            <button
              className="icon-btn"
              title="Open Folder"
              onClick={async e => { e.stopPropagation();
                const result = await window.electronAPI.selectDirectory();
                if (result.success) onSetRootFolder(result.path);
              }}
            >
              <IconFolder size={16} />
            </button>
          </div>
        </div>
      )}
      <div className="explorer-content">
        {rootFolder ? (
          <div>
            <div className="root-folder-label">
              <IconFolder size={14} />
              <span>{pathUtil.basename(rootFolder)}</span>
            </div>
            {showRecentProp && recentFiles.length > 0 && (
              <>
                <div
                  className="root-folder-label recent-toggle"
                  onClick={() => setShowRecent(!showRecent)}
                  style={{ cursor: 'pointer', marginTop: 4, gap: 4 }}
                >
                  {showRecent ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                  <span>Recent</span>
                  <button
                    className="icon-btn"
                    style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}
                    onClick={async e => {
                      e.stopPropagation();
                      await window.electronAPI.clearRecentFiles();
                      setRecentFiles([]);
                    }}
                    title="Clear recent files"
                  >
                    Clear
                  </button>
                </div>
                {showRecent && recentFiles.slice(0, 10).map(rf => (
                  <div
                    key={rf.path}
                    className="file-item file"
                    onClick={() => onFileSelect(rf.path)}
                    style={{ paddingLeft: '28px' }}
                    title={rf.path}
                  >
                    <span className="icon"><IconFile size={14} /></span>
                    <span className="name">{rf.name}</span>
                  </div>
                ))}
              </>
            )}
            {loadingPaths.has(rootFolder) && rootNodes.length === 0 ? (
              <div className="no-folder"><p>Loading...</p></div>
            ) : (
              renderTree(rootNodes)
            )}
            {creatingInDir === rootFolder && rootFolder && (
              <div className="file-item new-item" style={{ paddingLeft: '12px' }}>
                <span className="icon">{creatingType === 'file' ? <IconFile size={16} /> : <IconFolder size={16} />}</span>
                <input
                  ref={createRef}
                  className="inline-input"
                  placeholder={creatingType === 'file' ? 'filename.ext' : 'folder name'}
                  onBlur={submitCreate}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitCreate();
                    if (e.key === 'Escape') setCreatingInDir(null);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="no-folder">
            <svg className="no-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <p className="no-folder-title">No folder opened</p>
            <p className="no-folder-description">Open a folder to get started</p>
            <div className="no-folder-actions">
              <button className="no-folder-btn primary" onClick={async () => {
                const result = await window.electronAPI.selectDirectory();
                if (result.success) onSetRootFolder(result.path);
              }}>
                <IconFolderOpened size={14} />
                <span>Open Folder</span>
              </button>
              <button className="no-folder-btn secondary" onClick={() => onNewFileRequest?.()}>
                <IconFileSubmodule size={14} />
                <span>New File</span>
              </button>
              <button className="no-folder-btn secondary" onClick={() => onOpenFileRequest?.()}>
                <IconSearch size={14} />
                <span>Open File</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <>
          <div className="menu-overlay" onClick={closeMenu} onContextMenu={e => { e.preventDefault(); closeMenu(); }} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {menuItems(contextMenu).map((item, i) => (
              <React.Fragment key={i}>
                {item.separator && <div className="menu-separator" />}
                <div className="menu-item" onClick={item.action}>{item.label}</div>
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FileExplorer;
