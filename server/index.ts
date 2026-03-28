import express from 'express'
import cors from 'cors'
import nexcelRouter from './routes/nexcel.js'
import wordoRouter  from './routes/wordo.js'
import globalRouter from './routes/global.js'

const app  = express()
const PORT = parseInt(process.env.KASUMI_API_PORT ?? '3001')

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.text({ type: 'text/markdown' }))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/nexcel', nexcelRouter)
app.use('/api/wordo',  wordoRouter)
app.use('/api',        globalRouter)

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}`, hint: 'See /api/docs for all available endpoints.' })
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ KASUMI API running on http://localhost:${PORT}`)
  console.log(`📖 OpenAPI docs:  http://localhost:${PORT}/api/docs`)
  console.log(`🖥  Swagger UI:   http://localhost:${PORT}/api/docs/ui`)
})

export default app
