# NEXCEL AI Context Upgrade Plan
# AI-Aware Spreadsheet Intelligence for KASUMI

**Status:** Draft — Pending Approval
**Date:** 2026-03-25
**Scope:** 2–3 days of implementation
**Principle:** Simple over complex. No new dependencies unless unavoidable. Detailed logging throughout.

---

## Background

WORDO now has full semantic context — AI knows exactly what paragraph, sentence, word, mark, track change, or comment the user is working on. NEXCEL needs the equivalent.

In spreadsheets, AI context is different from documents. Key differences:

| Dimension | WORDO | NEXCEL |
|-----------|-------|--------|
| Primary structure | Linear text, blocks | 2D grid, rows × fields |
| Content addressing | paragraphId + sentenceIndex + wordOffset | tableId + rowId + fieldId |
| Relationships | Inline (marks, comments on text spans) | Cross-table links (link_row, formula, lookup, rollup) |
| Change tracking | Word-level tracked edits | Row-level change log |
| Comments | Thread on text selection | Thread on cell / column / row |
| AI context query | "What is in this selection?" | "What is in this cell, row, column, and how does it relate to other tables?" |

NEXCEL already has a solid foundation: VirtualGrid, typed renderers, undo/redo, import/export, access control. The gap is:

1. **Cell comments** — no comment system in NEXCEL at all
2. **Cell-level formatting metadata** — bold/color on cells exists as a concept but is unimplemented
3. **Sorting and filtering** — UI exists, logic is missing
4. **Link resolution** — link_row renders as text; AI cannot traverse relationships
5. **AI context serializer** — no equivalent of WORDO's `getDocumentContext()`
6. **Context menu** — no right-click operations
7. **Change log** — no cell-level mutation history (AI cannot answer "who changed this?")

---

## Design Principles

1. **Logger first** — every module logs with `[NEXCEL:Module] level action {detail}` format
2. **Simple is better** — no new libraries unless nothing else works
3. **Stable cell identity** — use `rowId + fieldId` (already canonical in the codebase) as the stable address
4. **AI context is the goal** — every feature must produce a queryable context structure
5. **Zustand-first persistence** — sidecar stores for comments/formatting/history, serialized to localStorage today, Baserow later

---

## Module Overview

| Module | Name | Day | Depends On |
|--------|------|-----|------------|
| 0 | Logger (NEXCEL) | 1 | — |
| 1 | Filtering & Sorting (complete the stubs) | 1 | 0 |
| 2 | Cell Comments System | 1 | 0 |
| 3 | Cell Formatting Metadata | 1 | 0 |
| 4 | Context Menu | 1 | 0, 1, 2, 3 |
| 5 | Link Row Resolution | 2 | 0 |
| 6 | Change Log (Cell Mutation History) | 2 | 0 |
| 7 | AI Context Serializer | 2 | 0, 2, 3, 5, 6 |
| 8 | Duration & Rating Field Editors | 2 | 0 |
| 9 | Conditional Formatting (basic) | 3 | 0, 3, 7 |

---

## Module 0 — Logger (NEXCEL)

**File:** `services/logger.ts`

Identical pattern to WORDO logger. Structured, namespaced, level-gated.

```typescript
// [NEXCEL:Grid] debug cellClick { rowId: 42, fieldId: 5, value: "In Progress" }
// [NEXCEL:Comments] info addComment { cellRef: "42:5", text: "Check this" }
// [NEXCEL:LinkRow] warn resolveLink { fromTable: 1, toTable: 3, rowId: 99, status: "not_found" }
```

**Log levels:** debug / info / warn / error
**Namespaces:** Grid, Store, Comments, Formatting, ChangeLog, LinkRow, AIContext, Filter

---

## Module 1 — Filtering & Sorting (Complete the Stubs)

**Current state:** `sortConfig` state exists, `searchText` state exists, status bar shows sort label — but no rows are actually filtered or sorted.

**What to implement:**

### 1a. Sorting
- `toggleSort(fieldIndex)` currently sets `sortConfig` — wire it to row reordering
- Sort logic: compare by field type (text → localeCompare, number → numeric, date → Date parse, boolean → false < true)
- Keep original row order in `unsortedRows` for reset
- Log: `[NEXCEL:Store] info sort { fieldId, direction, rowCount }`

### 1b. Text Search Filter
- `setSearchText(text)` currently saves text — wire it to filter rows
- Filter: search across all field values (toString match, case-insensitive)
- Keep full row list as `allRows`, expose filtered as `visibleRows`
- Log: `[NEXCEL:Store] debug filter { query, matchCount, totalCount }`

### 1c. Column Filters (basic)
- Add `columnFilters: Record<fieldId, FilterRule>` to store
- FilterRule: `{ type: 'contains' | 'equals' | 'is_empty' | 'not_empty' | 'gt' | 'lt', value: string }`
- Combine column filters + search text into one filtered view
- No new dependencies — pure JS `.filter()`

**Implementation note:** keep it simple. All filtering is client-side on loaded rows. We are NOT implementing server-side filtering for now.

---

## Module 2 — Cell Comments System

**Pattern:** Same as WORDO's CommentStore, but addressed by `cellRef` = `"rowId:fieldId"` instead of document position.

Also supports **column-level** and **row-level** comments (addressed as `"row:42"` and `"col:5"`).

### Data Model

```typescript
interface NexcelComment {
  id: string               // uuid
  cellRef: string          // "rowId:fieldId" | "row:rowId" | "col:fieldId"
  text: string
  author: string
  createdAt: string        // ISO
  resolvedAt?: string
  replies: NexcelCommentReply[]
}

interface NexcelCommentReply {
  id: string
  text: string
  author: string
  createdAt: string
}
```

### Store: `stores/useCommentStore.ts`

Methods: `addComment(cellRef, text)`, `addReply(commentId, text)`, `resolveComment(commentId)`, `getCommentsForCell(cellRef)`, `getAllComments()`, `persistComments()`, `loadComments()`

Persistence: localStorage key `kasumi_nexcel_comments`

### UI

**Comment indicator in cell:** small coloured triangle in top-right corner of cell (like Excel) when a comment exists. Rendered as an overlay in VirtualGrid.

**Comment Panel:** slide-in from right (same pattern as WORDO), toggled by Ribbon button. Shows all open comments grouped by table → row → field.

**Add comment:** right-click → "Add Comment" (Module 4). Or Ribbon button when a cell is selected.

---

## Module 3 — Cell Formatting Metadata

Unlike WORDO, cells in NEXCEL do not have inline marks on text. Formatting in a spreadsheet means:

- **Cell background color** (per cell)
- **Text color** (per cell)
- **Bold** (per cell)
- **Italic** (per cell)
- **Text alignment** (left / center / right)
- **Number format** (override field-level format per cell — e.g., show currency symbol)

These are **cell-level overrides** that sit on top of field-level type rendering.

### Data Model

```typescript
interface CellFormat {
  bgColor?: string         // CSS color
  textColor?: string       // CSS color
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  numberFormat?: string    // e.g., "$#,##0.00"
}

// Addressed by cellRef "rowId:fieldId"
type FormatMap = Record<string, CellFormat>
```

### Store: `stores/useCellFormatStore.ts`

Methods: `setFormat(cellRef, format)`, `getFormat(cellRef)`, `getFormatsForRow(rowId)`, `clearFormat(cellRef)`, `persistFormats()`, `loadFormats()`

Persistence: localStorage key `kasumi_nexcel_formats`

### Rendering Integration

VirtualGrid cell rendering checks `useCellFormatStore` for each rendered cell and applies format overrides on top of the base renderer.

### UI

Ribbon Format group: **Bold** (B), **Italic** (I), **Text Color** (A▾), **Cell Background Color** (bucket▾), **Align** (left/center/right). These buttons apply to the current selection.

---

## Module 4 — Context Menu

Right-click on a cell (or row header / column header) shows a context menu.

**Cell context menu:**
- Insert Row Above
- Insert Row Below
- Delete Row
- ─
- Copy Cell
- Paste
- Cut
- ─
- Add Comment
- View Comments
- ─
- Format Cell (opens mini format panel)
- Clear Formatting
- ─
- Link to Row (if field type = link_row)

**Row header context menu:**
- Insert Row Above / Below
- Delete Row(s)
- Copy Row
- ─
- Add Row Comment
- View Row Comments

**Column header context menu:**
- Sort Ascending / Descending
- Filter by This Column
- ─
- Freeze/Unfreeze Column
- Hide Column / Show Hidden Columns
- ─
- Add Column Comment

**Implementation:** simple `<div>` portal positioned at mouse coordinates. No library needed. Close on outside click or Escape.

---

## Module 5 — Link Row Resolution

**Current state:** `link_row` fields render as comma-separated text from raw Baserow data. AI cannot traverse the relationship.

**What AI needs:**

```typescript
interface ResolvedLinkRow {
  fieldId: number
  fieldName: string
  linkedTableId: number
  linkedTableName: string
  linkedRows: {
    rowId: number
    primaryValue: string    // value of the primary field in the linked table
    fields?: Record<number, unknown>  // optional: full row if pre-fetched
  }[]
}
```

### LinkRowResolver service: `services/LinkRowResolver.ts`

- `resolveLinksForRow(tableId, rowId)` — fetches linked row primary values from the adapter
- `getLinkableRows(tableId, fieldId)` — list of rows available to link to (for edit dropdowns)
- Results cached in memory (simple Map, cleared on table reload)
- Log: `[NEXCEL:LinkRow] info resolve { fromTable, toTable, rowId, linkedCount }`

### UI

- link_row cell editor: dropdown showing linked rows by primary value, multi-select
- Rendered cell: chips with linked row primary values (same as select chips, but grey)

---

## Module 6 — Change Log (Cell Mutation History)

Track every cell edit with `who + when + old value + new value`.

### Data Model

```typescript
interface CellChange {
  id: string
  cellRef: string          // "rowId:fieldId"
  fieldId: number
  rowId: number
  oldValue: unknown
  newValue: unknown
  author: string
  timestamp: string        // ISO
  source: 'user_edit' | 'paste' | 'fill' | 'import' | 'api'
}
```

### Integration point

Hook into `commitCell` and `pasteGrid` and `fillRange` in `useExcelStore.ts`. Before writing the new value, push a `CellChange` entry.

### Store: `stores/useCellChangeStore.ts`

Methods: `recordChange(change)`, `getChangesForCell(cellRef)`, `getChangesForRow(rowId)`, `getRecentChanges(limit)`, `persistChanges()`, `loadChanges()`

Persistence: localStorage key `kasumi_nexcel_changes` (ring buffer, max 1000 entries)

### UI

- Context menu → "View Cell History" → shows change log panel for that cell
- Change panel shows: timestamp, author, old → new value, source

---

## Module 7 — AI Context Serializer

The equivalent of WORDO's `AIContextSerializer`. Returns a structured JSON describing the current state of NEXCEL for AI consumption.

### `services/AIContextSerializer.ts`

```typescript
interface NexcelAIContext {
  // What table/view we're in
  table: {
    id: number
    name: string
    totalRows: number
    visibleRows: number    // after filters
    fields: FieldSummary[]
  }

  // Active cell and its full context
  activeCell: {
    cellRef: string        // "rowId:fieldId"
    rowId: number
    fieldId: number
    fieldName: string
    fieldType: string
    value: unknown
    displayValue: string
    format?: CellFormat
    comments: NexcelComment[]
    recentChanges: CellChange[]
    linkedRows?: ResolvedLinkRow  // if field is link_row
  } | null

  // Selected range summary
  selection: {
    rangeRef: string       // "rowId:fieldId → rowId:fieldId"
    rowCount: number
    colCount: number
    cellCount: number
    numericSummary?: {     // if selection contains numbers
      sum: number
      avg: number
      min: number
      max: number
      count: number
    }
    sampleValues: string[] // first 5 display values
  } | null

  // Active row context (entire row the active cell is in)
  activeRow: {
    rowId: number
    fields: Record<string, {
      fieldName: string
      fieldType: string
      value: unknown
      displayValue: string
      hasComment: boolean
      hasFormatOverride: boolean
    }>
    comments: NexcelComment[]
    recentChanges: CellChange[]
  } | null

  // Relational context (linked tables)
  linkedContext: {
    field: string
    linkedTable: string
    linkedRows: string[]   // primary values of linked rows
  }[]

  // Table-level filters and sort active
  viewState: {
    sortField?: string
    sortDirection?: 'asc' | 'desc'
    activeFilters: { fieldName: string, rule: string }[]
    searchText: string
  }
}
```

### Methods

- `getContext()` — full context for current state
- `getCellContext(cellRef)` — context for a specific cell
- `getRowContext(rowId)` — full row with all fields resolved
- `getSelectionContext()` — context for current selection range
- `exportForAI()` — compact JSON (strips nulls, limits arrays to 10 items)

---

## Module 8 — Duration & Rating Field Editors

Currently unimplemented field types that NEXCEL needs to handle.

### Duration

Baserow duration format: `HH:MM:SS` or number of seconds.

- Render: `"2h 30m"` format
- Edit: inline input that parses `"2h30m"`, `"150m"`, `"2:30:00"`, plain seconds

### Rating

Baserow rating: integer 1–5 (or custom max).

- Render: star display ★★★☆☆
- Edit: click on star to set rating

Both are simple — no new dependencies.

---

## Module 9 — Conditional Formatting (Basic)

Allow users to define rules that apply `CellFormat` overrides automatically based on cell value.

**Rule types (simple):**
- `value_equals` → apply format
- `value_contains` → apply format
- `value_gt / lt` → apply format (numbers)
- `is_empty / not_empty` → apply format

**Scope:** per-field (applies to all cells in a column).

### Data Model

```typescript
interface ConditionalFormatRule {
  id: string
  fieldId: number
  condition: 'equals' | 'contains' | 'gt' | 'lt' | 'is_empty' | 'not_empty'
  value: string
  format: CellFormat
  priority: number    // lower = higher priority
}
```

### Store: `stores/useConditionalFormatStore.ts`

At render time, VirtualGrid checks conditional rules for each cell. Conditional format is applied after (and can be overridden by) manual cell format.

### UI

Ribbon → Format → "Conditional Formatting" → opens rule editor dialog.

---

## Day-by-Day Plan

### Day 1 (highest value, user-visible)

1. **Module 0** — Logger
2. **Module 1** — Filtering & Sorting (complete the existing stubs)
3. **Module 2** — Cell Comments (store + panel + cell indicator)
4. **Module 3** — Cell Formatting (store + ribbon buttons + rendering)
5. **Module 4** — Context Menu

### Day 2 (AI intelligence layer)

6. **Module 5** — Link Row Resolution
7. **Module 6** — Change Log
8. **Module 7** — AI Context Serializer
9. **Module 8** — Duration & Rating editors

### Day 3 (polish)

10. **Module 9** — Conditional Formatting
11. **Cut/Paste** — complete the cut stub in the store
12. **Column resize** — wire drag-resize properly
13. **Real-time cursor** — show other users' active cell (basic, if Baserow WS is ready)
14. **Integration test** — run against MockAdapter, fix edge cases

---

## What AI Will Be Able to Do After This

With this upgrade complete, AI (via CommandExecutor or direct context injection) can:

| Capability | Powered By |
|-----------|------------|
| "What is in cell B3?" | AI Context Serializer → getCellContext |
| "Summarise this row" | getRowContext → all fields with display values |
| "What changed in this cell recently?" | ChangeLog → getChangesForCell |
| "What do the linked records say?" | LinkRowResolver → resolveLinksForRow |
| "Show me all cells with comments" | CommentStore → getAllComments |
| "Why is this cell highlighted red?" | ConditionalFormatStore → explain rule |
| "Filter to show only High priority rows" | Filter system → setColumnFilter |
| "Sort by Due Date ascending" | Sort system → toggleSort |
| "What does the selection add up to?" | Selection context → numericSummary |

---

## Non-Goals (Keep Out of Scope)

- Formula engine (Baserow handles formula fields server-side)
- Pivot tables / charts (separate project)
- VBA / macros
- Print layout rendering
- Server-side filtering (client-side is sufficient for now)
- Named ranges
- Real-time collaborative cursors (may need Baserow WS — investigate separately)

---

## Logging Format Reference

```
[NEXCEL:Grid]       debug | info | warn | error
[NEXCEL:Store]      debug | info | warn | error
[NEXCEL:Comments]   debug | info | warn | error
[NEXCEL:Formatting] debug | info | warn | error
[NEXCEL:ChangeLog]  debug | info | warn | error
[NEXCEL:LinkRow]    debug | info | warn | error
[NEXCEL:AIContext]  debug | info | warn | error
[NEXCEL:Filter]     debug | info | warn | error
[NEXCEL:ContextMenu] debug | info | warn | error
```

Level gates: production = `warn+`, development = `debug+`

---

*Plan written by Kasumi, 2026-03-25*
