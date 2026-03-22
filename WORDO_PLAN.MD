PRD — KASUMI WORDO
Development Codename: KASUME WORDO
1. Product Summary

KASUMI WORDO is the Word-like document shell for the KASUMI workspace platform.

Its purpose is to deliver a document editing experience that feels extremely close to Microsoft Word for day-to-day professional writing, formatting, and review, while preserving a fully AI-friendly, schema-driven internal structure.

WORDO is not a standalone editor. It is a second shell within KASUMI, complementary to KASUMI Nexcel.

Nexcel solves:

spreadsheet-native interaction over structured data

WORDO solves:

document-native interaction over structured document and layout objects

Together, they form a unified AI-native workspace.

2. Vision

Users should feel that they are working in something almost indistinguishable from Word:

pages

sections

headers/footers

footnotes

page numbers

watermarks

tables

images

styles

comments/review constructs later

But the system should never behave internally like .docx spaghetti or browser DOM soup.

Instead, WORDO should maintain:

explicit document schema

explicit page/section objects

explicit style objects

stable object identity

deterministic command handling

direct AI operability

The frontend should feel like Word.
The internal model should feel like structured data.

3. Why This Product Exists

Traditional Word and .docx workflows are hostile to deterministic AI and programmatic editing because:

content, styling, and layout are tightly entangled

page-level constructs are not surfaced as clean semantic objects

automated edits are brittle under complex formatting

cross-linking between tables and narrative is fragile

provenance of changes is weak from an AI-command perspective

KASUMI has already solved the spreadsheet version of this problem by separating Excel-like interaction from structured backend semantics. WORDO extends the same design principle to documents.

4. Product Goals
Primary goals

Deliver a Word-like editing experience for professional documents

Preserve AI-native structured document semantics

Integrate seamlessly with KASUMI Nexcel objects and tables

Support common Word-grade layout features without falling back to uncontrolled formatting blobs

Allow AI to edit content, formatting, and document structure through validated commands

Secondary goals

Support rich import/export workflows

Support linked embeds from Nexcel

Support reusable templates and styles

Support future review/approval workflows

5. Non-Goals (Phase 1)

These are explicitly out of scope for initial WORDO release:

full .docx fidelity round-tripping

VBA/macros

desktop Word plug-in compatibility

unrestricted arbitrary layout hacking

advanced publishing/DTP features

track changes parity at launch

full citation manager ecosystem

complex mail merge engine at launch

The goal is Word-like workflow fidelity, not full Microsoft Word replication.

6. Target Users
Primary users

knowledge workers writing structured business documents

analysts writing reports over live structured data

audit, compliance, finance, operations, and government users

users who currently combine Word + Excel manually

Secondary users

AI-assisted authors

internal platform builders

teams that need linked document/table workflows

template-driven reporting teams

7. Core User Problem

Users currently split work across:

Word for narrative and formatting

Excel for structured data

scripts/manual copy-paste for reconciliation

AI tools that cannot safely operate on real-world formatting complexity

WORDO must eliminate the break between structured data and formatted narrative.

The user should be able to:

write a report

insert a live or snapshot table from Nexcel

bind fields in the document to structured data

ask AI to update sections, reformat pages, or regenerate narrative safely

preserve document integrity throughout

8. Product Principles
8.1 Shell over structure

WORDO is a shell over structured document objects, just as Nexcel is a shell over structured table objects.

8.2 AI never edits raw DOM

AI interacts only through validated operations against the canonical document model.

8.3 Page semantics are first-class

Headers, footers, sections, watermarks, footnotes, page numbering, and page styles are explicit objects.

8.4 Shared workspace identity

Document objects and spreadsheet objects can reference each other through stable IDs.

8.5 Import/export are edge functions

Imported .docx and exported .docx are interoperability formats, not the canonical internal truth.

9. Product Scope
9.1 Phase 1 MVP Scope
Editing shell

document route and document shell layout

top ribbon

style bar

page canvas

status bar

section navigator

outline / structure panel

Core editing

paragraphs

headings

lists

inline formatting

alignment

indentation

line spacing

tables

images

page breaks

section breaks

footnotes

headers/footers

page numbering

watermark configuration

styles panel

KASUMI integration

insert Nexcel table as snapshot

insert Nexcel table as linked object

bind inline field values from structured data

refresh linked objects

object-level provenance

AI operations

rewrite selected text

reformat selected blocks

apply styles

insert section/table/footnote

update linked data-driven content

validate structure before apply

Interop

import .docx

import .md or structured text if useful

export .docx

export .pdf

export HTML later if needed

9.2 Phase 2 Scope

comments / annotations

review mode

template packs

reusable cover pages

richer table controls

captions / cross-references

tracked AI provenance

compare versions

collaborative presence

10. User Experience Requirements
10.1 Word-like interaction fidelity

The UI should closely mimic familiar Word workflows:

ribbon-like top command area

page view, not infinite canvas only

realistic margins

visible page boundaries

header/footer edit mode

section break awareness

style dropdowns

paragraph formatting controls

table selection handles

image selection boxes

keyboard shortcuts consistent with Word where practical

10.2 Not just WYSIWYG

The editor should expose structure where helpful:

block breadcrumb / current object indicator

section navigator

page style inspector

linked object inspector

binding/source inspector

AI operation preview

This is a controlled structured editor, not a generic contenteditable surface.

11. Functional Requirements
11.1 Document shell

The product must provide:

WordoShellRoute

ribbon

quick access toolbar

style toolbar

page canvas viewport

status bar

side inspector panel

outline/structure pane

11.2 Document model

The canonical document model must support:

document

section

page style

paragraph

heading

list

table block

image block

footnote

header region

footer region

watermark config

inline formatting marks

linked embed object

snapshot embed object

data binding object

11.3 Editing behaviors

The editor must support:

text editing

block insertion/removal

style application

drag/drop or menu image insertion

table insertion and cell editing

header/footer editing

page numbering setup

watermark setup

footnote insertion/editing

section break insertion

undo/redo

11.4 Styles

The system must support:

paragraph styles

character styles

table styles

page styles

theme tokens

default template styles

Styles must be explicit objects, not only ad hoc inline formatting.

11.5 Pagination and page model

The system must support:

page size

margins

portrait/landscape

header/footer distance

first page variants

odd/even variants later

watermark display rules

section-level page settings

11.6 Tables

WORDO tables must support two modes:

Native document table

A table authored directly inside the document.

KASUMI linked table

A table embedded from Nexcel with:

linked live mode

snapshot mode

Each embedded table must expose source metadata and refresh behavior.

11.7 Data bindings

The system must support:

inline binding to a scalar field

block binding to a table/view

template binding placeholders

refresh from source

explicit failure state if source is unavailable

11.8 Import/export

The system must support:

.docx import into canonical document IR

.docx export from canonical document IR

.pdf rendering/export

graceful degradation when imported source contains unsupported constructs

12. AI Requirements
12.1 AI operation model

AI must not directly mutate ProseMirror state or browser DOM.

AI must interact through structured operations such as:

insert_section

rewrite_block

apply_paragraph_style

set_header

set_footer

insert_footnote

insert_linked_table

refresh_binding

set_watermark

12.2 Validation

Every AI operation must pass:

schema validation

capability/permission check

style/page consistency validation

source binding validation if linked to Nexcel

12.3 Explainability

AI-applied operations should be inspectable as structured transactions.

13. Technical Architecture
13.1 Core recommendation

Use ProseMirror as the document editing core, because it is schema-driven, MIT-licensed, and designed around explicit document structure rather than opaque editor state.

13.2 Relationship to existing KASUMI architecture

WORDO should mirror the proven KASUMI shell pattern:

WordoShell UI
  -> Wordo Store(s)
  -> IDocumentAdapter / WorkspaceAdapter
  -> Document Core + Shared Workspace Object Graph
  -> Baserow / future document persistence services / realtime
13.3 Reuse from current KASUMI

The following architectural patterns should be reused almost directly:

route-level shell mounting

Zustand-style centralized store discipline

adapter boundary

mock/real runtime mode

access modes and capability gating

optimistic update with rollback

explicit canonical types

modular import/export services

This recommendation is based on the current KASUMI repo structure and documented architecture.

13.4 New shared substrate needed

WORDO requires a shared workspace layer above Nexcel and Wordo:

workspace object IDs

cross-reference registry

style registry

binding registry

transaction/provenance ledger

permission model

AI command bus

This is the main new architecture work.

14. Proposed Module Structure
frontend/
  src/
    modules/
      workspace-core/
        adapters/
        stores/
        types/
        commands/
        provenance/
        bindings/
        styles/
      wordo-shell/
        adapters/
        components/
          Ribbon/
          StyleBar/
          PageCanvas/
          OutlinePanel/
          InspectorPanel/
          StatusBar/
          HeaderFooterEditor/
          WatermarkPanel/
        editor/
          schema/
          plugins/
          commands/
          pagination/
          rendering/
        stores/
        services/
        import-export/
        types/
        WordoShellRoute.tsx
      excel-shell/
        ...
15. Access Modes

WORDO should inherit KASUMI’s access-mode philosophy.

data-entry

edit body text

fill bound placeholders

no structural template changes

analyst

edit content

insert tables/images/footnotes

refresh linked data

apply styles

export

admin

modify templates

modify style registry

modify bindings

manage section/page settings

manage schema-affecting document constructs

The existing KASUMI access store is already a strong precedent for this pattern.

16. Success Metrics
User metrics

users can draft a professional paged document without training

users can insert and refresh Nexcel-backed tables without copy/paste

users perceive formatting behavior as Word-like

AI can perform common document edits without breaking formatting integrity

Technical metrics

document operations are transaction-safe

schema-invalid AI mutations are blocked

page/layout settings are explicit and serializable

linked data objects preserve source traceability

17. Main Risks
17.1 Pagination complexity

The hardest part is not text editing; it is page-aware layout behavior.

17.2 DOCX import/export mapping

Interoperability will be imperfect unless carefully scoped.

17.3 Overbuilding a full office suite

WORDO should focus on Word-like document workflows, not every publishing feature.

17.4 Dual-model drift

If document objects and spreadsheet objects do not share a real workspace identity model, “integration” will become superficial.

18. Recommended Build Sequence
Phase 0 — Architecture

define workspace object model

define document IR

define shared command model

define binding model

define style/page model

Phase 1 — Shell + editor core

Wordo shell layout

ProseMirror integration

base document schema

central stores

undo/redo

page canvas

Phase 2 — Word-like essentials

headings/paragraphs/lists

styles

tables

images

page breaks/section breaks

headers/footers

footnotes

page numbers

watermark config

Phase 3 — KASUMI integration

insert linked Nexcel table

insert snapshot table

scalar data binding

refresh behavior

provenance

Phase 4 — AI command layer

operation schema

validation pipeline

preview/apply flow

audit trail

Phase 5 — import/export hardening

docx import/export

pdf output

template handling

error recovery

19. Final Product Statement

KASUMI WORDO is not “Word on the web”.

It is a Word-like shell inside an AI-native workspace, where documents, tables, styles, bindings, and layout objects are all explicit, structured, and safely operable by both humans and AI.