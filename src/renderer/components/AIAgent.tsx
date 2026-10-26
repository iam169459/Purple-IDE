import React, { useState, useRef, useEffect, useCallback } from 'react';
import { IconSend, IconRefresh } from './icons';
import { IconClose, IconPlus, IconHistory, IconDiff, IconLightbulb } from './codicons';
import { extractToolCalls } from '../toolUtils';
import type { MemoryEntry } from '../electron.d.ts';
import SwarmStatus from './SwarmStatus';
import { useWorkbench } from '../workbench/WorkbenchProvider';
import { FREE_PROVIDERS, type EndpointType, type FreeProvider } from '../workbench/ai';

/** Lightweight markdown-to-React renderer for AI messages */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const renderInline = (line: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Match: inline code, bold, italic, links
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let pk = 0;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push(<span key={pk++}>{line.slice(lastIndex, match.index)}</span>);
      const m = match[0];
      if (m.startsWith('`')) parts.push(<code key={pk++} className="md-inline-code">{m.slice(1, -1)}</code>);
      else if (m.startsWith('**')) parts.push(<strong key={pk++}>{m.slice(2, -2)}</strong>);
      else if (m.startsWith('*')) parts.push(<em key={pk++}>{m.slice(1, -1)}</em>);
      else if (m.startsWith('[')) {
        const lm = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (lm) parts.push(<a key={pk++} href={lm[2]} className="md-link" target="_blank" rel="noopener">{lm[1]}</a>);
      }
      lastIndex = match.index + m.length;
    }
    if (lastIndex < line.length) parts.push(<span key={pk++}>{line.slice(lastIndex)}</span>);
    return parts.length ? parts : [<span key={0}>{line}</span>];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++; // skip closing ```
      elements.push(
        <div key={key++} className="md-code-block">
          {lang && <div className="md-code-lang">{lang}</div>}
          <pre><code>{codeLines.join('\n')}</code></pre>
        </div>
      );
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = renderInline(headerMatch[2]);
      if (level === 1) elements.push(<h1 key={key++} className="md-h1">{content}</h1>);
      else if (level === 2) elements.push(<h2 key={key++} className="md-h2">{content}</h2>);
      else elements.push(<h3 key={key++} className="md-h3">{content}</h3>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>);
        i++;
      }
      elements.push(<ul key={key++} className="md-ul">{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>);
        i++;
      }
      elements.push(<ol key={key++} className="md-ol">{items}</ol>);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(<blockquote key={key++} className="md-blockquote">{renderInline(quoteLines.join('\n'))}</blockquote>);
      continue;
    }

    // Empty line
    if (line.trim() === '') { i++; continue; }

    // Normal paragraph
    elements.push(<p key={key++} className="md-p">{renderInline(line)}</p>);
    i++;
  }

  return elements;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber: number;
  content: string;
}

interface FileChange {
  id: string;
  type: 'created' | 'edited' | 'ran';
  filePath: string;
  summary: string;
  timestamp: number;
  diff?: DiffLine[];
  oldContent?: string;
}

interface Props {
  systemPromptOverride?: string;
  aiToolsEnabled: boolean;
  onAiToolsEnabledChange: (enabled: boolean) => void;
  aiTemperature: number;
  onOpenSwarm?: () => void;
  onClose?: () => void;
  onStatsChange?: (stats: { messageCount: number; changes: number }) => void;
}

/** Detect if a message is a tool-card placeholder or raw JSON tool call */
function parseToolCard(text: string): string | null {
  // Internal card sent by the tool loop for write_file
  if (text.startsWith('__tool_card__write_file__')) {
    return text.slice('__tool_card__write_file__'.length);
  }
  // Fallback: raw JSON tool call that somehow made it to the UI
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.tool === 'write_file' && parsed.arguments?.path) {
      return parsed.arguments.path as string;
    }
  } catch {
    // not JSON, ignore
  }
  return null;
}

const countTokens = (text: string) => Math.ceil(text.length / 4);
const CONTEXT_TOKEN_LIMIT = 64000;

/**
 * Smart content truncation that preserves code structure.
 * Keeps imports/exports, function signatures, and class declarations.
 */
function truncateContent(content: string, maxTokens: number): string {
  if (countTokens(content) <= maxTokens) return content;

  const lines = content.split('\n');
  const maxChars = maxTokens * 4;

  // For very small files, just slice
  if (lines.length <= 10) return content.slice(0, maxChars);

  // Preserve important lines: imports, exports, class/function declarations, comments
  const importantPatterns = /^(import |export |class |function |const |let |var |\/\*\*|\/\/ |#include|def |public |private |protected |interface |type |enum )/;
  const importantLines: { idx: number; line: string }[] = [];
  const otherLines: { idx: number; line: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (importantPatterns.test(lines[i].trim())) {
      importantLines.push({ idx: i, line: lines[i] });
    } else {
      otherLines.push({ idx: i, line: lines[i] });
    }
  }

  // Build result: head (first 20%) + important lines + tail (last 20%)
  const headEnd = Math.ceil(lines.length * 0.2);
  const tailStart = Math.floor(lines.length * 0.8);

  let result = lines.slice(0, headEnd).join('\n');
  result += '\n\n// ... [important declarations preserved] ...\n\n';

  // Add important lines that aren't in head/tail
  for (const { idx, line } of importantLines) {
    if (idx >= headEnd && idx < tailStart) {
      result += line + '\n';
    }
  }

  result += '\n// ... [truncated] ...\n\n';
  result += lines.slice(tailStart).join('\n');

  // If still too long, do a hard slice
  if (countTokens(result) > maxTokens) {
    return result.slice(0, maxChars);
  }
  return result;
}

/**
 * Compress tool results to fit within token budget.
 * Keeps the most relevant parts of long outputs.
 */
function compressToolResult(toolName: string, result: any, maxTokens: number): string {
  if (toolName === 'read_terminal') {
    const output = result.output || '';
    if (countTokens(output) <= maxTokens) return output;
    // Keep last N lines (most recent output is usually most relevant)
    const lines = output.split('\n');
    const maxLines = Math.floor(maxTokens * 4 / 80); // ~80 chars per line
    return lines.slice(-maxLines).join('\n');
  }

  if (toolName === 'run_code') {
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    if (countTokens(combined) <= maxTokens) return combined;
    // Keep last part of output
    const lines = combined.split('\n');
    const maxLines = Math.floor(maxTokens * 4 / 80);
    return lines.slice(-maxLines).join('\n');
  }

  return '';
}

/**
 * Smart message pruning that preserves conversation flow.
 * Strategy:
 * 1. Always keep system prompt
 * 2. Always keep last 4 messages (2 user/assistant pairs)
 * 3. Drop oldest tool-result messages first
 * 4. If still over budget, summarize old messages
 */
function pruneMessages(messages: ChatMessage[], maxTokens: number = CONTEXT_TOKEN_LIMIT): ChatMessage[] {
  if (messages.length === 0) return [];

  const system = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  const systemTokens = system.reduce((acc, m) => acc + countTokens(m.content), 0);
  const available = maxTokens - systemTokens;

  // If everything fits, return as-is
  const totalNonSystem = nonSystem.reduce((acc, m) => acc + countTokens(m.content), 0);
  if (totalNonSystem <= available) return [...system, ...nonSystem];

  // Always keep last 4 messages (2 pairs)
  const KEEP_RECENT = 4;
  const recent = nonSystem.slice(-KEEP_RECENT);
  const older = nonSystem.slice(0, -KEEP_RECENT);

  const recentTokens = recent.reduce((acc, m) => acc + countTokens(m.content), 0);
  let budgetForOlder = available - recentTokens;

  if (budgetForOlder <= 0) {
    // Recent messages alone exceed budget - just keep what fits
    let tokenCount = 0;
    const fitted = [];
    for (const msg of recent.reverse()) {
      const tokens = countTokens(msg.content);
      if (tokenCount + tokens > available && fitted.length > 0) break;
      fitted.unshift(msg);
      tokenCount += tokens;
    }
    return [...system, ...fitted];
  }

  // From older messages, keep tool results (they contain context) but drop oldest first
  const toolResults = older.filter(m => m.role === 'system');
  const conversation = older.filter(m => m.role !== 'system');

  // Drop oldest tool results first
  let keptToolResults: ChatMessage[] = [];
  let toolTokens = 0;
  for (const msg of toolResults.reverse()) {
    const tokens = countTokens(msg.content);
    if (toolTokens + tokens > budgetForOlder) break;
    keptToolResults.unshift(msg);
    toolTokens += tokens;
  }

  budgetForOlder -= toolTokens;

  // Then keep conversation messages that fit
  let keptConversation: ChatMessage[] = [];
  let convTokens = 0;
  for (const msg of conversation.reverse()) {
    const tokens = countTokens(msg.content);
    if (convTokens + tokens > budgetForOlder && keptConversation.length > 0) break;
    keptConversation.unshift(msg);
    convTokens += tokens;
  }

  return [...system, ...keptToolResults, ...keptConversation, ...recent];
}

/**
 * Build context messages for the AI, optimizing for token budget.
 * Handles large file contents and tool results intelligently.
 */
function buildContextMessages(
  systemPrompt: string,
  messages: ChatMessage[],
  userMsg: ChatMessage,
  activeFile?: string,
  activeFileContent?: string,
  maxTokens: number = CONTEXT_TOKEN_LIMIT
): ChatMessage[] {
  const result: ChatMessage[] = [];

  // Add system prompt with file context
  let sysContent = systemPrompt;
  if (activeFile && activeFileContent) {
    const fileTokens = countTokens(activeFileContent);
    const budgetForFile = Math.min(4000, Math.floor(maxTokens * 0.15));
    const truncated = fileTokens > budgetForFile
      ? truncateContent(activeFileContent, budgetForFile)
      : activeFileContent;
    sysContent += `\n\nOPEN FILE: ${activeFile}\n\`\`\`\n${truncated}\n\`\`\``;
  }
  result.push({ role: 'system', content: sysContent });

  // Add messages, compressing large ones
  const allMsgs = [...messages.slice(-30), userMsg]; // Last 30 + current
  let tokenBudget = maxTokens - countTokens(sysContent) - countTokens(userMsg.content);

  // Add messages from newest to oldest until budget exhausted
  const selected: ChatMessage[] = [];
  for (const msg of allMsgs.reverse()) {
    let content = msg.content;

    // Compress large tool results
    if (msg.role === 'system' && content.length > 2000) {
      const toolMatch = content.match(/^Tool "(.+)" result:/);
      if (toolMatch) {
        content = content.slice(0, 2000) + '\n... [compressed]';
      }
    }

    const tokens = countTokens(content);
    if (tokenBudget - tokens < 0 && selected.length > 0) break;
    selected.unshift({ ...msg, content });
    tokenBudget -= tokens;
  }

  result.push(...selected);
  return result;
}

// localStorage session helpers
const LS_SESSION_KEY = 'ai-current-session';
const LS_INDEX_KEY = 'ai-sessions-index';

interface StoredSession {
  id: string;
  name: string;
  model: string;
  endpointType: string;
  freeProvider?: string;
  tokensIn: number;
  tokensOut: number;
  messageCount: number;
  updatedAt: number;
  createdAt: number;
}

const loadIndex = (): StoredSession[] => {
  try { return JSON.parse(localStorage.getItem(LS_INDEX_KEY) || '[]'); } catch { return []; }
};

const saveIndex = (idx: StoredSession[]) => {
  localStorage.setItem(LS_INDEX_KEY, JSON.stringify(idx));
};

const saveSessionToLS = (session: {
  id: string; name: string; messages: ChatMessage[]; model: string;
  endpointType: string; freeProvider?: string; tokensIn: number; tokensOut: number;
  changes: FileChange[];
}) => {
  const key = `ai-session-${session.id}`;
  const data = { ...session, updatedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(data));
  const idx = loadIndex().filter(s => s.id !== session.id);
  idx.unshift({
    id: session.id, name: session.name, model: session.model,
    endpointType: session.endpointType, freeProvider: session.freeProvider,
    tokensIn: session.tokensIn, tokensOut: session.tokensOut,
    messageCount: session.messages.length, updatedAt: Date.now(), createdAt: Date.now(),
  });
  saveIndex(idx.slice(0, 50));
};

const loadSessionFromLS = (id: string) => {
  try {
    const raw = localStorage.getItem(`ai-session-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const deleteSessionFromLS = (id: string) => {
  localStorage.removeItem(`ai-session-${id}`);
  saveIndex(loadIndex().filter(s => s.id !== id));
};

const AIAgent: React.FC<Props> = ({
  systemPromptOverride,
  aiToolsEnabled,
  onAiToolsEnabledChange,
  aiTemperature,
  onOpenSwarm,
  onClose,
  onStatsChange,
}) => {
  const { workspace, session, ai } = useWorkbench();
  const rootFolder = workspace.rootFolder;
  const activeFile = session.activeFile;
  const activeFileContent = session.activeContent;
  const onFileSelect = session.selectFile;
  const {
    endpointType: aiEndpointType,
    apiKey: aiApiKey,
    model: aiModel,
    freeProvider: aiFreeProvider,
    customEndpoint: aiCustomEndpoint,
    localEndpoint: aiLocalEndpoint,
    vibeMode,
    ollamaModels,
    ollamaLoading,
    ollamaError,
    localModels,
    localLoading,
    localError,
    refreshOllama: fetchOllamaModels,
    refreshLocal: fetchLocalModels,
  } = ai;
  const onAiApiKeyChange = ai.setApiKey;
  const onAiModelChange = ai.setModel;
  const onAiCustomEndpointChange = ai.setCustomEndpoint;
  const onAiLocalEndpointChange = ai.setLocalEndpoint;
  const onVibeModeChange = ai.setVibeMode;

  const [input, setInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!aiApiKey && (aiEndpointType === 'openai' || aiEndpointType === 'free'));
  const [loading, setLoading] = useState(false);
  const [mcpTools, setMcpTools] = useState<{ name: string; description: string }[]>([]);

  // Session state
   const [sessionId, setSessionId] = useState(() => Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const [sessionName, setSessionName] = useState('Untitled');
  const [savedSessions, setSavedSessions] = useState<StoredSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [memoryAddText, setMemoryAddText] = useState('');
  const [memoryAddType, setMemoryAddType] = useState<'fact' | 'decision' | 'summary' | 'preference'>('fact');
  const [memoryAddTags, setMemoryAddTags] = useState('');
  const [expandedChange, setExpandedChange] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);
  const [tokensIn, setTokensIn] = useState(0);
  const [tokensOut, setTokensOut] = useState(0);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm your **AI coding assistant** powered by Purple IDE.\n\nI can help you with:\n- **Reading and writing files** in your project\n- **Editing code** with diff preview\n- **Running commands** and viewing output\n- **Git operations** (status, diff, log, commit)\n- **Project analysis** and search\n\n### Getting Started\n1. Select a provider below (Ollama/Local for local, or cloud)\n2. Enable **Vibe Mode** for AI-driven coding\n3. Just describe what you want to build!\n\n> **Tip:** With Ollama or Local API, everything runs locally on your machine — no API key needed." },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryCaptureRef = useRef<{ count: number }>({ count: 0 });
  const stopRef = useRef(false);

  const refreshIndex = useCallback(() => setSavedSessions(loadIndex()), []);

  useEffect(() => { refreshIndex(); }, []);

  useEffect(() => {
    window.electronAPI.mcpListTools().then(res => {
      if (res.success) setMcpTools(res.tools);
    });
  }, []);

  // Restore current session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.messages && saved.messages.length > 1) {
          setSessionId(saved.id);
          setSessionName(saved.name);
          setMessages(saved.messages);
          setTokensIn(saved.tokensIn || 0);
          setTokensOut(saved.tokensOut || 0);
          setChanges(saved.changes || []);
        }
      }
    } catch {}
  }, []);

  // Listen for chat messages from main process (when tool calls are executed)
  useEffect(() => {
    const unsub = window.electronAPI.onChatReceiveText((text) => {
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    });
    return unsub;
  }, []);

  // Listen for tool diff events from main process
  useEffect(() => {
    const unsub = window.electronAPI.onAiToolDiff((data) => {
      setChanges(prev => {
        const dataName = data.path.split('/').pop() || data.path;
        let changed = false;
        const updated = prev.map(c => {
          const storedName = c.filePath.split('/').pop() || c.filePath;
          if (!changed && storedName === dataName && (c.filePath === data.path || data.path.endsWith(c.filePath) || c.filePath.endsWith(data.path))) {
            changed = true;
            return { ...c, diff: data.diff, type: data.type as 'created' | 'edited' };
          }
          return { ...c };
        });
        return changed ? updated : prev;
      });
    });
    return unsub;
  }, []);

  // Auto-save current session to localStorage
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const data = { id: sessionId, name: sessionName, messages, model: aiModel, endpointType: aiEndpointType, freeProvider: aiEndpointType === 'free' ? aiFreeProvider : undefined, tokensIn, tokensOut, changes, toolsEnabled: aiToolsEnabled };
      localStorage.setItem(LS_SESSION_KEY, JSON.stringify(data));
      saveSessionToLS(data);
      refreshIndex();
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, tokensIn, tokensOut, changes, sessionName, aiToolsEnabled, aiModel, aiEndpointType, aiFreeProvider]);

  // Load project memories on mount and when toggling memory panel
  useEffect(() => {
    (async () => {
      try {
        const res = await window.electronAPI.memoryList(rootFolder || undefined);
        if (res.success) setMemoryEntries(res.memories.filter(m => !m.projectPath || m.projectPath === rootFolder || !m.projectPath));
      } catch {}
    })();
  }, [showMemory, rootFolder]);

  // Auto-capture session summary to persistent memory (debounced, every 4+ messages)
  useEffect(() => {
    if (!sessionId) return;
    const userCount = messages.filter(m => m.role === 'user').length;
    if (userCount < 2) return;
    if (userCount - memoryCaptureRef.current.count < 4) return;
    memoryCaptureRef.current.count = userCount;
    const timer = setTimeout(async () => {
      try {
        const userMsgs = messages.filter(m => m.role === 'user' && m.content && m.content.trim());
        const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content && m.content.trim());
        const firstUser = userMsgs.length ? userMsgs[0].content.trim().slice(0, 200) : '';
        const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].content.trim().slice(0, 200) : '';
        const lastAssistant = assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1].content.trim().slice(0, 400) : '';
        const content = ['Task: ' + firstUser, lastUser ? 'Latest request: ' + lastUser : '', 'Outcome: ' + lastAssistant].filter(s => s).join('\n');
        const tokens = content.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const stop = new Set(['the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','as','is','are','was','were','be','been','it','its','this','that','these','those','i','you','he','she','we','they','what','when','where','which','who','how','why','all','any','each','every','some','no','not','do','does','did','can','could','should','would','will','just','very','so','about','into','over','after','before','during','out','off','above','below','up','down','use','used','using','make','made','get','got','go','goes','going','new','now','one','two','also','your','our','their','his','her','its','there','here','than','too','only','own','same','other','such','both','most','much','many','more','less','least','etc','vs','eg','ie']);
        const tags = Array.from(new Set(tokens.filter(w => !stop.has(w)))).slice(0, 8);
await window.electronAPI.memoryUpsertSessionSummary({ sessionId, content, tags, projectPath: rootFolder || undefined });
      } catch {}
    }, 2000);
    return () => clearTimeout(timer);
  }, [messages, sessionId, rootFolder]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    onStatsChange?.({ messageCount: messages.length, changes: changes.length });
  }, [messages.length, changes.length, onStatsChange]);

  const saveEndpointType = (type: EndpointType) => {
    ai.chooseEndpoint(type);
    setShowKeyInput((type === 'openai' || type === 'free') && !aiApiKey);
  };

  const saveFreeProvider = (provider: FreeProvider) => ai.chooseFreeProvider(provider);

  const newSession = () => {
    setSessionId(Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    setSessionName('Untitled');
    setMessages([{ role: 'assistant', content: 'Hi! How can I help you code?' }]);
    setTokensIn(0); setTokensOut(0); setChanges([]);
  };

  const loadSession = (id: string) => {
    const data = loadSessionFromLS(id);
    if (data) {
      setSessionId(data.id); setSessionName(data.name);
      setMessages(data.messages); setTokensIn(data.tokensIn || 0); setTokensOut(data.tokensOut || 0);
      setChanges(data.changes || []);
      if (data.model) ai.rawSetModel(data.model);
      if (data.endpointType) ai.setEndpointType(data.endpointType as EndpointType);
      if (data.freeProvider) ai.setFreeProvider(data.freeProvider as FreeProvider);
      if (data.toolsEnabled !== undefined) onAiToolsEnabledChange(data.toolsEnabled);
      localStorage.setItem(LS_SESSION_KEY, JSON.stringify(data));
      setShowSessions(false);
    }
  };

  const deleteSession = (id: string) => { deleteSessionFromLS(id); refreshIndex(); if (id === sessionId) newSession(); };
  const renameSession = () => { const n = prompt('Session name:', sessionName); if (n) setSessionName(n); };

  const handleMCPCall = async (toolName: string, args: Record<string, any>) => {
    const res = await window.electronAPI.mcpCallTool(toolName, args);
    return res.success ? res.result : { error: res.error };
  };

  const trackChange = (toolName: string, filePath: string, result: any) => {
    if (result.error) return;
    let type: 'created' | 'edited' | 'ran' = 'edited';
    let summary = '';
    const fname = filePath.split('/').pop() || filePath;
    if (toolName === 'write_file') {
      type = 'created';
      summary = `Created ${fname}`;
    } else if (toolName === 'edit_file') {
      type = 'edited';
      summary = `Edited ${fname}`;
    } else if (toolName === 'run_code') {
      type = 'ran';
      const ec = result.exitCode;
      summary = `Ran \`${fname}\`${ec !== null && ec !== undefined ? (ec === 0 ? ' ✓' : ` exit ${ec}`) : ''}`;
    }
    if (type === 'edited' || type === 'created' || type === 'ran') {
      setChanges(prev => [...prev, { id: Date.now().toString(36), type, filePath, summary, timestamp: Date.now() }]);
    }
  };

  const getFilePathFromArgs = (toolName: string, args: any): string => {
    if (args.path) return args.path;
    if (args.file) return args.file;
    if (args.command) return args.command;
    return toolName;
  };

  const handleStop = useCallback(() => {
    stopRef.current = true;
    window.electronAPI.abortAiChat();
    setLoading(false);
    setMessages(prev => [...prev, { role: 'assistant', content: '⏹ Stopped' }]);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    if ((aiEndpointType === 'openai' || aiEndpointType === 'free') && !aiApiKey) { setShowKeyInput(true); return; }
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setTokensIn(prev => prev + countTokens(input.trim()));
    setInput('');
    setLoading(true);
    stopRef.current = false;
    const endpoint = ai.effectiveEndpoint;

    // System prompt with file context
    let sysContent = aiToolsEnabled
      ? `You are an expert AI coding assistant with tool access.${vibeMode ? ' You are in VIBE CODING MODE: proactively create, edit, and organize files to fulfill the user\'s request. Write complete, production-ready code. Create all necessary files without asking. Be ambitious and thorough. Implement best practices, proper error handling, and clean code architecture.' : ' When the user asks you to do something that requires a tool, respond with ONLY a JSON tool call.'}

TOOLS (use exactly this format):
{"tool":"write_file","arguments":{"path":"file.ext","content":"code"}}
{"tool":"read_file","arguments":{"path":"file.ext"}}
{"tool":"read_file_lines","arguments":{"path":"file.ext","lineStart":1,"lineEnd":50}}
{"tool":"edit_file","arguments":{"path":"file.ext","oldString":"find","newString":"replace"}}
{"tool":"delete_file","arguments":{"path":"file.ext"}}
{"tool":"create_file","arguments":{"path":"file.ext"}}
{"tool":"list_files","arguments":{"path":"."}}
{"tool":"search_files","arguments":{"root":"src","query":"search term"}}
{"tool":"search_content","arguments":{"query":"search term"}}
{"tool":"run_code","arguments":{"command":"shell command"}}
{"tool":"git_status","arguments":{}}
{"tool":"git_diff","arguments":{}}
{"tool":"git_log","arguments":{"count":10}}
{"tool":"git_commit","arguments":{"message":"commit message"}}
{"tool":"get_project_info","arguments":{}}

CODING BEST PRACTICES:
- Write clean, maintainable code with proper error handling
- Follow language-specific conventions and best practices
- Add comments for complex logic
- Use meaningful variable and function names
- Implement proper input validation
- Handle edge cases and errors gracefully
- For large changes, break into multiple smaller edits
- Always read a file before editing to understand context

IMPORTANT RULES:
1. When a tool is needed: respond with ONLY the JSON object. No text before or after.
2. When no tool is needed: respond with plain text using markdown formatting. No JSON.
3. Content in write_file must escape newlines as \\n and quotes as \\\"
4. ONE TOOL PER RESPONSE - the system will execute it and call you again for the next tool
5. After you see TOOL RESULT, respond with a brief summary in plain text with markdown.
6. Use **bold**, *italic*, \`code\`, and code blocks for better readability.
7. For edit_file: use EXACT text matching - copy the exact string from the file including whitespace.
8. Before editing, READ the file first to understand its structure and context.`
      : `You are an expert coding assistant. Be concise and practical. Write clean, production-ready code with proper error handling. Use markdown formatting: **bold**, *italic*, \`code\`, code blocks with language tags.`;

    if (systemPromptOverride) {
      sysContent = systemPromptOverride + '\n\n' + sysContent;
    }

    // Add file context if available
    if (activeFile && activeFileContent) {
      const truncated = activeFileContent.length > 4000 ? activeFileContent.slice(0, 2000) + '\n... truncated ...\n' + activeFileContent.slice(-1000) : activeFileContent;
      sysContent += `\n\nCURRENT FILE: ${activeFile}\n\`\`\`\n${truncated}\n\`\`\``;
    }

    // Retrieve persistent memory context (keyword+recency scored, project-scoped)
    try {
      const mems = await window.electronAPI.memorySearch(input.trim(), rootFolder || undefined, 6);
      if ('memories' in mems && mems.memories && mems.memories.length > 0) {
        sysContent += '\n\n## PERSISTENT MEMORY (auto-loaded from past sessions on this project)\n' + mems.memories.map((m: MemoryEntry) => `- [${m.type}] ${m.content.split('\n')[0]}`).join('\n');
      }
    } catch {}

    try {
      // Build context - expanded window for better understanding
      const ctxMsgs: ChatMessage[] = [
        { role: 'system', content: sysContent },
        ...messages.slice(-20).filter(m => m.role !== 'system'),
        userMsg,
      ];

      // Use streaming for real-time response display
      let streamedContent = '';
      const placeholderMsg: ChatMessage = { role: 'assistant', content: '' };
      setMessages(prev => [...prev, placeholderMsg]);

      // Set up streaming listeners
      const unsubChunk = window.electronAPI.onAiStreamChunk((chunk) => {
        if (stopRef.current) return;
        streamedContent += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: streamedContent };
          return updated;
        });
      });

      const unsubDone = window.electronAPI.onAiStreamDone(() => {
        unsubChunk();
        unsubDone();
      });

      // Call streaming endpoint
      const res = await window.electronAPI.aiChatStream(ctxMsgs, aiApiKey, aiModel, endpoint, rootFolder || undefined, activeFile || undefined, aiTemperature);

      // Clean up listeners
      unsubChunk();
      unsubDone();

      if (stopRef.current) { setLoading(false); return; }
      if (!res.success) {
        // Remove the empty placeholder and show error
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${(res as any).error}` };
          return updated;
        });
        setLoading(false); return;
      }

      const reply = streamedContent || (res as any).message.content;
      setTokensOut(prev => prev + countTokens(reply));

      // Update the streamed message with final content
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: reply };
        return updated;
      });

      // Validate response quality - reject obviously garbled outputs
      const trimmedReply = reply.trim();
      if (trimmedReply.length > 0 && trimmedReply.length < 3 && !trimmedReply.match(/^{/)) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `⚠️ The model returned an incomplete response: "${trimmedReply}". This usually means the model is too small for coding tasks. Try a larger model like \`llama3\` or \`codellama\` with Ollama, or switch to a cloud provider.`
          };
          return updated;
        });
        setLoading(false);
        return;
      }

      // Extract tool calls
      const toolCalls = aiToolsEnabled ? extractToolCalls(reply) : [];

      if (toolCalls.length === 0) {
        // Plain text response - done
        setLoading(false);
        return;
      }

      // Execute tool call(s) in a loop - supports chained multi-tool workflows
      const MAX_TOOL_ITERATIONS = 10;
      let currentReply = reply;
      let currentToolCalls = toolCalls;
      const conversationHistory: ChatMessage[] = [{ role: 'assistant', content: reply }];

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS && currentToolCalls.length > 0; iteration++) {
        if (stopRef.current) break;

        // Process ALL tool calls in this response (not just the first)
        for (const tc of currentToolCalls) {
          if (stopRef.current) break;

          let result: any;

          if (tc.tool === 'read_terminal') {
            const terms = await window.electronAPI.terminalList();
            if (terms[0]) {
              const tr = await window.electronAPI.terminalGetOutput(terms[0], (tc.arguments.maxLines as number) || 200);
              result = tr.success ? { output: tr.output } : { error: tr.error };
            } else {
              result = { error: 'No terminal open' };
            }
          } else {
            const mr = await window.electronAPI.mcpCallTool(tc.tool, tc.arguments, rootFolder || undefined);
            result = mr.success ? mr.result : { error: mr.error };
          }

          // Track file changes
          if (['write_file', 'edit_file', 'delete_file'].includes(tc.tool)) {
            trackChange(tc.tool, getFilePathFromArgs(tc.tool, tc.arguments), result);
          }

          // Build result text for AI context
          let resultForAI = '';
          let chatCard = '';

          switch (tc.tool) {
            case 'write_file':
              if (result.error) {
                resultForAI = `Error: ${result.error}`;
                chatCard = `❌ ${result.error}`;
              } else {
                resultForAI = `File written: ${result.path}`;
                chatCard = `__tool_card__write_file__${getFilePathFromArgs(tc.tool, tc.arguments)}`;
              }
              break;
            case 'read_file':
              if (result.error) {
                resultForAI = `Error: ${result.error}`;
                chatCard = `❌ ${result.error}`;
              } else {
                const c = (result.content || '').slice(0, 3000);
                resultForAI = `File ${result.path}:\n${c}`;
                chatCard = `> 📄 ${result.path}\n\`\`\`\n${c.slice(0, 500)}\n\`\`\``;
              }
              break;
            case 'read_file_lines':
              if (result.error) {
                resultForAI = `Error: ${result.error}`;
                chatCard = `❌ ${result.error}`;
              } else {
                resultForAI = `Lines ${tc.arguments.lineStart}-${tc.arguments.lineEnd || 'end'}:\n${result.content}`;
                chatCard = `> 📄 Lines ${tc.arguments.lineStart}-${tc.arguments.lineEnd || 'end'} (${result.totalLines} total)\n\`\`\`\n${(result.content || '').slice(0, 500)}\n\`\`\``;
              }
              break;
            case 'create_file':
              if (result.error) {
                resultForAI = `Error: ${result.error}`;
                chatCard = `❌ ${result.error}`;
              } else {
                resultForAI = `Created empty file: ${tc.arguments.path}`;
                chatCard = `> 📝 Created ${tc.arguments.path}`;
              }
              break;
            case 'edit_file':
              resultForAI = result.error ? `Error: ${result.error}` : `Edited ${result.path}`;
              chatCard = result.error ? `❌ ${result.error}` : `> ✏️ Edited ${result.path}`;
              break;
            case 'delete_file':
              resultForAI = result.error ? `Error: ${result.error}` : `Deleted ${result.path}`;
              chatCard = result.error ? `❌ ${result.error}` : `> 🗑️ Deleted ${result.path}`;
              break;
            case 'list_files': {
              const entries = result.entries || [];
              resultForAI = `Files: ${entries.map((e: any) => e.name).join(', ')}`;
              chatCard = `> 📁 ${entries.length} items`;
              break;
            }
            case 'search_files': {
              const files = result.files || [];
              resultForAI = `Found ${files.length} files:\n${files.join('\n')}`;
              chatCard = `> 🔍 ${files.length} files found`;
              break;
            }
            case 'search_content': {
              const matches = result.matches || [];
              resultForAI = `Found ${matches.length}:\n${matches.slice(0, 15).map((m: any) => `${m.file}:${m.line}: ${m.text}`).join('\n')}`;
              chatCard = `> 🔍 ${matches.length} matches`;
              break;
            }
            case 'run_code': {
              const out = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(0, 2000);
              resultForAI = `Output:\n${out || '(empty)'}\nExit: ${result.exitCode ?? '?'}`;
              chatCard = `> ⚙️ \`${tc.arguments.command || tc.arguments.path}\`\n\`\`\`\n${out.slice(0, 300) || '(empty)'}\n\`\`\`\n${result.error ? '❌' : `exit ${result.exitCode ?? '?'}`}`;
              break;
            }
            case 'read_terminal': {
              const out = (result.output || '').slice(-1500);
              resultForAI = `Terminal:\n${out}`;
              chatCard = `> 📟 Terminal:\n\`\`\`\n${out.slice(-300)}\n\`\`\``;
              break;
            }
            case 'git_status':
              resultForAI = `Git status: ${result.status || 'clean'}`;
              chatCard = `> 📊 ${result.status || 'clean'}`;
              break;
            case 'git_diff': {
              const d = (result.content || '').slice(0, 2000);
              resultForAI = `Diff:\n${d}`;
              chatCard = `> 📝 Diff:\n\`\`\`diff\n${d.slice(0, 500)}\n\`\`\``;
              break;
            }
            case 'git_log': {
              const commits = (result.commits || []).slice(0, 10);
              resultForAI = `Log:\n${commits.map((c: any) => `${c.hash} ${c.message}`).join('\n')}`;
              chatCard = `> 📜 ${commits.map((c: any) => `${c.hash?.slice(0, 7)} ${c.message}`).join('\n')}`;
              break;
            }
            case 'git_commit':
              resultForAI = result.error ? `Error: ${result.error}` : 'Committed';
              chatCard = result.error ? `❌ ${result.error}` : `> ✅ Committed`;
              break;
            case 'get_project_info':
              resultForAI = `Project: ${result.name} v${result.version}`;
              chatCard = `> 📦 ${result.name} v${result.version}`;
              break;
            default:
              resultForAI = result.error ? `Error: ${result.error}` : `${tc.tool} succeeded`;
              chatCard = result.error ? `❌ ${tc.tool}: ${result.error}` : `> ✅ ${tc.tool} done`;
          }

          // Show card in chat
          setMessages(prev => [...prev, { role: 'assistant', content: chatCard }]);

          // Add tool result to conversation history (as user role, not system)
          conversationHistory.push({ role: 'assistant', content: `Called ${tc.tool}` });
          conversationHistory.push({ role: 'user', content: `TOOL RESULT (${tc.tool}):\n${resultForAI.slice(0, 4000)}` });
        }

        // After processing all tool calls, ask LLM for next action
        // Build context with pruning to avoid token overflow
        const prunedHistory = conversationHistory.slice(-20); // Keep last 20 messages
        const followUpMsgs: ChatMessage[] = [
          { role: 'system', content: sysContent },
          ...messages.slice(-10).filter(m => m.role !== 'system'),
          userMsg,
          ...prunedHistory,
          { role: 'user', content: 'If more tools are needed, respond with ONLY the next JSON tool call. Otherwise, respond with a brief plain text summary using markdown. No JSON if done.' },
        ];

        const followUpRes = await window.electronAPI.aiChat(followUpMsgs, aiApiKey, aiModel, endpoint, rootFolder || undefined, activeFile || undefined, aiTemperature);
        if (stopRef.current || !followUpRes.success) break;

        const followUpText = (followUpRes as any).message.content;
        setTokensOut(prev => prev + countTokens(followUpText));
        conversationHistory.push({ role: 'assistant', content: followUpText });

        // Check if follow-up contains another tool call
        const nextToolCalls = aiToolsEnabled ? extractToolCalls(followUpText) : [];
        if (nextToolCalls.length > 0) {
          // Continue the loop with the next tool
          currentReply = followUpText;
          currentToolCalls = nextToolCalls;
        } else {
          // Final text response - done
          setMessages(prev => [...prev, { role: 'assistant', content: followUpText }]);
          currentToolCalls = []; // Exit loop
        }
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    }
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: 'Chat cleared. How can I help you?' }]);
    setTokensIn(0); setTokensOut(0); setChanges([]);
  };

  const handleMemoryDelete = async (id: string) => {
    try { await window.electronAPI.memoryDelete(id); setMemoryEntries(prev => prev.filter(m => m.id !== id)); } catch {}
  };

  const handleMemoryAdd = async () => {
    if (!memoryAddText.trim()) return;
    try {
      const tags = memoryAddTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await window.electronAPI.memoryAdd({ type: memoryAddType, content: memoryAddText, tags, projectPath: rootFolder || undefined, source: 'manual' });
      if (res.success) {
        setMemoryEntries(prev => [...prev, res.memory]);
        setMemoryAddText(''); setMemoryAddTags('');
      }
    } catch {}
  };

  const handleMemoryClear = async () => {
    if (!confirm('Delete all project memories? This cannot be undone.')) return;
    try {
      const projectMemories = memoryEntries.filter(m => m.projectPath === rootFolder);
      for (const m of projectMemories) await window.electronAPI.memoryDelete(m.id);
      setMemoryEntries(prev => prev.filter(m => m.projectPath !== rootFolder));
    } catch {}
  };

  const manualSaveMemory = async () => {
    const userMsgs = messages.filter(m => m.role === 'user' && m.content && m.content.trim());
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content && m.content.trim());
    const firstUser = userMsgs.length ? userMsgs[0].content.trim().slice(0, 200) : '';
    const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].content.trim().slice(0, 200) : '';
    const lastAssistant = assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1].content.trim().slice(0, 400) : '';
    const content = ['Task: ' + firstUser, lastUser ? 'Latest request: ' + lastUser : '', 'Outcome: ' + lastAssistant].filter(s => s).join('\n');
    const tokens = content.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const stop = new Set(['the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','as','is','are','was','were','be','been','it','its','this','that','these','those','i','you','he','she','we','they','what','when','where','which','who','how','why','all','any','each','every','some','no','not','do','does','did','can','could','should','would','will','just','very','so','about','into','over','after','before','during','out','off','above','below','up','down','use','used','using','make','made','get','got','go','goes','going','new','now','one','two','also','your','our','their','his','her','its','there','here','than','too','only','own','same','other','such','both','most','much','many','more','less','least','etc','vs','eg','ie']);
    const tags = Array.from(new Set(tokens.filter(w => !stop.has(w)))).slice(0, 8);
    try { await window.electronAPI.memoryUpsertSessionSummary({ sessionId, content, tags, projectPath: rootFolder || undefined }); } catch {}
  };

  const needsKey = aiEndpointType === 'openai' || aiEndpointType === 'free';
  const totalTokens = tokensIn + tokensOut;

  const changeIcon = (t: string) => t === 'created' ? '📝' : t === 'edited' ? '✏️' : '▶';

  return (
    <div className="ai-agent">
      <div className="ai-panel-header">
        <span className="ai-panel-title">AI Chat</span>
        <span className="ai-panel-model" title={aiModel || 'No model selected'}>{aiModel || 'No model'}</span>
        <div className="ai-panel-header-actions">
          {changes.length > 0 && (
            <button className="ai-header-btn" onClick={() => setShowChanges(!showChanges)} title={`Changes (${changes.length})`} style={{ position: 'relative' }}>
              <IconDiff size={15} />
              <span className="ai-change-badge">{changes.length}</span>
            </button>
          )}
          <button className="ai-header-btn" onClick={() => setShowMemory(!showMemory)} title="Memory" style={{ position: 'relative' }}>
            <IconLightbulb size={15} />
            {memoryEntries.filter(m => !m.projectPath || m.projectPath === rootFolder).length > 0 && <span className="ai-change-badge">{memoryEntries.filter(m => !m.projectPath || m.projectPath === rootFolder).length}</span>}
          </button>
          <button className="ai-header-btn" onClick={() => setShowSessions(!showSessions)} title="Chat history">
            <IconHistory size={15} />
          </button>
          <button className="ai-header-btn" onClick={newSession} title="New chat">
            <IconPlus size={15} />
          </button>
          {onClose && (
            <button className="ai-header-btn" onClick={onClose} title="Close AI Chat (⌘⌥B)" aria-label="Close AI Chat">
              <IconClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Live agent swarm status strip */}
      <SwarmStatus onOpenSwarm={onOpenSwarm} />

      {/* Changes panel */}
      {showChanges && (
        <div className="ai-changes-panel">
          <div className="ai-changes-header">
            <span>Changes ({changes.length})</span>
            <button className="ai-header-btn" onClick={() => setShowChanges(false)}>✕</button>
          </div>
          {changes.length === 0 && <div className="ai-session-empty">No changes yet</div>}
          {changes.map(c => (
            <div key={c.id}>
              <div className="ai-change-item" onClick={() => {
                onFileSelect(c.filePath);
                setExpandedChange(expandedChange === c.id ? null : c.id);
              }} title={c.diff ? 'Click to toggle diff' : 'Open file'}>
                <span className="ai-change-expand">{c.diff ? (expandedChange === c.id ? '▼' : '▶') : ''}</span>
                <span className="ai-change-icon">{changeIcon(c.type)}</span>
                <span className="ai-change-summary">{c.summary}</span>
                <span className="ai-change-time">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {expandedChange === c.id && c.diff && (
                <div className="ai-change-diff">
                  <div className="ai-diff-stats">
                    <span className="ai-diff-added">+{c.diff.filter(d => d.type === 'added').length} added</span>
                    <span className="ai-diff-removed">-{c.diff.filter(d => d.type === 'removed').length} removed</span>
                  </div>
                  {c.diff.map((d, i) => (
                    <div key={i} className={`ai-diff-line ai-diff-${d.type}`}>
                      <span className="ai-diff-prefix">{d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '}</span>
                      <span className="ai-diff-lineno">{d.lineNumber}</span>
                      <span className="ai-diff-text">{d.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Session list */}
      {showSessions && (
        <div className="ai-session-list">
          <div className="ai-session-list-header">
            <span>Sessions</span>
            <button className="ai-header-btn" onClick={() => setShowSessions(false)}>✕</button>
          </div>
          {savedSessions.length === 0 && <div className="ai-session-empty">No saved sessions</div>}
          {savedSessions.map(s => (
            <div key={s.id} className="ai-session-item" onClick={() => loadSession(s.id)}>
              <div className="ai-session-item-name">{s.name}</div>
              <div className="ai-session-item-meta">{s.model} · {s.messageCount} msgs · {(s.tokensOut + s.tokensIn).toLocaleString()} tok</div>
              <button className="ai-session-del" onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Memory panel */}
      {showMemory && (
        <div className="ai-memory-panel">
          <div className="ai-memory-header">
            <span>Memory ({memoryEntries.length})</span>
            <button className="ai-header-btn" onClick={() => setShowMemory(false)}>✕</button>
          </div>
          <div className="ai-memory-content">
            {memoryEntries.length === 0 && <div className="ai-session-empty">No memories yet. Auto-capture saves session summaries, or add manually below.</div>}
            {memoryEntries.map(m => (
              <div key={m.id} className="ai-memory-item">
                <div className="ai-memory-item-main">
                  <span className={`ai-memory-type ${m.type}`}>{m.type}</span>
                  <span className="ai-memory-content">{m.content.split('\n')[0]}</span>
                  <span className="ai-memory-tags">{m.tags.slice(0, 5).map((t: string) => <span key={t} className="ai-memory-tag">{t}</span>)}</span>
                  <span className="ai-memory-time">{new Date(m.updatedAt).toLocaleString()}</span>
                </div>
                <div className="ai-memory-item-actions">
                  <button className="ai-header-btn" onClick={() => handleMemoryDelete(m.id)} title="Delete">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="ai-memory-add">
            <h4>Add Memory</h4>
            <div className="ai-memory-form">
              <select className="ai-memory-type-select" value={memoryAddType} onChange={e => setMemoryAddType(e.target.value as any)}>
                <option value="fact">Fact</option>
                <option value="decision">Decision</option>
                <option value="summary">Summary</option>
                <option value="preference">Preference</option>
              </select>
              <textarea className="ai-memory-textarea" placeholder="Enter memory content..." value={memoryAddText} onChange={e => setMemoryAddText(e.target.value)} rows={3} />
              <input className="ai-memory-tags-input" placeholder="Tags (comma-separated)" value={memoryAddTags} onChange={e => setMemoryAddTags(e.target.value)} />
              <div className="ai-memory-form-actions">
                <button className="ai-btn-primary" onClick={handleMemoryAdd} disabled={!memoryAddText.trim()}>Save</button>
                <button className="ai-btn-secondary" onClick={handleMemoryClear}>Clear Project Memories</button>
              </div>
            </div>
          </div>
          <div className="ai-memory-status">
            <span className="ai-memory-autocapture-dot" style={{ background: '#4dd8ff' }} />
            <span>Auto-capturing session context (every 4 user messages)</span>
          </div>
        </div>
      )}

      {/* Endpoint */}
      <div className="ai-endpoint-bar">
        <div className="ai-endpoint-tabs">
          {(['openai', 'free', 'ollama', 'local_other', 'mcp', 'custom'] as EndpointType[]).map(et => (
            <button
              key={et}
              className={`ai-endpoint-tab ${aiEndpointType === et ? 'active' : ''}`}
              onClick={() => saveEndpointType(et)}
            >
              {et === 'openai' ? 'OpenAI' : et === 'free' ? 'Cloud' : et === 'ollama' ? 'Ollama' : et === 'local_other' ? 'Local' : et === 'mcp' ? 'MCP' : 'Custom'}
            </button>
          ))}
        </div>
        {aiEndpointType === 'custom' && <input className="search-input" type="text" placeholder="http://localhost:11434" value={aiCustomEndpoint} onChange={e => onAiCustomEndpointChange(e.target.value)} style={{ flex: 1, fontSize: 12, marginTop: 4 }} />}
        {aiEndpointType === 'local_other' && <input className="search-input" type="text" placeholder="http://localhost:1234" value={aiLocalEndpoint} onChange={e => onAiLocalEndpointChange(e.target.value)} style={{ flex: 1, fontSize: 12, marginTop: 4 }} />}
      </div>

      {aiEndpointType === 'free' && (
        <div className="ai-endpoint-bar" style={{ borderBottom: 'none' }}>
          <select className="search-input" value={aiFreeProvider} onChange={e => saveFreeProvider(e.target.value as FreeProvider)} style={{ flex: 1, fontSize: 12 }}>
            {Object.entries(FREE_PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </div>
      )}

      {/* Model */}
      <div className="ai-model-bar">
        <div className="ai-model-row">
          <select className="search-input" value={aiModel} onChange={e => onAiModelChange(e.target.value)} style={{ flex: 1, fontSize: 12 }}>
            {aiEndpointType === 'ollama' && ollamaModels.length === 0 && !ollamaLoading && <option value="">{ollamaError || 'No models'}</option>}
            {aiEndpointType === 'local_other' && localModels.length === 0 && !localLoading && <option value="">{localError || 'No models'}</option>}
            {ai.modelOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {aiEndpointType === 'ollama' && <button className="ai-refresh-btn" onClick={fetchOllamaModels} disabled={ollamaLoading}><IconRefresh size={14} /></button>}
          {aiEndpointType === 'local_other' && <button className="ai-refresh-btn" onClick={fetchLocalModels} disabled={localLoading}><IconRefresh size={14} /></button>}
        </div>
        {aiEndpointType === 'ollama' && ollamaLoading && <span className="ai-model-status">Loading models...</span>}
        {aiEndpointType === 'ollama' && ollamaError && !ollamaLoading && <span className="ai-model-status error">{ollamaError}</span>}
        {aiEndpointType === 'local_other' && localLoading && <span className="ai-model-status">Loading models...</span>}
        {aiEndpointType === 'local_other' && localError && !localLoading && <span className="ai-model-status error">{localError}</span>}
        {aiEndpointType === 'custom' && <input className="search-input" type="text" placeholder="model-name" value={aiModel === 'gpt-4o-mini' ? '' : aiModel} onChange={e => onAiModelChange(e.target.value || 'gpt-4o-mini')} style={{ flex: 1, fontSize: 12, marginTop: 4 }} />}
        {aiEndpointType === 'local_other' && localModels.length === 0 && <input className="search-input" type="text" placeholder="model-name" value={aiModel} onChange={e => onAiModelChange(e.target.value)} style={{ flex: 1, fontSize: 12, marginTop: 4 }} />}
      </div>

      {/* API key */}
      {needsKey && (showKeyInput ? (
        <div className="ai-key-setup">
          <p style={{ fontSize: 11, margin: '4px 0' }}>{aiEndpointType === 'free' ? `Enter your ${FREE_PROVIDERS[aiFreeProvider]?.label || 'API'} key.` : 'Enter your OpenAI API key.'}</p>
          <div className="ai-key-row">
            <input className="search-input" type="password" placeholder={aiEndpointType === 'free' ? FREE_PROVIDERS[aiFreeProvider]?.keyPlaceholder || 'API key' : 'sk-...'} value={aiApiKey} onChange={e => onAiApiKeyChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setShowKeyInput(false); } }} />
            <button className="settings-option active" style={{ flex: '0 0 auto', padding: '4px 12px' }} onClick={() => setShowKeyInput(false)}>Save</button>
          </div>
        </div>
      ) : (
        <div className="ai-key-bar">
          <span className="ai-key-status">{aiEndpointType === 'openai' ? 'OpenAI key set ✓' : `${FREE_PROVIDERS[aiFreeProvider]?.label || ''} key set ✓`}</span>
          <button className="ai-key-change" onClick={() => setShowKeyInput(true)}>Change</button>
        </div>
      ))}
      {aiEndpointType === 'ollama' && (
        <div className="ai-key-bar ai-ollama-bar">
          <span className="ai-key-status">
            <span className="ai-status-dot online"></span>
            Ollama — local AI, no key needed
          </span>
          <button className="ai-refresh-btn ai-refresh-inline" onClick={fetchOllamaModels} disabled={ollamaLoading} title="Refresh models">
            <IconRefresh size={12} />
          </button>
        </div>
      )}
      {aiEndpointType === 'local_other' && (
        <div className="ai-key-bar ai-ollama-bar">
          <span className="ai-key-status">
            <span className="ai-status-dot online"></span>
            Local API — no key needed
          </span>
          <button className="ai-refresh-btn ai-refresh-inline" onClick={fetchLocalModels} disabled={localLoading} title="Refresh models">
            <IconRefresh size={12} />
          </button>
        </div>
      )}
      {aiEndpointType === 'custom' && <div className="ai-key-bar"><span className="ai-key-status">Custom endpoint</span></div>}

      {/* Messages */}
      <div className="ai-messages">
        {messages.map((msg, i) => {
          const toolCard = parseToolCard(msg.content);
          return (
            <div key={i} className={`ai-msg ${msg.role}`}>
              <div className="ai-msg-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
              {toolCard ? (
                <div className={`ai-msg-tool-card ${toolCard.startsWith('❌') ? 'ai-msg-tool-error' : ''}`}>
                  <span className="ai-msg-tool-icon">{toolCard.startsWith('❌') ? '❌' : '✅'}</span>
                  <span>{toolCard.startsWith('❌') ? toolCard : <>Successfully updated <code>{toolCard}</code></>}</span>
                </div>
              ) : (
                <div className="ai-msg-content-wrap">
                  <div className="ai-msg-content">
                    {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                  </div>
                  {msg.role === 'assistant' && (
                    <button
                      className="ai-msg-copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content);
                        setCopiedMsgId(i);
                        setTimeout(() => setCopiedMsgId(null), 1500);
                      }}
                      title="Copy"
                    >
                      {copiedMsgId === i ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {loading && <div className="ai-msg assistant ai-thinking-msg"><div className="ai-msg-role">AI</div><div className="ai-thinking">Generating response...</div></div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-input-bar">
        <textarea className="ai-input" placeholder={needsKey && !aiApiKey ? 'Set your API key first...' : vibeMode ? 'Describe what to build...' : 'Ask me to code...'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} rows={vibeMode ? 3 : 2} disabled={loading || (needsKey && !aiApiKey)} />
        <div className="ai-input-actions">
          {loading ? (
            <button className="ai-stop-btn" onClick={handleStop} title="Stop">⏹</button>
          ) : (
            <button className="ai-send-btn" onClick={sendMessage} disabled={!input.trim() || (needsKey && !aiApiKey)}><IconSend size={16} /></button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="ai-status-bar">
        <button className="ai-status-name" onClick={renameSession} title="Rename session">{sessionName}</button>
        <div className="ai-status-right">
          <button
            className={`ai-vibe-toggle ${vibeMode ? 'on' : 'off'}`}
            onClick={() => onVibeModeChange(!vibeMode)}
            title={vibeMode ? 'Vibe Mode: ON — AI proactively creates & edits files' : 'Vibe Mode: OFF — AI responds to commands'}
          >
            {vibeMode ? '✨ Vibe' : '💬 Chat'}
          </button>
          <button
            className={`ai-toggle-tools ${aiToolsEnabled ? 'on' : 'off'}`}
            onClick={() => onAiToolsEnabledChange(!aiToolsEnabled)}
            title={aiToolsEnabled ? 'Tools: ON — AI can read/write files' : 'Tools: OFF — AI can only chat'}
          >
            ⚡{aiToolsEnabled ? 'ON' : 'OFF'}
          </button>
          {changes.length > 0 && <span className="ai-status-changes" onClick={() => setShowChanges(!showChanges)}>{changes.length}</span>}
          <span className="ai-status-tokens">{totalTokens.toLocaleString()} tok</span>
        </div>
      </div>
    </div>
  );
};

export default AIAgent;
