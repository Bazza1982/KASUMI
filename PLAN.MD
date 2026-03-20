````markdown
# Excel Shell Frontend Transformation Plan for Baserow

## Project Title

Excel Shell for Baserow

## Mission

Transform the `web-frontend` of Baserow into an Excel-like workbook UI that feels highly familiar to spreadsheet users, while preserving the existing backend, API contracts, WebSocket collaboration model, and structured database semantics for AI-native operations.

## Core Objective

Build a frontend that:

* looks and behaves very close to Excel for day-to-day spreadsheet work
* supports keyboard-heavy spreadsheet interaction patterns
* supports direct paste from Excel cells
* supports import from `.xlsx` and `.csv`
* supports export to `.xlsx` and `.csv`
* preserves backend data integrity
* preserves Baserow backend unchanged for AI connectivity
* keeps structured row/field semantics instead of turning the system into a true unrestricted cell matrix

## Non-Goals

The following are explicitly out of scope for this project:

* VBA / macros
* full Excel formula engine parity
* pivot tables
* advanced data processing engines
* full workbook calculation graph
* unrestricted merged-cell semantics
* print layout / pagination fidelity
* charting ecosystem parity
* binary-perfect round-trip fidelity for arbitrary Excel formatting

These are intentionally excluded because AI agents will replace much of the advanced analytical layer, while the frontend only needs to be a high-fidelity spreadsheet shell for input, review, manipulation, and bulk editing.

---

# 1. Architectural Constraints

## 1.1 Backend Must Remain Functionally Unchanged

The Baserow backend remains the system of record.

Do not redesign:

* Django backend
* PostgreSQL schema
* REST API contracts unless absolutely necessary
* WebSocket event protocol unless absolutely necessary
* action-based undo/redo model
* structured table / row / field semantics

The frontend must adapt to the backend, not vice versa.

## 1.2 Preserve AI-Native Structured Semantics

The project must not collapse the backend into a raw cell-address-based model.

The system must continue to behave internally like this:

* rows are records
* fields are typed columns
* views are filtered/sorted projections
* cell UI is a projection of `(row_id, field_id)` onto a spreadsheet coordinate system

Example internal mapping:

```json
{
  "ui_cell": "C12",
  "row_id": 9182,
  "field_id": 44,
  "field_name": "status",
  "value": "in_progress"
}
````

The UI may look like Excel, but the canonical data model remains schema-driven and record-oriented.

## 1.3 Frontend Strategy

Do not attempt to mutate the existing Baserow table UI incrementally into Excel. That path will create a brittle hybrid.

Instead:

* keep original frontend behavior available as fallback/admin mode if useful
* create a parallel Excel shell frontend layer
* centralize all backend communication through a dedicated frontend adapter layer

Recommended architecture:

```text
ExcelShell UI
  -> Frontend Adapter Layer
    -> Baserow REST API
    -> Baserow WebSocket API
    -> Baserow Undo/Redo endpoints
```

---

# 2. Product Definition

## 2.1 What “Excel-like” Means in This Project

This project should reproduce the following high-value Excel affordances:

* workbook shell
* sheet tabs
* formula bar
* name box
* row headers / column headers
* frozen panes
* keyboard navigation
* range selection
* fill handle
* direct multi-cell paste
* right-click menus
* status bar
* filter dropdowns
* column resizing / row resizing
* hidden columns
* import/export workflows
* familiar edit rhythm (`Enter`, `Tab`, arrows, `Ctrl+C/V/X`, `Shift+Arrow`, etc.)

## 2.2 What Must Remain Structured

Even though the interface should feel like Excel, the following must remain constrained:

* field typing
* row identity
* schema control
* relational field semantics
* validation rules
* backend-driven persistence
* undo/redo as server-backed action history

## 2.3 Success Criteria

The project succeeds when:

* an Excel-heavy user can open the interface and immediately recognize the workflow model
* routine spreadsheet tasks feel natural without training
* bulk data can be pasted from Excel directly
* `.xlsx` and `.csv` imports are robust for large datasets
* `.xlsx` and `.csv` exports are available and reliable
* AI agents can still operate safely against stable backend APIs
* the system remains far less fragile than Excel automation workflows

---

# 3. Recommended Repository Strategy

## 3.1 Fork Strategy

Fork Baserow and maintain a clean separation:

* backend: remain as close to upstream as possible
* frontend: allow substantial divergence
* adapter layer: isolate backend contract usage
* optional original UI mode: preserved during transition

## 3.2 Suggested Frontend Module Structure

```text
web-frontend/
  modules/
    excel-shell/
      components/
        workbook/
        ribbon/
        formula-bar/
        name-box/
        sheet-tabs/
        status-bar/
        context-menu/
      grid/
        engine/
        selection/
        editing/
        clipboard/
        fill-handle/
        virtualization/
        frozen-panes/
        rendering/
      adapters/
        baserow/
      stores/
      services/
      import-export/
      shortcuts/
      utils/
```

## 3.3 Key Internal Rule

The grid engine must never talk directly to backend APIs.

All backend I/O must go through adapter services.

---

# 4. Phase Plan

---

## Phase 0 — Deep Repo Recon, Runtime Mapping, and Gap Analysis

### Objective

Understand the current Baserow frontend architecture deeply enough to avoid accidental coupling and to identify the minimal backend touchpoints required for an Excel shell.

### Deliverables

* `frontend-architecture.md`
* `api-surface-map.md`
* `excel-shell-gap-analysis.md`
* `event-flow-map.md`
* `state-model-map.md`

### Tasks

#### 0.1 Run and inspect the full dev environment

Goals:

* run backend
* run web frontend
* verify table browsing/editing
* inspect network calls
* inspect websocket traffic
* inspect undo/redo behavior
* inspect current table/grid rendering stack

#### 0.2 Inventory all relevant frontend modules

Identify:

* table/grid rendering components
* field editor components
* state stores
* routing and view loading
* keyboard handling
* clipboard handling
* websocket subscriptions
* action history integration
* export/import flows
* field type rendering logic

#### 0.3 Inventory API surface used by table editing

Map all endpoints used for:

* load table metadata
* load view metadata
* load rows
* update cell / row values
* batch updates
* filters
* sorting
* field creation / field updates
* import/export
* undo/redo

#### 0.4 Model existing runtime state flows

Map:

* initial load
* table switch
* view switch
* cell edit lifecycle
* optimistic update flow
* websocket patch application
* undo/redo flow
* batch paste flow if present

#### 0.5 Gap analysis

Compare current Baserow behavior to target Excel shell behavior.

Classify as:

* reusable as-is
* reusable through adapter
* needs wrapper
* must be replaced entirely

### Example Output

```text
Current table view:
- supports typed cell editors
- supports row-based rendering
- not designed for Excel-style selection semantics
- limited formula bar behavior
- lacks workbook shell abstraction
- not optimized for Excel-like keyboard model
```

### Exit Criteria

Phase 0 is complete only when the team can answer:

* which components can be reused?
* which interaction systems must be rebuilt?
* which API endpoints are sufficient as-is?
* where must a compatibility adapter be inserted?

---

## Phase 1 — Establish Excel Shell Skeleton

### Objective

Create a new top-level Excel-like workspace shell without yet reproducing all spreadsheet behavior.

### Deliverables

* `ExcelWorkbenchLayout`
* `RibbonBar`
* `NameBox`
* `FormulaBar`
* `SheetTabs`
* `WorkbookStatusBar`
* `GlobalShortcutManager`
* `SelectionStore v1`
* `ExcelShellRoute`

### Tasks

#### 1.1 Create a new route / mode

Introduce an `ExcelShell` mode for table interaction.

Do not overwrite existing UI initially. Allow controlled routing.

Example:

```text
/table/:tableId/excel
```

#### 1.2 Build workbook frame

Implement structural UI regions:

* top ribbon area
* formula bar/name box area
* central grid viewport
* bottom sheet tabs
* bottom status bar

#### 1.3 Implement global shell stores

Add centralized state for:

* current workbook context
* current sheet/view
* active cell
* current selection range
* edit mode vs navigation mode
* clipboard pending state
* formula bar state
* visible row/column windows

#### 1.4 Build a global shortcut dispatcher

This is critical early.

Keyboard dispatch must support mode-aware routing:

* navigation mode
* edit mode
* formula bar focus
* context menu open
* multi-select mode

### Example Interaction Targets

* Arrow keys move active cell
* `Tab` moves right
* `Shift+Tab` moves left
* `Enter` moves down or commits edit
* `Esc` cancels edit
* `Ctrl+C/V/X/Z/Y` route properly
* `Delete` clears selected cells if valid

### Exit Criteria

Phase 1 is complete when:

* a table opens inside an Excel-looking shell
* the shell state exists independently of old table UI
* active cell and selection state can be tracked globally
* keyboard routing is centralized

---

## Phase 2 — Build Spreadsheet-Grade Selection Model

### Objective

Implement the most important foundation of Excel-like behavior: the selection model.

This is higher priority than fancy visuals.

### Deliverables

* `SelectionEngine`
* `ActiveCellModel`
* `RangeSelectionModel`
* `MultiRangeSelectionModel` (optional later, but architecture should allow it)
* selection-aware scroll controller
* row/column header selection behavior

### Tasks

#### 2.1 Create coordinate abstraction

The UI grid must support A1-style coordinates while mapping internally to structured backend identities.

Suggested abstraction:

```ts
type GridCoord = {
  rowIndex: number
  colIndex: number
}

type CellRef = {
  rowId: number
  fieldId: number
}
```

Maintain a translation layer between viewport coordinate and backend identity.

#### 2.2 Implement active cell semantics

Support:

* single active cell
* selected range anchored from active cell
* shift expansion
* keyboard movement preserving anchor rules
* click / drag selection
* row selection
* column selection
* select all

#### 2.3 Implement viewport synchronization

Ensure selection state remains stable during:

* virtual scrolling
* row loads
* sort/filter changes
* remote updates
* row insertion/deletion

#### 2.4 Render proper headers and highlights

Visual behaviors:

* active cell border
* selected range shading
* row/column header highlight
* fill handle anchor
* focus ring consistency

### Example Behavior

If the active cell is `C5` and the user presses `Shift+Right` twice:

* active cell remains conceptually anchored
* selection becomes `C5:E5`
* formula bar reflects `C5` unless edit mode changes that rule

### Exit Criteria

Phase 2 is complete when the grid feels selection-correct under keyboard and mouse navigation.

---

## Phase 3 — Grid Engine Reconstruction

### Objective

Build a dedicated virtualized grid engine designed for spreadsheet interaction, not generic data tables.

### Deliverables

* `VirtualGrid`
* `GridViewportController`
* `CellRendererRegistry`
* `RowHeaderRenderer`
* `ColumnHeaderRenderer`
* `ColumnResizeController`
* `RowResizeController`
* `FrozenPaneController v1`

### Tasks

#### 3.1 Implement virtualization-first rendering

Requirements:

* support large row counts
* support wide tables
* avoid DOM explosion
* keep selection overlays smooth
* keep keyboard navigation responsive

Use virtualization for both axes if needed.

#### 3.2 Separate rendering layers

Suggested layers:

* base grid cells
* header layer
* selection overlay layer
* editor overlay layer
* fill handle layer
* drag indicator layer

Do not fuse these into one rendering surface.

#### 3.3 Build typed cell renderer registry

Each field type must render through a registry.

Examples:

* text
* number
* date
* checkbox
* single select
* multi select
* relation
* formula/computed
* attachment (read-only or special mode)

The UI should still feel like spreadsheet cells, but editing/rendering should remain type-aware.

#### 3.4 Implement resize and hidden-column behavior

Support:

* drag resize columns
* optional drag resize rows
* auto-fit column width
* hide/unhide columns
* maintain width metadata in frontend config or existing backend-compatible structures where possible

### Exit Criteria

Phase 3 is complete when:

* the grid performs well for large datasets
* row/column headers behave correctly
* selection overlay remains stable while scrolling
* typed cells are rendered reliably

---

## Phase 4 — Editing Engine and Cell Lifecycle

### Objective

Implement Excel-like editing without abandoning backend validation and structured field semantics.

### Deliverables

* `EditSessionManager`
* `CellEditorOverlay`
* typed editor components
* `CommitPipeline`
* `ValidationSurface`
* formula bar edit binding

### Tasks

#### 4.1 Distinguish navigation mode from edit mode

This is non-negotiable.

Support transitions like:

* click cell -> select only
* double-click -> enter edit mode
* keypress on selected cell -> replace contents / enter edit mode
* `F2` -> edit in place
* formula bar focus -> edit current cell
* `Enter` / `Tab` commit and navigate

#### 4.2 Implement editor lifecycle

Each edit session should support:

* open
* populate current value
* local validation
* type normalization
* optimistic update
* backend commit
* failure recovery
* cancellation

#### 4.3 Build commit pipeline

The pipeline must:

1. normalize raw editor input
2. validate against field type
3. transform into backend payload
4. dispatch through adapter
5. reconcile with optimistic state
6. resolve websocket echo / race issues

#### 4.4 Bind formula bar to active cell

The formula bar is a UI affordance, not a true formula engine.

It should:

* show current cell display/editable value
* allow direct editing of current cell
* commit through the same backend pipeline
* display computed field content read-only where required

### Example

If current cell maps to a single select field:

* formula bar may display label text
* editor may open a dropdown-like selection interface
* paste/import may attempt label-to-option resolution
* backend payload uses canonical option value/id

### Exit Criteria

Phase 4 is complete when editing feels spreadsheet-like but remains type-safe and backend-compliant.

---

## Phase 5 — Clipboard Engine, Direct Excel Paste, and Fill Handle

### Objective

Support the highest-value spreadsheet behaviors: bulk paste from Excel and bulk propagation inside the grid.

### Deliverables

* `ClipboardParser`
* `ClipboardSerializer`
* `PastePlanner`
* `BatchCommitEngine`
* `FillHandleEngine v1`

### Tasks

#### 5.1 Parse Excel/Sheets-compatible clipboard payloads

Handle:

* TSV
* newline-delimited rows
* quoted values where relevant
* rectangular multi-cell paste
* single-cell repeated expansion
* sparse or malformed clipboard input

#### 5.2 Map pasted data onto selected range

Paste logic should:

* anchor at active cell
* compute target rectangle
* detect overflow / truncation rules
* validate against field types
* support partial success strategy only if explicitly designed
* otherwise fail safely with diagnostics

#### 5.3 Implement batch commits

Do not dispatch one network request per cell if avoidable.

Introduce a frontend batch planner that groups updates efficiently while still using compatible backend semantics.

If backend lacks ideal bulk endpoints, build a controlled client-side transaction abstraction with robust error reporting.

#### 5.4 Implement fill handle v1

Support first:

* duplicate value fill
* drag-copy range
* basic numeric increment
* basic date increment

Do not over-engineer advanced fill series logic initially.

### Example

Paste a 50 x 10 block copied from Excel into the selected anchor cell.

Expected flow:

1. parse clipboard into matrix
2. map matrix to visible columns / rows
3. validate per target field type
4. generate batch operations
5. perform commit
6. visually reconcile results
7. surface errors with row/column diagnostics if any fail

### Exit Criteria

Phase 5 is complete when users can reliably bulk paste from Excel into the shell and use drag-fill for common repetitive operations.

---

## Phase 6 — Import/Export Pipeline for CSV and XLSX

### Objective

Allow high-volume data ingress and egress through spreadsheet file formats.

### Deliverables

* `ImportWizard`
* `CSVImporter`
* `XLSXImporter`
* `CSVExporter`
* `XLSXExporter`
* schema mapping UI
* import validation report UI

### Tasks

#### 6.1 CSV import

Support:

* delimiter detection
* header row detection
* type inference suggestions
* mapping incoming columns to existing fields
* create-new-field option where allowed
* dry-run validation
* import summary

#### 6.2 XLSX import

Support:

* workbook selection
* sheet selection
* header row selection
* conversion from worksheet grid to structured row/field model
* normalization of cell values
* typed import mapping
* large file handling strategy

Important: imported spreadsheets do not define the canonical data model. They are source material to be ingested into the structured backend.

#### 6.3 CSV export

Support export of:

* current view
* full table
* filtered/sorted projection
* visible columns only vs all columns

#### 6.4 XLSX export

Export should prioritize usability, not perfect fidelity.

Support:

* one sheet per table/view as needed
* headers
* visible cell values
* optional basic formatting
* current sort/filter projection where meaningful

### Example Import Modes

* import into existing table
* create new table from file
* append rows
* replace rows only if explicit and safe

### Exit Criteria

Phase 6 is complete when a user can:

* import a large CSV/XLSX dataset
* map it into the existing structured model
* export current data back to CSV/XLSX for spreadsheet workflows

---

## Phase 7 — Excel-Like View Features on Top of Existing Baserow Semantics

### Objective

Re-express Baserow capabilities in spreadsheet-native UI language.

### Deliverables

* filter dropdown UI
* sort menus
* freeze panes
* hidden column manager
* auto-fit support
* named sheet/view handling
* structured status indicators

### Tasks

#### 7.1 Filters and sorting

Translate existing Baserow filter/sort semantics into Excel-like controls.

Examples:

* header dropdown filter menus
* sort ascending/descending
* filter-by-value
* filter-by-condition depending on field type

#### 7.2 Freeze panes

Implement first:

* freeze top row
* freeze first column
* freeze custom split later

The rendering system must support overlay split panes cleanly.

#### 7.3 Sheet tabs

Decide mapping model:

Option A:

* each Baserow table = sheet

Option B:

* each Baserow view = sheet tab
* same table may have multiple sheet tabs

Likely best:

* table tabs at one level, view tabs or view selector at another level
* but emulate sheet tabs for the dominant workflow

#### 7.4 Status bar

Include useful spreadsheet-style metrics:

* selection count
* numeric sum
* average
* min/max where applicable
* mode indicators

These are frontend analytics only unless backend support is needed.

### Exit Criteria

Phase 7 is complete when filtering, sorting, hidden columns, and pane freezing feel native to spreadsheet workflows.

---

## Phase 8 — Real-Time Collaboration and Undo/Redo Fidelity

### Objective

Preserve Baserow’s collaborative integrity while wrapping it in Excel-like interaction patterns.

### Deliverables

* collaboration event reconciler
* remote edit visual cues
* undo/redo shell integration
* conflict-aware edit session handling

### Tasks

#### 8.1 Preserve backend as source of truth for history

Do not replace Baserow’s action-based undo/redo with a pure frontend stack.

Frontend may maintain local ephemeral UI state, but canonical edit history remains backend-backed.

#### 8.2 Reconcile websocket updates with grid state

Support:

* remote cell changes
* row insertions/deletions
* field changes
* view changes
* selection preservation where possible
* stale editor warnings if necessary

#### 8.3 Implement collaboration cues

Optional but valuable:

* briefly highlight remotely updated cells
* indicate other-user presence later if available
* show non-blocking update markers

#### 8.4 Excel-like undo/redo triggers

Expose:

* `Ctrl+Z`
* `Ctrl+Y` / `Ctrl+Shift+Z` depending platform conventions
* toolbar buttons

But route through backend-compatible action history.

### Exit Criteria

Phase 8 is complete when collaboration and history remain correct under multi-user editing.

---

## Phase 9 — Schema Governance, Safety Rails, and Admin Controls

### Objective

Prevent the Excel-like shell from reintroducing the structural fragility that this whole project is meant to eliminate.

### Deliverables

* schema lock modes
* frontend capability guards
* admin-configurable field editing policies
* import safety constraints

### Tasks

#### 9.1 Separate data editing from schema editing

The Excel shell should default to:

* data editing enabled
* schema mutation constrained or hidden

Avoid making header rows feel arbitrarily editable if that would mutate backend schema dangerously.

#### 9.2 Add explicit schema operations

If column creation or schema edits are allowed, they should be explicit actions, not accidental spreadsheet-like gestures.

Examples:

* right-click header -> insert column -> modal confirm
* field type changes behind guarded flow
* destructive schema actions protected

#### 9.3 Protect production tables

Add optional shell modes such as:

* data-entry mode
* analyst mode
* admin mode

Each mode can expose different structural capabilities.

### Exit Criteria

Phase 9 is complete when the interface feels flexible but cannot be casually broken the way Excel templates often are.

---

## Phase 10 — Performance Hardening, Testing, and Release Readiness

### Objective

Make the shell robust enough for production use.

### Deliverables

* performance benchmarks
* regression suite
* interaction test harness
* import/export test corpus
* large-table stress suite

### Tasks

#### 10.1 Performance targets

Define concrete targets for:

* initial table load
* scroll smoothness
* selection responsiveness
* large paste latency
* export time
* import time
* remote update reconciliation latency

#### 10.2 Automated testing strategy

### Unit tests

Cover:

* selection logic
* coordinate translation
* clipboard parsing
* edit normalization
* field-type validation adapters
* import parsing
* export formatting

### Integration tests

Cover:

* opening table in Excel shell
* cell edit commit
* paste multi-cell block
* import CSV/XLSX
* export CSV/XLSX
* filter/sort flows
* undo/redo round trips

### E2E tests

Use browser automation to verify:

* keyboard navigation
* row/column selection
* fill handle
* formula bar editing
* context menu behavior
* freeze panes
* collaboration update handling

### Fuzz tests

Recommended for:

* clipboard payload parsing
* CSV import
* XLSX import mappings
* malformed data handling

#### 10.3 Stress cases

Test at minimum:

* wide tables
* tall tables
* mixed-type columns
* large clipboard paste
* concurrent edits
* filtered + sorted + frozen pane combinations
* import of messy spreadsheets

### Exit Criteria

Phase 10 is complete when the shell is performant, testable, and operationally safe.

---

# 5. Cross-Cutting Design Rules

## 5.1 Never confuse UI coordinates with canonical identity

UI coordinates are ephemeral.

Canonical identity always remains:

* row id
* field id

## 5.2 The shell may emulate unrestricted spreadsheets visually, but must never become one structurally

The project wins by preserving semantic anchoring.

## 5.3 Editing must be deterministic

AI compatibility requires deterministic semantics.

Avoid fuzzy UI behaviors that create ambiguous writes.

## 5.4 Prefer adapter-mediated compatibility over direct component patching

Keep the new system modular.

## 5.5 Preserve fallback path

During development, maintain a way to compare new Excel shell behavior with original Baserow behavior.

---

# 6. Example Internal Data Contracts

## Active cell state

```ts
type ActiveCellState = {
  gridCoord: { rowIndex: number; colIndex: number }
  rowId: number | null
  fieldId: number | null
  fieldType: string | null
  isEditing: boolean
}
```

## Selection range

```ts
type SelectionRange = {
  anchor: { rowIndex: number; colIndex: number }
  focus: { rowIndex: number; colIndex: number }
}
```

## Paste plan

```ts
type PastePlan = {
  anchor: { rowIndex: number; colIndex: number }
  matrix: string[][]
  targets: Array<{
    rowId: number
    fieldId: number
    rawValue: string
    normalizedValue: unknown
  }>
}
```

## Import result

```ts
type ImportResult = {
  mode: "create_table" | "append_rows" | "map_existing_fields"
  columnsDetected: string[]
  rowsParsed: number
  warnings: string[]
  errors: string[]
}
```

---

# 7. Milestone Breakdown

## Milestone A — Shell Prototype

Includes:

* shell layout
* grid viewport
* active cell
* selection basics
* keyboard navigation

## Milestone B — Editing MVP

Includes:

* cell editing
* formula bar binding
* typed editors
* commit pipeline

## Milestone C — Bulk Data Workflow MVP

Includes:

* Excel paste
* CSV import/export
* XLSX import/export
* basic fill handle

## Milestone D — Spreadsheet Usability Layer

Includes:

* filters
* sorting
* hidden columns
* freeze panes
* resize behaviors

## Milestone E — Production Hardening

Includes:

* collaboration correctness
* undo/redo fidelity
* performance
* tests
* schema safety rails

---

# 8. Suggested Task Prioritization for Agentic Coding Workflow

## Priority 1

* repo mapping
* shell route
* global stores
* coordinate abstraction
* selection engine

## Priority 2

* virtual grid
* typed renderers
* edit session manager
* formula bar binding

## Priority 3

* clipboard parser
* batch paste planner
* CSV/XLSX import/export

## Priority 4

* filters/sorting translation
* freeze panes
* resize/hidden columns
* fill handle

## Priority 5

* collaboration polish
* undo/redo polish
* status bar analytics
* safety rails
* performance hardening

---

# 9. Final Project Principle

This project is not an attempt to recreate Excel as a full computational spreadsheet engine.

It is an attempt to build an Excel-grade interaction shell over a structured, AI-native backend.

That distinction is the core design invariant.

The frontend should maximize user familiarity.
The backend should preserve semantic integrity.
AI should continue to operate against stable structured data, not brittle UI artifacts.

```
