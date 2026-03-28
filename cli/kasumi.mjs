#!/usr/bin/env node
/**
 * kasumi — KASUMI AI-Native CLI
 * Thin wrapper around the KASUMI REST API.
 *
 * Usage:  kasumi <shell> <command> [args] [options]
 *         kasumi health
 *
 * Options (global):
 *   --host <host>   API host (default: localhost)
 *   --port <port>   API port (default: 3001)
 *   --json          Force raw JSON output
 */

import { parseArgs } from 'node:util'

// ── Arg parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)

const { values: opts, positionals } = parseArgs({
  args: argv,
  options: {
    host:        { type: 'string',  default: 'localhost' },
    port:        { type: 'string',  default: '3001' },
    json:        { type: 'boolean', default: false },
    data:        { type: 'string' },       // --data '{"key":"val"}'
    format:      { type: 'string' },       // --format csv|json
    page:        { type: 'string',  default: '1' },
    'page-size': { type: 'string',  default: '100' },
    help:        { type: 'boolean', default: false, short: 'h' },
  },
  allowPositionals: true,
  strict: false,
})

const BASE = `http://${opts.host}:${opts.port}`

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const url = BASE + path
  const init = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  try {
    const res  = await fetch(url, init)
    const text = await res.text()
    try { return { status: res.status, body: JSON.parse(text) } }
    catch { return { status: res.status, body: text } }
  } catch (e) {
    console.error(`\n❌  Cannot reach KASUMI API at ${BASE}`)
    console.error(`    Start the server first:  npm run server\n`)
    process.exit(1)
  }
}

async function GET(path)         { return api('GET',    path) }
async function POST(path, body)  { return api('POST',   path, body) }
async function PUT(path, body)   { return api('PUT',    path, body) }
async function DEL(path)         { return api('DELETE', path) }

function out(result) {
  if (result.body?.ok === false) {
    if (opts.json) {
      console.log(JSON.stringify(result.body, null, 2))
    } else {
      console.error('❌', result.body.error)
    }
    process.exit(1)
  }
  if (opts.json || typeof result.body !== 'object') {
    console.log(JSON.stringify(result.body, null, 2))
  } else {
    pretty(result.body?.data ?? result.body)
  }
}

function pretty(data) {
  if (data === null || data === undefined) { console.log('(empty)'); return }
  if (typeof data === 'string') { console.log(data); return }
  if (Array.isArray(data)) {
    console.log(JSON.stringify(data, null, 2))
    return
  }
  // Row results — always output as valid JSON so AI agents can parse
  if (data.rows && Array.isArray(data.rows)) {
    console.log(JSON.stringify(data, null, 2))
    return
  }
  console.log(JSON.stringify(data, null, 2))
}

// ── Help ──────────────────────────────────────────────────────────────────────
const HELP = `
kasumi — KASUMI AI-Native CLI v1.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USAGE
  kasumi <command> [args] [options]

GLOBAL COMMANDS
  health                       Service health check
  shell                        Show active shell
  shell switch <nexcel|wordo>  Switch active shell
  docs                         Print API docs URL

NEXCEL COMMANDS
  nexcel get-data              List rows (first 100)
  nexcel get-data --page 2     List rows page 2
  nexcel get-columns           List column definitions
  nexcel insert-row --data '{"fields":{"1":"Task name"}}'
  nexcel update-row <id> --data '{"fields":{"5":"Alice"}}'
  nexcel delete-row <id>
  nexcel batch --data '{"insert":[...],"update":[...]}'
  nexcel search <query>
  nexcel filter --data '{"field_id":2,"operator":"equals","value":"Done"}'
  nexcel sort --data '{"field_id":1,"direction":"asc"}'
  nexcel format --data '{"row_id":1,"field_id":2,"format":{"bold":true}}'
  nexcel add-cond-fmt --data '{"field_id":2,"operator":"equals","value":"Done","bg_color":"#86efac"}'
  nexcel delete-cond-fmt <rule-id>
  nexcel import --data '{"csv":"Name,Status\\nTask A,Todo"}'
  nexcel export                Export as CSV (prints to stdout)
  nexcel export --format json  Export as JSON
  nexcel undo
  nexcel redo
  nexcel copy --data '{"row_ids":[1,2,3]}'
  nexcel paste
  nexcel add-comment --data '{"cell_ref":"A1","text":"Review this"}'
  nexcel delete-comment <id>
  nexcel get-mode              Show access mode
  nexcel set-mode <data-entry|analyst|admin>
  nexcel state                 Sheet state snapshot

WORDO COMMANDS
  wordo get-document           Print document JSON
  wordo get-markdown           Print document as Markdown
  wordo set-title <title>
  wordo import-markdown --data '{"markdown":"# Title\\n\\nBody text"}'
  wordo outline                Print heading tree
  wordo insert-block --data '{"type":"heading","content":"Hello","attrs":{"level":1}}'
  wordo update-block <id> --data '{"content":"Updated"}'
  wordo delete-block <id>
  wordo add-comment --data '{"text":"Good point","author":"Barry"}'
  wordo delete-comment <id>
  wordo get-changes            List tracked changes
  wordo accept-changes         Accept all changes
  wordo reject-changes         Reject all changes
  wordo get-mode
  wordo set-mode <data-entry|analyst|admin>
  wordo state                  Document state snapshot

OPTIONS
  --host <host>  API host (default: localhost)
  --port <port>  API port (default: 3001)
  --json         Raw JSON output
  --data <json>  Request body as JSON string
  --format <fmt> Output format (csv|json for export)
  -h, --help     Show this help
`

// ── Main ──────────────────────────────────────────────────────────────────────
const [cmd, sub, ...rest] = positionals

if (!cmd || opts.help) { console.log(HELP); process.exit(0) }

const data = opts.data ? JSON.parse(opts.data) : undefined

// ── health ────────────────────────────────────────────────────────────────────
if (cmd === 'health') { out(await GET('/api/health')); process.exit(0) }
if (cmd === 'docs')   { console.log(`OpenAPI JSON: ${BASE}/api/docs\nSwagger UI:  ${BASE}/api/docs/ui`); process.exit(0) }

// ── shell ─────────────────────────────────────────────────────────────────────
if (cmd === 'shell') {
  if (sub === 'switch') out(await PUT('/api/shell', { shell: rest[0] }))
  else                  out(await GET('/api/shell'))
  process.exit(0)
}

// ── nexcel ────────────────────────────────────────────────────────────────────
if (cmd === 'nexcel') {
  switch (sub) {
    case 'state':           out(await GET('/api/nexcel/state'));           break
    case 'get-data':        out(await GET(`/api/nexcel/data?page=${opts.page ?? 1}&size=${opts['page-size'] ?? 100}`)); break
    case 'get-columns':     out(await GET('/api/nexcel/columns'));          break
    case 'add-column':      out(await POST('/api/nexcel/columns', data));   break
    case 'insert-row':      out(await POST('/api/nexcel/rows', data));      break
    case 'update-row':      out(await PUT(`/api/nexcel/rows/${sub === 'update-row' ? rest[0] : sub}`, data)); break
    case 'delete-row':      out(await DEL(`/api/nexcel/rows/${rest[0]}`));  break
    case 'batch':           out(await POST('/api/nexcel/rows/batch', data)); break
    case 'search':          out(await GET(`/api/nexcel/search?q=${encodeURIComponent(rest.join(' '))}`)); break
    case 'filter':          out(await POST('/api/nexcel/filter', data));     break
    case 'sort':            out(await POST('/api/nexcel/sort', data));       break
    case 'format':          out(await POST('/api/nexcel/format', data));     break
    case 'add-cond-fmt':    out(await POST('/api/nexcel/conditional-format', data)); break
    case 'get-cond-fmt':    out(await GET('/api/nexcel/conditional-format'));  break
    case 'delete-cond-fmt': out(await DEL(`/api/nexcel/conditional-format/${rest[0]}`)); break
    case 'import':          out(await POST('/api/nexcel/import', data));    break
    case 'export': {
      const fmt = opts.format ?? 'csv'
      if (fmt === 'json') { out(await GET('/api/nexcel/export?format=json')); break }
      const r = await fetch(`${BASE}/api/nexcel/export`)
      process.stdout.write(await r.text())
      break
    }
    case 'undo':            out(await POST('/api/nexcel/undo'));             break
    case 'redo':            out(await POST('/api/nexcel/redo'));             break
    case 'copy':            out(await POST('/api/nexcel/clipboard/copy', data)); break
    case 'paste':           out(await POST('/api/nexcel/clipboard/paste', data ?? {})); break
    case 'get-comments':    out(await GET('/api/nexcel/comments'));          break
    case 'add-comment':     out(await POST('/api/nexcel/comments', data));   break
    case 'delete-comment':  out(await DEL(`/api/nexcel/comments/${rest[0]}`)); break
    case 'get-mode':        out(await GET('/api/nexcel/access-mode'));       break
    case 'set-mode':        out(await PUT('/api/nexcel/access-mode', { mode: rest[0] ?? data?.mode })); break
    default:
      console.error(`Unknown nexcel command: ${sub}\nRun 'kasumi --help' for usage.`)
      process.exit(1)
  }
  process.exit(0)
}

// ── wordo ─────────────────────────────────────────────────────────────────────
if (cmd === 'wordo') {
  switch (sub) {
    case 'state':            out(await GET('/api/wordo/state'));            break
    case 'get-document':     out(await GET('/api/wordo/document'));         break
    case 'get-markdown': {
      const r = await fetch(`${BASE}/api/wordo/document/markdown`)
      process.stdout.write(await r.text())
      break
    }
    case 'set-title':        out(await PUT('/api/wordo/document', { title: rest.join(' ') })); break
    case 'import-markdown':  out(await PUT('/api/wordo/document/markdown', data));  break
    case 'outline':          out(await GET('/api/wordo/outline'));          break
    case 'insert-block':     out(await POST('/api/wordo/blocks', data));    break
    case 'update-block':     out(await PUT(`/api/wordo/blocks/${rest[0]}`, data)); break
    case 'delete-block':     out(await DEL(`/api/wordo/blocks/${rest[0]}`)); break
    case 'get-comments':     out(await GET('/api/wordo/comments'));         break
    case 'add-comment':      out(await POST('/api/wordo/comments', data));  break
    case 'delete-comment':   out(await DEL(`/api/wordo/comments/${rest[0]}`)); break
    case 'get-changes':      out(await GET('/api/wordo/track-changes'));    break
    case 'accept-changes':   out(await POST('/api/wordo/track-changes/accept', data ?? {})); break
    case 'reject-changes':   out(await POST('/api/wordo/track-changes/reject', data ?? {})); break
    case 'get-mode':         out(await GET('/api/wordo/access-mode'));      break
    case 'set-mode':         out(await PUT('/api/wordo/access-mode', { mode: rest[0] ?? data?.mode })); break
    default:
      console.error(`Unknown wordo command: ${sub}\nRun 'kasumi --help' for usage.`)
      process.exit(1)
  }
  process.exit(0)
}

// ── update-row fix (positional id) ───────────────────────────────────────────
// (handled above via sub detection, this catches fallthrough)
console.error(`Unknown command: ${cmd}\nRun 'kasumi --help' for usage.`)
process.exit(1)
