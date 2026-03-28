import { Router } from 'express'
import { wordoState } from '../state.js'
import type { WordoBlock, Comment } from '../state.js'

const router = Router()

function ok(res: any, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data })
}
function err(res: any, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message })
}

function findBlock(blockId: string) {
  for (const section of wordoState.document.sections) {
    const block = section.blocks.find(b => b.id === blockId)
    if (block) return { section, block }
  }
  return null
}

function docToMarkdown(): string {
  const lines: string[] = [`# ${wordoState.document.title}`, '']
  for (const section of wordoState.document.sections) {
    for (const block of section.blocks) {
      switch (block.type) {
        case 'heading':
          lines.push(`${'#'.repeat((block.attrs?.level as number) ?? 1)} ${block.content}`)
          break
        case 'bullet_list':
          lines.push(`- ${block.content}`)
          break
        case 'ordered_list':
          lines.push(`1. ${block.content}`)
          break
        case 'blockquote':
          lines.push(`> ${block.content}`)
          break
        case 'code_block':
          lines.push('```', block.content, '```')
          break
        default:
          lines.push(block.content)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

function markdownToBlocks(md: string): WordoBlock[] {
  const lines = md.split('\n')
  const blocks: WordoBlock[] = []
  let id = 1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      blocks.push({ id: `block-${id++}`, type: 'heading', content: hMatch[2], attrs: { level: hMatch[1].length } })
    } else if (line.startsWith('- ')) {
      blocks.push({ id: `block-${id++}`, type: 'bullet_list', content: line.slice(2) })
    } else if (line.match(/^\d+\.\s/)) {
      blocks.push({ id: `block-${id++}`, type: 'ordered_list', content: line.replace(/^\d+\.\s/, '') })
    } else if (line.startsWith('> ')) {
      blocks.push({ id: `block-${id++}`, type: 'blockquote', content: line.slice(2) })
    } else if (line === '```') {
      const codeLines = []
      i++
      while (i < lines.length && lines[i] !== '```') codeLines.push(lines[i++])
      blocks.push({ id: `block-${id++}`, type: 'code_block', content: codeLines.join('\n') })
    } else {
      blocks.push({ id: `block-${id++}`, type: 'paragraph', content: line })
    }
  }
  return blocks
}

// ── GET /api/wordo/state ──────────────────────────────────────────────────────
router.get('/state', (_, res) => {
  ok(res, {
    title:         wordoState.document.title,
    sectionCount:  wordoState.document.sections.length,
    blockCount:    wordoState.document.sections.reduce((n, s) => n + s.blocks.length, 0),
    accessMode:    wordoState.accessMode,
    comments:      wordoState.comments.length,
    trackChanges:  wordoState.trackChanges.length,
    updatedAt:     wordoState.document.updatedAt,
  })
})

// ── GET /api/wordo/document ───────────────────────────────────────────────────
router.get('/document', (_, res) => {
  ok(res, wordoState.document)
})

// ── PUT /api/wordo/document ───────────────────────────────────────────────────
router.put('/document', (req, res) => {
  const { title, sections } = req.body
  if (title) wordoState.document.title = title
  if (sections) wordoState.document.sections = sections
  wordoState.document.updatedAt = new Date().toISOString()
  ok(res, wordoState.document)
})

// ── GET /api/wordo/document/markdown ─────────────────────────────────────────
router.get('/document/markdown', (_, res) => {
  res.setHeader('Content-Type', 'text/markdown')
  res.send(docToMarkdown())
})

// Keep this legacy export path for the current frontend File tab action.
router.get('/export/markdown', (_, res) => {
  res.setHeader('Content-Type', 'text/markdown')
  res.setHeader('Content-Disposition', 'attachment; filename="wordo-export.md"')
  res.send(docToMarkdown())
})

// ── PUT /api/wordo/document/markdown ─────────────────────────────────────────
router.put('/document/markdown', (req, res) => {
  const md = typeof req.body === 'string' ? req.body : req.body.markdown
  if (!md) return err(res, 'markdown content required')
  const lines   = md.split('\n')
  const titleLine = lines.find((l: string) => l.startsWith('# '))
  if (titleLine) wordoState.document.title = titleLine.slice(2).trim()
  const blocks = markdownToBlocks(md)
  wordoState.document.sections = [{ id: 'section-1', blocks }]
  wordoState.document.updatedAt = new Date().toISOString()
  ok(res, wordoState.document)
})

// ── GET /api/wordo/outline ────────────────────────────────────────────────────
router.get('/outline', (_, res) => {
  const headings: { id: string; level: number; text: string }[] = []
  for (const section of wordoState.document.sections) {
    for (const block of section.blocks) {
      if (block.type === 'heading') {
        headings.push({ id: block.id, level: (block.attrs?.level as number) ?? 1, text: block.content })
      }
    }
  }
  ok(res, { headings })
})

// ── POST /api/wordo/blocks ────────────────────────────────────────────────────
router.post('/blocks', (req, res) => {
  const { section_id, type = 'paragraph', content = '', attrs, after_block_id } = req.body
  const sectionId = section_id ?? wordoState.document.sections[0]?.id
  const section = wordoState.document.sections.find(s => s.id === sectionId)
  if (!section) return err(res, 'Section not found', 404)

  const block: WordoBlock = {
    id: `block-${Date.now()}`,
    type, content, attrs,
  }

  if (after_block_id) {
    const idx = section.blocks.findIndex(b => b.id === after_block_id)
    section.blocks.splice(idx + 1, 0, block)
  } else {
    section.blocks.push(block)
  }
  wordoState.document.updatedAt = new Date().toISOString()
  ok(res, block, 201)
})

// ── PUT /api/wordo/blocks/:id ─────────────────────────────────────────────────
router.put('/blocks/:id', (req, res) => {
  const hit = findBlock(req.params.id)
  if (!hit) return err(res, 'Block not found', 404)
  const { content, type, attrs } = req.body
  if (content !== undefined) hit.block.content = content
  if (type    !== undefined) hit.block.type    = type
  if (attrs   !== undefined) hit.block.attrs   = attrs
  wordoState.document.updatedAt = new Date().toISOString()
  ok(res, hit.block)
})

// ── DELETE /api/wordo/blocks/:id ──────────────────────────────────────────────
router.delete('/blocks/:id', (req, res) => {
  for (const section of wordoState.document.sections) {
    const idx = section.blocks.findIndex(b => b.id === req.params.id)
    if (idx !== -1) {
      section.blocks.splice(idx, 1)
      wordoState.document.updatedAt = new Date().toISOString()
      return ok(res, { deleted: req.params.id })
    }
  }
  err(res, 'Block not found', 404)
})

// ── GET /api/wordo/selection ──────────────────────────────────────────────────
router.get('/selection', (_, res) => {
  ok(res, { selection: null, note: 'Selection is a browser-side concept; use blocks API to target content by block ID.' })
})

// ── POST /api/wordo/format ────────────────────────────────────────────────────
router.post('/format', (req, res) => {
  const { block_id, marks } = req.body
  if (!block_id) return err(res, 'block_id required')
  const hit = findBlock(block_id)
  if (!hit) return err(res, 'Block not found', 404)
  hit.block.attrs = { ...(hit.block.attrs ?? {}), marks }
  wordoState.document.updatedAt = new Date().toISOString()
  ok(res, hit.block)
})

// ── GET /api/wordo/comments ───────────────────────────────────────────────────
router.get('/comments', (_, res) => {
  ok(res, { comments: wordoState.comments })
})

// ── POST /api/wordo/comments ──────────────────────────────────────────────────
router.post('/comments', (req, res) => {
  const { text, author = 'AI Agent', anchor = '' } = req.body
  if (!text) return err(res, 'text required')
  const comment: Comment = {
    id: `wc-${Date.now()}`,
    cellRef: anchor, text, author,
    createdAt: new Date().toISOString(),
    resolved: false,
  }
  wordoState.comments.push(comment)
  ok(res, comment, 201)
})

// ── DELETE /api/wordo/comments/:id ────────────────────────────────────────────
router.delete('/comments/:id', (req, res) => {
  const idx = wordoState.comments.findIndex(c => c.id === req.params.id)
  if (idx === -1) return err(res, 'Comment not found', 404)
  wordoState.comments.splice(idx, 1)
  ok(res, { deleted: req.params.id })
})

// ── GET /api/wordo/track-changes ──────────────────────────────────────────────
router.get('/track-changes', (_, res) => {
  ok(res, { changes: wordoState.trackChanges })
})

// ── POST /api/wordo/track-changes/accept ─────────────────────────────────────
router.post('/track-changes/accept', (req, res) => {
  const { ids } = req.body
  if (ids) {
    wordoState.trackChanges = wordoState.trackChanges.filter(c => !ids.includes(c.id))
  } else {
    wordoState.trackChanges = []
  }
  ok(res, { accepted: ids ?? 'all', remaining: wordoState.trackChanges.length })
})

// ── POST /api/wordo/track-changes/reject ─────────────────────────────────────
router.post('/track-changes/reject', (req, res) => {
  const { ids } = req.body
  if (ids) {
    wordoState.trackChanges = wordoState.trackChanges.filter(c => !ids.includes(c.id))
  } else {
    wordoState.trackChanges = []
  }
  ok(res, { rejected: ids ?? 'all', remaining: wordoState.trackChanges.length })
})

// ── GET /api/wordo/export/docx ────────────────────────────────────────────────
router.get('/export/docx', (_, res) => {
  res.status(501).json({ ok: false, error: 'DOCX binary export requires the Electron desktop app. Use /api/wordo/document/markdown for text export.' })
})

// ── GET /api/wordo/export/pdf ─────────────────────────────────────────────────
router.get('/export/pdf', (_, res) => {
  res.status(501).json({ ok: false, error: 'PDF export requires a browser print context. Use /api/wordo/document/markdown for text export.' })
})

// ── GET /api/wordo/access-mode ────────────────────────────────────────────────
router.get('/access-mode', (_, res) => {
  ok(res, { mode: wordoState.accessMode })
})

// ── PUT /api/wordo/access-mode ────────────────────────────────────────────────
router.put('/access-mode', (req, res) => {
  const { mode } = req.body
  if (!['data-entry', 'analyst', 'admin'].includes(mode)) return err(res, 'Invalid mode')
  wordoState.accessMode = mode
  ok(res, { mode })
})

export default router
