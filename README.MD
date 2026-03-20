# Kasumi Nexcel

**Kasumi Nexcel** is an enterprise-grade Excel shell built over [Baserow](https://baserow.io), delivering familiar spreadsheet interaction patterns while preserving the structured, AI-native data semantics of the backend.

> The frontend looks like Excel. The backend stays like a database. AI agents keep working against stable structured data.

---

## Contents

- [Vision](#vision)
- [Feature Reference](#feature-reference)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Access Modes](#access-modes)
- [Adapter Layer](#adapter-layer)
- [Real-Time Collaboration](#real-time-collaboration)
- [Import / Export](#import--export)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Testing](#testing)
- [Scripts Reference](#scripts-reference)
- [GitHub Readiness](#github-readiness)

---

## Vision

Kasumi Nexcel eliminates the friction between **database-thinking** and **spreadsheet-acting**. Users interact with data using familiar Excel patterns—keyboard shortcuts, range selections, bulk paste, fill handle—while the system validates every write against a typed schema and routes all persistence through Baserow's REST API.

**Non-goals (by design):**
- VBA / macros
- Full formula engine
- Pivot tables
- Print layout fidelity
- Unrestricted merged-cell semantics

These are excluded because AI agents replace the advanced analytical layer, requiring deterministic writes and stable data contracts rather than freeform computation.

---

## Feature Reference

### Grid Engine

| Feature | Details |
|---------|---------|
| Virtualized rendering | `@tanstack/react-virtual` for both axes — handles 10,000+ rows, 100+ columns without DOM explosion |
| Sticky column headers | Separate fixed header bar synced to scroll container via DOM ref — no React re-render on scroll |
| Sticky row numbers | Left-side row header bar updated via `rowHeadersRef.style.left` |
| Column resize | Drag handle on header right edge; `isResizingActiveRef` guard prevents accidental sort trigger |
| Auto-fit column | Double-click or right-click → Auto-fit Width; measures sample cell content |
| Frozen columns | CSS `position: sticky` with computed left offsets; frozen header overlay at `zIndex: 6` |
| Hidden columns | Toggle via right-click header menu; persisted in `hiddenFieldIds` store state |
| Loading skeleton | 15×8 animated bar placeholder while initial data loads |
| Field type rendering | Registry-based dispatcher in `renderers.ts` — text, number, date, boolean, single-select, multi-select, URL, email, phone, formula |

### Selection Model

| Feature | Details |
|---------|---------|
| Active cell | Green 2px border; tracked as `{ rowIndex, colIndex }` in `useExcelStore` |
| Range selection | Anchor + focus model; `Shift+Click`, `Shift+Arrow`, click-drag |
| Row selection | Click row number header |
| Select all | `Ctrl+A` |
| Jump navigation | `Ctrl+Home` (cell A1), `Ctrl+End` (last data cell), `Home`/`End` (row start/end) |

### Editing

| Feature | Details |
|---------|---------|
| Mode switching | Navigation → Edit via `F2`, `Enter`, double-click, or any printable keypress |
| Inline editors | Text (default), number (`<input type="number">`), date (`<input type="date">`) |
| Single-select | Fixed-position portal dropdown; option color chips |
| Multi-select | Fixed-position portal checkbox list |
| Boolean | Click-to-toggle directly in navigation mode |
| Formula bar | Bound to store `editValue`; shows `fieldName[rowIndex]` reference; Enter/Escape commit/cancel |
| Commit pipeline | `commitCell(rowIndex, colIndex, value)` → optimistic patch → adapter call → rollback on error |
| Field lock | Formula/computed fields show 🔒 icon, gray background, blocked from all writes |

### Clipboard & Fill

| Feature | Details |
|---------|---------|
| Copy | `Ctrl+C` — serializes selection to TSV; pasteable directly into Excel/Sheets |
| Paste | `Ctrl+V` — parses TSV from clipboard; maps onto visible columns from active cell anchor |
| Cut | `Ctrl+X` — copy + clear source cells after successful paste |
| Fill handle | 6×6 green square on selection corner; drag to fill — duplicates value or increments numeric/date series |
| Clear cells | `Delete`/`Backspace` on selection; or right-click → Clear Cell(s) |

### Import / Export

See [Import / Export](#import--export) section for full details.

### View & Filtering

| Feature | Details |
|---------|---------|
| Column sort | Click header: ascending → descending → off; indicator shown in header and status bar |
| Text search/filter | Ribbon search box filters visible rows in real time (`searchText` in store) |
| Status bar analytics | Sum, Avg, Min, Max computed client-side for numeric selections via `useMemo` |
| Status bar indicators | Row count, active sort field, active filter indicator |

### Data Integrity

| Feature | Details |
|---------|---------|
| Undo/Redo | 50-step client-side stack (`undoStack` / `redoStack`); `Ctrl+Z` / `Ctrl+Y` |
| Optimistic updates | All mutations apply instantly to store; rolled back on adapter error |
| Error boundary | React class `ErrorBoundary` wraps entire shell; shows "Try again" card on crash |
| Context menu | Right-click cell: Copy, Insert Row Above, Insert Row Below, Delete Row(s), Clear Cell(s) |
| Column header menu | Right-click: Sort A→Z / Z→A, Auto-fit Width, Freeze/Unfreeze, Hide Column, Show All Columns |

### Connection & Settings

| Feature | Details |
|---------|---------|
| Mock mode | Offline; 500 generated rows, 10 typed fields — no Baserow instance required |
| Real Baserow | Server URL + API Token + Database ID stored in `localStorage` |
| Connection panel | Test Connection button (hits `/api/user/`) before saving |
| Hot-switch | Changing adapter config triggers `window.location.reload()` to reinitialise store |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ExcelShellRoute                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Ribbon    │  │  FormulaBar  │  │   SheetTabs    │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌──────────────────────────────────────────────────┐    │
│  │                  VirtualGrid                     │    │
│  │  (column headers / row headers / cell canvas)   │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐     │
│  │                  StatusBar                      │     │
│  └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
              │                        │
     ┌────────▼────────┐    ┌──────────▼──────────┐
     │  useExcelStore  │    │  useAccessStore      │
     │  (Zustand)      │    │  (Zustand, persisted)│
     └────────┬────────┘    └─────────────────────┘
              │
     ┌────────▼────────────────────────────┐
     │         IBaserowAdapter             │
     │  ┌──────────────┐  ┌─────────────┐ │
     │  │ MockAdapter  │  │BaserowAdapter│ │
     │  └──────────────┘  └──────┬──────┘ │
     └──────────────────────────-│────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    BaserowHttpClient    │
                    │  (REST API + WebSocket) │
                    └─────────────────────────┘
```

### Key Design Rules

1. **Grid engine never talks to the backend** — all I/O through `IBaserowAdapter`
2. **UI coordinates are ephemeral** — canonical identity is always `(rowId, fieldId)`
3. **Optimistic-first writes** — store updates instantly; adapter errors trigger rollback
4. **Adapter is swappable at runtime** — `localStorage` key selects mock vs real

---

## Project Structure

```
frontend/
├── src/
│   ├── modules/
│   │   └── excel-shell/
│   │       ├── adapters/
│   │       │   └── baserow/
│   │       │       ├── BaserowAdapter.ts   # Real HTTP adapter
│   │       │       ├── MockAdapter.ts      # 500-row offline mock
│   │       │       └── client.ts           # BaserowHttpClient (get/patch/post/delete)
│   │       ├── components/
│   │       │   ├── AccessModeSelector.tsx  # data-entry / analyst / admin dropdown
│   │       │   ├── ConnectionPanel.tsx     # Baserow connection modal
│   │       │   ├── ErrorBoundary.tsx       # Global error boundary + retry
│   │       │   ├── FormulaBar.tsx          # Active cell reference + edit binding
│   │       │   ├── Ribbon.tsx              # Toolbar (clipboard, rows, import/export, view)
│   │       │   ├── SheetTabs.tsx           # Table tab switcher
│   │       │   ├── ShortcutsHelp.tsx       # Keyboard shortcut overlay (Ctrl+/)
│   │       │   └── StatusBar.tsx           # Row count, analytics, indicators
│   │       ├── grid/
│   │       │   ├── VirtualGrid.tsx         # Virtualized grid engine + all interaction
│   │       │   └── renderers.ts            # Field-type cell renderer registry
│   │       ├── services/
│   │       │   ├── RealtimeService.ts      # WebSocket client (subscribe/reconnect)
│   │       │   └── useRealtime.ts          # React hook bridging WS events → store
│   │       ├── stores/
│   │       │   ├── useExcelStore.ts        # Central Zustand store (all grid state)
│   │       │   └── useAccessStore.ts       # Access mode store (capabilities map)
│   │       ├── types/
│   │       │   └── index.ts                # Canonical types (FieldMeta, RowRecord, etc.)
│   │       └── ExcelShellRoute.tsx         # Top-level route component
│   ├── test/
│   │   ├── unit/
│   │   │   ├── renderers.test.ts           # Cell renderer dispatcher tests
│   │   │   ├── MockAdapter.test.ts         # Mock adapter contract tests
│   │   │   ├── BaserowAdapter.test.ts      # Real adapter (mocked HTTP) tests
│   │   │   ├── client.test.ts              # BaserowHttpClient unit tests
│   │   │   └── store.test.ts               # Zustand store action tests
│   │   ├── e2e/
│   │   │   ├── grid.spec.ts                # Grid render and scroll E2E
│   │   │   └── keyboard.spec.ts            # Keyboard navigation E2E
│   │   └── setup.ts                        # Vitest + Testing Library setup
│   └── App.tsx
├── .prettierrc                             # Prettier config
├── eslint.config.js                        # ESLint flat config (strict TS + React)
├── playwright.config.ts                    # Playwright E2E config
├── vite.config.ts                          # Vite + Vitest config
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 LTS or later
- **npm** 9+
- A running **Baserow** instance (optional — mock mode works offline)

### Installation

```bash
git clone <repo-url>
cd Kasumi/frontend
npm install
```

### Development

```bash
npm run dev
# → http://localhost:5173
```

The app starts in **mock mode** by default — no Baserow connection required.

### Production Build

```bash
npm run build
# Output: dist/ (~232 kB main + 429 kB xlsx lazy chunk)
```

### Preview Production Build

```bash
npm run preview
# → http://localhost:4173
```

---

## Configuration

All runtime configuration is stored in `localStorage`. No `.env` file required.

| Key | Default | Description |
|-----|---------|-------------|
| `kasumi_use_mock` | `"true"` | `"true"` = use MockAdapter; `"false"` = use real Baserow |
| `kasumi_baserow_url` | `""` | Baserow server base URL (e.g. `https://api.baserow.io`) |
| `kasumi_baserow_token` | `""` | Baserow API token (from user settings) |
| `kasumi_baserow_db_id` | `""` | Baserow database ID to load tables from |
| `kasumi_access_mode` | `"analyst"` | Access mode: `data-entry`, `analyst`, or `admin` |

Configure via the **Settings** button in the Ribbon, or set `localStorage` values directly.

---

## Access Modes

Three access modes control what operations are available in the Ribbon:

| Capability | data-entry | analyst | admin |
|-----------|-----------|---------|-------|
| Edit cells | ✅ | ✅ | ✅ |
| Add rows | ✅ | ✅ | ✅ |
| Delete rows | ❌ | ✅ | ✅ |
| Import data | ❌ | ✅ | ✅ |
| Export data | ❌ | ✅ | ✅ |
| Sort columns | ❌ | ✅ | ✅ |
| Hide columns | ❌ | ❌ | ✅ |
| Schema changes | ❌ | ❌ | ✅ |

Switch modes via the **mode badge** in the top-right of the Ribbon. Mode persists to `localStorage`.

---

## Adapter Layer

The `IBaserowAdapter` interface is the only boundary between the grid and the backend:

```ts
interface IBaserowAdapter {
  getTables(databaseId: number): Promise<TableMeta[]>
  getFields(tableId: number): Promise<FieldMeta[]>
  getRows(tableId: number, options?: { search?: string; orderBy?: string; desc?: boolean }): Promise<RowRecord[]>
  updateCell(tableId: number, rowId: number, fieldId: number, value: unknown): Promise<void>
  createRow(tableId: number, values?: Record<string, unknown>): Promise<RowRecord>
  deleteRow(tableId: number, rowId: number): Promise<void>
  batchUpdateRows(tableId: number, updates: Array<{ rowId: number; fieldId: number; value: unknown }>): Promise<void>
}
```

### MockAdapter

`MockAdapter` generates 500 rows with 10 typed fields (text, number, date, boolean, single-select, multi-select, URL, email, phone, formula) entirely in memory. All writes mutate the in-memory dataset and resolve instantly. No network required.

### BaserowAdapter

`BaserowAdapter` maps the interface to Baserow REST endpoints:

| Method | Endpoint |
|--------|----------|
| `getTables` | `GET /api/database/tables/database/{id}/` |
| `getFields` | `GET /api/database/fields/table/{id}/` |
| `getRows` | `GET /api/database/rows/table/{id}/?user_field_names=true` |
| `updateCell` | `PATCH /api/database/rows/table/{id}/{rowId}/?user_field_names=true` |
| `createRow` | `POST /api/database/rows/table/{id}/?user_field_names=true` |
| `deleteRow` | `DELETE /api/database/rows/table/{id}/{rowId}/` |
| `batchUpdateRows` | `PATCH /api/database/rows/table/{id}/batch/?user_field_names=true` |

---

## Real-Time Collaboration

When connected to a real Baserow instance, `RealtimeService` maintains a WebSocket subscription:

- **Auto-reconnect** with exponential back-off (3s → 30s cap)
- **Per-table subscribe/unsubscribe** as the user switches sheet tabs
- **Event handling:**

| Baserow Event | Effect |
|--------------|--------|
| `row_updated` | Inline patch of affected row in store (no full reload) |
| `row_deleted` | Remove row from store |
| `row_created` | Full `loadSheet()` reload (ensures correct ordering) |
| `field_*` | Full `loadSheet()` reload (schema change) |

Real-time is **automatically disabled** when:
- Mock mode is active (`kasumi_use_mock = "true"`)
- No API token is configured

---

## Import / Export

### Export to CSV

Exports currently loaded rows with visible column headers. Triggers browser download as `export.csv`.

### Export to XLSX

Lazily loads the `xlsx` library (429 kB separate chunk, not in initial bundle). Exports to `export.xlsx` with one sheet, header row, and all visible data.

### Import from CSV

1. Select file via Ribbon → Import → CSV
2. First row is treated as header row
3. Columns are mapped to table fields by **exact header name match** (case-insensitive)
4. Unmatched columns are silently skipped
5. Rows are appended via `createRow` calls

### Import from XLSX

1. Select file via Ribbon → Import → XLSX
2. First sheet is used
3. First row is treated as header row
4. Same column-matching logic as CSV import

---

## Keyboard Shortcuts

Press **`Ctrl+/`** in the app to view the full interactive reference. Summary:

### Navigation
| Key | Action |
|-----|--------|
| `Arrow Keys` | Move active cell |
| `Tab` / `Shift+Tab` | Move right / left |
| `Enter` / `Shift+Enter` | Move down / up |
| `Ctrl+Home` | Jump to first cell |
| `Ctrl+End` | Jump to last cell |
| `Home` / `End` | Row start / row end |

### Selection
| Key | Action |
|-----|--------|
| `Shift+Arrow` | Extend selection |
| `Shift+Click` | Extend selection to clicked cell |
| `Ctrl+A` | Select all cells |
| Click row number | Select entire row |

### Editing
| Key | Action |
|-----|--------|
| `F2` | Enter edit mode |
| Any printable key | Replace and enter edit mode |
| `Double-click` | Enter edit mode |
| `Enter` / `Tab` | Commit and advance |
| `Escape` | Cancel edit |
| `Delete` / `Backspace` | Clear selected cells |

### Clipboard & History
| Key | Action |
|-----|--------|
| `Ctrl+C` | Copy selection as TSV |
| `Ctrl+V` | Paste TSV from clipboard |
| `Ctrl+X` | Cut (copy + clear) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |

---

## Testing

### Unit Tests (Vitest + Testing Library)

```bash
npm test                # Run all unit tests once
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report (V8)
npm run test:ui         # Vitest browser UI
```

**77 tests across 5 files:**

| File | Coverage |
|------|----------|
| `renderers.test.ts` | All field type renderer outputs |
| `MockAdapter.test.ts` | CRUD contract, row generation, field types |
| `BaserowAdapter.test.ts` | HTTP mapping, error handling, response normalisation |
| `client.test.ts` | `BaserowHttpClient` get/patch/post/delete, auth headers |
| `store.test.ts` | Zustand store actions (load, edit, sort, undo/redo, import/export) |

### E2E Tests (Playwright)

```bash
npm run test:e2e        # Headless
npm run test:e2e:ui     # Interactive Playwright UI
```

| File | Coverage |
|------|----------|
| `grid.spec.ts` | Grid renders, sheet tabs load, search filters rows |
| `keyboard.spec.ts` | Arrow navigation, Enter edit mode, Escape cancel, Ctrl+A |

### Code Quality

```bash
npm run lint            # ESLint (0 errors enforced; max 20 warnings)
npm run lint:fix        # Auto-fix
npm run format          # Prettier write
npm run format:check    # Prettier check (CI)
```

---

## Scripts Reference

```bash
npm run dev             # Vite dev server (HMR)
npm run build           # TypeScript check + Vite production build
npm run preview         # Serve production build locally
npm run lint            # ESLint strict check
npm run lint:fix        # ESLint auto-fix
npm run format          # Prettier format all src files
npm run format:check    # Prettier check (non-destructive)
npm test                # Vitest unit tests (run once)
npm run test:watch      # Vitest watch mode
npm run test:ui         # Vitest browser UI
npm run test:coverage   # Coverage report
npm run test:e2e        # Playwright E2E (headless)
npm run test:e2e:ui     # Playwright E2E (interactive)
```

---

## GitHub Readiness

### What's included

- ✅ Clean production build (`npm run build`)
- ✅ 77 passing unit tests
- ✅ E2E test suite (Playwright)
- ✅ ESLint strict config (0 errors)
- ✅ Prettier formatting config
- ✅ Full TypeScript — no implicit `any`
- ✅ Lazy-loaded XLSX chunk (keeps initial bundle small)
- ✅ `private: true` in `package.json` (no accidental npm publish)

### Recommended before publishing

- [ ] Add `.github/workflows/ci.yml` (lint + test on PR)
- [ ] Add `CONTRIBUTING.md`
- [ ] Add `LICENSE` file
- [ ] Add `.env.example` if switching from localStorage to env vars
- [ ] Pin dependency versions (`npm shrinkwrap` or audit `package-lock.json`)
- [ ] Run `npm audit` and resolve any high/critical vulnerabilities

---

*Kasumi Nexcel — Excel-grade interaction shell over a structured, AI-native backend.*
