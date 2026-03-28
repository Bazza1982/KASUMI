import { Router, Request, Response } from 'express'
import { nexcelStore } from '../store/nexcelStore'
import { wordoStore } from '../store/wordoStore'
import { ok } from '../middleware/respond'

const router = Router()

// GET /api/health
router.get('/health', (_req: Request, res: Response) => {
  res.json(ok({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    shells: {
      nexcel: { rows: nexcelStore.rows.length, fields: nexcelStore.fields.length },
      wordo: { sections: wordoStore.getDocument().sections.length, title: wordoStore.getDocument().title },
    },
  }))
})

// GET /api/shell — current active shell
router.get('/shell', (_req: Request, res: Response) => {
  res.json(ok({ activeShell: nexcelStore.activeShell }))
})

// PUT /api/shell — switch shell
router.put('/shell', (req: Request, res: Response) => {
  const { shell } = req.body as { shell: 'nexcel' | 'wordo' }
  if (!['nexcel', 'wordo'].includes(shell)) {
    return res.status(400).json({ ok: false, error: 'shell must be nexcel or wordo', code: 400 })
  }
  nexcelStore.activeShell = shell
  return res.json(ok({ activeShell: shell }))
})

export default router
