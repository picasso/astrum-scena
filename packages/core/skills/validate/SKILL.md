---
name: validate
description: "Explicit invocation only: /validate in Claude Code or $validate in Codex. Discover manually edited content, run the content and site checks of the core, explain failures and translation freshness, then ask one owner confirmation before recording translation markers and building. After the build, warn that a running dev server may show stale data, then optionally publish owner-selected draft documents (status flip plus today's publishedAt) and rebuild. Never auto-trigger or edit prose."
---

# Validate — check owner-edited content, confirm once, then build

The owner edits `src/content` directly. This skill owns the hard part that follows: discovering what
changed, running the complete checks, interpreting translation freshness and producing one concise
decision point. It never asks the owner to name files or restate edits that the working tree already
shows.

## When to use

Only when the user explicitly invokes `/validate` in Claude Code or `$validate` in Codex, optionally
followed by a document key or path. Never trigger on "check my edits". Without an argument the skill
discovers the content changes itself.

## Shared safety

This skill inherits [`../astrum-scena-shared/safety.md`](../astrum-scena-shared/safety.md) and
[`AGENTS.md`](../../../AGENTS.md). The rules below narrow them for a read-mostly workflow.

## Core contract

- **The owner edits; the skill validates.** Never rewrite prose, frontmatter copy, YAML values,
  taxonomy or MDX blocks. Report an error instead of fixing it. The one exception is the owner-gated
  publication of Phase 5.
- **Infer the scope from evidence.** Read `git status` and the staged and unstaged diffs, untracked
  files under `src/content` included. An explicit argument only overrides the scope. Do not ask which
  file or paragraph changed when the repository answers it.
- **One question at the end of validation.** Run every read-only check first and present one
  consolidated result. With no blockers, ask one combined confirmation of the exact translation markers
  to record and the build. The publication offer of Phase 5 is a separate opt-in after the build.
- **No false semantic approval.** A structural check cannot prove a translation faithful. A pair whose
  reference-locale text changed while its translation did not is unresolved and blocks the final
  confirmation until the owner edits the translation or runs `/translate`. A pair changed in both
  locales, a correction of the translation alone, or a pair without a marker yet may be confirmed only
  by the owner's final answer.
- **Technical metadata only after confirmation.** The one tracked write of validation is the
  `translatedFromDigest` marker of the exact translation files the owner confirms, written by
  `pnpm exec astrum-scena content translation-marker confirm … --write`; never edit the marker by hand.
  It records a review and does not change authored content.
- **Publication is owner-gated and mechanical.** Only in Phase 5, and only for documents the owner
  selects, may the skill set `status: published` in every locale of the document (the status is
  shared by the locales) and stamp today's `publishedAt` on an article without one. `publishedAt`
  belongs to the reference-locale file only: on a translation it is an invalid field and fails
  `astrum-scena check content`. A page needs only the status flip. Edit only the `status:` and
  `publishedAt:` keys, never offer a document with an unresolved translation, and validate and rebuild
  after every publication write.
- **Builds only after explicit owner actions.** The "yes" of Phase 3 authorizes the marker writes and
  the first build; a separate selection in Phase 5 authorizes the publication writes and the second
  build. No confirmation, no write and no build.
- **No other side effects.** Never format files, process images, touch a bucket, commit, stage, push or
  deploy.

## Workflow

### Phase 0 — Discover the scope without questions

Inspect the working tree and classify the changes:

- documents: `src/content/<collection>/<key>.<locale>.md(x)` of `articles`, `pages` and the
  collections of enabled modules;
- structured content: albums, photos, featured data and the content config YAML;
- other files, which are named but not interpreted as owner content.

If no content file changed and no target was given, validate the whole content as it is now. A dirty
working tree outside the content is never permission to edit or discard those changes.

### Phase 1 — Run every read-only check

Run, in order:

1. `pnpm exec astrum-scena check content` — schemas, identifiers, pairing, links and integrity across
   collections.
2. `pnpm exec astrum-scena content translation-marker check` — the advisory freshness of every
   translation; it always exits 0.
3. `pnpm exec astrum-scena check` — every gate of the site files.

Do not build yet and do not run a writer to repair formatting or drift. Capture failures and go on
only when it is safe and adds useful diagnostics; never hide the first root cause.

### Phase 2 — Interpret the translation state

Sort the translations (`current` or `needs-review` in the marker check) into:

- **current** — nothing to do;
- **confirmable** — both locales were updated by hand, the translation alone was intentionally
  corrected, or the marker is missing and the owner can approve a pair already reviewed;
- **unresolved** — the reference-locale meaning changed while the translation did not, or the pair has
  an ambiguity that prevents an honest approval.

Use the diff as evidence, not a questionnaire. A missing or stale marker is advisory in the technical
gate, but an unresolved translation prevents the final build question, since the owner's work is not
done.

`confirm --document` records the marker of every translation of the document at once, so a document
is confirmable only when every one of its translations is confirmable; one current translation is
rewritten to the same marker, and one unresolved translation leaves the whole document out of the plan.
Prepare the marker plan read-only with
`pnpm exec astrum-scena content translation-marker confirm --document <collection>/<key>` for the exact
confirmable documents (repeat `--document` for each), or `--all` only for an initial baseline the owner
was shown. Never add `--write` here.

### Phase 3 — Present one concise result

Answer in the owner's language with these groups, leaving out empty ones:

1. **Checked** — the files or scope and the green gates.
2. **Errors** — blocking failures with the file and a plain-language cause.
3. **Translations** — current, confirmable and unresolved documents; never print digests.

If a check failed, report it and stop without a build question. If a translation is unresolved, give
the single next action (an edit of the translation or `/translate`) and stop.

If everything is green, print a short **Status changes** summary right before the question: the kind
(article, course or page) and the human-readable title of every document whose translation turns from
outdated or unverified to up to date. No keys, paths, digests, reasons or already current documents;
leave the summary out when no marker changes.

Then ask one question: whether the owner confirms the listed translations as up to date, the
recording of their technical status and the build. The approval of a document covers every one of its
translations, so list them all and never ask about one translation alone. With no markers to write, ask only to confirm the
checked result and the build. Ask nothing else unless the repository evidence is contradictory.

### Phase 4 — Record the markers and build

Only after an explicit "yes" to the question of Phase 3:

1. Run the presented marker plan with `--write` for the exact confirmed documents:
   `pnpm exec astrum-scena content translation-marker confirm --document <collection>/<key> --write`.
2. Run `pnpm exec astrum-scena check content` and
   `pnpm exec astrum-scena content translation-marker check` again.
3. Run the site's build.

If a step fails, stop and explain the problem; never repair content silently. Recording a marker must
never turn an unresolved or unreviewed pair into `current`.

### Phase 5 — Offer publication (optional, after the build)

Only after the build of Phase 4 succeeds. The publishable documents are those with a file for every
locale of the site (`content.locales`), each `status: draft`, and no unresolved translation. A draft
missing a locale file has no translation pair to check and fails the content gate once published, so
it is never offered. If there are none, skip this phase.

Offer them as a multiple choice: one option per document, labelled with its kind and title. A host
that shows a limited number of options per question pages through the candidates or leads with a
"publish all" option; never drop a candidate silently, and always leave a way to publish nothing.

For each document the owner selects:

- set `status: published` in every locale file of the document;
- for an article without `publishedAt`, stamp today's date as `YYYY-MM-DD` on the reference-locale file
  only; a page needs only the status flip.

Then run `pnpm exec astrum-scena check content` and
`pnpm exec astrum-scena content translation-marker check` again, and the site's build a second time.
If one fails, stop and explain the exact cause; never force a publication or repair content silently.
A published article without `publishedAt` on its reference-locale file is a content error to report,
not to paper over.

### Phase 6 — Deliver and warn about a stale dev server

Report whether validation, the markers, the publication (if any) and the builds succeeded. Name the
translations still outdated or unverified and the documents still in draft without treating them as
errors.

Whenever this run wrote anything, warn the owner that a running dev server and the `/status/` page may
show stale data: Astro reads the content collections when the process starts and does not always pick
up a frontmatter change (translation markers, publication status). Offer to restart it. Restart it only
when this session started it (in Claude Code, `preview_stop` then `preview_start`); never kill a
process by its port, which also closes the owner's own browser connections. Otherwise ask the owner to
restart it.

Leave every change unstaged and uncommitted.

## Product checks

- No authored byte changes but the technical marker of confirmed translations and, in Phase 5, the
  `status` and `publishedAt` keys of selected documents.
- Every marker write targets a document the owner confirmed and is checked again afterwards.
- A change of the reference-locale text alone never becomes falsely `current`.
- Every gate of the site is green before the confirmation question.
- The first build runs only after the validation confirmation, the second only after an explicit
  publication selection.
- After any write the owner is warned about a stale dev server and offered a safe restart.

## Invocation

`/validate [<document-key-or-path>]`

## Guardrails recap

Discover content edits from Git without questioning the owner; run the content gate, the translation
freshness report and every gate of the site read-only; report one consolidated result; stop on errors
or unresolved translations; when green, ask one combined confirmation, then record the exact markers
with the core's command and build. After the build, warn about a stale dev server and offer a safe
restart, then optionally publish documents the owner selects by flipping `status` in every locale and
stamping `publishedAt` on the reference-locale file of an article without one, validate and rebuild.
Never edit authored prose, commit, push, deploy or touch a bucket.
