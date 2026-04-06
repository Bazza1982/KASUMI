# Menu Implementation Plan — NEXCEL & WORDO
**Date:** 2026-03-28 (rev after code verification)
**Scope:** Fill missing menu functions — Class 1 first, then Class 2
**Order:** NEXCEL → WORDO

---

## Feedback Response (Lin Yueru review 2026-03-28)

逐条对着真实代码验证后的回应：

| # | 反馈点 | 采纳？ | 依据 |
|---|--------|--------|------|
| 1 | NEXCEL Undo/Redo 应接 store 而非 fetch API | ✅ 采纳 | `useExcelStore.ts:514` 已有 `undo()` / `redo()`，直接调用即可，不需要任何网络请求 |
| 2 | Sort/Filter 应复用现有前端实现而非再建后端路径 | ✅ 采纳 | `useExcelStore.ts:496` 已有 `toggleSort()`，`setColumnFilter()` 完整实现，且表头已有排序能力，Ribbon 只需补入口按钮 |
| 3 | 格式接口参数不应再写 `cellId` | ✅ 采纳 | `nexcel.ts` 当前接口实际接收 `row_id`、`field_id`、`format`。计划改为按真实后端参数编写，避免把实现带偏 |
| 4 | WORDO markdown 导出路径写错了 | ✅ 采纳 | 当前后端已存在 `GET /api/wordo/document/markdown` 与 `PUT /api/wordo/document/markdown`；计划统一按这组真实路径实现 |
| 5 | WORDO access mode toggle 已存在，是位置调整而非从零开发 | ✅ 采纳 | `WordoRibbon.tsx:207` 已有完整的三模式切换按钮组，只是不在 VIEW tab 里。任务调整为"确认现有按钮可见并在合适位置" |
| 6 | Zoom/Freeze Row/Row-Col resize/Find & Replace/Insert Image 复杂度被低估 | ✅ 采纳 | 这些全部移到 Class 2，不再按 quick win 估算 |

---

## Phase 1 — NEXCEL Class 1 (Quick Wins)

### 1.1 Add File Tab to Nexcel Ribbon

**Files:** `Ribbon.tsx`, `ExcelShellRoute.tsx`

Add `'File'` to menu bar. File tab content — all handlers already exist, just move/duplicate entry points:

| Button | Existing Handler | Source |
|--------|-----------------|--------|
| New | `clearAll()` / store reset | store |
| Import CSV | `handleImportCsv()` | already in DATA tab |
| Import XLSX | `handleImportXlsx()` | already in DATA tab |
| Export CSV | `exportToCsv()` | already in DATA tab |
| Export XLSX | `exportToXlsx()` | already in DATA tab |

Keep DATA tab buttons unchanged.

---

### 1.2 Add Undo / Redo Buttons

**Files:** `Ribbon.tsx`, `ExcelShellRoute.tsx`

Wire directly to store — no API calls:

```ts
// ExcelShellRoute.tsx
const { undo, redo } = useExcelStore()
// Ribbon props: onUndo={undo} onRedo={redo}
```

Add to HOME tab Clipboard group. Also bind `Ctrl+Z` / `Ctrl+Y` keyboard shortcuts if not present.

---

### 1.3 Insert Column / Delete Column

**Files:** `Ribbon.tsx`, `ExcelShellRoute.tsx`

Add to INSERT tab alongside existing Add Row:

| Button | Handler |
|--------|---------|
| Insert Column | calls `POST /api/nexcel/columns` with default column config |
| Delete Column | calls `DELETE /api/nexcel/columns/:id` using active column from selection |

Check if `selectedColumnId` is tracked in store; if not, derive from `selectedCell.fieldIndex`.

---

### 1.4 Sort & Filter — Ribbon Entry Points

**File:** `Ribbon.tsx`

Sort buttons in HOME or DATA tab (reuse `toggleSort()` from store):

```ts
// Two buttons per selected column:
onSortAsc  = () => { if (sortConfig?.direction !== 'asc')  toggleSort(selectedColumnIndex) }
onSortDesc = () => { if (sortConfig?.direction !== 'desc') toggleSort(selectedColumnIndex) }
```

Filter: store already has `setColumnFilter()` and `columnFilters` state. Add a "Filter" toggle button that shows/hides filter inputs in the column header row (the header row UI may already partially exist — verify before building new).

No new backend routes needed.

---

### 1.5 Number Format Selector

**File:** `Ribbon.tsx`

Add dropdown to HOME tab Format group:

```
General | Number | Currency | Percentage | Date | Text
```

On select, call `POST /api/nexcel/format` with correct params:
```ts
fetch('/api/nexcel/format', {
  method: 'POST',
  body: JSON.stringify({ row_id: rowId, field_id: fieldId, format: { type: 'currency' } })
})
```

---

### 1.6 Cell Background Color

**File:** `Ribbon.tsx`

Add separate "Cell BG" color picker to HOME tab Format group (distinct from existing `highlight`).
Calls `POST /api/nexcel/format` with `{ row_id, field_id, format: { bg_color: '#hex' } }`.

---

## Phase 2 — NEXCEL Class 2 (New Code Required)

### 2.1 Print

```ts
const handlePrint = () => window.print()
```
Add CSS `@media print` rule to hide ribbon, sidebar, etc. — show only grid content.
Add Print button to File tab.

---

### 2.2 Remove Duplicates

**Backend:** Add `POST /api/nexcel/rows/deduplicate`.
Logic: identify rows with identical values across all fields, keep first occurrence, delete rest.
**Frontend:** Button in DATA tab → calls endpoint → refresh grid.

---

### 2.3 Column Width / Row Height Resize

**Backend:** Add `width` field to column schema in `nexcelStore.ts`. Add `PUT /api/nexcel/columns/:id` body support for `width`.
**Frontend:** Drag handle on column header border (mousedown → mousemove → mouseup), on release call `PUT /api/nexcel/columns/:id` with new width. Row height is lower priority.

---

### 2.4 Freeze Row

**Backend:** Extend freeze state to track both `frozenRows` count and `frozenCols` count.
**Frontend:** Grid render — apply `position: sticky; top: <n * rowHeight>px` for frozen rows. Toggle button in VIEW tab.

---

### 2.5 Zoom

Add zoom slider (50%–200%) to VIEW tab.
Do not default to `transform: scale(...)` on the virtualized grid wrapper. That approach is likely to break scroll math, hit testing, and selection coordinates.
Implementation should be design-first:
1. Evaluate whether zoom can be expressed through row height, column width, font size, and layout tokens instead of wrapper scaling
2. Verify pointer mapping, keyboard navigation, and sticky/frozen behavior before implementation
3. Only implement after the rendering strategy is validated

No backend needed. Persist zoom level in local store state.

**Validation update (2026-03-30):**

- Steps 1 and 2 are now effectively validated in code, not just on paper.
- `useExcelStore.ts` already persists `zoomLevel`; `Ribbon.tsx` already exposes a VIEW-tab zoom control.
- `VirtualGrid.tsx` already uses token scaling rather than wrapper scaling:
  - row height derives from `BASE_ROW_HEIGHT * zoomLevel`
  - column width estimation derives from `BASE_COL_WIDTH * zoomLevel`
  - cell/header font sizes also derive from `zoomLevel`
- Pointer math remains in the grid's native coordinate system. This is the critical reason token-scaling is viable:
  - drag hit testing still uses unscaled `clientX/clientY -> scroll offset -> virtual item bounds`
  - no `transform: scale(...)` wrapper is applied, so `getBoundingClientRect()` and virtualizer math stay aligned
- Sticky/frozen behavior is also compatible with this strategy because frozen cells/headers remain positioned from virtual row/column offsets, not from transformed pixels.

**What this means for delivery:**

- Zoom is no longer a pure design placeholder. A first-pass implementation already exists and follows the correct rendering strategy.
- The remaining work is hardening, not invention:
  - scale remaining fixed layout tokens (`ROW_HEADER_WIDTH`, `COL_HEADER_HEIGHT`) if visual density feels inconsistent at non-100% zoom
  - verify resize/fill-handle overlays against zoomed custom column widths
  - add targeted tests for zoomed selection, frozen panes, and drag interactions

---

## Phase 3 — WORDO Class 1 (Quick Wins)

### 3.1 Expand FILE Tab

**File:** `WordoRibbon.tsx`

FILE tab already exists. Add missing entries:

| Button | Handler | Status |
|--------|---------|--------|
| New | `onNewDocument` | ✅ exists |
| Open (.docx) | `onImportDocx` | ✅ exists |
| Save | `onSave` | ✅ exists |
| Save As (.docx) | same as Export .docx — rename label | ✅ exists |
| Export PDF | `onExportPdf` | ✅ exists |
| Export Markdown | new handler → `GET /api/wordo/document/markdown` | ✅ API exists |
| Import Markdown | new handler → file input → read text → `PUT /api/wordo/document/markdown` | ✅ API exists |

---

### 3.2 Add Undo / Redo Buttons

**File:** `WordoRibbon.tsx`

ProseMirror history plugin is already loaded. Wire PM commands to buttons:

```ts
import { undo, redo } from 'prosemirror-history'
// In ribbon: onUndo={() => undo(view.state, view.dispatch)}
//            onRedo={() => redo(view.state, view.dispatch)}
```

`Ctrl+Z` / `Ctrl+Y` likely work already via PM — add visible buttons anyway.

---

### 3.3 Expand INSERT Tab

**File:** `WordoRibbon.tsx`

| Button | Handler | Status |
|--------|---------|--------|
| Horizontal Rule | insert `horizontal_rule` PM node via transaction | needs 1 line |
| Blockquote | `setBlockquote()` in store | ✅ exists |
| Code Block | `toggleCode()` in store | ✅ exists |
| Link | open inline link dialog → `applyMarkWithAttrs({ href })` | new dialog needed (Phase 4) |

---

### 3.4 Access Mode Toggle — Verify Visibility

**File:** `WordoRibbon.tsx`

`WordoRibbon.tsx:207` already has a full three-mode toggle (data-entry / analyst / admin).
Task: confirm it is visible in the VIEW tab (or a consistent location), not buried or hidden.
If it's already accessible — no code change needed, just document it as done.

---

### 3.5 Word Count

**File:** `WordoShellRoute.tsx` or status bar component

Count words from PM state:
```ts
const wordCount = editor.state.doc.textContent.trim().split(/\s+/).filter(Boolean).length
```
Show in status bar (bottom of document) or as a modal triggered from VIEW tab.

---

## Phase 4 — WORDO Class 2 (New Code Required)

### 4.1 Find & Replace

**Frontend only** — no backend needed.

- Floating panel (Ctrl+F to open/close)
- Find: use PM `Decoration` to highlight all matches in document
- Replace single: replace current match with new text via PM transaction
- Replace all: iterate all match positions, apply batch transaction
- Edge cases: case sensitivity toggle, wrap-around

Estimated effort: ~4–6 hours (non-trivial PM decoration + transaction coordination).

---

### 4.2 Print

```ts
const handlePrint = () => window.print()
```
CSS `@media print`: hide ribbon, sidebar, comment panel. Show only document body.
Add Print button to FILE tab.

---

### 4.3 Insert Image

**Backend:** Add `image` node to PM schema in `wordoSchema`.
**Frontend:**
1. File input accepts image types
2. Read as base64 data URL
3. Insert PM `image` node with `src` attribute
4. Render as `<img>` in NodeView

Storage: base64 embedded in document JSON. No separate asset endpoint needed for now.
Estimated effort: ~3–4 hours.

---

### 4.4 Insert Link Dialog

**Frontend:**
Small modal with "Display Text" + "URL" inputs.
On confirm: if text selected → apply `link` mark with `href`. If no selection → insert new text node with mark applied.
PM schema already has `link` mark.
Estimated effort: ~2 hours.

---

### 4.5 Clear Formatting

```ts
const clearFormatting = (view: EditorView) => {
  const { from, to } = view.state.selection
  const tr = view.state.tr.removeMark(from, to)
  view.dispatch(tr)
}
```
Add button to HOME tab. One function, no backend.

---

### 4.6 Track Changes — Verify & Complete

Current state: toggle button and Accept All / Reject All exist in REVIEW tab.
**Work:**
1. Verify PM transaction intercept is actually applying `track_insert` / `track_delete` marks when toggle is ON (not just a UI state)
2. Verify Change Panel lists individual changes with per-item accept/reject
3. End-to-end test: type → see change in panel → accept → text confirmed clean

If intercept is broken, fix the PM plugin. This is verification-first work.

---

## Acceptance Criteria

Each item is done when:
1. Button/UI is visible and correctly labelled
2. Action executes without console errors
3. Result is visible in document/grid immediately
4. Survives app restart where persistence is expected

---

## Files Touched (Summary)

**NEXCEL:**
- `frontend/src/modules/excel-shell/components/Ribbon.tsx`
- `frontend/src/modules/excel-shell/ExcelShellRoute.tsx`
- `frontend/src/modules/excel-shell/stores/useExcelStore.ts` (minor, if column selection needs tracking)
- `server/routes/nexcel.ts` (Phase 2: deduplicate, resize)
- `server/state.ts` (Phase 2: width field, freeze row state if persisted there)

**WORDO:**
- `frontend/src/modules/wordo-shell/components/WordoRibbon.tsx`
- `frontend/src/modules/wordo-shell/WordoShellRoute.tsx`
- `frontend/src/modules/wordo-shell/stores/useWordoStore.ts` (minor)
- `server/routes/wordo.ts` (Phase 4 only, if needed)
