# WORDO High-Fidelity + AI-Native Upgrade Plan

## Status

Draft for review

## Goal

Build a Word-grade document workspace that:

- opens `.docx` in paginated high-fidelity view by default
- supports direct editing without collapsing into a long web page
- preserves images, screenshots, indentation, fonts, spacing, and section layout well enough for real work
- stays AI-native, so AI and MCP can read, reason about, and change document structure safely

This document is the implementation plan and the design baseline. There should not be a second large spec unless scope changes materially.

## Recommendation

Do not keep stretching the current `mammoth -> HTML/ProseMirror` path into the main Word experience.

Adopt this architecture instead:

1. `Source Layer`
Preserve imported `.docx` facts and assets.

2. `Semantic Layer`
Canonical document model for AI, MCP, editing, validation, and audit.

3. `Render Layer`
High-fidelity paginated surface for humans.

4. `Editing Layer`
Controlled editing on top of the paginated surface, backed by semantic commands.

Core principle:

`Render fidelity for humans, semantic fidelity for AI.`

## Why This Route

The product goals are now clear:

- real pagination
- Word-like layout and formatting
- strong image/screenshot retention
- direct editing
- AI-native operations through MCP

The hard problem is layout fidelity, not plain rich-text editing. If the product keeps using browser-flow HTML as the runtime truth, it will continue to fail on pages, images, spacing, and predictable AI control.

This route keeps the display layer high fidelity while making AI operate on a stable, explicit document model instead of fragile DOM.

## Product Rules

These rules should stay fixed through implementation:

1. `.docx` opens in paginated mode by default.
2. Rendered HTML is never canonical truth.
3. All user edits and AI edits become semantic commands.
4. Every meaningful document object has a stable ID.
5. Unsupported constructs must be preserved or surfaced, never silently dropped.
6. Import, edit, reflow, and export must all emit structured diagnostics.

## Current Repo Context

Relevant current pieces:

- preview path around `frontend/src/modules/wordo-shell/WordoShellRoute.tsx`
- current high-fidelity surface around `frontend/src/modules/wordo-shell/components/DocxPreviewSurface.tsx`
- current document types around `frontend/src/modules/wordo-shell/types/document.ts`
- existing ProseMirror-based editing stack

Current strengths:

- there is already a shell, ribbon, and document workflow
- there is already a semantic editing foundation
- there is already a docx preview path that improves display fidelity

Current gaps:

- one-flow document rendering instead of true pages
- no canonical shared model for preview, editing, AI, and export
- no deterministic page map
- weak object identity for AI-safe edits
- poor handling for complex layout objects and image fidelity

## Target Architecture

### 1. Source Layer

Purpose: preserve original document fidelity and round-trip facts.

Must contain:

- sections and page settings
- paragraphs and runs
- numbering definitions
- tables
- images and drawing resources
- headers and footers
- style definitions
- relationships and imported compatibility warnings

The source layer is not the main AI interface. It exists so imports and exports do not lose important facts.

### 2. Semantic Layer

Purpose: canonical runtime truth.

This is the layer for:

- editor state
- AI reads and edits
- MCP operations
- validation
- undo/redo
- diff and provenance
- render input

Rules:

- every object has a stable ID
- every edit targets IDs, not screen coordinates
- semantics are explicit even when rendering is complex

### 3. Render Layer

Purpose: Word-like pages for humans.

Must provide:

- page boxes
- page breaks and section breaks
- margins, headers, and footers
- paragraph spacing and line spacing
- indentation and tab effects
- image display and placement
- a page map back to semantic objects

The render layer may use existing preview technology during transition, but WORDO should own the render contract.

### 4. Editing Layer

Purpose: user-facing WYSIWYG editing on paginated pages.

Rules:

- user interaction happens on the paginated surface
- selections resolve to semantic spans/blocks
- edits are executed as semantic commands
- render refreshes from semantic state

Not allowed:

- direct DOM mutation as primary data update
- ad hoc HTML-to-model reconciliation as the normal editing path

## Canonical Semantic Schema

This should extend the current model in `frontend/src/modules/wordo-shell/types/document.ts`.

The exact TypeScript shape can evolve, but the canonical object set should be:

### Document

- `id`
- `type = "document"`
- `metadata`
- `sections: Section[]`
- `styles: StyleDefinition[]`
- `numbering: NumberingDefinition[]`
- `assets: Asset[]`
- `warnings: DocumentWarning[]`
- `provenance`

### Section

- `id`
- `pageSetup`
- `headerIds`
- `footerIds`
- `blockIds`
- `sectionBreak`

### Block

Supported block kinds for MVP:

- `paragraph`
- `heading`
- `list_item`
- `table`
- `image_block`
- `page_break`
- `section_break`

Deferred but modeled early:

- `text_box`
- `floating_object`
- `footnote_block`
- `comment_anchor`

Common block fields:

- `id`
- `kind`
- `styleRef`
- `layoutProps`
- `content`
- `anchor`
- `provenance`

### Paragraph / List Item

- `id`
- `runs: Run[]`
- `paragraphFormat`
- `listRef?`
- `bookmarkIds?`

### Run

- `id`
- `text`
- `charFormat`
- `hyperlink?`
- `fieldCode?`

### Table

- `id`
- `rows`
- `tableFormat`

### Table Cell

- `id`
- `blockIds`
- `cellFormat`
- `rowSpan`
- `colSpan`

### Image / Asset

- `id`
- `assetId`
- `placement: inline | anchored`
- `altText`
- `captionRef?`
- `crop?`
- `size`
- `anchor?`

### StyleDefinition

- `id`
- `name`
- `scope: paragraph | character | table | numbering`
- `baseStyleId?`
- `props`

### NumberingDefinition

- `id`
- `levels`
- `format`
- `indentRules`

### Warning / Provenance

Every warning should have:

- `id`
- `severity: info | warn | error`
- `code`
- `message`
- `objectId?`
- `sourceLocation?`

Every mutable object should have provenance fields sufficient to answer:

- where it came from
- whether it was imported, user-edited, or AI-edited
- which operation changed it last

## Stable ID Strategy

IDs must survive ordinary edits and reflow.

Rules:

1. Do not require 100% deterministic IDs at import time. Imported objects should get runtime-stable UUID-based IDs.
2. Each imported object should also keep a `fingerprint` derived from original content and structure for recovery/debugging.
3. Each imported object should keep `legacyPath` that records its original Word location, for example section/block/run ancestry where available.
4. Reflow never changes semantic IDs.
5. Formatting edits keep the same block ID unless the block is structurally replaced.
6. Text edits keep run IDs where possible; when splitting/merging runs, record lineage in provenance.
7. Any structural edit that replaces IDs must return explicit `idMapping` from old IDs to new IDs.
8. Page numbers are not IDs. They are derived render facts.

Suggested shape:

- `id`: UUID-like semantic object ID
- `fingerprint`: content/structure hash for recovery
- `legacyPath`: original import path from source document
- `provenance.parentIds`
- `provenance.replacedBy`

Operational rule:

- AI, UI, and MCP may address objects by `id`, but all mutation responses must include enough lineage to recover when IDs drift.
- Diagnostics should always be able to answer: current ID, prior ID, source fingerprint, and source legacy path.

## Import Normalization Rules

The `.docx` import path should normalize into semantic objects with explicit warnings.

Rules:

1. Preserve structure first, then decorate with fidelity metadata.
2. Map Word paragraphs/runs/tables/images directly into semantic objects.
3. Convert numbering into explicit numbering definitions and list references.
4. Preserve both inline and anchored image intent.
5. If an object cannot be edited yet, keep it as a preserved semantic node with warning metadata.
6. Never silently discard screenshots, embedded images, or text boxes.

Import support levels:

- `full`
- `preserved_read_only`
- `degraded_with_warning`
- `unsupported_but_retained_reference`

## Pagination Contract

This is the minimum contract the render layer must satisfy.

### Page Model

Each rendered page should expose:

- `pageIndex`
- `sectionId`
- `dimensions`
- `marginBox`
- `headerRegion`
- `footerRegion`
- `bodyRegion`
- `objectRefs`

### Required Layout Inputs

Pagination must consider at least:

- page size and orientation
- margins
- header/footer reservation
- paragraph spacing before/after
- line spacing
- font metrics
- indentation and first-line hanging indent
- tab stops where represented
- explicit page breaks
- section breaks
- keep-with-next / keep-lines-together when available
- table row behavior where represented
- image size and placement mode

### Render Output Contract

The renderer must output:

- `pageMap`
- `objectRenderMap`
- `selectionMap`
- `renderWarnings`

Where:

- `pageMap` maps page index to semantic object ranges
- `objectRenderMap` maps semantic IDs to page and visual fragments
- `selectionMap` maps visible selection anchors back to semantic positions
- `renderWarnings` reports anything likely to affect parity

### Determinism Rule

Given the same semantic model, assets, fonts, and page settings, pagination should be stable. Small pixel variance is acceptable; object ordering, page assignment, and basic layout meaning should not drift.

## Selection and Caret Mapping

This is the bridge between human editing and AI-safe semantic edits.

### Requirements

The system must map:

- mouse click -> semantic text position
- text drag -> semantic range
- block selection -> semantic block IDs
- image selection -> image object ID
- table cell selection -> cell ID and inner content position

### Canonical Position Model

Use semantic positions, not DOM-only positions.

Suggested forms:

- text position: `{ blockId, runId, offset }`
- range: `{ start, end }`
- block target: `{ blockId }`
- image target: `{ imageId }`
- table target: `{ tableId, cellId, blockId?, runId?, offset? }`

### Editing Flow

1. User selects on page.
2. Render layer resolves selection through `selectionMap`.
3. Editor creates semantic command.
4. Semantic model updates.
5. Renderer reflows impacted pages.
6. Updated selection is restored if possible.

### MVP Scope

Selection/caret mapping must work first for:

- plain paragraphs
- headings
- list items
- table cell text
- inline images as replaceable objects

Floating object handles can wait.

## Editing Command Contract

All editing must go through commands with structured results.

Minimum command set:

- `replaceText`
- `insertText`
- `deleteRange`
- `insertParagraphAfter`
- `deleteBlock`
- `setParagraphFormat`
- `setRunFormat`
- `applyStyle`
- `setListState`
- `replaceImage`
- `insertPageBreak`
- `insertSectionBreak`

Each command should return:

- `operationId`
- `changedObjectIds`
- `layoutImpact: none | local | multi_page | whole_section`
- `warnings`
- `undoPatch`

## MCP Contract

MCP must not couple directly to internal semantic object storage or HTML. It should call a stable command adapter on top of the semantic runtime.

Recommended stack:

1. `MCP Adapter`
2. `semanticCommand.execute()`
3. command + event bus
4. semantic model store
5. render/reflow pipeline

### Read APIs

- `get_document_summary`
- `get_document_tree`
- `get_object`
- `get_page_map`
- `get_selection_context`
- `list_styles`
- `list_images`
- `list_tables`
- `get_warnings`

### Write APIs

- `replace_text`
- `insert_block`
- `delete_block`
- `set_paragraph_format`
- `set_run_format`
- `apply_style`
- `replace_image`
- `set_table_cell_text`
- `insert_page_break`
- `insert_section_break`

### Safety APIs

- `preview_operation_effect`
- `validate_document`
- `reflow_document`
- `get_operation_log`
- `undo_operation`

### MCP Rules

1. MCP only invokes semantic commands through the adapter layer. It should not mutate semantic objects directly.
2. All write APIs target current semantic IDs, but responses must also include `idMapping` when replacement or split/merge occurs.
3. All write APIs return affected objects, layout warnings, and command events.
4. AI should be able to ask for preview before commit for layout-sensitive operations.
5. All AI edits must be auditable and reversible.
6. Schema evolution should primarily impact the adapter and command handlers, not the MCP surface itself.

## Supported Scope by Phase

### MVP Editable Scope

Must support:

- paragraph text editing
- headings
- lists and numbering display/editing
- paragraph alignment
- indentation
- spacing
- basic character formatting
- table cell text editing
- image preservation
- image replacement

### Early Read-Only Support

Should be visible and preserved before fully editable:

- text boxes
- headers and footers
- section layout variations
- anchored images
- footnotes and endnotes

### Deferred Advanced Editing

Do not block MVP on:

- freeform shape editing
- full chart editing
- full VML editing parity
- desktop Word-equivalent review feature parity

## Diagnostics and Logging

This work will fail without strong diagnostics.

Must log:

- import warnings with object IDs
- render warnings with page/object references
- command logs for user and AI edits
- validation failures
- reflow timing and impacted pages
- export warnings

Diagnostics should be available in:

- developer console/logs
- UI diagnostics panel
- MCP responses

## Testing Strategy

Use fixture-driven verification, not anecdotal testing.

Acceptance must be data-driven, not screenshot-by-eye.

### Semantic Fixtures

Use canonical document JSON fixtures to test:

- import normalization
- command correctness
- stable IDs
- MCP behavior

### Real `.docx` Fixtures

Build a corpus including:

- plain business memo
- heading-heavy report
- audit-style report with tables
- image-heavy report with screenshots
- nested list document
- section break and header/footer document
- compatibility-stress document

Minimum bar:

- at least 20 real `.docx` fixtures before editable pagination is accepted

### Visual Checks

For each fixture:

- render paginated output
- compare with approved baseline screenshots using `pixelmatch` or equivalent visual diff
- record accepted deviations explicitly

### Structural Checks

For each fixture:

- compare canonical semantic JSON against approved structural baseline
- diff object counts, block types, image counts, table counts, and warning counts
- verify `idMapping` behavior for edit scenarios

### Fidelity Metrics

Track a `fidelityScore` per fixture and per build from measurable signals:

- page count match rate
- image count match rate
- text length match rate
- table count match rate
- warning severity score
- pixel diff threshold pass/fail

Release decisions should use these metrics, not subjective inspection alone.

### End-to-End Checks

For core fixtures:

1. open `.docx`
2. verify page count and images
3. edit text
4. change paragraph formatting
5. reflow
6. save/export
7. reopen
8. verify structure and visible parity

## Delivery Plan

### Phase 0: Freeze the architecture

Deliver:

- approve this document
- lock product rules
- lock canonical object types
- lock MVP and non-goals
- define fallback if editable pagination fails early

Exit criteria:

- no more architecture drift in active implementation

### Phase 0.5: Spike editable pagination feasibility

Timebox:

- 2 to 3 weeks

Deliver:

- a minimal editable paginated prototype
- support only `paragraph`, `image`, and `table cell`
- measure caret behavior, local reflow cost, and visual drift
- compare against a fallback `side-panel editing` mode

Exit criteria:

- either editable pagination is viable enough to continue
- or the team switches early to side-panel editing without losing the high-fidelity viewer

### Phase 1: Upgrade canonical document model

Deliver:

- richer semantic model in `document.ts`
- UUID + fingerprint + legacyPath identity model
- warnings/provenance scaffolding
- normalization pipeline rules

Exit criteria:

- imported documents can be represented without losing core structure
- AI can address document objects by stable ID with lineage recovery

### Phase 2: Build pagination contract and page map

Deliver:

- page model
- object render map
- selection map contract
- deterministic reflow rules

Exit criteria:

- document no longer behaves as one continuous page
- block-to-page mapping is inspectable

### Phase 3: Harden import fidelity

Deliver:

- stronger image/screenshot retention
- explicit support-level classification
- warning system by object and severity

Exit criteria:

- common Word documents open with images intact and warnings that are precise

### Phase 4: Stabilize read-only paginated mode

Deliver:

- reliable paginated preview
- render diagnostics
- regression fixtures
- fidelity scoring dashboard or report output

Exit criteria:

- representative files render page by page with acceptable measured fidelity

### Phase 5: Editable paginated MVP

Deliver:

- caret and selection mapping for common text flows
- semantic command execution
- local reflow after edits
- undo/redo
- explicit fallback path to side-panel editing if spike thresholds were not met

Exit criteria:

- user can directly edit visible text in paginated mode without obvious layout collapse

### Phase 6: MCP-native editing

Deliver:

- MCP adapter on top of semantic commands
- MCP read/write/safety APIs
- operation preview
- provenance for AI mutations

Exit criteria:

- AI can inspect and edit the same canonical model safely

### Phase 7: Advanced objects and export hardening

Deliver:

- better text box/floating object support
- better header/footer and section editing
- stronger export and round-trip checks

Exit criteria:

- common professional documents can be edited/exported without major structural loss

## Implementation Order

Recommended order inside engineering work:

1. Extend semantic schema and IDs.
2. Add warnings/provenance.
3. Define import normalization output.
4. Define page model and page map types.
5. Add render/object/selection mapping contracts.
6. Harden preview into deterministic paginated read mode.
7. Implement semantic edit commands.
8. Implement caret/selection mapping and paginated editing UI.
9. Add MCP APIs on top of the same command layer.
10. Expand advanced objects and export reliability.

## Risks

1. Treating preview DOM as truth.
This would recreate current instability.

2. Mixing source facts and semantic truth.
This would make import, edit, and export diverge.

3. Trying to match all Word features too early.
This would stall delivery and weaken quality.

4. Weak fixture coverage.
This would make layout work subjective and fragile.

## Non-Goals for the First Editable Release

- full chart editing parity
- full freeform shape editing
- complete VML parity
- unrestricted desktop Word feature parity
- perfect round-trip for every legacy document edge case

## Review Decisions Needed

Need confirmation on these before implementation starts:

1. Paginated mode is the default open mode for `.docx`.
2. Structured mode remains as a secondary editing mode, not the primary Word experience.
3. MVP editing scope is text, paragraph formatting, lists, table cell text, and image replacement.
4. Text boxes and anchored objects are preserved early, but editable later unless low-risk support appears sooner.
5. The semantic model becomes long-term runtime truth for UI, AI, and MCP.

## Recommended Immediate Next Step

After爸爸 review, implementation should start directly from this document.

The first engineering task should be:

- upgrade `frontend/src/modules/wordo-shell/types/document.ts`
- define stable IDs and warnings/provenance
- add page model and selection map types next to it

That gives the team a canonical core before more UI work lands.
