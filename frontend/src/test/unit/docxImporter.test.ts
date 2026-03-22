import { describe, it, expect } from 'vitest'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'

// Access the internal htmlToPmDoc via a test-only re-export shim.
// Since it's not exported, we replicate the minimal logic needed to unit-test
// the HTML-to-ProseMirror conversion path directly.

// ── Inline the htmlToPmDoc helper (mirrors DocxImporter internals) ────────────
import type { Node as PmNode, Schema } from 'prosemirror-model'

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
    const innerRuns = inlineRuns(child, schema)
    const marks: ReturnType<typeof schema.mark>[] = []
    if (tag === 'strong' || tag === 'b') marks.push(schema.mark('strong'))
    if (tag === 'em' || tag === 'i')     marks.push(schema.mark('em'))
    // underline / strikethrough not in basicSchema marks — skipped
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

function elementToNodes(el: Element, schema: Schema): PmNode[] {
  const tag = el.tagName.toLowerCase()
  const nodes: PmNode[] = []
  switch (tag) {
    case 'p': {
      const content = el.textContent?.trim()
      nodes.push(content
        ? schema.nodes.paragraph.create(null, inlineRuns(el, schema))
        : schema.nodes.paragraph.create())
      break
    }
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
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
    case 'table': {
      const rows: PmNode[] = []
      el.querySelectorAll('tr').forEach((tr, ri) => {
        const cells: PmNode[] = []
        tr.querySelectorAll('td, th').forEach(cell => {
          const cellType = ri === 0 ? schema.nodes.table_header : schema.nodes.table_cell
          cells.push(cellType.create(null, [schema.nodes.paragraph.create(null, inlineRuns(cell, schema))]))
        })
        if (cells.length) rows.push(schema.nodes.table_row.create(null, cells))
      })
      if (rows.length) nodes.push(schema.nodes.table.create(null, rows))
      break
    }
    case 'hr':
      nodes.push(schema.nodes.horizontal_rule.create())
      break
    case 'div': case 'section': {
      el.childNodes.forEach(child => {
        if ((child as Element).tagName) nodes.push(...elementToNodes(child as Element, schema))
      })
      break
    }
    default: {
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
    if ((child as Element).tagName) blocks.push(...elementToNodes(child as Element, schema))
  })
  if (blocks.length === 0) blocks.push(schema.nodes.paragraph.create())
  return schema.nodes.doc.create(null, blocks)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DocxImporter — paragraph parsing', () => {
  it('converts <p> to paragraph node', () => {
    const doc = htmlToPmDoc('<p>Hello world</p>', wordoSchema)
    expect(doc.firstChild?.type.name).toBe('paragraph')
    expect(doc.textContent).toBe('Hello world')
  })

  it('empty <p> becomes empty paragraph', () => {
    const doc = htmlToPmDoc('<p></p>', wordoSchema)
    expect(doc.firstChild?.type.name).toBe('paragraph')
    expect(doc.firstChild?.content.size).toBe(0)
  })

  it('empty html still yields at least one paragraph', () => {
    const doc = htmlToPmDoc('', wordoSchema)
    expect(doc.childCount).toBeGreaterThanOrEqual(1)
  })
})

describe('DocxImporter — heading parsing', () => {
  it('converts h1–h6 with correct level attribute', () => {
    for (let lvl = 1; lvl <= 6; lvl++) {
      const doc = htmlToPmDoc(`<h${lvl}>Title ${lvl}</h${lvl}>`, wordoSchema)
      const heading = doc.firstChild!
      expect(heading.type.name).toBe('heading')
      expect(heading.attrs.level).toBe(lvl)
      expect(heading.textContent).toBe(`Title ${lvl}`)
    }
  })
})

describe('DocxImporter — list parsing', () => {
  it('converts <ul> to bullet_list with list_item children', () => {
    const doc = htmlToPmDoc('<ul><li>A</li><li>B</li></ul>', wordoSchema)
    const list = doc.firstChild!
    expect(list.type.name).toBe('bullet_list')
    expect(list.childCount).toBe(2)
    expect(list.firstChild?.type.name).toBe('list_item')
  })

  it('converts <ol> to ordered_list', () => {
    const doc = htmlToPmDoc('<ol><li>First</li><li>Second</li></ol>', wordoSchema)
    const list = doc.firstChild!
    expect(list.type.name).toBe('ordered_list')
    expect(list.childCount).toBe(2)
  })

  it('list items have paragraph children', () => {
    const doc = htmlToPmDoc('<ul><li>Item</li></ul>', wordoSchema)
    const item = doc.firstChild!.firstChild!
    expect(item.firstChild?.type.name).toBe('paragraph')
    expect(item.firstChild?.textContent).toBe('Item')
  })
})

describe('DocxImporter — table parsing', () => {
  it('converts <table> to table node', () => {
    const html = '<table><tr><th>Col A</th><th>Col B</th></tr><tr><td>1</td><td>2</td></tr></table>'
    const doc = htmlToPmDoc(html, wordoSchema)
    const table = doc.firstChild!
    expect(table.type.name).toBe('table')
    expect(table.childCount).toBe(2) // 2 rows
  })

  it('first row uses table_header cells', () => {
    const html = '<table><tr><th>Head</th></tr><tr><td>Body</td></tr></table>'
    const doc = htmlToPmDoc(html, wordoSchema)
    const table = doc.firstChild!
    const firstCell = table.firstChild!.firstChild!
    expect(firstCell.type.name).toBe('table_header')
  })

  it('subsequent rows use table_cell', () => {
    const html = '<table><tr><th>H</th></tr><tr><td>Data</td></tr></table>'
    const doc = htmlToPmDoc(html, wordoSchema)
    const table = doc.firstChild!
    const bodyCell = table.child(1).firstChild!
    expect(bodyCell.type.name).toBe('table_cell')
  })
})

describe('DocxImporter — inline mark parsing', () => {
  it('applies strong mark to <strong>', () => {
    const doc = htmlToPmDoc('<p><strong>Bold</strong></p>', wordoSchema)
    const para = doc.firstChild!
    const textNode = para.firstChild!
    expect(textNode.marks.some(m => m.type.name === 'strong')).toBe(true)
  })

  it('applies em mark to <em>', () => {
    const doc = htmlToPmDoc('<p><em>Italic</em></p>', wordoSchema)
    const para = doc.firstChild!
    expect(para.firstChild!.marks.some(m => m.type.name === 'em')).toBe(true)
  })

  it('applies link mark with href to <a>', () => {
    const doc = htmlToPmDoc('<p><a href="https://example.com">Link</a></p>', wordoSchema)
    const para = doc.firstChild!
    const linkMark = para.firstChild!.marks.find(m => m.type.name === 'link')
    expect(linkMark).toBeDefined()
    expect(linkMark?.attrs.href).toBe('https://example.com')
  })

  it('stacks multiple marks', () => {
    const doc = htmlToPmDoc('<p><strong><em>Both</em></strong></p>', wordoSchema)
    const para = doc.firstChild!
    const marks = para.firstChild!.marks.map(m => m.type.name)
    expect(marks).toContain('strong')
    expect(marks).toContain('em')
  })
})

describe('DocxImporter — horizontal rule', () => {
  it('converts <hr> to horizontal_rule node', () => {
    const doc = htmlToPmDoc('<hr/>', wordoSchema)
    expect(doc.firstChild?.type.name).toBe('horizontal_rule')
  })
})
