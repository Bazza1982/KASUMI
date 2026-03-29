# KASUMI MCP Server

Version: **2.0.0** · Protocol: **MCP 2024-11-05** (JSON-RPC 2.0)

The KASUMI MCP server exposes Nexcel (spreadsheet) and Wordo (document) operations to AI agents through the [Model Context Protocol](https://modelcontextprotocol.io/). It runs embedded in the `api-server` process.

---

## Table of Contents

1. [Transport](#transport)
2. [Authentication](#authentication)
3. [Security — Origin Validation](#security--origin-validation)
4. [Session Management](#session-management)
5. [Tools Reference](#tools-reference)
   - [Nexcel — Read](#nexcel--read-tools)
   - [Nexcel — Write](#nexcel--write-tools)
   - [Nexcel — Model](#nexcel--model-tools)
   - [Nexcel — AI-native](#nexcel--ai-native-tools)
   - [Wordo — Read](#wordo--read-tools)
   - [Wordo — Write](#wordo--write-tools)
   - [Wordo — Model](#wordo--model-tools)
   - [Wordo — AI-native](#wordo--ai-native-tools)
   - [Cross-module](#cross-module-tools)
   - [System](#system-tools)
6. [Resources Reference](#resources-reference)
7. [Prompt Templates](#prompt-templates)
8. [Real-time Events (WebSocket)](#real-time-events-websocket)
9. [Error Codes](#error-codes)
10. [Permission Tiers](#permission-tiers)
11. [Audit Log](#audit-log)
12. [Quick-start Examples](#quick-start-examples)

---

## Transport

### HTTP + SSE (primary)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp` | `POST` | Client → Server JSON-RPC messages |
| `/mcp/sse` | `GET` | Server → Client event stream (SSE) |
| `/api/mcp/v1/rpc` | `POST` | Alias for `/mcp` (REST-style clients) |

**Content-Type:** `application/json`

**Session header:** `Mcp-Session-Id: <sessionId>` — returned by the server in the `initialize` response, and expected on all subsequent requests.

#### SSE transport flow

```
1. Client opens GET /mcp/sse
   → Server sends:  event: endpoint
                    data: http://localhost:3001/mcp?sessionId=sse-<id>

2. Client POSTs initialize to the endpoint URI (includes ?sessionId=...)
   → Server responds with protocolVersion + capabilities

3. Client sends notifications/initialized (no id — server returns 202)

4. Client calls tools via POST /mcp?sessionId=...
```

### WebSocket (real-time mutation events)

```
ws://localhost:3001/mcp/events
```

Connected clients receive broadcast events whenever an MCP write tool mutates the Nexcel or Wordo store. See [Real-time Events](#real-time-events-websocket).

---

## Authentication

KASUMI uses API key tiers. Keys are configured via environment variables:

| Env var | Tier granted |
|---------|-------------|
| `KASUMI_READ_KEY` | `read` — all read tools |
| `KASUMI_WRITE_KEY` | `write` — read + write/mutate tools |
| `KASUMI_ADMIN_KEY` | `admin` — all tools including stats/audit |

Pass the key in the request header:

```
X-Kasumi-Key: <your-key>
```

**Dev mode:** If none of the above env vars are set, the server runs in open dev mode — all requests are treated as `admin` regardless of key.

Optionally identify your agent:

```
X-Kasumi-Agent: my-agent-name
```

---

## Security — Origin Validation

All MCP HTTP endpoints and WebSocket connections enforce `Origin` header validation to prevent DNS rebinding attacks.

**Allowed origins:**
- No `Origin` header (non-browser clients, CLI, curl) → always allowed
- `http://localhost:<any port>` and `http://127.0.0.1:<any port>` → always allowed
- Dev mode → all origins allowed
- Additional origins: set `KASUMI_ALLOWED_ORIGINS=https://app.example.com,https://other.example.com`

Requests from unlisted origins receive `HTTP 403` with a JSON-RPC error body.

---

## Session Management

```
initialize  →  Mcp-Session-Id: <id>  (response header)
                ↓
notifications/initialized  (202, no body)
                ↓
tools/call / resources/read / prompts/get  (requires session)
```

- The `Mcp-Session-Id` header is echoed back in the `initialize` HTTP response.
- SSE sessions are created on `GET /mcp/sse` — the session ID is embedded in the endpoint URI.
- Calling `tools/call` or `resources/read` before `initialize` returns error `-32600`.

---

## Tools Reference

Total: **58 tools** (27 Nexcel + 16 Wordo + 2 Cross + 4 System + 5 Nexcel AI + 4 Wordo AI)

Permission tier needed for each tool is shown as `[R]` read, `[W]` write, or `[A]` admin.

---

### Nexcel — Read Tools

Source: `api-server/src/mcp/modules/nexcel/tools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `nexcel_list_sheets` | [R] | List all sheets in the workbook. Returns the active sheet name and ID. |
| `nexcel_read_cell` | [R] | Read a single cell value by A1 notation (e.g. `"C5"`). |
| `nexcel_read_range` | [R] | Read a rectangular range (e.g. `"A1:E20"`). Returns a 2D array of values plus column headers. |
| `nexcel_find_cells` | [R] | Search all cells for a text query. Returns matching references, values, and row context. |
| `nexcel_export_csv` | [R] | Export the entire sheet as a CSV string. |

---

### Nexcel — Write Tools

Source: `api-server/src/mcp/modules/nexcel/writeTools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `nexcel_write_cell` | [W] | Write a value to a single cell. |
| `nexcel_write_range` | [W] | Write a 2D array of values to a range. Anchor is the top-left cell. |
| `nexcel_clear_range` | [W] | Clear all values in a range (does not delete rows/columns). |
| `nexcel_insert_rows` | [W] | Append one or more empty rows to the sheet. |
| `nexcel_delete_rows` | [W] | Delete specific rows by 1-based row number. |
| `nexcel_sort_range` | [W] | Sort all rows by a specified column, ascending or descending. |
| `nexcel_set_format` | [W] | Apply cell formatting: bold, italic, alignment, background color, text color. |
| `nexcel_set_column_width` | [W] | Set column display width in pixels. |
| `nexcel_import_csv` | [W] | Import CSV text, matching columns by header name, appending to existing rows. |
| `nexcel_new_sheet` | [W] | Reset the sheet to a blank 26-column × 100-row workbook. |

All write tools broadcast a `nexcel:*` WebSocket event on success.

---

### Nexcel — Model Tools

Source: `api-server/src/mcp/modules/nexcel/modelTools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `nexcel_set_row_height` | [W] | Set row display height in pixels. |
| `nexcel_freeze_panes` | [W] | Freeze rows/columns. Set both to 0 to unfreeze. |
| `nexcel_merge_cells` | [W] | Merge a rectangular cell range. |
| `nexcel_unmerge_cells` | [W] | Remove a merge by specifying its top-left cell. |
| `nexcel_create_hyperlink` | [W] | Attach a hyperlink URL to a cell, with an optional label. |
| `nexcel_create_named_range` | [W] | Create or update a named range. Names are case-insensitive and unique. |
| `nexcel_delete_named_range` | [W] | Delete a named range by name. |
| `nexcel_get_named_ranges` | [R] | List all named ranges. |
| `nexcel_write_formula` | [W] | Store a formula string in a cell (e.g. `=SUM(A1:A10)`). |
| `nexcel_get_formula` | [R] | Retrieve the formula stored in a cell. |
| `nexcel_rename_sheet` | [W] | Rename the current sheet. |
| `nexcel_get_sheet_meta` | [R] | Get sheet metadata: name, dimensions, frozen panes, merged cells, named ranges. |

---

### Nexcel — AI-native Tools

Source: `api-server/src/mcp/modules/nexcel/aiTools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `nexcel_analyse_sheet` | [R] | Full sheet analysis: row/column counts, type inference, fill rates, numeric stats (min/max/avg), top values. |
| `nexcel_extract_table` | [R] | Extract a range as a structured `{headers, records}` object. Defaults to the full sheet. |
| `nexcel_auto_format_table` | [W] | Auto-size all column widths based on content length. |
| `nexcel_fill_series` | [W] | Detect a linear numeric series and fill downward into empty cells. |
| `nexcel_query_cluster` | [R] | Filter rows by a field value and return summary stats + a sample. |

---

### Wordo — Read Tools

Source: `api-server/src/mcp/modules/wordo/tools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `wordo_read_document` | [R] | Read the full document structure (title, sections, blocks). Supports `format: "json"` or `"markdown"`. |
| `wordo_read_section` | [R] | Read all blocks in a single section by UUID. |
| `wordo_get_outline` | [R] | Get the heading outline hierarchy with block IDs and levels. |
| `wordo_find_text` | [R] | Case-insensitive full-text search across all blocks. Returns matching blocks with context. |

---

### Wordo — Write Tools

Source: `api-server/src/mcp/modules/wordo/tools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `wordo_write_block` | [W] | Update the text of an existing block by UUID. Supports level for headings. |
| `wordo_insert_paragraph` | [W] | Insert a new block (paragraph, heading, list_item, blockquote, code_block, page_break) into a section. |
| `wordo_delete_block` | [W] | Delete a block by UUID. |
| `wordo_replace_text` | [W] | Find-and-replace text across the entire document. Returns replacement count. |
| `wordo_export_markdown` | [R] | Export the document as a Markdown string. |
| `wordo_import_markdown` | [W] | Replace the entire document by importing Markdown text. |
| `wordo_set_title` | [W] | Set the document title. |

All write tools broadcast a `wordo:*` WebSocket event on success.

---

### Wordo — Model Tools

Source: `api-server/src/mcp/modules/wordo/modelTools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `wordo_set_page_style` | [W] | Set page size (`A4`, `A3`, `Letter`, `Legal`), orientation, and margins for a section. |
| `wordo_append_section` | [W] | Append a new section, optionally after a specified section UUID. |
| `wordo_delete_section` | [W] | Delete a section. The last section cannot be deleted. |
| `wordo_insert_nexcel_embed` | [W] | Insert a Nexcel embed block (snapshot or live link) into a section. |

---

### Wordo — AI-native Tools

Source: `api-server/src/mcp/modules/wordo/aiTools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `wordo_analyse_document` | [R] | Document analysis: word count, block type breakdown, heading hierarchy depth, table and embed counts. |
| `wordo_extract_tables` | [R] | Return all `TableBlock` objects as structured `{headers, rows}` arrays. |
| `wordo_generate_outline` | [R] | Build a hierarchical outline from heading blocks, optionally capped at a `maxDepth`. |
| `wordo_normalise_styles` | [W] | Collapse heading level gaps so the hierarchy starts at H1 and is continuous. |
| `wordo_extract_action_items` | [R] | Find blocks matching TODO / ACTION / FIXME / `[ ]` / ☐ patterns and return their locations. |

---

### Cross-module Tools

Source: `api-server/src/mcp/modules/cross/tools.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `kasumi_wordo_table_to_nexcel` | [W] | Convert a Wordo `TableBlock` into Nexcel rows. Headers are matched to Nexcel field names (case-insensitive). |
| `kasumi_nexcel_to_wordo_table` | [W] | Snapshot Nexcel rows as a `TableBlock` inserted into a Wordo section. Static — not a live link. |

---

### System Tools

Source: `api-server/src/mcp/modules/system/index.ts`

| Tool | Permission | Description |
|------|-----------|-------------|
| `system_ping` | [R] | Server health check. Returns version, module list, tool/prompt counts, auth mode. |
| `system_list_tools` | [R] | List all tools, optionally filtered by `module` and/or `includeDeprecated`. |
| `system_get_capabilities` | [R] | Full server inventory: all modules, tools by module, resources, and prompts. |
| `system_get_stats` | [A] | Performance counters + audit summary. Pass `includeAuditLog: true` for the 20 most recent records. |

---

## Resources Reference

Resources are read via `resources/read` with a URI.

| URI | Description |
|-----|-------------|
| `kasumi://nexcel/sheet/1/raw` | Full cell grid for the current Nexcel sheet (JSON) |
| `kasumi://nexcel/sheet/1/columns` | Column definitions (field metadata) for the current sheet |
| `kasumi://wordo/document/1/raw` | Full document JSON (title, sections, blocks) |
| `kasumi://wordo/document/1/markdown` | Current document exported as Markdown |
| `kasumi://wordo/document/1/outline` | Heading outline of the document |

---

## Prompt Templates

Prompts are built via `prompts/get` with a name and optional arguments. Each prompt returns a `messages` array suitable for passing directly to an LLM.

| Name | Module | Arguments | Description |
|------|--------|-----------|-------------|
| `analyse_sheet` | system | `question?` | Prompt for LLM to analyse the current Nexcel sheet. |
| `generate_formula` | system | `task` *(required)*, `targetField?` | Prompt for LLM to write a spreadsheet formula. |
| `summarise_document` | system | `style?` (`brief`/`detailed`/`bullets`) | Prompt for LLM to summarise the current Wordo document. |
| `improve_document` | system | `focus?` (`clarity`/`structure`/`tone`/`completeness`) | Prompt for LLM to review and suggest document improvements. |
| `data_report` | system | `reportTitle?`, `audience?` | Prompt for LLM to generate a written report from Nexcel data. |

---

## Real-time Events (WebSocket)

Connect to `ws://localhost:3001/mcp/events`. Each message is a JSON object:

```json
{ "event": "nexcel:cells_updated", "data": { "sheetId": "1" }, "ts": 1711234567890 }
```

### Nexcel events

| Event | Trigger |
|-------|---------|
| `nexcel:cells_updated` | Any cell value written |
| `nexcel:rows_inserted` | `nexcel_insert_rows` or `nexcel_import_csv` |
| `nexcel:rows_deleted` | `nexcel_delete_rows` |
| `nexcel:sheet_sorted` | `nexcel_sort_range` |
| `nexcel:format_updated` | `nexcel_set_format` |
| `nexcel:column_width_changed` | `nexcel_set_column_width` or `nexcel_auto_format_table` |
| `nexcel:sheet_reset` | `nexcel_new_sheet` |

### Wordo events

| Event | Trigger |
|-------|---------|
| `wordo:block_updated` | `wordo_write_block` |
| `wordo:block_inserted` | `wordo_insert_paragraph`, `wordo_insert_nexcel_embed`, `kasumi_nexcel_to_wordo_table` |
| `wordo:block_deleted` | `wordo_delete_block` |
| `wordo:content_updated` | `wordo_replace_text`, `wordo_set_title`, `wordo_set_page_style`, `wordo_normalise_styles`, section operations |
| `wordo:document_replaced` | `wordo_import_markdown` |

---

## Error Codes

| Code | Name | Meaning |
|------|------|---------|
| `-32700` | Parse error | Request body is not valid JSON |
| `-32600` | Invalid Request | Malformed JSON-RPC (missing `id`, `jsonrpc`, or `method`; also used for pre-initialize calls) |
| `-32601` | Method not found | Unknown MCP method or tool name |
| `-32602` | Invalid params | Missing required params (e.g. `params.name`) |
| `-32603` | Internal error | Unexpected server-side exception |
| `-32000` | Not found | Resource URI or prompt name not found |
| `-32001` | Permission denied | Key not provided, invalid, or insufficient tier |
| `-32002` | Invalid argument | Tool-level argument validation failed |
| `-32003` | Conflict | Duplicate registration (e.g. named range already exists) |
| `-32004` | Rate limited | Request rate limit exceeded |
| `-32005` | Upstream error | Dependency failure |

---

## Permission Tiers

| Tier | What it can do |
|------|---------------|
| `read` | All read tools, `tools/list`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get` |
| `write` | Everything in `read`, plus all write/mutate tools and cross-module tools |
| `admin` | Everything in `write`, plus `system_get_stats` (audit log access) |

Tool-to-tier mapping is enforced in `api-server/src/mcp/auth.ts` via prefix matching:

- `nexcel_write_*`, `nexcel_clear_*`, `nexcel_insert_*`, `nexcel_delete_*`, `nexcel_sort_*`, `nexcel_set_*`, `nexcel_new_*`, `nexcel_auto_format_*`, `nexcel_fill_*`, `nexcel_freeze_*`, `nexcel_merge_*`, `nexcel_unmerge_*`, `nexcel_create_*`, `nexcel_rename_*`, `nexcel_write_formula` → **write**
- `wordo_write_*`, `wordo_insert_*`, `wordo_delete_*`, `wordo_replace_*`, `wordo_import_*`, `wordo_set_*`, `wordo_append_*`, `wordo_normalise_*` → **write**
- `kasumi_*` → **write**
- `system_get_stats` → **admin**
- Everything else → **read**

---

## Audit Log

Every `tools/call` invocation is recorded in an in-memory ring buffer (max 1000 entries):

```json
{
  "id": "aud-42",
  "timestamp": "2026-03-29T10:14:00.000Z",
  "sessionId": "http-1711234567",
  "agentId": "my-agent",
  "toolName": "nexcel_write_cell",
  "argsSummary": "sheetId=1, cell=A1, value=hello",
  "outcome": "success",
  "durationMs": 3
}
```

Retrieve via `system_get_stats` (admin tier required) with `includeAuditLog: true`.

---

## Quick-start Examples

### 1 — Initialize a session

```http
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "my-agent", "version": "1.0.0" }
  }
}
```

Response includes `Mcp-Session-Id: http-<timestamp>` header. Use this on all subsequent requests.

---

### 2 — List tools

```http
POST /mcp
Content-Type: application/json
Mcp-Session-Id: http-1711234567

{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
```

---

### 3 — Read a cell

```http
POST /mcp
Content-Type: application/json
Mcp-Session-Id: http-1711234567

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "nexcel_read_cell",
    "arguments": { "sheetId": "1", "cell": "B2" }
  }
}
```

---

### 4 — Analyse the sheet (AI-native)

```http
POST /mcp
Content-Type: application/json
Mcp-Session-Id: http-1711234567

{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "nexcel_analyse_sheet",
    "arguments": { "sheetId": "1" }
  }
}
```

---

### 5 — Build a prompt for LLM analysis

```http
POST /mcp
Content-Type: application/json
Mcp-Session-Id: http-1711234567

{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "prompts/get",
  "params": {
    "name": "analyse_sheet",
    "arguments": { "question": "Which assignees have the most overdue tasks?" }
  }
}
```

The `messages` array in the response can be passed directly to any OpenAI-compatible chat API.

---

### 6 — Cross-module: copy Nexcel data into a Wordo document

```http
POST /mcp  (Mcp-Session-Id + X-Kasumi-Key: <write-key>)

{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "kasumi_nexcel_to_wordo_table",
    "arguments": {
      "sheetId": "1",
      "documentId": "1",
      "sectionId": "<uuid>",
      "maxRows": 20
    }
  }
}
```

---

## File Locations

```
api-server/src/mcp/
├── types.ts              — JSON-RPC + MCP type definitions
├── ToolRegistry.ts       — Central tool store
├── ResourceRegistry.ts   — Central resource store
├── PromptRegistry.ts     — Central prompt store
├── router.ts             — HTTP handler (POST /mcp, GET /mcp/sse)
├── server.ts             — Bootstrap (registers all modules)
├── auth.ts               — Permission tiers + key resolution
├── audit.ts              — Ring-buffer audit logger
├── stats.ts              — Performance counters
├── originCheck.ts        — DNS rebinding protection
├── services/
│   └── WsServer.ts       — WebSocket broadcast server
└── modules/
    ├── nexcel/
    │   ├── tools.ts       — 5 read tools
    │   ├── writeTools.ts  — 10 write tools
    │   ├── modelTools.ts  — 12 model tools
    │   ├── aiTools.ts     — 5 AI-native tools
    │   ├── resources.ts   — 2 resources
    │   └── a1.ts          — A1 notation utilities
    ├── wordo/
    │   ├── tools.ts       — 11 read+write tools
    │   ├── modelTools.ts  — 4 model tools
    │   ├── aiTools.ts     — 5 AI-native tools
    │   └── resources.ts   — 3 resources
    ├── cross/
    │   └── tools.ts       — 2 cross-module tools
    └── system/
        ├── index.ts       — 4 system tools
        └── prompts.ts     — 5 prompt templates
```
