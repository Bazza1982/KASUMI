# KASUMI Frontend Behavioural Parity Upgrade Plan

## Executive Summary

KASUMI already contains substantial spreadsheet and document functionality. NEXCEL has a capable virtualized grid with editing, clipboard, fill, formatting, and sheet switching. WORDO has a solid ProseMirror-based editor with section isolation, comments, track changes, layout controls, and export/import flows.

The main issue is not lack of features. The main issue is that interaction behaviour is still fragmented across components, stores, and direct event handlers. As a result, KASUMI looks Office-like in many places but does not yet behave with consistent Excel/Word-like operational logic.

The upgrade should focus on interaction engine replication and behavioural parity, not cosmetic redesign. The highest-value work is to centralize active focus model, selection semantics, command routing, document/sheet lifecycle, and command-based undo/redo.

This plan is based on the current implementation in the repo, especially:

- `frontend/src/App.tsx`
- `frontend/src/modules/excel-shell/ExcelShellRoute.tsx`
- `frontend/src/modules/excel-shell/grid/VirtualGrid.tsx`
- `frontend/src/modules/excel-shell/stores/useExcelStore.ts`
- `frontend/src/modules/wordo-shell/WordoShellRoute.tsx`
- `frontend/src/modules/wordo-shell/editor/SectionEditor.tsx`
- `frontend/src/modules/wordo-shell/editor/LayoutOrchestrator.ts`
- `frontend/src/modules/wordo-shell/stores/useWordoStore.ts`
- `frontend/src/platform/command-bus/index.ts`

## Current-State Assessment

### Application shell

The app is a single React surface with a draggable shell switcher. `App.tsx` swaps between NEXCEL and WORDO through React state and localStorage. This gives basic continuity, but it is not a true workspace/session model.

Implication:

- there is no app-level active surface controller
- there are no document/workbook tabs
- there is no consistent focus restoration contract across shells

### NEXCEL current state

Strengths:

- strong rendering baseline using `@tanstack/react-virtual`
- meaningful keyboard support already exists
- direct typing into the active cell is implemented
- shift selection, copy/cut/paste, fill handle, sorting, search, hidden columns, frozen panes, formatting, and context menus already exist

Current weaknesses:

- behaviour is split across `useExcelStore`, `VirtualGrid`, and `Ribbon`
- filtering/sorting logic is duplicated between store and grid rendering
- hidden-column support is inconsistent with active-cell and helper access paths
- undo/redo is snapshot-based and only covers `sheet.rows`
- new sheet behaviour is local-only and not a real lifecycle model

### WORDO current state

Strengths:

- ProseMirror provides a strong text-editing substrate
- section-per-instance model is useful for performance-aware rendering
- ribbon, comments, track changes, page settings, watermark, import/export, and NEXCEL embedding already exist
- focus retention from editor to ribbon is intentionally handled

Current weaknesses:

- runtime truth is split between `useWordoStore.document` and `LayoutOrchestrator` editor states
- new document creation does not enforce immediate typing readiness
- document behaviour depends heavily on `focusedSectionId`
- many formatting commands are selection-only and do not support future-text formatting semantics
- undo/redo is section-local, not document-level
- track changes explicitly skips complex operations like paste

## Architectural Observations

### 1. There is no unified interaction core yet

Current user behaviour is implemented through:

- global window keyboard listeners
- local component callbacks
- store mutations
- direct ProseMirror transactions

This makes the user expectation model hard to enforce consistently.

### 2. NEXCEL should move from “featureful grid” to “grid interaction engine”

The grid already has enough primitives to support parity work. The problem is that key decisions about selection, editing, sorting, visible columns, and clipboard are not owned by a single engine.

### 3. WORDO should move from “section editor collection” to “document interaction system”

WORDO’s ProseMirror substrate is solid, but product-level behaviour is still too dependent on whichever section was last clicked. That is weaker than normal Word-style document interaction expectations.

### 4. The platform command bus is underused

The current command bus is useful as a shell registration point, but it is not yet the source of truth for user command routing. This is a missed opportunity for cross-shell consistency.

## Major Behavioural Gaps

### Spreadsheet-like gaps

#### Document/sheet lifecycle

- `SheetTabs` is present, but the `+` control does not create a real sheet lifecycle.
- `newSheet()` builds a blank local grid instead of creating/managing a first-class workbook/sheet session.
- There is no stable create/open/rename/close behaviour model.

#### Active focus model

- Grid ownership of focus is implicit and partly global.
- Ribbon inputs, dialogs, and window-level shortcuts are not mediated by a focused-surface controller.

#### Selection semantics

- Cell range selection works, but row/column selection parity is incomplete.
- Visible-index mapping is not robust enough once columns are hidden or reordered in the future.

#### Implicit editing

- Direct typing and double-click edit are present.
- However, edit semantics are still input-widget based rather than a formal edit-session model.
- Formula entry behaviour is largely absent.

#### Command-based undo/redo

- Undo/redo restores row snapshots, not semantic operations.
- It does not consistently restore selection, formatting, presentation state, or server-backed state.

#### Clipboard parity

- System clipboard TSV is supported.
- There is no richer internal clipboard model for formatting scope semantics, formulas, or operation intent.

### Document-like gaps

#### New blank document defaults

- A fresh document exists structurally, but not as an immediately ready editing session.
- The caret is not automatically placed into the first body surface after reset/new.

#### Active focus model

- Document commands route through `focusedSectionId`.
- This is acceptable as an internal detail, but not strong enough as the external behaviour contract.

#### Formatting semantics

- Collapsed-caret formatting does not consistently behave like future-text formatting.
- Users expect bold/italic/font-size actions to persist for subsequent typing when no range is selected.

#### Undo/redo behaviour

- Current undo/redo is section-scoped via ProseMirror history.
- Users expect a coherent document-level undo stream.

#### Clipboard and track changes

- Paste behaviour largely depends on ProseMirror defaults.
- Track changes deliberately skips many common complex operations, especially paste.

### Cross-cutting gaps

#### Tabs and surface switching

- The shell switcher is not a workspace tab model.
- Switching surfaces does not have a formal focus restoration model.

#### Command routing

- Global shortcuts are not cleanly owned by the current active interaction surface.

#### Acceptance criteria

- Existing tests are mostly smoke tests.
- The repo lacks user-observable behavioural acceptance criteria for parity work.

## Target Interaction Architecture

### Workstream A: App-level Surface Manager

Introduce a surface manager above both shells.

Responsibilities:

- track the active shell
- track the active command owner
- store last active focus target per shell
- restore focus/selection when returning to a shell
- arbitrate global shortcuts

Recommended implementation:

- add a small `platform/surface-manager` module
- make shell routes register focus ownership and restore callbacks
- move shell-switch side effects out of `App.tsx` local-only logic

### Workstream B: NEXCEL Interaction Engine

Create a formal grid interaction layer that owns:

- active cell identity
- anchor/focus selection
- edit session state
- visible row/column mapping
- clipboard state
- semantic command history

Recommended implementation:

- keep `VirtualGrid` primarily as a renderer
- move behaviour resolution into a controller/hook such as `useGridInteractionController`
- refactor helpers to target row ID + field ID instead of assuming raw field index access

### Workstream C: WORDO Interaction Controller

Create a document interaction controller above ProseMirror sections.

Responsibilities:

- active section/view ownership
- last selection snapshot
- pending collapsed-caret formatting state
- document-level command dispatch
- focus restoration after ribbon/dialog actions

Recommended implementation:

- keep `LayoutOrchestrator` for section instance management
- add a higher-level `WordoInteractionController`
- make ribbon actions talk to the controller instead of directly manipulating DOM/focus each time

### Workstream D: Command-Based Undo/Redo

Move both shells toward semantic operation history.

NEXCEL commands:

- edit cell
- paste range
- clear range
- fill range
- insert/delete row
- add/delete/rename column
- apply/remove format
- hide/show/freeze columns/rows

WORDO commands:

- apply mark
- set block type
- insert table/rule/embed
- add/remove section
- update page settings
- update watermark
- add/resolve comment
- accept/reject tracked changes

Short-term note:

- do not rewrite everything at once
- wrap existing operations with command descriptors first
- then migrate undo/redo routing to those descriptors

## Refactoring Strategy

### Phase 0: Stabilization and observability

Before major parity work:

- add behavioural logging around focus, selection, edit mode, and command routing
- add explicit helper tests for visible-index to field-ID mapping
- define shared acceptance scenarios

This phase reduces risk and prevents parity work from being purely subjective.

### Phase 1: Identity and lifecycle cleanup

#### NEXCEL

- introduce explicit visible column/row mapping utilities
- eliminate duplicated sort/filter derivation between store and grid
- make sheet lifecycle explicit
- wire the `SheetTabs` add action to a real lifecycle operation or remove the affordance until implemented

#### WORDO

- decide and document the runtime source of truth as ProseMirror-first
- treat `KasumiDocument` as metadata + persisted projection in the short term
- ensure new/reset document places the caret in the first body editor automatically

### Phase 2: Focus and command routing

- add the app-level surface manager
- route global shortcuts through active command ownership
- stop relying on unconditional window listeners for shell behaviour
- ensure dialogs and ribbon controls suspend or forward shell shortcuts intentionally

### Phase 3: Selection and editing parity

#### NEXCEL

- formalize single-click select vs double-click edit vs direct-type overwrite
- add row/column selection bands
- add stronger selection persistence across hide/show/sort/filter

#### WORDO

- support collapsed-caret formatting as future-text formatting
- define paragraph and section command targets more explicitly
- add reliable focus restoration after command execution

### Phase 4: Undo/redo and clipboard parity

- introduce semantic command history wrappers
- move clipboard behaviour to richer internal descriptors
- add KASUMI-to-KASUMI rich paste paths while preserving plain text system clipboard compatibility
- improve WORDO paste handling and track-changes coverage for common paste operations

### Phase 5: Import/export and polish

- align import/export ownership with document/sheet lifecycle
- make save/export feedback more consistent
- improve large-content behaviour during paste, scroll, resize, and surface switching

## Feature Streams and Priority

### Priority 1: Behavioural foundations

- surface manager
- NEXCEL visible identity mapping
- removal of duplicated sort/filter logic
- new document immediate caret placement in WORDO
- focused command owner routing

Rationale:

These changes unlock the rest. Without them, later parity work will stay fragile and inconsistent.

### Priority 2: Core editing parity

- NEXCEL selection semantics cleanup
- NEXCEL command-based undo/redo scaffolding
- WORDO collapsed-caret formatting
- WORDO document-level undo routing scaffolding

Rationale:

These are the behaviours users notice immediately in normal work.

### Priority 3: Lifecycle and clipboard parity

- real sheet lifecycle
- clipboard descriptors and richer paste semantics
- better import/export consistency
- improved shell-switch focus restoration

Rationale:

These are highly visible in longer sessions and make the product feel professional.

### Priority 4: Higher-order parity refinements

- row/column selection enhancements
- stronger track-changes handling for paste and multi-step edits
- status bar/page model accuracy
- context menu consistency across shells

## Risks and Trade-Offs

### Risk 1: Hidden-column bugs in NEXCEL

Because active cell and helpers still partly rely on raw field indices, parity work around selection and editing can regress if visible identity mapping is not handled first.

### Risk 2: WORDO dual-state confusion

If the team keeps describing `KasumiDocument` as the live canonical source while the runtime actually uses ProseMirror instances, engineers will keep building against the wrong abstraction.

Recommendation:

- state clearly in code and docs that short-term runtime truth is ProseMirror-first

### Risk 3: Overusing global keyboard listeners

Window-level handlers are fast to add but scale badly across dialogs, editors, and multiple surfaces.

### Risk 4: Undo/redo scope explosion

Trying to ship full semantic undo/redo in one pass would be risky. Start by wrapping existing operations and broadening history coverage incrementally.

## Testing and QA Strategy

### Add behaviour-based Playwright scenarios

Create end-to-end tests for:

- NEXCEL new sheet defaults
- active cell default at first open
- direct typing into selected cell
- Enter/Tab/Arrow navigation
- shift selection extension
- copy/cut/paste with visible feedback
- hidden column safety for active cell and formula bar
- undo/redo restoring user-observable state
- WORDO new document immediate typing readiness
- collapsed-caret formatting persistence
- undo/redo after text edits, section insertions, and page setting changes
- shell switching focus restoration

### Add targeted unit tests

For NEXCEL:

- visible index mapping
- selection reducer/controller
- semantic command apply/revert

For WORDO:

- interaction controller focus ownership
- pending formatting state
- document-level command history wrappers

### Add acceptance criteria tied to user-observable behaviour

Every parity task should ship with at least one acceptance scenario stated in plain user terms.

## Behaviour-Based Acceptance Criteria

### NEXCEL

- On opening NEXCEL, cell `A1` is the active cell and the grid is ready for keyboard navigation immediately.
- Typing a printable character into a selected cell replaces that cell's content and enters edit mode without extra clicks.
- Single click selects a cell; double click enters in-cell edit mode without changing the selected target.
- `Enter`, `Tab`, arrow keys, and `Ctrl+Home/End` move focus exactly to the user-visible target cell.
- Hidden columns do not cause formula bar edits, copy, or commit operations to target the wrong field.
- Copying a range shows clear copy state; cutting a range shows cut state until paste or cancel.
- Undo/redo restores the user-visible result of the last command, not only row array contents.

### WORDO

- Creating a new document places the caret in the first body section with immediate typing readiness.
- Clicking a ribbon formatting command while a section is active applies to the current selection without losing the intended target.
- Toggling bold/italic/font size at a collapsed caret affects future typing.
- Undo/redo works across normal editing actions in a way users perceive as document-level, not arbitrarily section-scoped.
- Switching away from WORDO and back restores the expected active section and selection/caret context where feasible.

### Cross-cutting

- Global shortcuts route to the currently active editing surface only.
- Switching between NEXCEL and WORDO does not silently discard focus context.
- Context menu actions and ribbon commands invoke the same underlying operation semantics.

## Recommended Implementation Phases

### Phase 1: Audit hardening and lifecycle fixes

- create visible identity mapping utilities in NEXCEL
- remove duplicated sort/filter paths
- make `SheetTabs` plus behaviour real or disable it
- make WORDO new/reset document focus the first editor automatically
- document the runtime truth model for WORDO

### Phase 2: Surface manager and command ownership

- add `platform/surface-manager`
- register shell focus ownership
- route undo/redo/save/find/clipboard based on active surface

### Phase 3: Selection and editing parity

- centralize NEXCEL selection/edit session logic
- add row/column selection behaviour
- add WORDO pending-format state and stronger focus restoration

### Phase 4: Command-based history and clipboard

- wrap NEXCEL operations as commands
- wrap WORDO structural operations as commands
- add richer internal clipboard payloads

### Phase 5: Acceptance-driven polish

- improve context menus
- refine page/status feedback
- strengthen track-changes handling for common paste/edit operations
- expand behavioural regression suite

## Immediate Next Actions

1. Create a short technical design for a `surface-manager` module and the shell registration API.
2. Refactor NEXCEL so visible row/column mapping is explicit and shared by grid, formula bar, and mutation helpers.
3. Remove the duplicated filter/sort pipeline by making one layer authoritative.
4. Update WORDO reset/new-document flow so the first body editor receives focus and a ready caret after creation.
5. Add Playwright acceptance tests for those four behaviours before continuing to deeper parity work.

## Sequencing Rationale

The sequencing starts with identity, focus, and command ownership because those are the foundation for all user-observable behaviour.

If KASUMI first adds more editing features without stabilizing:

- which surface owns commands
- how selection is represented
- how visible coordinates map to stable identities
- what undo/redo actually means

then parity work will keep producing regressions and one-off fixes.

By contrast, stabilizing those foundations first allows later spreadsheet and document refinements to stack cleanly and be tested against acceptance criteria based on user-observable behaviour.
