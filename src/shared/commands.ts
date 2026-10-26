/**
 * The one command registry.
 *
 * Command ids are the IPC contract between the native menu and the renderer,
 * the palette is generated from these definitions, and the renderer derives its
 * keyboard matching and shortcut labels from the same accelerator strings.
 * The main process must not declare accelerators of its own.
 */

export type CommandCategory =
  | 'File'
  | 'View'
  | 'Go'
  | 'Run'
  | 'Terminal'
  | 'AI'
  | 'Preferences'
  | 'Help';

export interface CommandDefinition {
  id: string;
  label: string;
  /** Menu label when it differs from the palette label. */
  menuLabel?: string;
  category: CommandCategory;
  /** Electron accelerator syntax, e.g. `Shift+CmdOrCtrl+P`. */
  accelerator?: string;
  /** Command palette entries default to on; native-menu-only commands opt out. */
  palette?: boolean;
}

export const COMMANDS: CommandDefinition[] = [
  { id: 'new-file', label: 'New File', category: 'File', accelerator: 'CmdOrCtrl+N' },
  { id: 'open-file', label: 'Open File...', category: 'File', accelerator: 'CmdOrCtrl+O' },
  { id: 'open-folder', label: 'Open Folder...', category: 'File', accelerator: 'CmdOrCtrl+Shift+O' },
  { id: 'save', label: 'Save', category: 'File', accelerator: 'CmdOrCtrl+S' },
  { id: 'save-as', label: 'Save As...', category: 'File', accelerator: 'CmdOrCtrl+Shift+S' },
  { id: 'save-all', label: 'Save All', category: 'File' },
  { id: 'close-editor', label: 'Close Editor', category: 'File', accelerator: 'CmdOrCtrl+W' },

  { id: 'command-palette', label: 'Command Palette', category: 'View', accelerator: 'Shift+CmdOrCtrl+P' },
  { id: 'quick-open', label: 'Quick Open', category: 'View', accelerator: 'CmdOrCtrl+P' },
  { id: 'toggle-sidebar', label: 'Toggle Primary Side Bar', category: 'View', accelerator: 'CmdOrCtrl+B' },
  { id: 'toggle-panel', label: 'Toggle Panel', category: 'View', accelerator: 'CmdOrCtrl+J' },
  { id: 'toggle-ai-chat', label: 'Toggle AI Chat', category: 'AI', accelerator: 'CmdOrCtrl+Alt+B' },
  { id: 'show-agents', label: 'Show Agents', category: 'AI', accelerator: 'CmdOrCtrl+Alt+A' },
  { id: 'focus-explorer', label: 'Show Explorer', menuLabel: 'Focus Explorer', category: 'View', accelerator: 'Shift+CmdOrCtrl+E' },
  { id: 'focus-search', label: 'Show Search', menuLabel: 'Focus Search', category: 'View', accelerator: 'Shift+CmdOrCtrl+F' },
  { id: 'focus-source-control', label: 'Show Source Control', menuLabel: 'Focus Source Control', category: 'View', accelerator: 'Ctrl+Shift+G' },
  { id: 'show-problems', label: 'Show Problems', category: 'View', accelerator: 'Shift+CmdOrCtrl+M' },
  { id: 'show-output', label: 'Show Output', category: 'View' },
  { id: 'toggle-terminal', label: 'Toggle Terminal', category: 'Terminal', accelerator: 'Ctrl+`' },
  { id: 'new-terminal', label: 'New Terminal', category: 'Terminal', accelerator: 'Ctrl+Shift+`' },
  { id: 'run-file', label: 'Run Active File', category: 'Run', accelerator: 'F5' },
  { id: 'open-settings', label: 'Open Settings', category: 'Preferences', accelerator: 'CmdOrCtrl+,' },
  { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts', category: 'Help', accelerator: 'Shift+CmdOrCtrl+/' },
  { id: 'select-model', label: 'Select Model', category: 'AI' },

  { id: 'go-back', label: 'Go Back', menuLabel: 'Back', category: 'Go', accelerator: 'Ctrl+-' },
  { id: 'go-forward', label: 'Go Forward', menuLabel: 'Forward', category: 'Go', accelerator: 'Ctrl+Shift+-' },
  { id: 'next-editor', label: 'Next Editor', category: 'Go', accelerator: 'Ctrl+Tab' },
  { id: 'previous-editor', label: 'Previous Editor', category: 'Go', accelerator: 'Ctrl+Shift+Tab' },

  /* Native-menu-only ids that carry a payload. */
  { id: 'editor-action', label: 'Editor Action', category: 'View', palette: false },
  { id: 'theme', label: 'Set Color Theme', category: 'Preferences', palette: false },
];

const BY_ID = new Map(COMMANDS.map((command) => [command.id, command]));

export const getCommand = (id: string): CommandDefinition | undefined => BY_ID.get(id);

const KEY_ALIASES: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  tab: 'Tab',
  space: ' ',
};

/** Stable key token for a KeyboardEvent, independent of Shift's character changes. */
export function keyTokenForEvent(event: KeyboardEvent): string {
  const { code, key } = event;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named: Record<string, string> = {
    Backquote: '`',
    Comma: ',',
    Minus: '-',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Period: '.',
    Equal: '=',
    Space: ' ',
    Tab: 'Tab',
    Escape: 'Escape',
    Enter: 'Enter',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };
  return named[code] || key;
}

function normalizeKeyToken(token: string): string {
  const lower = token.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (token.length === 1) return token.toUpperCase();
  return token;
}

interface ParsedAccelerator {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseAccelerator(accelerator: string, isMac: boolean): ParsedAccelerator {
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean);
  const rawKey = parts.length > 1 ? parts[parts.length - 1] : '';
  if (!rawKey) return { meta: false, ctrl: false, alt: false, shift: false, key: '' };

  const modifiers = parts.slice(0, -1);
  const cmdOrCtrl = modifiers.some((part) => part.toLowerCase() === 'cmdorctrl');
  const meta = modifiers.some((part) => ['cmd', 'command'].includes(part.toLowerCase())) || (cmdOrCtrl && isMac);
  const ctrl = modifiers.some((part) => ['ctrl', 'control'].includes(part.toLowerCase())) || (cmdOrCtrl && !isMac);
  const alt = modifiers.some((part) => ['alt', 'option'].includes(part.toLowerCase()));
  const shift = modifiers.some((part) => part.toLowerCase() === 'shift');
  return { meta, ctrl, alt, shift, key: normalizeKeyToken(rawKey) };
}

/** True when the event is exactly the registered accelerator (modifiers included). */
export function matchesAccelerator(event: KeyboardEvent, accelerator: string, isMac: boolean): boolean {
  const parsed = parseAccelerator(accelerator, isMac);
  if (!parsed.key) return false;
  if (event.metaKey !== parsed.meta) return false;
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.shiftKey !== parsed.shift) return false;
  return keyTokenForEvent(event) === parsed.key;
}

const MAC_KEY_LABELS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: '⏎',
  Escape: 'Esc',
  Space: 'Space',
};

/** Human-readable accelerator for tooltips, the palette and the shortcuts sheet. */
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean);
  const rawKey = parts[parts.length - 1] || '';
  const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
  const cmdOrCtrl = modifiers.includes('cmdorctrl');
  const ctrl = modifiers.includes('ctrl') || modifiers.includes('control') || (cmdOrCtrl && !isMac);
  const alt = modifiers.includes('alt') || modifiers.includes('option');
  const shift = modifiers.includes('shift');
  const meta = modifiers.includes('cmd') || modifiers.includes('command') || (cmdOrCtrl && isMac);
  const key = normalizeKeyToken(rawKey);
  const keyLabel = isMac ? MAC_KEY_LABELS[key] || key : key;

  if (isMac) {
    return `${ctrl ? '⌃' : ''}${alt ? '⌥' : ''}${shift ? '⇧' : ''}${meta ? '⌘' : ''}${keyLabel}`;
  }

  const labels: string[] = [];
  if (ctrl) labels.push('Ctrl');
  if (alt) labels.push('Alt');
  if (shift) labels.push('Shift');
  if (meta) labels.push('Meta');
  labels.push(keyLabel);
  return labels.join('+');
}

/** Shortcut label for a command id, or an empty string when it has none. */
export function shortcutFor(commandId: string, isMac: boolean): string {
  const command = getCommand(commandId);
  return command?.accelerator ? formatAccelerator(command.accelerator, isMac) : '';
}

/** The accelerator bound to a command id, if any. */
export function acceleratorFor(commandId: string): string | undefined {
  return getCommand(commandId)?.accelerator;
}

/** First command whose accelerator matches the event. */
export function commandForEvent(event: KeyboardEvent, isMac: boolean): CommandDefinition | undefined {
  return COMMANDS.find((command) => Boolean(
    command.accelerator && matchesAccelerator(event, command.accelerator, isMac),
  ));
}
