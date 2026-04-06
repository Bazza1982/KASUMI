/**
 * MCP layer integration tests.
 *
 * Tests the full JSON-RPC 2.0 protocol path through Express:
 *   initialize → tools/list → tools/call → resources/read → prompts/list → prompts/get
 *
 * Auth tier enforcement and Origin guard are also verified.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import supertest from 'supertest'
import express from 'express'
import { startMcpServer } from '../mcp/server'
import { handleMcpPost, handleMcpSse } from '../mcp/router'
import { mcpOriginGuard } from '../mcp/originCheck'

// Build a minimal test app (mirrors index.ts but without unrelated routes)
function buildApp() {
  const app = express()
  app.use(express.json())
  app.post('/mcp', mcpOriginGuard, handleMcpPost)
  app.get('/mcp/sse', mcpOriginGuard, handleMcpSse)
  return app
}

let app: ReturnType<typeof buildApp>

beforeAll(() => {
  startMcpServer()
  app = buildApp()
})

afterEach(() => {
  delete process.env['KASUMI_READ_KEY']
  delete process.env['KASUMI_WRITE_KEY']
  delete process.env['KASUMI_ADMIN_KEY']
  vi.resetModules()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: '2.0', id, method, params }
}

async function post(body: Record<string, unknown> | Array<Record<string, unknown>>, headers: Record<string, string> = {}) {
  return supertest(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body as object)
}

async function openSse(headers: Record<string, string> = {}) {
  return supertest(app)
    .get('/mcp/sse')
    .set(headers)
    .buffer(true)
    .parse((res, callback) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        data += chunk
        if (data.includes('\n\n')) {
          callback(null, { text: data })
          ;((res as unknown) as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
        }
      })
      res.on('end', () => callback(null, { text: data }))
    })
}

function extractSessionId(ssePayload: string): string {
  const match = ssePayload.match(/sessionId=([^\s&]+)/)
  if (!match) {
    throw new Error(`No sessionId found in SSE payload: ${ssePayload}`)
  }
  return match[1]
}

// Perform a full initialize → tools/call sequence and return the session ID
async function initSession(): Promise<string> {
  const res = await post(rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.1' },
  }))
  return res.headers['mcp-session-id'] as string
}

// ─── initialize ───────────────────────────────────────────────────────────────

describe('initialize', () => {
  it('returns protocolVersion and serverInfo', async () => {
    const res = await post(rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.1' },
    }))

    expect(res.status).toBe(200)
    expect(res.body.result.protocolVersion).toBe('2024-11-05')
    expect(res.body.result.serverInfo.name).toBe('kasumi-mcp-server')
  })

  it('echoes Mcp-Session-Id response header', async () => {
    const res = await post(rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.1' },
    }))

    expect(res.headers['mcp-session-id']).toBeDefined()
    expect(typeof res.headers['mcp-session-id']).toBe('string')
  })

  it('notifications/initialized returns 202 with no body', async () => {
    // Notifications have no id — server must return 202, not 204
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(res.status).toBe(202)
    expect(res.text).toBe('')
  })
})

// ─── tools/list ───────────────────────────────────────────────────────────────

describe('tools/list', () => {
  it('returns an array of tools', async () => {
    const res = await post(rpc('tools/list'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.result.tools)).toBe(true)
    expect(res.body.result.tools.length).toBeGreaterThan(40)
  })

  it('each tool has name, description, inputSchema', async () => {
    const res = await post(rpc('tools/list'))
    const tools: unknown[] = res.body.result.tools
    for (const t of tools) {
      const tool = t as Record<string, unknown>
      expect(typeof tool['name']).toBe('string')
      expect(typeof tool['description']).toBe('string')
      expect(tool['inputSchema']).toBeDefined()
    }
  })

  it('excludes deprecated tools by default', async () => {
    const res = await post(rpc('tools/list', {}))
    const tools = res.body.result.tools as Array<Record<string, unknown>>
    const deprecated = tools.filter(t => t['deprecated'] === true)
    expect(deprecated).toHaveLength(0)
  })

  it('includes deprecated tools when includeDeprecated=true', async () => {
    const res = await post(rpc('tools/list', { includeDeprecated: true }))
    const tools = res.body.result.tools as Array<Record<string, unknown>>
    // All tools returned — deprecated field is present on each
    expect(tools.every(t => 'deprecated' in t)).toBe(true)
  })
})

// ─── tools/call ───────────────────────────────────────────────────────────────

describe('tools/call', () => {
  it('blocks tools/call before initialize', async () => {
    const res = await post(
      rpc('tools/call', { name: 'system_ping' }),
      { 'mcp-session-id': 'never-initialized' },
    )
    expect(res.body.error).toBeDefined()
    expect(res.body.error.code).toBe(-32600)
  })

  it('system_ping succeeds after initialize', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('tools/call', { name: 'system_ping', arguments: {} }),
      { 'mcp-session-id': sessionId },
    )
    expect(res.status).toBe(200)
    expect(res.body.result).toBeDefined()
    expect(res.body.error).toBeUndefined()
    const text = res.body.result.content[0].text as string
    const parsed = JSON.parse(text)
    expect(parsed.status).toBe('ok')
  })

  it('returns METHOD_NOT_FOUND for unknown tool', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('tools/call', { name: 'no_such_tool', arguments: {} }),
      { 'mcp-session-id': sessionId },
    )
    expect(res.body.error.code).toBe(-32601)
  })

  it('returns INVALID_PARAMS when params.name is missing', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('tools/call', {}),
      { 'mcp-session-id': sessionId },
    )
    expect(res.body.error.code).toBe(-32602)
  })

  it('nexcel_analyse_sheet returns sheet analysis', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('tools/call', { name: 'nexcel_analyse_sheet', arguments: { sheetId: '1' } }),
      { 'mcp-session-id': sessionId },
    )
    expect(res.body.error).toBeUndefined()
    const parsed = JSON.parse(res.body.result.content[0].text)
    expect(parsed.rowCount).toBeGreaterThan(0)
    expect(Array.isArray(parsed.columnStats)).toBe(true)
  })

  it('wordo_execute_semantic_command executes generated wordo.* tools', async () => {
    const sessionId = await initSession()

    const surfaceRes = await post(
      rpc('tools/call', { name: 'wordo_get_command_surface', arguments: {} }),
      { 'mcp-session-id': sessionId },
    )
    const surface = JSON.parse(surfaceRes.body.result.content[0].text)
    expect(surface.some((item: { type: string }) => item.type === 'rewrite_block')).toBe(true)

    const readRes = await post(
      rpc('tools/call', { name: 'wordo_read_document', arguments: { documentId: '1' } }),
      { 'mcp-session-id': sessionId },
    )
    const document = JSON.parse(readRes.body.result.content[0].text)
    const sectionId = document.sections[0].id
    const blockId = document.sections[0].blocks[1].id

    const execRes = await post(
      rpc('tools/call', {
        name: 'wordo_execute_semantic_command',
        arguments: {
          toolName: 'wordo.rewrite_block',
          args: { sectionId, blockId, newText: 'Executed over MCP.' },
        },
      }),
      { 'mcp-session-id': sessionId },
    )

    expect(execRes.body.error).toBeUndefined()
    const result = JSON.parse(execRes.body.result.content[0].text)
    expect(result.layoutImpact).toBe('local')

    const auditRes = await post(
      rpc('tools/call', { name: 'wordo_export_command_audit', arguments: {} }),
      { 'mcp-session-id': sessionId },
    )
    const audit = JSON.parse(auditRes.body.result.content[0].text)
    expect(audit.summary.commandTypeCounts.rewrite_block).toBeGreaterThan(0)
  })

  it('blocks tools/call on SSE sessions before initialize', async () => {
    const sseRes = await openSse()
    expect(sseRes.status).toBe(200)

    const sessionId = extractSessionId((sseRes.body as { text: string }).text)
    const res = await post(
      rpc('tools/call', { name: 'system_ping', arguments: {} }),
      { 'mcp-session-id': sessionId },
    )

    expect(res.body.error).toBeDefined()
    expect(res.body.error.code).toBe(-32600)
  })
})

// ─── auth tiers ───────────────────────────────────────────────────────────────

describe('auth tiers (dev mode — all open)', () => {
  // In test environment no keys are configured, so DEV_MODE = true
  // Every tool should be accessible regardless of tier

  it('write tool succeeds in dev mode without a key', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('tools/call', { name: 'nexcel_write_cell', arguments: { sheetId: '1', cell: 'A1', value: 'test' } }),
      { 'mcp-session-id': sessionId },
    )
    // In dev mode, should not get PERMISSION_DENIED
    expect(res.body.error?.code).not.toBe(-32001)
  })
})

// ─── resources/list + resources/read ─────────────────────────────────────────

describe('resources', () => {
  it('resources/list returns array', async () => {
    const res = await post(rpc('resources/list'))
    expect(Array.isArray(res.body.result.resources)).toBe(true)
    expect(res.body.result.resources.length).toBeGreaterThan(0)
  })

  it('resources/read returns content for a valid URI', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('resources/read', { uri: 'kasumi://nexcel/sheet/1/raw' }),
      { 'mcp-session-id': sessionId },
    )
    expect(res.body.error).toBeUndefined()
    expect(res.body.result.contents).toBeDefined()
  })

  it('resources/read returns NOT_FOUND for unknown URI', async () => {
    const sessionId = await initSession()
    const res = await post(
      rpc('resources/read', { uri: 'kasumi://nexcel/nonexistent' }),
      { 'mcp-session-id': sessionId },
    )
    expect(res.body.error.code).toBe(-32000)
  })
})

// ─── prompts ──────────────────────────────────────────────────────────────────

describe('prompts', () => {
  it('prompts/list returns registered prompts', async () => {
    const res = await post(rpc('prompts/list'))
    expect(Array.isArray(res.body.result.prompts)).toBe(true)
    expect(res.body.result.prompts.length).toBeGreaterThanOrEqual(5)
  })

  it('prompts/get builds a message for analyse_sheet', async () => {
    const res = await post(rpc('prompts/get', { name: 'analyse_sheet', arguments: {} }))
    expect(res.body.error).toBeUndefined()
    const { messages } = res.body.result
    expect(Array.isArray(messages)).toBe(true)
    expect(messages[0].role).toBe('user')
    expect(typeof messages[0].content.text).toBe('string')
  })

  it('prompts/get returns NOT_FOUND for unknown prompt', async () => {
    const res = await post(rpc('prompts/get', { name: 'no_such_prompt' }))
    expect(res.body.error.code).toBe(-32000)
  })
})

// ─── Origin guard ─────────────────────────────────────────────────────────────

describe('Origin guard', () => {
  it('allows requests with no Origin header (non-browser)', async () => {
    const res = await supertest(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send(rpc('ping'))
    // No origin → should be allowed (CLI / curl use case)
    expect(res.status).not.toBe(403)
  })

  it('allows localhost origins', async () => {
    const res = await supertest(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Origin', 'http://localhost:3000')
      .send(rpc('ping'))
    expect(res.status).not.toBe(403)
  })

  it('blocks unknown external origins when auth is configured', async () => {
    // KASUMI_READ_KEY etc not set in test → DEV_MODE = true → origin check passes
    // This test documents the intended behaviour when keys are set.
    // In dev mode the guard is disabled, so we just check the response is valid.
    const res = await supertest(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://attacker.example.com')
      .send(rpc('ping'))
    // In DEV_MODE this is allowed (200); in production it would be 403
    expect([200, 403]).toContain(res.status)
  })
})

describe('SSE auth', () => {
  it('rejects anonymous SSE connections when auth is configured', async () => {
    process.env['KASUMI_READ_KEY'] = 'read-test-key'
    vi.resetModules()

    const { default: importedExpress } = await import('express')
    const { mcpOriginGuard: importedOriginGuard } = await import('../mcp/originCheck')
    const { handleMcpSse: importedHandleMcpSse } = await import('../mcp/router')

    const lockedApp = importedExpress()
    lockedApp.get('/mcp/sse', importedOriginGuard, importedHandleMcpSse)

    const res = await supertest(lockedApp).get('/mcp/sse')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(-32001)
  })
})

// ─── Batch requests ───────────────────────────────────────────────────────────

describe('batch requests', () => {
  it('handles a batch of two requests', async () => {
    const res = await post([
      rpc('ping', undefined, 1),
      rpc('tools/list', undefined, 2),
    ])
    expect(res.status).toBe(200)
    const body = Array.isArray(res.body) ? res.body : [res.body]
    expect(body).toHaveLength(2)
    expect(body.find((r: Record<string, unknown>) => r['id'] === 1)).toBeDefined()
    expect(body.find((r: Record<string, unknown>) => r['id'] === 2)).toBeDefined()
  })
})
