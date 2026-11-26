# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The versions below are the repository's `1.<epic>.<story>` versions; the npm package `@picasso-ai/astrum-scena` is versioned separately (`0.x` until the first site adopts it, see Versions in its README); the transitions of its breaking releases are in `UPGRADING.md`.

## [Unreleased]

## [1.6.11] - 2026-11-26

### Added

- **Breaking:** A site declares non-geographic taxonomy dimensions beside the places and tags: `site.yaml` `content.taxonomy.dimensions.<id>` has a `label` in every locale of `content.locales` and an optional `icon`, the name of a Lucide icon; the id is kebab-case and not the name of another file of `src/content/config/` (`categories`, `places`, `tags`, `image-sets`, `place-gps-bounds`), and `site.lock.yaml` holds the dimensions (`dimensions: {}` without any), so a lock written before fails until `astrum-scena config resolve`. Each dimension has the flat dictionary `src/content/config/<id>.yaml` (`schemaVersion: 1`, a list of `{id, label}` under the dimension's id, each id once), read by the one loader `loadDimensionConfig`; a photo refers to its values with the optional `dimensions: { <id>: [<value ids>] }`, without a new version of the `photos` collection; `astrum-scena check content` rejects an undeclared dimension or an unknown value with the path and the known ones (`photos.<id>.dimensions.events: Unknown events "nope"; known: [tide-fair]`), and a declared dimension without its dictionary fails with the file. The photo page shows the values as chips in the row of the tags, after them and in the order of the config, with the dimension's label as their `title`; the theme declares `--color-dimension-<id>` for each dimension, the chips' color, the build failing without it and on such a token of an undeclared dimension. The icon's SVG is embedded before the text of each chip from the core's new dependency `lucide-static` (ISC, recorded in `THIRD_PARTY_NOTICES.md`), and an unknown name fails `astrum-scena config resolve` and the build with `site.yaml: content.taxonomy.dimensions.<id>.icon`. A site without dimensions renders the same photo page markup. The demo declares its own categories (`journeys`, `studies`), place kinds (`land`, `shore`), tag kinds (`mood`, `form`) an `events` dimension with an icon and a `projects` dimension without one, which e2e checks on the photo page; the icon SVG keeps the package's licence comment. The API snapshot changes: `site`, `site.yaml`, `src/content/photos/**/*.{yaml,yml}` and its `dimensions`, `content.taxonomy` of `site.yaml`; `src/content/config/<dimension>.yaml` is added.

### Changed

- **Breaking:** The taxonomy enumerations come from the config: `site.yaml` `content.taxonomy` declares the album `categories`, the `placeKinds` from the root of the hierarchy down and the `tagKinds`, each a non-empty list of distinct kebab-case ids, with the core's former lists as defaults (`series`, `places`; `country`, `region`, `locality`; `subject`, `condition`, `motif`, `moment`, `technique`), and `site.lock.yaml` holds the effective lists. The album, category, place and tag schemas, `astrum-scena check content` and the place and tag proposals of the authoring helpers are built from them: a value outside a list fails with the file, the field and the list (`places.0.kind: "country" is not one of content.taxonomy.placeKinds [land, spot]`), the rank of a place kind is its position in `placeKinds` with the first kind as the root, which `src/content/config/places.yaml` follows (a root place has no `parentId`, any other has one of a lower rank), and `src/content/config/categories.yaml` labels exactly the declared categories, a missing or undeclared one failing with its id. A lint rule bans the default values as literals in the core outside the config layer and tests. The API snapshot changes: `site.content.taxonomy`, `src/content/config/categories.yaml`, `places` of `src/content/config/places.yaml`; `content.taxonomy` is added to `site.yaml`.

## [1.6.10] - 2026-11-25

### Added

- `pnpm demo:packed` also builds the demo with its reference locale only, without the other locale's texts, documents and dictionary, and checks that the build has every page of that locale, no other locale's pages, no `hreflang` and no translation freshness on `/status/`.

### Changed

- The `Release` workflow publishes to npm from `main`: the core is public, its first version went out by hand and the trusted publisher is set, so the `main` step runs without `--dry-run`; pull requests and other refs still stop at `npm publish --dry-run`.
- **Breaking:** Every localized field of a site holds exactly the locales of `content.locales` in its lock, so a one-locale site writes one text: the album and photo fields (`title`, `description`, `excerpt`, `caption`, `alt`), the taxonomy labels and names (`categories[].label`, `places[].name`, `tags[].label`), the inline copy of the featured slides (`slides[].copy.title`, `slides[].copy.description`) and the config texts of `site.yaml`, now also `privacy.controller.name` and `seo.description`; another locale or a missing one fails with the file, the field path and the locale (`title.ru: not one of content.locales [en]`). The shapes are versioned: `site.yaml` moves to `schemaVersion` 4, the lock's `collections.albums` and `collections.photos` to 2, and `src/content/config/categories.yaml`, `places.yaml`, `tags.yaml` and `src/content/featured/home.yaml` to `schemaVersion` 2, an older version failing with the upgrade hint; a two-locale site changes only the numbers (`UPGRADING.md`). `defineCoreCollections()` builds the album and photo schemas from the lock, and `CoreCollections` names their types. The API snapshot changes: `site.yaml`, `site`, `site.schemaVersion`, `schemaVersion`, `privacy.controller.name.(keys)`, `privacy.controller.name.en`, `privacy.controller.name.ru`, `seo.description.(keys)`, `seo.description.en`, `seo.description.ru`, `site.privacy.controller.name.(keys)`, `site.privacy.controller.name.en`, `site.privacy.controller.name.ru`, `site.seo.description.(keys)`, `site.seo.description.en`, `site.seo.description.ru`, `collections.albums`, `collections.photos`, `title`, `title.(keys)`, `title.en`, `title.ru`, `description`, `description.(keys)`, `description.en`, `description.ru`, `excerpt`, `excerpt.(keys)`, `excerpt.en`, `excerpt.ru`, `caption`, `caption.(keys)`, `caption.en`, `caption.ru`, `alt`, `alt.(keys)`, `alt.en`, `alt.ru`, `categories[].label`, `categories[].label.(keys)`, `categories[].label.en`, `categories[].label.ru`, `places[].name`, `places[].name.(keys)`, `places[].name.en`, `places[].name.ru`, `tags[].label`, `tags[].label.(keys)`, `tags[].label.en`, `tags[].label.ru`, `slides[].copy.title`, `slides[].copy.title.(keys)`, `slides[].copy.title.en`, `slides[].copy.title.ru`, `slides[].copy.description`, `slides[].copy.description.(keys)`, `slides[].copy.description.en`, `slides[].copy.description.ru`, `CoreCollections`.
- The default titles of the `:::note` and `:::links` blocks come from the core's dictionaries under the new keys `note.title` and `links.title`, which a site may override in `src/i18n/<locale>.yaml`; a document in a locale outside `content.locales` without an explicit `title` fails the build.
- The lint rule against hardcoded locales also rejects an `en` or `ru` object key and a `.en` or `.ru` property read outside the config layer, the declarations of the shipped dictionaries and tests, and the album header's glyph width per locale moves into the locale catalog as `charWidthPx`.
- **Breaking:** The locale catalog comes from the config: the core's defaults for `en` and `ru` (`script`, `ogLocale`, `intl`, `charWidthPx`) are overridden field by field and extended with new codes in `site.yaml` `content.catalog`, a new code needing every field and a `script` the core has fonts for (`latin`, `cyrillic`), and `site.lock.yaml` holds the effective entry of each locale of `content.locales` and of `en`, the language of `/status/`, which the fonts, `og:locale`, the capture date and the album header read. A locale is any code of two or three lowercase letters with a catalog entry, so `content.locales`, `content.referenceLocale`, the keys of the config texts and a content file's `locale` accept that format and are checked against the config, a locale without an entry failing with its path (`content.locales.0: "de" has no entry in the catalog`); the dictionaries, module texts and language names of a third locale are not part of this change. The lint rule against hardcoded locales also bans importing the default catalog outside the config layer, the shipped dictionaries and tests. The API snapshot changes: `content`, `content.locales[]`, `content.locales[0]`, `content.referenceLocale`, `identity.title.(keys)`, `identity.photoAlt.(keys)`, `identity.copyright.holder.(keys)`, `menu.items[].label.(keys)`, `social[].label.(keys)`, `site.content`, `site.content.catalog`, `site.content.locales[]`, `site.content.locales[0]`, `site.content.referenceLocale`, `site.identity.title.(keys)`, `site.identity.photoAlt.(keys)`, `site.identity.copyright.holder.(keys)`, `site.menu.items[].label.(keys)`, `site.social[].label.(keys)`, `locale`.
- The place and tag proposals of the authoring helpers take the site's locales: a name needs a text in each, and the id comes from the reference locale's text, or from the first other locale whose text has Latin letters or digits.
- A one-locale site renders no bilingual leftovers: no `<link rel="alternate" hreflang>` (neither the locale nor `x-default`), no language block in the menu overlay, and one plain privacy link without a locale suffix in the footer of the language-neutral `/rights/` page; a two-locale site is unchanged.

## [1.6.9] - 2026-11-22

### Added

- The repository gets the MIT `LICENSE` at its root, a root `README.md` and an Installation section in the core's README (the peers, `astrumScena()` in `astro.config`, `defineCoreCollections()`, `site.yaml` with its lock and `astrum-scena install`).
- `THIRD_PARTY_NOTICES.md` records the source and licence of every asset the core ships (the package carries it to npm) and, at the root, of the demo's Ubuntu font and the BMAD Method tooling; three icons are based on Typicons (CC BY-SA 4.0), the GitHub and Telegram glyphs on Material Design Icons (Apache-2.0) and the viewer sprite on PhotoSwipe 4 (MIT).
- `pnpm check:notices`, part of `pnpm check`, fails when an asset of the core or a font of the demo is missing from its notices file or the notices name a file that is gone.
- `pnpm check:publication-tree` checks the tree the public repository is created from: it makes `HEAD` the only commit of an orphan branch in a throwaway clone and runs the identity gate with the owner's list and gitleaks, in a pinned Docker image, on that commit, reporting paths and rules only; it fails without the list or Docker. Gitleaks reads the tree's own `.gitleaks.toml`: the default rules with an allowlist for the hashes of the BMAD files manifest and the sample expired token of the BMAD TEA API testing guide.
- `docs/publication.md` is the owner's runbook for opening the core: the checks, the orphan commit, the public repository and its CI secret, the manual first npm release with 2FA, the trusted publisher, the commit that drops `--dry-run` from the `main` release step and the first tag `v1.6.9`.

### Changed

- The identity gate scans the whole tree, `docs/` and `_bmad-output/` included.
- Public reference hosts cited by the image protection guide join `PUBLIC_HOSTS`, and the provenance metadata of the brand PNGs is removed without touching their pixels.
- Outside CI (`CI` unset) `check:identity` and the `commit-msg` hook without the owner's list check only the generic patterns and warn on stderr instead of failing, so a contributor can run `pnpm check` and commit; in CI the list is still required.
- The npm version of the core is `0.<epic>.<story>` of the story that releases it until the first site adopts it: the core's `package.json` moves to `0.6.9`, the first release, any higher `0.y.z` may be breaking when `UPGRADING.md` has a section for it, a site pins the exact version, and `check:upgrading` and `check:api-breaking` follow that rule; from `1.0.0` semver applies as before. The READMEs install the core from npm.

## [1.6.8] - 2026-11-18

### Added

- The gate `core-version` joins `astrum-scena check`: every reference of a site workflow under `.github/workflows/` to the core's reusable `site.yml` must be pinned to a 40-hex commit SHA whose `# v<version>` comment names the installed core, and with `CI=true` the core must be installed under the site's `node_modules` rather than linked by `pnpm link`, a `workspace:` dependency excepted; the demo and the repository get a `check:core-version` alias, and `api-snapshot/cli.json` lists the command.
- The bin's gate registry gives each gate one contract and its writer, a command of the bin or the site's owner, and a test keeps the contracts distinct and every writer a known command.
- The packed demo build runs `check core-version` with `CI=true` on the installed tarball and checks that it passes a probe workflow at the installed version and rejects one whose comment names another.
- The core ships the CI of a site as the reusable workflow `.github/workflows/site.yml`, which a site calls pinned to a commit SHA with the version as a comment: `gates` runs the site's install from its lockfile, its `lint` and `typecheck` scripts, `astrum-scena check` with `CI=true` and the one `astro build` of the run, `live` the read-only `images check-live`, and `deploy`, only on a push to `main` with `deploy: true`, publishes that build with the site's Wrangler after checking that the run's commit is still the head of `main`, one deploy at a time. Every secret is declared by name and optional, so a job without its secret skips with a notice; `PUBLIC_*` build variables come through the `public-env` input and fail the run on a name the core does not read or an empty value.
- The packed demo build leaves a portable site: the tarball of the core inside the site directory, linked by a relative path the lockfile keeps, with `packageManager` and `.nvmrc` of the repository, so the directory installs with `--frozen-lockfile` wherever it is copied.

### Changed

- CI builds the demo through the core's `site.yml`: a job builds the packed demo and uploads its site directory, which `site.yml` takes in place of a checkout; a test keeps the invariants of the workflows (no `secrets: inherit`, every action pinned to a SHA, no bucket write, the deploy guarded by its event, queue and freshness check).

### Fixed

- The courses transition of `UPGRADING.md` also moves the fact-check ledger entries of the moved courses to `targetCollection: courses`, without which `astrum-scena check factcheck` fails on every course.

## [1.6.7] - 2026-11-17

### Added

- The core ships the `astrum-scena` bin, compiled JavaScript that Node runs from `node_modules` with no build step: `astrum-scena config resolve` writes `site.lock.yaml`, `astrum-scena layout-tokens` writes the layout tokens, and `astrum-scena check` runs every gate of the site files (`check <gate>` one of them: `config-lock`, `layout-tokens`, `color-literals`, `css-layers`, `pages`, `image-files`) on the site `--root <dir>` names, the current directory by default, reading the core's sources from the installed package. A failure names the file and the command that fixes it, a directory without `site.yaml` fails with its path, and an unknown command or option exits with 2 and the list of commands; `api-snapshot/cli.json` lists every command with its options, so removing one is breaking.
- The packed demo build runs `astrum-scena check` through the demo's `check:site` script from the installed tarball and fails unless every gate passes on the core sources under `node_modules`.
- The image pipeline is a part of the bin: `astrum-scena images build` cuts the derivatives of the photos from their masters into a release under `.cache/images/releases/`, with the rights written into their XMP by `exiftool-vendored` (a new dependency of the core), `images check-derivatives` checks a release against its manifest, rights and privacy metadata, `images activate` switches the release descriptor to a checked release under a journal (`--recover` finishes an interrupted one), `images colormode` writes the detected `colorMode` into the photos, `images ladder-report` reports and replays the width ladder of a release, and `images public-init` writes `images-public.json`. The masters and the archive come from `--masters` and `--archive` or `IMAGES_MASTERS_ROOT` and `IMAGES_ARCHIVE_ROOT`, read from the environment and the site's `.env` (new public names in `api-snapshot/env.json`); the commands take their own options, and an option a command does not take exits with 2 and the command's options.
- Three gates join `astrum-scena check`: `images-policy` (the release descriptor is canonical, current with the `images` section, within the policy and the width ladder, and no activation is unfinished), `images-public-config` (the public image config is a fresh projection) and `place-gps-bounds` (the optional `src/content/config/place-gps-bounds.yaml` names only places of `places.yaml`, read through the core's places loader). `images build` warns when the GPS of a master proposes another place than the photo's `placeId`.
- Bucket commands for a site whose `publicOrigin` is an R2 bucket: `astrum-scena images sync --release <id> [--dry-run]` uploads the missing derivatives of a checked release with immutable caching and their sha256 in the object metadata, verifies them and appends the release to `data/images/publication-ledger.jsonl` (every local check first, so a failure makes no request, and a key already holding other bytes aborts the run), `images prune [--release <id>]` reports the bucket objects referenced neither by the release descriptor nor by the release `--release` names, without deleting any, and `images check-live [--release <id>]` checks every object of the active release descriptor or of a release in the bucket and through the public origin. They read `R2_IMAGES_ACCOUNT_ID`, `R2_IMAGES_ACCESS_KEY_ID`, `R2_IMAGES_SECRET_ACCESS_KEY` and `R2_IMAGES_BUCKET` from the environment and the site's `.env` (new public names in `api-snapshot/env.json`), naming the missing ones without printing a value. `@aws-sdk/client-s3` is an optional peer of the core, loaded only by these commands: without it they fail asking to install it, and every other command and gate runs.
- The packed demo build checks that the installed bin's `astrum-scena images --help` lists every image command and that a bucket command fails asking for `@aws-sdk/client-s3`, which the packed demo does not install.
- Content validation and the translation markers are a part of the bin: the gate `content` joins `astrum-scena check` (the content parses against its schemas and holds together, with the locales of the lock, and nothing belongs to a module the lock leaves disabled; an integrity failure names its error code and the entry, the others name the file), and `astrum-scena content translation-marker check` reports each translation of `articles`, `pages` and the document collections of the enabled modules (`courses`) as `current` or `needs-review` (advisory, exit 0), `content translation-marker confirm (--document <collection>/<key>… | --all) [--write]` plans and, with `--write`, inserts the `translatedFromDigest` marker of the selected translations and formats the file with the site's prettier config, so the body of a prettier-clean file stays as it was, and `content translation-marker compute --key <key>` prints the digest of a reference body. A command option may now be repeated (`…` in `api-snapshot/cli.json` and in `--help`). `prettier` is an optional peer of the core, loaded only by the commands that write content, which format with the site's prettier config and fail asking to install it without the package. The demo gets a `check:content` alias, and the packed demo build runs `content translation-marker check` from the installed tarball.
- Fact-checking is a part of the bin: `astrum-scena content factcheck extract [--check]` seeds the ledger `data/factcheck/ledger.yaml` with every reference-locale document of `articles`, `pages` and the enabled modules and the URLs of its body, `merge --key <key> --findings <file> [--date <yyyy-mm-dd>]` merges a researcher's findings, `researched --key <key> [--date …]` stamps a document as researched, `decide --key <key> --set <id=status>…` records the owner's decisions and `review` writes the review packet `data/factcheck/review.md`; the gate `factcheck` joins `astrum-scena check` and fails on a ledger that breaks its schema, names a key without a document, carries a blocking issue or whose packet is out of date, while a stale digest or a document without an entry only warns (an annotation on GitHub Actions). Without a ledger the gate passes. The writing commands and the gate with a ledger need the optional `prettier` peer. The demo and the repository get a `check:factcheck` alias, and the ledger is a site file of the API snapshot.
- `astrum-scena install` puts the core's content skills (`validate`, `fixcontent`, `sync-mdx`, `factcheck`, `factcheck-apply` and their shared rules) into `.agents/skills/` and `.claude/skills/`, the fact-check agents into `.claude/agents/` and `.codex/agents/`, the managed block of `AGENTS.md` between `<!-- astrum-scena:begin -->` and `<!-- astrum-scena:end -->`, and a config for each preset the site has none of, every installed file stamped with the core's version; a second run changes nothing, a site file under a name of the core stops it with nothing written, and the skills run only `pnpm exec astrum-scena …` commands, which a test checks against the registry. The gate `skills` joins `astrum-scena check` and fails on a core skill or agent in the site that is not the installed core's copy.
- Presets as entry points of the package: `@picasso-ai/astrum-scena/prettier`, `/tsconfig.json` and `/markdownlint.json`, and `astrumScenaStyle()` in `/eslint`, the code style of the core on `typescript-eslint` and `eslint-plugin-simple-import-sort`, optional peers like `prettier-plugin-astro`; the repository lints, formats and checks Markdown with them.
- `astrum-scena install` also installs the skills `translate` (with the agents `translator` and `translation-reviewer`, which `factcheck-apply` uses for its end notes too), `add-album`, `process-images` and `front-audit` (with the core's catalog of Astro traps; a site keeps its own traps in a catalog its `AGENTS.md` names); like the others, they name no model and run only commands of the core.
- The packed demo build runs the installed `astrum-scena install` and `check skills`, and lints the site with the installed ESLint config, which must pass and must reject an `eslint-disable` comment.

### Changed

- The demo's package scripts alias the core's bin (`config:resolve`, `layout:tokens`, `check:site` and one `check:<gate>` per gate) and Astro only, which a test enforces; the repository's `pnpm config:resolve`, `pnpm layout:tokens` and the six `pnpm check:<gate>` scripts call those aliases, `pnpm check` runs the gates once through `check:site`, and the repository scripts that implemented them are gone, so their `--site <dir>` option becomes `--root <dir>` relative to the current directory.
- **Breaking:** The image data files of a site become site files of the core: the place zones move from `config/place-gps-bounds.yaml` to `src/content/config/place-gps-bounds.yaml` with `schemaVersion: 1` instead of `version: 1`, and `data/images/masters.jsonl` and `data/images/publication-ledger.jsonl` start with the line `{"schemaVersion":1}`, their rows unchanged; a file in the old form fails with its path and the supported version. `api-snapshot/site-files.json` lists the three files.
- A schema error of a content entry names its file from the site root rather than from the current directory, and no module of the core outside the bin's entry reads the current directory, which a lint rule enforces.
- A missing lock or branch of it now says `run astrum-scena config resolve`; `postcss` moves to the core's dependencies, since `check css-layers` parses CSS with it.
- **Breaking:** The fact-check ledger `data/factcheck/ledger.yaml` becomes a site file of the core with `schemaVersion: 1` instead of `version: 1` (the old form fails naming the missing `schemaVersion`), its `targetCollection` also takes `courses`, and the review packet moves beside it to `data/factcheck/review.md`; `UPGRADING.md` describes the transition.
- **Breaking:** The ESLint preset `astrumScenaEslint()` (`LintConfig`) sets `linterOptions.noInlineConfig` and the rule `astrum-scena/no-inline-config`: an inline config comment no longer suppresses a rule and is reported as an error.
- **Breaking:** The fact-check review packet `data/factcheck/review.md` shows the id of each finding, which `astrum-scena content factcheck decide --set` takes; a packet written before fails `check factcheck` until `astrum-scena content factcheck review` writes it again.
- A draft document missing a locale no longer fails the `content translation-marker` commands: its missing locales have no pair, as the content gate requires every locale only of a published document.

## [1.6.6] - 2026-11-14

### Added

- Modules: an optional feature of the core declares a typed manifest (its collections with their versions, route segments and pages, the schema of its `modules.<id>` section of `site.yaml`, its i18n namespace and dictionaries, MDX and directive names, tokens, menu segments and dependencies), and one registry lists them. A site enables a module with its section; `pnpm config:resolve` checks the section with the module's schema and writes the versions of its collections into the lock, and the build reads the enabled modules from the lock once, so `src/content.config.ts` stays one `defineCoreCollections()` line. An unknown module, a dependency on a disabled one, a menu segment of a disabled module and a segment no section or published page serves each fail with the key path; the content of a disabled module and a `moreDocs` target of one fail the build with the directory or the file and key.
- A collision gate for module names: the build fails, in one error naming both sides and the owner, when an enabled module takes an id, a collection or its source directory, a route or menu segment, an MDX component, a directive, a theme token or an i18n namespace of the core or of another module, or has a dictionary key outside its namespace; a test in `pnpm check` runs it over every module of the registry. The modules are a new API snapshot surface (`modules.json`): an added or removed module, an added collection, a removed collection version, an added route segment or dependency and a changed namespace are breaking, the settings of `modules.<id>` are compared as a schema with their defaults, and the packed demo build adds a page whose slug is the courses segment, which must fail naming it.
- The packed demo build also builds the demo without the courses module, which must have no course page and no course URL in its sitemap, and with the course content left in place, which must fail naming it.

### Changed

- **Breaking:** Courses are the reference module, enabled by `modules.courses` of `site.yaml`, which now has `schemaVersion: 3` (version 2 fails with a pointer to `UPGRADING.md`): the course settings move from the top-level `courses`, `moreDocs.course`, `surfaces.coursesIndex` and `banners.surfaces.coursesIndex` into the section as `order`, `currentFirst`, `moreDocs`, `surface` and `banner`, and the lock follows under `site` (`site.schemaVersion`, `site.modules`, `site.courses`, `site.moreDocs`, `site.moreDocs.course`, `site.surfaces.coursesIndex`, `site.banners.surfaces.coursesIndex`), with the checks of `site.yaml` and of `moreDocs` changed accordingly. Courses are a collection of their own in `src/content/courses/` instead of pages with `kind: course`, so the page frontmatter loses `kind` and `courseStatus`, and `defineCoreCollections` adds the collection while the module is enabled. Without the module a site has no course routes, collection, menu item or sitemap entries; the demo enables it and builds the same pages, markup and sitemap as before.
- **Breaking:** A generic page of `src/content/pages` whose `slug` is the route segment of the core (`portfolio`, `articles`, `contacts`) or of an enabled module (`courses`), published or unlisted, fails the build (`page "<translationKey>": slug "courses" is the route segment of module "courses"`) instead of being silently hidden by that route; a site renames the slug.
- **Breaking:** The course texts are the courses module's `courses.*` keys: `course.status.archive`, `course.status.current`, `moreDocuments.course.heading` and `moreDocuments.course.label` become `courses.status.archive`, `courses.status.current`, `courses.moreDocuments.heading` and `courses.moreDocuments.label` (`courses.title` keeps its name), a locale of `content.locales` missing one fails the build while the module is enabled, and a site dictionary may override them only then.

## [1.6.5] - 2026-11-13

### Added

- A site overrides any UI text of the core in `src/i18n/<locale>.yaml`, one file per locale of `content.locales` with `schemaVersion: 1` and only the keys it changes; for each locale the build lays it over the core's dictionary, and a locale without a file keeps the core's texts. An unknown key, a blank text, a missing or unsupported `schemaVersion` and any entry of `src/i18n/` other than `<locale>.yaml` for a locale of `content.locales` fail with the file and the key path; `footer.quote` and `contacts.intro` get a short neutral default in the core, and the demo sets its own text.
- The packed demo build fails when its CSS lacks a utility class that only the core's markup uses, so a core whose sources do not reach the site's Tailwind is caught.
- Named replacement points: a site puts `src/overrides/logo.astro` (the brand mark in the header's logo slot and in the banner) or `src/overrides/footer-copyright.astro` (the footer's copyright line) in its root, and the core renders it inside its own link or element, which keep the home link, its label, pinning and the swap with the section icon; the props types `LogoReplacementProps` and `FooterCopyrightReplacementProps` come from the package root. A file for an unknown point or one that is not an `.astro` component fails the build and `astro dev` with the file and the known points, the point names are a new API snapshot surface (`replacement-points.json`) where a removal is breaking, and the demo replaces the logo with a mark and its title.

### Changed

- **Breaking:** The default logo draws the layers of the site's brand SVG (`src/assets/brand/brand-logo.svg`, `src/assets/brand/menu-logo.svg`) instead of a fixed list of five fragment ids: every element right under the root `<svg>` that has an `id` is drawn by `<use>` in document order and the root's `viewBox` frames them, so the demo no longer renders three empty `<use>`; a brand file without a `viewBox` or without any top-level `id` fails the build with its path.
- A UI key that a locale gets from neither the core nor the site fails the build with the locale and the keys (`i18n (ru): missing keys: …`) instead of falling back to the English text.
- **Breaking:** The build and `astro dev` check the site's `src/theme/theme.css` against the token list the core ships in `api-snapshot/tokens.json`: an unknown token, a `--container-*` layout token (generated from `layout.*` of `site.yaml`) and a missing required token each fail with the file and the names. The Tailwind tokens the core reads (`--font-sans`, `--font-weight-*`, `--ease-out`, `--text-base` and others) are listed as `optional`, so a theme may override them; `pnpm check:api-snapshot` no longer checks the demo's theme, and the demo's theme drops the tokens nothing read.
- **Breaking:** The two colors of the placeholder favicon come from `theme.favicon.background` and `theme.favicon.foreground` of `site.yaml`, which default to the previous colors, so `site.theme.favicon` is a new required branch of `site.lock.yaml` and a site reruns `pnpm config:resolve`; the dark layer of the banner shade takes `--color-shade` from the theme, and `pnpm check:color-literals` now also finds hex colors and color functions in the frontmatter, markup and scripts of `.astro` files.

## [1.6.4] - 2026-11-12

### Added

- Core defaults for every behaviour field of `site.yaml`, so a site writes only its own data (`schemaVersion`, `origin`, `identity`, `content`, `privacy.controller`, `menu.items`, `social`, `seo.description`, `images.rights` and `images.watermark`) and the values where it differs from the core. An override merges into the defaults key by key, a written array or scalar replaces the default whole, a `moreDocs.<kind>` block is written whole, and `images.publicPath` defaults to `/media` unless `images.publicOrigin` is set; a file that writes every field stays valid with the same config, an unknown key still fails with its path, and `configDigest` keeps its bytes.

### Changed

- The `configDigest` of the image manifest hashes a projection of `config/images.yaml` that the core defines under a digest version instead of the parsed file as a whole, so a field the schema gains later reaches the digest only through a new digest version, while key order and defaults still do not affect it; digest version 1 keeps today's bytes, so no derivative is re-encoded.
- **Breaking:** The config the core reads is one tree, `site.yaml` at the site root with `schemaVersion: 2`: `src/config/site.yaml` moves there, and `src/config/seo.yaml` and `config/images.yaml` become its `seo` and `images` sections without versions of their own, read and validated in one pass. An old file left in place, the old `schemaVersion: 1` and an unknown key at any depth each fail with the file and the key path; `configDigest` keeps its bytes, so no derivative is re-encoded.
- **Breaking:** The core reads the site config only from `site.lock.yaml`, which the site commits next to `site.yaml`: `pnpm config:resolve [--site <dir>]` writes it from `site.yaml` and the core defaults as the strict effective config under `site`, with the version of each content collection under `collections`, so a new core default reaches a site only as a diff of its lock. The build and `astro dev` read the lock without comparing it with `site.yaml`, and `pnpm check:config-lock` (part of `pnpm check`) fails when the lock differs byte for byte from a fresh resolve; a missing lock, a missing or unknown key in it and an unsupported collection version each fail with the key path, while the effective config and `configDigest` stay the same.
- **Breaking:** `images.rights.source` and `images.rights.webStatement` of `site.yaml` are derived from `origin` when the site leaves them out (its host and the URL of its `/rights/` page), so the domain is written once instead of three times; a written value still wins, and resolve writes the derived values into `site.lock.yaml`, where `site.images.rights.source` and `site.images.rights.webStatement` stay required. A site whose values equal the derived ones may drop both lines with no other change: its lock and `configDigest` stay the same, so no derivative is re-encoded.
- The CI gate on breaking API changes also accepts a `**Breaking:**` entry in the `CHANGELOG.md` section of the repository version the pull request bumps to, so a story release that moves `[Unreleased]` into its version passes.

## [1.6.3] - 2026-11-07

### Added

- An ESLint preset in the core, `@picasso-ai/astrum-scena/eslint`, that lets a site import the core only through the entry points of its `exports`: deep imports, re-exports and dynamic `import()` of internal paths fail lint. The allowed list comes from the core's `package.json`, so a new entry point reaches the site without a config change; the demo is linted with it, and the packed demo build checks that every entry point resolves from the tarball, an internal path does not, and the installed preset tells them apart.
- The build fails when a site's MDX imports or re-exports core internals, by the same `exports` rule as the ESLint preset, since ESLint does not read `.mdx`.
- A snapshot of the core's public API in `packages/core/api-snapshot/`: the `exports` and their declarations, the schemas of the site files, the MDX components with their props, the Markdown directives with their attributes, the theme tokens, the i18n keys, the CLI commands and the public env names, each derived from the source the core reads; a check or a transform JSON Schema cannot express is recorded by a digest of its source, and any change of a transform is breaking. `pnpm check` fails when the snapshot drifts from the source and names each change as compatible or breaking; `pnpm api:snapshot` regenerates it. On a pull request, CI compares it with the merge base with `main` and requires an entry under `[Unreleased]`, marked as breaking, that names each breaking change.
- A version policy for the npm package of the core: until the first site adopts it the version stays `0.x`, a breaking release bumps the minor, a fix or a compatible feature the patch, and a site pins `~0.y.z`; from `1.0.0` it follows semver. `UPGRADING.md` describes each breaking release, keyed by the core's npm version, with an entry per breaking change: before and after, order, the writer versions and how to verify the result. `pnpm check` validates its structure; on a pull request CI requires an entry that names each breaking change of the API snapshot and fails a bump of the core's version that does not match its transitions.
- The `configDigest` of the image manifest, the object keys of derivatives and `translatedFromDigest` are pinned byte for byte on fixed inputs, since reusing derivatives and translations depends on them.

### Changed

- The package root `@picasso-ai/astrum-scena` exports only the integration; `INTEGRATION_NAME`, `SITE_ROOT_MODULE`, `coreRoutes` and `siteSourcesCss` are internal.
- **Breaking:** Every site file the core reads declares the shape it is written in with a required `schemaVersion`, checked before its schema: `src/config/site.yaml`, `src/config/seo.yaml`, the taxonomy files, `src/content/config/image-sets.yaml` and `src/content/featured/home.yaml` start at `1`, `config/images.yaml` renames its `version` to `schemaVersion: 2`, and the generated `images-public.json` and `images-release.json` carry `schemaVersion: 1`. A missing or unsupported version, as in a release manifest of another version, fails with the file and the versions the core reads; `configDigest` keeps its bytes, so no derivative is re-encoded.
- Every environment variable the core reads is declared public or internal in one list of the core, and the Markdown directives (with the attributes each parser accepts), the MDX components and the content collection paths are declared in one list each, which the code and the API snapshot share.

## [1.6.2] - 2026-11-02

### Added

- The core as an npm package, `@picasso-ai/astrum-scena`: an Astro integration that a site enables with one call in its config. Core files resolve from the package and site files from the site root, so the core builds from an installed tarball.
- A synthetic demo site that covers every route of the core in two locales, with procedural photos, albums and articles served from its own media. CI builds it from the `pnpm pack` tarball installed outside the workspace and runs the functional e2e and visual baselines against it.
- The image derivative engine in the core, with derivatives that a site can serve from its own `public/` directory.
- A release workflow for the core: a version bump of the packages in `main` publishes to npm, through trusted publishing without an npm token, every package version npm does not have yet, from the same `pnpm pack` tarball the demo installs; a version already on npm is skipped, so a re-run is safe. Until the repository goes public every run stops at `npm publish --dry-run`, and pull requests always do.

### Changed

- A document slide with `mediaSource: target` takes its hero photo from the cover of its entry in the reference locale; without a cover the build fails and names the document.

### Removed

- The test-only `/e2e-harness/` route and its build flags `PORTFOLIO_E2E`, `MORE_DOCS_E2E`, `IMAGES_E2E_MANIFEST` and `IMAGES_E2E_ORIGIN`; the core ignores them, and Gallery, MoreDocuments and touch input in the viewer are tested on the demo's own pages.

### Fixed

- The underline of the MoreDocuments heading stops at the block's edge instead of running toward the viewport edge on narrow screens.

## [1.6.1] - 2026-10-25

### Changed

- Choose public npm as the delivery channel for the core package (ADR-0016). A spike installed and updated trial packages from git tags, GitHub Packages and npm on the project's pnpm and Astro versions; npm lets sites install the core without accounts or tokens, and CI will publish releases through trusted publishing with provenance. `core` and `migrate-wp` share one version.
- Record what a packaged core integration needs: routes, content collections, MDX components, virtual modules and Tailwind `@source` work from an installed tarball; `@astrojs/react` stays a site dependency and the build's working directory must contain the output directory. The places where `variantCssPlugin` mixes package and site roots are listed for the extraction.

## [1.5.13] - 2026-10-24

### Fixed

- Contact messages reserve space for Telegram service text within a shared UTF-8 budget, and the form explains when a message is too long.
- Import boundaries consistently separate computation from I/O adapters across static and dynamic imports.
- Image publication validates ledger entries when reading and writing, rejecting invalid history before any R2 operation.
- Gallery geometry follows the theme's computed spacing, including customized gaps, without a separate numeric copy.

### Changed

- Define practical contracts for extracting the core, customizing it and upgrading sites.

## [1.5.12] - 2026-10-23

### Changed

- Navigation uses native Astro and browser code. Album, photo and article pages no longer load React for the menu, and page budgets now check JavaScript alongside CSS.
- English pages load Latin Ubuntu subsets; Cyrillic locales keep the full font files to preserve kerning. Language names follow the page language, and priority images no longer carry an async decoding hint.
- `pnpm check` runs independent groups in parallel while preserving all 17 checks and propagating failures and cancellation.
- Lighthouse checks the same ten URLs in five parallel groups, with three runs per URL, median assertions and the existing thresholds.
- CI looks up exact pass markers before starting Playwright containers or building the portfolio harness. Keys include build inputs, commands and the resolved Node version; failed or cancelled checks cannot record a pass.
- Playwright is upgraded manually together with `@playwright/test` and its visual baselines. Dependabot no longer tracks the image; its digest remains pinned and every copy is checked against the e2e workflow.

### Removed

- Unused Ubuntu `.woff` files; supported browsers use `.woff2`.

## [1.5.11] - 2026-10-21

### Security

- The build generates `_headers`. It contains a Content Security Policy (CSP) with no `'unsafe-inline'` for scripts: the theme script and other inline scripts are allowed by their hashes. It also sets `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `Permissions-Policy` and `nosniff`. The image host comes from the config and the Turnstile host from the form's single constant. `check:production-build` fails when the file is missing, a directive is absent or an inline script has no hash.
- Every action in CI is pinned to a commit SHA, and the Playwright image is pinned by digest. Dependabot updates both weekly. A test in `pnpm check` fails on an unpinned action or image.
- Telegram messages from the contact form are sent without link previews. `TURNSTILE_VERIFY_URL` and `TELEGRAM_API_BASE` take effect only with `CONTACT_E2E_MOCK_UPSTREAMS=1`; without that flag, production ignores them.

### Changed

- Hashed `/_astro/*` files and fonts are served with `Cache-Control: public, max-age=31536000, immutable`.

## [1.5.10] - 2026-10-20

### Added

- `check:code-comments` in `pnpm check` lexes comments in TypeScript, JavaScript, Astro, CSS, YAML and shell files across the repository (except `src/content`, `docs/` and vendored folders) and fails on Cyrillic, milestone references (`S<n>`, `EH-<n>`, `AD-<n>`) and the legacy theme name in a comment, and on the legacy class prefix anywhere in code; strings and YAML data are left alone.

### Changed

- Code comments in `src`, `scripts`, `functions`, `migration`, `e2e`, `config`, `.github` and the root configs are short English explanations of why, with stage and audit references dropped and stale claims corrected rather than translated; test names and CLI messages are in English too.

## [1.5.9] - 2026-10-19

### Added

- `check:css-layers` in `pnpm check` fails on CSS outside a cascade layer, an entry stylesheet without `layers.css` first, an unlayered inline `<style>` and a `global.css` that does not import the layout tokens into `layer(theme)`.
- CI checks the CSS weight of the home, album, photo and article pages against the site's page budget file with no tolerance, and builds the site with every variant family switched to show that `dist` holds exactly the selected variants.
- CI checks every commit message of a pull request; the allowed types (the Conventional Commits set) now sit in `AGENTS.md` beside the scopes.
- Gates check that `site.yaml` and `seo.yaml` are read only by the config loader, that the image descriptor path, manifest file name and reader and the sha256 format are each declared once, and that no Playwright config builds the site.

### Changed

- Lighthouse asserts on the median of three runs instead of the best, Playwright fails a CI run on a test that passes only on retry, the portfolio and gallery baselines are compared in CI, and `pnpm test` fails when it finds no tests; the Lighthouse pass is re-measured after a change to `ci.yml` or `.nvmrc`.
- The fact-check ledger and coverage checks run in CI; a stale digest or a document without a fact-check only warns, and the review packet no longer shows freshness.
- The `migration/` and `src/lib` → `src/components` boundaries also catch dynamic `import()`, and `migration/data` paths and root tool configs fall under the migration boundary; the image-site fixture follows the main lint style.
- `commit-msg` rejects an unlisted type, a malformed header and AI attribution in any trailer or "made/generated with" phrase; `check:local-paths` catches home, Windows, escaped, Homebrew and temp-folder paths in files of any size; the production build scan covers every text file and checks the image host on every page.
- e2e tests take the viewer copyright from the image config instead of a literal.

## [1.5.8] - 2026-10-18

### Changed

- Unlisted documents, albums and photos (a photo inherits it from its album) stay reachable by URL but leave the sitemap and carry `noindex,follow`; `check:seo-artifact` fails when one is indexed, listed in the sitemap or not built, and checks that the image rights URL points at this site's `/rights/` page (ADR-0010).
- The migration suite is green again and runs as its own CI job; the import tests keep the hand-written legal texts in their sandboxes.
- A push to `main` skips the checks a PR already passed only when that PR run tested the exact tree that landed, recorded as a `tested-tree-*` artifact; anything unproven runs everything (ADR-0015).
- `src/lib` no longer imports `src/components`, and lint enforces it: the image `sizes` and viewer-data modules moved to `src/lib/portfolio/`, and the home slider receives its featured set from the route instead of reading the file itself.
- Unit tests build their site config inside the test; only the loader test reads the real `site.yaml`, and only for the schema and required keys.
- The language switcher and theme toggle use sibling stylesheets instead of scoped `<style>` blocks; the toggle icons are renamed `theme-toggle__icon--*`.

### Fixed

- With reduced motion requested, hovered or focused menu labels and the sticky header's logo swap no longer move.
- A hovered home slider arrow now reaches full opacity instead of staying at 0.55.

## [1.5.7] - 2026-10-16

### Changed

- The hero slider's legacy class names are renamed to `hero-swiper` and `hero-section`; no legacy-prefixed names remain in code.
- Every CSS comment is a short English note on why, or is gone: stage labels, audit references and legacy theme file paths are removed, as are the Russian header of the generated layout tokens file and the legacy names in the menu animation comments.
- The CSS rework is complete: against the measurement before it, CSS per page is down 52 % raw on the home page, 36 % on an album, 37 % on a photo and 30 % on an article.

## [1.5.6] - 2026-10-16

### Changed

- Every menu hover effect, top-section pattern, album page layout and compact card look (`title-strip`, `title-slide`) has its own stylesheet, and a page loads only the variants `site.yaml` selects: the menu effect, the pattern, the album layout plus any album's own `layout`, and every card look chosen by `portfolio.card` or `moreDocs.*.card`. Changing a value in the config changes the loaded file without a code edit.
- CSS per page drops further on pages with these components: an album from 18.2 to 17.0 KB gzip, a photo from 17.6 to 16.6 KB and an article from 20.7 to 19.5 KB; the home page, which renders none of them, is unchanged.
- E2E harness builds (`PORTFOLIO_E2E`, `MORE_DOCS_E2E`) load every variant, because the harness renders unselected ones; production builds are unaffected.

## [1.5.5] - 2026-10-16

### Changed

- Portfolio cards and their layouts, the album list, album intro and album grid, MoreDocuments, the course badge, the PhotoSwipe viewer, the photo page, the contacts page and the contact form each own a stylesheet, imported by the component or route itself into the `components` layer; route stylesheets live in `src/styles/pages/`. `components.css` is gone, and `global.css` keeps only the layer order, Tailwind, the theme, layout tokens, base rules and prose, including the Callout, Note and Links blocks that remark renders inside it.
- A page loads only the CSS of the components it renders: against the baseline measured before the CSS rework, CSS per page drops from 23.4 to 12.4 KB gzip on the home page, from 22.8 to 18.2 KB on an album and from 23.8 to 20.7 KB on an article.
- The Note block's root rule and the Wrap Around link rule use zero-specificity `:where()`, so the rules that override them win whichever order the stylesheets load in after a View Transition.
- Social link items carry a `social-icon--<id>` modifier instead of the bare id as a class, so a link id no longer collides with page classes such as the contacts layout's `.contacts`; the icons stay in place.
- These stylesheets also bypass Tailwind's lightningcss step, so the course badge's `-webkit-backdrop-filter` (Safari before 18) is written by hand, and `color-mix()` fallbacks are dropped there as in 1.5.4.

## [1.5.4] - 2026-10-16

### Changed

- Header, navigation, fullscreen menu, hero slider, top section, footer, social icons, the text page hero and both page layouts each own a stylesheet next to the component, imported by the component itself into the `components` layer; the shared `components.css` keeps only page components and prose until they are split too.
- A page now loads only the shell CSS of the components it renders: the hero and fullscreen-home rules ship with the home page alone, the header, footer and top section with inner pages alone; this saves about 7 KB raw on inner pages and 18 KB on the home page.
- Shell component stylesheets no longer pass through Tailwind's lightningcss step, so their `color-mix()` rules lose the `@supports` fallbacks Tailwind added (about 6 KB raw per page); browsers without `color-mix()` (Safari before 16.2, Chrome before 111) — below Tailwind v4's own targets — get no fallback colors there.
- CI on a merge into `main` skips the Playwright jobs, Lighthouse and `pnpm check` when the merged tree is identical to a PR head whose CI run passed; the build and the live image and portfolio checks still run, and any other case runs every check.
- A new push to a PR cancels that PR's stale CI run; runs on `main` are never cancelled.
- The contact-form and MoreDocuments E2E suites run in one CI job, `contact-more-docs-e2e`, to share one container start.

## [1.5.3] - 2026-10-15

### Changed

- All CSS lives in cascade layers whose order — `properties, theme, base, vendor, components, utilities` — is declared once in `src/styles/layers.css`; every stylesheet entry point imports it first, so the order holds whichever chunk the browser parses first.
- Swiper and PhotoSwipe styles load into the `vendor` layer, so site rules beat them by layer order instead of doubled selectors such as `.pswp.pswp`, which are gone; the slider controls keep their place after a View Transition round trip.
- Component rules sit below Tailwind utilities, so a utility class in markup now overrides a component rule; the published site renders unchanged.
- `pnpm css:coverage` counts unlayered rules and the `components` layer as own CSS; Tailwind's `theme`, `base` and `utilities` layers and the `vendor` layer are not counted.

## [1.5.2] - 2026-10-14

### Added

- `pnpm check:color-literals` (part of `pnpm check`) fails on any color literal — hex, color function or named color — in CSS or an Astro `<style>` block outside the theme file.

### Changed

- Fonts, design tokens, the light-theme overrides and every component palette (Callout, Note, contact form, image frame) live in one theme file, `src/theme/theme.css`; component rules reach colors only through its tokens, so a site restyles by replacing that file. Alpha variants are mixed in place from a few base tokens, so 112 color values became 54 tokens.
- `/status/` badges and freshness labels use Tailwind's built-in palette, so their hues shift slightly.
- Shared CSS grows by about 1 KB gzip, because Tailwind adds a fallback to every `color-mix()`; the growth is accepted and the CSS baseline is updated.

### Fixed

- The header logo scroll-fade and the top-section parallax work again in production builds: the CSS minifier no longer merges `animation-timeline` into the `animation` shorthand, which Chrome rejected.

## [1.5.1] - 2026-10-14

### Added

- `pnpm css:coverage` builds the site for the base `site.yaml` and for variant configs covering every enum, boolean and literal value of the schema, opens every page in the browser in both themes, at every viewport and with the menu, slider and viewer open, and reports which own CSS rules never match any element. It also prints the CSS weight of the typical pages. It builds, so it is not part of `pnpm check`.
- A CSS baseline records the weight of the home, album, photo and article pages, before and after the dead-rule cleanup, for the rest of the CSS rework.

### Changed

- `/status/` no longer assumes the site's locales: its English copy carries an explicit `lang="en"` while the header, footer and `<html lang>` stay on the default locale, translation freshness labels name the translated locales from `content.locales`, and document titles keep their own language.
- On a one-locale site `/status/` lists documents under "Documents" without the freshness column, translation summary or Translations metric; `build:one-locale` fails if any of them remains.

### Removed

- Five `/status/` tone classes (`fg`, `note`, `heading`, `published`, `review`) that no markup emitted.

## [1.4.5] - 2026-10-14

### Added

- `menu.items` in `site.yaml` sets the navigation shared by the desktop menu, the overlay panel and the footer: section segment, a label per locale and an optional section icon. Removing an item hides the section from navigation; its routes keep working.
- `identity` in `site.yaml` sets the site title, the fallback photo alt text and the copyright holder per locale, plus the copyright start year.
- The `/rights/` text lives in `src/content/legal/rights.<locale>.md`, one section per active locale; `pnpm content:validate` requires it in every locale.
- Config labels must cover every locale in `content.locales`; a missing one fails with its key path.

### Changed

- Social links in `site.yaml` are a single record shape (`id`, `href`, `label`, `icon`, `hover`). Icons load by name from `src/assets/icons/social/`, so a new network needs no component change, and the hover colour comes from the config.
- Footer privacy links on language-neutral pages follow `content.locales`, reference locale first.

### Removed

- `menu.courses`, the hardcoded `navItems` list and the per-network hover CSS rules.
- Per-network host pinning for social links; external links must be https.
- Owner name and site title from the i18n dictionaries, and the temporary locale-literal ESLint exemption for `rights.astro` and `site-footer.astro`.

## [1.4.4] - 2026-10-14

### Added

- `origin` in `site.yaml` sets the canonical production origin (https, no path or trailing slash). Astro `site`, canonical and hreflang URLs, the sitemap, `/status/`, the SEO artifact gate and `smoke:prod` read it from there.
- `factcheck.ownHosts` in `site.yaml` lists the author's former hosts. Together with the origin host and the `www.` variants of each, they mark fact-check links as self-links.
- The SEO artifact gate and `build:one-locale` require the first rule of `_redirects` to send the root to the default locale.

### Changed

- `robots.txt` and the root redirect `/ → /<default locale>/` in `_redirects` are written at build time from the config. `public/robots.txt` is removed, and `public/_redirects` keeps only the legacy rules.

### Removed

- The hardcoded `SITE_ORIGIN` constant and the fact-check own-domain list.

## [1.4.3] - 2026-10-14

### Added

- `pnpm build:one-locale` builds the site from `site.yaml` narrowed to its reference locale into a scratch directory. It fails if any page, sitemap URL or language switcher of another locale remains, or if a published route of the kept locale is missing. CI runs it after the production build.
- The `SITE_CONFIG_PATH` environment variable points the config loader at another `site.yaml`. It defaults to `src/config/site.yaml`.

### Changed

- Pages live once under `src/pages/[locale]/` instead of the duplicated `en/` and `ru/` trees. Each route builds its static paths from `content.locales`, and the published URLs are unchanged.
- The privacy link on the contacts page is built from the page locale.
- The language switcher renders nothing on a one-locale site.
- The ESLint ban on `'en'`/`'ru'` literals now covers the page tree. Only `rights.astro` and `site-footer.astro` stay exempt until 1.4.5.

## [1.4.2] - 2026-10-13

### Added

- `content.locales` in `site.yaml` lists the site's active locales. The order is the language switcher order, and the first one is the default locale (x-default, Astro `defaultLocale`). `content.referenceLocale` must be one of them.
- `LOCALE_CATALOG` in `src/config/locale-schema.ts` declares each supported locale once, with its switcher label, `og:locale` and Intl tag.
- ESLint bans `'en'`/`'ru'` literals in live code outside `src/config`, tests and the smoke/e2e runners. The per-locale page trees, `rights.astro` and `site-footer.astro` are exempt until 1.4.3 and 1.4.5.

### Changed

- Astro `i18n`, the sitemap filter, hreflang alternates and x-default, `og:locale`, the SEO artifact check, the redirect contract and `/status/` take their locales from the config instead of hardcoded `en`/`ru` lists.
- Translation pairs are built from the reference locale and each other active locale. `content:translation-marker` labels each line with the translation locale.
- `translatedFromDigest` is forbidden on the reference locale instead of being allowed only on `en`. The rule moved from the content schema to `content:validate` (code `reference-marker`), and `locale-gap` now requires every active locale.

## [1.4.1] - 2026-10-13

### Changed

- `lib` modules no longer import the site config singleton. Content loaders, banners, document cards, MoreDocuments, the photo page and `/status/` take the config section they need as an argument, and routes pass `site`.
- The variant lists (card presentations, album and portfolio layouts, card grid ratios, footer curve shapes) moved to `src/config/variants.ts`, so `src/config` no longer imports `lib`.
- ESLint bans `src/lib` from importing `config/site`, and from importing `config/loader` outside tests. It also bans `src/config` from importing `lib`.
- The banner assignment check is cached per `banners` object and reference locale instead of once per module.

### Removed

- `src/lib/cards/presentation.ts`; the card presentation list now lives in `src/config/variants.ts`.

## [1.3.3] - 2026-10-13

### Changed

- The `translatedFromDigest` marker is written only by `content:translation-marker:confirm --document <collection>/<key> --write`. `/translate` calls it after writing a translation instead of adding the digest by hand. The CLI is now `scripts/translation-marker.ts`.
- Every write to `data/factcheck/ledger.yaml` goes through `scripts/factcheck.ts`, which has four modes. `extract` seeds the ledger. `merge` merges a researcher's findings by `(kind, raw)`, keeps each finding's id, and keeps the owner decision only while the recommendation is unchanged; a changed recommendation goes back to `open`. `researched` stamps the research date and source digest, replacing `extract --restamp`. `decide` records owner decisions. `/factcheck` calls these instead of editing the YAML and running prettier. A failed run leaves the ledger untouched.

### Removed

- The one-off `content:translation-marker:stamp` backfill and its mode.

## [1.3.2] - 2026-10-12

### Changed

- The image release descriptor (`src/generated/images-release.json`) and cache-release manifests are read only through `src/lib/images/release.ts`: `loadReleaseDescriptor` and the new `loadManifestFile`. Image CLIs, gates, the catalog and migration go through them, and the descriptor path, the releases folder and the manifest filename are each declared once.
- A pre-v3 release manifest gets the same "not renderable by the v3 site runtime" error wherever it is read. Other manifest read errors name the file. Activation reports why the current descriptor could not be loaded.
- The sha256 format is declared once, in `src/lib/sha256-schema.ts`, and imported by the content, image, fact-check and migration schemas.

## [1.3.1] - 2026-10-12

### Changed

- `src/config/site.yaml` and `src/config/seo.yaml` are read only by `src/config/loader.ts`, straight from disk instead of through Vite `?raw` imports. The site, CLIs, gates, migration and e2e all go through it, and each file's path is declared in one place.
- The `en`/`ru` locale schema is declared once, in `src/config/locale-schema.ts`, and imported by the config, content and contact-form schemas.
- In `astro dev`, editing either config file reloads the open page automatically, as before.

### Removed

- `scripts/lib/site-content.ts` and `scripts/lib/site-layout.ts`; their callers load the section they need through the shared loader.

## [1.2.6] - 2026-10-12

### Fixed

- Fact-check end notes (`:::note{claim=…}`) may sit before or after an article's trailing `:::links` blocks: `/factcheck-apply` edits them in place instead of stopping, a new note block goes before the links, and translation freshness ignores the notes in both layouts.

## [1.2.5] - 2026-10-12

### Changed

- WordPress migration tests run in their own vitest project, `pnpm test:migration`, and are no longer part of `pnpm test` or `pnpm check` (`pnpm check` went from ~47 s to ~35 s); `/import-wp` runs them, followed by `content:fixture:check`, before any re-import and stops if either is red.
- ESLint enforces import boundaries: `src`, `scripts`, `functions`, `e2e` and `astro.config.mjs` may not import `migration/`, and `src` may not import `scripts/`.

### Removed

- `fixture-drift.test.ts`, which only re-ran `content:fixture:check`.

## [1.2.4] - 2026-10-12

### Changed

- WordPress migration code, CLIs, their tests and import data moved into one `migration/` zone (`migration/lib`, `migration/scripts`, `migration/data`): the WordPress, qTranslate, importer, decision, translation and errata modules from `src/lib`, the migration scripts and their `scripts/lib` helpers, and the migration and legacy data. `data/` now holds only live data (`factcheck/`, `images/`), and no route or live script imports the migration zone.
- `pnpm` command names are unchanged and point at `migration/scripts/`; `/import-wp` uses the new paths.
- `content:translations:draft` writes its reading files to the ignored `.cache/translation-drafts/`.

### Fixed

- `content:import:fixture:check` copies `src/config/site.yaml` into its temporary root and passes again.

### Removed

- The empty translation drafts folder under `docs/` and its `.gitignore`, `.prettierignore` and `lint:md` exclusions.

## [1.2.3] - 2026-10-12

### Changed

- `images:colormode` writes the detected `colorMode` straight into `src/content/photos/<id>.yaml`, inserting one line and leaving the rest of the file untouched; an existing value is kept as an authored override (ADR-0010), and a mismatch with detection is printed as a warning.
- The importer no longer fills `colorMode` from a sidecar; `/import-wp` runs `images:colormode` after its validation phase and checks that the masters/archive roots are set before the destructive write.

### Removed

- The `src/generated/photo-colormode.json` sidecar and the `check:colormode` gate in `pnpm check`.

## [1.2.2] - 2026-10-10

### Changed

- Live data now sits in folders named by its reader: the master registry moved to `data/images/masters.jsonl` (the fixture registry follows as `tests/fixtures/images/masters.jsonl`), and the fact-check ledger to `data/factcheck/ledger.yaml`; `/add-album`, `/process-images`, `/factcheck` and `/factcheck-apply` use the new paths.
- The registry and the ledger are each read through one loader with the path defined in one place; `content:factcheck:extract` recreates the ledger folder when it is missing.

## [1.2.1] - 2026-10-10

### Changed

- Fact-check (`/factcheck` and `content:factcheck:extract`/`review`/`check`) reads the reference-locale documents in `src/content` instead of the legacy WordPress corpus and migration decisions, so it checks the published text; every article and page is in scope, including ones without a legacy id.
- A fact-check digest covers the reference-locale title and body without the managed `:::note` region; `content:factcheck:extract --restamp <key>` refreshes it after re-research, and `/factcheck` runs `extract` first so a document edited since its research is picked up again.
- CI fails before the production build when the public Turnstile site key is not configured, instead of shipping a contact form that always answers "challenge".
- ESLint ignores inline config comments (`noInlineConfig`), so an `eslint-disable` no longer suppresses an error and fails `lint:ci` as a warning.

### Removed

- The unused `appliedAt`/`appliedDigest` markers and the `applied` count in the fact-check ledger and review packet.

## [1.1.8] - 2026-10-09

### Changed

- CI skips a Playwright job (`e2e`, `contact-e2e`, `images-e2e`, `portfolio-e2e`, `more-docs-e2e`) when the same build with the same test inputs already passed it, so commits that touch only documentation run no Playwright at all; a skipped job stays green and states the reason in the run summary, and the live image and portfolio checks always run.
- The five Playwright jobs share one reusable workflow, and their reports are now named `<job>-playwright-report`.

## [1.1.7] - 2026-10-09

### Changed

- Content-ops skills no longer forbid `pnpm build`: after a run that changed files they build the site before reporting done, like any other change; `/validate` keeps its own build order after owner confirmation.
- PR labels follow one documented scheme: at least one type label and every matching risk label.

## [1.1.6] - 2026-10-09

### Added

- A `commit-msg` hook rejects AI attribution (a `Co-authored-by` trailer naming Claude, Codex, Cursor, Copilot, Gemini or another AI tool, and "Generated with…" lines) and scopes outside the list in `AGENTS.md`, which it reads as the single source; commits without a scope, merges, reverts and fixups pass.

## [1.1.5] - 2026-10-09

### Changed

- ESLint enforces the code style that used to live only in agent instructions: `type` instead of `interface`, comments that start lowercase (acronyms, CamelCase names, ids and continuation lines are left as written), named exports outside tool configs, and no `enum` or JSDoc; existing code was brought in line in one autofix pass.
- `@ts-ignore` and `@ts-expect-error` without an explanation are lint errors, and an unused `eslint-disable` directive is now an error instead of a warning.
- Agent style instructions drop every rule the linter or Prettier now checks.

## [1.1.4] - 2026-10-09

### Changed

- CI builds the production site once, in the `gates` job, and shares that `dist` as an artifact with e2e, contact E2E, Lighthouse and the portfolio live smoke, so later jobs test exactly the build that passed the checks; only the portfolio and MoreDocuments harness jobs still build, under their own E2E flags.
- Lighthouse runs only on a build it has not already passed: `gates` fingerprints `dist` (leaving out `status/`) and a cached pass for the same fingerprint, Lighthouse config and lockfile skips the measurement.
- Playwright configs share one base and only start a preview; `pnpm test:e2e` and the harness runners build `dist` before testing.

### Fixed

- Builds are reproducible: the gallery script loads from one fixed place instead of following whichever gallery finishes rendering first.

## [1.1.3] - 2026-10-09

### Changed

- CI now runs every gate in `pnpm check`, including the page-route, local-path, image-policy, image-public-config, color-mode and layout-token checks that only the local pre-push hook used to run; the pre-push hook is removed.

### Removed

- Tests that duplicated a gate or pinned the current corpus: the repository content snapshot test and the layout-token check against the real `site.yaml`.

## [1.1.2] - 2026-10-09

### Fixed

- Script headers, the content-model doc and ADR-0011 no longer claim that the on-demand migration checks run in `pnpm check` or CI, or that `/factcheck-apply` writes applied markers or refreshes the fact-check digest.
- Code comments no longer name the retired image domain or the site domain.

## [1.1.1] - 2026-10-08

### Removed

- Unused code, one-off scripts and their package aliases (`content:import:check`, `test:e2e:update`, `images:manifest:init`, `images:contact-sheet`, the factcheck digest and apply-plan helpers), plus image assets that no page used.

### Changed

- Image descriptor checks now suggest commands that exist, and docs and agent skills no longer point at removed tools.

## Before 1.1.1 (2026-07-19 to 2026-09-29)

The `0.x` line built the engine as a single photography site, migrated from WordPress, before the cleanup that started at 1.1.1. In summary:

- Astro with React islands, strict TypeScript and Tailwind v4; ESLint, Prettier, Vitest, markdownlint and Husky; a CI workflow for typecheck, lint, format, markdown, tests and build.
- A bilingual site shell: header, desktop navigation, a fullscreen menu overlay, footer, a route-aware language switcher, a no-flash theme toggle with a dark default, and design tokens with self-hosted Ubuntu and fluid typography.
- A fullscreen home with a Swiper hero slider fed from a featured-content file and the active image manifest, with a pause contract between the menu and the slider.
- A WordPress migration pipeline: dump and WXR parsing, qTranslate splitting, normalization into intermediate data, master-image matching, and a fail-closed importer into Content Collections with ownership hashes, rollback and drift checks.
- A photo taxonomy of top-level categories, albums referencing photos, a place hierarchy and controlled tags, with Recent and Favorites slices derived from the data.
- An image platform: a `sharp` and ExifTool derivative pipeline with an AVIF/WebP width ladder, role-based watermarks, dominant-color placeholders, stripped sensitive metadata, content-hashed releases, a deterministic manifest, publication to R2 and live integrity checks.
- Portfolio, album and photo routes with masonry, justified, square and rect layouts and a PhotoSwipe viewer; articles, pages and courses with MDX blocks (Callout, Wrap Around, galleries, `:::links`, `:::note`) and related-document sections.
- A Turnstile-protected contact form handled by a Cloudflare Pages Function with shared client and server validation and delivery to Telegram.
- A working mode where authored Markdown and MDX in `src/content` are the edit surface: `content:validate`, translation markers, fact-check and errata workflows, and content-ops agent skills.
- A noindex `/status/` page with publication and translation freshness, a bilingual privacy policy, SEO descriptions with a post-build artifact check, and a production smoke test.
- Release gates: Playwright e2e and visual snapshots, contact-form E2E, and release-blocking Lighthouse.
