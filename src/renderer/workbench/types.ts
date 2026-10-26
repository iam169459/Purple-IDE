/** Shared shapes for workbench state. Component files stay out of these modules. */

export type LogKind = 'info' | 'command' | 'error' | 'success' | 'muted';

export type Logger = (text: string, kind?: LogKind) => void;

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  untitled: boolean;
}

export interface RevealRequest {
  path: string;
  line: number;
  nonce: number;
}

export interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

export interface GitState {
  branch: string | null;
  changeCount: number;
}

export type PanelViewId = 'problems' | 'output' | 'terminal';
export type SideViewId = 'explorer' | 'search' | 'source-control' | 'agents';
