import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import nexcelRouter from './routes/nexcel'
import wordoRouter from './routes/wordo'
import globalRouter from './routes/global'
import { notFound, errorHandler } from './middleware/respond'
import { openApiSpec } from './openapi/spec'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ── OpenAPI docs ──────────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'KASUMI API Docs',
  customCss: '.swagger-ui .topbar { background: #217346; } .swagger-ui .topbar-wrapper img { display: none; } .swagger-ui .topbar-wrapper::before { content: "KASUMI API"; color: white; font-size: 18px; font-weight: 700; }',
}))

// Serve raw OpenAPI spec
app.get('/api/openapi.json', (_req, res) => {
  res.json(openApiSpec)
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', globalRouter)
app.use('/api/nexcel', nexcelRouter)
app.use('/api/wordo', wordoRouter)

// Root redirect to docs
app.get('/', (_req, res) => {
  res.redirect('/api/docs')
})

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║         KASUMI AI-Native API Server           ║
╠═══════════════════════════════════════════════╣
║  Port:    ${PORT}                               ║
║  Docs:    http://localhost:${PORT}/api/docs       ║
║  Health:  http://localhost:${PORT}/api/health     ║
║  Shell:   http://localhost:${PORT}/api/shell      ║
╚═══════════════════════════════════════════════╝
  `.trim())
})

export default app
