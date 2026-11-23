---
name: fixcontent
description: 'Explicit invocation only: /fixcontent in Claude Code or $fixcontent in Codex. Apply one owner-approved targeted correction to the reference-locale file of a document and, when appropriate, its mechanical mirror in the translations, then validate the content. Never auto-trigger or translate.'
---

# Fix content — a relationship-aware targeted edit in src/content

The owner names a document and a targeted change ("in `<key>`, delete the paragraph about X", "fix
the typo in `<key>`", "replace the dead link Y with Z"). `src/content` is the source of truth, so this
skill edits the document files directly, decides up front how the translations are affected, gets the
owner's approval, makes the edit and validates. Its value is the guarded edit that keeps the
relationships intact, not the keystrokes.

**It makes targeted corrections, not translations.** If the change rewrites meaning or adds new prose
(a substantive edit, an end note of the author), the translations need a genuine translation: that is
`/translate`, and this skill routes the change there instead of half-doing it.

## When to use

Only when the user explicitly invokes `/fixcontent` in Claude Code or `$fixcontent` in Codex. Never
trigger on "fix this text".

## Shared safety

This skill inherits [`../astrum-scena-shared/safety.md`](../astrum-scena-shared/safety.md) and
[`AGENTS.md`](../../../AGENTS.md). Read them first; the rules below sit on top of them.

## Core protocols

- **Decide before you edit.** Classify the change and its effect on the translations in Phase 1 and get
  the owner's approval before touching a file. Never leave the repository broken because a blocker
  turned up after the edit.
- **Edit the document files directly.** The edit goes to the reference-locale file
  `src/content/<collection>/<key>.<reference-locale>.md(x)`. The only edits allowed in a translation
  file `<key>.<locale>.md(x)` are the same change **mechanically mirrored**: removing the same deleted
  passage, replacing the same link or name, or syncing an `excerpt`. Never write new prose in a
  translation and never translate here.
- **Authored prose is out of scope.** A substantive rewrite or a new end note is `/translate`: stop and
  route it there.
- **Staleness is honest.** An edit of the reference locale may leave a translation behind; say so in
  the chat. Never touch the `translatedFromDigest` marker: its divergence is the honest record that the
  translation may now lag.
- **Language:** talk with the owner in the language they write in; write each edit in the locale of its
  file. **No commit**: leave the changes in the working tree and propose a commit message.

## Scope — documents only

Handled: the documents of `articles`, `pages` and the collections of enabled modules
(`src/content/<collection>/<key>.<locale>.md(x)`), matched by `translationKey` (the `<key>` stem) or
`slug`. Editable: the frontmatter `title` and `excerpt` and the Markdown or MDX body.

**Out of scope (say so and stop):**

- photos and taxonomy terms: another model (`/add-album`, or the owner);
- substantive rewrites and new end notes: they need a translation → `/translate`;
- structural MDX changes in an `.mdx` document (inserting or moving blocks) → `/sync-mdx`.

## Workflow

### Phase 0 — Locate

Resolve the request to a document (announce its collection and key or slug), the locale file and the
field or occurrence. If it is ambiguous (which document, which occurrence), ask. Read the current
reference-locale text and note which translation files of the document exist.

### Phase 1 — Plan the whole change and get approval (STOP)

Before editing anything, present and wait for an explicit approval:

1. The **before → after** snippet of the reference-locale file (the affected span with a little
   context).
2. The inferred **kind**: `typo | factcheck | linkfix | deletion | excerpt`.
3. The **effect on each translation**, decided here and not later:
    - **No translation, or it is already correct** → the reference locale only. Say so.
    - **Mechanical mirror** (a deletion, a link or name replacement, an excerpt fix) → the exact
      before → after of each translation. A mirror must not empty a required field or leave the
      locales inconsistent; if it would, the change is substantive → `/translate`.
    - **Substantive** (meaning rewritten, or a new end note to write) → **out of scope.** Stop and tell
      the owner to use `/translate`.

Go past Phase 1 only for an approved change of the reference locale alone or with mechanical mirrors.

### Phase 2 — Apply the edit

Edit the target span of the reference-locale file. If Phase 1 decided on a mechanical mirror, apply
the same change to each translation file. Keep the frontmatter valid and `slug`, `translationKey` and
`locale` untouched: the edit changes text, not identity.

### Phase 3 — Validate

Run `pnpm exec astrum-scena check content`: the pairing of the locales by `translationKey`, the
existence of places and tags, album membership and covers, kebab ids and slug ownership. It does not
follow links from one document to another, so also confirm by reading that every document reference
and internal link the edit touches still resolves and introduces no unsafe scheme, and that the
frontmatter still matches the schema and the filename. Everything must be green before delivery.

### Phase 4 — Deliver

Summarize what changed and the decision on the translations, and mention, as a convenience, that
`/factcheck <key>` can run again if the edit touched an external claim. Propose a commit message; do
not commit unless the owner asks.

## Product checks

- The locales of the document still pair by `translationKey`; a mechanical mirror keeps them
  consistent; staleness is reported, never hidden.
- `astrum-scena check content` is green: references across collections, locales and pairing.
- Around the edit, beyond the gate: every document reference and internal link it touches resolves,
  with safe hrefs.
- The frontmatter is valid and the filename stem is still `translationKey` with its locale suffix.
- The right document and occurrence were resolved before the edit.

## Invocation

`/fixcontent`

## Guardrails recap

Decide the effect on the translations in Phase 1, before editing; edit the reference-locale file plus
the mechanical mirror in each translation; never translate or write an end note here (→ `/translate`);
never touch identity fields or the `translatedFromDigest` marker; run `astrum-scena check content`;
leave a fact-check re-run and the commit to the owner.
