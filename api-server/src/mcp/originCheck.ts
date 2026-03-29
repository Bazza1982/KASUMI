/**
 * Origin validation for MCP HTTP endpoints and WebSocket connections.
 *
 * Prevents DNS rebinding attacks: a page served from an attacker domain
 * should not be able to POST to a locally-running MCP server.
 *
 * Allowed origins:
 *   - Always allowed: localhost, 127.0.0.1 (any port)
 *   - Configurable: KASUMI_ALLOWED_ORIGINS=https://app.example.com,https://other.example.com
 *   - In dev mode all origins pass (no key configured → any origin OK)
 *
 * If the request has no Origin header (e.g. direct CLI / curl calls),
 * it is allowed — Origin is only sent by browsers.
 */

import type { Request, Response, NextFunction } from 'express'
import { DEV_MODE } from './auth'

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/** Parse the KASUMI_ALLOWED_ORIGINS env var into a Set. */
function buildAllowedOrigins(): Set<string> {
  const raw = process.env['KASUMI_ALLOWED_ORIGINS'] ?? ''
  const set = new Set<string>()
  for (const o of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    set.add(o)
  }
  return set
}

const configuredOrigins = buildAllowedOrigins()

/** Check whether an origin string is permitted. */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true          // no Origin header → non-browser client, allow
  if (DEV_MODE) return true         // open dev mode
  if (LOCALHOST_RE.test(origin)) return true
  if (configuredOrigins.has(origin)) return true
  return false
}

/** Express middleware that rejects requests with a disallowed Origin header. */
export function mcpOriginGuard(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers['origin'] as string | undefined
  if (!isOriginAllowed(origin)) {
    res.status(403).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: `Origin not allowed: ${origin}` },
    })
    return
  }
  // Reflect allowed origin for CORS on MCP routes
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, X-Kasumi-Key, X-Kasumi-Agent')
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
  }
  next()
}

/** Check origin for a WebSocket upgrade request (used in WsServer). */
export function isWsOriginAllowed(origin: string | undefined): boolean {
  return isOriginAllowed(origin)
}
