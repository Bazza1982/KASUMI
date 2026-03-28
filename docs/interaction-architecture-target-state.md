# KASUMI Interaction Architecture Target State

## Goal

Define a target interaction architecture that supports behavioural parity with common Excel/Word expectations while staying compatible with the current KASUMI codebase.

## Design Principles

### 1. Behaviour before feature count

The target is not "more buttons". The target is:

- interaction engine replication
- behavioural parity
- keyboard-first UX
- stable focus and selection rules
- predictable command routing

### 2. Single source of truth for interaction state

Each shell needs one authoritative interaction state model that owns:

- active focus model
- selection semantics
- edit mode / caret mode
- command routing
- undo/redo entries

### 3. Stable identities over visible indices

Wherever possible, operations should target stable identities:

- spreadsheet: row ID + field ID
- document: section ID + block ID + ProseMirror position mapping where needed

Visible indices should remain a rendering concern, not the primary behavioural identity.

## Target State for NEXCEL

### Interaction core

Introduce a dedicated grid interaction controller, separate from render code. It should own:

- active cell identity
- anchor/focus selection
- edit session state
- current navigation mode
- copy/cut state
- pending command source

`VirtualGrid` should render from this state and dispatch intent events into it.

### State segmentation

Split current behaviour into layers:

1. `sheetDataState`
   - raw rows, fields, table metadata
   - derived visible rows/columns
2. `gridInteractionState`
   - active cell, selection, anchor, edit mode, copy box
3. `gridCommandState`
   - undo/redo stack as semantic operations
4. `gridPresentationState`
   - zoom, column widths, frozen panes, context menu visibility

### Visible-coordinate mapping

Create an explicit mapping layer:

- visible column index -> field ID
- field ID -> visible column index
- visible row index -> row ID
- row ID -> visible row index

All user operations should resolve through this mapping before mutation.

### Command-based undo/redo

Replace row snapshot undo with semantic commands such as:

- edit cell
- paste range
- clear range
- insert row
- delete row
- add column
- rename column
- fill range
- apply format range
- hide/show column

Each command should support `apply()` and `revert()`.

### Clipboard model

Introduce an internal spreadsheet clipboard descriptor:

- source range
- cell raw values
- display values
- formatting payload
- cut vs copy mode

System clipboard text should still be written, but internal paste should prefer the richer descriptor when source and destination are both KASUMI.

## Target State for WORDO

### Document interaction controller

Add a document interaction layer above ProseMirror that owns:

- focused document surface
- active section
- active editor view
- last selection snapshot
- pending text style at collapsed caret
- document-level command dispatch

Ribbon and keyboard commands should target this controller, not query DOM directly.

### Resolve source-of-truth split

Choose one of two clean directions:

1. ProseMirror-first runtime model
   - ProseMirror states are the true editable source
   - `KasumiDocument` becomes a persisted/exportable projection

2. Canonical document model first
   - `KasumiDocument` becomes the authoritative runtime model
   - ProseMirror is a view/editor projection

Given the current repo, option 1 is the practical short-term path. The current code already behaves this way.

### Document-level command history

Add a document command history that wraps:

- ProseMirror text transactions
- section create/delete
- page settings changes
- watermark changes
- comment operations
- track-changes accept/reject
- embed insertion

This does not require replacing ProseMirror history immediately. It can start as a higher-level wrapper around shell commands.

### Pending formatting semantics

Introduce explicit pending formatting state for collapsed selections:

- bold
- italic
- underline
- highlight
- font size
- font color

When the selection is collapsed, toggles should affect future typing, not no-op.

### Focus restoration contract

The controller should guarantee:

- a new document places caret in the first body section
- ribbon commands restore selection before applying
- closing dialogs restores focus to the last active editor
- switching sections updates the active command target predictably

## Target State Across Shells

### Surface manager

Introduce an app-level surface manager responsible for:

- current shell
- current open surface instance
- last focused command target per shell
- shell switching focus restoration
- global shortcut ownership

### Global command router

Build on the existing command bus and add command ownership rules:

- if NEXCEL owns focus, `Ctrl+Z` routes to grid history
- if WORDO owns focus, `Ctrl+Z` routes to document history
- if an input/dialog owns focus, shell-level shortcuts pause unless explicitly allowed

### Document/sheet lifecycle model

Add explicit lifecycle objects:

- workbook/sheet session model for NEXCEL
- document session model for WORDO

These should define create/open/rename/close/switch/default-focus behaviour.

### Acceptance criteria model

All major workstreams should define behaviour-based acceptance criteria in user terms, for example:

- "When a new document is created, the user can type immediately without clicking the page."
- "When a hidden column exists, copying and editing the visible active cell affects the intended field."
- "When the user switches from WORDO to NEXCEL and back, the prior caret/selection is restored."

## Migration Strategy

### Phase 1

Stabilize identity, focus, and command routing without rewriting rendering.

### Phase 2

Replace snapshot/local behaviour with command-based operations and explicit interaction state.

### Phase 3

Add parity refinements such as richer clipboard, pending formatting semantics, and stronger lifecycle behaviour.

## Non-Goals for This Upgrade

- Full Excel formula engine
- Full Word layout engine parity
- Multi-user collaboration
- VBA/macro compatibility
- Pixel-perfect Office UI mimicry

The target is common behavioural parity for normal operations users notice immediately.
