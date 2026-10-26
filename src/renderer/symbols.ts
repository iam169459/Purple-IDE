export type OutlineKind = 'class' | 'function' | 'method' | 'field' | 'namespace' | 'string';

export interface OutlineSymbol {
  name: string;
  kind: OutlineKind;
  line: number;
}

const push = (list: OutlineSymbol[], name: string, kind: OutlineKind, line: number) => {
  const clean = name.trim();
  if (!clean) return;
  list.push({ name: clean, kind, line });
};

/**
 * Lightweight outline extraction for the common languages in the editor.
 * Monaco's language services remain the source of syntax diagnostics; this
 * only supplies the sidebar outline and stays useful for plain files.
 */
export function extractSymbols(content: string, languageId: string): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.replace(/\r$/, '');
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    if (languageId === 'markdown') {
      const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (heading) push(symbols, heading[2], 'string', lineNumber);
      continue;
    }

    if (languageId === 'json') {
      const key = line.match(/^\s{2}"([^"]+)"\s*:/);
      if (key) push(symbols, key[1], 'field', lineNumber);
      continue;
    }

    if (languageId === 'python') {
      const def = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/);
      if (def) { push(symbols, def[1], 'function', lineNumber); continue; }
      const cls = trimmed.match(/^class\s+([A-Za-z_]\w*)/);
      if (cls) { push(symbols, cls[1], 'class', lineNumber); continue; }
      continue;
    }

    if (languageId === 'go') {
      const fn = trimmed.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/);
      if (fn) { push(symbols, fn[1], 'function', lineNumber); continue; }
      const typ = trimmed.match(/^type\s+([A-Za-z_]\w*)/);
      if (typ) { push(symbols, typ[1], 'class', lineNumber); continue; }
      continue;
    }

    if (languageId === 'rust') {
      const fn = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/);
      if (fn) { push(symbols, fn[1], 'function', lineNumber); continue; }
      const typ = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+([A-Za-z_]\w*)/);
      if (typ) { push(symbols, typ[1], 'class', lineNumber); continue; }
      const impl = trimmed.match(/^impl(?:<[^>]+>)?\s+([A-Za-z_]\w*)/);
      if (impl) { push(symbols, impl[1], 'namespace', lineNumber); continue; }
      continue;
    }

    if (languageId === 'ruby') {
      const def = trimmed.match(/^def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)/);
      if (def) { push(symbols, def[1], 'function', lineNumber); continue; }
      const mod = trimmed.match(/^(?:class|module)\s+([A-Za-z_]\w*)/);
      if (mod) { push(symbols, mod[1], 'class', lineNumber); continue; }
      continue;
    }

    if (languageId === 'css' || languageId === 'scss' || languageId === 'less') {
      const selector = line.match(/^([.#][\w-]+[^{]*)\{\s*$/);
      if (selector) push(symbols, selector[1].trim(), 'class', lineNumber);
      continue;
    }

    // JavaScript / TypeScript / Java-like declarations.
    if (/^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+/.test(line)) {
      const match = line.match(/(?:class|interface)\s+([A-Za-z_$][\w$]*)/);
      if (match) push(symbols, match[1], 'class', lineNumber);
      continue;
    }
    const interfaceMatch = line.match(/^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
    if (interfaceMatch) { push(symbols, interfaceMatch[1], 'namespace', lineNumber); continue; }

    const functionMatch = line.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (functionMatch) { push(symbols, functionMatch[1], 'function', lineNumber); continue; }

    const variableMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
    if (variableMatch) { push(symbols, variableMatch[1], 'function', lineNumber); continue; }

    const constantMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (constantMatch) { push(symbols, constantMatch[1], 'field', lineNumber); continue; }

    const methodMatch = line.match(/^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/);
    if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(methodMatch[1])) {
      push(symbols, methodMatch[1], 'method', lineNumber);
    }
  }

  const seen = new Set<string>();
  return symbols
    .filter((symbol) => {
      const key = `${symbol.name}:${symbol.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 300);
}

export const symbolIcon = (kind: OutlineKind): string => {
  switch (kind) {
    case 'class': return 'symbol-class';
    case 'function': return 'symbol-function';
    case 'method': return 'symbol-method';
    case 'namespace': return 'symbol-namespace';
    case 'string': return 'symbol-string';
    default: return 'symbol-field';
  }
};
