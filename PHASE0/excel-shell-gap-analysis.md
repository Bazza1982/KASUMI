# Excel Shell Gap Analysis

## Current Implementation vs Target

### Current State
The existing virtual grid (`grid/VirtualGrid.tsx`) is a generic spreadsheet UI with:
- Virtualized rows and columns via `@tanstack/react-virtual`
- Simple in-memory cell store (string key `"row,col"` → `{ value: string }`)
- Basic keyboard navigation (arrows, Enter, Escape, Delete, paste)
- Shift+click / drag selection
- Hardcoded 1000 rows × 100 columns (not backed by real data)
- `useExcelStore` holds a flat `cells` map with no concept of fields or row identity

### Target State
A Baserow-connected Excel-like shell with:
- Row identity (`row.id`) and field identity (`field.id`) — not positional string keys
- Typed field system (text, number, boolean, date, select, etc.)
- Pluggable adapter layer (`IBaserowAdapter`) with real HTTP + mock variants
- Proper coordinate abstraction: `GridCoord` (UI) ↔ `CellRef` (canonical)
- Paginated row loading with lazy fetch
- Optimistic updates with rollback on error
- Batch update support
- Table/view switcher (SheetTabs → real Baserow tables)
- Formula bar showing field name + current value
- Status bar showing row count and selection size
- Cell renderers for each field type (chips for select, checkboxes for boolean, etc.)
- WebSocket real-time sync (future)

---

## Gaps by Category

### 1. Data Layer (Critical)
| Gap | Status |
|-----|--------|
| No Baserow API client | Missing — need `BaserowHttpClient` |
| No adapter abstraction (`IBaserowAdapter`) | Missing |
| No mock adapter for offline dev | Missing |
| Cells stored as positional strings, not by row/field id | Wrong model |
| No field metadata loaded | Missing |
| No pagination | Missing |

### 2. Type System (Critical)
| Gap | Status |
|-----|--------|
| No `FieldMeta` type | Missing |
| No `RowRecord` type | Missing |
| No `TableMeta` / `ViewMeta` | Missing |
| No `GridCoord` / `CellRef` / `SelectionRange` | Missing |
| No `SheetContext` | Missing |
| No `CoordMap` helpers | Missing |

### 3. Store (Critical)
| Gap | Status |
|-----|--------|
| `useExcelStore` has no table/field/row loading | Missing |
| `updateCell` writes to local map only | No API call |
| No `commitCell` / `batchUpdate` / `clearCells` / `pasteGrid` | Missing |
| No `isEditing` state in store (held locally in component) | Wrong location |
| No `loadTables` / `loadSheet` | Missing |
| No optimistic update + rollback | Missing |

### 4. Grid Component (High)
| Gap | Status |
|-----|--------|
| Cell renders only plain string value | No typed renderers |
| Column headers show A/B/C... not field names | Wrong |
| No select chip rendering | Missing |
| No boolean checkbox rendering | Missing |
| No number right-alignment | Missing |
| `isEditing` state lives in component, not store | Fragmented |
| Row count / col count hardcoded | Wrong |

### 5. Shell Components (Medium)
| Gap | Status |
|-----|--------|
| `SheetTabs` shows hardcoded tabs | Not connected to tables |
| `StatusBar` shows static text | Not connected to store |
| `FormulaBar` is a stub | Not connected to store |

### 6. Architecture (Medium)
| Gap | Status |
|-----|--------|
| No `adapters/` directory | Missing |
| No `types/index.ts` | Missing |
| No `grid/renderers.ts` | Missing |
| No PHASE0 docs | Missing |

---

## Phase 0 Deliverables (this implementation)

1. `types/index.ts` — all canonical types
2. `adapters/baserow/client.ts` — HTTP client
3. `adapters/baserow/BaserowAdapter.ts` — real adapter
4. `adapters/baserow/MockAdapter.ts` — mock adapter with 500 rows
5. `grid/renderers.ts` — typed cell renderers
6. `stores/useExcelStore.ts` — complete rewrite with adapter integration
7. `grid/VirtualGrid.tsx` — rewrite connected to store
8. `components/SheetTabs.tsx` — connected to `tables` store state
9. `components/StatusBar.tsx` — connected to store
10. `components/FormulaBar.tsx` — connected to store

## Out of Scope for Phase 0
- WebSocket real-time sync
- Column resizing
- Row creation / deletion UI
- Filter / sort UI
- Formula evaluation
- File / link_row field editors
- Authentication UI (token entry)
- Virtual infinite scroll beyond first 200 rows
