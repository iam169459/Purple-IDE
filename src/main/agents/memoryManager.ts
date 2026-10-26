import fs from 'fs';
import path from 'path';

export const MEMORY_SECTIONS = [
  'Active Architecture',
  'Database Schemas & Endpoints',
  'Ongoing Task Queue',
  'Known Gotchas & Solutions',
] as const;

export type MemorySection = (typeof MEMORY_SECTIONS)[number];

const ANSI_REGEX = /\x1B\[[0-9;?]*[a-zA-Z]|\x1B\][^\x07]*\x07|\x1B[=>]/g;
const MEMORY_TOKEN_BUDGET = 24_000;      // ~96KB of markdown
const COMPACT_TRIGGER_RATIO = 0.8;       // compact at 80% capacity
const MAX_GOTCHAS = 20;

export interface Summarizer {
  (prompt: string): Promise<string>;
}

export class MemoryManager {
  private memoryPath: string | null = null;
  private workspaceRoot: string | null = null;

  setWorkspace(root: string) {
    if (this.workspaceRoot === root && this.memoryPath) return;
    this.workspaceRoot = root;
    this.memoryPath = path.join(root, '.agent', 'memory.md');
    this.ensureMemoryFile();
  }

  getWorkspace(): string | null {
    return this.workspaceRoot;
  }

  private ensureMemoryFile() {
    if (!this.memoryPath || !this.workspaceRoot) return;
    try {
      const agentDir = path.dirname(this.memoryPath);
      if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
      if (!fs.existsSync(this.memoryPath)) {
        fs.writeFileSync(this.memoryPath, this.initialContent(), 'utf-8');
      }
    } catch {}
  }

  private initialContent(): string {
    return `# Agent Memory

${MEMORY_SECTIONS.map(s => `## ${s}\n`).join('\n')}
*Last updated: ${new Date().toISOString()}*
`;
  }

  // ------------------------------- Reading ---------------------------------

  readMemory(): string {
    if (!this.memoryPath) return '';
    try {
      return fs.readFileSync(this.memoryPath, 'utf-8');
    } catch {
      return '';
    }
  }

  /** Memory context pruned for LLM prompt injection. */
  getContextForPrompt(maxTokens = 6000): string {
    const raw = this.readMemory();
    if (!raw) return '';
    const pruned = this.pruneAndSummarize(raw, maxTokens);
    return pruned;
  }

  // ------------------------------- Writing ---------------------------------

  updateSection(section: MemorySection, content: string) {
    if (!this.memoryPath) return;
    try {
      let memory = this.readMemory();
      const header = `## ${section}`;
      const regex = new RegExp(`## ${this.escapeRegex(section)}\\n[\\s\\S]*?(?=\\n## |\\n\\*Last updated)`, 'i');
      const block = `${header}\n\n${content.trim()}\n`;
      if (regex.test(memory)) {
        memory = memory.replace(regex, block);
      } else {
        memory += `\n${block}`;
      }
      this.writeMemory(memory);
    } catch {}
  }

  updateArchitecture(content: string) {
    if (!content.trim()) return;
    this.updateSection('Active Architecture', content.trim());
  }

  updateEndpoints(content: string) {
    if (!content.trim()) return;
    this.updateSection('Database Schemas & Endpoints', content.trim());
  }

  updateTaskQueue(tasks: Array<{ id: string; role: string; description: string; status: string; assignee?: string }>) {
    if (!tasks.length) {
      this.updateSection('Ongoing Task Queue', '*No active tasks*');
      return;
    }
    const statusIcon = (s: string) => s === 'done' ? 'x' : s === 'failed' ? '!' : s === 'running' ? '~' : ' ';
    const content = tasks
      .map(t => `- [${statusIcon(t.status)}] **${t.role}** (${t.id}): ${t.description.slice(0, 140)}`)
      .join('\n');
    this.updateSection('Ongoing Task Queue', content);
  }

  addGotcha(error: string, solution: string) {
    const existing = this.readMemory();
    const section = this.extractSection(existing, 'Known Gotchas & Solutions');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entry = `### ${stamp}\n**Error:** ${this.sanitizeForMemory(error)}\n**Solution:** ${this.sanitizeForMemory(solution)}\n`;
    const updated = section.trim() ? `${section.trim()}\n\n${entry}` : entry;
    this.updateSection('Known Gotchas & Solutions', updated);
  }

  recordArchitectureFromPlan(goal: string, tasks: Array<{ role: string; description: string }>) {
    const stack = tasks.map(t => `- **${t.role}**: ${t.description.slice(0, 160)}`).join('\n');
    this.updateArchitecture(`Goal: ${goal.slice(0, 200)}\n\n${stack}`);
  }

  // ------------------------------- Pruning ---------------------------------

  /** Strip ANSI, collapse whitespace, cap size to a token budget. */
  pruneAndSummarize(text: string, maxTokens = 12_000): string {
    let out = text.replace(ANSI_REGEX, '');
    out = out.replace(/\r/g, '');
    // Collapse redundant repeated log lines (e.g. spinner frames, retries)
    out = out.replace(/(^|\n)([^\n]{0,200})\n(\2\n)+/g, '$1$2\n[repeated]\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    const maxChars = maxTokens * 4;
    if (out.length > maxChars) {
      // Keep head (architecture) and tail (gotchas) — drop middle.
      const head = out.slice(0, Math.floor(maxChars * 0.6));
      const tail = out.slice(-Math.floor(maxChars * 0.3));
      out = `${head}\n\n[...memory truncated...]\n\n${tail}`;
    }
    return out;
  }

  /**
   * Compacts the memory file when it reaches 80% of its token budget.
   * If an LLM summarizer is provided, older gotcha history is folded into a summary;
   * otherwise a deterministic trim (latest N gotchas, dedupe) is applied.
   */
  async maybeCompact(llm?: Summarizer): Promise<boolean> {
    const memory = this.readMemory();
    const tokens = this.estimateTokens(memory);
    if (tokens < MEMORY_TOKEN_BUDGET * COMPACT_TRIGGER_RATIO) return false;

    try {
      const gotchas = this.extractSection(memory, 'Known Gotchas & Solutions');
      const entries = gotchas.split(/\n(?=### )/).map(e => e.trim()).filter(Boolean);
      const recent = entries.slice(-MAX_GOTCHAS);

      if (llm && entries.length > MAX_GOTCHAS / 2) {
        const older = entries.slice(0, -MAX_GOTCHAS / 2).join('\n\n');
        try {
          const summary = await llm(this.pruneAndSummarize(older, 3000));
          if (summary) {
            this.updateSection('Known Gotchas & Solutions',
              `### Summary of earlier gotchas\n${this.sanitizeForMemory(summary)}\n\n${recent.join('\n\n')}`);
            return true;
          }
        } catch {}
      }
      this.updateSection('Known Gotchas & Solutions', recent.join('\n\n'));
      return true;
    } catch {
      return false;
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ------------------------------- Internals -------------------------------

  private writeMemory(memory: string) {
    if (!this.memoryPath) return;
    try {
      const stamped = memory.replace(/\*Last updated:[^*]*\*/, `*Last updated: ${new Date().toISOString()}*`);
      fs.mkdirSync(path.dirname(this.memoryPath), { recursive: true });
      fs.writeFileSync(this.memoryPath, stamped, 'utf-8');
    } catch {}
  }

  private extractSection(memory: string, section: string): string {
    const regex = new RegExp(`## ${this.escapeRegex(section)}\\n([\\s\\S]*?)(?=\\n## |\\n\\*Last updated|$)`, 'i');
    const match = memory.match(regex);
    return match ? match[1].trim() : '';
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private sanitizeForMemory(text: string): string {
    return text.replace(ANSI_REGEX, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }
}

export const memoryManager = new MemoryManager();
