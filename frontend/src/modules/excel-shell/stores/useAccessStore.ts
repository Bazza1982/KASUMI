import { create } from 'zustand'

export type AccessMode = 'data-entry' | 'analyst' | 'admin'

interface AccessState {
  mode: AccessMode
  setMode: (mode: AccessMode) => void
  // Capability checks
  canEdit: boolean
  canAddRows: boolean
  canDeleteRows: boolean
  canImport: boolean
  canExport: boolean
  canModifySchema: boolean
  canManageHiddenColumns: boolean
  canFreezePanes: boolean
}

const CAPABILITIES: Record<AccessMode, Omit<AccessState, 'mode' | 'setMode'>> = {
  'data-entry': {
    canEdit: true,
    canAddRows: true,
    canDeleteRows: false,
    canImport: false,
    canExport: false,
    canModifySchema: false,
    canManageHiddenColumns: false,
    canFreezePanes: false,
  },
  'analyst': {
    canEdit: true,
    canAddRows: true,
    canDeleteRows: true,
    canImport: true,
    canExport: true,
    canModifySchema: false,
    canManageHiddenColumns: true,
    canFreezePanes: true,
  },
  'admin': {
    canEdit: true,
    canAddRows: true,
    canDeleteRows: true,
    canImport: true,
    canExport: true,
    canModifySchema: true,
    canManageHiddenColumns: true,
    canFreezePanes: true,
  },
}

const savedMode = (typeof localStorage !== 'undefined'
  ? localStorage.getItem('kasumi_access_mode')
  : null) as AccessMode | null

const initialMode: AccessMode = savedMode && ['data-entry', 'analyst', 'admin'].includes(savedMode)
  ? savedMode
  : 'analyst'

export const useAccessStore = create<AccessState>((set) => ({
  mode: initialMode,
  ...CAPABILITIES[initialMode],
  setMode: (mode: AccessMode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kasumi_access_mode', mode)
    }
    set({ mode, ...CAPABILITIES[mode] })
  },
}))
