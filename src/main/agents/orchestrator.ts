import { modelRouter } from './modelRouter.js';
import type { ChatMessage } from './modelRouter.js';
import { memoryManager } from './memoryManager.js';
import { PLANNER_SYSTEM_PROMPT, PLANNER_TOOLS } from './roles/planner.js';
import { FRONTEND_SYSTEM_PROMPT, FRONTEND_TOOLS } from './roles/frontend.js';
import { BACKEND_SYSTEM_PROMPT, BACKEND_TOOLS } from './roles/backend.js';
import { DATABASE_SYSTEM_PROMPT, DATABASE_TOOLS } from './roles/database.js';
import { DEBUGGER_SYSTEM_PROMPT, DEBUGGER_TOOLS } from './roles/debugger.js';
import { executeTool } from '../toolExecutor.js';
import type { ToolCall } from '../toolParser.js';
import { extractToolCalls } from '../toolParser.js';
import { applyUnifiedDiff, extractPatch } from './patchEngine.js';
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentRole = 'planner' | 'frontend' | 'backend' | 'database' | 'debugger';
export type AgentMode = 'vibe' | 'plan' | 'ask' | 'edit' | 'review' | 'debug';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Task {
  id: string;
  role: AgentRole;
  description: string;
  dependencies: string[];
  expectedFiles: string[];
  status: TaskStatus;
  assignee?: string;
  summary?: string;
}

export interface OrchestratorStatus {
  running: boolean;
  mode: AgentMode;
  tasks: Task[];
  activeAgent: AgentRole | null;
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'delete_file']);
const MAX_TOOL_ITERATIONS = 8;
const APPROVAL_TIMEOUT_MS = 120_000;
const THOUGHT_EMIT_INTERVAL_MS = 350;

interface RolePrompt {
  prompt: string;
  tools: string[];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class AgentOrchestrator {
  private tasks: Task[] = [];
  private running = false;
  private mode: AgentMode = 'vibe';
  private mainWindow: BrowserWindow | null = null;
  private activeAgent: AgentRole | null = null;
  private abortController: AbortController | null = null;
  private generation = 0;
  private pendingApprovals = new Map<string, (approved: boolean) => void>();
  private lastThoughtEmit = 0;
  private workspaceRoot: string | null = null;

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
    modelRouter.setMainWindow(win);
  }

  private emit(event: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  private thought(agent: string, message: string) {
    const now = Date.now();
    if (now - this.lastThoughtEmit < THOUGHT_EMIT_INTERVAL_MS) return;
    this.lastThoughtEmit = now;
    this.emit('agent:thought-stream', { agent, thought: message.slice(0, 400), ts: now });
  }

  private thoughtDelta(agent: string, full: string) {
    // Emit a rolling "current reasoning" preview, throttled
    this.thought(agent, full.slice(-300));
  }

  // ------------------------------- Control ---------------------------------

  setMode(mode: AgentMode) {
    this.mode = mode;
    this.emit('agent:mode-changed', { mode });
  }

  getMode(): AgentMode {
    return this.mode;
  }

  getStatus(): OrchestratorStatus {
    return { running: this.running, mode: this.mode, tasks: this.tasks, activeAgent: this.activeAgent };
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  stop() {
    this.generation++;
    this.running = false;
    this.activeAgent = null;
    try { this.abortController?.abort(); } catch {}
    for (const [id, resolve] of this.pendingApprovals) {
      resolve(false);
      this.pendingApprovals.delete(id);
    }
    this.emit('agent:complete', { tasks: this.tasks, cancelled: true });
  }

  resolveApproval(requestId: string, approved: boolean) {
    const resolve = this.pendingApprovals.get(requestId);
    if (resolve) {
      this.pendingApprovals.delete(requestId);
      resolve(approved);
    }
  }

  // ------------------------------- Planning --------------------------------

  async plan(goal: string, workspaceRoot: string): Promise<Task[]> {
    memoryManager.setWorkspace(workspaceRoot);
    this.workspaceRoot = workspaceRoot;
    const memoryContext = memoryManager.getContextForPrompt(4000);

    this.emit('agent:task-start', { phase: 'planning' });
    this.thought('Planner', 'Analyzing objective and creating task DAG...');

    const messages: ChatMessage[] = [
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Goal: ${goal}\n\nWorkspace memory:\n${memoryContext || '(empty workspace — new project)'}\n\nCreate the task DAG JSON.`,
      },
    ];

    this.abortController = new AbortController();
    const response = await modelRouter.chatStream(messages, {
      temperature: 0.2,
      maxTokens: 4096,
      signal: this.abortController.signal,
    }, {
      onDelta: (_d, full) => this.thoughtDelta('Planner', full),
    });

    const tasks = this.parseTaskDag(response.content);
    this.tasks = tasks;
    memoryManager.updateTaskQueue(tasks);
    memoryManager.recordArchitectureFromPlan(goal, tasks);
    this.emit('agent:task-start', { phase: 'planned', tasks });
    return tasks;
  }

  private parseTaskDag(content: string): Task[] {
    // Find the outermost JSON object containing "tasks"
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Tolerate trailing commas
      try {
        parsed = JSON.parse(jsonMatch[0].replace(/,\s*([}\]])/g, '$1'));
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed.tasks)) return [];
    const validRoles = new Set(['planner', 'frontend', 'backend', 'database', 'debugger']);
    return parsed.tasks
      .filter((t: any) => t && typeof t.description === 'string')
      .map((t: any, i: number) => ({
        id: typeof t.id === 'string' && t.id ? t.id : `task-${i + 1}`,
        role: validRoles.has(t.role) ? t.role : 'backend',
        description: String(t.description),
        dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
        expectedFiles: Array.isArray(t.expectedFiles) ? t.expectedFiles.map(String) : [],
        status: 'pending' as TaskStatus,
      }));
  }

  // ------------------------------- Execution -------------------------------

  async execute(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const myGeneration = ++this.generation;
    this.abortController = new AbortController();

    try {
      while (this.running && this.generation === myGeneration) {
        const ready = this.tasks.filter(t =>
          t.status === 'pending' &&
          t.dependencies.every(dep => this.tasks.find(d => d.id === dep)?.status === 'done')
        );

        if (ready.length === 0) {
          const unfinished = this.tasks.some(t => t.status === 'pending' || t.status === 'running');
          if (!unfinished) break;
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        for (const task of ready) {
          if (!this.running || this.generation !== myGeneration) break;
          await this.executeTask(task);
        }
      }
    } finally {
      if (this.generation === myGeneration) {
        this.running = false;
        this.activeAgent = null;
        memoryManager.updateTaskQueue(this.tasks);
        this.emit('agent:complete', { tasks: this.tasks });
      }
    }
  }

  private async executeTask(task: Task) {
    task.status = 'running';
    task.assignee = task.role;
    this.activeAgent = task.role;
    memoryManager.updateTaskQueue(this.tasks);
    this.emit('agent:task-start', { task });

    const role = this.rolePrompt(task.role);
    const history: ChatMessage[] = [];
    let failureOutput: string | null = null;

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (!this.running) throw new Error('Cancelled');

        const messages = this.buildTaskMessages(task, role.prompt, history);
        this.thought(task.role, iteration === 0 ? `Starting: ${task.description.slice(0, 120)}` : 'Continuing...');

        const response = await modelRouter.chatStream(messages, {
          temperature: task.role === 'planner' ? 0.2 : 0.3,
          maxTokens: 4096,
          signal: this.abortController?.signal,
        }, {
          onDelta: (_d, full) => this.thoughtDelta(task.role, full),
        });

        history.push({ role: 'assistant', content: response.content });
        this.emit('agent:thought-stream', { agent: task.role, thought: response.content.slice(0, 2000), final: true, iteration });

        // apply_patch embedded as a ```diff block without JSON wrapper
        const embedded = this.tryEmbeddedPatch(response.content);
        const toolCalls: ToolCall[] = embedded
          ? [embedded, ...extractToolCalls(response.content).filter(c => c.tool !== 'apply_patch')]
          : extractToolCalls(response.content);

        if (toolCalls.length === 0) {
          task.summary = response.content.slice(0, 2000);
          task.status = 'done';
          this.recordTaskMemory(task, response.content);
          this.thought(task.role, 'Task completed');
          break;
        }

        for (const call of toolCalls) {
          if (!this.running) throw new Error('Cancelled');
          const result = await this.runToolWithGate(task, call);
          history.push({ role: 'user', content: `TOOL RESULT (${call.tool}):\n${result}` });
          if (call.tool === 'run_code') {
            const failure = this.extractFailure(result);
            if (failure) failureOutput = failure;
          }
        }

        if (failureOutput) break; // hand off to debugger
      }

      if (task.status === 'running') {
        task.status = failureOutput ? 'failed' : 'done';
        if (task.status === 'done' && !task.summary) task.summary = 'Completed (iteration limit reached)';
      }
    } catch (error: any) {
      task.status = 'failed';
      task.summary = error?.message;
      failureOutput = failureOutput || error?.message || 'Unknown error';
      this.thought(task.role, `Error: ${(failureOutput || 'unknown error').slice(0, 200)}`);
    }

    memoryManager.updateTaskQueue(this.tasks);
    this.emit('agent:task-update', { task });

    if (task.status === 'failed' && task.role !== 'debugger') {
      await this.triggerDebugger(task, failureOutput || task.summary || 'Unknown failure');
    }
    this.activeAgent = null;
  }

  private buildTaskMessages(task: Task, systemPrompt: string, history: ChatMessage[]): ChatMessage[] {
    const memoryContext = memoryManager.getContextForPrompt(4000);
    const fileContext = this.describeExpectedFiles(task);
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Task (${task.id}): ${task.description}\nExpected files: ${task.expectedFiles.join(', ') || '(decide based on the task)'}\nMode: ${this.mode}\n\nWorkspace memory:\n${memoryContext || '(none)'}\n\nWorkspace context:\n${fileContext}`,
      },
      ...history,
    ];
  }

  private describeExpectedFiles(task: Task): string {
    if (!this.workspaceRoot) return '(no workspace open)';
    const parts: string[] = [];
    for (const rel of task.expectedFiles.slice(0, 5)) {
      try {
        const full = path.isAbsolute(rel) ? rel : path.join(this.workspaceRoot, rel);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const content = fs.readFileSync(full, 'utf-8');
          parts.push(`--- ${rel} (exists, ${content.split('\n').length} lines) ---\n${content.slice(0, 4000)}`);
        } else {
          parts.push(`--- ${rel} (does not exist yet) ---`);
        }
      } catch {}
    }
    return parts.join('\n\n') || '(no expected files listed)';
  }

  // ------------------------------- Tools & gates ---------------------------

  private rolePrompt(role: AgentRole): RolePrompt {
    switch (role) {
      case 'frontend': return { prompt: FRONTEND_SYSTEM_PROMPT, tools: FRONTEND_TOOLS };
      case 'backend': return { prompt: BACKEND_SYSTEM_PROMPT, tools: BACKEND_TOOLS };
      case 'database': return { prompt: DATABASE_SYSTEM_PROMPT, tools: DATABASE_TOOLS };
      case 'debugger': return { prompt: DEBUGGER_SYSTEM_PROMPT, tools: DEBUGGER_TOOLS };
      default: return { prompt: PLANNER_SYSTEM_PROMPT, tools: PLANNER_TOOLS };
    }
  }

  private tryEmbeddedPatch(content: string): ToolCall | null {
    const diffText = extractPatch(content);
    if (!diffText || !diffText.includes('@@')) return null;
    // Heuristic: find a target path mentioned near the diff
    const pathMatch = content.match(/(?:path|file|File)[:\s`]+([\w./\\-]+\.\w{1,5})/) ||
                      content.match(/([\w./\\-]+\.(?:ts|tsx|js|jsx|py|css|html|json|sql|prisma|go|rs))/);
    const target = pathMatch?.[1];
    if (!target) return null;
    return { tool: 'apply_patch', arguments: { path: target, diff: diffText } };
  }

  private async runToolWithGate(task: Task, call: ToolCall): Promise<string> {
    const role = this.rolePrompt(task.role);

    this.emit('agent:tool-call', {
      agent: task.role, tool: call.tool, args: call.arguments, taskId: task.id,
    });

    if (!role.tools.includes(call.tool)) {
      const msg = `Tool "${call.tool}" is not permitted for role "${task.role}"`;
      this.emit('agent:tool-result', { agent: task.role, tool: call.tool, ok: false, result: msg });
      return `ERROR: ${msg}`;
    }

    if (WRITE_TOOLS.has(call.tool) && this.mode !== 'vibe') {
      const approved = await this.requestApproval(call);
      if (!approved) {
        this.emit('agent:tool-result', { agent: task.role, tool: call.tool, ok: false, result: 'Denied by approval gate' });
        return 'ERROR: write operation denied by user. Ask for confirmation or explain what you need.';
      }
    }

    try {
      const root = this.workspaceRoot || '';
      const result = await executeTool(call, root);

      if (result.success && (call.tool === 'write_file' || call.tool === 'edit_file' || call.tool === 'apply_patch') && result.path) {
        this.emit('agent:file-changed', {
          path: result.path,
          diff: result.diff || [],
          type: call.tool === 'write_file' && !fs.existsSync(result.path) ? 'created' : 'edited',
          agent: task.role,
        });
        const content = fs.existsSync(result.path) ? fs.readFileSync(result.path, 'utf-8') : '';
        this.emit('file-written', {
          relativePath: this.workspaceRoot && result.path.startsWith(this.workspaceRoot)
            ? path.relative(this.workspaceRoot, result.path) : result.path,
          resolvedPath: result.path,
          content,
        });
      }

      const summary = this.summarizeToolResult(call.tool, result);
      this.emit('agent:tool-result', {
        agent: task.role, tool: call.tool, ok: result.success, result: summary.slice(0, 500),
      });
      return summary;
    } catch (error: any) {
      const msg = `ERROR: ${error?.message || error}`;
      this.emit('agent:tool-result', { agent: task.role, tool: call.tool, ok: false, result: msg });
      return msg;
    }
  }

  private async requestApproval(call: ToolCall): Promise<boolean> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const targetPath = (call.arguments?.path as string) || '';
    let preview = '';
    try {
      if (this.workspaceRoot && targetPath) {
        const full = path.isAbsolute(targetPath) ? targetPath : path.join(this.workspaceRoot, targetPath);
        if (fs.existsSync(full) && call.tool === 'apply_patch') {
          const original = fs.readFileSync(full, 'utf-8');
          const patchResult = applyUnifiedDiff(original, (call.arguments?.diff as string) || '');
          preview = patchResult.success ? patchResult.content.slice(0, 4000) : ((call.arguments?.diff as string) || '').slice(0, 4000);
        } else if (call.tool === 'edit_file') {
          const old = fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : '';
          const idx = old.indexOf((call.arguments?.oldString as string) || '');
          preview = idx >= 0
            ? old.slice(Math.max(0, idx - 200), idx) + '<<<' + call.arguments?.oldString + '>>>' + call.arguments?.newString
            : (call.arguments?.newString as string || '').slice(0, 2000);
        } else if (call.tool === 'write_file') {
          preview = ((call.arguments?.content as string) || '').slice(0, 2000);
        }
      }
    } catch {}

    this.emit('agent:approval-request', {
      requestId, tool: call.tool, path: targetPath, preview,
    });

    const approved = await new Promise<boolean>(resolve => {
      this.pendingApprovals.set(requestId, resolve);
      setTimeout(() => {
        if (this.pendingApprovals.has(requestId)) {
          this.pendingApprovals.delete(requestId);
          resolve(false);
        }
      }, APPROVAL_TIMEOUT_MS);
    });
    this.emit('agent:approval-response', { requestId, approved });
    return approved;
  }

  private summarizeToolResult(tool: string, result: any): string {
    if (!result.success) return `Error: ${result.error || 'failed'}`;
    switch (tool) {
      case 'read_file': return `Content (${(result.content || '').split('\n').length} lines):\n${(result.content || '').slice(0, 6000)}`;
      case 'list_files': return `Entries:\n${(result.entries || []).map((e: any) => `${e.type === 'directory' ? '[dir] ' : ''}${e.name}`).join('\n')}`;
      case 'search_content': return `Matches:\n${(result.matches || []).slice(0, 30).map((m: any) => `${m.file}:${m.line}: ${m.text}`).join('\n')}`;
      case 'search_files': return `Files:\n${(result.files || []).slice(0, 50).join('\n')}`;
      case 'write_file': case 'edit_file': case 'apply_patch': return `Modified ${result.path}${result.status ? ` (${result.status})` : ''}`;
      case 'run_code': return `exit=${result.exitCode}\nSTDOUT:\n${(result.stdout || '(empty)').slice(0, 3000)}\nSTDERR:\n${(result.stderr || '(empty)').slice(0, 3000)}`;
      default: return JSON.stringify(result).slice(0, 2000);
    }
  }

  private extractFailure(toolResult: string): string | null {
    const m = toolResult.match(/exit=(\d+)\n[\s\S]*?STDERR:\n([\s\S]*?)(?:\nSTDOUT:|$)/);
    if (m && parseInt(m[1], 10) > 0 && m[2] && m[2] !== '(empty)') {
      return `exit code ${m[1]}: ${memoryManager.pruneAndSummarize(m[2], 1500)}`;
    }
    if (toolResult.startsWith('ERROR:')) return toolResult.slice(0, 1000);
    return null;
  }

  // ------------------------------- Debugger --------------------------------

  private async triggerDebugger(failedTask: Task, error: string) {
    const debugTask: Task = {
      id: `debug-${failedTask.id}-${Date.now().toString(36)}`,
      role: 'debugger',
      description: `Fix failure from task ${failedTask.id} (${failedTask.role}): ${failedTask.description}. Failure: ${error.slice(0, 800)}`,
      dependencies: [],
      expectedFiles: failedTask.expectedFiles,
      status: 'pending',
    };
    this.tasks.push(debugTask);
    memoryManager.addGotcha(error, 'Debugger agent investigating');
    memoryManager.updateTaskQueue(this.tasks);
    this.emit('agent:task-start', { task: debugTask, autoTriggered: true });
  }

  // ------------------------------- Memory ----------------------------------

  private recordTaskMemory(task: Task, finalText: string) {
    try {
      if (task.role === 'database') {
        memoryManager.updateEndpoints(finalText.slice(0, 1500));
      } else if (task.role === 'backend') {
        const endpoints = finalText.match(/(GET|POST|PUT|PATCH|DELETE)\s+\/[\w/:.-]+/g);
        if (endpoints?.length) {
          memoryManager.updateEndpoints(endpoints.slice(0, 20).join('\n'));
        }
      } else if (task.role === 'frontend' && task.summary) {
        // Architecture updates are recorded by the planner; frontends touch components only.
      }
    } catch {}
  }
}

export const agentOrchestrator = new AgentOrchestrator();
