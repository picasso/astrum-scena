---
name: translate
description: "Explicit invocation only: /translate in Claude Code or $translate in Codex. Translate one reference-locale document into another locale of the site in the author's voice, run independent reviews on other models, record the translation marker, validate, and stop for owner approval. Never auto-trigger, publish or touch the reference locale."
---

# Translate — one document into another locale, with independent reviews

A translator renders one document of the reference locale into another locale of the site in the
author's voice, then independent reviewers, deliberately on other models, check it before the owner
approves. The result is written straight into the translation file
`src/content/<collection>/<key>.<locale>.md(x)`.

## When to use

Only when the user explicitly invokes `/translate` in Claude Code or `$translate` in Codex, optionally
with a document key and a target locale (for example `$translate field-notes`). Never trigger on
"translate this".

## Shared safety

This skill inherits [`../astrum-scena-shared/safety.md`](../astrum-scena-shared/safety.md) and
[`AGENTS.md`](../../../AGENTS.md). Read them first; the rules below sit on top of them.

## Agents

The core installs two agents for each host: `translator` and `translation-reviewer`, in
`.claude/agents/` for Claude Code and `.codex/agents/` for Codex. Spawn the host's own agent for each
stage; never route a stage through the parent conversation, and if an agent cannot run, stop and say
so rather than substituting the parent.

The reviewers exist to catch what the translator got wrong, so they must not share its model:

- **Review A** runs `translation-reviewer` on a model different from the translator's.
- **Review B** runs `translation-reviewer` once more on a third model, different from both.

When the host lets you choose the model of a subagent, pick them so; name every model in the delivery.
When the host cannot give a review a model of its own, run it anyway and record it as **reduced
diversity**; when a review cannot run at all, record it as **skipped** and tell the owner. Never fake a
verdict.

## Core protocols

- **The owner approves.** Never mark a translation approved or set `status: published` yourself.
  Produce an owner-ready draft and stop; the translation is accepted only when the owner explicitly
  approves _that document_ in the chat (Phase 6).
- **Write the translation file directly.** Replace only the frontmatter `title` and `excerpt` and the
  Markdown or MDX body of `src/content/<collection>/<key>.<locale>.md(x)`, keeping every other
  frontmatter field byte for byte. Never touch the reference-locale file or the identity fields
  (`translationKey`, `slug`, `locale`). When the translation file does not exist yet, create it with
  the `translationKey`, `slug` and `status` of the reference-locale file, `locale: <locale>`, and the
  translated `title`, `excerpt` and body; the fields of the reference locale alone (`publishedAt`,
  `coverId`, `unlisted` and the like) stay out of it, and `astrum-scena check content` names any that
  slipped in.
- **The marker is written by its command, after approval.** Only after the owner approves the
  translation (Phase 6), run
  `pnpm exec astrum-scena content translation-marker confirm --document <collection>/<key> --write`;
  it records the digest of the current reference-locale body in `translatedFromDigest` of every
  translation of the document. Never add, edit or compute the marker yourself. When the document has
  translations in other locales than the target, they get a marker as well: tell the owner, and run
  this step only when those translations are current, otherwise leave the marker to `/validate`.
- **Publication is not here.** No status change, no other document, no other locale than the target.
- **Voice.** If the site's `AGENTS.md` names an authorial voice guide, pass it to the translator and
  to every reviewer, and feed lessons back into it (Phase 7). Without one, the rules of the agents
  apply; say so in the delivery.
- **Language:** talk with the owner in the language they write in; the agent calls and the findings
  table are in English unless the owner asks otherwise. **Reviewers are read-only**: only the
  translator produces fixes. **One document at a time.** **No commit.**

## Scope

The skill translates documents: `articles`, `pages` and the document collections of the enabled
modules. Photo and album texts and the UI dictionaries are out of scope: if asked to translate them,
say so and stop.

## Findings table

Record every reviewer finding and what you did with it in one table, shown in the chat and appended to
the reading file, with the columns: number, reviewer (the review and its model, or the code checks),
severity (`high`, `medium`, `low`; `blocking` or `advisory` for a code check), field (`title`,
`excerpt`, `body`), what it found, decision (accepted or rejected, with the reason) and what was done
(`before → after` for an accepted finding, `—` otherwise).

## Workflow

### Phase 0 — Target

1. Read the locales and the reference locale from `site.yaml` (`content`) or `site.lock.yaml`.
2. Determine the key and the target locale: from the argument, or else the first document whose
   translation is missing, has an empty body or is reported `needs-review` by
   `pnpm exec astrum-scena content translation-marker check`. A site with one other locale than the
   reference needs no target locale; with several, ask for one when the argument does not give it.
   Announce the key, its collection and the target locale.
3. Read the reference-locale source `src/content/<collection>/<key>.<reference-locale>.md(x)`: the
   frontmatter `title` and `excerpt` and the body.
4. Announce the translation file to be written, `src/content/<collection>/<key>.<locale>.md(x)`, and
   whether it is created or its translated fields replaced, then wait for the owner's explicit "yes"
   before anything is written.

### Phase 1 — Translate

Spawn the host's `translator` with the source title, excerpt and body, the source and target locales,
the collection, the key and the voice guide when the site names one. It returns the translation in the
`===TITLE===` / `===EXCERPT===` / `===BODY===` / `===END===` form; parse the three fields. Every
authored Markdown link keeps its destination byte for byte and its place in the order of links;
only its visible label is translated.

### Phase 2 — Write and check

1. Write the parsed fields into the translation file as the core protocols say; the marker waits for
   the owner's approval (Phase 6).
2. Run the structural checks as **warnings** that inform the review: no text left in the source
   language, no leftover placeholder, valid Markdown or MDX, the same number of links with the same
   destinations in the same order as the source, numbers and proper names preserved, the same section
   structure, the same MDX components and directives in the same order.
3. `pnpm exec astrum-scena check content` must pass. If a genuine structural defect remains, send it
   back to the translator and repeat Phases 1–2, at most three times.
4. Write a two-column reading file for the owner, the source on the left and the translation on the
   right, under `.cache/translate/<collection>/<key>.<locale>.md` (keep `.cache/` out of Git). Regenerate it after
   every change.

### Phase 3 — Review A

Spawn `translation-reviewer` with the source, the translation, the locales, the collection and the
voice guide when the site names one, on a model other than the translator's. It returns
`VERDICT: APPROVED | CHANGES` with its issues.

**APPROVED** → Phase 4. **CHANGES** → judge each issue (accept only real, in-scope problems; reject a
matter of taste or a false positive with a reason), send the accepted ones to the translator, apply the
result (Phase 2) and review again, **at most three iterations**. Record every finding and decision in
the table.

### Phase 4 — Review B

The same bundle to `translation-reviewer` on a third model. **CHANGES** → the same loop as Review A,
at most three iterations; disputing a wrong finding does not count as one. Record every finding, or the
reduced-diversity or skipped note, in the table.

### Phase 5 — Refresh

`pnpm exec astrum-scena check content` passes; regenerate the reading file and append the findings
table to it.

### Phase 6 — Owner checkpoint (STOP)

Present to the owner:

1. The path of the reading file.
2. The findings table.
3. The verdicts and iteration counts of both reviews, and any warning of the structural checks.

Then stop and ask for the explicit approval of this document.

- Without approval, tell the owner the draft is in the working tree and the previous version of the
  file is still in Git; restore it (`git restore <file>`, or delete a file this run created) only on the
  owner's "yes", otherwise leave the draft and stop. No marker is written.
- With approval, the written translation file is the accepted translation. Run
  `pnpm exec astrum-scena content translation-marker confirm --document <collection>/<key> --write`
  (when other translations of the document are not current, tell the owner and leave the marker to
  `/validate`, as the core protocols say), then `pnpm exec astrum-scena check content` and the site's
  build. Delete the reading file. Publishing (`status: published`) is a separate decision of the
  owner, not made here.

### Phase 7 — Voice feedback (when the site names a voice guide)

After the discussion of the translation, approved or not:

1. Collect what the owner pointed out while reading.
2. Decide whether any of it is a **pattern** (a repeated mistake, a missing rule of the voice, a term
   for a glossary) rather than a one-off edit.
3. If it is, propose the exact wording of an edit to the voice guide and apply it only after the owner
   agrees, formatted as the site formats its Markdown.
4. If there is no pattern or the owner declines, leave the guide untouched and say "no new voice rules".

Never skip the step silently; it does not affect the approval. A site without a voice guide skips it
and says so.

## Delivery (per document, in the owner's language)

```markdown
## Translation: <key> (<collection>) → <locale>

- Host: <Claude Code|Codex>
- Translator: <agent and model> · Review A: <model> · Review B: <model | reduced diversity | skipped>
- Review A: APPROVED / N issues fixed (N/3)
- Review B: APPROVED / N issues fixed (N/3)
- Read: <reading file> (source | translation)
- Written: src/content/<collection>/<key>.<locale>.md(x), status unchanged (approval is yours)
- Marker: <written after approval | left to /validate | not written (no approval)>
- Build: <passed | not run (no approval)>
- Voice guide: <updated: rule "…"> | <no new voice rules> | <the site names none>

<findings table>
```

## Guardrails recap

Translate with the host's translator in the author's voice, review twice with `translation-reviewer`
on other models (reduced diversity recorded honestly), write straight into the translation file after
the owner's "yes", run `astrum-scena check content`, stop for the owner's approval of the document, and
only then run `astrum-scena content translation-marker confirm --write`, `astrum-scena check content`
and the site's build (without approval, restore the previous version only on the owner's "yes"), then
the voice feedback; structural checks are warnings, not a wall;
never touch the reference locale, the identity fields or `status`; leave the commit to the owner.
