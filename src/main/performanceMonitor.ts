// Performance monitoring and metrics collection for large file operations
export interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  fileSize?: number;
  tokenCount?: number;
  status: 'success' | 'error';
  error?: string;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 500; // Keep last 500 metrics
  private activeOperations = new Map<string, number>();

  startOperation(operationId: string): void {
    this.activeOperations.set(operationId, Date.now());
  }

  endOperation(
    operationId: string,
    operation: string,
    options?: {
      fileSize?: number;
      tokenCount?: number;
      error?: string;
    }
  ): PerformanceMetric {
    const startTime = this.activeOperations.get(operationId);
    if (!startTime) {
      throw new Error(`Operation ${operationId} was not started`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const status = options?.error ? 'error' : 'success';

    const metric: PerformanceMetric = {
      operation,
      startTime,
      endTime,
      duration,
      fileSize: options?.fileSize,
      tokenCount: options?.tokenCount,
      status,
      error: options?.error,
    };

    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    this.activeOperations.delete(operationId);
    return metric;
  }

  getMetrics(operationFilter?: string): PerformanceMetric[] {
    if (!operationFilter) {
      return [...this.metrics];
    }
    return this.metrics.filter(m => m.operation.includes(operationFilter));
  }

  getAverageTime(operation: string): number {
    const relevant = this.metrics.filter(m => m.operation === operation);
    if (relevant.length === 0) return 0;
    return relevant.reduce((sum, m) => sum + m.duration, 0) / relevant.length;
  }

  getStatistics(): {
    totalOperations: number;
    successRate: number;
    averageTime: number;
    slowestOperation: PerformanceMetric | null;
    fastestOperation: PerformanceMetric | null;
  } {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        successRate: 0,
        averageTime: 0,
        slowestOperation: null,
        fastestOperation: null,
      };
    }

    const successful = this.metrics.filter(m => m.status === 'success').length;
    const successRate = (successful / this.metrics.length) * 100;
    const averageTime = this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length;
    const slowest = this.metrics.reduce((max, m) => m.duration > max.duration ? m : max);
    const fastest = this.metrics.reduce((min, m) => m.duration < min.duration ? m : min);

    return {
      totalOperations: this.metrics.length,
      successRate,
      averageTime,
      slowestOperation: slowest,
      fastestOperation: fastest,
    };
  }

  clear(): void {
    this.metrics = [];
    this.activeOperations.clear();
  }

  generateReport(): string {
    const stats = this.getStatistics();
    const operationGroups = this.metrics.reduce((acc, m) => {
      if (!acc[m.operation]) {
        acc[m.operation] = { count: 0, totalTime: 0, errors: 0 };
      }
      acc[m.operation].count++;
      acc[m.operation].totalTime += m.duration;
      if (m.status === 'error') {
        acc[m.operation].errors++;
      }
      return acc;
    }, {} as Record<string, { count: number; totalTime: number; errors: number }>);

    let report = '=== Performance Report ===\n';
    report += `Total Operations: ${stats.totalOperations}\n`;
    report += `Success Rate: ${stats.successRate.toFixed(2)}%\n`;
    report += `Average Operation Time: ${stats.averageTime.toFixed(2)}ms\n`;
    report += `Slowest Operation: ${stats.slowestOperation?.operation} (${stats.slowestOperation?.duration}ms)\n`;
    report += `Fastest Operation: ${stats.fastestOperation?.operation} (${stats.fastestOperation?.duration}ms)\n\n`;

    report += '=== Operations Breakdown ===\n';
    Object.entries(operationGroups).forEach(([op, data]) => {
      report += `${op}: ${data.count} ops, ${(data.totalTime / data.count).toFixed(2)}ms avg`;
      if (data.errors > 0) {
        report += `, ${data.errors} errors`;
      }
      report += '\n';
    });

    return report;
  }
}

// Memory usage tracker
export class MemoryTracker {
  private snapshots: Array<{ timestamp: number; usageBytes: number }> = [];
  private maxSnapshots = 100;

  takeSnapshot(): number {
    const usage = process.memoryUsage().heapUsed;
    this.snapshots.push({ timestamp: Date.now(), usageBytes: usage });
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    return usage;
  }

  getMemoryGrowth(): number {
    if (this.snapshots.length < 2) return 0;
    const first = this.snapshots[0].usageBytes;
    const last = this.snapshots[this.snapshots.length - 1].usageBytes;
    return last - first;
  }

  getAverageMemory(): number {
    if (this.snapshots.length === 0) return 0;
    return this.snapshots.reduce((sum, s) => sum + s.usageBytes, 0) / this.snapshots.length;
  }

  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  getReport(): string {
    const growth = this.getMemoryGrowth();
    const avg = this.getAverageMemory();
    return `Memory Growth: ${this.formatBytes(growth)} | Average: ${this.formatBytes(avg)}`;
  }

  clear(): void {
    this.snapshots = [];
  }
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();
export const globalMemoryTracker = new MemoryTracker();
