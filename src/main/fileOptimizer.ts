// Optimization: Large file handling with streaming and compression
import zlib from 'zlib';
import { createReadStream } from 'fs';
import fs from 'fs';
import { encodingForModel } from 'js-tiktoken';

const FILE_SIZE_WARNING = 10 * 1024 * 1024; // 10MB
const CHUNK_SIZE = 64 * 1024; // 64KB per chunk
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB limit
const COMPRESSION_THRESHOLD = 500 * 1024; // 500KB - compress if larger
const LRU_CACHE_MAX = 5000; // Max cached items
const TOKEN_CACHE_MAX = 2000; // Max token cache entries

export interface FileMetadata {
  size: number;
  lines: number;
  modified: number;
  encoding: string;
  isBinary: boolean;
}

// ===== LRU CACHE IMPLEMENTATION =====
class LRUCache<K, V> {
  private map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Move to end (most recent)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

// Cache file metadata to avoid repeated fs.stat calls
const metadataCache = new LRUCache<string, { data: FileMetadata; timestamp: number }>(500);
const tokenCache = new LRUCache<string, number>(TOKEN_CACHE_MAX);
const contentCache = new LRUCache<string, string>(50); // Cache large file contents (up to 50 files)
const METADATA_CACHE_TTL = 60000; // 1 minute

export async function getFileMetadata(filePath: string): Promise<FileMetadata> {
  const cached = metadataCache.get(filePath);
  if (cached && Date.now() - cached.timestamp < METADATA_CACHE_TTL) {
    return cached.data;
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;
  
  // Detect binary files by sampling first 512 bytes
  const buffer = Buffer.alloc(Math.min(512, size));
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer);
  fs.closeSync(fd);
  
  const isBinary = buffer.includes(0);

  if (!isBinary) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    const metadata: FileMetadata = {
      size,
      lines,
      modified: stat.mtimeMs,
      encoding: 'utf-8',
      isBinary,
    };
    metadataCache.set(filePath, { data: metadata, timestamp: Date.now() });
    return metadata;
  }

  const metadata: FileMetadata = { size, lines: 0, modified: stat.mtimeMs, encoding: 'binary', isBinary };
  metadataCache.set(filePath, { data: metadata, timestamp: Date.now() });
  return metadata;
}

// Stream large files in chunks for memory efficiency
export async function readFileStreaming(
  filePath: string,
  onChunk: (chunk: string | Buffer, progress: number) => void
): Promise<void> {
  const stat = fs.statSync(filePath);
  const size = stat.size;

  if (size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds max size: ${(size / 1024 / 1024).toFixed(2)}MB`);
  }

  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const stream = createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: CHUNK_SIZE,
    });

    stream.on('data', (chunk: string | Buffer) => {
      bytesRead += Buffer.byteLength(chunk);
      const progress = bytesRead / size;
      onChunk(chunk, progress);
    });

    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

// Token counting for AI prompts - with LRU cache
export function countTokens(text: string, model: string = 'gpt-4'): number {
  const cacheKey = `${model}:${text}`;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const enc = encodingForModel(model as any);
    const tokens = enc.encode(text).length;
    tokenCache.set(cacheKey, tokens);
    return tokens;
  } catch {
    // Fallback: rough estimate (1 token ≈ 4 chars)
    return Math.ceil(text.length / 4);
  }
}

// Context windowing for large files - with improved logic
export function getContextWindow(
  content: string,
  targetLine: number,
  contextLines: number = 50,
  maxTokens: number = 4000
): { text: string; startLine: number; endLine: number } {
  const lines = content.split('\n');
  let startLine = Math.max(0, targetLine - contextLines);
  let endLine = Math.min(lines.length, targetLine + contextLines);

  let windowText = lines.slice(startLine, endLine).join('\n');
  let tokens = countTokens(windowText);

  // Shrink window symmetrically if too many tokens
  while (tokens > maxTokens && endLine - startLine > 10) {
    const mid = Math.floor((startLine + endLine) / 2);
    if (mid - targetLine < targetLine - mid) {
      // Target is closer to start, trim end more
      endLine -= 5;
    } else {
      // Target is closer to end, trim start more
      startLine += 5;
    }
    endLine = Math.min(lines.length, endLine);
    startLine = Math.max(0, startLine);
    windowText = lines.slice(startLine, endLine).join('\n');
    tokens = countTokens(windowText);
  }

  return { text: windowText, startLine, endLine };
}

// Chunk large prompts for multiple requests - improved semantic chunking
export function chunkPrompt(
  prompt: string,
  maxTokens: number = 2000
): string[] {
  const tokens = countTokens(prompt);
  if (tokens <= maxTokens) {
    return [prompt];
  }

  // Try sentence-based splitting first
  let sentences: string[] = prompt.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length === 0 || sentences.some(s => s.length > 1000)) {
    // Fallback to paragraph-based splitting
    sentences = prompt.split(/\n\n+/);
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const potentialChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    const chunkTokens = countTokens(potentialChunk);
    
    if (chunkTokens > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk = potentialChunk;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Ensure no chunk is too large (fallback splitting by words)
  return chunks.flatMap(chunk => {
    if (countTokens(chunk) <= maxTokens) {
      return [chunk];
    }
    const words = chunk.split(/\s+/);
    const subChunks: string[] = [];
    let currentSub = '';
    for (const word of words) {
      const test = currentSub ? currentSub + ' ' + word : word;
      if (countTokens(test) > maxTokens && currentSub) {
        subChunks.push(currentSub.trim());
        currentSub = word;
      } else {
        currentSub = test;
      }
    }
    if (currentSub.trim()) subChunks.push(currentSub.trim());
    return subChunks;
  });
}

// Compress large content for IPC communication with better threshold
export function compressContent(content: string): Buffer {
  return zlib.deflateSync(Buffer.from(content, 'utf-8'), { level: zlib.constants.Z_DEFAULT_COMPRESSION });
}

export function decompressContent(buffer: Buffer): string {
  return zlib.inflateSync(buffer).toString('utf-8');
}

// Smart compression decision based on content size
export function shouldCompress(content: string): boolean {
  return content.length > COMPRESSION_THRESHOLD;
}

// Get cached file content if available
export function getCachedContent(filePath: string): string | undefined {
  return contentCache.get(filePath);
}

// Cache file content with automatic expiration
export function cacheFileContent(filePath: string, content: string): void {
  contentCache.set(filePath, content);
}

// Clear caches when needed
export function clearCaches(): void {
  metadataCache.clear();
  tokenCache.clear();
  contentCache.clear();
}

// Build file index for fast searching (useful for large file navigation)
export interface FileIndex {
  filePath: string;
  lineCount: number;
  functionNames: Array<{ name: string; line: number }>;
  classNames: Array<{ name: string; line: number }>;
  imports: Array<{ module: string; line: number }>;
}

export function buildFileIndex(content: string, filePath: string): FileIndex {
  const lines = content.split('\n');
  const functionNames: Array<{ name: string; line: number }> = [];
  const classNames: Array<{ name: string; line: number }> = [];
  const imports: Array<{ module: string; line: number }> = [];

  // Regex patterns for common languages
  const functionRegex = /^\s*(async\s+)?function\s+(\w+)|^\s*const\s+(\w+)\s*=\s*(?:async\s*)?\(|^\s*(\w+)\s*\(\s*.*\)\s*\{|^\s*(?:public|private|protected)?\s*(?:static\s+)?(\w+)\s*\(/;
  const classRegex = /^\s*(export\s+)?class\s+(\w+)|^\s*interface\s+(\w+)|^\s*type\s+(\w+)/;
  const importRegex = /^\s*import\s+.*\s+from\s+['"]([^'"]+)['"]/;

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const funcMatch = line.match(functionRegex);
    if (funcMatch) {
      const name = funcMatch[2] || funcMatch[3] || funcMatch[4] || funcMatch[5] || 'anonymous';
      functionNames.push({ name, line: lineNumber });
    }

    const classMatch = line.match(classRegex);
    if (classMatch) {
      const name = classMatch[2] || classMatch[3] || classMatch[4] || 'anonymous';
      classNames.push({ name, line: lineNumber });
    }

    const importMatch = line.match(importRegex);
    if (importMatch) {
      imports.push({ module: importMatch[1], line: lineNumber });
    }
  });

  return {
    filePath,
    lineCount: lines.length,
    functionNames,
    classNames,
    imports,
  };
}

export { fs };
