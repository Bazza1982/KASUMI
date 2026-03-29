import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { isWsOriginAllowed } from '../originCheck'

/**
 * WsServer — broadcasts MCP mutation events to connected frontend clients.
 *
 * When an MCP write tool mutates nexcelStore or wordoStore, it calls
 * `broadcast(event, data)` here. The frontend listens via `useMcpEvents`
 * and refreshes the grid/document in real time.
 *
 * Event naming convention: `<module>:<action>`
 * Examples:
 *   nexcel:cells_updated   { sheetId, cells: [{ ref, value }] }
 *   nexcel:rows_inserted   { sheetId, afterRow, count }
 *   nexcel:rows_deleted    { sheetId, rowIds }
 *   nexcel:sheet_reset     { sheetId }
 *   nexcel:format_updated  { sheetId, range, format }
 */

let wss: WebSocketServer | null = null

export function attachWsServer(httpServer: Server): void {
  if (wss) return  // already attached
  wss = new WebSocketServer({ server: httpServer, path: '/mcp/events' })

  wss.on('connection', (ws, req) => {
    // Reject connections from disallowed origins (DNS rebinding protection)
    const origin = req.headers['origin'] as string | undefined
    if (!isWsOriginAllowed(origin)) {
      ws.close(1008, 'Origin not allowed')
      return
    }

    // Send a welcome event so the client knows it's live
    sendToClient(ws, 'connected', { server: 'kasumi-mcp-server', version: '2.0.0' })

    ws.on('error', () => {/* ignore — client disconnect */})
  })

  console.log('[MCP] WebSocket broadcast server attached at /mcp/events')
}

function sendToClient(ws: WebSocket, event: string, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data, ts: Date.now() }))
  }
}

/** Broadcast to all connected WebSocket clients. */
export function broadcast(event: string, data: unknown): void {
  if (!wss) return
  const payload = JSON.stringify({ event, data, ts: Date.now() })
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload) } catch { /* ignore */ }
    }
  })
}

export function connectedClientCount(): number {
  return wss?.clients.size ?? 0
}
