# AGENTS.md

Operational entry point for AI agents working in this repo — the single instruction file; Claude Code
and Codex both load it.

<!-- bmad:context -->
<!-- Verified 2026-10-26 (story 6.2, part A). Managed by bmad-project-context; edits inside this block are replaced on refresh. -->

## Project

Astrum Scena core: an Astro integration for photography sites, shipped as the npm package
`@picasso-ai/astrum-scena`, with a synthetic demo site and agent tooling.

- `packages/core` — the integration: the engine ported from the reference site ships as source in
  `src/` (Vite compiles it), and only the graph Node loads with the config (`src/index.ts`,
  `src/collections.ts`) is built with `tsc` into `dist/`. `astro`, `react`, `react-dom` and
  `@astrojs/react` are its peers, declared by every site itself. Core files resolve from the package
  (`CORE_ROOT`), site files from `config.root` (`siteRoot`); never from `process.cwd()`.
- `demo/` — the synthetic site, one integration call in `astro.config.mjs`; the core's unit tests run
  against it, and CI builds it from the `pnpm pack` tarball installed outside the workspace.
- `packages/core/skills`, `packages/core/agents` and `packages/core/presets` — the content skills, their
  agents, the configs a site extends and the text of the site's managed `AGENTS.md` block; they ship in
  the package and `astrum-scena install` puts them into a site with the core's version stamp.
- `packages/migrate-wp` (epic 8) — a placeholder.
- `scripts/` — repository gates and their tests.

The core is extracted from a reference site kept read-only at `$REFERENCE_SITE_ROOT` (gitignored
`.env`); never modify it. Code changes only in the core, which reads the reference site only for
checks against a real config and trial builds. `AD-*` are decisions from the architecture
spine and `EH-*` are items from the streamline catalog.

## Planning

- Source of truth for active work: the spec
  [`_bmad-output/specs/spec-core-and-thin-sites/SPEC.md`](_bmad-output/specs/spec-core-and-thin-sites/SPEC.md),
  plus BMAD epics, stories and sprint status.
- This repo plans the core's epics 6–8 only; the site's planning (epics 1–5 and 9, the migration
  history) lives in the site's private repo, and the epic numbering is shared.
- `docs/adr/` remains the architectural memory; a change that alters an ADR's ruling updates or
  supersedes that ADR in the same change.
- A change that alters the contract of a closed story updates that story's criterion in
  `_bmad-output/planning-artifacts/epics.md` in the same change; a spec that narrows an epic criterion
  rewrites it there at once.
- Every test suite or check runs in `pnpm check` or CI (a separate job is fine); one that cannot is
  deleted, not kept by hand.
- `docs/backlog/` is an inbox; an item taken into work becomes a BMAD story and its file links to it.

## Interaction rules (non-negotiable)

- **Plan → confirm → implement.** Propose a plan and wait for confirmation before non-trivial changes.
- **Never commit without an explicit request.** Commit-pattern notes in docs are context, not permission.
- **Do not suppress** lint or type errors for convenience — rewrite the code.
- **No AI attribution** (`Co-authored-by`, "Generated with…") in commits unless explicitly requested.
- When something doesn't work, **don't fix silently** — describe the problem, propose 2–3 options with
  trade-offs, and say which you recommend.

## Identity (the repo becomes public)

- Nothing created here — code, config, README, `CHANGELOG.md`, commit messages and PRs — names the
  reference site, its repo, its owner, its domains, account or bucket IDs, or local paths (AD-22).
  The owner's name appears only where authorship requires it: the npm scope of the packages and the
  GitHub repository URL; text never names the owner.
- `pnpm check:identity` enforces it. Generic patterns (URL hosts outside `PUBLIC_HOSTS`, 32-digit hex
  IDs) live in `scripts/lib/identity.ts`; the owner's concrete strings never enter the repo — they
  come from the gitignored `.identity-denylist` locally and the `IDENTITY_DENYLIST` secret in CI.
  Without a list the gate and the `commit-msg` hook fail in CI (`CI` set) and, outside it, check
  only the patterns with a warning on stderr. A list line `!<context>` allows an entry only inside that context (the npm
  scope, the repository URL). It scans the whole tree, `docs/` and `_bmad-output/` included, and file
  names as well as contents.
- `pnpm check:local-paths` scans the whole repo, `docs/` included.
- `pnpm check:publication-tree` checks the tree the public repo is created from: HEAD as the one
  orphan commit of a throwaway clone, scanned by the identity gate with the owner's list (required)
  and by gitleaks in its pinned Docker image. It is local only; the owner's steps are in
  `docs/publication.md`.

## Running and verifying

- `pnpm check` runs typecheck, unit tests, format, markdown lint and both gates. Typecheck builds
  the core's `dist/` (the demo's `astro check` loads the integration), then runs `astro check` on
  the demo and on the core, whose collection types come from the demo's generated `.astro/`. Also
  run `pnpm build` (core, then the demo against the workspace core) before calling a change done.
- `pnpm demo:packed` builds the demo as CI does: from the `pnpm pack` tarball of the core, installed
  in a temp directory outside the workspace, `astro build` with cwd at the site root.
- `pnpm test:e2e` builds the packed demo into `.cache/demo-packed/` and runs the Playwright specs of
  `e2e/` against its `astro preview`; `--no-build` reuses that build, other arguments go to
  Playwright. Expected values come from the demo's config, content and the core dictionaries, never
  literals. `pnpm test:e2e:docker` runs the same in the pinned Playwright image that CI's `e2e` job
  uses. E2e is not part of `pnpm check`.
- Visual baselines (`e2e/visual.spec.ts`, PNGs in `e2e/__screenshots__/`) are rendered only in that
  image: `pnpm test:e2e:docker:update` rewrites them — review the PNG diff before committing. Outside
  the image (macOS or a native Linux host) the visual spec is skipped; CI runs in the image, only
  compares and fails on a missing baseline.
- Keep `typescript` on `^6` until `@astrojs/check` accepts TS 7 (its peer range) — TS 7 has no
  compiler API yet, so `astro check` and typescript-eslint fail on it (ADR-0005).
- pnpm 11 reads `allowBuilds` from `pnpm-workspace.yaml`; add packages with build scripts there (the
  packed demo build copies that section into its site).

## Local paths

- Paths outside the repo are named `*_ROOT` variables resolved from the gitignored `.env` (names in
  `.env.example`); if one is unset, ask.

## Language

- **Russian** — documentation in `docs/`. **English** — code, comments, test names, CLI messages, git
  messages, `CHANGELOG.md`, PRs and `AGENTS.md`.

## Commits

- Commit messages follow the global `cm` skill; this repo defines the types:
  `feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore` · `perf` · `build` · `ci` ·
  `revert` — the Conventional Commits set; and the scopes:
  `ui` · `home` · `portfolio` · `albums` · `articles` · `viewer` · `i18n` · `content` · `images` ·
  `form` · `config` · `core` · `demo` · `docs` · `scripts` · `deps` · `ci` · `e2e` · `skills` ·
  `blocks` — domain scopes only, no component scopes. The `commit-msg` hook (and CI, on every PR
  commit) parses both lists from here (keep their backtick-and-dash format) and rejects other types
  and scopes, a malformed header and AI attribution.
- `/ver`: the repo version (root `package.json`) is `1.<epic>.<story>`, the story taken from the
  branch `<type>/<epic>-<story>-<slug>`, else from the newest `review`/`done` story in
  `_bmad-output/implementation-artifacts/sprint-status.yaml` whose version is above the current one;
  work outside a story is not bumped and goes under `[Unreleased]`. The numbering continues from
  `1.6.2`. The npm version of `@picasso-ai/astrum-scena` is separate and `/ver` does not touch it:
  `0.<epic>.<story>` of the releasing story until the first site (9.3), where any higher version may
  be breaking and a site pins it exactly, then semver from `1.0.0` — the policy is in
  `packages/core/README.md` (Versions); every breaking release gets a section in `UPGRADING.md`,
  which `pnpm check:upgrading` validates. A story that changes the core releases it in its own pull
  request, never in a separate one: next to the `/ver` commit, a `build(core)` commit sets
  `packages/core/package.json` to `0.<epic>.<story>` and opens its `UPGRADING.md` section above the
  `[Unreleased]` transitions; merging to `main` publishes it, and `check:api-breaking` fails a repo
  bump that changes the core without one.

## Code style

- Comment only what the code cannot say (why, not what); never comment line by line — simplify the
  code instead.
- Style rules no linter enforces yet: [`.cursor/rules/code-style.mdc`](.cursor/rules/code-style.mdc).

<!-- /bmad:context -->
