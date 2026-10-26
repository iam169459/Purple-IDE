interface SuccessResult { success: true; }
interface ErrorResult { success: false; error: string; }

interface OpenFileResult extends SuccessResult { content: string; }
interface GetDirectoryResult extends SuccessResult { files: DirEntry[]; }
interface SelectDirectoryResult extends SuccessResult { path: string; }
interface SelectFileResult extends SuccessResult { path: string; }
interface SaveFileAsResult extends SuccessResult { path: string; }
interface AppInfoResult extends SuccessResult {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}
interface ConfirmUnsavedResult extends SuccessResult { choice: 'save' | 'discard' | 'cancel'; }

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber: number;
  content: string;
}

interface AiToolDiffEvent {
  path: string;
  diff: DiffLine[];
  type: 'created' | 'edited';
}

interface RunCodeResult {
  success: true;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

interface MCPServerConfig {
  id: string;
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

interface MCPListServersResult extends SuccessResult { servers: MCPServerConfig[]; }
interface MCPConnectResult extends SuccessResult { connected: boolean; }
interface MCPListResourcesResult extends SuccessResult { resources: MCPResource[]; }
interface MCPReadResourceResult extends SuccessResult { contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> };
interface MCPListPromptsResult extends SuccessResult { prompts: MCPPrompt[]; }
interface MCPGetPromptResult extends SuccessResult { messages: Array<{ role: string; content: any }> };
interface MCPListToolsResult extends SuccessResult { tools: MCPToolInfo[]; }
interface MCPCallToolResult extends SuccessResult { result: any; }

interface AIChatMessage {
  role: string;
  content: string;
}

export interface ElectronAPI {
  openFile: (filePath: string) => Promise<OpenFileResult | ErrorResult>;
  saveFile: (filePath: string, content: string) => Promise<SuccessResult | ErrorResult>;
  getDirectory: (dirPath: string) => Promise<GetDirectoryResult | ErrorResult>;
  selectDirectory: () => Promise<SelectDirectoryResult | ErrorResult>;
  selectFile: () => Promise<SelectFileResult | ErrorResult>;
  saveFileAs: (suggestedPath: string, content: string) => Promise<SaveFileAsResult | ErrorResult>;
  confirmUnsaved: (fileName: string) => Promise<ConfirmUnsavedResult | ErrorResult>;
  reportDirtyState: (count: number) => void;
  getAppInfo: () => Promise<AppInfoResult>;
  showAbout: () => Promise<SuccessResult>;
  createFile: (parentDir: string, name: string) => Promise<SuccessResult | ErrorResult>;
  createDirectory: (parentDir: string, name: string) => Promise<SuccessResult | ErrorResult>;
  deleteEntry: (targetPath: string) => Promise<SuccessResult | ErrorResult>;
  renameEntry: (oldPath: string, newName: string) => Promise<SuccessResult | ErrorResult>;
  copyEntry: (sourcePath: string, destDir: string) => Promise<SuccessResult | ErrorResult>;
  moveEntry: (sourcePath: string, destDir: string) => Promise<SuccessResult | ErrorResult>;
  onFileChange: (callback: (path: string) => void) => () => void;
  onEditorOpenOrUpdateTab: (callback: (data: { name: string; path: string; content: string }) => void) => () => void;
  onFileWritten: (callback: (data: { relativePath: string; resolvedPath: string; content: string }) => void) => () => void;
  onChatReceiveText: (callback: (text: string) => void) => () => void;
  onWorkspaceFileChanged: (callback: (data: { path: string; content: string }) => void) => () => void;
  onEditorUpdateContent: (callback: (data: { path: string; content: string }) => void) => () => void;
  onAiToolDiff: (callback: (data: AiToolDiffEvent) => void) => () => void;
  onAiToolRun: (callback: (data: { stdout?: string; stderr?: string; exitCode?: number | null; command?: string; attemptedCommands?: string[] }) => void) => () => void;

  // Code runner
  runCode: (filePath: string) => Promise<RunCodeResult | ErrorResult>;
  gitCommand: (command: string, cwd?: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null } | ErrorResult>;

  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onWindowStateChange: (callback: (maximized: boolean) => void) => () => void;

  // Search
  searchFiles: (rootDir: string, query: string) => Promise<SearchFilesResult | ErrorResult>;
  searchInFiles: (rootDir: string, query: string) => Promise<SearchInFilesResult | ErrorResult>;

  // Platform
  getPlatform: () => Promise<{ platform: string }>;

  // Recent files
  getRecentFiles: () => Promise<RecentFilesResult | ErrorResult>;
  addRecentFile: (filePath: string) => Promise<SuccessResult | ErrorResult>;
  clearRecentFiles: () => Promise<SuccessResult | ErrorResult>;

  // MCP
  mcpConnect: (config: MCPServerConfig) => Promise<MCPConnectResult | ErrorResult>;
  mcpDisconnect: (serverId: string) => Promise<SuccessResult | ErrorResult>;
  mcpListServers: () => Promise<MCPListServersResult | ErrorResult>;
  mcpListTools: (serverId?: string) => Promise<MCPListToolsResult | ErrorResult>;
  mcpCallTool: (toolName: string, args: Record<string, any>, rootFolder?: string, serverId?: string) => Promise<MCPCallToolResult | ErrorResult>;
  mcpListResources: (serverId: string) => Promise<MCPListResourcesResult | ErrorResult>;
  mcpReadResource: (serverId: string, uri: string) => Promise<MCPReadResourceResult | ErrorResult>;
  mcpListPrompts: (serverId: string) => Promise<MCPListPromptsResult | ErrorResult>;
  mcpGetPrompt: (serverId: string, name: string, args?: Record<string, any>) => Promise<MCPGetPromptResult | ErrorResult>;

  // AI Chat
  aiChat: (messages: AIChatMessage[], apiKey: string, model: string, endpoint: string | undefined, rootFolder?: string, activeFile?: string, temperature?: number) => Promise<AIChatResult | ErrorResult>;
  aiChatStream: (messages: AIChatMessage[], apiKey: string, model: string, endpoint: string | undefined, rootFolder?: string, activeFile?: string, temperature?: number) => Promise<AIChatResult | ErrorResult>;
  abortAiChat: () => void;
  onAiStreamChunk: (callback: (chunk: string) => void) => () => void;
  onAiStreamDone: (callback: (fullContent: string) => void) => () => void;

  // AI Execute Tool
  aiExecuteTool: (toolCall: { tool: string; arguments: Record<string, any>; rootFolder: string | null }) => Promise<AIExecuteToolResult | ErrorResult>;

  // AI Sessions
  aiListSessions: () => Promise<AIListSessionsResult | ErrorResult>;
  aiSaveSession: (session: AISessionData) => Promise<SuccessResult | ErrorResult>;
  aiLoadSession: (id: string) => Promise<AILoadSessionResult | ErrorResult>;
  aiDeleteSession: (id: string) => Promise<SuccessResult | ErrorResult>;

  // AI Memory
  memoryList: (projectPath?: string) => Promise<MemoryListResult | ErrorResult>;
  memoryAdd: (entry: Partial<MemoryEntry>) => Promise<MemoryAddResult | ErrorResult>;
  memoryUpdate: (id: string, patch: Partial<MemoryEntry>) => Promise<MemoryUpdateResult | ErrorResult>;
  memoryDelete: (id: string) => Promise<SuccessResult | ErrorResult>;
  memorySearch: (query: string, projectPath?: string, limit?: number) => Promise<MemorySearchResult | ErrorResult>;
  memoryUpsertSessionSummary: (sessionSummary: { sessionId: string; content: string; tags: string[]; projectPath?: string }) => Promise<MemoryAddResult | ErrorResult>;

  // Ollama
  ollamaListModels: () => Promise<OllamaListModelsResult | ErrorResult>;
  localListModels: (endpoint: string) => Promise<LocalListModelsResult | ErrorResult>;

  // Secure storage
  secureStore: (key: string, value: string) => Promise<SuccessResult | ErrorResult>;
  secureGet: (key: string) => Promise<{ success: true; value: string | null } | ErrorResult>;
  terminalCreate: (id: string, cwd?: string) => Promise<SuccessResult | ErrorResult>;
  terminalWrite: (id: string, data: string) => Promise<SuccessResult | ErrorResult>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<SuccessResult | ErrorResult>;
  terminalKill: (id: string) => Promise<SuccessResult | ErrorResult>;
  terminalList: () => Promise<string[]>;
  terminalGetOutput: (id: string, maxLines?: number) => Promise<{ success: boolean; output?: string; error?: string }>;
  onTerminalData: (callback: (id: string, data: string) => void) => void;
  onTerminalExit: (callback: (id: string, code: number) => void) => void;

  // Agent Orchestrator
  agentPlan: (goal: string, workspaceRoot: string) => Promise<AgentPlanResult | ErrorResult>;
  agentExecute: () => Promise<SuccessResult | ErrorResult>;
  agentStop: () => Promise<SuccessResult | ErrorResult>;
  agentGetTasks: () => Promise<AgentTasksResult>;
  agentSetKey: (providerId: string, key: string) => Promise<SuccessResult | ErrorResult>;
  agentGetProviders: () => Promise<AgentProvidersResult | ErrorResult>;
  agentGetMemory: (workspaceRoot: string) => Promise<AgentMemoryResult | ErrorResult>;
  agentGetStatus: () => Promise<AgentStatusResult | ErrorResult>;
  agentSetMode: (mode: AgentMode) => Promise<SuccessResult | ErrorResult>;
  agentApprove: (requestId: string, approved: boolean) => Promise<SuccessResult | ErrorResult>;
  onAgentTaskStart: (callback: (data: AgentTaskEvent) => void) => () => void;
  onAgentTaskUpdate: (callback: (data: AgentTaskEvent) => void) => () => void;
  onAgentThoughtStream: (callback: (data: AgentThoughtEvent) => void) => () => void;
  onAgentToolCall: (callback: (data: AgentToolCallEvent) => void) => () => void;
  onAgentToolResult: (callback: (data: AgentToolResultEvent) => void) => () => void;
  onAgentFileChanged: (callback: (data: AgentFileChangedEvent) => void) => () => void;
  onAgentApprovalRequest: (callback: (data: AgentApprovalRequestEvent) => void) => () => void;
  onAgentProviderSwitch: (callback: (data: AgentProviderSwitchEvent) => void) => () => void;
  onAgentModeChanged: (callback: (data: { mode: AgentMode }) => void) => () => void;
  onAgentComplete: (callback: (data: { tasks: AgentTask[]; cancelled?: boolean }) => void) => () => void;
  // Menu events
  onMenuCommand: (callback: (command: string, payload?: any) => void) => () => void;
  onMenuNewFile: (callback: () => void) => () => void;
  onMenuOpenFolder: (callback: () => void) => () => void;
  onMenuSave: (callback: () => void) => () => void;
}

interface SearchFilesResult extends SuccessResult { files: string[]; }
interface SearchInFilesResult extends SuccessResult { results: { file: string; line: number; text: string }[]; }
interface RecentFilesResult extends SuccessResult { files: RecentFile[]; }
interface MCPListToolsResult extends SuccessResult { tools: MCPToolInfo[]; }
interface MCPCallToolResult extends SuccessResult { result: any; }
interface AIChatResult extends SuccessResult { message: { role: string; content: string }; aborted?: boolean; }
interface AIExecuteToolResult extends SuccessResult { result: any; }
interface OllamaListModelsResult extends SuccessResult { models: string[]; }
interface LocalListModelsResult extends SuccessResult { models: string[]; }

interface AISessionSummary {
  id: string;
  name: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

interface AISessionData {
  id: string;
  name: string;
  messages: { role: string; content: string }[];
  model: string;
  endpointType: string;
  freeProvider?: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: number;
  updatedAt: number;
}

interface AIListSessionsResult extends SuccessResult { sessions: AISessionSummary[]; }
interface AILoadSessionResult extends SuccessResult { session: AISessionData; }

interface MemoryEntry {
  id: string;
  type: 'fact' | 'decision' | 'summary' | 'preference';
  content: string;
  tags: string[];
  projectPath: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryListResult extends SuccessResult { memories: MemoryEntry[]; }
interface MemoryAddResult extends SuccessResult { memory: MemoryEntry; }
interface MemoryUpdateResult extends SuccessResult { memory: MemoryEntry; }
interface MemorySearchResult extends SuccessResult { memories: MemoryEntry[]; }

// ------------------------- Agent swarm types -------------------------

type AgentMode = 'vibe' | 'plan' | 'ask' | 'edit' | 'review' | 'debug';
type AgentRole = 'planner' | 'frontend' | 'backend' | 'database' | 'debugger';
type AgentTaskStatus = 'pending' | 'running' | 'done' | 'failed';

interface AgentTask {
  id: string;
  role: AgentRole;
  description: string;
  dependencies: string[];
  expectedFiles: string[];
  status: AgentTaskStatus;
  assignee?: string;
  summary?: string;
}

interface AgentProviderInfo {
  id: string;
  name: string;
  model: string;
  priority: number;
  hasKey: boolean;
  available: boolean;
}

interface AgentPlanResult extends SuccessResult { tasks: AgentTask[]; }
interface AgentTasksResult extends SuccessResult { tasks: AgentTask[]; }
interface AgentProvidersResult extends SuccessResult { providers: AgentProviderInfo[]; }
interface AgentMemoryResult extends SuccessResult { memory: string; }
interface AgentStatusResult extends SuccessResult {
  status: { running: boolean; mode: AgentMode; tasks: AgentTask[]; activeAgent: AgentRole | null };
}

interface AgentTaskEvent {
  task?: AgentTask;
  tasks?: AgentTask[];
  phase?: 'planning' | 'planned';
  autoTriggered?: boolean;
}

interface AgentThoughtEvent {
  agent: string;
  thought: string;
  ts?: number;
  final?: boolean;
  iteration?: number;
}

interface AgentToolCallEvent {
  agent: string;
  tool: string;
  args: Record<string, any>;
  taskId?: string;
}

interface AgentToolResultEvent {
  agent: string;
  tool: string;
  ok: boolean;
  result: string;
}

interface AgentFileChangedEvent {
  path: string;
  diff: DiffLine[];
  type: 'created' | 'edited';
  agent?: string;
}

interface AgentApprovalRequestEvent {
  requestId: string;
  tool: string;
  path: string;
  preview: string;
}

interface AgentProviderSwitchEvent {
  from: string | null;
  to: string | null;
  failedProvider?: string;
  reason: string;
  chain?: Array<{ id: string; available: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
