import { useCallback, useRef, useState } from 'react';
import type { LogKind } from './types';

export interface OutputEntry {
  id: number;
  time: number;
  text: string;
  kind: LogKind;
}

const MAX_LINES = 2000;

/** Sole owner of the Output panel log. */
export function useOutputLog() {
  const [lines, setLines] = useState<OutputEntry[]>([
    { id: 0, time: Date.now(), text: 'Purple IDE ready. Open a folder to begin.', kind: 'muted' },
  ]);
  const nextId = useRef(1);

  const log = useCallback((text: string, kind: LogKind = 'info') => {
    setLines((previous) => [
      ...previous.slice(-(MAX_LINES - 1)),
      { id: nextId.current++, time: Date.now(), text, kind },
    ]);
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, log, clear };
}
