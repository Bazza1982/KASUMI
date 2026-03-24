# WORDO Text Functions Upgrade — Development Plan

> **Goal:** Transform WORDO from a visual placeholder editor into a semantically-aware
> document engine where every paragraph, sentence, word, format mark, change, and
> comment is addressable, persistable, and queryable by AI.
>
> **Design principles:**
> 1. Simple solutions first — avoid complex abstractions when a direct approach works.
> 2. Minimal new dependencies — every new library is a future breakage point.
> 3. Detailed logging everywhere — every mutation, state change, and error is traceable.
> 4. ProseMirror is the runtime truth — we extend it, not fight it.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architecture Overview](#2-architecture-overview)
3. [Module 1: Logging Infrastructure](#module-1-logging-infrastructure)
4. [Module 2: Stable Block IDs](#module-2-stable-block-ids)
5. [Module 3: Extended Marks (Highlight, Underline, Strikethrough)](#module-3-extended-marks)
6. [Module 4: Track Changes](#module-4-track-changes)
7. [Module 5: Comment System](#module-5-comment-system)
8. [Module 6: Provenance Tracking](#module-6-provenance-tracking)
9. [Module 7: AI Context Serializer](#module-7-ai-context-serializer)
10. [Module 8: Document Persistence](#module-8-document-persistence)
11. [Module 9: Command Executor (Wire Commands to Actions)](#module-9-command-executor)
12. [Testing Strategy](#testing-strategy)
13. [Dependency Audit](#dependency-audit)
14. [Rollout Order & Time Estimates](#rollout-order)

---

## 1. Current State Assessment

### What exists and works
- ProseMirror editor with basic schema (paragraph, heading, lists, tables, nexcel_embed)
- Multi-section orchestrator (one PM instance per section)
- Marks: strong, em, code, link (inherited from prosemirror-schema-basic)
- History plugin (undo/redo per section)
- Keyboard shortcuts (bold, italic, list manipulation, table navigation)
- .docx import/export, PDF print
- Access control store (data-entry / analyst / admin roles)
- WordoCommand type definitions (types only, no executor)
- Platform command bus (exists, not wired to WORDO)

### What is missing
| Feature | Status |
|---------|--------|
| Logging system | None |
| Stable block IDs | None — blocks have no persistent identity |
| Highlight mark | Not in PM schema |
| Underline / strikethrough marks | Referenced in IR types, not in PM schema |
| Track changes | Not started |
| Comments / annotations | Not started |
| Provenance (who typed what, when) | Not started |
| AI context serializer | Not started |
| Document persistence | None — everything in memory |
| Command executor | Types only, no dispatcher |
| Sentence/word-level addressing | Not started |

### The dual-model gap
The `KasumiDocument` IR has `blocks[]` arrays per section, but at runtime these are always `[]`.
Real content lives exclusively in ProseMirror `EditorState` inside `LayoutOrchestrator`.
**Decision:** ProseMirror state IS the source of truth. The Document IR serves as the
serialization format for persistence and AI context. We reconcile on save, not on every keystroke.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    WORDO Runtime                         │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │  PM Schema   │    │ Orchestrator │                    │
│  │ (extended)   │───▶│ (per section │                    │
│  │              │    │  EditorState)│                    │
│  └──────────────┘    └──────┬───────┘                    │
│         │                   │                            │
│         ▼                   ▼                            │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │ Track Change │    │   Comment    │                    │
│  │   Plugin     │    │    Store     │                    │
│  └──────┬───────┘    └──────┬───────┘                    │
│         │                   │                            │
│         ▼                   ▼                            │
│  ┌──────────────────────────────────┐                    │
│  │        AI Context Serializer     │                    │
│  │  (PM state → structured JSON)    │                    │
│  └──────────────┬───────────────────┘                    │
│                 │                                        │
│                 ▼                                        │
│  ┌──────────────────────────────────┐                    │
│  │     Document Persistence Layer   │                    │
│  │  (localStorage now, Baserow later)│                    │
│  └──────────────────────────────────┘                    │
│                                                          │
│  ┌──────────────────────────────────┐                    │
│  │          Logger (all layers)     │                    │
│  └──────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

**Key decision: No new runtime dependencies.**
We use only what ProseMirror already provides (plugins, marks, decorations, node attributes).
No external track-change library. No external comment library. Plain Zustand stores + PM plugins.

---

## Module 1: Logging Infrastructure

> Every other module depends on this. Build it first.

### Design
A simple, zero-dependency logger that logs to console with structured context.
No external logging library. Just a thin wrapper around `console` with:
- Log levels: `debug`, `info`, `warn`, `error`
- Module tags: `[WORDO:Schema]`, `[WORDO:TrackChange]`, `[WORDO:Comment]`, etc.
- Structured payload: every log entry carries `{ module, action, detail, timestamp }`
- Configurable level per module (via localStorage flag for dev debugging)
- Performance: logs are synchronous, no buffering, no network calls

### Files
```
editor/
  logger.ts          — Logger class + factory function
```

### Interface
```typescript
// logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  module: string
  action: string
  detail?: unknown
  timestamp: number
}

function createLogger(module: string): {
  debug(action: string, detail?: unknown): void
  info(action: string, detail?: unknown): void
  warn(action: string, detail?: unknown): void
  error(action: string, detail?: unknown): void
}
```

### Usage pattern (all subsequent modules)
```typescript
const log = createLogger('TrackChange')
log.info('change-recorded', { changeId, author, type: 'insert', from, to })
log.debug('transaction-filtered', { stepCount: tr.steps.length })
log.error('apply-failed', { sectionId, error: e.message })
```

### Time estimate: ~30 minutes

---

## Module 2: Stable Block IDs

> Foundation for all addressability. Every block node gets a persistent UUID.

### Problem
ProseMirror nodes don't have stable identity. When you split a paragraph, both halves
are new nodes with no ID. When you serialize → deserialize, position-based references break.

### Solution
Add an `id` attribute to every block-level node in the PM schema. A plugin auto-assigns
UUIDs to any node that is missing one.

### Implementation

**Schema change** — add `id` attr to: `paragraph`, `heading`, `blockquote`, `code_block`,
`bullet_list`, `ordered_list`, `list_item`, `table`, `nexcel_embed`, `horizontal_rule`, `image`.

```typescript
// In schema.ts — wrap each block node spec to add id attr
function withBlockId(spec: NodeSpec): NodeSpec {
  return {
    ...spec,
    attrs: {
      ...spec.attrs,
      id: { default: null },  // null = plugin will assign one
    },
  }
}
```

**Plugin** — `blockIdPlugin`: on every transaction, walk the doc. If any block node
has `id: null`, set it to `crypto.randomUUID()` (or a simple nanoid fallback).

```typescript
// editor/blockIdPlugin.ts
function blockIdPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      // Walk doc, collect nodes with null id, build a single fixing tr
      // Only fires if there are null ids (fast no-op in steady state)
    }
  })
}
```

**Why this is simple:**
- No new dependency — `crypto.randomUUID()` is built into browsers.
- Plugin approach means IDs are assigned transparently, no need to thread them through every command.
- On import (.docx), IDs auto-assign on first transaction after load.

### Logging
```
[WORDO:BlockId] info  id-assigned     { nodeType: 'paragraph', id: 'blk_a1b2c3' }
[WORDO:BlockId] debug scan-complete   { totalBlocks: 14, newIdsAssigned: 0 }
```

### Time estimate: ~1 hour

---

## Module 3: Extended Marks

> Add highlight, underline, strikethrough, superscript, subscript marks to PM schema.

### Problem
The current schema only has marks from `prosemirror-schema-basic`: strong, em, code, link.
The Document IR types reference underline, strikethrough, superscript, subscript, and
char_style — but they don't exist in the live PM schema.

### Implementation

Add to `schema.ts`:

```typescript
const extendedMarks = {
  // Keep all existing marks from basicSchema.spec.marks, plus:
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() { return ['u', 0] },
  },
  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM() { return ['s', 0] },
  },
  highlight: {
    attrs: { color: { default: '#ffff00' } },
    parseDOM: [{ tag: 'mark', getAttrs(dom) { return { color: dom.style.backgroundColor || '#ffff00' } } }],
    toDOM(mark) { return ['mark', { style: `background-color: ${mark.attrs.color}` }, 0] },
  },
  superscript: {
    parseDOM: [{ tag: 'sup' }],
    toDOM() { return ['sup', 0] },
    excludes: 'subscript',
  },
  subscript: {
    parseDOM: [{ tag: 'sub' }],
    toDOM() { return ['sub', 0] },
    excludes: 'superscript',
  },
  font_size: {
    attrs: { size: { default: null } },  // e.g. '14px', '12pt'
    parseDOM: [{ style: 'font-size', getAttrs(value) { return { size: value } } }],
    toDOM(mark) { return ['span', { style: `font-size: ${mark.attrs.size}` }, 0] },
  },
  font_color: {
    attrs: { color: { default: null } },
    parseDOM: [{ style: 'color', getAttrs(value) { return { color: value } } }],
    toDOM(mark) { return ['span', { style: `color: ${mark.attrs.color}` }, 0] },
  },
}
```

**Keyboard shortcuts to add:**
- `Mod-u` → toggle underline
- `Mod-Shift-x` → toggle strikethrough
- `Mod-Shift-h` → toggle highlight (yellow default)

### No new dependencies. Pure ProseMirror mark specs.

### Logging
```
[WORDO:Marks] debug mark-toggled  { mark: 'highlight', color: '#ffff00', from: 10, to: 25 }
```

### Time estimate: ~1 hour

---

## Module 4: Track Changes

> Record every insertion and deletion with author + timestamp.

### Design philosophy
Track changes in Word works via inline marks: inserted text is marked green with author info,
deleted text stays in the doc but marked red with strikethrough. We replicate this with two
ProseMirror marks.

### PM Marks

```typescript
track_insert: {
  attrs: {
    changeId: { default: '' },
    author: { default: '' },
    timestamp: { default: '' },
  },
  inclusive: true,  // new text typed at boundary inherits the mark
  parseDOM: [{ tag: 'ins' }],
  toDOM(mark) { return ['ins', { 'data-change-id': mark.attrs.changeId, title: `${mark.attrs.author} — ${mark.attrs.timestamp}` }, 0] }
},
track_delete: {
  attrs: {
    changeId: { default: '' },
    author: { default: '' },
    timestamp: { default: '' },
    originalText: { default: '' },  // what was deleted (for AI context)
  },
  inclusive: false,
  parseDOM: [{ tag: 'del[data-track-delete]' }],
  toDOM(mark) { return ['del', { 'data-track-delete': 'true', 'data-change-id': mark.attrs.changeId }, 0] }
}
```

### Track Change Plugin

A PM plugin that intercepts transactions when tracking is enabled:

```typescript
// editor/trackChangePlugin.ts

interface TrackChangeState {
  enabled: boolean
  author: string
}

const trackChangePlugin = new Plugin({
  state: {
    init() { return { enabled: false, author: 'user' } },
    apply(tr, value) {
      const meta = tr.getMeta(trackChangePlugin)
      if (meta) return { ...value, ...meta }
      return value
    }
  },

  // Key logic: filterTransaction
  // When tracking is ON and a transaction deletes content:
  //   1. Instead of deleting, wrap deleted text in track_delete mark
  //   2. Wrap newly inserted text in track_insert mark
  //   3. Return the modified transaction
  appendTransaction(transactions, oldState, newState) {
    // Compare oldState.doc vs newState.doc
    // For each step that inserts: add track_insert mark to inserted range
    // For each step that deletes: re-insert deleted text with track_delete mark
    // This is the most complex part — ~150 lines
  }
})
```

### Track Change Store (Zustand)

```typescript
// stores/useTrackChangeStore.ts
interface TrackChangeStore {
  enabled: boolean
  author: string
  changes: Map<string, ChangeRecord>

  toggleTracking: () => void
  setAuthor: (name: string) => void
  acceptChange: (changeId: string) => void     // remove mark, keep text
  rejectChange: (changeId: string) => void     // remove mark + text (for insert) or restore (for delete)
  acceptAll: () => void
  rejectAll: () => void
}
```

### Accept / Reject logic
- **Accept insert:** remove `track_insert` mark → text becomes normal.
- **Reject insert:** delete the text range covered by `track_insert`.
- **Accept delete:** remove the `track_delete` marked text entirely.
- **Reject delete:** remove `track_delete` mark → text reappears as normal.

### CSS
```css
ins[data-change-id] {
  background-color: #e6ffe6;  /* light green */
  text-decoration: none;
  border-bottom: 1px solid #4caf50;
}
del[data-track-delete] {
  background-color: #ffe6e6;  /* light red */
  text-decoration: line-through;
  color: #999;
}
```

### Logging
```
[WORDO:TrackChange] info  tracking-enabled   { author: 'barry' }
[WORDO:TrackChange] info  change-recorded    { changeId: 'chg_001', type: 'insert', text: 'new words', from: 10, to: 19, author: 'barry' }
[WORDO:TrackChange] info  change-accepted    { changeId: 'chg_001', type: 'insert' }
[WORDO:TrackChange] warn  change-not-found   { changeId: 'chg_999' }
```

### Complexity note
The `appendTransaction` logic for intercepting deletions is the hardest part of the entire plan.
It needs to handle: multi-step transactions, replacing selections, backspace vs delete, paste
operations, and undo/redo interactions.

**Simplification strategy:** For v1, only track changes for simple insertions and deletions
(single-range). Complex operations (paste with mixed content, table cell changes) are logged
but not track-marked — they appear as normal edits. We can incrementally add support for
more complex cases.

### Time estimate: ~4 hours (most complex module)

---

## Module 5: Comment System

> Attach threaded comments to text ranges.

### Design
Comments are stored in a separate Zustand store (not in PM state). They reference a text range
via a PM mark (`comment_ref`) that acts as an anchor. This is simpler than storing comments
inside PM state, and it avoids serialization complexity.

### PM Mark
```typescript
comment_ref: {
  attrs: { commentId: { default: '' } },
  inclusive: false,  // new text at boundary does NOT inherit the comment
  parseDOM: [{ tag: 'span[data-comment-id]', getAttrs(dom) { return { commentId: dom.getAttribute('data-comment-id') } } }],
  toDOM(mark) { return ['span', { 'data-comment-id': mark.attrs.commentId, class: 'wordo-comment-ref' }, 0] }
}
```

### Comment Store (Zustand)

```typescript
// stores/useCommentStore.ts

interface Comment {
  id: string
  sectionId: string
  author: string
  text: string
  createdAt: string       // ISO
  status: 'open' | 'resolved'
  replies: CommentReply[]
}

interface CommentReply {
  id: string
  author: string
  text: string
  createdAt: string
}

interface CommentStore {
  comments: Map<string, Comment>

  addComment: (sectionId: string, author: string, text: string) => string  // returns commentId
  addReply: (commentId: string, author: string, text: string) => void
  resolveComment: (commentId: string) => void
  reopenComment: (commentId: string) => void
  deleteComment: (commentId: string) => void
}
```

### Workflow
1. User selects text → clicks "Add Comment"
2. `addComment()` creates a `Comment` in the store, returns `commentId`
3. Apply `comment_ref` mark with that `commentId` to the selected range
4. Comment panel shows all comments, clicking one scrolls to + highlights the range

### Rendering
- Commented text: yellow underline (CSS only, via `.wordo-comment-ref` class)
- Resolved comments: dimmed underline
- Comment panel: sidebar list, sorted by document position

### UI Component
```
components/
  CommentPanel.tsx     — sidebar list of all comments
  CommentBubble.tsx    — individual comment with replies
  AddCommentDialog.tsx — simple text input popup
```

### Logging
```
[WORDO:Comment] info  comment-added     { commentId: 'cmt_001', sectionId: 'sec_1', author: 'barry', textLength: 45 }
[WORDO:Comment] info  reply-added       { commentId: 'cmt_001', replyId: 'rpl_001', author: 'ai' }
[WORDO:Comment] info  comment-resolved  { commentId: 'cmt_001' }
```

### Time estimate: ~2.5 hours

---

## Module 6: Provenance Tracking

> Record when each block was created/modified and by whom.

### Design
We track provenance at the **block level** (not word level — that would require tracking every
keystroke's author, which is Google Docs-level complexity). Block-level provenance answers:
"who last touched this paragraph and when?"

### Implementation
Extend the block `id` attrs (from Module 2) with provenance attrs:

```typescript
// Added to every block node via withBlockId():
attrs: {
  id: { default: null },
  createdAt: { default: null },     // ISO timestamp
  createdBy: { default: null },     // author name
  modifiedAt: { default: null },    // ISO timestamp — updated on every change
  modifiedBy: { default: null },    // author name — updated on every change
}
```

### Plugin
Extend the `blockIdPlugin` to also stamp `createdAt`/`createdBy` on new nodes,
and update `modifiedAt`/`modifiedBy` when a block's content changes.

```typescript
appendTransaction(transactions, oldState, newState) {
  // For each block node in newState.doc:
  //   - if id is null: assign id + createdAt + createdBy
  //   - if content differs from same id in oldState: update modifiedAt + modifiedBy
}
```

**How to detect content change:** Compare `node.content` between old and new state by block ID.
The plugin already walks all blocks for ID assignment; extending it to also check modification
is a small addition (~30 lines).

### Logging
```
[WORDO:Provenance] debug block-created   { blockId: 'blk_abc', by: 'barry', at: '2026-03-25T10:00:00Z' }
[WORDO:Provenance] debug block-modified  { blockId: 'blk_abc', by: 'barry', at: '2026-03-25T10:05:00Z' }
```

### Time estimate: ~1 hour (builds on Module 2's plugin)

---

## Module 7: AI Context Serializer

> Serialize the full document state into a structured JSON that AI can query.

### Design
Two functions:

1. `getDocumentContext(orchestrator)` → full document snapshot
2. `getSelectionContext(orchestrator, sectionId, selection)` → focused context around current selection

Both return plain JSON objects — no classes, no methods, pure data.

### File
```
services/
  AIContextSerializer.ts
```

### Full Document Context Schema

```typescript
interface DocumentContext {
  documentId: string
  title: string
  sections: SectionContext[]
  comments: CommentContext[]
  trackChanges: TrackChangeContext[]
  serializedAt: string
}

interface SectionContext {
  sectionId: string
  blocks: BlockContext[]
}

interface BlockContext {
  blockId: string
  type: string               // 'paragraph' | 'heading' | etc.
  text: string               // Plain text content of the block
  sentences: SentenceContext[]
  marks: MarkContext[]        // All marks active anywhere in this block
  provenance: {
    createdAt: string | null
    createdBy: string | null
    modifiedAt: string | null
    modifiedBy: string | null
  }
  trackChanges: TrackChangeContext[]
  commentIds: string[]
  headingLevel?: number       // Only for heading blocks
}

interface SentenceContext {
  index: number
  text: string
  offsetInBlock: number       // Character offset from block start
  words: WordContext[]
}

interface WordContext {
  index: number
  text: string
  offsetInSentence: number
  marks: string[]             // ['strong', 'highlight'] etc.
}

interface MarkContext {
  type: string
  from: number                // Offset within block
  to: number
  attrs?: Record<string, unknown>
}

interface TrackChangeContext {
  changeId: string
  type: 'insert' | 'delete'
  author: string
  timestamp: string
  text: string
  blockId: string
  sentenceIndex?: number
}

interface CommentContext {
  commentId: string
  author: string
  text: string
  status: 'open' | 'resolved'
  replies: { author: string; text: string; createdAt: string }[]
  anchorBlockId: string
  anchorText: string          // The text the comment is attached to
}
```

### Sentence/Word Tokenization

Simple approach — no NLP dependency:

```typescript
function tokenizeSentences(text: string): string[] {
  // Split on . ! ? followed by space or end-of-string
  // Handle common abbreviations: Mr. Mrs. Dr. etc.
  return text.split(/(?<=[.!?])\s+/)
}

function tokenizeWords(sentence: string): string[] {
  // Split on whitespace, keep punctuation attached to preceding word
  return sentence.split(/\s+/).filter(w => w.length > 0)
}
```

**Why this is enough for now:** Perfect sentence boundary detection is an NLP problem (e.g.,
"U.S.A. is a country." has one sentence, not four). But for our use case — giving AI
approximate sentence/word positions — a simple regex split is 95% correct and zero-dependency.
We can swap in a smarter tokenizer later without changing the interface.

### Selection Context

```typescript
interface SelectionContext {
  sectionId: string
  blockId: string
  selectedText: string
  sentenceIndex: number | null
  wordRange: [number, number] | null   // word indices in the sentence
  marks: string[]
  hasTrackChange: boolean
  commentIds: string[]
  surroundingContext: {
    blockBefore: { blockId: string; text: string } | null
    blockAfter: { blockId: string; text: string } | null
  }
}
```

### Logging
```
[WORDO:AIContext] info  document-serialized  { sectionCount: 3, blockCount: 47, commentCount: 5, changeCount: 12, ms: 8 }
[WORDO:AIContext] info  selection-serialized { sectionId: 'sec_1', blockId: 'blk_abc', selectedText: 'quick brown' }
```

### Time estimate: ~2 hours

---

## Module 8: Document Persistence

> Save and load documents so they survive page refresh.

### Phase 1: localStorage (today)
- Serialize PM state per section → JSON (using `node.toJSON()`)
- Serialize sidecar stores (comments, track changes) → JSON
- Save to `localStorage` under key `kasumi_wordo_doc_{docId}`
- Auto-save on every content change, debounced to 2 seconds
- Load on app mount

### Phase 2: Baserow backend (future — not in this plan)

### Implementation

```typescript
// services/DocumentPersistence.ts

interface SerializedDocument {
  version: 1
  documentId: string
  title: string
  sections: {
    sectionId: string
    pmDocJson: object     // from node.toJSON()
    pageStyle: PageStyle
    watermark?: WatermarkConfig
  }[]
  comments: Comment[]
  metadata: {
    savedAt: string
    savedBy: string
  }
}

function saveDocument(store: WordoState, commentStore: CommentStore): void {
  // Serialize orchestrator sections via .state.doc.toJSON()
  // Serialize comment store
  // Write to localStorage
  // Log: [WORDO:Persist] info document-saved { docId, sectionCount, size: '12KB' }
}

function loadDocument(docId: string): SerializedDocument | null {
  // Read from localStorage
  // Validate version field
  // Return parsed data or null
}
```

### Auto-save Plugin

```typescript
// editor/autoSavePlugin.ts
// A PM plugin that sets a dirty flag on any transaction
// A 2-second debounced save triggers when dirty
// This keeps it simple — no complex diffing, just full serialization
```

### Logging
```
[WORDO:Persist] info  document-saved    { docId: 'doc_123', sections: 3, sizeKB: 12, ms: 5 }
[WORDO:Persist] info  document-loaded   { docId: 'doc_123', sections: 3, sizeKB: 12 }
[WORDO:Persist] warn  save-failed       { docId: 'doc_123', error: 'QuotaExceededError' }
[WORDO:Persist] info  auto-save-skip    { reason: 'no-changes' }
```

### Time estimate: ~1.5 hours

---

## Module 9: Command Executor

> Wire the existing `WordoCommand` types to actual PM transactions.

### Design
A single function that takes a `WordoCommand` and dispatches it to the correct
ProseMirror transaction on the correct section via the orchestrator.

```typescript
// services/CommandExecutor.ts

function executeCommand(
  command: WordoCommand,
  orchestrator: LayoutOrchestrator,
  commentStore: CommentStore,
  trackChangeStore: TrackChangeStore,
): { success: boolean; error?: string } {
  const log = createLogger('CommandExecutor')
  log.info('execute', { type: command.type, fromAI: command.fromAI })

  switch (command.type) {
    case 'insert_block': return handleInsertBlock(command, orchestrator)
    case 'delete_block': return handleDeleteBlock(command, orchestrator)
    case 'update_block': return handleUpdateBlock(command, orchestrator)
    case 'apply_style':  return handleApplyStyle(command, orchestrator)
    case 'rewrite_block': return handleRewriteBlock(command, orchestrator)
    // ... etc
  }
}
```

### Register on Platform Command Bus
```typescript
// In WordoShellRoute.tsx mount:
commandBus.register('wordo', (cmd) => executeCommand(cmd, orchestrator, commentStore, trackChangeStore))
```

### Logging
Every command execution is logged with full context:
```
[WORDO:Cmd] info  execute          { type: 'insert_block', sectionId: 'sec_1', fromAI: true }
[WORDO:Cmd] info  execute-success  { type: 'insert_block', blockId: 'blk_new' }
[WORDO:Cmd] error execute-failed   { type: 'delete_block', error: 'block not found', blockId: 'blk_999' }
```

### Time estimate: ~2 hours

---

## Testing Strategy

### Unit tests (per module)
- **Logger:** verify output format, level filtering
- **Block IDs:** create doc → verify all blocks have UUIDs; split paragraph → verify new block gets new ID
- **Extended marks:** toggle highlight → verify mark in state; verify exclusive marks (super/subscript)
- **Track changes:** insert with tracking on → verify `track_insert` mark; delete → verify `track_delete` mark; accept/reject
- **Comments:** add comment → verify mark + store entry; resolve → verify status change; delete → verify mark removed
- **Provenance:** create block → verify createdAt/By; edit block → verify modifiedAt/By
- **AI serializer:** create doc with known content → snapshot test on output JSON
- **Persistence:** save → load → verify round-trip equality
- **Command executor:** each command type → verify PM state mutation

### Integration tests
- Full workflow: type text → add comment → enable tracking → edit → serialize AI context → verify all data present
- Import .docx → verify IDs assigned → save → reload → verify content identical

### No new test dependencies
Use existing vitest setup. Snapshot tests for AI serializer output.

---

## Dependency Audit

### Current dependencies used
| Package | Purpose | Version concern |
|---------|---------|-----------------|
| prosemirror-model | Schema, nodes, marks | Stable |
| prosemirror-state | EditorState, Plugin, Transaction | Stable |
| prosemirror-view | EditorView | Stable |
| prosemirror-history | Undo/redo | Stable |
| prosemirror-tables | Table support | Stable |
| prosemirror-schema-basic | Base schema | Stable |
| prosemirror-schema-list | List handling | Stable |
| prosemirror-commands | Key commands | Stable |
| prosemirror-keymap | Keymap plugin | Stable |
| prosemirror-inputrules | Input rules | Stable |
| zustand | State management | Stable |

### New dependencies added by this plan
**None.**

Everything is built with existing ProseMirror primitives + Zustand + browser APIs.
- UUID generation: `crypto.randomUUID()` (built-in)
- Sentence tokenization: regex (built-in)
- Persistence: `localStorage` (built-in)
- Logging: `console` (built-in)

---

## Rollout Order

Build in this exact order (each module depends on predecessors):

```
Day 1 (Today)
├── Module 1: Logging               [30 min]  ← foundation
├── Module 2: Stable Block IDs      [1 hr]    ← foundation
├── Module 3: Extended Marks         [1 hr]    ← schema ready
├── Module 5: Comment System         [2.5 hr]  ← immediately useful
└── Module 7: AI Context Serializer  [2 hr]    ← AI can read the doc

Day 2
├── Module 4: Track Changes          [4 hr]    ← most complex
├── Module 6: Provenance Tracking    [1 hr]    ← extends Module 2
├── Module 8: Document Persistence   [1.5 hr]  ← save/load
└── Module 9: Command Executor       [2 hr]    ← wire everything up

Day 3
└── Testing + edge case fixes        [3 hr]
```

**Total estimated work: ~18.5 hours across 3 days**

### What you get at the end of Day 1
- Every block has a stable ID
- Highlight, underline, strikethrough, font size, font color marks work
- Comments with threading and status
- AI can serialize the full document state to structured JSON

### What you get at the end of Day 2
- Full track changes (insert/delete tracking with accept/reject)
- Provenance on every block (who created, who last modified, when)
- Document auto-saves to localStorage
- All WordoCommand types execute real PM transactions

### What you get at the end of Day 3
- Comprehensive test coverage
- Edge cases handled (large documents, rapid edits, concurrent comments)
- Ready for Baserow backend integration (Phase 2)
