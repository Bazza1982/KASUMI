# KASUMI — Menu Implementation Plan

> Goal: Turn all placeholder menu bars and ribbon items into real, working functionality.
> Scope: Nexcel menu bar · WORDO menu bar · Nexcel ribbon gaps · WORDO ribbon gaps
> Last updated: 2026-03-24

---

## Current State Summary

### What's already working (ribbon)
| Shell | Working |
|-------|---------|
| Nexcel | Copy, Add Row, Delete Row, Export CSV/XLSX, Import CSV/XLSX, Freeze Col, Help, Search, Connect/Settings |
| WORDO | Headings, Bold, Italic, Code, Bullet/Ordered List, Blockquote, Table, Section Break, Page Settings, Nexcel Embed, Import/Export .docx, Export PDF |

### What's placeholder
| Location | Item | Notes |
|----------|------|-------|
| Nexcel ribbon | Paste | Clipboard read not wired |
| Nexcel ribbon | Cut | Store action missing |
| Nexcel ribbon | Bold / Italic | Disabled — no cell format layer yet |
| Nexcel menu bar | All 9 menus | Visual-only, no dropdowns |
| WORDO ribbon | Font size selector | Dropdown exists, no ProseMirror binding |
| WORDO ribbon | View modes (Read/Print/Web) | Visual-only |
| WORDO ribbon | Language selector | Static "English (AU)" |
| WORDO menu bar | All 11 menus | Visual-only, no dropdowns |

---

## Implementation Strategy

The menu bars should become **real dropdown menus** that call the **same store actions and callbacks** already used by the ribbon — no new business logic needed for most items. New logic is only needed for genuinely missing features (Cut, Paste, font size, view modes).

Use a shared `<DropdownMenu>` component that both shells can import.

---

## Phase 1 — Shared Dropdown Infrastructure

**Effort: ~1 day**

Build one reusable dropdown menu component that both shells use. This eliminates duplication.

### Deliverables

**`src/components/ui/DropdownMenu.tsx`**
- Props: `label`, `items: MenuItem[]`, `isActive`, `onOpen`
- `MenuItem` type: `{ label, icon?, action?, shortcut?, disabled?, separator?, children?: MenuItem[] }`
- Supports nested submenus (one level deep)
- Closes on outside click (via `useClickOutside`)
- Keyboard nav: Arrow Up/Down, Enter, Escape
- Styled to match existing KASUMI design tokens

**`src/components/ui/MenuBar.tsx`**
- Wrapper that renders a row of `DropdownMenu` items
- Manages which menu is open (only one at a time)
- Passes `isActive` down

### Why shared
Both `ExcelShellRoute.tsx` and `WordoShellRoute.tsx` already have identical `activeMenu` state and the same visual pattern — they should both use this component.

---

## Phase 2 — Nexcel Menu Bar

**Effort: ~2 days**

Wire all 9 Nexcel menus. Most actions already exist in `useExcelStore`.

### File menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| New | Reset store to empty state | Needs store action |
| Import CSV | Trigger existing CSV import | ✅ `importCsv()` |
| Import XLSX | Trigger existing XLSX import | ✅ `importXlsx()` |
| Export CSV | ✅ `exportToCsv()` | ✅ |
| Export XLSX | ✅ `exportToXlsx()` | ✅ |
| Print | `window.print()` | Simple |
| ─── | separator | — |
| Close / Exit | Electron: `window.kasumi.close()` / browser: noop | Conditional |

### Home menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Cut | Phase 3 (see below) | ❌ |
| Copy | ✅ clipboard store | ✅ |
| Paste | Phase 3 | ❌ |
| ─── | separator | — |
| Bold | Phase 4 (cell format) | ❌ |
| Italic | Phase 4 | ❌ |
| ─── | separator | — |
| Insert Row | ✅ `addRow()` | ✅ |
| Delete Row | ✅ `deleteSelectedRows()` | ✅ |

### Insert menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Insert Row Above | Needs store action | Partial |
| Insert Row Below | Needs store action | Partial |
| Insert Column | Out of scope (schema change) | ❌ defer |

### Page Layout menu
| Item | Action | Note |
|------|--------|------|
| Print Area / Print | `window.print()` | Simple |
| Freeze First Column | ✅ `toggleFreezeFirstCol()` | ✅ |
| Freeze First Row | Needs store action | Small |

### Formulas menu
| Item | Action | Note |
|------|--------|------|
| (All items) | Defer to v2.0 AI layer | Out of scope now |
| Show formula bar | Toggle formula bar visibility | Small |

### Data menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Sort A→Z | ✅ `sortColumn()` ascending | ✅ (needs column picker) |
| Sort Z→A | ✅ `sortColumn()` descending | ✅ (needs column picker) |
| Filter | ✅ `setSearchText()` (reuse search) | Partial |
| Import CSV | ✅ | ✅ |
| Import XLSX | ✅ | ✅ |

### Review menu
| Item | Action | Note |
|------|--------|------|
| Undo | ✅ `undo()` | ✅ |
| Redo | ✅ `redo()` | ✅ |

### View menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Freeze First Column | ✅ `toggleFreezeFirstCol()` | ✅ |
| Show / Hide Columns | ✅ column visibility in store | ✅ |
| Zoom In / Out | CSS `transform: scale()` on grid | Small |

### Help menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Keyboard Shortcuts | ✅ `onHelp()` callback | ✅ |
| About KASUMI | Simple modal | Small |

---

## Phase 3 — Nexcel Ribbon Gaps (Cut / Paste)

**Effort: ~0.5 days**

### Cut
- Mark selected cells as "cut" in store (visual dashed border)
- On next Paste: move data to new location, clear source
- Store actions needed: `cutSelection()`, extend existing `pasteFromClipboard()`

### Paste
- Already reads from `navigator.clipboard` for external paste (existing copy path)
- Wire the Paste ribbon button to `pasteFromClipboard()` store action
- Handle both: internal cut-paste and external clipboard TSV paste

---

## Phase 4 — WORDO Menu Bar

**Effort: ~2 days**

Wire all 11 WORDO menus. Most actions already exist via ProseMirror commands and the WORDO store.

### File menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| New Document | Reset WORDO store | Needs action |
| Import .docx | ✅ `onImportDocx()` | ✅ |
| Export .docx | ✅ `onExportDocx()` | ✅ |
| Export PDF | ✅ `onExportPdf()` | ✅ |
| Print | `window.print()` | Simple |

### Home menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Bold | ✅ ProseMirror `toggleMark(strong)` | ✅ |
| Italic | ✅ ProseMirror `toggleMark(em)` | ✅ |
| Code | ✅ ProseMirror `toggleMark(code)` | ✅ |
| Heading H1–H6 | ✅ `setBlockType(heading)` | ✅ |
| Normal text | ✅ `setBlockType(paragraph)` | ✅ |
| Bullet list | ✅ `wrapInList(bullet_list)` | ✅ |
| Ordered list | ✅ `wrapInList(ordered_list)` | ✅ |
| Blockquote | ✅ `wrapIn(blockquote)` | ✅ |

### Insert menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Table | ✅ insert 3×3 table | ✅ |
| Section Break | ✅ `addSection()` | ✅ |
| Nexcel Embed | ✅ `onInsertNexcel()` | ✅ |
| Header / Footer | Open page settings panel → header/footer tab | ✅ (partial) |
| Page Number | Insert `{{page}}` token into header/footer | Small |
| Code Block | ProseMirror `code_block` node | Small |

### Draw menu
| Item | Action | Note |
|------|--------|------|
| (All items) | Defer — no canvas/SVG layer yet | Out of scope |

### Design menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Watermark | ✅ watermark in page settings | ✅ (surface via menu) |
| Page Color | CSS background on `.wordo-page` | Small |
| Page Borders | CSS border on `.wordo-page` | Small |

### Layout menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Page Setup (size, orientation) | ✅ `onPageSettings()` | ✅ |
| Margins | ✅ margin controls in page settings | ✅ |
| Columns (1/2/3 col layout) | CSS column-count on section | Small |

### References menu
| Item | Action | Note |
|------|--------|------|
| Table of Contents | Auto-generate from H1–H3 (Outline already exists) | Medium — v1.3 |
| Footnote | Defer | Out of scope |

### Mailings menu
| Item | Action | Note |
|------|--------|------|
| (All items) | Defer — mail merge out of scope | Out of scope |

### Review menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Undo | ProseMirror undo | ✅ (Ctrl+Z works) |
| Redo | ProseMirror redo | ✅ |
| Word Count | Count words across all sections | Small |

### View menu
| Item | Action | Already exists? |
|------|--------|-----------------|
| Read Mode | Phase 5 (view modes) | Partial |
| Print Layout | Phase 5 | Partial |
| Web Layout | Phase 5 | Partial |
| Show Outline | Toggle outline panel | ✅ (already toggleable) |
| Zoom | Phase 5 | Partial |

### Help menu
| Item | Action | Note |
|------|--------|------|
| Keyboard Shortcuts | Modal with WORDO shortcuts | Small |
| About KASUMI | Same modal as Nexcel | ✅ (shared) |

---

## Phase 5 — WORDO Ribbon Gaps

**Effort: ~1 day**

### Font size selector
- Hook the existing size dropdown to a ProseMirror custom mark `font_size`
- Add `font_size` mark to WORDO schema with `attrs: { size: string }`
- Apply via `toggleMark(schema.marks.font_size, { size: '16px' })`
- Update test suite (`wordoRibbon.test.tsx`)

### View modes (Read / Print / Web)
| Mode | Behaviour |
|------|-----------|
| **Read** | Hide ribbon, hide outline panel, read-only, clean typography |
| **Print Layout** | Current default — show page boundaries |
| **Web** | Remove page boundaries, fluid width, continuous scroll |
- Persist active mode to `localStorage` via WORDO store
- Add `viewMode: 'read' | 'print' | 'web'` to store state

### Language selector
- Populate with: English (AU), English (US), English (UK), 中文 (Simplified)
- Persist to store, expose via `document.documentElement.lang`
- Actual spell-check: browser `spellcheck` attribute (no custom dictionary needed for MVP)

---

## Phase 6 — Polish & Tests

**Effort: ~1 day**

- Update unit tests for new store actions (Cut, Paste, font size, view mode)
- E2E: smoke test each menu opens and at least one item in each menu works
- Keyboard accessibility: all menus navigable with Tab + Arrow + Enter + Escape
- Verify access control: menu items respect `data-entry / analyst / admin` same as ribbon

---

## Delivery Order (recommended)

```
Phase 1 → Phase 2 → Phase 4 → Phase 3 → Phase 5 → Phase 6
(infra)   (Nexcel)  (WORDO)   (Cut/Paste) (gaps)   (tests)
```

Phases 2 and 4 can overlap if working in parallel.

---

## Out of Scope (deferred)

| Feature | Reason |
|---------|--------|
| Nexcel Bold/Italic cell format | Requires new cell format layer — v1.3 |
| Formulas menu (SUM, AVERAGE etc.) | AI layer replaces this — v2.0 |
| Insert Column (Nexcel) | Baserow schema change — v1.4 |
| Draw menu (WORDO) | No canvas layer — v1.3+ |
| Mailings menu | Mail merge out of scope |
| References → Footnote | Out of scope |
| Table of Contents (auto) | v1.3 (Outline panel already exists as foundation) |

---

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| 1 — Dropdown infrastructure | 1 day |
| 2 — Nexcel menu bar | 2 days |
| 3 — Nexcel Cut/Paste | 0.5 days |
| 4 — WORDO menu bar | 2 days |
| 5 — WORDO ribbon gaps | 1 day |
| 6 — Polish & tests | 1 day |
| **Total** | **~7.5 days** |
