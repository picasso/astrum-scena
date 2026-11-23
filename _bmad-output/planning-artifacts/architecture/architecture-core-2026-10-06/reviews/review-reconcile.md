# Reconcile review — ARCHITECTURE-SPINE.md vs inputs

- **Reviewed:** `ARCHITECTURE-SPINE.md` (draft, 2026-10-06)
- **Against:** `.memlog.md`, `AGENTS.md`, `docs/03-architecture.md`, `docs/02-conventions-and-toolchain.md`,
  `docs/adr/0001…0014`, spot checks of `package.json`, `.env.example`, `scripts/`, `.github/workflows/`.
- **Mode:** read-only reconcile (what did not land, what landed inaccurately, what contradicts).

## Verdict

**Revise before ADOPTED-final.** Every memlog `(decision)` has a matching AD, and the Stack table matches
`package.json`. But the spine kept the *structural* decisions and dropped most of the *quiet binding rules*
that today live in `AGENTS.md` / `02-conventions` / ADR addenda. Several of these change meaning once there
is a core package plus N site repos, so they must be stated in the spine, not left in the single-site
`AGENTS.md`. Two ADs also silently override or misclassify existing ADRs.

Severity: **H** = would let separately built parts diverge or break a site; **M** = gap a later story will
trip over; **L** = precision/hygiene.

---

## A. Quiet requirements that did not land

### A1 (H) Config-in-tests rule is missing and collides with AD-7/AD-16

- **Input:** `AGENTS.md` §Tests and config; `02-conventions` §Тесты ("Тесты не привязываются к значениям
  `site.yaml`… исключение — значение, зафиксированное ADR: тест называется по ADR").
  Live examples: `src/config/site.test.ts:886` `conforms to ADR-0008: prose 680, medium 960, standard 1200,
  gallery 1440`; `src/components/sizes.test.ts:20` `ADR-0008 fit`.
- **Gap:** the spine has no rule about tests and config at all. In the multi-site world the rule changes
  shape: AD-16 turns ADR-0008/0014 values into *core defaults a site overrides*. A test that asserts
  `680/960/1200/1440` against the site's `site.yaml` would then fail for site #2 by design.
- **Fix:** add an AD (or a row under Consistency Conventions) stating the following. Core tests never read
  any real site's config; they build fixtures or use the demo site. ADR-named tests assert the **core
  default**, not a site value. A site's own suite may only check contracts (schema passes, key set).

### A2 (H) "Key set matches what the code requires" and the strict-full-`site.yaml` model vs AD-7/AD-16 defaults

- **Input:** `AGENTS.md` ("its key set matches what the code requires"); ADR-0008 addendum 2026-09-23
  ("strict-блок настроек каждого режима хранится в `site.yaml` постоянно и валидируется даже неактивным");
  memlog L16 (327-line strict `site.yaml`).
- **Gap/contradiction:** today `site.yaml` is a *complete* document, with every block required. AD-7
  ("Новое поле без значения по умолчанию — ломающее") and AD-16 ("значения … по умолчанию ядра, которые сайт
  переопределяет") imply a *partial override over core defaults*. That is a different config model, and the
  spine never says the model changes. It also does not say what happens to the key-set contract test and to
  ADR-0008's "every mode block present" rule.
- **Fix:** state explicitly in AD-7 that a site's `site.yaml` is a sparse override merged onto core
  defaults, and that the merged result is what the strict schema validates. Move the key-set contract into
  the core's schema tests and amend ADR-0008's "blocks stored permanently" clause.

### A3 (H) Named local roots, `.env` resolution and "no remote legacy truth" are absent

- **Input:** `AGENTS.md` §Legacy source of truth. Named roots `LEGACY_WP_ROOT`, `LEGACY_EXPORTS_ROOT`,
  `IMAGES_MASTERS_ROOT`, `IMAGES_ARCHIVE_ROOT` live in a gitignored `.env`, with names listed in
  `.env.example`. The `pnpm check:local-paths` gate is part of `pnpm check`. GitHub or remote copies are
  navigation-only, never legacy or visual truth.
- **Gap:** the migration kit (AD-11) and the image pipeline CLI (AD-12) both depend on these roots for
  every site, yet the spine never names them. The Env-variable convention row lists only
  `R2_IMAGES_*/TURNSTILE_*/TELEGRAM_*/PUBLIC_*`. The Structural Seed shows "архив мастеров" with no
  contract. `check:local-paths` is not assigned to the core gate set. The "local legacy tree is
  authoritative; remote copies are not" rule applies to sites #2 and #3 just as much as to #1, and it is
  lost.
- **Fix:** extend AD-15 or add an AD saying: local external locations are named roots resolved from the
  site's gitignored `.env`; the core CLI and migration kit accept only those names. `check:local-paths` is
  a core gate in every site. The migration kit treats the local legacy tree as the only source of truth.
  Add the four root names to the Env convention row.

### A4 (M) `src/pages` is routes-only, plus the `check:pages` gate

- **Input:** `AGENTS.md` §Tests and config (`src/pages/` routes-only, colocated `*.test.ts` becomes a route
  and breaks `pnpm build`, enforced by `check:pages`).
- **Gap:** AD-6 says routes are built from the locale list. That means the core will inject routes
  (`injectRoute`), and site drafts (AD-4, `src/drafts/`) may add pages. The spine does not say where
  route files live in the core package, that site `src/pages/` stays routes-only, or that `check:pages`
  moves into the core gate set.
- **Fix:** add a line to AD-3/AD-4 (or Conventions): core routes are injected from the package. A site's
  `src/pages/` holds only routes (drafts included). `check:pages` is a core gate run in every site.

### A5 (M) Shared toolchain configs and the agent instruction file are not distributed by anything

- **Input:** ADR-0003 lists "конфиги тулчейна (Prettier/ESLint/TS/Vitest/CI)" as part of the core.
  `02-conventions` gives the goal "единый стиль и процесс на всех трёх фотосайтах". `AGENTS.md` carries the
  interaction rules (plan→confirm→implement, never commit, no `pnpm build`, no suppression, no AI
  attribution, don't fix silently).
- **Gap:** AD-13 distributes skills and AD-14 distributes CI, but nothing distributes ESLint, Prettier,
  tsconfig, markdownlint, husky/lint-staged, or the `AGENTS.md` rule block. A site repo needs all of these
  for the reusable CI (AD-14) to pass. Toolchain pins (ADR-0005 TS `^6`; pnpm 11 `allowBuilds` in
  `pnpm-workspace.yaml`, needed for `sharp`/`esbuild` in every site) are also unowned. ADR-0005 is not
  classified in AD-16.
- **Fix:** extend AD-12/AD-13: the core ships shareable toolchain configs (extended, not copied) and an
  `AGENTS.md` core block that is installed or refreshed by a core command, as with skills. Add 0005 to
  AD-16 as a core rule (toolchain pin), and state that `allowBuilds` is set per site.

### A6 (M) Build-time `PUBLIC_*` variables through the reusable workflow

- **Input:** ADR-0004 §S11 update: `PUBLIC_*` are GitHub Actions repository **variables** (not secrets),
  forwarded explicitly to the Build step (`.github/workflows/*.yml:373`
  `PUBLIC_TURNSTILE_SITE_KEY: ${{ vars.PUBLIC_TURNSTILE_SITE_KEY }}`). Cloudflare dashboard vars do not
  reach a CI build.
- **Gap:** AD-14 says "с секретами сайта" only. A reusable workflow has to declare which build-time vars it
  forwards, otherwise every site's form silently ships without a site key, which is exactly the S11 bug.
- **Fix:** add to AD-14 that the reusable workflow's interface declares the required secrets **and** the
  `PUBLIC_*` build vars, and fails closed when one is missing.

---

## B. Memlog decisions or directions reflected inaccurately or incompletely

### B1 (H) AD-17 drops "remove site literals" from the in-place phase; identity leaks have no rule or gate

- **Memlog L35:** "(a) streamline and cut the seam in place … (invert dependencies, **remove site literals**,
  drop dead code, move migration tests out of pnpm check)".
- **Memlog L17 scan:** `SITE_ORIGIN` literal in `routes.ts`, factcheck self-domain list, `robots.txt`,
  hardcoded legal copy in `rights.astro`, logo symbol ids, social kinds enum and icons, `navItems` in
  `i18n/ui.ts`, about 45 `zu-*` classes, about 61 stray hex values and the Ubuntu font in a 4274-line
  `global.css`.
- **Spine:** AD-17 lists only "AD-6, AD-8 … AD-11 и удаление мёртвого кода". AD-3 level 2 says "в ядре нет
  цветов и имени сайта" but is not scheduled in AD-17, and no gate enforces it. `navItems`, social kinds,
  `robots.txt` and `SITE_ORIGIN` are not assigned to any ladder level.
- **Fix:** add AD-3 (identity extraction) to AD-17's in-place list. Map each leak to a ladder level:
  origin/nav/social/robots → config, legal → content, logo/font/colours → theme. Add a core gate
  (`check:core-identity`, analogous to `check:local-paths`) that fails on site literals and raw hex in core
  code.

### B2 (M) Theme contract is undefined

- **Input:** `02-conventions` ("семантические токены, без сырых hex"; `@theme` in `global.css` is the
  single source of truth for tokens); memlog L17 (monolithic `global.css`).
- **Gap:** AD-3 level 2 says the theme belongs to the site but does not define the contract. It is unclear
  which tokens the core requires, what structural CSS stays in the core, how Tailwind v4 `@theme` from a
  site composes with core CSS, and what happens to `layout-tokens.css` (a generated writer output from
  `site.yaml`).
- **Fix:** add a Convention row or a short AD covering three points. The core ships structural CSS and a
  required token list with no values. The site's `src/theme/` provides values via `@theme`. Raw hex is
  forbidden in the core.

### B3 (M) AD-16 classifies ADR-0011 as a living core rule, but ADR-0012 retired it for living sites

- **Input:** ADR-0011 makes `normalized/*.jsonl` the canonical editable RU source with a mandatory errata
  loop. ADR-0012 makes that the migration mode only; in working mode the single source is `src/content`
  and errata is optional.
- **Spine:** AD-16 lists 0011 next to 0012 as "правила ядра" with no scoping. Read literally, a living
  site #2 would be bound by the JSONL-canonical loop. 0011 also carries site values (self-domain list
  `legacy.example.com`, `example.com`).
- **Fix:** in AD-16, scope 0011 as a **migration-kit / migration-phase** rule (binds `migration-kit`, not
  living sites), with the self-domain list as a site-supplied value. Do the same for the
  `--bootstrap` re-normalize guard.

### B4 (M) AD-10 silently changes ADR-0012's `translatedFromDigest` lifecycle

- **Input:** ADR-0012 §marker lifecycle has three writers: `content:translation-marker:stamp --write`,
  `/translate` (via `--compute`, with the agent writing the value) and `/validate` via
  `content:translation-marker:confirm`. Memlog L11 confirms the agent writes it by hand today.
- **Spine:** AD-10 says "ровно одна команда ядра", which is a deliberate change (memlog L43). The spine
  neither names that single command nor flags that ADR-0012 needs an amendment. The same applies to the
  factcheck digest: the ADR-0011 amendment lets `/factcheck-apply` update the digest in place with
  `appliedAt/appliedDigest` markers.
- **Fix:** name the single writer per artifact (for example one `translation-marker` command with
  `stamp/confirm` modes), and add "supersedes ADR-0012 §marker lifecycle / ADR-0011 factcheck-digest
  amendment" so the ADRs get amended together with the spine.

### B5 (L) AD-6 under-specifies the N-locale consequences listed in ADR-0013 and 03-architecture

- **Input:** ADR-0013 names the bilingual assumptions explicitly: `LOCALES`/`Record<Locale,E>` in
  `documents.ts` and `status/build-data.ts`, `integrity.ts` `locale-gap` assuming a pair, and
  `translatedFromDigest` being EN-only. `03-architecture` §3 level 3 stores short metadata per field
  (`title: { en, ru }`), and i18n dictionaries are typed `UIKey`.
- **Gap:** AD-6 bans literals but does not say how three of these generalise: per-field locale records
  (keys from config), `locale-gap` (all configured locales vs reference), and `translatedFromDigest`
  (every non-reference locale). Each is exactly what a single-locale site #2 or a multilingual
  site #3 will hit.
- **Fix:** add one sentence to AD-6 covering all three generalisations.

### B6 (L) Site constraints from memlog L23 are not carried

- site #2 "archival — near-zero upkeep, free hosting" and site #3 "its author maintains it". These
  matter for AD-1/AD-15 (pinned version must keep building with no upkeep; free tier) and for the Deferred
  CMS. The spine names sites but not these constraints.
- **Fix:** add to the Deferred CMS row and AD-15: per-site hosting must fit the free tier; a pinned site
  must build without core upgrades.

---

## C. Scan facts no AD covers

### C1 (H) Live data under `data/legacy/` would be swept into the migration package by AD-11

- **Memlog L21:** `data/legacy/master-matches.jsonl` is live despite the `legacy/` location. Verified
  consumers: `scripts/lib/images/source-resolver.ts`, `scripts/images/colormode.ts`,
  `scripts/lib/content-inventory.ts`, and the `process-images` and `add-album` skills.
- **Gap:** AD-11 moves "legacy-корпус … маппинги" to `migration/`, and the Structural Seed has only
  `migration/`. Nothing keeps the **master registry** (which every site needs for add-album and the image
  pipeline) out of the migration package. Applied literally, AD-11 orphans the image pipeline.
- **Fix:** add to AD-11/AD-9: the master registry is a living core data source with its own loader and
  schema, stored outside `migration/`. Data is classified by its live consumers, not by its path.

### C2 (M) factcheck depends on the legacy corpus, yet AD-13 makes it a core working-mode skill

- **Memlog L21:** `factcheck.ts`/`extract` read legacy normalized JSONL and pull importer/decisions types.
- **Gap:** AD-13 ships `factcheck`/`factcheck-apply` as core skills, and AD-11 forbids migration-kit
  coupling, but neither decides whether factcheck reads `src/content` (working mode, ADR-0012) or the
  migration corpus.
- **Fix:** state that factcheck in the core reads only `src/content`. Any corpus-reading path belongs to
  the migration kit.

### C3 (M) Migration-adjacent gates still in always-on `pnpm check`

- `check:colormode` (part of `pnpm check`) validates `src/generated/photo-colormode.json`, which memlog L11
  says has no runtime reader. Also `typecheck:image-fixture` and `lint:image-fixture` run against
  `e2e/fixtures/image-site`. The spine does not classify these gates (core vs migration vs fixture), and
  AD-14's "one gate per contract" does not cover an orphaned gate.
- **Fix:** add the gate inventory to AD-17's in-place work. Each gate gets one owner (core, site or
  migration kit) or is deleted.

### C4 (L) An existing fixture site is not mentioned as the demo-site seed

- `e2e/fixtures/image-site` is already a second Astro root with its own typecheck and lint. The spine
  defers demo content ("набирается при выносе") without noting this.
- **Fix:** mention it in the Deferred demo-site row as the starting point.

### C5 (L) Extension points for MDX blocks and directives are not in the ladder

- **Memlog L19:** the MDX component registry (`mdx-components.ts` + `mdx-authoring.d.ts`) and directive
  mdast plugins wired in `astro.config.mjs` are today's real extension points.
- **Gap:** AD-3's ladder covers component overrides but not "site adds its own MDX block or directive".
  That is the most likely first draft (AD-4) on site #2.
- **Fix:** add a ladder step or note: the core exposes a block-registration API (component + directive
  plugin) through the integration config.

### C6 (L) Other uncovered scan items

- The `sourceDigest` vs `translatedFromDigest` duplicate (L22). State that `sourceDigest` is
  migration-only (AD-11).
- Three copies of the review-render pattern (L22) and hardcoded `src/` paths in `lib` (L18). Both are
  implied by AD-8/AD-9 but not named.
- `i18n/ui.ts` mixing generic `t()` with site `navItems` (L18). Covered once B1 maps `navItems` to config.
- `/status/` (ADR-0012) is not assigned to the core or to the site. It is a working-mode feature, so it is
  likely core.

---

## D. Contradictions and precision issues

| # | Spine | Input | Issue | Fix |
| --- | --- | --- | --- | --- |
| D1 | AD-14 "каждый контракт проверяет ровно один гейт" | memlog L14: `content:validate` == `repository-content.test.ts` == astro build schema | `astro build` always validates the collection schema and cannot be removed, so "exactly one" is unreachable as worded | Reword: exactly one **project-owned** gate per contract; framework-intrinsic checks do not count |
| D2 | AD-16 lists 0004/0006/0007/0009–0014 | ADRs 0001, 0002, 0003, 0005, 0008 (as mechanism) | 0001/0002/0005 not classified. 0002 mixes a core mechanism (Pages Function + Telegram + Turnstile + honeypot) with site values (privacy retention of 12 months, analytics choice) | Classify every ADR; 0002 mechanism → core, privacy/retention → site legal content |
| D3 | AD-16 makes ADR-0008 values core defaults | ADR-0008 addenda: owner-tuned `targetRowHeight: 160` "тестами не пинится", while 680/960/1200/1440 are pinned by an ADR-named test | The core default should be the ADR value, not this site's tuned value | Note that the site keeps its tuning as an override; ADR-named tests assert core defaults (see A1) |
| D4 | Stack table | `02-conventions` (ESLint 10 flat config, Husky + lint-staged, markdownlint) | ESLint and lint tooling missing from Stack, yet AD-14 CI depends on them | Add ESLint ^10.7 (and markdownlint) to Stack |
| D5 | Conventions "Тексты" row | `AGENTS.md` / `02-conventions` | Matches. The commit-scope list (`AGENTS.md`) is per-repo and is not stated for the core repo | Optional: note that the core repo defines its own scopes |

## E. What landed correctly (no action)

All 23 memlog `(decision)` / `(direction)` entries on distribution, topology, ladder, drafts, modules,
locales, config schema as API, dependency direction, loaders, single writer, migration phase, CLI, skills,
CI, per-site infra, ADR carry-over and sequencing have a matching AD. The Stack versions match
`package.json`. Code style, the language rule, ISO dates, env-prefix and fail-closed env modes are carried.
ADR-0004's split deploy and the CI read-only / local write-R2 permission split are carried via AD-15.
ADR-0003's open monorepo question is closed explicitly.
