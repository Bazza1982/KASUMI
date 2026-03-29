import { PassThrough } from 'stream'
import { beforeAll, describe, expect, it } from 'vitest'
import { startMcpServer } from '../mcp/server'
import { startMcpStdioTransport } from '../mcp/transport/stdio'

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: '2.0', id, method, params }
}

async function collectLine(stream: PassThrough): Promise<string> {
  return await new Promise<string>((resolve) => {
    let buffer = ''
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) return
      stream.off('data', onData)
      resolve(buffer.slice(0, newlineIndex))
    }
    stream.on('data', onData)
  })
}

beforeAll(() => {
  startMcpServer()
})

describe('MCP stdio transport', () => {
  it('handles initialize then tools/list over newline-delimited JSON', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()

    const transport = await startMcpStdioTransport({
      stdin,
      stdout,
      stderr,
      routeConsoleToStderr: false,
      sessionId: 'stdio-test-session',
    })

    stdin.write(`${JSON.stringify(rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '0.0.1' },
    }))}\n`)
    const initRes = JSON.parse(await collectLine(stdout)) as Record<string, any>
    expect(initRes['result']['serverInfo']['name']).toBe('kasumi-mcp-server')

    stdin.write(`${JSON.stringify(rpc('tools/list', undefined, 2))}\n`)
    const toolsRes = JSON.parse(await collectLine(stdout)) as Record<string, any>
    expect(Array.isArray(toolsRes['result']['tools'])).toBe(true)
    expect(toolsRes['result']['tools'].length).toBeGreaterThan(40)

    transport.close()
  })

  it('returns parse error for malformed JSON input', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()

    const transport = await startMcpStdioTransport({
      stdin,
      stdout,
      stderr,
      routeConsoleToStderr: false,
      sessionId: 'stdio-test-parse-error',
    })

    stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"\n')
    const res = JSON.parse(await collectLine(stdout)) as Record<string, any>
    expect(res['error']['code']).toBe(-32700)

    transport.close()
  })
})
