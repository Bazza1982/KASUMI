import { v4 as uuidv4 } from 'uuid'
import type {
  KasumiDocument, DocumentSection, AnyBlock,
  Comment, TrackChange, PageStyle, HeaderFooterContent, WatermarkConfig,
} from '../types'

// ─── DEFAULT DOCUMENT ────────────────────────────────────────────────────────

const defaultPageStyle: PageStyle = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25, bottom: 25, left: 30, right: 30 },
}

function createDefaultDocument(): KasumiDocument {
  const now = new Date().toISOString()
  const sectionId = uuidv4()
  return {
    id: uuidv4(),
    title: 'Untitled Document',
    sections: [
      {
        id: sectionId,
        pageStyle: defaultPageStyle,
        blocks: [
          {
            type: 'heading',
            id: uuidv4(),
            level: 1,
            content: [{ text: 'Welcome to KASUMI WORDO' }],
          },
          {
            type: 'paragraph',
            id: uuidv4(),
            content: [
              { text: 'This document is managed by the KASUMI API server. AI agents can read and modify content through the REST API.' },
            ],
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

// ─── WORDO STORE CLASS ────────────────────────────────────────────────────────

class WordoStore {
  document: KasumiDocument = createDefaultDocument()
  comments: Comment[] = []
  trackChanges: TrackChange[] = []
  trackingEnabled = false
  accessMode: 'data-entry' | 'analyst' | 'admin' = 'analyst'
  commandAudit: unknown[] = []

  reset(): void {
    this.document = createDefaultDocument()
    this.comments = []
    this.trackChanges = []
    this.trackingEnabled = false
    this.accessMode = 'analyst'
    this.commandAudit = []
  }

  getDocument(): KasumiDocument {
    return this.document
  }

  setDocument(doc: Partial<Pick<KasumiDocument, 'title' | 'sections'>>): KasumiDocument {
    if (doc.title !== undefined) this.document.title = doc.title
    if (doc.sections !== undefined) this.document.sections = doc.sections
    this.document.updatedAt = new Date().toISOString()
    return this.document
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  getSection(id: string): DocumentSection | undefined {
    return this.document.sections.find(s => s.id === id)
  }

  addSection(after?: string): DocumentSection {
    const section: DocumentSection = {
      id: uuidv4(),
      pageStyle: defaultPageStyle,
      blocks: [{ type: 'paragraph', id: uuidv4(), content: [{ text: '' }] }],
    }
    if (after) {
      const idx = this.document.sections.findIndex(s => s.id === after)
      this.document.sections.splice(idx + 1, 0, section)
    } else {
      this.document.sections.push(section)
    }
    this.document.updatedAt = new Date().toISOString()
    return section
  }

  deleteSection(id: string): boolean {
    const idx = this.document.sections.findIndex(s => s.id === id)
    if (idx === -1 || this.document.sections.length <= 1) return false
    this.document.sections.splice(idx, 1)
    this.document.updatedAt = new Date().toISOString()
    return true
  }

  updateSectionPageStyle(sectionId: string, pageStyle: Partial<PageStyle>): DocumentSection | null {
    const section = this.getSection(sectionId)
    if (!section) return null
    Object.assign(section.pageStyle, pageStyle)
    this.document.updatedAt = new Date().toISOString()
    return section
  }

  updateSectionWatermark(sectionId: string, watermark: WatermarkConfig | undefined): DocumentSection | null {
    const section = this.getSection(sectionId)
    if (!section) return null
    section.watermark = watermark
    this.document.updatedAt = new Date().toISOString()
    return section
  }

  updateSectionHeaderFooter(
    sectionId: string,
    zone: 'header' | 'footer',
    value: string | HeaderFooterContent | undefined,
  ): DocumentSection | null {
    const section = this.getSection(sectionId)
    if (!section) return null
    section[zone] = value
    this.document.updatedAt = new Date().toISOString()
    return section
  }

  // ── Blocks ────────────────────────────────────────────────────────────────

  findBlock(blockId: string): { section: DocumentSection; block: AnyBlock; index: number } | null {
    for (const section of this.document.sections) {
      const index = section.blocks.findIndex(b => b.id === blockId)
      if (index !== -1) return { section, block: section.blocks[index], index }
    }
    return null
  }

  insertBlock(sectionId: string, block: Omit<AnyBlock, 'id'>, afterBlockId?: string): AnyBlock {
    const section = this.getSection(sectionId)
    if (!section) throw new Error(`Section ${sectionId} not found`)
    const newBlock = { ...block, id: uuidv4() } as AnyBlock
    if (afterBlockId) {
      const idx = section.blocks.findIndex(b => b.id === afterBlockId)
      section.blocks.splice(idx + 1, 0, newBlock)
    } else {
      section.blocks.push(newBlock)
    }
    this.document.updatedAt = new Date().toISOString()
    return newBlock
  }

  updateBlock(blockId: string, patch: Partial<AnyBlock>): AnyBlock | null {
    const found = this.findBlock(blockId)
    if (!found) return null
    Object.assign(found.block, patch)
    this.document.updatedAt = new Date().toISOString()
    return found.block
  }

  deleteBlock(blockId: string): boolean {
    const found = this.findBlock(blockId)
    if (!found) return false
    found.section.blocks.splice(found.index, 1)
    this.document.updatedAt = new Date().toISOString()
    return true
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  addComment(data: Omit<Comment, 'id' | 'resolved' | 'createdAt'>): Comment {
    const comment: Comment = {
      ...data,
      id: uuidv4(),
      resolved: false,
      createdAt: new Date().toISOString(),
    }
    this.comments.push(comment)
    return comment
  }

  resolveComment(id: string): Comment | null {
    const c = this.comments.find(c => c.id === id)
    if (!c) return null
    c.resolved = true
    return c
  }

  deleteComment(id: string): boolean {
    const idx = this.comments.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.comments.splice(idx, 1)
    return true
  }

  // ── Track Changes ─────────────────────────────────────────────────────────

  addTrackChange(data: Omit<TrackChange, 'id' | 'timestamp'>): TrackChange {
    const change: TrackChange = {
      ...data,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    }
    this.trackChanges.push(change)
    return change
  }

  acceptChange(id: string): boolean {
    const idx = this.trackChanges.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.trackChanges.splice(idx, 1)
    return true
  }

  rejectChange(id: string): boolean {
    const idx = this.trackChanges.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.trackChanges.splice(idx, 1)
    return true
  }

  // ── Outline ───────────────────────────────────────────────────────────────

  getOutline(): Array<{ sectionId: string; blockId: string; level: number; text: string }> {
    const outline: Array<{ sectionId: string; blockId: string; level: number; text: string }> = []
    for (const section of this.document.sections) {
      for (const block of section.blocks) {
        if (block.type === 'heading') {
          outline.push({
            sectionId: section.id,
            blockId: block.id,
            level: block.level,
            text: block.content.map(c => c.text).join(''),
          })
        }
      }
    }
    return outline
  }

  // ── Markdown import/export ─────────────────────────────────────────────────

  exportMarkdown(): string {
    const lines: string[] = [`# ${this.document.title}`, '']
    for (const section of this.document.sections) {
      for (const block of section.blocks) {
        switch (block.type) {
          case 'heading': {
            const prefix = '#'.repeat(block.level)
            lines.push(`${prefix} ${block.content.map(c => c.text).join('')}`)
            lines.push('')
            break
          }
          case 'paragraph':
            lines.push(block.content.map(c => {
              let t = c.text
              if (c.marks?.bold) t = `**${t}**`
              if (c.marks?.italic) t = `*${t}*`
              if (c.marks?.code) t = `\`${t}\``
              return t
            }).join(''))
            lines.push('')
            break
          case 'list_item':
            lines.push(`${'  '.repeat(block.level)}${block.listType === 'bullet' ? '-' : '1.'} ${block.content.map(c => c.text).join('')}`)
            break
          case 'blockquote':
            lines.push(`> ${block.content.map(c => c.text).join('')}`)
            lines.push('')
            break
          case 'code_block':
            lines.push('```' + (block.language ?? ''))
            lines.push(block.content)
            lines.push('```')
            lines.push('')
            break
          case 'page_break':
            lines.push('---')
            lines.push('')
            break
        }
      }
    }
    return lines.join('\n')
  }

  importMarkdown(md: string, title?: string): KasumiDocument {
    const lines = md.split('\n')
    const now = new Date().toISOString()
    const sectionId = uuidv4()
    const blocks: AnyBlock[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      if (line.startsWith('```')) {
        const lang = line.slice(3).trim()
        const contentLines: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('```')) {
          contentLines.push(lines[i])
          i++
        }
        blocks.push({ type: 'code_block', id: uuidv4(), content: contentLines.join('\n'), language: lang || undefined })
      } else if (/^#{1,6} /.test(line)) {
        const match = line.match(/^(#{1,6}) (.+)/)
        if (match) {
          blocks.push({
            type: 'heading',
            id: uuidv4(),
            level: match[1].length as 1 | 2 | 3 | 4 | 5 | 6,
            content: [{ text: match[2] }],
          })
        }
      } else if (line.startsWith('> ')) {
        blocks.push({ type: 'blockquote', id: uuidv4(), content: [{ text: line.slice(2) }] })
      } else if (/^(-|\d+\.) /.test(line)) {
        const isBullet = line.startsWith('- ')
        blocks.push({
          type: 'list_item',
          id: uuidv4(),
          listType: isBullet ? 'bullet' : 'ordered',
          level: 0,
          content: [{ text: line.replace(/^(-|\d+\.) /, '') }],
        })
      } else if (line.trim() === '---') {
        blocks.push({ type: 'page_break', id: uuidv4() })
      } else if (line.trim()) {
        blocks.push({ type: 'paragraph', id: uuidv4(), content: [{ text: line }] })
      }
      i++
    }

    this.document = {
      id: uuidv4(),
      title: title ?? this.document.title,
      sections: [{ id: sectionId, pageStyle: defaultPageStyle, blocks }],
      createdAt: now,
      updatedAt: now,
    }
    return this.document
  }
}

export const wordoStore = new WordoStore()
