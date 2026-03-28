/**
 * KASUMI MCP — Server-wide request statistics.
 * Simple in-memory counters for performance monitoring.
 */

const startTime = Date.now()

let totalRequests = 0
let totalToolCalls = 0
let totalBatchRequests = 0
let totalSseConnections = 0
let totalErrors = 0

const methodCounts: Record<string, number> = {}

export const serverStats = {
  incRequest()               { totalRequests++ },
  incToolCall()              { totalToolCalls++ },
  incBatch()                 { totalBatchRequests++ },
  incSseConnection()         { totalSseConnections++ },
  incError()                 { totalErrors++ },
  incMethod(method: string)  { methodCounts[method] = (methodCounts[method] ?? 0) + 1 },

  get(): Record<string, unknown> {
    const uptimeMs = Date.now() - startTime
    const uptimeSec = Math.floor(uptimeMs / 1000)
    return {
      startedAt: new Date(startTime).toISOString(),
      uptimeSeconds: uptimeSec,
      totalRequests,
      totalToolCalls,
      totalBatchRequests,
      totalSseConnections,
      totalErrors,
      methodCounts,
    }
  },
}
