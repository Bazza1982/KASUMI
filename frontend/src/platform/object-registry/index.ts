// ============================================================
// KASUMI Platform — Object Registry
// Shells register their objects here so other shells can
// cross-reference them (e.g. WORDO embeds a Nexcel table).
// ============================================================

import type { KasumiShell, WorkspaceObjectId, WorkspaceObjectRef } from '../types'

class ObjectRegistryImpl {
  private objects = new Map<WorkspaceObjectId, WorkspaceObjectRef>()

  /** Register a workspace object (called when a shell loads its data) */
  register(ref: WorkspaceObjectRef): void {
    this.objects.set(ref.id, ref)
  }

  /** Remove an object (called when a shell unloads) */
  unregister(id: WorkspaceObjectId): void {
    this.objects.delete(id)
  }

  /** Look up an object by ID */
  get(id: WorkspaceObjectId): WorkspaceObjectRef | undefined {
    return this.objects.get(id)
  }

  /** List all objects from a specific shell */
  listByShell(shell: KasumiShell): WorkspaceObjectRef[] {
    return Array.from(this.objects.values()).filter(o => o.shell === shell)
  }

  /** List all registered objects */
  listAll(): WorkspaceObjectRef[] {
    return Array.from(this.objects.values())
  }
}

/** Singleton registry — import this instance everywhere */
export const objectRegistry = new ObjectRegistryImpl()

/** Generate a stable workspace object ID */
export function makeObjectId(shell: KasumiShell, localId: string | number): WorkspaceObjectId {
  return `${shell}:${localId}`
}
