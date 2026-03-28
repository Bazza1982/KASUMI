# Kasumi MCP Server — Complete Design & Implementation Plan

**Document version:** 1.1
**Date:** 2026-03-29
**Status:** Revised pending implementation — see roadmap revision notes below
**Owner:** Barry Li

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-03-29 | Barry Li | Initial design |
| 1.1 | 2026-03-29 | Lin Yueru (ajiao) review → Barry Li | Added Phase 0 (state authority); moved MCP protocol compliance to Phase 1; annotated tools by current vs future model support; separated Semantic Parser into standalone workstream |

### Reviewer Notes (ajiao, 2026-03-29)

> 整体方向认同：统一 Kasumi MCP Server、模块注册、AI-native 语义层，这些都值得保留。以下四点建议已纳入 v1.1：
> 1. 协议合规提前 — `initialize`、capabilities、标准 transport 移到 Phase 1，不要放后期
> 2. 补 Phase 0 — 先解决前端本地 store 和 api-server store 双状态源问题，MCP 需要有一个权威状态
> 3. 第一批 tools 只承诺当前数据模型真实支持的能力，workbook/formula/named range 等未来模型标注清楚
> 4. 语义解析单独立项，底层模型稳定后再做

---

## Table of Contents

1. [Vision & Motivation](#1-vision--motivation)
2. [Core Concepts](#2-core-concepts)
3. [Why a Unified Kasumi MCP Server](#3-why-a-unified-kasumi-mcp-server)
4. [Architecture Overview](#4-architecture-overview)
5. [Tool Registry — Extensibility Pattern](#5-tool-registry--extensibility-pattern)
6. [Semantic Sheet Parser](#6-semantic-sheet-parser)
7. [Complete Tool Specification — Nexcel](#7-complete-tool-specification--nexcel)
8. [Complete Tool Specification — Wordo](#8-complete-tool-specification--wordo)
9. [Complete Resource Specification](#9-complete-resource-specification)
10. [System Tools](#10-system-tools)
11. [API Endpoint Design](#11-api-endpoint-design)
12. [LLM Integration — HASHI API](#12-llm-integration--hashi-api)
13. [Caching Strategy](#13-caching-strategy)
14. [Real-time Broadcasting](#14-real-time-broadcasting)
15. [Versioning & Backward Compatibility](#15-versioning--backward-compatibility)
16. [Adding a New Module — Developer Guide](#16-adding-a-new-module--developer-guide)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [File & Directory Structure](#18-file--directory-structure)

---

## 1. Vision & Motivation

### The Problem with Current Nexcel / Wordo

Nexcel and Wordo are currently built as human-facing UIs over a relational data model. This works for simple structured data, but misses the fundamental reality of how people actually use spreadsheets and documents in practice:

- A real Excel workpaper is not one table. It is a collection of **semantic clusters** — headers, free-text paragraphs, mini-tables, footnotes, hyperlinks, and annotations — arranged spatially for human readability.
- A real Word document is similarly heterogeneous — sections have different purposes, some contain tables, some are prose, some are boilerplate.

Traditional relational databases cannot comprehend these structures. Nexcel and Wordo should not pretend otherwise.

### The Strategic Reframe

> **Nexcel and Wordo are not replacements for Excel and Word. They are AI-native processing environments. Humans may still do their work in Excel and Word — they open files in Kasumi when AI needs to act on them.**

This changes everything about what the system needs to expose. Instead of a CRUD API for human interaction, Kasumi needs a **semantic interface for AI agents** — one that:

- Automatically understands the structure of whatever is loaded, without the user having to describe it
- Allows AI agents to perform the full range of operations a human could perform
- Is self-describing (AI agents can discover what operations are available)
- Is versioned and extensible as Kasumi grows

### What Is MCP?

Model Context Protocol (MCP) is a standard interface between AI agents and data/tool providers. An MCP server exposes three primitives:

| Primitive | Purpose |
|---|---|
| **Resources** | Structured data the AI can read |
| **Tools** | Functions the AI can invoke |
| **Prompts** | Reusable prompt templates |

Kasumi implements a full MCP server covering all three, across all its modules.

---

## 2. Core Concepts

### Semantic Map

A **Semantic Map** is the structured output of the Semantic Sheet Parser applied to a Nexcel sheet. It describes:

- The number and types of information clusters present
- The cell range each cluster occupies
- The inferred purpose of each cluster (table, heading, narrative text, footnote, reference, etc.)
- The inferred headers of any tabular clusters
- The document type (workpaper, financial model, data register, etc.)

The Semantic Map is the primary context artifact injected into any AI task involving a Nexcel document.

### Semantic Context (Wordo equivalent)

A **Semantic Context** is the structural outline of a Wordo document:

- Section tree (headings and their nesting level)
- Section types (prose, table-containing, list, etc.)
- Named anchors and cross-references
- Embedded Nexcel objects and their locations

### Cell Hash

A **Cell Hash** is a SHA-256 digest of the current cell data of a sheet. It is used as the cache key for Semantic Maps — if the hash has not changed since the last parse, the cached Semantic Map is returned without re-running the LLM.

### Object Artifact

An **Object Artifact** is any Kasumi entity that can be referenced by an AI agent — a Nexcel sheet, a Wordo document, a named range, an embedded table, etc. Each artifact has an `objectId` registered in the platform Object Registry.

---

## 3. Why a Unified Kasumi MCP Server

The decision to combine Nexcel and Wordo (and all future modules) into a single MCP server, rather than separate servers per module, is based on the following:

### Arguments for Unification

**Cross-module operations are first-class.**
Real workflows involve both modules simultaneously. Example: "Read the testing results table from this Wordo audit workpaper and verify them against the underlying data in the attached Nexcel file." This operation requires a single agent to query both modules in one coherent task. With separate MCP servers, the agent must manage two connections and coordinate responses itself. With a unified server, the agent makes a single call.

**Shared infrastructure is built once.**
Authentication, caching, WebSocket broadcasting, rate limiting, logging, and LLM API integration are implemented once and reused across all modules.

**Self-description scales naturally.**
When an AI agent calls `tools/list`, it receives all available tools from all modules in one response. Adding a new module (e.g., Kasumi Calendar) means its tools automatically appear in the next `tools/list` response.

**Namespace isolation prevents collision without requiring separation.**
All tools are prefixed with their module name (`nexcel_*`, `wordo_*`, `system_*`). All resources use URI namespacing (`kasumi://nexcel/...`, `kasumi://wordo/...`). There is no risk of naming conflicts.

### Namespace Design

```
Resources:
  kasumi://nexcel/sheet/{sheetId}/...
  kasumi://wordo/document/{docId}/...
  kasumi://system/workbook/{workbookId}/...
  kasumi://system/registry/...

Tool names:
  nexcel_{operation}     e.g. nexcel_read_range, nexcel_write_cell
  wordo_{operation}      e.g. wordo_read_section, wordo_insert_block
  system_{operation}     e.g. system_list_workbooks, system_new_sheet
```

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent / HASHI Workflow                 │
└───────────────────────────┬─────────────────────────────────┘
                            │  MCP protocol (JSON-RPC 2.0)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Kasumi MCP Server                          │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  MCP Router │  │ Tool Registry│  │  Resource Registry │ │
│  │  /mcp/v1/*  │  │  (dynamic)   │  │  (dynamic)         │ │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                │                     │             │
│  ┌──────▼──────────────────────────────────────▼──────────┐ │
│  │              Module Handlers                            │ │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐│ │
│  │  │  Nexcel Handler  │  │      Wordo Handler           ││ │
│  │  │  nexcel_*        │  │      wordo_*                 ││ │
│  │  └────────┬─────────┘  └──────────────┬───────────────┘│ │
│  └───────────┼─────────────────────────────┼───────────────┘ │
│              │                             │                  │
│  ┌───────────▼─────────────────────────────▼───────────────┐ │
│  │              Shared Services                             │ │
│  │  ┌────────────┐ ┌──────────┐ ┌────────────────────────┐│ │
│  │  │Semantic    │ │ Cache    │ │  HASHI LLM API Client  ││ │
│  │  │Parser      │ │ Manager  │ │  (OpenAI-compatible)   ││ │
│  │  └────────────┘ └──────────┘ └────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │  Internal API calls
                            ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ nexcelStore  │    │  wordoStore      │    │  Object Registry│
└──────────────┘    └──────────────────┘    └─────────────────┘
                            │
                            │  WebSocket broadcast
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Kasumi Frontend (real-time update)              │
│   Human sees AI edits appearing live in the UI              │
└─────────────────────────────────────────────────────────────┘
```

### Request Lifecycle (AI Write Operation)

```
1. AI agent calls: nexcel_write_range(sheetId, "B2:D5", [[...]])
2. MCP Router receives JSON-RPC call, routes to Nexcel Handler
3. Nexcel Handler validates params (sheetId exists, range valid, not read-only)
4. Nexcel Handler writes to nexcelStore
5. Cache Manager invalidates Semantic Map for this sheetId (cell hash changed)
6. WebSocket broadcasts cell-update event to frontend
7. Frontend re-renders affected cells in real time
8. MCP Server returns { success: true, affectedCells: 12, newCellHash: "sha256:..." }
```

---

## 5. Tool Registry — Extensibility Pattern

The Tool Registry is the mechanism by which new modules can add their tools to the MCP server without modifying the server's core code.

### Interface Definition

```typescript
// api-server/src/mcp/types.ts

export interface McpToolDefinition {
  name: string                    // Unique tool name, e.g. "nexcel_write_cell"
  module: string                  // Owner module, e.g. "nexcel"
  version: string                 // Semver, e.g. "1.0.0"
  description: string             // Plain-English description for AI agent
  inputSchema: JSONSchema         // JSON Schema for parameters
  outputSchema: JSONSchema        // JSON Schema for return value
  handler: McpToolHandler         // Implementation function
  deprecated?: boolean            // If true, tool still works but is flagged
  replacedBy?: string             // Name of replacement tool
  requiresAuth?: boolean          // Default: true
  readOnly?: boolean              // Hint: this tool does not mutate state
}

export type McpToolHandler = (
  params: Record<string, unknown>,
  context: McpRequestContext
) => Promise<McpToolResult>

export interface McpRequestContext {
  agentId?: string                // Identifier of the calling agent
  sessionId?: string
  llmClient: LlmApiClient        // Pre-configured HASHI API client
  nexcelStore: NexcelStore
  wordoStore: WordoStore
  wsServer: WebSocketServer      // For broadcasting updates
}

export interface McpToolResult {
  success: boolean
  data?: unknown
  error?: string
  metadata?: Record<string, unknown>
}
```

### Registry Implementation

```typescript
// api-server/src/mcp/ToolRegistry.ts

class ToolRegistry {
  private tools = new Map<string, McpToolDefinition>()

  register(tool: McpToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`)
    }
    this.tools.set(tool.name, tool)
  }

  registerModule(module: string, tools: McpToolDefinition[]): void {
    tools.forEach(t => this.register({ ...t, module }))
  }

  list(includeDeprecated = false): McpToolDefinition[] {
    return [...this.tools.values()]
      .filter(t => includeDeprecated || !t.deprecated)
  }

  get(name: string): McpToolDefinition | undefined {
    return this.tools.get(name)
  }
}

export const toolRegistry = new ToolRegistry()
```

### Module Registration Pattern

```typescript
// api-server/src/mcp/modules/nexcel/index.ts

import { toolRegistry } from '../../ToolRegistry'
import { nexcelTools } from './tools'

toolRegistry.registerModule('nexcel', nexcelTools)

// ─────────────────────────────────────────────
// api-server/src/mcp/server.ts  (bootstrap)

import './modules/nexcel'    // registers nexcel tools
import './modules/wordo'     // registers wordo tools
// Future: import './modules/calendar'
//         import './modules/canvas'
```

Adding a new module requires:
1. Create `api-server/src/mcp/modules/{module}/tools.ts`
2. Add one import line to `server.ts`
3. Nothing else changes

---

## 6. Semantic Sheet Parser

The Semantic Sheet Parser is the most strategically important component. It converts a raw cell grid into a structured Semantic Map by calling the HASHI LLM API.

### Trigger Conditions

The parser is **not** run continuously. It runs when:

1. An AI task is initiated that references a Nexcel object artifact
2. The cell hash has changed since the last successful parse (cache miss)
3. A tool explicitly requests a fresh parse (`force: true`)

It does **not** run during human editing sessions.

### Input: Cell Grid Serialisation

Before calling the LLM, the parser serialises the sheet into a compact text format that preserves spatial information:

```
[A1] Hashi Shire Council 2025
[A2] Year End Financial Audit Plan  {bold}
[A3] FAB Team 1, prepared by Barry Li
[D3] Workpaper version 1  {italic, color:#FF0000}
[A5] Introduction  {bold}
[A7] Here's some introduction paragraphs
[A9] Plan  {bold}
[A10] Day 1 | [B10] Task | [C10] Responsible Person
[A11] Day 2 | [B11] Task | [C11] XXX
...
[A18] Document from Client | [C18] Audit Testing  {border}
[A19] Ref | [B19] Description | [C19] Testing Performed | [D19] Result  {bold}
[A20] 1 | [B20] Document description | [C20] NSS sampling | [D20] Satisfactory
...
```

Only non-empty cells are included. Format hints are added in `{}` where relevant.

### LLM Prompt

```
System:
You are a spreadsheet semantic analyser. Given a serialised cell grid,
identify all distinct clusters of information. A cluster is a contiguous
or logically grouped set of cells that together express a single semantic
unit (e.g. a document header, a table, a paragraph, a footnote).

For each cluster, output:
- id: unique identifier (c1, c2, ...)
- type: one of [document_header, section_heading, narrative_text, table,
         footnote, hyperlink, calculation, legend, signature_block, other]
- range: Excel-style range, e.g. "A1:D3"
- label: short human-readable description
- inferredHeaders: (for tables only) list of column header strings
- confidence: 0.0–1.0

Also output:
- documentType: overall classification of the document
- language: ISO 639-1 code
- notes: any observations about unusual structure

Respond in JSON only. No explanation text.

User:
{serialised_cell_grid}
```

### Output: Semantic Map

```typescript
interface SemanticMap {
  sheetId: string
  cellHash: string              // SHA-256 of raw cell data at parse time
  parsedAt: string              // ISO 8601
  documentType: string          // e.g. "audit_workpaper", "financial_model"
  language: string              // e.g. "en"
  clusters: SemanticCluster[]
  notes?: string
}

interface SemanticCluster {
  id: string                    // "c1", "c2", ...
  type: ClusterType
  range: string                 // "A1:D3"
  label: string                 // "Audit plan schedule"
  inferredHeaders?: string[]    // For tables: ["Day", "Task", "Person"]
  confidence: number            // 0.0–1.0
}

type ClusterType =
  | 'document_header'
  | 'section_heading'
  | 'narrative_text'
  | 'table'
  | 'footnote'
  | 'hyperlink'
  | 'calculation'
  | 'legend'
  | 'signature_block'
  | 'other'
```

### Cache Design

```typescript
interface SemanticMapCache {
  [sheetId: string]: {
    map: SemanticMap
    cellHash: string
    expiresAt: number          // Unix ms — hard expiry regardless of hash
  }
}

// Cache is valid when:
// 1. Entry exists for sheetId
// 2. cellHash matches current sheet hash
// 3. expiresAt has not passed (max 1 hour)
```

---

## 7. Complete Tool Specification — Nexcel

All Nexcel tools are prefixed `nexcel_`. Parameters and return types are JSON Schema.

### Read Group

#### `nexcel_read_cell`
Read the value, formula, and format of a single cell.
```
Input:  { sheetId: string, ref: string }          // ref: "B4"
Output: { value: unknown, formula: string|null, format: CellFormat|null }
```

#### `nexcel_read_range`
Read all cells in a range.
```
Input:  { sheetId: string, range: string }         // range: "A1:D10"
Output: { cells: Cell[][], rowCount: number, colCount: number }
```

#### `nexcel_find_cells`
Search for cells matching a value or pattern.
```
Input:  { sheetId: string, query: string, matchType: "exact"|"contains"|"regex" }
Output: { matches: { ref: string, value: unknown }[] }
```

#### `nexcel_get_formula`
Get the formula string of a cell (without evaluating).
```
Input:  { sheetId: string, ref: string }
Output: { formula: string | null }
```

#### `nexcel_read_semantic_map`
Get the Semantic Map for a sheet. Runs the parser if cache is stale.
```
Input:  { sheetId: string, force?: boolean }
Output: SemanticMap
```

#### `nexcel_read_cluster`
Get the raw cell data within a specific semantic cluster.
```
Input:  { sheetId: string, clusterId: string }
Output: { cluster: SemanticCluster, cells: Cell[][] }
```

#### `nexcel_list_sheets`
List all sheets in the current workbook.
```
Input:  {}
Output: { sheets: { id: string, name: string, order: number }[] }
```

#### `nexcel_get_named_ranges`
List all named ranges in a sheet.
```
Input:  { sheetId: string }
Output: { namedRanges: { name: string, range: string }[] }
```

---

### Write Group

#### `nexcel_write_cell`
Write a value to a single cell.
```
Input:  { sheetId: string, ref: string, value: unknown }
Output: { success: boolean, newCellHash: string }
```

#### `nexcel_write_range`
Write a 2D array of values to a range, starting from the top-left cell.
```
Input:  { sheetId: string, startRef: string, data: unknown[][] }
Output: { success: boolean, affectedCells: number, newCellHash: string }
```

#### `nexcel_write_formula`
Write a formula string to a cell.
```
Input:  { sheetId: string, ref: string, formula: string }
Output: { success: boolean, computedValue: unknown }
```

#### `nexcel_clear_range`
Clear the contents of a range, preserving formatting.
```
Input:  { sheetId: string, range: string }
Output: { success: boolean, clearedCells: number }
```

#### `nexcel_delete_range`
Delete a range and shift adjacent cells.
```
Input:  { sheetId: string, range: string, shift: "up"|"left" }
Output: { success: boolean }
```

---

### Format Group

#### `nexcel_set_format`
Apply formatting to a range of cells.
```
Input: {
  sheetId: string,
  range: string,
  format: {
    bold?: boolean,
    italic?: boolean,
    fontSize?: number,
    fontColor?: string,          // hex e.g. "#FF0000"
    bgColor?: string,
    align?: "left"|"center"|"right",
    numberFormat?: "general"|"number"|"currency"|"percentage"|"date"|"text",
    wrapText?: boolean,
    border?: "none"|"thin"|"medium"|"thick"
  }
}
Output: { success: boolean }
```

#### `nexcel_merge_cells`
Merge a range of cells into one.
```
Input:  { sheetId: string, range: string }
Output: { success: boolean }
```

#### `nexcel_unmerge_cells`
Unmerge a previously merged range.
```
Input:  { sheetId: string, range: string }
Output: { success: boolean }
```

#### `nexcel_set_column_width`
Set the width of one or more columns.
```
Input:  { sheetId: string, cols: string[], width: number }   // cols: ["A","B"]
Output: { success: boolean }
```

#### `nexcel_set_row_height`
Set the height of one or more rows.
```
Input:  { sheetId: string, rows: number[], height: number }
Output: { success: boolean }
```

#### `nexcel_freeze_panes`
Freeze rows and/or columns.
```
Input:  { sheetId: string, freezeRows: number, freezeCols: number }
Output: { success: boolean }
```

---

### Structure Group

#### `nexcel_insert_rows`
Insert blank rows after a given row index.
```
Input:  { sheetId: string, afterRow: number, count: number }
Output: { success: boolean }
```

#### `nexcel_insert_cols`
Insert blank columns after a given column.
```
Input:  { sheetId: string, afterCol: string, count: number }  // afterCol: "C"
Output: { success: boolean }
```

#### `nexcel_delete_rows`
Delete specific rows by index.
```
Input:  { sheetId: string, rows: number[] }
Output: { success: boolean, deletedCount: number }
```

#### `nexcel_delete_cols`
Delete specific columns.
```
Input:  { sheetId: string, cols: string[] }
Output: { success: boolean, deletedCount: number }
```

#### `nexcel_sort_range`
Sort a range by a column.
```
Input:  { sheetId: string, range: string, byCol: string, direction: "asc"|"desc", hasHeader: boolean }
Output: { success: boolean }
```

---

### Link & Reference Group

#### `nexcel_create_named_range`
Create a named range.
```
Input:  { sheetId: string, name: string, range: string }
Output: { success: boolean }
```

#### `nexcel_delete_named_range`
Delete a named range.
```
Input:  { sheetId: string, name: string }
Output: { success: boolean }
```

#### `nexcel_create_hyperlink`
Add a hyperlink to a cell.
```
Input:  { sheetId: string, ref: string, url: string, label: string }
Output: { success: boolean }
```

#### `nexcel_create_cross_sheet_link`
Link a cell to a cell in another sheet.
```
Input:  { sheetId: string, ref: string, targetSheetId: string, targetRef: string }
Output: { success: boolean }
```

---

### File Operations Group

#### `nexcel_new_sheet`
Create a new blank sheet in the current workbook.
```
Input:  { name?: string }
Output: { sheetId: string, name: string }
```

#### `nexcel_rename_sheet`
Rename a sheet.
```
Input:  { sheetId: string, name: string }
Output: { success: boolean }
```

#### `nexcel_delete_sheet`
Delete a sheet.
```
Input:  { sheetId: string }
Output: { success: boolean }
```

#### `nexcel_duplicate_sheet`
Duplicate a sheet with a new name.
```
Input:  { sheetId: string, newName: string }
Output: { newSheetId: string }
```

#### `nexcel_import_csv`
Import CSV data into a sheet.
```
Input:  { sheetId: string, csv: string, startRef?: string, hasHeader?: boolean }
Output: { success: boolean, rowsImported: number, colsImported: number }
```

#### `nexcel_export_csv`
Export a sheet or range as CSV.
```
Input:  { sheetId: string, range?: string }
Output: { csv: string }
```

#### `nexcel_export_xlsx`
Export the full workbook as XLSX (returns base64).
```
Input:  { workbookId?: string }
Output: { xlsx: string }    // base64 encoded
```

---

### AI-Native Group

#### `nexcel_analyse_sheet`
Force a fresh semantic parse of the sheet. Returns the full Semantic Map.
```
Input:  { sheetId: string }
Output: SemanticMap
```

#### `nexcel_query_cluster`
Ask a natural-language question about a specific semantic cluster.
```
Input:  { sheetId: string, clusterId: string, question: string }
Output: { answer: string, confidence: number, sourceRange: string }
```

#### `nexcel_extract_table`
Extract the data from a table cluster as structured JSON.
```
Input:  { sheetId: string, clusterId: string }
Output: { headers: string[], rows: Record<string, unknown>[], rowCount: number }
```

#### `nexcel_auto_format_table`
Detect a table in a range and apply Excel-standard table formatting automatically.
```
Input:  { sheetId: string, range: string }
Output: { success: boolean, detectedHeaders: string[], formattedRange: string }
```

#### `nexcel_fill_series`
Detect a pattern in a range and fill it forward.
```
Input:  { sheetId: string, sourceRange: string, fillRange: string, pattern?: string }
Output: { success: boolean, filledValues: unknown[] }
```

#### `nexcel_summarise`
Generate a plain-English summary of the entire sheet.
```
Input:  { sheetId: string, maxWords?: number }
Output: { summary: string, clusterCount: number, documentType: string }
```

---

## 8. Complete Tool Specification — Wordo

All Wordo tools are prefixed `wordo_`. The Wordo data model is section-based — each document has one or more `section` objects, each containing ProseMirror content.

### Read Group

#### `wordo_read_document`
Read the full document structure as plain text and metadata.
```
Input:  { docId: string }
Output: { title: string, sections: { id: string, text: string }[], wordCount: number }
```

#### `wordo_read_section`
Read a specific section by ID.
```
Input:  { docId: string, sectionId: string }
Output: { id: string, text: string, html: string, pageStyle: PageStyle }
```

#### `wordo_get_outline`
Get the heading-based outline of the document.
```
Input:  { docId: string }
Output: { outline: { level: number, text: string, sectionId: string }[] }
```

#### `wordo_find_text`
Search for text across all sections.
```
Input:  { docId: string, query: string, caseSensitive?: boolean }
Output: { matches: { sectionId: string, excerpt: string, position: number }[] }
```

#### `wordo_get_semantic_context`
Get the full structural context of the document for AI consumption.
```
Input:  { docId: string }
Output: {
  docType: string,              // "audit_report", "memo", "contract", etc.
  outline: OutlineItem[],
  embeddedNexcelObjects: { objectId: string, sectionId: string, caption: string }[],
  wordCount: number,
  language: string
}
```

#### `wordo_extract_tables`
Extract all tables from the document as structured data.
```
Input:  { docId: string }
Output: { tables: { sectionId: string, headers: string[], rows: Record<string,unknown>[] }[] }
```

---

### Write Group

#### `wordo_write_block`
Replace the content of a specific block (paragraph, heading, etc.) by its position.
```
Input:  { docId: string, sectionId: string, blockIndex: number, content: string }
Output: { success: boolean }
```

#### `wordo_insert_paragraph`
Insert a new paragraph at a specified position in a section.
```
Input:  { docId: string, sectionId: string, afterBlockIndex: number, text: string }
Output: { success: boolean, newBlockIndex: number }
```

#### `wordo_replace_text`
Find and replace text across the document.
```
Input:  { docId: string, find: string, replace: string, caseSensitive?: boolean, all?: boolean }
Output: { success: boolean, replacedCount: number }
```

#### `wordo_append_section`
Append a new page/section to the document.
```
Input:  { docId: string, content?: string, pageStyle?: Partial<PageStyle> }
Output: { newSectionId: string }
```

#### `wordo_delete_section`
Delete a section from the document.
```
Input:  { docId: string, sectionId: string }
Output: { success: boolean }
```

---

### Format Group

#### `wordo_format_block`
Apply character or paragraph formatting to a block.
```
Input: {
  docId: string,
  sectionId: string,
  blockIndex: number,
  format: {
    bold?: boolean,
    italic?: boolean,
    underline?: boolean,
    fontSize?: number,
    color?: string,
    align?: "left"|"center"|"right"|"justify",
    heading?: 1|2|3|4|null
  }
}
Output: { success: boolean }
```

#### `wordo_set_page_style`
Set the page size, orientation, and margins for a section.
```
Input: {
  docId: string,
  sectionId: string,
  pageStyle: {
    size?: "A4"|"Letter"|"Legal",
    orientation?: "portrait"|"landscape",
    margins?: { top: number, bottom: number, left: number, right: number }
  }
}
Output: { success: boolean }
```

---

### Link & Reference Group

#### `wordo_insert_hyperlink`
Insert a hyperlink at a text position.
```
Input:  { docId: string, sectionId: string, blockIndex: number, url: string, label: string }
Output: { success: boolean }
```

#### `wordo_insert_nexcel_embed`
Embed a Nexcel table object into the document.
```
Input:  { docId: string, sectionId: string, afterBlockIndex: number, nexcelObjectId: string, caption?: string }
Output: { success: boolean, embedId: string }
```

---

### File Operations Group

#### `wordo_new_document`
Reset to a new blank document.
```
Input:  {}
Output: { docId: string }
```

#### `wordo_import_markdown`
Import markdown content, replacing the current document.
```
Input:  { markdown: string, title?: string }
Output: { success: boolean, sectionCount: number }
```

#### `wordo_export_markdown`
Export the document as Markdown.
```
Input:  { docId: string }
Output: { markdown: string }
```

#### `wordo_export_pdf`
Trigger PDF export (returns a task ID; PDF generation is async).
```
Input:  { docId: string, sectionIds?: string[] }
Output: { taskId: string }
```

---

### AI-Native Group

#### `wordo_summarise`
Generate a plain-English executive summary of the document.
```
Input:  { docId: string, maxWords?: number }
Output: { summary: string }
```

#### `wordo_classify`
Classify the document type and extract key metadata.
```
Input:  { docId: string }
Output: { docType: string, keyEntities: string[], language: string }
```

#### `wordo_draft_section`
Use the LLM to draft new content for a section, given instructions.
```
Input:  { docId: string, sectionId: string, instructions: string, tone?: string }
Output: { draft: string }    // Returns draft — does NOT auto-insert; AI agent decides
```

---

## 9. Complete Resource Specification

Resources are read-only data endpoints. They use URI-style identifiers.

| URI | Description |
|---|---|
| `kasumi://nexcel/sheets` | List of all available sheets |
| `kasumi://nexcel/sheet/{id}/raw` | Full cell grid (all non-empty cells) |
| `kasumi://nexcel/sheet/{id}/semantic-map` | Semantic Map (cached) |
| `kasumi://nexcel/sheet/{id}/range/{range}` | Cells in a specific range |
| `kasumi://nexcel/sheet/{id}/formats` | All applied cell formats |
| `kasumi://nexcel/sheet/{id}/named-ranges` | Named range definitions |
| `kasumi://wordo/documents` | List of open documents |
| `kasumi://wordo/document/{id}` | Full document as structured JSON |
| `kasumi://wordo/document/{id}/outline` | Heading tree |
| `kasumi://wordo/document/{id}/sections` | List of sections |
| `kasumi://system/registry` | All registered object artifacts |
| `kasumi://system/modules` | All registered modules + their tool counts |

---

## 10. System Tools

System tools operate at the workbook/application level, not module-specific.

#### `system_list_modules`
List all registered modules and their tool counts.
```
Output: { modules: { name: string, toolCount: number, version: string }[] }
```

#### `system_get_object`
Resolve an object artifact by its registry ID.
```
Input:  { objectId: string }
Output: { objectId: string, shell: string, label: string, metadata: unknown }
```

#### `system_list_objects`
List all registered object artifacts.
```
Output: { objects: { objectId: string, shell: string, label: string }[] }
```

---

## 11. API Endpoint Design

All MCP endpoints live under `/api/mcp/v1/`. The protocol is JSON-RPC 2.0.

```
POST /api/mcp/v1/rpc
  Body: JSON-RPC 2.0 request
  → Dispatch to appropriate tool handler

GET  /api/mcp/v1/tools/list
  → List all registered tools (MCP standard endpoint)

GET  /api/mcp/v1/resources/list
  → List all available resources

GET  /api/mcp/v1/resources/read?uri={uri}
  → Read a specific resource

GET  /api/mcp/v1/prompts/list
  → List available prompt templates

GET  /api/mcp/v1/prompts/get?name={name}
  → Get a specific prompt template

GET  /api/mcp/v1/health
  → Server health + registered module list
```

### Standard JSON-RPC 2.0 Tool Call

```json
POST /api/mcp/v1/rpc

Request:
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "tools/call",
  "params": {
    "name": "nexcel_write_range",
    "arguments": {
      "sheetId": "sheet_1",
      "startRef": "B2",
      "data": [["Alice", "Done"], ["Bob", "In Progress"]]
    }
  }
}

Response:
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"affectedCells\":4,\"newCellHash\":\"sha256:abc123\"}"
      }
    ]
  }
}
```

---

## 12. LLM Integration — HASHI API

The Semantic Sheet Parser and all AI-native tools call the LLM via the HASHI API, which is OpenAI-compatible.

### Client Configuration

```typescript
// api-server/src/mcp/services/LlmApiClient.ts

export class LlmApiClient {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor() {
    this.baseUrl = process.env.HASHI_API_URL ?? 'http://localhost:11434/v1'
    this.apiKey  = process.env.HASHI_API_KEY  ?? 'local'
    this.model   = process.env.HASHI_MODEL    ?? 'llama3.2'
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      }),
    })
    const data = await res.json()
    return data.choices[0].message.content
  }
}
```

### Environment Variables

```bash
# .env (api-server)
HASHI_API_URL=http://localhost:11434/v1   # or any OpenAI-compatible endpoint
HASHI_API_KEY=your-key-here
HASHI_MODEL=llama3.2                      # or gpt-4o, claude-3-5-sonnet, etc.
KASUMI_MCP_PORT=3001
```

The LLM is entirely swappable — changing `HASHI_MODEL` and `HASHI_API_URL` is all that is needed to point at a different provider.

---

## 13. Caching Strategy

### Semantic Map Cache

| Property | Value |
|---|---|
| Cache type | In-memory (per server process) |
| Cache key | `{sheetId}:{cellHash}` |
| Invalidation trigger | Cell hash change (any write to the sheet) |
| Hard expiry | 1 hour (even if hash unchanged) |
| Cache miss behaviour | Run parser, store result, return |
| Cache hit behaviour | Return immediately, no LLM call |

### Cell Hash Calculation

The cell hash is computed over the serialised representation of all non-empty cells:

```typescript
function computeCellHash(cells: Cell[]): string {
  const serialised = cells
    .map(c => `${c.ref}:${JSON.stringify(c.value)}`)
    .sort()
    .join('|')
  return sha256(serialised)
}
```

Sorting ensures the hash is stable regardless of cell order in the store.

### Cache Invalidation Flow

```
nexcel_write_cell called
  → nexcelStore.updateCell()
  → computeCellHash(newCellData)
  → if hash !== cache[sheetId].cellHash:
      delete cache[sheetId]
  → next read_semantic_map call will re-parse
```

---

## 14. Real-time Broadcasting

When AI agents make write operations, the Kasumi frontend should reflect those changes in real time so the human user can observe the AI working.

### WebSocket Event Schema

```typescript
interface KasumiWsEvent {
  type: 'nexcel:cells_updated'
       | 'nexcel:format_updated'
       | 'nexcel:sheet_created'
       | 'nexcel:sheet_deleted'
       | 'wordo:content_updated'
       | 'wordo:section_added'
       | 'wordo:section_deleted'
  payload: unknown
  agentId?: string          // Which agent made the change (for attribution UI)
  timestamp: string
}
```

### Broadcasting in Tool Handlers

```typescript
// Example: nexcel_write_range handler

handler: async (params, ctx) => {
  // ... perform write ...

  // Broadcast to all connected frontend clients
  ctx.wsServer.broadcast({
    type: 'nexcel:cells_updated',
    payload: { sheetId: params.sheetId, updatedRefs: affectedRefs },
    agentId: ctx.agentId,
    timestamp: new Date().toISOString(),
  })

  return { success: true, affectedCells: affectedRefs.length }
}
```

The frontend subscribes to WebSocket events and re-renders affected cells without a full reload.

---

## 15. Versioning & Backward Compatibility

### URL Versioning

The MCP API is versioned at the URL level:

```
/api/mcp/v1/...    ← current stable
/api/mcp/v2/...    ← next major version (when schema changes are breaking)
```

Agents that specify `v1` continue to work unchanged even after `v2` is released. Both versions are served simultaneously during a transition period.

### Tool Versioning

Each tool carries a `version` field (`semver`). Tools are never deleted — only deprecated.

```typescript
// Deprecating an old tool:
{
  name: 'nexcel_clear_cells',       // old name
  version: '1.0.0',
  deprecated: true,
  replacedBy: 'nexcel_clear_range', // new name
  handler: async (params, ctx) => {
    // Internally delegate to new tool for backward compat
    return nexcelClearRange(params, ctx)
  }
}
```

Agents using deprecated tools continue to work. The `tools/list` response flags deprecated tools. Agent developers can migrate at their own pace.

### Additive-Only Rule

A new tool version (e.g. `1.1.0`) may only **add** optional parameters. Changing a required parameter, removing a parameter, or changing a return type requires a new tool name (e.g. `nexcel_write_range_v2`).

---

## 16. Adding a New Module — Developer Guide

When a new module is added to Kasumi (e.g., Kasumi Calendar), the following steps add it to the MCP server:

### Step 1: Create the tools file

```typescript
// api-server/src/mcp/modules/calendar/tools.ts

import type { McpToolDefinition } from '../../types'

export const calendarTools: McpToolDefinition[] = [
  {
    name: 'calendar_create_event',
    module: 'calendar',
    version: '1.0.0',
    description: 'Create a new calendar event',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        title:    { type: 'string' },
        start:    { type: 'string', format: 'date-time' },
        end:      { type: 'string', format: 'date-time' },
        attendees: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'start', 'end'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        success: { type: 'boolean' },
      },
    },
    handler: async (params, ctx) => {
      // implementation
    },
  },
  // ... more tools
]
```

### Step 2: Register the module

```typescript
// api-server/src/mcp/server.ts  — add one line:

import './modules/calendar'
```

That is all. The new tools appear automatically in `tools/list`.

### Step 3: Add resources (optional)

```typescript
// api-server/src/mcp/ResourceRegistry.ts

resourceRegistry.register({
  uri: 'kasumi://calendar/events',
  name: 'Calendar Events',
  description: 'All upcoming calendar events',
  handler: async () => { /* ... */ },
})
```

### Step 4: Add semantic context (if applicable)

If the new module produces artifacts that AI agents will analyse, implement a `getSemanticContext(artifactId)` function and register it with the `ContextPipeline`:

```typescript
contextPipeline.registerContextProvider('calendar', async (objectId) => {
  const event = calendarStore.getEvent(objectId)
  return {
    type: 'calendar_event',
    summary: `Event: ${event.title} on ${event.start}`,
    details: event,
  }
})
```

---

## 17. Implementation Roadmap

> **v1.1 revision:** Phase 0 added; MCP protocol compliance moved from Phase 5 into Phase 1; Semantic Parser extracted to standalone workstream; tool deliverables scoped to current data model only.

---

### Phase 0 — Single Source of Truth *(prerequisite for all MCP work)*

**Problem:** Kasumi currently has two independent data stores that can diverge:

- **Frontend** — `MockAdapter` (`frontend/src/modules/excel-shell/adapters/baserow/MockAdapter.ts`) holds its own in-memory rows and fields. It is entirely self-contained and does not read from the API server.
- **API server** — `nexcelStore` (`api-server/src/store/nexcelStore.ts`) holds its own independent rows and fields.

When a human edits a cell in the frontend, `MockAdapter` is updated but `nexcelStore` is not. When an MCP write tool updates `nexcelStore`, the frontend does not see the change. **There is no shared truth.**

The MCP server can only be built reliably on top of a single authoritative state. That authority is `nexcelStore` in the API server.

**Goal:** `api-server/nexcelStore` is the single source of truth. The frontend is a view over it.

| Task | Detail | File(s) |
|---|---|---|
| Audit all frontend→backend data flows | Document every place `MockAdapter` reads/writes and what REST endpoint it should call instead | — |
| Make `MockAdapter` a REST client | Replace hardcoded data with calls to `/api/nexcel/*` endpoints | `MockAdapter.ts` |
| Implement missing REST endpoints | `PUT /api/nexcel/cells/batch` (bulk cell update), `GET /api/nexcel/formats` | `api-server/src/routes/nexcel.ts` |
| Frontend cell commit calls API | `useExcelStore.commitCell()` must write through to API, not just local state | `useExcelStore.ts` |
| WebSocket push for server-initiated changes | Frontend subscribes to `ws://localhost:{PORT}/mcp/events`; any write to `nexcelStore` emits event | `api-server`, `frontend` |
| Acceptance test | Human edits cell → API state updated. API write → frontend reflects change. Both within 200ms. | — |

**Exit criteria:** A change made via `curl POST /api/nexcel/rows/:id` is visible in the frontend grid within one render cycle. A cell edit in the UI is immediately readable via `GET /api/nexcel/data`.

---

### Phase 1 — MCP Server Skeleton + Protocol Compliance + Nexcel Read Tools

**Goal:** A standards-compliant MCP server that any MCP client can connect to, exposing read-only Nexcel tools backed by the now-authoritative `nexcelStore`.

Protocol compliance is front-loaded here, not deferred. A non-compliant MCP server cannot be connected to standard MCP clients (Claude Desktop, HASHI agents, etc.).

#### 1a — MCP Protocol Compliance

| Task | Detail | File(s) |
|---|---|---|
| MCP `initialize` / `initialized` handshake | Server declares `protocolVersion`, `capabilities` (tools, resources, prompts). Client sends `initialize`, server responds, client sends `initialized` notification. | `api-server/src/mcp/router.ts` |
| Capability negotiation | Server advertises: `{ tools: { listChanged: true }, resources: { subscribe: false }, prompts: {} }` | `api-server/src/mcp/router.ts` |
| Standard transport: HTTP+SSE | `POST /mcp` for client→server messages; `GET /mcp/sse` for server→client notifications (MCP standard) | `api-server/src/mcp/transport/http.ts` |
| Standard transport: stdio | For use by local agents and CLI tools | `api-server/src/mcp/transport/stdio.ts` |
| `tools/list` method | Returns full tool manifest from `ToolRegistry` | `router.ts` |
| `tools/call` method | Dispatches to registered handler | `router.ts` |
| `resources/list` method | Returns registered resources | `router.ts` |
| `resources/read` method | Reads a resource by URI | `router.ts` |
| Standard error codes | `-32700` parse error, `-32600` invalid request, `-32601` method not found, tool-level errors | `router.ts` |
| JSON-RPC 2.0 batch requests | Handle array of requests | `router.ts` |

#### 1b — Core Infrastructure

| Task | File(s) |
|---|---|
| Define `McpToolDefinition`, `McpRequestContext`, `McpToolResult` interfaces | `api-server/src/mcp/types.ts` |
| Implement `ToolRegistry` | `api-server/src/mcp/ToolRegistry.ts` |
| Implement `ResourceRegistry` | `api-server/src/mcp/ResourceRegistry.ts` |
| Environment variables + `.env.example` | `api-server/.env.example` |
| Mount `/mcp` routes + `POST /api/mcp/v1/rpc` alias | `api-server/src/index.ts` |

#### 1c — Nexcel Read Tools *(current model only)*

Only tools that `nexcelStore` can service today, with no model changes required.

| Tool | Deliverable |
|---|---|
| `nexcel_read_cell` | ✅ |
| `nexcel_read_range` | ✅ |
| `nexcel_find_cells` | ✅ |
| `nexcel_list_sheets` | ✅ (single simulated sheet; returns `[{ id: "1", name: "Sheet 1" }]`) |
| `nexcel_export_csv` | ✅ (maps to existing `nexcelStore.exportCsv()`) |

**Deliverable:** Any MCP-compliant client (e.g. Claude Desktop with MCP config) can connect, call `tools/list`, and call `nexcel_read_range` to retrieve live cell data.

---

### Phase 2 — Nexcel Write + Format + Real-time Frontend Sync

**Goal:** AI agents can modify the spreadsheet and the human user sees changes in real time.

Depends on Phase 0 (single source of truth) being complete.

| Task | File(s) |
|---|---|
| WebSocket broadcast server | `api-server/src/mcp/services/WsServer.ts` |
| Frontend WebSocket listener hook | `frontend/src/platform/mcp/useMcpEvents.ts` |
| Frontend: re-render on `nexcel:cells_updated` | `VirtualGrid.tsx` |
| `nexcel_write_cell` | ✅ current model |
| `nexcel_write_range` | ✅ current model |
| `nexcel_clear_range` | ✅ current model |
| `nexcel_delete_rows` | ✅ current model |
| `nexcel_insert_rows` | ✅ current model |
| `nexcel_sort_range` | ✅ current model |
| `nexcel_set_format` (bold/italic/color/align) | ✅ current model — maps to `useCellFormatStore` |
| `nexcel_set_column_width` | ✅ current model — maps to `colWidths` |
| `nexcel_import_csv` | ✅ current model |
| `nexcel_new_sheet` | ✅ current model — calls `newSheet()` / `reset-blank` |

**Deliverable:** Agent writes a 5×3 table of data via `nexcel_write_range`; human sees it appear in the grid in real time.

---

### Phase 3 — Wordo Support

**Goal:** AI agents can read and write Wordo documents.

| Task | File(s) |
|---|---|
| Implement Wordo REST adapter (mirror of Nexcel's pattern) | `api-server/src/mcp/modules/wordo/` |
| `wordo_read_document` | ✅ current model |
| `wordo_read_section` | ✅ current model |
| `wordo_get_outline` | ✅ current model |
| `wordo_find_text` | ✅ current model |
| `wordo_write_block` | ✅ current model |
| `wordo_insert_paragraph` | ✅ current model |
| `wordo_replace_text` | ✅ current model |
| `wordo_export_markdown` | ✅ current model — existing endpoint |
| `wordo_import_markdown` | ✅ current model — existing endpoint |
| Frontend: re-render on `wordo:content_updated` | `WordoShellRoute.tsx` |

---

### Phase 4 — Model Upgrades + Extended Tool Surface

**Goal:** Expand the data model to support capabilities not yet implemented, then expose them as tools.

This phase is scoped separately because it requires changes to `nexcelStore` schema, not just tool wiring.

| Model Upgrade | Tools Unlocked |
|---|---|
| Add `colWidths`, `rowHeights` persistence to `nexcelStore` | `nexcel_set_row_height` |
| Add `frozenRows`, `frozenCols` to `nexcelStore` | `nexcel_freeze_panes` |
| Add `mergedCells[]` to `nexcelStore` | `nexcel_merge_cells`, `nexcel_unmerge_cells` |
| Add `hyperlinks` map to `nexcelStore` | `nexcel_create_hyperlink` |
| Add `namedRanges[]` to `nexcelStore` | `nexcel_create_named_range`, `nexcel_delete_named_range`, `nexcel_get_named_ranges` |
| Add `workbook` concept (multiple sheets) | `nexcel_duplicate_sheet`, `nexcel_delete_sheet`, `nexcel_rename_sheet`, `nexcel_reorder_sheets` |
| Add formula evaluation engine | `nexcel_write_formula`, `nexcel_get_formula` |
| Wordo `wordo_set_page_style` | Already in model — wire up |
| Wordo `wordo_insert_nexcel_embed` | Already in model — wire up |
| Wordo `wordo_append_section`, `wordo_delete_section` | Already in model — wire up |

---

### Phase 5 — Hardening + Auth + Integration Tests

**Goal:** Production-readiness. Authentication, rate limiting, full test coverage.

| Task | Notes |
|---|---|
| Authentication middleware | API key header (`X-Kasumi-Key`) or OAuth token |
| Per-agent rate limiting | Max N tool calls per minute |
| Full OpenAPI spec for REST alias endpoints | For non-MCP clients |
| Integration test suite | One test per tool, covering happy path + error path |
| `tools/list` pagination | For when tool count grows large |
| Graceful shutdown + reconnection handling | For long-running agent sessions |

---

### Separate Workstream — Semantic Sheet Parser

> Per ajiao review: the Semantic Parser depends on a stable data model and a reliable single source of truth. It is scoped as a separate workstream that begins only after Phase 0 and Phase 1 are complete.

**Prerequisite:** Phase 0 complete (authoritative `nexcelStore`), Phase 1 complete (MCP server live, `nexcel_read_range` working).

**Scope:**
- `SemanticSheetParser` service: cell grid → HASHI LLM API call → `SemanticMap`
- `CacheManager`: hash-based invalidation, 1-hour hard expiry
- `LlmApiClient`: OpenAI-compatible, points at `HASHI_API_URL`
- Tools: `nexcel_read_semantic_map`, `nexcel_read_cluster`, `nexcel_analyse_sheet`
- Resources: `kasumi://nexcel/sheet/{id}/semantic-map`

**Not in scope (future):** `nexcel_query_cluster`, `nexcel_auto_format_table`, `nexcel_fill_series`, `wordo_summarise`, `wordo_classify`, `wordo_draft_section` — these require the Semantic Parser to be stable first, and are further deferred.

See separate planning document (to be created): `KASUMI_SEMANTIC_PARSER_PLAN.md`

---

## 18. File & Directory Structure

```
api-server/
└── src/
    ├── mcp/
    │   ├── types.ts                    ← Core interfaces
    │   ├── router.ts                   ← JSON-RPC 2.0 dispatcher
    │   ├── ToolRegistry.ts             ← Tool registration + lookup
    │   ├── ResourceRegistry.ts         ← Resource registration + lookup
    │   ├── server.ts                   ← Bootstrap: imports all modules
    │   ├── services/
    │   │   ├── LlmApiClient.ts         ← HASHI API (OpenAI-compatible)
    │   │   ├── SemanticSheetParser.ts  ← Cell grid → SemanticMap
    │   │   ├── CacheManager.ts         ← Hash-based cache
    │   │   ├── WsServer.ts             ← WebSocket broadcast
    │   │   └── ContextPipeline.ts      ← Auto-inject context for AI tasks
    │   └── modules/
    │       ├── nexcel/
    │       │   ├── index.ts            ← Registers nexcel tools
    │       │   ├── tools.ts            ← All nexcel_* tool definitions
    │       │   └── aiTools.ts          ← AI-native nexcel tools
    │       ├── wordo/
    │       │   ├── index.ts
    │       │   ├── tools.ts
    │       │   └── aiTools.ts
    │       └── system/
    │           ├── index.ts
    │           └── tools.ts
    ├── routes/
    │   ├── nexcel.ts                   ← Existing REST API (unchanged)
    │   ├── wordo.ts                    ← Existing REST API (unchanged)
    │   └── mcp.ts                      ← Mounts /api/mcp/v1/*
    ├── store/
    │   ├── nexcelStore.ts
    │   └── wordoStore.ts
    └── index.ts                        ← App entry point

frontend/
└── src/
    └── platform/
        └── mcp/
            └── useMcpEvents.ts         ← WebSocket listener hook

docs/
    └── KASUMI_MCP_SERVER_PLAN.md       ← This document
```

---

*End of document.*
