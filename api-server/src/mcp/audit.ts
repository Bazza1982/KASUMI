/**
 * KASUMI MCP — Audit logger.
 *
 * Records every tool call with: timestamp, agentId, tool name,
 * argument summary, outcome (success/error), and duration.
 *
 * In production this would write to a persistent store.
 * For now, records are kept in a bounded in-memory ring buffer.
 */

export interface AuditRecord {
  id: string
  timestamp: string
  sessionId: string
  agentId?: string
  toolName: string
  argsSummary: string
  outcome: 'success' | 'error' | 'permission_denied'
  durationMs: number
  errorMessage?: string
}

const MAX_RECORDS = 1000
const records: AuditRecord[] = []
let seq = 0

/** Summarise args for the audit log — truncate large values. */
function summariseArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).map(([k, v]) => {
    const s = String(v ?? '')
    return `${k}=${s.length > 60 ? s.slice(0, 60) + '…' : s}`
  })
  return entries.join(', ') || '(none)'
}

export function auditLog(record: Omit<AuditRecord, 'id' | 'timestamp'>): AuditRecord {
  const entry: AuditRecord = {
    id: `aud-${++seq}`,
    timestamp: new Date().toISOString(),
    ...record,
  }
  records.push(entry)
  if (records.length > MAX_RECORDS) records.shift()

  // Console output — structured for easy log aggregation
  const flag = entry.outcome === 'success' ? '✓' : entry.outcome === 'permission_denied' ? '✗' : '!'
  console.log(
    `[AUDIT] ${flag} ${entry.timestamp} | ${entry.toolName} | ` +
    `session=${entry.sessionId} | ${entry.durationMs}ms | ${entry.outcome}` +
    (entry.errorMessage ? ` | ${entry.errorMessage}` : '')
  )

  return entry
}

/** Get all audit records (most recent first), optionally filtered. */
export function getAuditLog(opts?: {
  toolName?: string
  outcome?: AuditRecord['outcome']
  limit?: number
}): AuditRecord[] {
  let result = [...records].reverse()
  if (opts?.toolName) result = result.filter(r => r.toolName.includes(opts.toolName!))
  if (opts?.outcome)  result = result.filter(r => r.outcome === opts.outcome)
  if (opts?.limit)    result = result.slice(0, opts.limit)
  return result
}

/** Build a summary object used by system_get_stats. */
export function getAuditSummary() {
  const total = records.length
  const success = records.filter(r => r.outcome === 'success').length
  const errors  = records.filter(r => r.outcome === 'error').length
  const denied  = records.filter(r => r.outcome === 'permission_denied').length

  const toolFreq: Record<string, number> = {}
  for (const r of records) toolFreq[r.toolName] = (toolFreq[r.toolName] ?? 0) + 1
  const topTools = Object.entries(toolFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  return { total, success, errors, denied, topTools }
}

export { summariseArgs }
