import type { Node as PmNode } from 'prosemirror-model'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import { resolveSemanticObjectIdForRender } from './PaginationSnapshotBuilder'
import type {
  DocumentWarning,
  FidelitySnapshot,
  ImportSupportLevel,
  KasumiDocument,
  PaginationSnapshot,
  SemanticObjectId,
} from '../types/document'

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1
  return clampScore(numerator / denominator)
}

function supportWeight(level?: ImportSupportLevel): number {
  switch (level) {
    case 'full':
      return 1
    case 'preserved_read_only':
      return 0.9
    case 'degraded_with_warning':
      return 0.7
    case 'unsupported_but_retained_reference':
      return 0.2
    default:
      return 1
  }
}

function collectNodeStats(node: PmNode): {
  blockCount: number
  textBlockCount: number
  textLength: number
  imageCount: number
  tableCount: number
} {
  let blockCount = 0
  let textBlockCount = 0
  let textLength = 0
  let imageCount = 0
  let tableCount = 0

  node.forEach(child => {
    blockCount += 1
    const childTextLength = child.textContent.trim().length
    textLength += child.textContent.length
    if (childTextLength > 0) {
      textBlockCount += 1
    }
    if (child.type.name === 'table') {
      tableCount += 1
    }

    child.descendants(descendant => {
      if (descendant.type.name === 'image') {
        imageCount += 1
      }
    })
  })

  return { blockCount, textBlockCount, textLength, imageCount, tableCount }
}

function collectWarningKey(warning: DocumentWarning): string {
  return [
    warning.id,
    warning.code,
    warning.objectId ?? '',
    warning.sourceLocation?.path ?? '',
  ].join('|')
}

function collectWarnings(document: KasumiDocument, pagination?: PaginationSnapshot): DocumentWarning[] {
  const warnings = [
    ...(document.warnings ?? []),
    ...document.sections.flatMap(section => section.warnings ?? []),
    ...(pagination?.renderWarnings ?? []),
  ]
  const deduped = new Map<string, DocumentWarning>()
  warnings.forEach(warning => {
    deduped.set(collectWarningKey(warning), warning)
  })
  return [...deduped.values()]
}

function warningSeverityWeight(warning: DocumentWarning): number {
  switch (warning.severity) {
    case 'error':
      return 1
    case 'warn':
      return 0.5
    case 'info':
    default:
      return 0.15
  }
}

function collectRenderedTextBlockIds(pagination?: PaginationSnapshot): Set<SemanticObjectId> {
  const renderedTextBlockIds = new Set<SemanticObjectId>()
  if (!pagination) return renderedTextBlockIds

  pagination.selectionMap.forEach(entry => {
    if ('blockId' in entry.target) {
      if (entry.target.blockId) {
        renderedTextBlockIds.add(entry.target.blockId)
      }
      return
    }
    if ('start' in entry.target) {
      renderedTextBlockIds.add(entry.target.start.blockId)
    }
  })

  return renderedTextBlockIds
}

export function analyzeDocumentFidelity(
  document: KasumiDocument,
  orchestrator: LayoutOrchestrator,
  pagination = document.pagination,
): FidelitySnapshot {
  let sourceBlockCount = 0
  let sourceTextBlockCount = 0
  let sourceTextLength = 0
  let sourceImageCount = 0
  let sourceTableCount = 0
  let renderedTextLength = 0
  const renderedObjectIds = new Set((pagination?.objectRenderMap ?? []).map(fragment => fragment.objectId))

  document.sections.forEach(section => {
    const instance = orchestrator.getSection(section.id)
    if (!instance) return
    const stats = collectNodeStats(instance.state.doc)
    sourceBlockCount += stats.blockCount
    sourceTextBlockCount += stats.textBlockCount
    sourceTextLength += stats.textLength
    sourceImageCount += stats.imageCount
    sourceTableCount += stats.tableCount

    instance.state.doc.forEach((node, _offset, blockIndex) => {
      const { objectId } = resolveSemanticObjectIdForRender(section.id, node, blockIndex)
      if (renderedObjectIds.has(objectId)) {
        renderedTextLength += node.textContent.length
      }
    })
  })

  const renderedTextBlockIds = collectRenderedTextBlockIds(pagination)
  const renderedImageCount = (pagination?.pages ?? []).reduce((count, page) => {
    return count + page.objectRefs.filter(ref => ref.kind === 'image').length
  }, 0)
  const renderedTableCount = (pagination?.pages ?? []).reduce((count, page) => {
    return count + page.objectRefs.filter(ref => ref.kind === 'table').length
  }, 0)

  const sectionSupportLevels = document.sections.map(section => supportWeight(section.supportLevel))
  const sectionSupport = sectionSupportLevels.length > 0
    ? sectionSupportLevels.reduce((sum, score) => sum + score, 0) / sectionSupportLevels.length
    : 1

  const warnings = collectWarnings(document, pagination)
  const weightedWarningLoad = warnings.reduce((sum, warning) => sum + warningSeverityWeight(warning), 0)
  const warningPenalty = clampScore(1 - Math.min(weightedWarningLoad, 10) / 10)
  const blockingWarningCount = warnings.filter(warning => warning.severity === 'warn' || warning.severity === 'error').length
  const objectCoverage = ratio(renderedObjectIds.size, sourceBlockCount)
  const textCoverage = ratio(renderedTextBlockIds.size, sourceTextBlockCount)
  const textLengthCoverage = ratio(renderedTextLength, sourceTextLength)
  const imageCoverage = ratio(renderedImageCount, sourceImageCount)
  const tableCoverage = ratio(renderedTableCount, sourceTableCount)

  let overallScore = clampScore(
    (objectCoverage * 0.28)
    + (textCoverage * 0.2)
    + (textLengthCoverage * 0.12)
    + (imageCoverage * 0.12)
    + (tableCoverage * 0.1)
    + (sectionSupport * 0.1)
    + (warningPenalty * 0.08),
  )

  if (sectionSupport < 0.5) {
    overallScore = Math.min(overallScore, 0.72)
  } else if (blockingWarningCount >= 3) {
    overallScore = Math.min(overallScore, 0.79)
  }

  return {
    overallScore,
    grade: overallScore >= 0.9 ? 'high' : overallScore >= 0.75 ? 'medium' : 'low',
    sourceBlockCount,
    renderedObjectCount: renderedObjectIds.size,
    sourceTextBlockCount,
    renderedTextBlockCount: renderedTextBlockIds.size,
    sourceTextLength,
    renderedTextLength,
    sourceImageCount,
    renderedImageCount,
    sourceTableCount,
    renderedTableCount,
    pageCount: pagination?.pages.length ?? 0,
    warningCount: warnings.length,
    breakdown: {
      objectCoverage,
      textCoverage,
      textLengthCoverage,
      imageCoverage,
      tableCoverage,
      sectionSupport,
      warningPenalty,
    },
  }
}
