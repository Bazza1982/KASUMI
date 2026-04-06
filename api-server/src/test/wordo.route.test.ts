import { beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import wordoRouter from '../routes/wordo'
import { wordoStore } from '../store/wordoStore'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/wordo', wordoRouter)
  return app
}

describe('wordo semantic API routes', () => {
  const app = buildApp()

  beforeEach(() => {
    wordoStore.reset()
  })

  it('returns the semantic command surface', async () => {
    const res = await supertest(app).get('/api/wordo/commands/surface')
    expect(res.status).toBe(200)
    expect(res.body.data.some((item: { type: string }) => item.type === 'update_block')).toBe(true)
  })

  it('returns generated MCP tool definitions', async () => {
    const res = await supertest(app).get('/api/wordo/mcp/tools')
    expect(res.status).toBe(200)
    expect(res.body.data.some((item: { name: string }) => item.name === 'wordo.rewrite_block')).toBe(true)
  })

  it('executes a semantic command and records audit', async () => {
    const doc = wordoStore.getDocument()
    const sectionId = doc.sections[0].id
    const blockId = doc.sections[0].blocks[1].id

    const execRes = await supertest(app)
      .post('/api/wordo/commands/execute')
      .send({
        type: 'rewrite_block',
        payload: { sectionId, blockId, newText: 'Server-facing rewrite works.' },
        source: 'api',
      })

    expect(execRes.status).toBe(200)
    expect(wordoStore.findBlock(blockId)?.block).toMatchObject({
      id: blockId,
      content: [{ text: 'Server-facing rewrite works.' }],
    })

    const auditRes = await supertest(app).get('/api/wordo/command-audit')
    expect(auditRes.status).toBe(200)
    expect(auditRes.body.data.summary.totalCommands).toBe(1)
    expect(auditRes.body.data.summary.successCount).toBe(1)
    expect(auditRes.body.data.summary.commandTypeCounts.rewrite_block).toBe(1)
  })

  it('executes a generated MCP tool call through REST', async () => {
    const doc = wordoStore.getDocument()
    const sectionId = doc.sections[0].id

    const res = await supertest(app)
      .post('/api/wordo/mcp/execute')
      .send({
        toolName: 'wordo.insert_section',
        args: { afterSectionId: sectionId },
        source: 'mcp',
      })

    expect(res.status).toBe(200)
    expect(wordoStore.getDocument().sections).toHaveLength(2)
    expect(res.body.data.layoutImpact).toBe('whole_section')
  })

  it('returns validation errors for unknown semantic commands', async () => {
    const res = await supertest(app)
      .post('/api/wordo/commands/execute')
      .send({
        type: 'unknown_command',
        payload: {},
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Unknown Wordo command type')
  })
})
