// ============================================================
// KASUMI Platform — Shared Types
// All shells (Nexcel, Wordo, future Presento) share these types.
// ============================================================

/** Unique stable ID for any workspace object (row, document, slide, etc.) */
export type WorkspaceObjectId = string

/** Which shell is currently active */
export type KasumiShell = 'nexcel' | 'wordo' | 'presento'

/** Role-based access mode — shared across all shells */
export type AccessMode = 'data-entry' | 'analyst' | 'admin'

/** Base capability set. Each shell may extend with shell-specific caps. */
export interface BaseCapabilities {
  canEdit: boolean
  canExport: boolean
  canModifySchema: boolean
}

/** A workspace connection config (Baserow instance) */
export interface WorkspaceConnection {
  baseUrl: string
  token: string
  databaseId: number
  useMock: boolean
}

/** Workspace object reference — allows cross-shell linking */
export interface WorkspaceObjectRef {
  id: WorkspaceObjectId
  shell: KasumiShell
  /** Human-readable label for display in bindings / cross-references */
  label: string
}
