#!/usr/bin/env node
import { Command } from 'commander'
import https from 'https'
import http from 'http'

const program = new Command()

// ── Shared HTTP helper ────────────────────────────────────────────────────────
function request(
  method: string,
  path: string,
  body: unknown,
  opts: { host: string; port: number; json: boolean },
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const options = {
      hostname: opts.host,
      port: opts.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }
    const client = opts.port === 443 ? https : http
    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed)
        } catch {
          resolve(data)
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function getOpts(cmd: Command): { host: string; port: number; json: boolean } {
  const root = cmd.parent?.parent ?? cmd.parent ?? cmd
  return {
    host: root.getOptionValue('host') ?? 'localhost',
    port: parseInt(root.getOptionValue('port') ?? '3001'),
    json: root.getOptionValue('json') ?? false,
  }
}

function output(data: unknown, opts: { json: boolean }) {
  if (opts.json || typeof data !== 'object') {
    console.log(JSON.stringify(data, null, 2))
  } else {
    // Pretty print
    const d = (data as Record<string, unknown>)
    if (d.ok === false) {
      console.error(`Error: ${d.error}`)
      process.exit(1)
    }
    console.log(JSON.stringify(d.data ?? d, null, 2))
  }
}

// ── Root program ──────────────────────────────────────────────────────────────
program
  .name('kasumi')
  .description('KASUMI AI-Native CLI — REST API thin client')
  .version('1.0.0')
  .option('--host <host>', 'API server host', 'localhost')
  .option('--port <port>', 'API server port', '3001')
  .option('--json', 'Force JSON output')

// ── health ────────────────────────────────────────────────────────────────────
program
  .command('health')
  .description('Check API server health')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    const data = await request('GET', '/api/health', null, opts)
    output(data, opts)
  })

// ── shell ─────────────────────────────────────────────────────────────────────
const shellCmd = program.command('shell').description('Shell operations')

shellCmd
  .command('get')
  .description('Get current active shell')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('GET', '/api/shell', null, opts), opts)
  })

shellCmd
  .command('switch <shell>')
  .description('Switch active shell (nexcel|wordo)')
  .action(async (shell, _, cmd) => {
    const opts = getOpts(cmd)
    output(await request('PUT', '/api/shell', { shell }, opts), opts)
  })

// ── nexcel ────────────────────────────────────────────────────────────────────
const nexcelCmd = program.command('nexcel').description('NEXCEL spreadsheet operations')

nexcelCmd
  .command('get-data')
  .description('Get rows from Nexcel')
  .option('--search <text>', 'Filter by search text')
  .option('--page <n>', 'Page number', '1')
  .option('--size <n>', 'Page size', '50')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)
    const params = new URLSearchParams()
    if (options.search) params.set('search', options.search)
    params.set('page', options.page)
    params.set('size', options.size)
    output(await request('GET', `/api/nexcel/data?${params}`, null, opts), opts)
  })

nexcelCmd
  .command('get-columns')
  .description('List column definitions')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('GET', '/api/nexcel/columns', null, opts), opts)
  })

nexcelCmd
  .command('insert-row')
  .description('Insert a new row')
  .option('--data <json>', 'JSON object with fieldId:value pairs, e.g. {"1":"My Task"}')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)
    const fields = options.data ? JSON.parse(options.data) : {}
    output(await request('POST', '/api/nexcel/rows', { fields }, opts), opts)
  })

nexcelCmd
  .command('update-row <id>')
  .description('Update row by ID')
  .option('--data <json>', 'JSON fields to update')
  .action(async (id, options, cmd) => {
    const opts = getOpts(cmd)
    const fields = options.data ? JSON.parse(options.data) : {}
    output(await request('PUT', `/api/nexcel/rows/${id}`, { fields }, opts), opts)
  })

nexcelCmd
  .command('delete-row <id>')
  .description('Delete row by ID')
  .action(async (id, _, cmd) => {
    const opts = getOpts(cmd)
    output(await request('DELETE', `/api/nexcel/rows/${id}`, null, opts), opts)
  })

nexcelCmd
  .command('search <query>')
  .description('Search rows by text')
  .action(async (query, _, cmd) => {
    const opts = getOpts(cmd)
    output(await request('GET', `/api/nexcel/search?q=${encodeURIComponent(query)}`, null, opts), opts)
  })

nexcelCmd
  .command('export')
  .description('Export data as CSV')
  .option('--format <format>', 'Export format (csv)', 'csv')
  .action(async (options, cmd) => {
    const opts = { ...getOpts(cmd), json: false }
    const data = await request('GET', `/api/nexcel/export?format=${options.format}`, null, opts)
    console.log(data)
  })

nexcelCmd
  .command('undo')
  .description('Undo last operation')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('POST', '/api/nexcel/undo', null, opts), opts)
  })

nexcelCmd
  .command('redo')
  .description('Redo last undone operation')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('POST', '/api/nexcel/redo', null, opts), opts)
  })

nexcelCmd
  .command('state')
  .description('Get full Nexcel state snapshot')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('GET', '/api/nexcel/state', null, opts), opts)
  })

// ── wordo ─────────────────────────────────────────────────────────────────────
const wordoCmd = program.command('wordo').description('WORDO document operations')

wordoCmd
  .command('get-document')
  .description('Get document content')
  .option('--format <format>', 'Output format (json|markdown)', 'json')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)
    if (options.format === 'markdown') {
      const data = await request('GET', '/api/wordo/document/markdown', null, { ...opts, json: false })
      console.log(data)
    } else {
      output(await request('GET', '/api/wordo/document', null, opts), opts)
    }
  })

wordoCmd
  .command('set-title <title>')
  .description('Set document title')
  .action(async (title, _, cmd) => {
    const opts = getOpts(cmd)
    output(await request('PUT', '/api/wordo/document', { title }, opts), opts)
  })

wordoCmd
  .command('insert-block')
  .description('Insert a new block into the document')
  .option('--section <id>', 'Target section ID (defaults to first section)')
  .option('--type <type>', 'Block type: paragraph|heading|list_item|table|code_block|blockquote', 'paragraph')
  .option('--text <text>', 'Block text content')
  .option('--level <n>', 'Heading level 1-6 (for heading type)', '1')
  .option('--after <blockId>', 'Insert after this block ID')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)

    // Get section ID if not provided
    let sectionId = options.section
    if (!sectionId) {
      const doc = await request('GET', '/api/wordo/document', null, opts) as { data: { sections: Array<{ id: string }> } }
      sectionId = doc.data?.sections?.[0]?.id
    }

    const block: Record<string, unknown> = { type: options.type }
    if (options.type === 'heading') {
      block.level = parseInt(options.level)
      block.content = [{ text: options.text ?? '' }]
    } else if (['paragraph', 'blockquote', 'list_item'].includes(options.type)) {
      block.content = [{ text: options.text ?? '' }]
      if (options.type === 'list_item') {
        block.listType = 'bullet'
        block.level = 0
      }
    } else if (options.type === 'code_block') {
      block.content = options.text ?? ''
    }

    output(await request('POST', '/api/wordo/blocks', { sectionId, block, afterBlockId: options.after }, opts), opts)
  })

wordoCmd
  .command('delete-block <blockId>')
  .description('Delete a block by ID')
  .action(async (blockId, _, cmd) => {
    const opts = getOpts(cmd)
    output(await request('DELETE', `/api/wordo/blocks/${blockId}`, null, opts), opts)
  })

wordoCmd
  .command('outline')
  .description('Show document heading outline')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('GET', '/api/wordo/outline', null, opts), opts)
  })

wordoCmd
  .command('comments')
  .description('List comments')
  .option('--resolved <bool>', 'Filter: true|false')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)
    const q = options.resolved ? `?resolved=${options.resolved}` : ''
    output(await request('GET', `/api/wordo/comments${q}`, null, opts), opts)
  })

wordoCmd
  .command('add-comment')
  .description('Add a comment')
  .option('--section <id>', 'Section ID')
  .option('--text <text>', 'Comment text', 'AI comment')
  .option('--author <name>', 'Author name', 'AI Agent')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)
    let sectionId = options.section
    if (!sectionId) {
      const doc = await request('GET', '/api/wordo/document', null, opts) as { data: { sections: Array<{ id: string }> } }
      sectionId = doc.data?.sections?.[0]?.id
    }
    output(await request('POST', '/api/wordo/comments', { sectionId, text: options.text, author: options.author }, opts), opts)
  })

wordoCmd
  .command('state')
  .description('Get document state snapshot')
  .action(async (_, cmd) => {
    const opts = getOpts(cmd)
    output(await request('GET', '/api/wordo/state', null, opts), opts)
  })

wordoCmd
  .command('import-markdown')
  .description('Import document from Markdown string')
  .option('--text <markdown>', 'Markdown content')
  .option('--title <title>', 'Document title')
  .action(async (options, cmd) => {
    const opts = getOpts(cmd)
    if (!options.text) {
      console.error('--text is required')
      process.exit(1)
    }
    output(await request('PUT', '/api/wordo/document/markdown', { markdown: options.text, title: options.title }, opts), opts)
  })

program.parse(process.argv)
