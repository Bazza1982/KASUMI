// ============================================================
// KASUMI WORDO — .docx Importer
// Pipeline:
//   .docx file  →  mammoth (→ clean HTML)  →  DOMParser
//               →  htmlToPmNodes()          →  ProseMirror doc
//               →  useWordoStore.loadFromDocx()
// ============================================================

import type { Node as PmNode, Schema } from 'prosemirror-model'
import { wordoSchema } from '../editor/schema'
import {
  createProvenance,
  createSemanticId,
  createDocumentWarning,
  createFingerprint,
  buildLegacyPath,
  type Asset,
  type DocumentWarning,
  type ImportSupportLevel,
} from '../types/document'

// ── Types ─────────────────────────────────────────────────────
export interface ImportResult {
  title: string
  sections: ImportedSection[]
  assets: Asset[]
  warnings: string[]
  diagnostics?: DocumentWarning[]
}

export interface ImportedSection {
  pmDoc: PmNode   // ready to pass to EditorState.create({ doc })
  fingerprint: string
  legacyPath: string
  supportLevel: ImportSupportLevel
  diagnostics?: DocumentWarning[]
}

export const DOCX_STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='List Paragraph'] => p:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
]

interface ParseContext {
  assets: Asset[]
  diagnostics: DocumentWarning[]
  sectionIndex: number
  sourceName: string
  supportLevel: ImportSupportLevel
}

const SUPPORT_LEVEL_RANK: Record<ImportSupportLevel, number> = {
  full: 0,
  preserved_read_only: 1,
  degraded_with_warning: 2,
  unsupported_but_retained_reference: 3,
}

function escalateSupportLevel(current: ImportSupportLevel, next: ImportSupportLevel): ImportSupportLevel {
  return SUPPORT_LEVEL_RANK[next] > SUPPORT_LEVEL_RANK[current] ? next : current
}

function pushDiagnostic(
  context: ParseContext,
  code: string,
  message: string,
  overrides: Partial<DocumentWarning> = {},
): void {
  context.diagnostics.push(
    createDocumentWarning(code, message, {
      sourceLocation: {
        layer: 'docx',
        path: buildLegacyPath(context.sourceName, 'sections', context.sectionIndex),
      },
      ...overrides,
    }),
  )
}

function detectMimeType(src: string): string {
  const trimmed = src.trim()
  const dataMatch = trimmed.match(/^data:([^;,]+)[;,]/i)
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase()
  if (/\.(png)(\?|#|$)/i.test(trimmed)) return 'image/png'
  if (/\.(jpe?g)(\?|#|$)/i.test(trimmed)) return 'image/jpeg'
  if (/\.(gif)(\?|#|$)/i.test(trimmed)) return 'image/gif'
  if (/\.(webp)(\?|#|$)/i.test(trimmed)) return 'image/webp'
  if (/\.(svg)(\?|#|$)/i.test(trimmed)) return 'image/svg+xml'
  return 'application/octet-stream'
}

function createImageAsset(src: string, alt: string, title: string | null, legacyPath: string): Asset {
  return {
    id: createSemanticId('asset'),
    mimeType: detectMimeType(src),
    src,
    originalFilename: title ?? undefined,
    altText: alt || undefined,
    fingerprint: createFingerprint(src),
    legacyPath,
    supportLevel: 'preserved_read_only',
    provenance: createProvenance('import', {
      importFingerprint: createFingerprint(src),
      importLegacyPath: legacyPath,
    }),
    warnings: [],
  }
}

function applyInlineMarks(
  runs: PmNode[],
  schema: Schema,
  marks: ReturnType<typeof schema.mark>[],
): PmNode[] {
  if (marks.length === 0) return runs

  return runs.map(run => {
    if (!run.isText) return run
    return run.mark(marks.reduce((acc, mark) => mark.addToSet(acc), run.marks))
  })
}

function getStyleValue(style: string, property: string): string | null {
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i')
  const match = style.match(pattern)
  return match?.[1]?.trim() ?? null
}

function extractParagraphAttrs(el: Element): Record<string, string | boolean | null> {
  const style = el.getAttribute('style') ?? ''
  const pageBreakBefore = ['always', 'page'].includes((getStyleValue(style, 'page-break-before') ?? '').toLowerCase())
    || (getStyleValue(style, 'break-before') ?? '').toLowerCase() === 'page'

  return {
    textAlign: getStyleValue(style, 'text-align'),
    lineSpacing: getStyleValue(style, 'line-height'),
    spaceBefore: getStyleValue(style, 'margin-top'),
    spaceAfter: getStyleValue(style, 'margin-bottom'),
    indentLeft: getStyleValue(style, 'margin-left'),
    indentRight: getStyleValue(style, 'margin-right'),
    textIndent: getStyleValue(style, 'text-indent'),
    pageBreakBefore,
  }
}

function collectInlineStyleMarks(
  child: Element,
  schema: Schema,
): ReturnType<typeof schema.mark>[] {
  const marks: ReturnType<typeof schema.mark>[] = []
  const style = child.getAttribute('style') ?? ''
  if (!style) return marks

  const fontSize = getStyleValue(style, 'font-size')
  if (fontSize) {
    marks.push(schema.mark('font_size', { size: fontSize }))
  }

  const color = getStyleValue(style, 'color')
  if (color) {
    marks.push(schema.mark('font_color', { color }))
  }

  const backgroundColor = getStyleValue(style, 'background-color')
  if (backgroundColor) {
    marks.push(schema.mark('highlight', { color: backgroundColor }))
  }

  return marks
}

function inlineRunsFromChildNodes(
  childNodes: Iterable<ChildNode>,
  schema: Schema,
  context?: ParseContext,
  pathSegments: Array<string | number> = [],
): PmNode[] {
  const runs: PmNode[] = []

  Array.from(childNodes).forEach((node, childIndex) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) runs.push(schema.text(text))
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const child = node as Element
    const tag = child.tagName.toLowerCase()

    if (tag === 'br') {
      runs.push(schema.nodes.hard_break.create())
      return
    }

    if (tag === 'img' && context) {
      const src = child.getAttribute('src')?.trim() ?? ''
      const alt = child.getAttribute('alt')?.trim() ?? ''
      const title = child.getAttribute('title')?.trim() ?? null
      const imagePath = buildLegacyPath(context.sourceName, 'sections', context.sectionIndex, ...pathSegments, `img_${childIndex}`)

      if (!src) {
        context.supportLevel = escalateSupportLevel(context.supportLevel, 'degraded_with_warning')
        pushDiagnostic(
          context,
          'docx.image_missing_src',
          'Encountered an image tag without a source; the image was skipped.',
          {
            severity: 'warn',
            sourceLocation: {
              layer: 'docx',
              path: imagePath,
            },
          },
        )
        return
      }

      const asset = createImageAsset(src, alt, title, imagePath)
      context.assets.push(asset)
      context.supportLevel = escalateSupportLevel(context.supportLevel, 'preserved_read_only')
      runs.push(schema.nodes.image.create({
        src,
        alt,
        title: title ?? alt,
      }))
      return
    }

    const innerRuns = inlineRunsFromChildNodes(child.childNodes, schema, context, [...pathSegments, `${tag}_${childIndex}`])
    const marks: ReturnType<typeof schema.mark>[] = []

    if (tag === 'strong' || tag === 'b') marks.push(schema.mark('strong'))
    if (tag === 'em' || tag === 'i') marks.push(schema.mark('em'))
    if (tag === 'u') marks.push(schema.mark('underline'))
    if (tag === 's' || tag === 'del') marks.push(schema.mark('strikethrough'))
    if (tag === 'a') {
      const href = child.getAttribute('href')
      if (href) marks.push(schema.mark('link', { href }))
    }
    if (tag === 'sup') marks.push(schema.mark('superscript'))
    if (tag === 'sub') marks.push(schema.mark('subscript'))
    if (tag === 'mark') marks.push(schema.mark('highlight', { color: child.getAttribute('data-color') ?? '#fff176' }))

    marks.push(...collectInlineStyleMarks(child, schema))
    runs.push(...applyInlineMarks(innerRuns, schema, marks))
  })

  return runs
}

// ── HTML element → ProseMirror nodes ──────────────────────────

function inlineRuns(
  el: Element,
  schema: Schema,
  context?: ParseContext,
  pathSegments: Array<string | number> = [],
): PmNode[] {
  const runs = inlineRunsFromChildNodes(el.childNodes, schema, context, pathSegments)
  return runs.length ? runs : [schema.text('\u00a0')]
}

function elementToNodes(el: Element, schema: Schema, context: ParseContext, pathSegments: Array<string | number> = []): PmNode[] {
  const tag = el.tagName.toLowerCase()
  const nodes: PmNode[] = []
  const elementPath = buildLegacyPath(context.sourceName, 'sections', context.sectionIndex, ...pathSegments, tag)

  switch (tag) {
    case 'p': {
      const runs = inlineRuns(el, schema, context, [...pathSegments, 'p'])
      const paragraphAttrs = extractParagraphAttrs(el)
      const hasRenderableContent = runs.some(node => node.type.name === 'image' || node.type.name === 'hard_break' || node.text !== '\u00a0')
      if (!hasRenderableContent) {
        nodes.push(schema.nodes.paragraph.create(paragraphAttrs))
      } else {
        nodes.push(schema.nodes.paragraph.create(paragraphAttrs, runs))
      }
      break
    }

    case 'h1': case 'h2': case 'h3':
    case 'h4': case 'h5': case 'h6': {
      const level = parseInt(tag[1])
      nodes.push(schema.nodes.heading.create({ level, ...extractParagraphAttrs(el) }, inlineRuns(el, schema, context, [...pathSegments, tag])))
      break
    }

    case 'ul': case 'ol': {
      const listType = tag === 'ul' ? 'bullet_list' : 'ordered_list'
      const items: PmNode[] = []
      Array.from(el.children)
        .filter((child): child is HTMLLIElement => child.tagName.toLowerCase() === 'li')
        .forEach((li, liIndex) => {
          const itemChildren: PmNode[] = []
          const inlineNodes = Array.from(li.childNodes).filter(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return true
            const childTag = (node as Element).tagName.toLowerCase()
            return childTag !== 'ul' && childTag !== 'ol'
          })
          const paragraphRuns = inlineRunsFromChildNodes(inlineNodes, schema, context, [...pathSegments, `${tag}_${liIndex}`])
          const hasRenderableContent = paragraphRuns.some(node => node.type.name === 'image' || node.type.name === 'hard_break' || node.text !== '\u00a0')

          if (hasRenderableContent) {
            itemChildren.push(schema.nodes.paragraph.create(null, paragraphRuns))
          }

          Array.from(li.children).forEach((nestedList, nestedIndex) => {
            const nestedTag = nestedList.tagName.toLowerCase()
            if (nestedTag !== 'ul' && nestedTag !== 'ol') return
            itemChildren.push(...elementToNodes(nestedList, schema, context, [...pathSegments, `${tag}_${liIndex}`, `nested_${nestedIndex}`]))
          })

          if (itemChildren.length === 0) {
            itemChildren.push(schema.nodes.paragraph.create())
          }

          items.push(schema.nodes.list_item.create(null, itemChildren))
        })
      if (items.length) nodes.push(schema.nodes[listType].create(null, items))
      break
    }

    case 'blockquote': {
      el.childNodes.forEach((child, childIndex) => {
        if ((child as Element).tagName) {
          nodes.push(...elementToNodes(child as Element, schema, context, [...pathSegments, `blockquote_${childIndex}`]))
        }
      })
      break
    }

    case 'table': {
      const rows: PmNode[] = []
      el.querySelectorAll('tr').forEach((tr, ri) => {
        const cells: PmNode[] = []
        tr.querySelectorAll('td, th').forEach(cell => {
          const cellType = ri === 0 ? schema.nodes.table_header : schema.nodes.table_cell
          cells.push(cellType.create(null, [
            schema.nodes.paragraph.create(null, inlineRuns(cell, schema, context, [...pathSegments, `row_${ri}`])),
          ]))
        })
        if (cells.length) rows.push(schema.nodes.table_row.create(null, cells))
      })
      if (rows.length) nodes.push(schema.nodes.table.create(null, rows))
      break
    }

    case 'figure': {
      el.childNodes.forEach((child, childIndex) => {
        if ((child as Element).tagName) {
          nodes.push(...elementToNodes(child as Element, schema, context, [...pathSegments, `figure_${childIndex}`]))
        }
      })
      break
    }

    case 'img': {
      const src = el.getAttribute('src')?.trim() ?? ''
      const alt = el.getAttribute('alt')?.trim() ?? ''
      const title = el.getAttribute('title')?.trim() ?? null

      if (!src) {
        context.supportLevel = escalateSupportLevel(context.supportLevel, 'degraded_with_warning')
        pushDiagnostic(
          context,
          'docx.image_missing_src',
          'Encountered an image tag without a source; the image was skipped.',
          {
            severity: 'warn',
            sourceLocation: {
              layer: 'docx',
              path: elementPath,
            },
          },
        )
        break
      }

      const blockId = createSemanticId('img')
      const asset = createImageAsset(src, alt, title, elementPath)
      context.assets.push(asset)
      context.supportLevel = escalateSupportLevel(context.supportLevel, 'preserved_read_only')
      nodes.push(schema.nodes.paragraph.create(
        { id: blockId },
        [schema.nodes.image.create({ src, alt, title: title ?? alt })],
      ))
      break
    }

    case 'hr':
      nodes.push(schema.nodes.horizontal_rule.create())
      break

    case 'br':
      // Ignore standalone breaks
      break

    case 'div': case 'section': case 'article': case 'main': {
      // Recurse into container elements
      el.childNodes.forEach((child, childIndex) => {
        if ((child as Element).tagName) {
          nodes.push(...elementToNodes(child as Element, schema, context, [...pathSegments, `${tag}_${childIndex}`]))
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent?.trim()
          if (text) nodes.push(schema.nodes.paragraph.create(null, [schema.text(text)]))
        }
      })
      break
    }

    case 'svg':
    case 'canvas':
    case 'math':
    case 'iframe':
    case 'object':
    case 'embed': {
      context.supportLevel = escalateSupportLevel(context.supportLevel, 'unsupported_but_retained_reference')
      const placeholderText = `[Unsupported ${tag} retained as reference]`
      const placeholderId = createSemanticId('unsupported')
      nodes.push(schema.nodes.paragraph.create({ id: placeholderId }, [schema.text(placeholderText)]))
      pushDiagnostic(
        context,
        'docx.unsupported_object_retained',
        `Unsupported ${tag} content was retained as a text reference placeholder.`,
        {
          severity: 'warn',
          objectId: placeholderId,
          sourceLocation: {
            layer: 'docx',
            path: elementPath,
          },
        },
      )
      break
    }

    default: {
      // Treat unknown tags as paragraph if they have text
      const text = el.textContent?.trim()
      if (text) {
        context.supportLevel = escalateSupportLevel(context.supportLevel, 'degraded_with_warning')
        pushDiagnostic(
          context,
          'docx.unsupported_tag_flattened',
          `Flattened unsupported <${tag}> content into a plain paragraph.`,
          {
            severity: 'info',
            sourceLocation: {
              layer: 'docx',
              path: elementPath,
            },
          },
        )
        nodes.push(schema.nodes.paragraph.create(null, [schema.text(text)]))
      }
      break
    }
  }

  return nodes
}

export function htmlToPmDoc(html: string, schema: Schema): PmNode {
  return buildImportSectionFromHtml(html, schema, { sectionIndex: 0, sourceName: 'html' }).pmDoc
}

export function buildImportSectionFromHtml(
  html: string,
  schema: Schema,
  options: { sectionIndex: number; sourceName: string },
): ImportedSection & { assets: Asset[] } {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')
  const body = dom.body
  const context: ParseContext = {
    assets: [],
    diagnostics: [],
    sectionIndex: options.sectionIndex,
    sourceName: options.sourceName,
    supportLevel: 'full',
  }

  const blocks: PmNode[] = []
  body.childNodes.forEach((child, childIndex) => {
    if ((child as Element).tagName) {
      blocks.push(...elementToNodes(child as Element, schema, context, [`root_${childIndex}`]))
    }
  })

  // Always ensure at least one paragraph
  if (blocks.length === 0) {
    blocks.push(schema.nodes.paragraph.create())
  }

  const normalizedHtml = html.trim() || '<p></p>'

  return {
    pmDoc: schema.nodes.doc.create(null, blocks),
    fingerprint: createFingerprint(normalizedHtml),
    legacyPath: buildLegacyPath(options.sourceName, 'sections', options.sectionIndex),
    supportLevel: context.supportLevel,
    diagnostics: context.diagnostics,
    assets: context.assets,
  }
}

// ── Main import function ──────────────────────────────────────

export async function importDocx(file: File): Promise<ImportResult> {
  // Dynamic import to keep initial bundle light
  const mammoth = await import('mammoth')

  const arrayBuffer = await file.arrayBuffer()

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: DOCX_STYLE_MAP,
      includeDefaultStyleMap: true,
    }
  )

  // Derive title from filename (strip extension)
  const title = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ')

  // Split on explicit page breaks if present, otherwise treat whole doc as one section
  const html = result.value
  const sectionHtmls = html.includes('<hr')
    ? html.split(/<hr\s*\/?>/)
    : [html]

  const builtSections = sectionHtmls.map((sectionHtml, index) =>
    buildImportSectionFromHtml(sectionHtml, wordoSchema, {
      sectionIndex: index,
      sourceName: file.name,
    }),
  )

  const sections: ImportedSection[] = builtSections.map(({ assets: _assets, ...section }) => section)
  const assets = builtSections.flatMap(section => section.assets)

  const diagnostics = result.messages.map((message, index) =>
    createDocumentWarning(
      `docx_import_${message.type ?? 'warning'}`,
      message.message,
      {
        id: `warn_import_${index}`,
        severity: message.type === 'error' ? 'error' : 'warn',
        sourceLocation: {
          layer: 'docx',
          path: file.name,
        },
      },
    ),
  )

  const combinedDiagnostics = [...builtSections.flatMap(section => section.diagnostics ?? []), ...diagnostics]

  return {
    title,
    sections,
    assets,
    warnings: result.messages.map(m => m.message),
    diagnostics: combinedDiagnostics,
  }
}
