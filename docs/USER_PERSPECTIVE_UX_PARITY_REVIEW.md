# KASUMI User-Perspective UX Parity Review

## Purpose

This document captures a user-perspective review of KASUMI with emphasis on whether the product feels:

- close to real Microsoft Excel / Word in everyday operation
- natively AI-friendly rather than merely AI-adjacent
- visually credible as spreadsheet/document software rather than a generic web app

This review is intended as a companion to the behavioural parity planning documents. It focuses on what a normal user notices immediately.

## Executive Summary

KASUMI is directionally strong but not yet convincing as Excel/Word-like productivity software.

- The overall shell structure is recognizable.
- Some surface-level affordances are already present.
- The most visible credibility gap is that important Ribbon tabs do not yet behave like real Ribbon surfaces.
- The AI story is still weak from a user point of view: current integration signals data connectivity more than native authoring assistance.

Current high-level assessment:

- Office-like credibility: `7/10`
- AI-native friendliness: `4/10`
- Visual fidelity to Excel/Word patterns: `6/10`
- Behavioural parity in common operations: not yet sufficient for default-user expectations

## User-Perspective Findings

### P1: Ribbon tab behaviour breaks the Office mental model

In NEXCEL, Ribbon tabs such as `Insert`, `Data`, and `View` do not currently provide the expected content change and interaction response. From a user perspective, this is one of the fastest ways to lose trust in the product.

Why this matters:

- Real Excel/Word users expect the active Ribbon tab to materially change available commands.
- If tabs look interactive but behave like placeholders, the interface feels unfinished.
- This undermines both behavioural parity and visual credibility at the same time.

Recommendation:

- Make tab switching functional before adding more secondary commands.
- Ensure each active tab has distinct command groups, not only a highlighted label.

### P1: WORDO does not yet feel like a true Word-style Ribbon app

WORDO currently reads more like an editor with a toolbar than a Word-like document surface with a proper Ribbon model.

Why this matters:

- Word users expect command discovery through tabbed tool areas.
- A single-line toolbar reduces familiarity even if many commands exist underneath.
- The product can be functionally capable while still failing the user expectation model.

Recommendation:

- Move WORDO toward a tabbed Ribbon structure aligned with the spreadsheet shell.
- Keep command grouping consistent with common Word categories such as `Home`, `Insert`, `Layout`, `Review`, and `View`.

### P1: Shell inconsistency makes the suite feel less like one product

NEXCEL and WORDO do not yet present as two surfaces inside one coherent office suite.

Observed issue:

- NEXCEL has a stronger menu/Ribbon framing.
- WORDO does not yet match that shell structure closely enough.

Why this matters:

- Users expect mode changes across a suite to preserve core navigation and command habits.
- Inconsistency weakens the “native office software” impression.

Recommendation:

- Standardize top-level shell patterns across both surfaces.
- Preserve product-specific controls, but unify menu location, tab affordances, and command grouping logic.

## Design-Idea Evaluation

## Does it feel like “human-friendly Word, but natively AI-friendly”?

Not yet.

Current issue:

- The visible AI proposition is too weak.
- “Connect to Baserow” may be useful, but users do not interpret it as intelligent document/spreadsheet assistance.
- There is not yet a clearly discoverable AI workflow embedded into normal editing behaviour.

For the design idea to land, AI must feel like part of the authoring flow:

- suggest formula help while editing
- transform selected text or selected ranges
- summarize, clean, rewrite, explain, or extract based on active selection
- assist without forcing context switching away from the document/sheet

Recommendation:

- Introduce a clearly visible AI command entry point in both shells.
- Bind AI actions to user context: active cell, selected range, caret position, or selected text.
- Make AI operations feel like native commands, not external utilities.

## Visual Review: What still does not look enough like Word/Excel?

### NEXCEL gaps

- Ribbon looks structurally similar, but not all tab states are credible.
- Some command areas still read as prototype-level rather than production office UI.
- The top surface needs clearer hierarchy and denser, more disciplined command grouping.

### WORDO gaps

- Toolbar presentation is still closer to a web editor than Word.
- The command surface lacks the strong tabbed structure users associate with document software.
- The overall shell needs more Word-like information architecture before visual polish alone will help.

### Cross-product gaps

- The two shells do not yet share a convincing suite-level visual system.
- Some controls feel application-specific rather than office-suite-native.
- The current output is recognizable, but not yet persuasive enough to trigger “this feels like Word/Excel” from experienced users.

## Recommended Additional Testing

The following tests should be run from an end-user perspective, not only as implementation checks.

### Core interaction tests

- Open a new spreadsheet and confirm cell `A1` is selected and ready for immediate typing.
- Open a new document and confirm the caret is placed at the top and ready for immediate typing.
- Click Ribbon tabs repeatedly and verify the command surface changes meaningfully every time.
- Move between shell surfaces and verify focus restoration feels intentional.

### Keyboard-first UX tests

- Test `Enter`, `Tab`, arrow keys, `Shift` selection, and direct typing in NEXCEL.
- Test text selection, typing, paragraph insertion, and modifier shortcuts in WORDO.
- Verify that command invocation does not unexpectedly steal focus from the active editing surface.

### AI-native workflow tests

- Select text and check whether AI actions are discoverable and context-aware.
- Select a cell or range and check whether AI can explain, transform, or generate useful output in place.
- Verify that AI actions feel like editing commands, not detached integrations.

### Visual and credibility tests

- Ask real users which surface feels more complete and why.
- Ask whether the UI feels closer to Word/Excel or to a custom web tool.
- Check whether inactive or placeholder controls create false expectations.

## Improvement Priorities

1. Make Ribbon tabs fully real in NEXCEL.
2. Rebuild WORDO command presentation toward a true tabbed Ribbon structure.
3. Unify shell architecture so both surfaces feel like one suite.
4. Add visible, context-aware AI command entry points.
5. Tighten visual hierarchy, spacing, grouping, and command density to better match office software expectations.

## Message To Kasumi

If the goal is “looks like Word/Excel, but natively AI-friendly,” then the current product is not there yet.

The next round should not focus only on adding more commands. It should focus on:

- making top-level Ribbon behaviour real
- making WORDO structurally feel like Word
- making AI visible inside normal editing flows
- removing placeholder interactions that weaken trust

The strongest immediate win is to fix what users notice within the first minute: tab behaviour, shell consistency, and discoverable AI actions tied to active context.
