import type { Readable, Writable } from 'stream'
import { startMcpServer } from '../server'
import { DEV_MODE, resolvePermission } from '../auth'
import { processMcpPayload, makeJsonRpcError } from '../router'
import { RPC_ERRORS, type McpRequestContext } from '../types'

export interface StartMcpStdioTransportOptions {
  stdin?: Readable
  stdout?: Writable
  stderr?: Writable
  sessionId?: string
  agentId?: string
  apiKey?: string
  routeConsoleToStderr?: boolean
}

interface ConsoleState {
  log: Console['log']
  info: Console['info']
  warn: Console['warn']
}

function serializeMessage(message: unknown): string {
  return `${JSON.stringify(message)}\n`
}

function restoreConsole(state: ConsoleState): void {
  console.log = state.log
  console.info = state.info
  console.warn = state.warn
}

function redirectConsoleToStderr(stderr: Writable): () => void {
  const state: ConsoleState = {
    log: console.log,
    info: console.info,
    warn: console.warn,
  }

  const write = (...args: unknown[]) => {
    stderr.write(`${args.map(arg => String(arg)).join(' ')}\n`)
  }

  console.log = write
  console.info = write
  console.warn = write

  return () => restoreConsole(state)
}

async function writeMessage(stdout: Writable, message: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const payload = serializeMessage(message)
    const done = (err?: Error | null) => err ? reject(err) : resolve()
    if (stdout.write(payload, done)) {
      resolve()
    }
  })
}

export async function startMcpStdioTransport(
  options: StartMcpStdioTransportOptions = {},
): Promise<{ close(): void }> {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const shouldRouteConsole = options.routeConsoleToStderr ?? (stdout === process.stdout)
  const restore = shouldRouteConsole ? redirectConsoleToStderr(stderr) : () => {}

  try {
    startMcpServer()

    const apiKey = options.apiKey ?? process.env['KASUMI_MCP_KEY']
    const permissionTier = resolvePermission(apiKey)
    if (!DEV_MODE && !permissionTier) {
      throw new Error('Missing or invalid KASUMI_MCP_KEY for MCP stdio transport')
    }

    const ctx: McpRequestContext = {
      sessionId: options.sessionId ?? `stdio-${Date.now()}`,
      agentId: options.agentId ?? process.env['KASUMI_MCP_AGENT'],
      permissionTier: permissionTier ?? undefined,
    }

    let buffer = ''
    let closed = false

    const handleChunk = async (chunk: Buffer | string) => {
      buffer += chunk.toString()

      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) break

        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        if (!line.trim()) continue

        try {
          const message = JSON.parse(line) as unknown
          const response = await processMcpPayload(message, ctx)
          if (response !== null) {
            await writeMessage(stdout, response)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          stderr.write(`[MCP stdio] ${message}\n`)
          await writeMessage(stdout, makeJsonRpcError(null, RPC_ERRORS.PARSE_ERROR.code, 'Parse error'))
        }
      }
    }

    const onData = (chunk: Buffer | string) => {
      void handleChunk(chunk).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        stderr.write(`[MCP stdio] ${message}\n`)
      })
    }

    const onEnd = () => {
      close()
    }

    const onError = (error: Error) => {
      stderr.write(`[MCP stdio] ${error.message}\n`)
      close()
    }

    const close = () => {
      if (closed) return
      closed = true
      stdin.off('data', onData)
      stdin.off('end', onEnd)
      stdin.off('error', onError)
      restore()
    }

    stdin.on('data', onData)
    stdin.on('end', onEnd)
    stdin.on('error', onError)

    return { close }
  } catch (error) {
    restore()
    throw error
  }
}
