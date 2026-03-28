import type { Request, Response } from 'express'
import { toolRegistry } from './ToolRegistry'
import { resourceRegistry } from './ResourceRegistry'
import {
  RPC_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  type JsonRpcSuccess,
  type McpInitializeParams,
  type McpInitializeResult,
  type McpRequestContext,
  type McpToolResult,
} from './types'

// ─── Server identity ──────────────────────────────────────────────────────────

const SERVER_INFO = {
  name: 'kasumi-mcp-server',
  version: '1.0.0',
}

const PROTOCOL_VERSION = '2024-11-05'

const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
  prompts: { listChanged: false },
}

// ─── Session state ────────────────────────────────────────────────────────────

const initializedSessions = new Set<string>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, data } }
}

function makeSuccess<T>(id: string | number | null, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: '2.0', id, result }
}

function textResult(text: string): McpToolResult {
  return { content: [{ type: 'text', text }] }
}

function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

// ─── Method dispatcher ────────────────────────────────────────────────────────

async function dispatch(
  req: JsonRpcRequest,
  ctx: McpRequestContext,
): Promise<JsonRpcResponse> {
  const { id, method, params } = req

  try {
    switch (method) {

      // ── Lifecycle ────────────────────────────────────────────────────────────

      case 'initialize': {
        const p = params as McpInitializeParams
        const result: McpInitializeResult = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: SERVER_CAPABILITIES,
          serverInfo: SERVER_INFO,
          instructions: 'KASUMI MCP Server — Nexcel spreadsheet and Wordo document tools. Use tools/list to discover available tools.',
        }
        initializedSessions.add(ctx.sessionId)
        return makeSuccess(id, result)
      }

      case 'notifications/initialized':
        // Client acknowledgement — no response needed (notification has null id)
        return makeSuccess(id, {})

      case 'ping':
        return makeSuccess(id, {})

      // ── Tool discovery + invocation ──────────────────────────────────────────

      case 'tools/list': {
        return makeSuccess(id, { tools: toolRegistry.list() })
      }

      case 'tools/call': {
        if (!initializedSessions.has(ctx.sessionId)) {
          return makeError(id, RPC_ERRORS.INVALID_REQUEST.code, 'Client must send initialize before tools/call')
        }
        const p = params as { name: string; arguments?: Record<string, unknown> }
        if (!p?.name) {
          return makeError(id, RPC_ERRORS.INVALID_PARAMS.code, 'params.name is required')
        }
        const tool = toolRegistry.get(p.name)
        if (!tool) {
          return makeError(id, RPC_ERRORS.METHOD_NOT_FOUND.code, `Unknown tool: ${p.name}`)
        }
        const args = p.arguments ?? {}

        try {
          const result = await tool.handler(args, ctx)
          return makeSuccess(id, result)
        } catch (toolErr) {
          const msg = toolErr instanceof Error ? toolErr.message : String(toolErr)
          return makeSuccess(id, errorResult(`Tool error: ${msg}`))
        }
      }

      // ── Resource discovery + read ────────────────────────────────────────────

      case 'resources/list': {
        return makeSuccess(id, { resources: resourceRegistry.list() })
      }

      case 'resources/read': {
        if (!initializedSessions.has(ctx.sessionId)) {
          return makeError(id, RPC_ERRORS.INVALID_REQUEST.code, 'Client must send initialize before resources/read')
        }
        const p = params as { uri: string }
        if (!p?.uri) {
          return makeError(id, RPC_ERRORS.INVALID_PARAMS.code, 'params.uri is required')
        }
        const content = await resourceRegistry.read(p.uri, ctx)
        if (!content) {
          return makeError(id, RPC_ERRORS.NOT_FOUND.code, `Resource not found: ${p.uri}`)
        }
        return makeSuccess(id, { contents: [content] })
      }

      // ── Prompts (stub — no prompts defined yet) ───────────────────────────────

      case 'prompts/list': {
        return makeSuccess(id, { prompts: [] })
      }

      case 'prompts/get': {
        return makeError(id, RPC_ERRORS.NOT_FOUND.code, 'No prompts defined')
      }

      // ── Unknown method ───────────────────────────────────────────────────────

      default:
        return makeError(id, RPC_ERRORS.METHOD_NOT_FOUND.code, `Method not found: ${method}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MCP router] unexpected error:', msg)
    return makeError(id, RPC_ERRORS.INTERNAL_ERROR.code, 'Internal error', msg)
  }
}

// ─── HTTP handler: POST /mcp ──────────────────────────────────────────────────

export async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = (req.headers['mcp-session-id'] as string) || `http-${Date.now()}`
  const ctx: McpRequestContext = { sessionId }

  let body: unknown
  try {
    body = req.body
  } catch {
    res.status(200).json(makeError(null, RPC_ERRORS.PARSE_ERROR.code, 'Parse error'))
    return
  }

  // Batch requests
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map(item => handleSingle(item, ctx))
    )
    // Filter out null (notifications with no id don't get responses)
    const toSend = responses.filter(Boolean)
    res.json(toSend.length === 1 ? toSend[0] : toSend)
    return
  }

  const response = await handleSingle(body, ctx)
  if (response !== null) {
    res.json(response)
  } else {
    res.status(204).end()
  }
}

async function handleSingle(raw: unknown, ctx: McpRequestContext): Promise<JsonRpcResponse | null> {
  if (!raw || typeof raw !== 'object') {
    return makeError(null, RPC_ERRORS.INVALID_REQUEST.code, 'Invalid Request')
  }
  const req = raw as Partial<JsonRpcRequest>
  if (req.jsonrpc !== '2.0') {
    return makeError(req.id ?? null, RPC_ERRORS.INVALID_REQUEST.code, 'jsonrpc must be "2.0"')
  }
  if (!req.method || typeof req.method !== 'string') {
    return makeError(req.id ?? null, RPC_ERRORS.INVALID_REQUEST.code, 'method is required')
  }

  const response = await dispatch(req as JsonRpcRequest, ctx)

  // MCP notifications have no id — don't return a response
  if (req.id === undefined) return null

  return response
}

// ─── SSE handler: GET /mcp/sse ────────────────────────────────────────────────

// In-memory SSE client set for broadcasting server-initiated events
const sseClients = new Set<Response>()

export function handleMcpSse(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Send initial endpoint event (MCP SSE spec)
  const sessionId = `sse-${Date.now()}-${Math.random().toString(36).slice(2)}`
  res.write(`event: endpoint\ndata: ${JSON.stringify({ sessionId })}\n\n`)

  sseClients.add(res)

  req.on('close', () => {
    sseClients.delete(res)
  })
}

/** Broadcast an event to all connected SSE clients. */
export function broadcastMcpEvent(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(payload)
    } catch {
      sseClients.delete(client)
    }
  }
}
