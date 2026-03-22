// ============================================================
// KASUMI WORDO — .docx Importer
// Pipeline:
//   .docx file  →  mammoth (→ clean HTML)  →  DOMParser
//               →  htmlToPmNodes()          →  ProseMirror doc
//               →  useWordoStore.loadFromDocx()
// ============================================================

import type { Node as PmNode, Schema } from 'prosemirror-model'
import { wordoSchema } from '../editor/schema'
import type { KasumiDocument, DocumentSection, PageStyle } from '../types/document'

// ── Types ─────────────────────────────────────────────────────
export interface ImportResult {
  title: string
  sections: ImportedSection[]
  warnings: string[]
}

export interface ImportedSection {
  pmDoc: PmNode   // ready to pass to EditorState.create({ doc })
}

// ── HTML element → ProseMirror nodes ──────────────────────────

function inlineRuns(el: Element, schema: Schema): PmNode[] {
  const runs: PmNode[] = []

  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) runs.push(schema.text(text))
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const child = node as Element
    const tag = child.tagName.toLowerCase()

    // Recurse with marks
    const innerRuns = inlineRuns(child, schema)
    const marks: ReturnType<typeof schema.mark>[] = []

    if (tag === 'strong' || tag === 'b') marks.push(schema.mark('strong'))
    if (tag === 'em' || tag === 'i')     marks.push(schema.mark('em'))
    if (tag === 'u')                     marks.push(schema.mark('underline'))
    if (tag === 's' || tag === 'del')    marks.push(schema.mark('strikethrough'))
    if (tag === 'a') {
      const href = child.getAttribute('href')
      if (href) marks.push(schema.mark('link', { href }))
    }

    if (marks.length) {
      innerRuns.forEach(r => {
        if (r.isText) runs.push(r.mark(marks.reduce((acc, m) => m.addToSet(acc), r.marks)))
        else runs.push(r)
      })
    } else {
      runs.push(...innerRuns)
    }
  })

  return runs.length ? runs : [schema.text('\u00a0')]
}

function paragraphNode(el: Element, schema: Schema): PmNode {
  return schema.nodes.paragraph.create(null, inlineRuns(el, schema))
}

function elementToNodes(el: Element, schema: Schema): PmNode[] {
  const tag = el.tagName.toLowerCase()
  const nodes: PmNode[] = []

  switch (tag) {
    case 'p': {
      const content = el.textContent?.trim()
      if (!content) {
        nodes.push(schema.nodes.paragraph.create())
      } else {
        nodes.push(paragraphNode(el, schema))
      }
      break
    }

    case 'h1': case 'h2': case 'h3':
    case 'h4': case 'h5': case 'h6': {
      const level = parseInt(tag[1])
      nodes.push(schema.nodes.heading.create({ level }, inlineRuns(el, schema)))
      break
    }

    case 'ul': case 'ol': {
      const listType = tag === 'ul' ? 'bullet_list' : 'ordered_list'
      const items: PmNode[] = []
      el.querySelectorAll(':scope > li').forEach(li => {
        const para = schema.nodes.paragraph.create(null, inlineRuns(li, schema))
        items.push(schema.nodes.list_item.create(null, para))
      })
      if (items.length) nodes.push(schema.nodes[listType].create(null, items))
      break
    }

    case 'blockquote': {
      el.childNodes.forEach(child => {
        if ((child as Element).tagName) {
          nodes.push(...elementToNodes(child as Element, schema))
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
            schema.nodes.paragraph.create(null, inlineRuns(cell, schema)),
          ]))
        })
        if (cells.length) rows.push(schema.nodes.table_row.create(null, cells))
      })
      if (rows.length) nodes.push(schema.nodes.table.create(null, rows))
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
      el.childNodes.forEach(child => {
        if ((child as Element).tagName) {
          nodes.push(...elementToNodes(child as Element, schema))
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent?.trim()
          if (text) nodes.push(schema.nodes.paragraph.create(null, [schema.text(text)]))
        }
      })
      break
    }

    default: {
      // Treat unknown tags as paragraph if they have text
      const text = el.textContent?.trim()
      if (text) nodes.push(schema.nodes.paragraph.create(null, [schema.text(text)]))
      break
    }
  }

  return nodes
}

function htmlToPmDoc(html: string, schema: Schema): PmNode {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')
  const body = dom.body

  const blocks: PmNode[] = []
  body.childNodes.forEach(child => {
    if ((child as Element).tagName) {
      blocks.push(...elementToNodes(child as Element, schema))
    }
  })

  // Always ensure at least one paragraph
  if (blocks.length === 0) {
    blocks.push(schema.nodes.paragraph.create())
  }

  return schema.nodes.doc.create(null, blocks)
}

// ── Main import function ──────────────────────────────────────

export async function importDocx(file: File): Promise<ImportResult> {
  // Dynamic import to keep initial bundle light
  const mammoth = await import('mammoth')

  const arrayBuffer = await file.arrayBuffer()

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        'p[style-name="Heading 1"] => h1:fresh',
        'p[style-name="Heading 2"] => h2:fresh',
        'p[style-name="Heading 3"] => h3:fresh',
        'p[style-name="Heading 4"] => h4:fresh',
        'p[style-name="Heading 5"] => h5:fresh',
        'p[style-name="Heading 6"] => h6:fresh',
        'r[style-name="Strong"]    => strong',
        'r[style-name="Emphasis"]  => em',
      ],
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

  const sections: ImportedSection[] = sectionHtmls.map(sectionHtml => ({
    pmDoc: htmlToPmDoc(sectionHtml.trim() || '<p></p>', wordoSchema),
  }))

  return {
    title,
    sections,
    warnings: result.messages.map(m => m.message),
  }
}
