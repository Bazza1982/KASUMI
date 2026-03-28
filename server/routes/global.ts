import { Router } from 'express'
import { globalState } from '../state.js'
import { generateOpenApiSpec } from '../openapi.js'

const router = Router()

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', (_, res) => {
  res.json({
    ok: true,
    data: {
      status:    'healthy',
      service:   'KASUMI API',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      shell:     globalState.activeShell,
    },
  })
})

// ── GET /api/shell ─────────────────────────────────────────────────────────────
router.get('/shell', (_, res) => {
  res.json({ ok: true, data: { active_shell: globalState.activeShell } })
})

// ── PUT /api/shell ─────────────────────────────────────────────────────────────
router.put('/shell', (req, res) => {
  const { shell } = req.body
  if (!['nexcel', 'wordo'].includes(shell)) {
    return res.status(400).json({ ok: false, error: 'shell must be "nexcel" or "wordo"' })
  }
  globalState.activeShell = shell as 'nexcel' | 'wordo'
  res.json({ ok: true, data: { active_shell: globalState.activeShell } })
})

// ── GET /api/docs ──────────────────────────────────────────────────────────────
router.get('/docs', (_, res) => {
  res.json(generateOpenApiSpec())
})

// ── GET /api/docs/ui — minimal Swagger-style HTML UI ─────────────────────────
router.get('/docs/ui', (_, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>KASUMI API Docs</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    })
  </script>
</body>
</html>`)
})

export default router
