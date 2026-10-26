const { contextBridge, ipcRenderer } = require('electron');

const api = {
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  getDirectory: (dirPath) => ipcRenderer.invoke('get-directory', dirPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFileAs: (suggestedPath, content) => ipcRenderer.invoke('save-file-as', suggestedPath, content),
  confirmUnsaved: (fileName) => ipcRenderer.invoke('confirm-unsaved', fileName),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  showAbout: () => ipcRenderer.invoke('show-about'),
  createFile: (parentDir, name) => ipcRenderer.invoke('create-file', parentDir, name),
  createDirectory: (parentDir, name) => ipcRenderer.invoke('create-directory', parentDir, name),
  deleteEntry: (targetPath) => ipcRenderer.invoke('delete-entry', targetPath),
  renameEntry: (oldPath, newName) => ipcRenderer.invoke('rename-entry', oldPath, newName),
  copyEntry: (sourcePath, destDir) => ipcRenderer.invoke('copy-entry', sourcePath, destDir),
  moveEntry: (sourcePath, destDir) => ipcRenderer.invoke('move-entry', sourcePath, destDir),
  onFileChange: (callback) => {
    const handler = (_event, path) => callback(path);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },
  onEditorOpenOrUpdateTab: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('editor:open-or-update-tab', handler);
    return () => ipcRenderer.removeListener('editor:open-or-update-tab', handler);
  },
  onFileWritten: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('file-written', handler);
    return () => ipcRenderer.removeListener('file-written', handler);
  },
  onChatReceiveText: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on('chat:receive-text', handler);
    return () => ipcRenderer.removeListener('chat:receive-text', handler);
  },
  onWorkspaceFileChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('workspace:file-changed', handler);
    return () => ipcRenderer.removeListener('workspace:file-changed', handler);
  },
  onEditorUpdateContent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('editor:update-content', handler);
    return () => ipcRenderer.removeListener('editor:update-content', handler);
  },
  onAiToolDiff: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ai:tool-diff', handler);
    return () => ipcRenderer.removeListener('ai:tool-diff', handler);
  },
  onAiToolRun: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ai:tool-run', handler);
    return () => ipcRenderer.removeListener('ai:tool-run', handler);
  },

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback) => {
    const handler = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  },

  // Code runner
  runCode: (filePath) => ipcRenderer.invoke('run-code', filePath),
  gitCommand: (command, cwd) => ipcRenderer.invoke('gitCommand', command, cwd),

  // Search
  searchFiles: (rootDir, query) => ipcRenderer.invoke('search-files', rootDir, query),
  searchInFiles: (rootDir, query) => ipcRenderer.invoke('search-in-files', rootDir, query),

  // Platform
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addRecentFile: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),

  // MCP
  mcpConnect: (config) => ipcRenderer.invoke('mcp-connect', config),
  mcpDisconnect: (serverId) => ipcRenderer.invoke('mcp-disconnect', serverId),
  mcpListServers: () => ipcRenderer.invoke('mcp-list-servers'),
  mcpListTools: (serverId) => ipcRenderer.invoke('mcp-list-tools', serverId),
  mcpCallTool: (toolName, args, rootFolder, serverId) => ipcRenderer.invoke('mcp-call-tool', toolName, args, rootFolder, serverId),
  mcpListResources: (serverId) => ipcRenderer.invoke('mcp-list-resources', serverId),
  mcpReadResource: (serverId, uri) => ipcRenderer.invoke('mcp-read-resource', serverId, uri),
  mcpListPrompts: (serverId) => ipcRenderer.invoke('mcp-list-prompts', serverId),
  mcpGetPrompt: (serverId, name, args) => ipcRenderer.invoke('mcp-get-prompt', serverId, name, args),

  // AI Chat
  aiChat: (messages, apiKey, model, endpoint, rootFolder, activeFile, temperature) => ipcRenderer.invoke('ai-chat', messages, apiKey, model, endpoint, rootFolder, activeFile, temperature),
  aiChatStream: (messages, apiKey, model, endpoint, rootFolder, activeFile, temperature) => ipcRenderer.invoke('ai-chat-stream', messages, apiKey, model, endpoint, rootFolder, activeFile, temperature),
  abortAiChat: () => ipcRenderer.send('ai-chat-abort'),
  onAiStreamChunk: (callback) => {
    const handler = (_event, chunk) => callback(chunk);
    ipcRenderer.on('ai-stream-chunk', handler);
    return () => ipcRenderer.removeListener('ai-stream-chunk', handler);
  },
  onAiStreamDone: (callback) => {
    const handler = (_event, fullContent) => callback(fullContent);
    ipcRenderer.on('ai-stream-done', handler);
    return () => ipcRenderer.removeListener('ai-stream-done', handler);
  },

  // AI Execute Tool
  aiExecuteTool: (toolCall) => ipcRenderer.invoke('ai-execute-tool', toolCall),

   // AI Sessions
  aiListSessions: () => ipcRenderer.invoke('ai-list-sessions'),
  aiSaveSession: (session) => ipcRenderer.invoke('ai-save-session', session),
  aiLoadSession: (id) => ipcRenderer.invoke('ai-load-session', id),
  aiDeleteSession: (id) => ipcRenderer.invoke('ai-delete-session', id),

   // AI Memory
  memoryList: (projectPath) => ipcRenderer.invoke('memory-list', projectPath),
  memoryAdd: (entry) => ipcRenderer.invoke('memory-add', entry),
  memoryUpdate: (id, patch) => ipcRenderer.invoke('memory-update', id, patch),
  memoryDelete: (id) => ipcRenderer.invoke('memory-delete', id),
  memorySearch: (query, projectPath, limit) => ipcRenderer.invoke('memory-search', query, projectPath, limit),
  memoryUpsertSessionSummary: (sessionSummary) => ipcRenderer.invoke('memory-upsert-session-summary', sessionSummary),

   // Ollama
  ollamaListModels: () => ipcRenderer.invoke('ollama-list-models'),
  localListModels: (endpoint) => ipcRenderer.invoke('local-list-models', endpoint),

  // Terminal
  terminalCreate: (id, cwd) => ipcRenderer.invoke('terminal:create', id, cwd),
  terminalWrite: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  terminalKill: (id) => ipcRenderer.invoke('terminal:kill', id),
  terminalList: () => ipcRenderer.invoke('terminal:list'),
  terminalGetOutput: (id, maxLines) => ipcRenderer.invoke('terminal:getOutput', id, maxLines),
  onTerminalData: (callback) => ipcRenderer.on('terminal:data', (_event, id, data) => callback(id, data)),
  onTerminalExit: (callback) => ipcRenderer.on('terminal:exit', (_event, id, code) => callback(id, code)),

  // Menu commands (renderer owns the workbench state)
  onMenuCommand: (callback) => {
    const handler = (_event, command, payload) => callback(command, payload);
    ipcRenderer.on('menu-command', handler);
    return () => ipcRenderer.removeListener('menu-command', handler);
  },

  // Legacy menu events
  onMenuNewFile: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu-new-file', handler);
    return () => ipcRenderer.removeListener('menu-new-file', handler);
  },
  onMenuOpenFolder: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu-open-folder', handler);
    return () => ipcRenderer.removeListener('menu-open-folder', handler);
  },
  onMenuSave: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu-save', handler);
    return () => ipcRenderer.removeListener('menu-save', handler);
  },

  // Agent Orchestrator
  agentPlan: (goal, workspaceRoot) => ipcRenderer.invoke('agent:plan', goal, workspaceRoot),
  agentExecute: () => ipcRenderer.invoke('agent:execute'),
  agentStop: () => ipcRenderer.invoke('agent:stop'),
  agentGetTasks: () => ipcRenderer.invoke('agent:get-tasks'),
  agentSetKey: (providerId, key) => ipcRenderer.invoke('agent:set-key', providerId, key),
  agentGetProviders: () => ipcRenderer.invoke('agent:get-providers'),
  agentGetMemory: (workspaceRoot) => ipcRenderer.invoke('agent:get-memory', workspaceRoot),
  agentGetStatus: () => ipcRenderer.invoke('agent:get-status'),
  agentSetMode: (mode) => ipcRenderer.invoke('agent:set-mode', mode),
  agentApprove: (requestId, approved) => ipcRenderer.invoke('agent:approval', requestId, approved),
  onAgentTaskStart: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:task-start', h); return () => ipcRenderer.removeListener('agent:task-start', h); },
  onAgentTaskUpdate: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:task-update', h); return () => ipcRenderer.removeListener('agent:task-update', h); },
  onAgentThoughtStream: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:thought-stream', h); return () => ipcRenderer.removeListener('agent:thought-stream', h); },
  onAgentToolCall: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:tool-call', h); return () => ipcRenderer.removeListener('agent:tool-call', h); },
  onAgentToolResult: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:tool-result', h); return () => ipcRenderer.removeListener('agent:tool-result', h); },
  onAgentFileChanged: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:file-changed', h); return () => ipcRenderer.removeListener('agent:file-changed', h); },
  onAgentApprovalRequest: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:approval-request', h); return () => ipcRenderer.removeListener('agent:approval-request', h); },
  onAgentProviderSwitch: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:provider-switch', h); return () => ipcRenderer.removeListener('agent:provider-switch', h); },
  onAgentModeChanged: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:mode-changed', h); return () => ipcRenderer.removeListener('agent:mode-changed', h); },
  onAgentComplete: (callback) => { const h = (_e, d) => callback(d); ipcRenderer.on('agent:complete', h); return () => ipcRenderer.removeListener('agent:complete', h); },
};

contextBridge.exposeInMainWorld('electronAPI', api);
