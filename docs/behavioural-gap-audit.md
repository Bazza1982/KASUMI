# KASUMI Frontend Behavioural Gap Audit

## Scope

This audit is based on the current implementation in:

- `frontend/src/App.tsx`
- `frontend/src/modules/excel-shell/*`
- `frontend/src/modules/wordo-shell/*`
- `frontend/src/platform/*`
- `server/routes/*`

The assessment focuses on user-observable behaviour, not branding or visual resemblance alone.

## Current Frontend Shape

### Top-level shell model

- `App.tsx` renders a single React app with a draggable shell switcher and toggles between `ExcelShellRoute` and `WordoShellRoute`.
- There is no shared workspace tab model, no document/workbook manager, and no explicit active-surface controller beyond React state and persisted shell choice.
- Shell switching is implemented as component replacement, not as an application-level document/workspace lifecycle.

### NEXCEL architecture as implemented

- State is concentrated in `useExcelStore`, with additional formatting/comment/change stores.
- Grid interaction logic lives mainly in `VirtualGrid.tsx`.
- Ribbon actions are partly direct store calls and partly local UI logic in `Ribbon.tsx`.
- Rendering uses `@tanstack/react-virtual` and sticky overlays for frozen rows/columns.
- Backend integration is split between adapter-driven Baserow access and direct `fetch('/api/nexcel/...')` calls.

### WORDO architecture as implemented

- `useWordoStore` holds document metadata and a `LayoutOrchestrator`.
- Actual editable content lives in ProseMirror `EditorState` instances managed by `LayoutOrchestrator`, one per section.
- `WordoRibbon.tsx` applies commands directly against the focused section's ProseMirror state.
- Persistence serializes orchestrator state to localStorage, not a fully materialized canonical document IR.
- Server routes provide basic document, markdown, comments, and access-mode endpoints, but the frontend mostly behaves as a browser-local editor.

## Architectural Inconsistencies

### 1. Stated document model vs actual source of truth

The README and type definitions present `KasumiDocument` as the canonical document IR, but current runtime truth is split:

- metadata and section list are stored in `useWordoStore.document`
- actual editable content is stored in `LayoutOrchestrator` ProseMirror instances
- `document.sections[].blocks` are usually empty placeholders after edits/imports

This is an important mismatch. It makes behaviour hard to reason about and weakens command-based operations, persistence guarantees, and future collaboration features.

### 2. NEXCEL has duplicate behaviour layers

Filtering/sorting and selection semantics are not centralized:

- `useExcelStore.applyFiltersAndSort()` mutates `sheet.rows`
- `VirtualGrid` also derives `filteredIndices` from `searchText` and `sortConfig`

This creates duplicated behaviour logic and increases the chance of state divergence, especially around undo/redo, search, filtering, and visible row identity.

### 3. Column identity mixes visible-index and raw-index semantics

The grid now supports hidden columns, but several helpers still assume:

- `activeCell.colIndex` maps directly to `sheet.fields[colIndex]`

That assumption is no longer stable when visible columns differ from raw fields. Some paths already use `commitCellByField`, but other behaviour still relies on raw array position, especially formula bar and general cell access helpers.

### 4. Command routing is not a real interaction core yet

The platform command bus exists, but user interaction still bypasses it in most places:

- keyboard handlers call store methods directly
- ribbon actions mutate local editor/grid state directly
- undo/redo is shell-specific and not represented as a unified command stream

The project talks about typed commands, but most interactive behaviour is still ad hoc.

## Spreadsheet Behaviour Audit

### What already works reasonably well

- Default active cell is effectively `A1`.
- Printable key starts editing the active cell.
- `F2`, `Enter`, `Tab`, arrow keys, `Ctrl+A`, `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Home`, `Ctrl+End` are wired.
- Shift-based range extension exists for click and arrow navigation.
- Copy/cut/paste uses TSV-compatible clipboard text.
- Fill handle exists and supports basic downward/right fill.
- Frozen first row/column, hidden columns, auto-fit, sort, search, and formatting UI exist.
- Virtualized rendering is already in place and is a strong foundation.

### Major behavioural gaps

#### New workbook / new sheet lifecycle

- There is no real workbook object.
- `newSheet()` creates a blank in-memory grid only; it does not create a real table/sheet resource.
- `SheetTabs` renders existing tables, but the `+` button is inert.
- There is no predictable document/sheet lifecycle for create, rename, duplicate, close, reopen, or restore-last-active.

#### Active focus model is incomplete

- The active cell is tracked, but focus belongs mostly to `window` listeners rather than a grid-owned focus controller.
- Keyboard handling is global. This risks conflicts with dialogs, ribbon inputs, and future multi-surface interactions.
- Row/column header selection does not behave like Excel selection bands.

#### Selection semantics are partial

- Cell range selection works, but row selection and column selection expectations are not fully implemented.
- There is no clear whole-row / whole-column active selection model.
- Multi-range selection is unsupported.
- Selection identity is still too tied to visible indices instead of stable row/field identity.

#### Implicit editing is only partly native

- Direct typing into a selected cell works.
- Double-click enters edit mode.
- But edit lifecycle is still largely cell-input based, not a unified cell editor model with clear rules for:
  - overwrite vs append
  - caret placement
  - formula entry prefix handling
  - read-only field transitions

#### Formula behaviour is mostly absent

- There is a formula bar UI, but no actual formula entry engine in the frontend.
- The `Formulas` ribbon tab is a placeholder.
- There is no user-visible distinction between text entry and formula entry expectations such as:
  - leading `=`
  - formula edit display
  - formula result vs source visibility

#### Undo/redo is not command-based

- Undo/redo stores snapshots of `sheet.rows` only.
- It does not restore all relevant behavioural state: selection, active cell, filters, hidden columns, column widths, formatting, or cross-store changes.
- It also does not reconcile with persisted/server state in a principled way.

This is not behavioural parity with Excel-like user expectations.

#### Clipboard parity is limited

- Clipboard copy/paste uses plain text TSV only.
- There is no separate internal clipboard model for preserving formatting, formula source, fill semantics, or rich paste decisions.
- Cut is implemented as copy plus deferred clear-on-paste, which is acceptable for a draft but still lacks robust movement semantics and cancellation rules.

#### Insertion/deletion semantics are weak

- Row insertion/deletion exists, but it is local-store oriented and not framed as sheet operations with stable visible behaviour.
- Column creation/deletion is mixed between fetch routes and local state updates.
- There is no clear insert-shift-down / delete-shift-up style cell operation model.

#### Formatting scope semantics are incomplete

- Manual formatting and conditional formatting exist, but formatting scope is cell-ref based and not fully integrated with copy/paste, autofill, or structural changes.
- There is no clear rule set for whether formatting follows content, position, selection, or operation type.

## Document Behaviour Audit

### What already works reasonably well

- WORDO opens with a section-backed editable document.
- ProseMirror provides solid baseline text editing, cursor movement, selection, and keyboard behaviour.
- `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+F` are wired.
- Ribbon commands restore focus to the active editor before applying changes.
- Section isolation is useful for performance and future large-document work.

### Major behavioural gaps

#### New blank document defaults are not fully native

- A new document is created with one section and a paragraph containing a placeholder space.
- There is no explicit post-create focus placement into the first editable body surface.
- Immediate typing readiness depends on the user clicking the page first.

That misses a basic Word-like user expectation model.

#### Active focus model is section-local, not document-global

- Behaviour depends on `focusedSectionId`.
- Toolbar commands fail or become no-ops when no section is focused.
- Focus is intentionally retained when the user clicks the ribbon, which is good, but there is no stronger document-level focus restoration contract.

#### Formatting on future text is weak

- Many ribbon formatting commands apply only when there is a non-collapsed selection.
- Collapsed-caret formatting does not become pending typing style in a Word-like way.

This is a visible behavioural gap for bold/italic/font size/highlight flows.

#### Undo/redo is section-scoped

- Undo/redo runs only against the currently focused section's ProseMirror history.
- There is no document-level command-based undo stack that spans:
  - section insertions
  - page setting changes
  - watermark changes
  - comments
  - track changes actions
  - embedded NEXCEL insertions

The file comments mention cross-section undo, but the actual implementation does not provide it.

#### Track changes is partial by design

- The plugin explicitly skips multi-step and complex operations such as paste.
- This means common authoring operations do not receive reliable review behaviour.

#### Selection semantics rely mostly on ProseMirror defaults

- That gives decent baseline behaviour for drag and double-click word selection.
- But there is no explicit product layer for:
  - paragraph-level selection expectations
  - triple-click line/paragraph handling
  - section boundary navigation
  - focus restoration after dialogs/commands

#### Paragraph and layout semantics are under-modeled

- Section/page layout exists visually.
- But page count and page navigation are not computed from layout; status bar shows `Page 1 of {sectionCount}`.
- The system still behaves more like "section cards" than a true document pagination model.

#### Clipboard parity is basic

- Native browser/ProseMirror clipboard behaviour is largely relied upon.
- There is no explicit product-level handling for:
  - keep source formatting
  - merge formatting
  - paste plain text
  - pasting embedded objects/data tables with predictable normalization

## Cross-Cutting Behaviour Audit

### Tabs and multi-surface lifecycle

- There is no workspace tab model at all.
- The shell switcher is not a substitute for workbook/document tabs.
- There is no open-document list, recent documents list in-app, or restoration of surface-specific focus/selection on switching.

### Command routing and consistency

- Both shells implement keyboard and ribbon behaviour locally.
- There is no shared command arbitration layer deciding which surface currently owns:
  - undo/redo
  - clipboard
  - find
  - save
  - context menu actions

### Context menu expectations

- NEXCEL has context menus.
- WORDO does not yet present a comparable product-level context menu layer.
- There is no shared command vocabulary behind these menus.

### Import/export semantics

- NEXCEL import/export is present but partly local and partly server-based.
- WORDO markdown routes exist, but `.docx` and `.pdf` are still partly browser/Electron-context dependent.
- User-facing behaviour is not yet framed around document lifecycle, save states, and predictable export ownership.

### Performance-aware rendering

- NEXCEL has a good rendering foundation.
- WORDO has a good section-isolation foundation.
- But neither shell yet has a performance model explicitly tied to behavioural guarantees during:
  - fast keyboard navigation
  - large pastes
  - large selection repaint
  - section-heavy documents
  - focus restoration after shell switching

## Testing Gaps

- Existing Playwright tests are mostly smoke tests.
- Existing unit tests check state methods, not behavioural parity.
- There is no acceptance suite for user-observable behaviours such as:
  - direct typing into selected cell
  - formula-bar vs cell-editor consistency
  - selection persistence through sort/filter/hide
  - new document readiness
  - collapsed-caret formatting persistence
  - document-level undo routing

## Summary

KASUMI already has meaningful implementation depth in both shells. This is not a greenfield prototype.

However, its current behaviour model is still fragmented:

- NEXCEL has many spreadsheet features, but not a single interaction engine
- WORDO has a strong editing substrate, but not a complete document interaction layer
- Cross-shell behaviour lacks a shared active focus model, command routing model, and lifecycle model

The upgrade should therefore prioritize interaction engine replication and behavioural parity before adding more surface features.
