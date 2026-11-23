---
reviews: ../ARCHITECTURE-SPINE.md
lens: good-spine rubric (6 criteria)
reviewed: 2026-10-06
verdict: REVISE — sound direction, not yet a build substrate
---

# Rubric review — ARCHITECTURE-SPINE (shared core + thin sites)

## Verdict

**REVISE.** The paradigm (versioned Astro integration, Starlight-style), the repo topology, the
seam-first sequencing (AD-17) and the dependency/loader/writer rules (AD-8…AD-11) are right and
match what the code scans found. But the spine does not yet pin the seams that the three workstreams
below it will cut independently: the **microkernel module contract**, the **full public-API surface**
(only the config schema is under semver discipline), and most of the **operational envelope** (core+site
dev loop, test split, release process, repo visibility/auth, site bootstrap). Several rules have no
enforcement even where a gate is cheap. None of this contradicts the direction; it is missing
decisions, not wrong ones.

Evidence base: spine + `.memlog.md`; spot-checks of `package.json`, `astro.config.mjs`,
`src/config/site.ts`, `src/content.config.ts`, `src/lib/**`, `src/i18n/ui.ts`, `eslint.config.mjs`,
`.github/workflows/ci.yml`, `public/`, `functions/`, `config/`, `docs/adr/`.

## Findings (severity-ordered)

| # | Sev | Criterion | Finding | Fix |
| --- | --- | --- | --- | --- |
| F1 | critical | 1, 3 | **The microkernel's plug-in contract is not decided.** AD-5 makes tours/reviews/video/courses opt-in modules and Deferred postpones "устройство модулей", but nothing fixes *how any module plugs in* (route injection, collection/schema contribution, config sub-section, i18n keys, nav entries, CLI subcommands). Courses already exist (`kind: 'course'`, `navItems` filter on `options.courses === 'on'` in `src/i18n/ui.ts`, sitemap filter in `astro.config.mjs`), so the seam-cutting workstream must extract courses as a module *now*, and site #2 will later invent tours/video — two module shapes guaranteed. | Add AD "Module contract": a module = `{ id, configSchema (namespaced key under `modules.<id>`), collections, injected routes, ui keys, nav contributions, cli commands }` registered via the core integration; courses is the reference implementation. Keep only per-module internals (tours/video data models) Deferred. |
| F2 | high | 1, 2 | **Semver discipline covers only the config schema; the rest of the public API is unguarded.** AD-7 versions `site.yaml`; but a site also binds to: content-collection schemas (`src/lib/content/schemas` → site `src/content/**` frontmatter/YAML, taxonomy YAML under `src/content/config/`), MDX component registry + directive syntax (`:::callout/note/links`), overridable component names + props (AD-3 level 4, mechanism unspecified), CSS token names (AD-3 level 2 — a renamed token fails *silently*), UI dictionary keys (`UIKey`), CLI command names/flags (skills depend on them, AD-13), env-var names (AD-15). Also the config is not one file: `seo.yaml`, `config/images.yaml`, `config/place-gps-bounds.yaml`, taxonomy/featured YAML. | Generalise AD-7 into "Public API = {enumerated surfaces}; any breaking change to any of them is a major + migration command". Enforce in core CI with cheap gates: export-surface snapshot (`exports` map + `.d.ts` digest), token-name manifest check, content/config JSON-schema snapshot diff, demo site as compile-time consumer. |
| F3 | high | 5 | **Operational envelope largely silent for a multi-repo package setup.** Missing: (a) **local dev loop** core↔site (pnpm `link:`/`overrides`/workspace-style linking, HMR across the package boundary, how to test an unreleased core change against a real site); (b) **testing strategy split** — which tests live in core (unit, demo-site E2E, contact E2E, image fixture E2E) vs site (content:validate, visual baselines, Lighthouse budgets, `*:live` smokes); today's CI has 9 jobs with site-specific data baked in; (c) **release process** — who tags, changelog source (`/ver`?), pre-release (`next` tag / canary) validation against ≥1 real site before a stable tag; (d) **repo visibility & auth** — if the core repo is private, git-dependency install and cross-repo reusable workflows need tokens/"accessible from user repos" settings; GitHub Packages needs auth even for public packages; (e) environments (PR previews or prod-only), observability (Pages Function failures for the contact form) and per-site infra provisioning (manual runbook vs scripted). | Add an "Operational envelope" section with one decided row per dimension: dev loop = `pnpm overrides` → `link:../core/packages/core` behind a documented script; core CI = unit + demo E2E + contact/images fixture E2E; site CI = content/gates + visual + Lighthouse + live smokes; release = tag from core `main` after demo green + `next` pre-release smoke on site #1; visibility decision explicit; prod-only environments + "no observability beyond CF logs" stated as accepted. |
| F4 | high | 1, 2 | **Reusable workflow tag and core package version can diverge.** AD-14 pins the workflow "по тегу" and AD-1 pins the package by semver independently, so a site can run workflow `@v1.4` (calling CLI commands/flags of 1.4) against core `1.2` — the exact "skill calls a command that doesn't exist" failure AD-13 prevents for skills. Same drift for AD-13 skills: installed copies in `.claude/skills` go stale when the site bumps core but forgets to reinstall. The trust boundary in today's CI (R2 secrets only on push to `main`, never on PRs) is not carried into the reusable-workflow rule. | Rule: workflow ref == installed core version (CI step fails if `uses:` tag ≠ `node_modules/<core>/package.json` version); skills install writes a version stamp and a core gate (`skills:check`) fails on mismatch; reusable workflow takes secrets explicitly (no `secrets: inherit`) and only on trusted-main jobs. |
| F5 | medium | 2 | **Several rules have no enforcement where it is cheap.** AD-8 "src never imports scripts" — no `no-restricted-imports`/boundaries rule exists in `eslint.config.mjs`, and `src/lib/content/import-modes.ts` imports `../../../scripts/lib/site-content.ts` today. AD-6 "no locale literals" — trivial grep gate (16 non-test `src/lib` files contain `'ru'`). AD-15 "core knows no domains/values" — `SITE_ORIGIN = 'https://example.com'` in `src/lib/content/routes.ts`; an identity-literal gate (like `check:local-paths`) is cheap. AD-9 "one loader" — ban `?raw` yaml imports / direct `readFileSync` of config outside the loader module. AD-14 "each contract exactly one gate" is vague without a gate registry. AD-1 is silent on `pnpm patch` of core inside a site (allowed as emergency? forbidden?). | Name the enforcing mechanism inside each AD (lint rule / gate name). Add a `gates.yaml` registry (contract → single gate → writer) that AD-14 references. Decide `pnpm patch`: allowed only with a linked upstream issue, removed on next bump. |
| F6 | medium | 1, 4 | **Structural seed for the site repo is incomplete and partly contradicts the code.** `site-repo/` tree omits `functions/` (Pages Function must live in the site project — how core's `src/lib/contact` reaches it is undecided), `public/` (`_redirects`, `robots.txt`, fonts — per-site), `config/` (`images.yaml`, gps bounds), `src/generated/` (site-owned derived files such as `images-release.json`), `src/content.config.ts` (Astro requires it in the project — re-export from core or injected loaders?), `e2e/` baselines, `.claude/skills`. No site-bootstrap mechanism (template repo or `core init`) is decided, so three migrations will scaffold three ways. AD-10 says `images-release.json` has exactly one writer, but the scan shows two (`images:manifest:init` bootstrap + `images:activate`); ratify the exception or merge them. | Complete the site tree; decide "site files that must exist are generated by `core init` and re-export from core (`functions/api/contact.ts`, `src/content.config.ts`)"; reconcile AD-10 with the manifest-init/activate pair. |
| F7 | medium | 3, 5 | **Deferred items that can let units diverge.** (a) Splitting `packages/core` into core/cli/modules changes import paths = breaking for every site — must be decided before the first site consumes `1.0.0`, not "when size is visible". (b) Delivery channel decides CI auth and the dev loop (F3); acceptable only if its trigger is "before the first tag". (c) Visual-baseline storage / Playwright consolidation decides whether baselines are core- or site-owned (test split). (d) Shared toolchain config (tsconfig, eslint, prettier, markdownlint, husky/lint-staged) is neither decided nor deferred — three site repos will drift; AD-3/consistency table points at `.cursor/rules/code-style.mdc` that a thin site won't have. | Give each Deferred row a hard trigger ("before core 1.0.0 / before site #1 cut-over"). Add a decision: core ships `tsconfig`/`eslint`/`prettier` presets as public exports; site configs only extend them. |
| F8 | low | 4 | **Carry-over and stack gaps.** AD-16 omits ADR-0001, 0002 (hosting + form), 0003 (now closed), 0005 (TS 6 pin — a cross-repo constraint). Stack table doesn't mark which deps are **peerDependencies** of the core (astro, react, tailwind, typescript) vs bundled; without that each site can resolve a different Astro and break the integration. Missing load-bearing deps: `@astrojs/markdown-satteri` 0.3.4 (directive plugins), `yaml`, `@aws-sdk/client-s3`, `exiftool-vendored`. AD-13 ships `import-wp` to every living site, contradicting AD-11 "migration is a phase". Multi-locale (AD-6) needs a rule for UI dictionaries: core ships defaults per locale, site overrides/extends; missing key = build failure. | Add peer/bundled column to Stack; list all 14 ADRs in AD-16; ship `import-wp` with the migration kit; add i18n dictionary-merge rule to AD-6. |
| F9 | low | 6 | **Mostly decisions, light rationale creep; diagrams valid.** Mermaid blocks parse by inspection (quoted subgraph/node labels, `-. "label" .->` and `-- "label" -->` edges are valid flowchart syntax; not machine-rendered — `mmdc` unavailable). Minor rationale in rules: AD-1 "(слабое место git subtree в Node)", AD-11 "(нынешнее нарушение ADR-0012)", paradigm "прецедент — Starlight" — belongs in memlog. Diagram 1 shows sites → API but not how modules are enabled or overrides registered (ties to F1/F2). | Move parentheticals to `.memlog.md`; after F1 add the module-registration edge to diagram 1. |

## Criterion-by-criterion

1. **Divergence points fixed / none missed** — Partially. Fixed well: distribution, topology,
   import boundary, locales, config-schema versioning, dependency direction, loaders, writers,
   migration isolation, CLI-as-ops, per-site infra, sequencing. Missed: module contract (F1),
   non-config public surfaces (F2), workflow/skills version coupling (F4), site scaffold + required
   site-side files (F6), shared toolchain presets (F7d), i18n dictionary merge (F8).
2. **Rules enforceable and preventive** — Self-enforcing: AD-3 (package `exports` blocks deep
   imports), AD-11 (package boundary). Enforceable but unnamed: AD-6, AD-8, AD-9, AD-15 (F5).
   Process-only, acceptable: AD-4, AD-16, AD-17. Vague: AD-14 "one gate per contract" without a
   registry; AD-3 level 4 "ядро гарантирует имя слота и пропсы" without a registry or mechanism.
3. **Deferred safety** — CMS, demo content, docs fate, freeze policy: safe. Package split, delivery
   channel, baseline storage: need hard triggers (F7). Module internals: safe only once F1 lands.
4. **Ratifies brownfield** — Yes overall: diagnoses (`site.ts` ↔ lib cycle — `site.ts` imports
   `lib/cards`, `lib/portfolio`; lib build-data modules import the site singleton; `SITE_ORIGIN`
   literal; hardcoded `i18n.locales: ['en','ru']` in `astro.config.mjs`; CI `gates` job missing
   `check:pages`, `check:local-paths`, `check:images-policy`, `check:images-public-config`,
   `check:colormode`, `check:layout-tokens`) are accurate. Contradiction: AD-10 single writer vs
   two writers of `images-release.json` (F6). Stack versions match `package.json`.
5. **Altitude dimensions** — see F3/F4/F7. Status per dimension:

   | Dimension | Status |
   | --- | --- |
   | Deployment | decided (AD-14/15, seed) — reusable-workflow trust boundary missing (F4) |
   | Environments | **silent** (prod-only? PR previews?) |
   | Infra | decided per site (AD-15); provisioning **silent** |
   | Operations (image pipeline, content ops) | decided (AD-12/13, ADR-0004) |
   | Observability | **silent** |
   | Security / secrets | partly (AD-15, env convention); repo visibility/auth, CI secret scoping **silent** |
   | Testing strategy core vs site | **silent** beyond "demo site tests core" |
   | Release / versioning process | partly (semver, major for schema); release mechanics **silent** |
   | Local dev loop core+site | **silent** |
   | Site bootstrap / scaffolding | **silent** |
   | Shared toolchain config | **silent** |

6. **Decisions not rationale; mermaid valid** — Pass with minor nits (F9).
