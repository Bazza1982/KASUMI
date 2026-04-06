import type { Node as PmNode } from 'prosemirror-model'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import { createLogger } from '../editor/logger'
import {
  createDocumentWarning,
  createFingerprint,
  type BoxRegion,
  type DocumentSection,
  type KasumiDocument,
  type ObjectRenderFragment,
  type PageDimensions,
  type PageMapEntry,
  type PageModel,
  type PaginationSnapshot,
  type SelectionMapEntry,
  type SemanticObjectId,
} from '../types/document'

const log = createLogger('PaginationSnapshot')

const PAPER_DIMENSIONS_MM: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
}

const DEFAULT_BLOCK_HEIGHT_MM = 8
const PARAGRAPH_LINE_HEIGHT_MM = 6
const TABLE_ROW_HEIGHT_MM = 10
const IMAGE_HEIGHT_MM = 45
const EMBED_HEIGHT_MM = 24
const PAGE_BREAK_HEIGHT_MM = 1

interface RuntimePage {
  page: PageModel
  usedHeight: number
}

function isImageParagraph(node: PmNode): boolean {
  if (node.type.name !== 'paragraph' || node.childCount === 0) return false
  let imageChildCount = 0
  node.forEach(child => {
    if (child.type.name === 'image') imageChildCount += 1
  })
  return imageChildCount > 0 && imageChildCount === node.childCount
}

function resolveRenderKind(node: PmNode): string {
  return isImageParagraph(node) ? 'image' : node.type.name
}

function toPageDimensions(section: DocumentSection): PageDimensions {
  const base = PAPER_DIMENSIONS_MM[section.pageStyle.size] ?? PAPER_DIMENSIONS_MM.A4
  return section.pageStyle.orientation === 'landscape'
    ? { width: base.height, height: base.width, unit: 'mm' }
    : { width: base.width, height: base.height, unit: 'mm' }
}

function makeRegion(top: number, left: number, width: number, height: number): BoxRegion {
  return { top, left, width, height, unit: 'mm' }
}

function buildPageScaffold(section: DocumentSection, pageIndex: number): RuntimePage {
  const dimensions = toPageDimensions(section)
  const { margins } = section.pageStyle
  const contentWidth = Math.max(dimensions.width - margins.left - margins.right, 1)
  const bodyHeight = Math.max(dimensions.height - margins.top - margins.bottom, 1)

  return {
    usedHeight: 0,
    page: {
      pageIndex,
      sectionId: section.id,
      dimensions,
      marginBox: makeRegion(margins.top, margins.left, contentWidth, bodyHeight),
      headerRegion: makeRegion(0, margins.left, contentWidth, margins.header),
      footerRegion: makeRegion(dimensions.height - margins.footer, margins.left, contentWidth, margins.footer),
      bodyRegion: makeRegion(margins.top, margins.left, contentWidth, bodyHeight),
      objectRefs: [],
    },
  }
}

function estimateNodeHeightMm(node: PmNode): number {
  if (isImageParagraph(node)) {
    return IMAGE_HEIGHT_MM
  }

  switch (node.type.name) {
    case 'heading':
      return Math.max(10, Math.ceil(Math.max(node.textContent.length, 1) / 32) * 8)
    case 'paragraph':
    case 'blockquote':
    case 'list_item':
      return Math.max(
        DEFAULT_BLOCK_HEIGHT_MM,
        Math.ceil(Math.max(node.textContent.length, 1) / 60) * PARAGRAPH_LINE_HEIGHT_MM,
      )
    case 'bullet_list':
    case 'ordered_list': {
      let total = 0
      node.forEach(child => {
        total += estimateNodeHeightMm(child)
      })
      return Math.max(total, DEFAULT_BLOCK_HEIGHT_MM)
    }
    case 'table':
      return Math.max(node.childCount, 1) * TABLE_ROW_HEIGHT_MM
    case 'image':
      return IMAGE_HEIGHT_MM
    case 'nexcel_embed':
      return EMBED_HEIGHT_MM
    case 'horizontal_rule':
      return 3
    case 'table_row':
      return TABLE_ROW_HEIGHT_MM
    default:
      return node.type.name.includes('break') ? PAGE_BREAK_HEIGHT_MM : DEFAULT_BLOCK_HEIGHT_MM
  }
}

export function resolveSemanticObjectIdForRender(sectionId: string, node: PmNode, blockIndex: number): {
  objectId: SemanticObjectId
  warning: ReturnType<typeof createDocumentWarning> | null
} {
  const objectId = typeof node.attrs?.id === 'string' && node.attrs.id.trim()
    ? node.attrs.id.trim()
    : `synthetic_${createFingerprint(`${sectionId}:${blockIndex}:${node.type.name}:${node.textContent}`)}`

  if (typeof node.attrs?.id === 'string' && node.attrs.id.trim()) {
    return { objectId, warning: null }
  }

  return {
    objectId,
    warning: createDocumentWarning(
      'pagination.synthetic_object_id',
      `Pagination generated a synthetic object id for ${node.type.name}.`,
      {
        severity: 'info',
        objectId,
        sourceLocation: {
          layer: 'render',
          path: `section/${sectionId}/block/${blockIndex}`,
        },
      },
    ),
  }
}

function buildSelectionEntries(objectId: SemanticObjectId, pageIndex: number, node: PmNode): SelectionMapEntry[] {
  const textLength = node.textContent.length
  const blockEntry: SelectionMapEntry = {
    anchorId: `block:${objectId}`,
    pageIndex,
    target: {
      blockId: objectId,
    },
  }

  if (textLength === 0) {
    return [blockEntry]
  }

  return [
    blockEntry,
    {
      anchorId: `text:${objectId}:start`,
      pageIndex,
      target: {
        blockId: objectId,
        offset: 0,
      },
    },
    {
      anchorId: `text:${objectId}:end`,
      pageIndex,
      target: {
        blockId: objectId,
        offset: textLength,
      },
    },
    {
      anchorId: `range:${objectId}:full`,
      pageIndex,
      target: {
        start: { blockId: objectId, offset: 0 },
        end: { blockId: objectId, offset: textLength },
      },
    },
  ]
}

export function buildPaginationSnapshot(
  document: KasumiDocument,
  orchestrator: LayoutOrchestrator,
): PaginationSnapshot {
  const pages: PageModel[] = []
  const pageMap: PageMapEntry[] = []
  const objectRenderMap: ObjectRenderFragment[] = []
  const selectionMap: SelectionMapEntry[] = []
  const renderWarnings = [
    ...(document.warnings ?? []),
    ...document.sections.flatMap(section => section.warnings ?? []),
  ]

  let nextPageIndex = 0

  document.sections.forEach(section => {
    const instance = orchestrator.getSection(section.id)
    if (!instance) {
      renderWarnings.push(
        createDocumentWarning(
          'pagination.section_missing',
          `Section ${section.id} is missing from the layout orchestrator.`,
          {
            severity: 'warn',
            objectId: section.id,
            sourceLocation: {
              layer: 'render',
              path: `section/${section.id}`,
            },
          },
        ),
      )
      return
    }

    let currentPage = buildPageScaffold(section, nextPageIndex)
    pages.push(currentPage.page)
    pageMap.push({
      pageIndex: currentPage.page.pageIndex,
      objectIds: [],
    })
    nextPageIndex += 1

    instance.state.doc.forEach((node, _offset, blockIndex) => {
      const { objectId, warning } = resolveSemanticObjectIdForRender(section.id, node, blockIndex)
      if (warning) renderWarnings.push(warning)

      if (node.type.name === 'page_break') {
        currentPage = buildPageScaffold(section, nextPageIndex)
        pages.push(currentPage.page)
        pageMap.push({
          pageIndex: currentPage.page.pageIndex,
          objectIds: [],
        })
        nextPageIndex += 1
        return
      }

      const estimatedHeight = estimateNodeHeightMm(node)
      const remainingHeight = currentPage.page.bodyRegion.height - currentPage.usedHeight

      if (currentPage.usedHeight > 0 && estimatedHeight > remainingHeight) {
        currentPage = buildPageScaffold(section, nextPageIndex)
        pages.push(currentPage.page)
        pageMap.push({
          pageIndex: currentPage.page.pageIndex,
          objectIds: [],
        })
        nextPageIndex += 1
      }

      currentPage.page.objectRefs.push({ objectId, kind: resolveRenderKind(node) })
      const currentPageMap = pageMap[pageMap.length - 1]
      currentPageMap.objectIds.push(objectId)

      objectRenderMap.push({
        objectId,
        pageIndex: currentPage.page.pageIndex,
        fragmentIndex: 0,
        bounds: makeRegion(
          currentPage.page.bodyRegion.top + currentPage.usedHeight,
          currentPage.page.bodyRegion.left,
          currentPage.page.bodyRegion.width,
          Math.min(estimatedHeight, currentPage.page.bodyRegion.height),
        ),
      })

      selectionMap.push(...buildSelectionEntries(objectId, currentPage.page.pageIndex, node))
      currentPage.usedHeight += estimatedHeight
    })
  })

  log.info('pagination-snapshot-built', {
    pages: pages.length,
    pageMap: pageMap.length,
    fragments: objectRenderMap.length,
    selectionAnchors: selectionMap.length,
  })

  return {
    pages,
    pageMap,
    objectRenderMap,
    selectionMap,
    renderWarnings,
  }
}
