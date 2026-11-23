---
review: currency / reality-check of committed technology decisions
target: ../ARCHITECTURE-SPINE.md (+ ../.memlog.md version entries)
date: 2026-10-06
reviewer: currency lens (web-checked + repo-checked, read-only)
verdict: CONDITIONAL PASS
---

# Currency review — architecture spine (core + thin sites)

## Verdict

**CONDITIONAL PASS.** The Stack table exactly matches the brownfield reality (package.json + pnpm-lock),
nothing in it is out of support, and the headline mechanism claims recorded in the memlog
(`injectRoute`, injected scripts/styles, package-supplied content loaders, Starlight-style overrides,
pnpm `#semver:` git deps) hold on today's docs. But the memlog's web-checks verified only that the
pieces *exist*. Two places where the pieces meet fail in ways the spine doesn't account for:

1. The core CLI (AD-12) cannot run as `.ts` from `node_modules`.
2. Private-repo constraints on reusable workflows and git dependencies (AD-1, AD-14).

Three more medium gaps are covered below: collections aren't injectable, Tailwind doesn't scan
`node_modules`, and Cloudflare's guidance has shifted to Workers. Each has a one-line fix. None of them
reverses a decision.

## (a) Stack table vs brownfield reality

| Spine | package.json | pnpm-lock (resolved) | npm latest 2026-10-06 | Support status |
| --- | --- | --- | --- | --- |
| Node 24 | `engines >=24`, `.nvmrc` 24 | — | v26 Current | v24 "Krypton" LTS (EOL ~Apr 2028); v26 becomes LTS late Oct 2026 |
| pnpm 11.14 | `packageManager: pnpm@11.14.0` | lockfileVersion 9.0 | **12.9.1** (`latest`); `latest-11` = 11.28.2 | pnpm 12 (Rust rewrite) stable since 2026-08-26, same lockfile/settings; 11.x still maintained |
| Astro ^7.1 | `^7.1.1` | 7.1.1 | 7.3.6 (7.4 beta) | current major |
| TypeScript ^6.0 (ADR-0005) | `^6.0.3` | 6.0.3 | **7.0.2** | pin still justified: `@astrojs/check@0.9.10` peer `typescript: ^5 \|\| ^6` |
| React ^19.2 | `^19.2.7` | 19.2.7 | 19.3.0 | current |
| Tailwind ^4.3 | `^4.3.3` | 4.3.3 | 4.3.3 | current |
| PhotoSwipe ^5.4 | `^5.4.4` | 5.4.4 | 5.4.4 | current (slow-moving) |
| Swiper 14.0.6 | `14.0.6` (exact) | 14.0.6 | 14.3.0 | current major |
| sharp 0.35.3 | `0.35.3` (exact) | 0.35.3 (+0.34.5 transitive) | 0.35.5 | current |
| Vitest ^4.1 | `^4.1.10` | 4.1.10 | **5.0.3** (`V4` = 4.1.11) | v5 released 2026-09-03; v4 line still patched |
| Playwright 1.61.1 | `1.61.1` (exact, + docker image tag) | 1.61.1 | 1.63.0 | fine |
| Wrangler ^4.112 | `^4.112.0` | 4.112.0 | 4.148.0 | within range |

**Result:** every row matches the repo. Nothing is out of support. Three rows now trail a newer
major (pnpm 12, Vitest 5, TS 7, the last pinned on purpose). That's acceptable for a brownfield
snapshot, but the table should say it is a snapshot.

**Gap (LOW):** the table omits rows that matter once the core becomes a package:

- `@astrojs/mdx` 7.0.3 and `@astrojs/react` 6.0.1.
- `@astrojs/markdown-satteri` 0.3.4, a pre-1.0 exact pin.
- The Zod that Astro 7 re-exports, which the AD-7 config schema relies on.
- A **peerDependency policy**. `astro`, `react` and `react-dom` must be peers of the core so that site
  and core share one Astro instance.

## (b) Mechanism claims vs the current web

### B1. Astro integration can inject routes, provide components, add CSS — HOLDS

- `astro:config:setup` exposes `injectRoute`, `injectScript`, `updateConfig`, `addMiddleware`,
  `addRenderer`, `addWatchFile`, `createCodegenDir`, and more.
  `injectRoute.entrypoint` accepts a bare package specifier, for example
  `'@fancy/dashboard/dashboard.astro'`.
- CSS is added with `injectScript('page-ssr', 'import "…css"')`. The docs call this stage's main use
  "injecting a CSS `import` into every page".
- Packages may export `.astro` components (Starlight ships uncompiled `.astro`/`.ts` and Vite handles
  them). Source: https://docs.astro.build/en/reference/integrations-reference/

### B2. "Package supplies content collections" — PARTIALLY HOLDS (MEDIUM)

- A package can export **loaders** and **schemas**: the Content Loader API invites publishing loaders
  to npm.
- **No integration hook defines or registers a collection.** Collections stay user-defined in
  `src/content.config.ts`.
- Starlight, the spine's own precedent, makes the user write
  `docs: defineCollection({ loader: docsLoader(), schema: docsSchema() })`.
- So every thin site needs a `src/content.config.ts` that imports core loaders and schemas. The
  Structural Seed's `site-repo/` tree doesn't list it, and AD-3/AD-7 don't name it as public API.
  Because the schemas live in that file, a schema change made by the core reaches the site through a
  file the site owns.
- Sources:
  - https://docs.astro.build/en/reference/content-loader-reference/
  - https://starlight.astro.build/manual-setup/
- **Fix:** add `src/content.config.ts` to the site seed as a one-line call to a core-exported builder
  (for example `defineCoreCollections(siteConfig)`). Declare that builder part of the AD-7 public API.

### B3. Starlight-style component overrides for a custom integration — HOLDS (feasible)

- Starlight registers overrides via a `components: { Name: './path.astro' }` config key, and an
  override can import the default from `@astrojs/starlight/components/Name.astro`.
- The same thing is reproducible in a custom integration. Use `updateConfig({ vite: { plugins: […] } })`
  with a virtual-module or alias plugin that resolves each named slot to the default or to the site's
  file. No private Astro API is needed.
- One thing to watch: Starlight passes page data through `Astro.locals.starlightRoute` rather than
  props. AD-3 promises "slot name + props". Either approach works, but the props or locals contract is
  what must be semver-guarded.
- Source: https://starlight.astro.build/guides/overriding-components/

### B4. Tailwind v4 classes used inside core components — NOT ADDRESSED (MEDIUM)

- Tailwind v4 automatic detection skips `node_modules` and `.gitignore`d files.
- Utility classes that appear only in core components installed under `node_modules/<core>` will not be
  generated unless a stylesheet declares `@source "../node_modules/<core>"`.
- Today this is invisible because everything lives in `src/`.
- Source: tailwindcss.com/docs/detecting-classes-in-source-files
- **Fix:** make the core's theme entry CSS carry the `@source` for its own components, or have the
  site theme template include it. Add a demo-site check that renders a core-only utility class.

### B5. Core CLI as package `bin` (AD-12) — BROKEN AS-IS (HIGH)

- Today every operation runs as `node --experimental-strip-types scripts/*.ts`. Node's docs say:
  "Node.js refuses to handle TypeScript files inside folders under a `node_modules` path."
- Moved into the core package and installed into a site, these commands stop working.
- The core's `bin` therefore needs **compiled JS**, which means a build step. This connects to B6: pnpm
  blocks the `prepare` script of a git-hosted dependency unless it is allowed in `allowBuilds`
  (pnpm ≥ 10.26).
- So the "delivery channel" item in Deferred is not independent. Whatever channel is chosen must ship
  prebuilt JS for the CLI. The options are:
  - commit the built `dist/` to release tags;
  - allow-list the core's `prepare` in every site's `allowBuilds`;
  - publish built tarballs to a registry (GitHub Packages).
- The `.astro`/`.ts` that Vite consumes is unaffected; only Node-executed code is.
- Sources:
  - https://nodejs.org/api/typescript.html
  - https://pnpm.io/blog/releases/10.26
- **Fix:** add a rule to AD-12: "core `bin` ships prebuilt JS in the released artifact; no TS
  execution from `node_modules`". Pull the delivery-channel decision forward to before the first
  extraction.

### B6. pnpm git deps with `#semver:` ranges — HOLDS; subdirectory `path:` — SUPPORTED (with caveats)

- `pnpm add owner/repo#semver:^2.0.0` is documented. `#path:/packages/x` is also documented for a
  subdirectory of a git monorepo, and parameters combine with `&`.
- The docs show `branch&path` only. **The combination `#semver:^1.0.0&path:/packages/core` isn't shown
  and wasn't verified here.**
- The spine defers subdirectory install. Since pnpm supports it, the deferral now rests only on the
  unverified semver+path combination.

Caveats that bind the topology (AD-2: one core repo holding several packages):

- **Tags are repo-wide.** `#semver:` resolves against the repo's tags, so `packages/core` and
  `packages/migrate-wp` can't have independent semver lines unless the tag naming scheme separates
  them.
- **Sibling `workspace:` protocol.** A subdirectory package that depends on a sibling via `workspace:*`
  probably won't resolve when installed from git. This was not verified, so spike it.
- **Private repos.** pnpm records the anonymous HTTPS archive URL only if an anonymous request
  succeeds; otherwise it shells out to git. CI therefore needs an SSH key plus `insteadOf` rewrite or a
  credential helper. The default `GITHUB_TOKEN` can't read a different private repo.
- **pnpm 12.** The docs now describe pnpm 12 git resolution ("significantly updated in v12.0.0"), while
  the stack pins 11.14. Recheck behaviour on whichever major the sites actually pin.

Sources:

- https://pnpm.io/package-sources
- https://pnpm.io/blog/releases/10.26

**Fix:** run a one-day spike that installs the demo core from a private tag with
`#semver:^0.1.0&path:/packages/core` on pnpm 11 and 12, locally and in CI.

### B7. Reusable GitHub workflow referenced by tag from another repo (AD-14) — HOLDS with private-repo constraints (HIGH for the multi-owner plan)

- `uses: owner/repo/.github/workflows/x.yml@<tag|sha|branch>` works. GitHub recommends a SHA as the
  safest ref; a tag is mutable.
- A **private** reusable workflow can be called only by private repos **owned by the same user or
  organization**, and only after the core repo enables Settings → Actions → General → Access.
- **Public repos cannot call private reusable workflows.**
- A private repo owned by a personal account (today `<owner>/<site>` is PRIVATE under the owner's
  personal account) can't share with repos owned by other accounts.
- That conflicts with the plan for site #3 ("its author maintains it"): if it lives under the
  author's account, it can neither call the workflow nor fetch the private git dependency.
- `secrets: inherit` is documented for "the same organization or enterprise". For personal-account
  repos, pass secrets explicitly.
- Sources:
  - https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
  - https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
  - https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- **Fix:** either make the core repo **public**, or bind every site repo to a single owner and record a
  deploy-key / PAT secret for cross-repo checkout and install. Making it public is natural: AD-15
  already keeps site values out of the core, and it also removes the git-dependency authentication
  problem. Pin `uses:` by tag plus documented SHA, and pass secrets explicitly.

**Related cost note (LOW):**

- GitHub Free includes 2,000 Actions minutes per month for private repos, shared across the account.
  Public repos get standard runners free.
- Today one push run of `ci.yml` takes about 29 job-minutes over 10 jobs, before per-job rounding.
- Three private site repos plus PR runs can exhaust the free allowance.
- Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions

### B8. Cloudflare Pages + R2 free tier — STILL EXISTS and fits, with a direction change (MEDIUM)

**Pages:**

- Still supported and free: 500 builds a month, 20,000 files per site, 25 MiB per file, 100 projects
  per account, 100 custom domains per project.
- Pages Functions count against the Workers free quota of 100k requests a day.
- `wrangler pages deploy` and `pages dev` are not deprecated (only `pages publish` was removed in v4).
- The Pages docs landing page now says: "Workers … is Cloudflare's primary platform for building
  applications. **Start new projects with Workers.**" site #2 and site #3 would be new projects.
- Workers static assets requests are free, and Functions-equivalents bill at the same rate.

**R2:**

- Free tier: 10 GB-month storage, 1M Class A and 10M Class B operations, free egress (page updated
  2026-10-01).
- Usage is billed per **account**. Three per-site buckets in one Cloudflare account (AD-15) share one
  10 GB allowance. The pricing page doesn't state per-account vs per-bucket explicitly, so confirm in
  the dashboard. An archival site #2 corpus could exceed it.

**Sources:**

- https://developers.cloudflare.com/pages/
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- https://developers.cloudflare.com/workers/wrangler/deprecations/
- https://developers.cloudflare.com/r2/pricing/

**Fix:**

- In AD-15, keep the core host-agnostic: the contact handler as a plain `fetch` handler, with a thin
  `functions/` or Worker wrapper in the site.
- Record the Pages vs Workers-static-assets choice for new sites in an ADR.
- Budget R2 storage across all sites per account, or use separate accounts.

## Memlog version entries — assessment

| Memlog entry | Assessment |
| --- | --- |
| "Integration API supports injectRoute, injected scripts/styles" | Correct |
| "Content Loader API lets a package supply collection loaders" | Correct but incomplete: loaders yes, collections no (B2) |
| "Starlight … named component overrides registered in config" | Correct; feasible for a custom integration (B3) |
| "pnpm supports git deps pinned by semver range" | Correct; subdirectory `path:` is also supported (B6). The deferral now rests only on the unverified semver+path combination, the private-repo authentication question, and the CLI build question (B5) |
| (absent) Node type stripping in `node_modules` | Missing check; this is what breaks AD-12 (B5) |
| (absent) private reusable-workflow access rules | Missing check (B7) |
| (absent) Cloudflare "start new projects with Workers" | Missing check (B8) |

## Findings summary

| # | Severity | Finding | One-line fix |
| --- | --- | --- | --- |
| 1 | HIGH | Node refuses to run `.ts` under `node_modules`, so the core CLI (AD-12) can't run as today's strip-types scripts. With git deps, a build `prepare` is blocked unless `allowBuilds` allows it. | AD-12: ship prebuilt JS `bin` in the released artifact; decide the delivery channel before the first extraction. |
| 2 | HIGH | A private reusable workflow and a private git dep work only for private repos of the **same owner**, with Access enabled. Public callers and other accounts (site #3) are excluded, and `GITHUB_TOKEN` can't fetch the dep. | Make the core repo public, or fix a single owner plus a deploy-key secret; pass secrets explicitly; pin by tag+SHA. |
| 3 | MEDIUM | Astro has no hook to register collections; the site must own `src/content.config.ts` (Starlight precedent). | Add it to the site seed as a call to a core-exported builder; declare it AD-7 public API. |
| 4 | MEDIUM | Tailwind v4 doesn't scan `node_modules`, so core component classes would be purged. | Core theme CSS carries `@source` for the core package; add a demo-site check. |
| 5 | MEDIUM | Cloudflare now tells new projects to use Workers, not Pages; the R2 10 GB free tier is shared per account across the per-site buckets. | Keep the core host-agnostic; decide Pages vs Workers for new sites in an ADR; budget R2 per account. |
| 6 | LOW | The `semver+path` combination, sibling `workspace:` deps and repo-wide tags are unverified for a multi-package core repo. pnpm 12 / Vitest 5 / TS 7 are now out; the stack table omits the peerDependency policy. | One-day install spike; label the stack table "snapshot 2026-10-06"; add a peer-deps row (astro/react as peers). |
