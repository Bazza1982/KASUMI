# KASUMI Intelligent Workspace Platform

**KASUMI** is an AI-native, enterprise-grade desktop workspace platform comprising two integrated shells:

- **KASUMI Nexcel** — Excel-like spreadsheet shell over a structured database backend
- **KASUMI WORDO** — Word-like document editor with AI-first document semantics

> The frontend looks like Office. The backend stays structured and AI-native. Both shells share a unified platform layer so data flows freely between them.

---

## Contents

- [Vision](#vision)
- [Platform Architecture](#platform-architecture)
- [KASUMI Nexcel](#kasumi-nexcel)
- [KASUMI WORDO](#kasumi-wordo)
- [Shell Switcher & Brand UI](#shell-switcher--brand-ui)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Access Modes](#access-modes)
- [Testing](#testing)
- [Scripts Reference](#scripts-reference)
- [Roadmap](#roadmap)

---

## Vision

KASUMI eliminates the friction between **database-thinking** and **document-acting**. Users interact with data using familiar Office patterns — keyboard shortcuts, range selections, rich-text editing, page layout — while the system validates every write against a typed schema and AI agents operate against stable, structured data contracts.

**Non-goals (by design):**
- VBA / macros
- Full formula engine
- Pivot tables
- Freeform computation that bypasses data contracts

These are excluded because AI agents replace the advanced analytical and authoring layers, requiring deterministic operations and stable data semantics.

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KASUMI Platform                           │
│  ┌────────────────────┐    ┌────────────────────────────┐   │
│  │   Nexcel Shell     │    │       WORDO Shell          │   │
│  │  (Excel-like grid) │    │  (Word-like document)      │   │
│  └────────┬───────────┘    └──────────────┬─────────────┘   │
│           │                               │                 │
│  ┌────────▼───────────────────────────────▼─────────────┐   │
│  │                   platform/                           │   │
│  │  object-registry · command-bus · access-control       │   │
│  │  realtime · baserow adapters · shared types           │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key Platform Modules

| Module | Purpose |
|--------|---------|
| `platform/object-registry` | Stable object ID system shared across both shells |
| `platform/command-bus` | Typed AI + user command routing |
| `platform/access-control` | Unified permission model (data-entry / analyst / admin) |
| `platform/realtime` | WebSocket abstraction (Baserow real-time events) |
| `platform/adapters` | Baserow REST adapter + MockAdapter |
| `platform/types` | Canonical shared types |

---

## KASUMI Nexcel

Enterprise-grade Excel shell over [Baserow](https://baserow.io), delivering familiar spreadsheet interaction while preserving structured, AI-native data semantics.

### Grid Engine

| Feature | Details |
|---------|---------|
| Virtualized rendering | `@tanstack/react-virtual` for both axes — handles 10,000+ rows without DOM explosion |
| Sticky headers | Fixed header bar synced to scroll container via DOM ref |
| Column resize | Drag handle on header right edge |
| Auto-fit column | Double-click or right-click → Auto-fit Width |
| Frozen columns | CSS `position: sticky` with computed left offsets |
| Hidden columns | Toggle via right-click header menu |
| Field type rendering | Registry-based dispatcher — text, number, date, boolean, single/multi-select, URL, email, phone, formula |

### Selection & Editing

| Feature | Details |
|---------|---------|
| Range selection | Anchor + focus model; `Shift+Click`, `Shift+Arrow`, click-drag |
| Inline editors | Text, number, date, single-select portal, multi-select portal, boolean toggle |
| Formula bar | Bound to store `editValue`; shows `fieldName[rowIndex]` reference |
| Commit pipeline | Optimistic patch → adapter call → rollback on error |
| Field lock | Formula/computed fields blocked from writes (🔒 icon) |

### Clipboard, Fill & History

| Feature | Details |
|---------|---------|
| Copy / Paste / Cut | TSV-compatible — pasteable into Excel/Sheets |
| Fill handle | 6×6 green square; drag to fill or increment numeric/date series |
| Undo / Redo | 50-step client-side stack (`Ctrl+Z` / `Ctrl+Y`) |

### Import / Export

| Format | Import | Export |
|--------|--------|--------|
| CSV | ✅ Header-matched column mapping | ✅ Browser download |
| XLSX | ✅ First sheet, header-matched | ✅ Lazy-loaded xlsx chunk |

### Nexcel Keyboard Shortcuts

Press `Ctrl+/` in the app for the full interactive reference.

| Key | Action |
|-----|--------|
| `Arrow Keys` | Move active cell |
| `Tab` / `Shift+Tab` | Move right / left |
| `Ctrl+Home` / `Ctrl+End` | Jump to first / last cell |
| `F2` / printable key | Enter edit mode |
| `Ctrl+C/V/X` | Copy / Paste / Cut |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+A` | Select all |

### Connection Modes

| Mode | Description |
|------|-------------|
| **Mock mode** (default) | 500 generated rows, 10 typed fields — no Baserow required |
| **Baserow** | Server URL + API Token + Database ID via Settings panel |

---

## KASUMI WORDO

Word-like document editor built on ProseMirror with a Section-per-instance architecture and first-class Nexcel data embedding.

### Document Model

WORDO uses a canonical **Kasumi Document IR**:

```
KasumiDocument
  └─ DocumentSection[]       ← each section = one ProseMirror instance
       └─ AnyBlock[]         ← paragraph, heading, list, table, quote, code, nexcel_embed
```

Each `DocumentSection` is an independent ProseMirror instance managed by the **Layout Orchestrator**. This provides:
- Performance isolation (edits on section 1 don't reflow section 50)
- Precise AI targeting via `section_id`
- Natural section break semantics (different headers/footers, page orientation)

### Editor Features

| Feature | Details |
|---------|---------|
| Rich text blocks | Paragraph, Heading H1–H6, Bullet list, Ordered list, Blockquote, Code block |
| Table | ProseMirror native table with cell selection |
| Section breaks | Insert section break → new ProseMirror instance with independent settings |
| Outline panel | Live H1–H6 heading tree; click to jump to section |
| Header / Footer | Independent ProseMirror instances per section; supports page number tokens |
| Watermark | Text, opacity, angle — absolutely positioned overlay |
| Page settings | A4 / A3 / Letter / Legal; portrait / landscape; margin control (mm) |

### Nexcel Data Embedding

WORDO documents can embed live Nexcel data in two modes:

| Mode | Behaviour |
|------|-----------|
| **Snapshot** | Point-in-time copy of Nexcel table data; static in document |
| **Live Link** | Subscribes to Nexcel store; renders current data on each view |

Embedded tables are rendered as `NexcelEmbedView` ProseMirror NodeViews and appear inline in the document flow.

### Import / Export

| Format | Direction | Notes |
|--------|-----------|-------|
| `.docx` | Export | `docx` library — all block types mapped, includes header/footer |
| `.docx` | Import | `mammoth` → HTML → ProseMirror; multi-section support |
| `.pdf` | Export | Browser print dialog with `@media print` pagination |

### AI Command System

WORDO exposes 17 typed commands through the platform command-bus:

| Command | Description |
|---------|-------------|
| `InsertBlock` | Insert any block type at a given position |
| `DeleteBlock` | Remove a block by ID |
| `RewriteBlock` | Replace block content via AI-generated text |
| `InsertNexcelEmbed` | Embed a Nexcel table (snapshot or live) |
| `InsertSectionBreak` | Add a new document section |
| `UpdatePageSettings` | Change paper size / orientation / margins |
| `SetWatermark` | Apply or remove watermark |
| `UpdateHeaderFooter` | Modify header/footer content |
| + 9 more | See `platform/command-bus` for full list |

All AI commands operate through validated typed operations — they never touch the DOM directly.

### WORDO Access Control

| Capability | data-entry | analyst | admin |
|------------|-----------|---------|-------|
| Edit text | ✅ | ✅ | ✅ |
| Insert blocks | ✅ | ✅ | ✅ |
| Delete blocks | ❌ | ✅ | ✅ |
| Insert Nexcel embed | ❌ | ✅ | ✅ |
| Import .docx | ❌ | ✅ | ✅ |
| Export .docx / .pdf | ❌ | ✅ | ✅ |
| Insert section break | ❌ | ✅ | ✅ |
| Edit header / footer | ❌ | ❌ | ✅ |
| Set watermark | ❌ | ❌ | ✅ |
| Change page settings | ❌ | ❌ | ✅ |
| AI rewrite | ❌ | ✅ | ✅ |
| Schema / template changes | ❌ | ❌ | ✅ |

---

## Shell Switcher & Brand UI

The app launches with a **KASUMI Splash Screen** (1.6s, once per session), then shows the unified shell switcher:

```
KASUMI  [NEXCEL]  WORDO       ← active shell highlighted
KASUMI  NEXCEL   [WORDO]      ← when WORDO is active
```

**Design Token system** — all colours, spacing, and brand values are defined as CSS custom properties:

| Token prefix | Scope |
|---|---|
| `--kasumi-brand-*` | Platform-wide brand colours |
| `--nexcel-primary` | Nexcel accent colour (blue) |
| `--wordo-primary` | WORDO accent colour (purple) |

---

## Project Structure

```
Kasumi/
├── README.MD
├── ROADMAP.md
├── NEXCEL_PLAN.MD
├── WORDO_PLAN.MD
└── frontend/
    ├── src/
    │   ├── platform/                        ← Shared platform layer
    │   │   ├── object-registry/             # Stable cross-shell object IDs
    │   │   ├── command-bus/                 # Typed AI + user command routing
    │   │   ├── access-control/              # Unified permission model
    │   │   ├── realtime/                    # WebSocket abstraction
    │   │   ├── adapters/                    # Baserow + Mock adapters
    │   │   ├── native/                      # Electron native bridge
    │   │   └── types/                       # Shared canonical types
    │   │
    │   ├── modules/
    │   │   ├── excel-shell/                 ← KASUMI Nexcel
    │   │   │   ├── adapters/baserow/        # BaserowAdapter + MockAdapter + client
    │   │   │   ├── components/              # Ribbon, FormulaBar, SheetTabs, StatusBar...
    │   │   │   ├── grid/                    # VirtualGrid + renderers
    │   │   │   ├── services/                # RealtimeService + useRealtime
    │   │   │   ├── stores/                  # useExcelStore + useAccessStore
    │   │   │   └── ExcelShellRoute.tsx
    │   │   │
    │   │   └── wordo-shell/                 ← KASUMI WORDO
    │   │       ├── components/              # WordoRibbon, OutlinePanel, PageSettingsPanel...
    │   │       ├── editor/                  # SectionEditor, LayoutOrchestrator, schema, plugins
    │   │       ├── services/
    │   │       ├── stores/                  # useWordoStore + useWordoAccessStore
    │   │       ├── types/                   # Document IR types + commands
    │   │       └── WordoShellRoute.tsx
    │   │
    │   ├── test/
    │   │   ├── unit/                        # 166 unit tests (77 Nexcel + 89 WORDO)
    │   │   └── e2e/                         # Playwright E2E suite
    │   │
    │   ├── App.tsx                          # Shell switcher + Splash screen
    │   ├── index.css                        # Design Token system + global styles
    │   └── main.tsx
    │
    ├── electron/                            ← Electron desktop wrapper
    │   ├── main.ts                          # BrowserWindow + IPC + native menus
    │   └── preload.ts                       # contextBridge → window.kasumi
    │
    ├── vite.config.ts
    ├── playwright.config.ts
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

### Development (Browser)

```bash
npm run dev
# → http://localhost:5173
```

Starts in **mock mode** by default — no Baserow connection required. Both Nexcel and WORDO shells are available immediately.

### Development (Electron)

```bash
ELECTRON=true npm run electron:dev
```

### Production Build

```bash
npm run build
# Output: dist/
```

### Electron Desktop Package (Windows)

```bash
ELECTRON=true npm run electron:build
# Output: dist-electron/ (.exe NSIS installer)
```

---

## Configuration

All runtime configuration is stored in `localStorage`. No `.env` file required.

| Key | Default | Description |
|-----|---------|-------------|
| `kasumi_use_mock` | `"true"` | `"true"` = MockAdapter; `"false"` = real Baserow |
| `kasumi_baserow_url` | `""` | Baserow server base URL |
| `kasumi_baserow_token` | `""` | Baserow API token |
| `kasumi_baserow_db_id` | `""` | Baserow database ID |
| `kasumi_access_mode` | `"analyst"` | `data-entry` / `analyst` / `admin` |
| `kasumi_active_shell` | `"nexcel"` | Last active shell (`nexcel` / `wordo`) |

Configure via the **Settings** button in the Ribbon, or set values directly in `localStorage`.

---

## Access Modes

Three access modes apply across both shells. Shell-specific capabilities are layered on top.

| Capability | data-entry | analyst | admin |
|------------|-----------|---------|-------|
| Edit content | ✅ | ✅ | ✅ |
| Add / insert | ✅ | ✅ | ✅ |
| Delete | ❌ | ✅ | ✅ |
| Import data | ❌ | ✅ | ✅ |
| Export data | ❌ | ✅ | ✅ |
| Schema / layout changes | ❌ | ❌ | ✅ |

Switch mode via the **mode badge** in the Ribbon. Mode persists to `localStorage`.

---

## Testing

### Unit Tests

```bash
npm test                 # Run all unit tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (V8)
npm run test:ui          # Vitest browser UI
```

**166 tests across both shells:**

| Suite | File | Coverage |
|-------|------|----------|
| **Nexcel** | `renderers.test.ts` | Field type renderer outputs |
| | `MockAdapter.test.ts` | CRUD contract + field types |
| | `BaserowAdapter.test.ts` | HTTP mapping + error handling |
| | `client.test.ts` | BaserowHttpClient all methods |
| | `store.test.ts` | Zustand actions (load, edit, sort, undo/redo) |
| **WORDO** | `wordo-accessStore.test.ts` | 12 WORDO capabilities × 3 access modes |
| | `layoutOrchestrator.test.ts` | Section management + content flow |
| | `docxImporter.test.ts` | mammoth → ProseMirror conversion |
| | `wordo-store.test.ts` | Document store actions |
| | `wordoRibbon.test.ts` | Ribbon button rendering + access gating |

### E2E Tests

```bash
npm run test:e2e         # Headless Playwright
npm run test:e2e:ui      # Interactive Playwright UI
```

### Code Quality

```bash
npm run lint             # ESLint (0 errors enforced)
npm run lint:fix         # Auto-fix
npm run format           # Prettier write
npm run format:check     # Prettier check (CI)
```

---

## Scripts Reference

```bash
npm run dev              # Vite dev server (HMR) → localhost:5173
npm run build            # TypeScript check + Vite production build
npm run preview          # Serve production build locally
npm run lint             # ESLint strict check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check (non-destructive)
npm test                 # Vitest unit tests
npm run test:watch       # Vitest watch mode
npm run test:ui          # Vitest browser UI
npm run test:coverage    # Coverage report
npm run test:e2e         # Playwright E2E (headless)
npm run test:e2e:ui      # Playwright E2E (interactive)
ELECTRON=true npm run electron:dev    # Electron dev mode
ELECTRON=true npm run electron:build  # Electron production build
```

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full release plan.

**Current status: v1.2-beta complete** — dual-shell platform with 166 passing tests.

**Next milestone: v1.2 release** — Electron desktop packaging (Windows `.exe`).

Planned: Dark mode, i18n, WORDO table of contents, comments/annotations, and AI-native query layer (v2.0).

---

*KASUMI — Intelligent Workspace Platform. Excel-grade grids. Word-grade documents. AI-native backend.*
