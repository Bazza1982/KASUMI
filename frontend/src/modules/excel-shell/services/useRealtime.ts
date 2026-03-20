import { useEffect, useRef, useState } from 'react'
import { RealtimeService } from './RealtimeService'
import { useExcelStore } from '../stores/useExcelStore'

interface UseRealtimeOptions {
  baseUrl: string
  token: string
  enabled: boolean
}

export function useRealtime({ baseUrl, token, enabled }: UseRealtimeOptions) {
  const serviceRef = useRef<RealtimeService | null>(null)
  const activeTableId = useExcelStore(s => s.activeTableId)
  const loadSheet = useExcelStore(s => s.loadSheet)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !baseUrl || !token) return

    const service = new RealtimeService(baseUrl, token)
    serviceRef.current = service

    service.connect({
      onConnected: () => {
        setIsConnected(true)
        // Subscribe to active table
        if (activeTableId) service.subscribeToTable(activeTableId)
      },
      onRowUpdated: (tableId, rowId, values) => {
        // Patch the specific row in store state
        const sheet = useExcelStore.getState().sheet
        if (!sheet || sheet.tableId !== tableId) return

        const rowIndex = sheet.rows.findIndex(r => r.id === rowId)
        if (rowIndex === -1) return

        // Convert field_N keys to fieldId numbers
        const fieldUpdates: Record<number, unknown> = {}
        for (const [key, val] of Object.entries(values)) {
          const match = key.match(/^field_(\d+)$/)
          if (match) fieldUpdates[parseInt(match[1], 10)] = val
        }

        const newRows = [...sheet.rows]
        newRows[rowIndex] = {
          ...newRows[rowIndex],
          fields: { ...newRows[rowIndex].fields, ...fieldUpdates },
        }
        useExcelStore.setState({ sheet: { ...sheet, rows: newRows } })
      },
      onRowCreated: (tableId, _row) => {
        // Reload table to get the new row with correct data
        const sheet = useExcelStore.getState().sheet
        if (sheet?.tableId === tableId) loadSheet(tableId)
      },
      onRowDeleted: (tableId, rowId) => {
        const sheet = useExcelStore.getState().sheet
        if (!sheet || sheet.tableId !== tableId) return
        const newRows = sheet.rows.filter(r => r.id !== rowId)
        useExcelStore.setState({
          sheet: { ...sheet, rows: newRows, totalCount: sheet.totalCount - 1 }
        })
      },
      onFieldChanged: (tableId) => {
        const sheet = useExcelStore.getState().sheet
        if (sheet?.tableId === tableId) loadSheet(tableId)
      },
      onDisconnected: () => {
        setIsConnected(false)
        // Reconnection handled internally by RealtimeService
      },
    })

    return () => {
      service.disconnect()
      serviceRef.current = null
      setIsConnected(false)
    }
  }, [enabled, baseUrl, token])

  // Update subscription when active table changes
  useEffect(() => {
    const service = serviceRef.current
    if (!service || !activeTableId) return
    service.subscribeToTable(activeTableId)
    return () => service.unsubscribeFromTable(activeTableId)
  }, [activeTableId])

  return { isConnected }
}
