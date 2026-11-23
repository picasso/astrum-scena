## Astrum Scena

This site runs on the Astrum Scena core, the npm package that ships its pages, components, content
schemas and the `astrum-scena` command line. The rules below come with the core and are rewritten by
`astrum-scena install`; the site's own rules go outside this block.

### Interaction rules

- **Plan → confirm → implement.** Propose a plan and wait for confirmation before non-trivial changes.
- **Never commit without an explicit request.** Commit-pattern notes in docs are context, not
  permission.
- **Do not suppress** lint or type errors for convenience: rewrite the code. ESLint ignores inline
  config comments here and reports each as an error.
- **No AI attribution** (`Co-authored-by`, "Generated with…") in commits unless explicitly requested.
- When something doesn't work, **don't fix silently**: describe the problem, propose 2–3 options with
  trade-offs, and say which you recommend.

### Running and verifying

- `pnpm exec astrum-scena check` runs every gate of the site files; run it, and the site's build,
  before calling a change done.
- `src/content` is the source of truth and is edited directly; check a content edit with
  `pnpm exec astrum-scena check content`.
- Never hand-edit generated files: when a drift gate fails, run its writer —
  `pnpm exec astrum-scena config resolve` for `site.lock.yaml`, `pnpm exec astrum-scena layout-tokens`
  for the layout tokens, `pnpm exec astrum-scena images public-init` for the public image config — and
  commit the result.
- Import the core only through its entry points; the core's ESLint preset rejects any other path.
- The core's skills (`.agents/skills`, `.claude/skills`) and agents (`.claude/agents`, `.codex/agents`)
  are copies that `astrum-scena install` writes and `astrum-scena check skills` compares with the
  installed core: never edit them, run `pnpm exec astrum-scena install` after upgrading the core, and
  give a skill of the site a name of its own.
- The content skills read a document of the site, such as an authorial voice guide or an editorial
  policy, only when this file names it outside this block, and work without it.

### Local paths

- Paths outside the repository are named `*_ROOT` variables resolved from the gitignored `.env`; if
  one is unset, ask.

### Code style

- Comment only what the code cannot say (why, not what); never comment line by line — simplify the
  code instead.
