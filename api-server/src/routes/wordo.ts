import { Router, Request, Response } from 'express'
import { wordoStore } from '../store/wordoStore'
import { ok, err } from '../middleware/respond'
import type { AnyBlock, PageStyle } from '../types'

const router = Router()

// GET /api/wordo/state — document state snapshot
router.get('/state', (_req: Request, res: Response) => {
  const doc = wordoStore.getDocument()
  res.json(ok({
    documentId: doc.id,
    title: doc.title,
    sectionCount: doc.sections.length,
    blockCount: doc.sections.reduce((n, s) => n + s.blocks.length, 0),
    commentCount: wordoStore.comments.length,
    pendingChanges: wordoStore.trackChanges.length,
    trackingEnabled: wordoStore.trackingEnabled,
    accessMode: wordoStore.accessMode,
    updatedAt: doc.updatedAt,
  }))
})

// GET /api/wordo/document — full document JSON
router.get('/document', (_req: Request, res: Response) => {
  res.json(ok(wordoStore.getDocument()))
})

// PUT /api/wordo/document — replace document
router.put('/document', (req: Request, res: Response) => {
  const { title, sections } = req.body
  const doc = wordoStore.setDocument({ title, sections })
  res.json(ok(doc))
})

// GET /api/wordo/document/markdown — export as markdown
router.get('/document/markdown', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/markdown')
  res.send(wordoStore.exportMarkdown())
})

// PUT /api/wordo/document/markdown — import from markdown
router.put('/document/markdown', (req: Request, res: Response) => {
  const { markdown, title } = req.body as { markdown: string; title?: string }
  if (!markdown) return res.status(400).json(err('markdown field required', 400))
  const doc = wordoStore.importMarkdown(markdown, title)
  return res.json(ok(doc))
})

// GET /api/wordo/outline — heading tree
router.get('/outline', (_req: Request, res: Response) => {
  res.json(ok(wordoStore.getOutline()))
})

// ── Sections ──────────────────────────────────────────────────────────────────

// GET /api/wordo/sections
router.get('/sections', (_req: Request, res: Response) => {
  res.json(ok(wordoStore.getDocument().sections.map(s => ({
    id: s.id,
    blockCount: s.blocks.length,
    pageStyle: s.pageStyle,
    hasWatermark: !!s.watermark?.enabled,
    hasHeader: !!s.header,
    hasFooter: !!s.footer,
  }))))
})

// POST /api/wordo/sections — add section
router.post('/sections', (req: Request, res: Response) => {
  const { after } = req.body as { after?: string }
  const section = wordoStore.addSection(after)
  return res.status(201).json(ok(section))
})

// DELETE /api/wordo/sections/:id
router.delete('/sections/:id', (req: Request, res: Response) => {
  const deleted = wordoStore.deleteSection(req.params.id)
  if (!deleted) return res.status(404).json(err('Section not found or cannot delete last section', 404))
  return res.json(ok({ deleted: true }))
})

// PUT /api/wordo/sections/:id/page-style
router.put('/sections/:id/page-style', (req: Request, res: Response) => {
  const section = wordoStore.updateSectionPageStyle(req.params.id, req.body as Partial<PageStyle>)
  if (!section) return res.status(404).json(err('Section not found', 404))
  return res.json(ok(section))
})

// ── Blocks ────────────────────────────────────────────────────────────────────

// POST /api/wordo/blocks — insert block
router.post('/blocks', (req: Request, res: Response) => {
  const { sectionId, block, afterBlockId } = req.body as {
    sectionId: string
    block: Omit<AnyBlock, 'id'>
    afterBlockId?: string
  }
  if (!sectionId || !block) return res.status(400).json(err('sectionId and block required', 400))
  try {
    const inserted = wordoStore.insertBlock(sectionId, block, afterBlockId)
    return res.status(201).json(ok(inserted))
  } catch (e) {
    return res.status(404).json(err(String(e), 404))
  }
})

// PUT /api/wordo/blocks/:id — update block
router.put('/blocks/:id', (req: Request, res: Response) => {
  const block = wordoStore.updateBlock(req.params.id, req.body as Partial<AnyBlock>)
  if (!block) return res.status(404).json(err('Block not found', 404))
  return res.json(ok(block))
})

// DELETE /api/wordo/blocks/:id
router.delete('/blocks/:id', (req: Request, res: Response) => {
  const deleted = wordoStore.deleteBlock(req.params.id)
  if (!deleted) return res.status(404).json(err('Block not found', 404))
  return res.json(ok({ deleted: true }))
})

// ── Selection & Format ────────────────────────────────────────────────────────

// GET /api/wordo/selection — server has no GUI selection, return doc cursor info
router.get('/selection', (_req: Request, res: Response) => {
  res.json(ok({
    note: 'Server-side API has no GUI selection. Use /blocks and /document to read/modify content.',
    documentId: wordoStore.getDocument().id,
  }))
})

// POST /api/wordo/format — apply inline format to a block's content
router.post('/format', (req: Request, res: Response) => {
  const { blockId, marks } = req.body as { blockId: string; marks: Record<string, unknown> }
  if (!blockId || !marks) return res.status(400).json(err('blockId and marks required', 400))
  const found = wordoStore.findBlock(blockId)
  if (!found) return res.status(404).json(err('Block not found', 404))

  const block = found.block
  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'list_item' || block.type === 'blockquote') {
    block.content = block.content.map(c => ({ ...c, marks: { ...c.marks, ...marks } }))
    wordoStore.getDocument().updatedAt = new Date().toISOString()
    return res.json(ok(block))
  }
  return res.status(400).json(err('Block type does not support inline formatting', 400))
})

// ── Comments ──────────────────────────────────────────────────────────────────

// GET /api/wordo/comments
router.get('/comments', (req: Request, res: Response) => {
  const { resolved } = req.query
  let comments = wordoStore.comments
  if (resolved === 'false') comments = comments.filter(c => !c.resolved)
  if (resolved === 'true') comments = comments.filter(c => c.resolved)
  res.json(ok(comments))
})

// POST /api/wordo/comments
router.post('/comments', (req: Request, res: Response) => {
  const { sectionId, blockId, anchorText, text, author } = req.body
  if (!sectionId || !text) return res.status(400).json(err('sectionId and text required', 400))
  const comment = wordoStore.addComment({
    sectionId,
    blockId,
    anchorText: anchorText ?? '',
    text,
    author: author ?? 'AI Agent',
  })
  return res.status(201).json(ok(comment))
})

// DELETE /api/wordo/comments/:id
router.delete('/comments/:id', (req: Request, res: Response) => {
  const deleted = wordoStore.deleteComment(req.params.id)
  if (!deleted) return res.status(404).json(err('Comment not found', 404))
  return res.json(ok({ deleted: true }))
})

// POST /api/wordo/comments/:id/resolve
router.post('/comments/:id/resolve', (req: Request, res: Response) => {
  const comment = wordoStore.resolveComment(req.params.id)
  if (!comment) return res.status(404).json(err('Comment not found', 404))
  return res.json(ok(comment))
})

// ── Track Changes ─────────────────────────────────────────────────────────────

// GET /api/wordo/track-changes
router.get('/track-changes', (_req: Request, res: Response) => {
  res.json(ok({
    enabled: wordoStore.trackingEnabled,
    changes: wordoStore.trackChanges,
  }))
})

// POST /api/wordo/track-changes/toggle
router.post('/track-changes/toggle', (_req: Request, res: Response) => {
  wordoStore.trackingEnabled = !wordoStore.trackingEnabled
  res.json(ok({ enabled: wordoStore.trackingEnabled }))
})

// POST /api/wordo/track-changes/accept
router.post('/track-changes/accept', (req: Request, res: Response) => {
  const { id, all } = req.body as { id?: string; all?: boolean }
  if (all) {
    const count = wordoStore.trackChanges.length
    wordoStore.trackChanges = []
    return res.json(ok({ accepted: count }))
  }
  if (id) {
    const success = wordoStore.acceptChange(id)
    if (!success) return res.status(404).json(err('Change not found', 404))
    return res.json(ok({ accepted: 1 }))
  }
  return res.status(400).json(err('id or all required', 400))
})

// POST /api/wordo/track-changes/reject
router.post('/track-changes/reject', (req: Request, res: Response) => {
  const { id, all } = req.body as { id?: string; all?: boolean }
  if (all) {
    const count = wordoStore.trackChanges.length
    wordoStore.trackChanges = []
    return res.json(ok({ rejected: count }))
  }
  if (id) {
    const success = wordoStore.rejectChange(id)
    if (!success) return res.status(404).json(err('Change not found', 404))
    return res.json(ok({ rejected: 1 }))
  }
  return res.status(400).json(err('id or all required', 400))
})

// ── Export ────────────────────────────────────────────────────────────────────

// GET /api/wordo/export/markdown
router.get('/export/markdown', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/markdown')
  res.setHeader('Content-Disposition', 'attachment; filename="wordo-export.md"')
  res.send(wordoStore.exportMarkdown())
})

// GET /api/wordo/export/docx — returns note about browser-side generation
router.get('/export/docx', (_req: Request, res: Response) => {
  res.json(ok({
    note: 'DOCX export requires browser-side rendering (mammoth/docx libraries). Use /api/wordo/document/markdown for machine-readable export.',
    documentId: wordoStore.getDocument().id,
    title: wordoStore.getDocument().title,
  }))
})

// GET /api/wordo/export/pdf — returns note
router.get('/export/pdf', (_req: Request, res: Response) => {
  res.json(ok({
    note: 'PDF export requires browser print dialog. Use /api/wordo/document/markdown for machine-readable export.',
    documentId: wordoStore.getDocument().id,
  }))
})

// ── Access Mode ───────────────────────────────────────────────────────────────

// GET /api/wordo/access-mode
router.get('/access-mode', (_req: Request, res: Response) => {
  res.json(ok({ mode: wordoStore.accessMode }))
})

// PUT /api/wordo/access-mode
router.put('/access-mode', (req: Request, res: Response) => {
  const { mode } = req.body as { mode: 'data-entry' | 'analyst' | 'admin' }
  if (!['data-entry', 'analyst', 'admin'].includes(mode)) {
    return res.status(400).json(err('Invalid mode', 400))
  }
  wordoStore.accessMode = mode
  return res.json(ok({ mode }))
})

export default router
