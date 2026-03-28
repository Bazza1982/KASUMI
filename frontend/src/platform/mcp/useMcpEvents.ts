import { useEffect, useRef, useCallback } from 'react'

export interface McpEvent {
  event: string
  data: unknown
  ts: number
}

export type McpEventHandler = (event: McpEvent) => void

/**
 * useMcpEvents — connects to the api-server WebSocket at /mcp/events
 * and calls the provided handler for each incoming event.
 *
 * Automatically reconnects on disconnect (exponential back-off, max 30s).
 * Cleans up on unmount.
 *
 * Usage:
 *   useMcpEvents((e) => {
 *     if (e.event === 'nexcel:cells_updated') { ... }
 *   })
 */
export function useMcpEvents(handler: McpEventHandler): void {
  const handlerRef = useRef<McpEventHandler>(handler)
  handlerRef.current = handler

  useEffect(() => {
    let ws: WebSocket | null = null
    let retryDelay = 1000
    let stopped = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect(): void {
      if (stopped) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const url = `${protocol}//${host}/mcp/events`

      ws = new WebSocket(url)

      ws.onopen = () => {
        retryDelay = 1000  // reset back-off on successful connect
      }

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as McpEvent
          handlerRef.current(parsed)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (stopped) return
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000)
          connect()
        }, retryDelay)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
