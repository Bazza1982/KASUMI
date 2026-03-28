// ─── MCP Core Types ──────────────────────────────────────────────────────────
// Based on Model Context Protocol specification (JSON-RPC 2.0)

export interface McpRequestContext {
  /** Session / connection identifier */
  sessionId: string
  /** Agent or client identifier (optional — populated if auth is present) */
  agentId?: string
}

// ─── JSON-RPC 2.0 ─────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number | null
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: '2.0'
  id: string | number | null
  result: T
}

export interface JsonRpcError {
  jsonrpc: '2.0'
  id: string | number | null
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError

// Standard JSON-RPC error codes
export const RPC_ERRORS = {
  PARSE_ERROR:      { code: -32700, message: 'Parse error' },
  INVALID_REQUEST:  { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS:   { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR:   { code: -32603, message: 'Internal error' },
  // MCP-specific application errors (-32000 to -32099)
  NOT_FOUND:        { code: -32000, message: 'Not found' },
  PERMISSION_DENIED:{ code: -32001, message: 'Permission denied' },
  INVALID_ARGUMENT: { code: -32002, message: 'Invalid argument' },
  CONFLICT:         { code: -32003, message: 'Conflict' },
  RATE_LIMITED:     { code: -32004, message: 'Rate limited' },
  UPSTREAM_ERROR:   { code: -32005, message: 'Upstream error' },
} as const

// ─── MCP Protocol ─────────────────────────────────────────────────────────────

export interface McpServerCapabilities {
  tools?: { listChanged?: boolean }
  resources?: { subscribe?: boolean; listChanged?: boolean }
  prompts?: { listChanged?: boolean }
}

export interface McpClientCapabilities {
  roots?: { listChanged?: boolean }
  sampling?: Record<string, unknown>
}

export interface McpInitializeParams {
  protocolVersion: string
  capabilities: McpClientCapabilities
  clientInfo: { name: string; version: string }
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: McpServerCapabilities
  serverInfo: { name: string; version: string }
  instructions?: string
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export interface McpToolInputSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    enum?: unknown[]
    items?: { type: string }
    properties?: Record<string, unknown>
  }>
  required?: string[]
}

export interface McpToolDefinition {
  name: string
  module: string
  version: string
  description: string
  inputSchema: McpToolInputSchema
  deprecated?: boolean
  replacedBy?: string
  handler: (args: Record<string, unknown>, ctx: McpRequestContext) => Promise<McpToolResult>
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string       // base64 for image
    mimeType?: string
  }>
  isError?: boolean
}

// Tool listing shape (what tools/list returns)
export interface McpToolListEntry {
  name: string
  description: string
  inputSchema: McpToolInputSchema
}

// ─── Resource definitions ─────────────────────────────────────────────────────

export interface McpResourceDefinition {
  uriPattern: string
  module: string
  version: string
  description: string
  mimeType?: string
  read: (uri: string, params: Record<string, string>, ctx: McpRequestContext) => Promise<McpResourceContent>
}

export interface McpResourceContent {
  uri: string
  mimeType?: string
  text?: string
  blob?: string  // base64
}

export interface McpResourceListEntry {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

// ─── SSE event ────────────────────────────────────────────────────────────────

export interface McpSseEvent {
  event: string
  data: unknown
}
