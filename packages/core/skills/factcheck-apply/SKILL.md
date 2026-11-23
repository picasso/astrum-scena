---
name: factcheck-apply
description: 'Explicit invocation only: /factcheck-apply in Claude Code or $factcheck-apply in Codex. Apply the owner-accepted findings of the fact-check ledger in batch: mechanical fixes in every locale and one consolidated end-note region per document. Never auto-trigger or decide findings.'
---

# Fact-check apply — the batch application of accepted findings

`/factcheck` proposes fixes and stops at the owner's decisions; this skill is its writing counterpart.
It reads the accepted, actionable findings of `data/factcheck/ledger.yaml` and applies them to
`src/content`: mechanical fixes in place first, then one consolidated region of end notes per document
(written in the reference locale, translated into the others). It follows the guarded edit discipline
of `/fixcontent`, in batch. Every edit is idempotent by content, so no applied markers are kept.

## When to use

Only when the user explicitly invokes `/factcheck-apply` in Claude Code or `$factcheck-apply` in Codex.
Never trigger on "apply these fixes".

## Shared safety

This skill inherits [`../astrum-scena-shared/safety.md`](../astrum-scena-shared/safety.md) and
[`AGENTS.md`](../../../AGENTS.md). Read them first; the rules below sit on top of them.

## Boundary

- **Not `/factcheck`.** Never change the owner's decision (`decision.status`, `reviewedByOwner`). Act
  only on findings the owner accepted; if none is accepted and actionable, stop.
- **Not `/fixcontent`.** That skill makes one change in one document and refuses new end notes; this
  skill owns the batch and the writing of end notes.
- **Not `/translate`.** End-note lines are about one sentence each and are translated in one batch,
  never as a translation of the whole document.

## Translation of the end notes

The new or changed note lines of all documents are translated in **one** batch pass: the `translator`
agent, then the `translation-reviewer` agent, which checks meaning, voice and that each line stays one
plain sentence. The core installs both for each host (`.claude/agents/` for Claude Code,
`.codex/agents/` for Codex); spawn the host's own, never the parent conversation. When the host lets you choose models, the reviewer runs on a different
model from the translator; otherwise report **reduced diversity**. If the review cannot complete, stop
the end-note batch and report it; the fixes in place may still proceed.

## Idempotency by content

The file is the oracle of "already applied": a fix in place is done once `raw` is gone and the
replacement is present; a note is done once its line is in the document's region. A run that stopped
half-way is safe to repeat: it skips what is already there.

## Core protocols

- **Edit points.** The reference-locale file `src/content/<collection>/<key>.<reference-locale>.md(x)`
  and each translation `<key>.<locale>.md(x)` of the document.
- **The owner approves every writing batch** (fixes in place, reference-locale notes, translated
  notes). Transcribe only; never apply on your own, never guess a replacement or a literal.
- **Stop on ambiguity.** Each edit below names its stop conditions; never work around one.
- **Language:** talk with the owner in the language they write in; write the notes in the locale of
  their file, in the author's voice — the voice guide the site's `AGENTS.md` names, if any. **No
  commit**: propose a commit message.

## Edits

- **A link fix (`kind: url`, or a self-link).** Find the Markdown links whose destination is exactly
  `raw` (`[label](raw)`, `[label](<raw>)` or `<raw>`). Stop on none or on more than one. The replacement
  must be a safe URL (http(s), a `/relative` path, `#` or `mailto:`) without spaces, quotes, `<`, `>`,
  backticks or backslashes; stop otherwise. Wrap the destination in `<…>` when it was wrapped or the
  replacement has parentheses. When the label is the URL itself, rewrite it to the replacement, keeping
  a bare host only when it was bare and the replacement has no path; a descriptive label stays.
- **A rename (`kind: company | product | claim`).** Replace every whole-word occurrence of `raw` in
  visible prose (not inside an HTML tag); many occurrences are expected. Stop on none, and on a
  replacement with quotes, `<`, `>`, `=` or backticks.
- **The end-note region.** The notes of a document are the trailing run of directives, one per note:

    ```markdown
    :::note{claim="<findingId>:<digest8>"}
    One sentence of the note.
    :::

    :::note{claim="<findingId>:<digest8>" notitle}
    The next note.
    :::
    ```

    The first note prints the heading, every later one carries `notitle`; a `tone="…"` or `icon="…"`
    an author added is kept. `digest8` is the first 8 hex characters of the SHA-256 of the UTF-8 JSON
    array `[raw, action, replacement, noteRu]` of the finding, written without spaces, an absent field
    as `null`. The region stands before the trailing `:::links` blocks of the document, or at its end;
    a new region goes before them. Keep a note already present byte for byte, replace a changed one,
    drop one no longer accepted, add new ones. Stop on a malformed or unclosed `:::note`, a claim note
    outside the trailing region, a `title` on a claim note, or a note text with a line break, a `:::`
    line or HTML.

## Workflow

Run the **fixes in place first** (mechanical, no translation), **then the end notes** (two owner
checkpoints and a translation pass).

### Phase 0 — Select, classify and announce (read-only)

Read the ledger and collect the accepted, actionable findings (`decision.status: accepted` and an
action other than `none`), grouped by document. Announce the batch of fixes in place and the batch of
end notes per document, with counts. **Stop for** an accepted end note of a document that lacks a
file for any locale of the site (`content.locales`): its note would be missing in that locale, so
report the document and leave it out. If nothing
applies, say so and stop.

### Phase A — Fixes in place (no translation)

For each finding, by document:

1. In the reference-locale file, check idempotency first: if the replacement is present and `raw` is
   gone, the finding is already applied — skip it. If neither is present, stop (a stale or
   out-of-band edit); never guess a place.
2. Otherwise apply the link fix or the rename above.
3. **Owner checkpoint:** show every before → after with context, and wait for approval.
4. Apply the approved edits to the reference-locale file.
5. **Mirror into each translation (required where the link reached it).** If the translation already
   shows the replacement, or `raw`'s link never reached it, change nothing. Otherwise apply the same
   link fix, or the rename in the form the owner confirms for that locale (a name may be spelled
   differently there; if `raw` is not verbatim in the translation and no form is given, stop and ask).

### Phase B — End notes in the reference locale

1. For each document with accepted end notes, compose its region from the `noteRu` lines of its
   accepted findings, as described above.
2. **Owner checkpoint (a):** present each document's consolidated region (new and already present
   lines) for one approval.
3. Write the approved regions into the reference-locale files.

### Phase C — Translate the note lines

1. Collect only the new or changed note lines of all documents into one batch; a note already present
   keeps its translation.
2. Translate and review them as described above.
3. **Owner checkpoint (b):** present the translated lines next to their sources and wait for approval.
   The heading is never written into a body: the render prints the locale's own.

### Phase D — Insert the translations and validate

1. Write the approved notes into each translation file's region with the same claims, keeping lines
   already present byte for byte.
2. Run `pnpm exec astrum-scena check content`, then confirm by reading that every edited document has
   the same links in every locale, safe hrefs, and the region in every locale that needs it.
3. Run the site's build. A run of `/factcheck` for the touched documents is a convenience, not a step.

### Phase E — Deliver

Summarize the fixes in place per document and locale, the end notes per document with the agents and
models that ran, any reduced diversity, and the validation result. Propose a commit message; do not
commit unless the owner asks.

## Product checks

- The links of every edited document match across its locales; every href is safe.
- Every document with an accepted end note has its region in every locale.
- A second run skips what is already applied.
- `astrum-scena check content` and the site's build are green.

## Invocation

`/factcheck-apply`

## Guardrails recap

Fixes in place first (the reference-locale file, then the mirror in each translation; a link edit
stops on none, many or an unsafe replacement, a rename replaces all and stops only on none), then the
consolidated end notes (owner approval in the reference locale → translation with an independent
review → owner approval of the translations), then `astrum-scena check content`, link parity and the
build; idempotency comes from the content; never decide findings or translate a whole document.
