import { useEffect, useMemo } from 'react';
import type { CommandItem } from '../components/CommandPalette';
import {
  COMMANDS,
  commandForEvent,
  formatAccelerator,
} from '../../shared/commands';

export type CommandActions = Partial<Record<string, (payload?: unknown) => void>>;

/**
 * Projects the shared registry into the palette and the window key handler.
 * The native menu sends the same ids; there is no second command list.
 */
export function useCommands(actions: CommandActions, isMac: boolean) {
  const paletteCommands = useMemo<CommandItem[]>(
    () => COMMANDS
      .filter((command) => command.palette !== false && actions[command.id])
      .map((command) => ({
        id: command.id,
        label: command.label,
        category: command.category,
        shortcut: command.accelerator ? formatAccelerator(command.accelerator, isMac) : undefined,
        run: () => { actions[command.id]?.(); },
      })),
    [actions, isMac],
  );

  const run = (id: string, payload?: unknown) => {
    actions[id]?.(payload);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const command = commandForEvent(event, isMac);
      if (!command || !actions[command.id]) return;
      event.preventDefault();
      event.stopPropagation();
      actions[command.id]?.();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [actions, isMac]);

  return { paletteCommands, run };
}
