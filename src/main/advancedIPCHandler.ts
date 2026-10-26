// Advanced IPC communication handler for large messages
import { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { compressContent, decompressContent, shouldCompress } from './fileOptimizer.js';
import { globalPerformanceMonitor } from './performanceMonitor.js';

export interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'stream' | 'error';
  channel: string;
  data: any;
  compressed?: boolean;
  sequence?: number; // For streaming
  total?: number; // For streaming
}

const STREAM_CHUNK_SIZE = 256 * 1024; // 256KB chunks for streaming
const MAX_MESSAGE_SIZE = 100 * 1024 * 1024; // 100MB max

export class AdvancedIPCHandler {
  private ipc: IpcMain;
  private webContents: WebContents | null = null;
  private pendingStreams = new Map<string, Buffer[]>();

  constructor(ipc: IpcMain) {
    this.ipc = ipc;
    this.setupHandlers();
  }

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents;
  }

  private setupHandlers(): void {
    // Handle large file reads with streaming
    this.ipc.handle('file:read-large', async (event, filePath: string) => {
      const operationId = `read-${Date.now()}-${Math.random()}`;
      globalPerformanceMonitor.startOperation(operationId);

      try {
        const fs = await import('fs');
        const stat = fs.statSync(filePath);

        if (stat.size > MAX_MESSAGE_SIZE) {
          throw new Error(`File too large: ${stat.size} bytes`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const shouldCompr = shouldCompress(content);

        let data: any = { content, compressed: false };
        if (shouldCompr) {
          const compressed = compressContent(content);
          data = { content: compressed.toString('base64'), compressed: true };
        }

        globalPerformanceMonitor.endOperation(operationId, 'file:read-large', {
          fileSize: stat.size,
          error: undefined,
        });

        return data;
      } catch (error) {
        globalPerformanceMonitor.endOperation(operationId, 'file:read-large', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    });

    // Stream large content in chunks
    this.ipc.handle('file:stream-large', async (event, filePath: string, chunkIndex: number) => {
      const fs = await import('fs');
      const stat = fs.statSync(filePath);
      const totalChunks = Math.ceil(stat.size / STREAM_CHUNK_SIZE);

      if (chunkIndex >= totalChunks) {
        throw new Error('Chunk index out of range');
      }

      const buffer = Buffer.alloc(Math.min(STREAM_CHUNK_SIZE, stat.size - chunkIndex * STREAM_CHUNK_SIZE));
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, chunkIndex * STREAM_CHUNK_SIZE);
      fs.closeSync(fd);

      return {
        data: buffer.toString('base64'),
        chunkIndex,
        totalChunks,
        chunkSize: buffer.length,
      };
    });

    // Handle compressed content
    this.ipc.handle('content:decompress', (event, compressedBase64: string) => {
      try {
        const buffer = Buffer.from(compressedBase64, 'base64');
        const content = decompressContent(buffer);
        return { success: true, content };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
  }

  // Send large message with automatic chunking and compression
  async sendLargeMessage(
    channel: string,
    data: any,
    receiver: WebContents = this.webContents!
  ): Promise<void> {
    if (!receiver) {
      throw new Error('No WebContents receiver set');
    }

    const operationId = `send-${Date.now()}-${Math.random()}`;
    globalPerformanceMonitor.startOperation(operationId);

    try {
      const jsonData = JSON.stringify(data);
      const dataSize = Buffer.byteLength(jsonData);

      if (dataSize > MAX_MESSAGE_SIZE) {
        throw new Error(`Message too large: ${dataSize} bytes (max: ${MAX_MESSAGE_SIZE})`);
      }

      // Decide whether to compress
      if (shouldCompress(jsonData)) {
        const compressed = compressContent(jsonData);
        receiver.send(channel, {
          data: compressed.toString('base64'),
          compressed: true,
          size: dataSize,
        });
      } else {
        receiver.send(channel, {
          data: jsonData,
          compressed: false,
          size: dataSize,
        });
      }

      globalPerformanceMonitor.endOperation(operationId, `send:${channel}`, {
        fileSize: dataSize,
      });
    } catch (error) {
      globalPerformanceMonitor.endOperation(operationId, `send:${channel}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Stream large content to renderer
  async streamLargeContent(
    channel: string,
    content: string,
    receiver: WebContents = this.webContents!
  ): Promise<void> {
    if (!receiver) {
      throw new Error('No WebContents receiver set');
    }

    const streamId = `stream-${Date.now()}-${Math.random()}`;
    const chunks = this.chunkContent(content);
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      const compressed = shouldCompress(chunk);
      
      const message = {
        streamId,
        sequence: i,
        total: totalChunks,
        data: compressed ? compressContent(chunk).toString('base64') : chunk,
        compressed,
      };

      receiver.send(channel, message);

      // Small delay to prevent flooding
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  private chunkContent(content: string): string[] {
    const chunks: string[] = [];
    let offset = 0;

    while (offset < content.length) {
      const chunk = content.substring(offset, offset + STREAM_CHUNK_SIZE);
      chunks.push(chunk);
      offset += STREAM_CHUNK_SIZE;
    }

    return chunks;
  }

  // Receive streamed content on renderer
  static assembleStreamedContent(messages: Array<{ data: string; compressed: boolean }>): string {
    let result = '';
    for (const msg of messages) {
      if (msg.compressed) {
        const buffer = Buffer.from(msg.data, 'base64');
        result += decompressContent(buffer);
      } else {
        result += msg.data;
      }
    }
    return result;
  }
}
