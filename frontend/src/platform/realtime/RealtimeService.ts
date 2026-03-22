// Baserow WebSocket event types
type BaserowWsEvent =
  | { type: 'row_created'; table_id: number; row: Record<string, unknown> }
  | { type: 'row_updated'; table_id: number; row_id: number; values: Record<string, unknown> }
  | { type: 'row_deleted'; table_id: number; row_id: number }
  | { type: 'field_created'; table_id: number; field: Record<string, unknown> }
  | { type: 'field_updated'; table_id: number; field: Record<string, unknown> }
  | { type: 'field_deleted'; table_id: number; field_id: number }

export type RealtimeHandler = {
  onRowUpdated?: (tableId: number, rowId: number, values: Record<string, unknown>) => void
  onRowCreated?: (tableId: number, row: Record<string, unknown>) => void
  onRowDeleted?: (tableId: number, rowId: number) => void
  onFieldChanged?: (tableId: number) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (err: Event) => void
}

export class RealtimeService {
  private ws: WebSocket | null = null
  private handlers: RealtimeHandler = {}
  private baseUrl: string
  private token: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 3000
  private maxReconnectDelay = 30000
  private shouldReconnect = true
  private subscriptions = new Set<number>()

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/^http/, 'ws')
    this.token = token
  }

  connect(handlers: RealtimeHandler): void {
    this.handlers = handlers
    this.shouldReconnect = true
    this._connect()
  }

  private _connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    try {
      const url = `${this.baseUrl}/ws/core/?jwt_token=${this.token}`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.reconnectDelay = 3000
        for (const tableId of this.subscriptions) {
          this._sendSubscribe(tableId)
        }
        this.handlers.onConnected?.()
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as BaserowWsEvent
          this._handleEvent(data)
        } catch {
          // Ignore malformed messages
        }
      }

      this.ws.onerror = (err) => {
        this.handlers.onError?.(err)
      }

      this.ws.onclose = () => {
        this.handlers.onDisconnected?.()
        if (this.shouldReconnect) {
          this._scheduleReconnect()
        }
      }
    } catch {
      if (this.shouldReconnect) {
        this._scheduleReconnect()
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this._connect()
    }, this.reconnectDelay)
  }

  private _sendSubscribe(tableId: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe_table', table_id: tableId }))
    }
  }

  subscribeToTable(tableId: number): void {
    this.subscriptions.add(tableId)
    this._sendSubscribe(tableId)
  }

  unsubscribeFromTable(tableId: number): void {
    this.subscriptions.delete(tableId)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe_table', table_id: tableId }))
    }
  }

  private _handleEvent(event: BaserowWsEvent): void {
    switch (event.type) {
      case 'row_updated':
        this.handlers.onRowUpdated?.(event.table_id, event.row_id, event.values)
        break
      case 'row_created':
        this.handlers.onRowCreated?.(event.table_id, event.row)
        break
      case 'row_deleted':
        this.handlers.onRowDeleted?.(event.table_id, event.row_id)
        break
      case 'field_created':
      case 'field_updated':
      case 'field_deleted':
        this.handlers.onFieldChanged?.(event.table_id)
        break
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton — one realtime service per session
let _instance: RealtimeService | null = null

export function getRealtimeService(baseUrl: string, token: string): RealtimeService {
  if (!_instance || (_instance as unknown as { baseUrl: string }).baseUrl !== baseUrl.replace(/^http/, 'ws')) {
    _instance?.disconnect()
    _instance = new RealtimeService(baseUrl, token)
  }
  return _instance
}
