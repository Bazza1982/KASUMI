import { saveFile } from '../../../platform/native/useNativeBridge'
import type { KasumiDocument } from '../types/document'
import type { WordoCommandAuditEntry, WordoCommandAuditExport, WordoCommandAuditSummary, WordoCommandResult } from '../types/commands'

function countBy<T extends string>(items: T[]): Partial<Record<T, number>> {
  return items.reduce<Partial<Record<T, number>>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {})
}

export function summarizeCommandAudit(entries: WordoCommandAuditEntry[]): WordoCommandAuditSummary {
  return {
    totalCommands: entries.length,
    successCount: entries.filter(entry => entry.success).length,
    failureCount: entries.filter(entry => !entry.success).length,
    aiCommandCount: entries.filter(entry => entry.source === 'ai').length,
    userCommandCount: entries.filter(entry => entry.source === 'user').length,
    commandTypeCounts: countBy(entries.map(entry => entry.commandType)),
    layoutImpactCounts: countBy(
      entries
        .map(entry => entry.layoutImpact)
        .filter((impact): impact is WordoCommandResult['layoutImpact'] => Boolean(impact)),
    ),
  }
}

export function createCommandAuditExport(
  document: KasumiDocument,
  entries: WordoCommandAuditEntry[],
): WordoCommandAuditExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    document: {
      id: document.id,
      title: document.title,
      sectionCount: document.sections.length,
      updatedAt: document.updatedAt,
    },
    summary: summarizeCommandAudit(entries),
    entries,
  }
}

export async function exportCommandAuditJson(
  document: KasumiDocument,
  entries: WordoCommandAuditEntry[],
): Promise<boolean> {
  const payload = createCommandAuditExport(document, entries)
  const json = `${JSON.stringify(payload, null, 2)}\n`
  const blob = new Blob([json], { type: 'application/json' })
  const safeTitle = (document.title || 'document').replace(/[\\/:*?"<>|]+/g, '_')
  return saveFile({
    defaultName: `${safeTitle}.command-audit.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    data: blob,
  })
}
