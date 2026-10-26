export interface TaskConfig {
  id: string;
  prompt: string;
  mode: string;
  model: string;
  provider: string;
  temperature: number;
  tools: string[];
  files: string[];
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  result?: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export class TaskRunner {
  private tasks: Map<string, TaskConfig> = new Map();
  
  createTask(config: Partial<TaskConfig>): TaskConfig {
    const task: TaskConfig = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      prompt: config.prompt || '',
      mode: config.mode || 'vibe',
      model: config.model || '',
      provider: config.provider || '',
      temperature: config.temperature ?? 0.2,
      tools: config.tools || [],
      files: config.files || [],
      status: 'pending',
      progress: 0,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      createdAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    return task;
  }
  
  getTask(id: string): TaskConfig | undefined {
    return this.tasks.get(id);
  }
  
  listTasks(): TaskConfig[] {
    return Array.from(this.tasks.values());
  }
  
  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (task && task.status === 'running') {
      task.status = 'cancelled';
      return true;
    }
    return false;
  }
}
