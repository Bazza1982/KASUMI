// ============================================================
// KASUMI Platform — Command Bus
// All shells route AI and user operations through this bus.
// Commands are validated before execution; results are auditable.
// ============================================================

import type { KasumiShell, WorkspaceObjectId } from '../types'

/** Result of executing a command */
export interface CommandResult {
  success: boolean
  error?: string
}

/** Base shape for all platform commands */
export interface PlatformCommand {
  /** Which shell handles this command */
  shell: KasumiShell
  /** Command name — unique within a shell */
  type: string
  /** Stable ID of the target object (row, document, slide…) */
  targetId?: WorkspaceObjectId
  /** Command payload — shell-specific */
  payload: Record<string, unknown>
  /** Set to true for AI-originated commands (enables extra validation) */
  fromAI?: boolean
}

/** Handler registered by a shell to process commands */
export type CommandHandler = (command: PlatformCommand) => Promise<CommandResult>

class CommandBusImpl {
  private handlers = new Map<KasumiShell, CommandHandler>()

  /** Shell registers its handler on mount */
  register(shell: KasumiShell, handler: CommandHandler): void {
    this.handlers.set(shell, handler)
  }

  /** Shell unregisters on unmount */
  unregister(shell: KasumiShell): void {
    this.handlers.delete(shell)
  }

  /** Dispatch a command to the appropriate shell */
  async dispatch(command: PlatformCommand): Promise<CommandResult> {
    const handler = this.handlers.get(command.shell)
    if (!handler) {
      return { success: false, error: `No handler registered for shell: ${command.shell}` }
    }
    return handler(command)
  }
}

/** Singleton command bus — import this instance everywhere */
export const commandBus = new CommandBusImpl()
