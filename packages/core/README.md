# @picasso-ai/astrum-scena

The Astrum Scena core: an Astro integration that a site enables with one call in `astro.config`.

```js
import { defineConfig } from 'astro/config'
import astrumScena from '@picasso-ai/astrum-scena'

export default defineConfig({ integrations: [astrumScena()] })
```

and with one line in `src/content.config.ts`:

```ts
import { defineCoreCollections } from '@picasso-ai/astrum-scena/collections'

export const collections = defineCoreCollections()
```

The integration adds the routes, content collections, MDX, Markdown directives, sitemap, site files,
Vite plugins and CSS. The site declares the peer dependencies itself: `astro`, `react`, `react-dom`
and `@astrojs/react`.

Two roots: the core's routes, components and styles resolve from the installed package; the site's
files resolve from the Astro root (`config.root`), never from the working directory:

- `site.yaml`, the one config tree, with its `seo` and `images` sections, and `site.lock.yaml`, the
  effective config resolved from it;
- `src/content/**` (collections, `config/` taxonomy, image sets and place zones,
  `featured/home.yaml`);
- `data/images/` (the master registry and the publication ledger, read by the image commands);
- `src/generated/` (image release, public image config, layout tokens);
- `src/theme/theme.css`, `src/assets/brand/*.svg`, `public/` (fonts, social image);
- `package.json` (the version on `/status/`).

## Installation

A site is an Astro project (`"type": "module"`, Node 24 or later) that installs the core from npm
with its peer dependencies; while the core is `0.x`, a site pins the exact version (see Versions),
where `0.y.z` stands for the current release of the core:

```sh
pnpm add --save-exact @picasso-ai/astrum-scena@0.y.z astro react react-dom @astrojs/react
```

1. Enable the integration in `astro.config.mjs`. The integration owns `site` and `i18n`, which come
   from `site.yaml`, so the Astro config sets neither:

    ```js
    import astrumScena from '@picasso-ai/astrum-scena'
    import { defineConfig } from 'astro/config'

    export default defineConfig({ integrations: [astrumScena()] })
    ```

2. Declare the content collections in `src/content.config.ts` with one call:

    ```ts
    import { defineCoreCollections } from '@picasso-ai/astrum-scena/collections'

    export const collections = defineCoreCollections()
    ```

3. Write `site.yaml` at the site root with the site's own data (see Site config; the demo's
   `site.yaml` is a complete example), then resolve it into `site.lock.yaml`, which the build reads,
   and commit both:

    ```sh
    pnpm exec astrum-scena config resolve
    ```

4. Install the core's content skills, their agents, the managed block of `AGENTS.md` and the configs
   that extend the presets (see Skills and presets); rerun it after every upgrade of the core:

    ```sh
    pnpm exec astrum-scena install
    ```

5. Create the theme `src/theme/theme.css`, which defines every `required` token of `tokens.json`
   (see Public API), and write the layout tokens `src/generated/layout-tokens.css` from `layout.*`;
   the core's global stylesheet imports both, so the build fails without them:

    ```sh
    pnpm exec astrum-scena layout-tokens
    ```

6. Alias the commands the site uses in its package scripts (`"check:site": "astrum-scena check"`),
   then build with `astro build`. The optional peers (`prettier`, `@aws-sdk/client-s3` and the ESLint
   plugins) are added only by a site that runs the commands needing them.

## Commands

The package installs the `astrum-scena` bin, compiled JavaScript that Node runs from `node_modules`
with no build step. Every command works on one site, whose root `--root <dir>` names (the current
directory by default; a directory without `site.yaml` fails with its path), and reads the core's own
sources from the installed package:

- `astrum-scena config resolve` writes `site.lock.yaml` from `site.yaml` (see The lock);
- `astrum-scena install` puts the core's content skills into `.agents/skills/` and `.claude/skills/`
  (once when one links to the other), their agents into `.claude/agents/` and `.codex/agents/`, the
  managed block of `AGENTS.md` and the configs that extend the presets (see Skills and presets);
- `astrum-scena layout-tokens` writes `src/generated/layout-tokens.css` from `layout.*`;
- `astrum-scena check` runs every gate of the site files in turn and fails if any fails, and
  `astrum-scena check <gate>` runs one: `config-lock` (the lock is a fresh resolve of `site.yaml`),
  `layout-tokens` (the generated tokens match `layout.*`), `color-literals` (no color literal
  outside the site's theme file), `css-layers` (every rule in a cascade layer, every entry stylesheet
  declaring the order first), `pages` (no test file under the core's, a module's or the site's
  `src/pages/`), `image-files` (the derivatives a site serves itself match its release),
  `images-policy` (the release descriptor is canonical, current with the `images` section and
  within the width ladder), `images-public-config` (`src/generated/images-public.json` is a fresh
  projection of it), `place-gps-bounds` (the optional place zones name only existing places),
  `content` (the content parses against its schemas and holds together: references, the locales of
  the lock, the legal texts, no `class` in a text and no content of a module the lock leaves
  disabled; an integrity failure names its error code and the entry, the others name the file) and
  `factcheck` (the optional fact-check ledger parses, has an entry only for a reference-locale
  document and no blocking issue, and `data/factcheck/review.md` is its projection; a stale digest
  or a document without an entry only warns), `skills` (the core's skills and agents in the site
  are the copies of the installed core with its version stamp; a site without any passes) and
  `core-version` (every `uses:` of the site's `.github/workflows/*.yml` that runs the core's
  `site.yml` is pinned to a 40-hex commit SHA with a `# v<version>` comment naming the installed
  core, and with `CI=true` the core is installed under the site's `node_modules`, not linked from
  outside it by `pnpm link`, unless `package.json` takes it from a `workspace:`; a site without
  such a reference passes the first half). The SHA is not matched against the tag, and the skills
  stamp is the gate `skills` alone. Each gate holds one contract and names who writes the files it
  pins — a command of the bin or the site's owner — in the registry `CONTRACTS` of the bin;
- `astrum-scena content translation-marker check` reports each translation of `articles`, `pages`
  and the document collections of the enabled modules as `current` or `needs-review` against the
  `translatedFromDigest` it carries; it is advisory and always exits 0 once the documents parse;
- `astrum-scena content translation-marker confirm (--document <collection>/<key>… | --all)
[--write]` plans the markers of the selected translations and, with `--write`, inserts or
  refreshes them and formats the file with the site's prettier config, so the body of a
  prettier-clean file stays as it was; `--document` may be given more than once;
- `astrum-scena content translation-marker compute --key <key>` prints the digest of the
  reference-locale body of one document;
- `astrum-scena content factcheck extract` seeds the fact-check ledger `data/factcheck/ledger.yaml`
  with every reference-locale document of `articles`, `pages` and the enabled modules and every URL
  of its body, keeping what the ledger holds (a link to the origin or to a host of
  `factcheck.ownHosts` is a self-link); `--check` writes nothing and lists the gaps as warnings;
- `astrum-scena content factcheck merge --key <key> --findings <file> [--date <yyyy-mm-dd>]` merges
  a researcher's JSON array of findings (a path from the current directory) into one document,
  reopening a finding whose recommendation changed; `--date` is today by default;
- `astrum-scena content factcheck researched --key <key> [--date <yyyy-mm-dd>]` stamps a document as
  researched against its current text;
- `astrum-scena content factcheck decide --key <key> --set <id=status>…` records the owner's
  decisions (`open`, `accepted`, `rejected`, `deferred`);
- `astrum-scena content factcheck review` writes the review packet `data/factcheck/review.md` from
  the ledger; the writing fact-check commands validate the whole ledger before replacing it and
  format both files with the site's prettier config;
- `astrum-scena images build [--masters <dir>] [--archive <dir>] [--release <id>] [--photos <ids>]`
  cuts the derivatives of the photos (every photo without `--photos`) from their masters into the
  ignored `.cache/images/releases/<id>/` (the UTC time without `--release`), with the rights in their
  XMP, and warns when the GPS of a master proposes another place than the photo's `placeId`;
- `astrum-scena images check-derivatives [--release <id>]` checks the files of a release against its
  manifest, their rights and privacy metadata included (without `--release`, the release the active
  descriptor was taken from);
- `astrum-scena images activate --release <id>` switches `src/generated/images-release.json` to a
  checked release, and `--recover` finishes or rolls back an interrupted activation; it writes only
  the descriptor;
- `astrum-scena images colormode [--masters <dir>] [--archive <dir>]` writes the `colorMode`
  detected from each master into a photo that has none;
- `astrum-scena images ladder-report --release <id> [--compare <id>] [--pixels]` reports the width
  ladder of a release, compares it with another and, with `--pixels`, replays every derivative from
  its master;
- `astrum-scena images public-init` writes `src/generated/images-public.json`;
- `astrum-scena images sync --release <id> [--dry-run]` uploads the derivatives of a checked release
  that the bucket lacks, verifies every object and appends the release to
  `data/images/publication-ledger.jsonl`; every local check runs before the first request, an object
  already in the bucket with other bytes aborts the run, and `--dry-run` stops at the upload plan;
- `astrum-scena images prune [--release <id>]` lists the bucket and reports the objects that neither
  the release descriptor nor, with `--release`, that release references; it deletes nothing;
- `astrum-scena images check-live [--release <id>]` checks every object of the active release
  descriptor (or of a release before its activation) in the bucket and through `publicOrigin`, with
  immutable caching; an inactive descriptor with an empty manifest passes without reading a secret;
- `astrum-scena --help` lists them with their options.

The masters and the year-organized archive live outside the site: an option names them, or
`IMAGES_MASTERS_ROOT` and `IMAGES_ARCHIVE_ROOT` in the environment or in the site's gitignored `.env`
(read from the site root, the process environment first). The master registry is
`data/images/masters.jsonl`, whose first line is `{"schemaVersion":1}`, followed by one row per
master; the image commands share a lock under `.cache/images/`. `exiftool-vendored`, a dependency of
the core, writes and reads the XMP and runs on Perl, which macOS and Linux have.

The bucket commands (`sync`, `prune`, `check-live`) work on a site whose `images.publicOrigin` serves
the derivatives from a Cloudflare R2 bucket. They read `R2_IMAGES_ACCOUNT_ID`,
`R2_IMAGES_ACCESS_KEY_ID`, `R2_IMAGES_SECRET_ACCESS_KEY` and `R2_IMAGES_BUCKET` the same way as the
roots, never print their values and fail naming the ones missing; `prune` and `check-live` open the
bucket read-only. They need `@aws-sdk/client-s3`, an optional peer of the core that a site installing
them adds itself (`pnpm add -D @aws-sdk/client-s3`); without it they fail asking for it, and no other
command loads it.

The content commands that write (`content translation-marker confirm --write` and every
`content factcheck` command but `extract --check`) format the file with the prettier config that
applies to it in the site, and the gate `factcheck` formats the review packet it compares the same
way. They need `prettier`, an optional peer of the core that the site adds itself
(`pnpm add -D prettier`); without it they fail asking for it (the gate only when the site has a
ledger), and no other command loads it.

A site calls them from its package scripts (`"check:site": "astrum-scena check"`), as the demo does.
A failure names the file and the command that fixes it; an unknown command exits with 2 and the list
of commands, an unknown option with 2 and the options of its command.

## CI

The core ships the CI of a site as the reusable workflow `.github/workflows/site.yml` of its
repository (the one `repository.url` of the package names). A site calls it from its own workflow,
pinned to the commit of the release its lockfile installs, with the version as a comment, and passes
each secret by name:

```yaml
# .github/workflows/ci.yml of the site
on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

permissions:
    contents: read

jobs:
    site:
        uses: <owner>/<repo>/.github/workflows/site.yml@<40-hex SHA> # v<version>
        permissions:
            contents: read
            deployments: write
        with:
            deploy: true
            public-env: |
                PUBLIC_TURNSTILE_SITE_KEY=${{ vars.PUBLIC_TURNSTILE_SITE_KEY }}
        secrets:
            CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
            CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
            R2_IMAGES_ACCOUNT_ID: ${{ secrets.R2_IMAGES_ACCOUNT_ID }}
            R2_IMAGES_ACCESS_KEY_ID: ${{ secrets.R2_IMAGES_ACCESS_KEY_ID }}
            R2_IMAGES_SECRET_ACCESS_KEY: ${{ secrets.R2_IMAGES_SECRET_ACCESS_KEY }}
            R2_IMAGES_BUCKET: ${{ secrets.R2_IMAGES_BUCKET }}
```

`astrum-scena check core-version` fails when the reference is not a 40-hex SHA or its comment names
another version than the installed core, so a site bumps the core and the reference together. The
workflow takes `secrets: inherit` nowhere: every secret is declared by name and optional. The caller
grants `deployments: write` even without deploying, since GitHub checks the permissions of every job
of the called workflow.

- `gates` reads `public-env`, `KEY=value` lines of the `PUBLIC_*` build variables the core reads
  (`PUBLIC_TURNSTILE_SITE_KEY`); another name or an empty value fails the job before the install.
  It then runs `pnpm install --frozen-lockfile`, the site's `lint` and `typecheck` scripts if it has
  them, `pnpm exec astrum-scena check` with `CI=true` (so a core linked by `pnpm link` fails) and
  `astro build`, and keeps `dist` as an artifact. It needs no secret.
- `live` runs the read-only `astrum-scena images check-live` with the `R2_IMAGES_*` secrets, which
  should be a read-only token of the bucket; nothing in the workflow syncs, prunes or activates a
  release. `live-checks: false` turns it off.
- `deploy` runs only on a push to `main` with `deploy: true`, after the gates and the live check, one
  at a time in the `production-deploy` queue and never cancelled. It first checks that the run's
  commit is still the head of `main` (a stale run publishes nothing; an API error fails it), then
  registers a GitHub deployment and runs `wrangler pages deploy --branch=main` on the `dist` of the
  gates job. Wrangler comes from the site's lockfile (`pnpm add -D wrangler`), and the Pages project
  and `pages_build_output_dir = "dist"` from its `wrangler.toml`.

A job whose secret is not available, as on a pull request from a fork, skips its work with a notice
naming the secret; a job the inputs or the event leave out is named in a notice of `gates`. The
workflow needs the site's `package.json` to name pnpm in `packageManager`, and its Node version in
`.nvmrc` (`node-version-file` names another file). Every action it uses is pinned to a commit SHA.

## Site config

`site.yaml` requires only the site's own data: `schemaVersion`, `origin`, `identity`, `content`,
`privacy.controller`, `menu.items`, `social`, `seo.description`, `images.rights` and
`images.watermark`. Every other field has a default in the core, so a site writes only where it
differs, and the effective config is the defaults with those overrides merged in:

- a section or object left out takes its defaults, and one written in part keeps the defaults of the
  keys it leaves out (`viewer: { counter: on }` changes only the counter);
- a written scalar or array replaces the default whole, so `images.privacy.deniedFields` repeats
  every tag it keeps;
- a `moreDocs.<kind>` block is written whole, since its fields constrain each other: a written block
  gets no defaults;
- `images.publicPath` defaults to `/media` unless `images.publicOrigin` is set;
- `images.rights.source` and `images.rights.webStatement`, which the image pipeline embeds in the
  XMP of every derivative, are derived from `origin`: `source` is its host and `webStatement` the
  URL of the `/rights/` page on it, so the domain is written once. A written value overrides the
  derivation: a site that moves to another domain may keep the old values in the XMP instead of
  re-encoding its derivatives, since a changed value changes `configDigest`; the old URL must then
  keep serving the rights page or redirect to it;
- `content.catalog` describes each locale: its font `script` (`latin` or `cyrillic`, the scripts the
  core has fonts for), `ogLocale`, the Intl tag `intl` of its dates and `charWidthPx`, the mean glyph
  width that sizes the album header. The core has entries for `en` and `ru`, which a site overrides
  field by field (`catalog: { en: { ogLocale: en_GB } }`); a locale of `content.locales` (two or
  three lowercase letters) without an entry fails with its path, and a new code needs every field.
  The lock holds the entries of the site's locales and of `en`, the language of `/status/`. The core
  ships UI texts and language names for `en` and `ru` only;
- `content.taxonomy` declares the enumerations of the photo taxonomy, each a non-empty list of
  distinct kebab-case ids that replaces the default whole: `categories`, the album categories
  (default `series`, `places`), whose labels `src/content/config/categories.yaml` holds for exactly
  these ids; `placeKinds`, the place kinds from the root of the hierarchy down (default `country`,
  `region`, `locality`), a kind's rank being its position and the first kind having no parent; and
  `tagKinds` (default `subject`, `condition`, `motif`, `moment`, `technique`). The lock holds the
  effective lists, which the content schemas, `astrum-scena check content` and the `/add-album`
  helpers read; a value outside a list fails with the file, the field and the list. Its
  `dimensions` (default none) declare flat taxonomies beside the places and tags, such as events or
  people: `dimensions.<id>` has a `label` in every locale and an optional `icon`, the name of a
  [Lucide](https://lucide.dev/icons) icon the core embeds from its `lucide-static` (an unknown name
  fails with `site.yaml: content.taxonomy.dimensions.<id>.icon`). The id is kebab-case and not the
  name of another file of `src/content/config/` (`categories`, `places`, `tags`, `image-sets`, `place-gps-bounds`). Its
  values are the flat dictionary `src/content/config/<id>.yaml` (`schemaVersion: 1`, a list of
  `{id, label}` under the dimension's id), a photo refers to them with
  `dimensions: { <id>: [<value ids>] }`, `astrum-scena check content` rejects an unknown dimension or
  value, and the photo page shows them as chips after the tags, colored by the theme's
  `--color-dimension-<id>`.

A default left in place is checked by the same cross-field rules as a written value, so changing one
side of a coupled pair means writing the other too: `surfaces.articlesIndex: { kind: grid }` keeps the
default `ratio: original` and fails, and `footer.recentWorks: { count: 1 }` keeps `favorites: 2`.

A key the schema does not know fails at any depth with its path (`site.yaml: theme.defualt:
unrecognized key`) instead of falling back to a default, and a file that writes every field stays
valid. The defaults are part of the public API: the snapshot of the `site.yaml` schema records them.

### The lock

The core does not merge `site.yaml` with its defaults while it builds. `astrum-scena config resolve`
writes the effective config into `site.lock.yaml` next to it, and the site commits both, so a new
default of the core reaches the site as a diff of its lock, never silently.

- The lock holds its own `schemaVersion: 1`, the version of each content collection under
  `collections` and the effective config under `site`, every branch written out with its keys in
  schema order. A rerun on the same `site.yaml` and core is byte-identical. Resolve keeps the
  collection versions the lock already has and writes the core's current one only for a collection
  it lacks; an upgrade step of `UPGRADING.md` raises a version.
- The build, `astro dev`, the commands and the gates read only the lock, through one loader, and do
  not compare it with `site.yaml`: after editing `site.yaml`, run `astrum-scena config resolve`.
  The lock is strict and gets no defaults: a missing lock
  (`site.lock.yaml: missing; run astrum-scena config resolve`), a missing branch
  (`site.lock.yaml: site.viewer.counter: missing`), an unknown key and a collection version the
  core does not read each fail.
- `astrum-scena check config-lock`, part of `astrum-scena check`, fails when the lock differs byte
  for byte from a fresh resolve (`site.lock.yaml is stale; run astrum-scena config resolve`), which
  catches a forgotten resolve and a hand edit alike. A `site.yaml` that fails resolve leaves the
  lock as it was.

## Modules

An optional feature of the core is a module: courses are the first, the reference one. A site enables
a module with its section `modules.<id>` of `site.yaml`; a module left out builds nothing at all, no
route, collection, menu segment, sitemap entry or text.

```yaml
# site.yaml (excerpt)
modules:
    courses: {}
```

`{}` enables the module with its defaults; the section takes the module's settings, checked by the
module's own schema like any other section (`site.yaml: modules.courses.order: …`), and an unknown
module fails with the known ones (`site.yaml: modules.tours: unknown module; known: courses`).
`astrum-scena config resolve` writes the section and the versions of the module's collections into
the lock, and the build reads the enabled modules from there, so enabling a module needs no edit of
`src/content.config.ts`. The routes of the modules are added when the dev server starts, so after a change
of the enabled modules restart `astro dev`. To disable a module, remove its `modules.<id>` section,
its content directory (`src/content/courses/`), its menu item, its `moreDocs` targets and its keys in
the site's dictionaries, then run `astrum-scena config resolve`.

Each module declares a manifest in the core: its collections (name, source directory, schema and
versions), the route segments its pages own and the directory of those pages, the schema of its
section, its i18n namespace with a dictionary per locale, its MDX component and directive names, the
tokens its styles read, the segments a site may put in the menu and the modules it depends on. The
build fails, naming the key or the file, on:

- a dependency on a module that is not enabled;
- a `menu.items` segment of a disabled module, or one that neither a section of the core, an
  enabled module nor a published page serves (`site.yaml: menu.items.2.segment: "tours" is not a
known segment; known: …`); the site still writes the menu item itself;
- content of a disabled module (`src/content/courses: content of module "courses", which is not
enabled in site.yaml (modules.courses)`) and a `moreDocs` target of one;
- a key of a disabled module in the site's dictionary.

The build also fails, in one error that lists every collision, when a name of an enabled module is
taken: by the core or by another module (its id, a collection name or a source directory equal to,
inside or around another collection's, a route or menu segment, an MDX component, a directive, a
token of the theme contract, its i18n namespace), or by a dictionary key of the module outside its
namespace (`module "tours": segment "articles" is the core's`). A generic page that the
`/{locale}/<slug>/` route builds, published or unlisted, may not take the segment of the core or of
an enabled module, whose route would hide it (`page "workshops": slug "courses" is the route
segment of module "courses"`); the segment of a disabled module is free. A test in the core's
`pnpm check` runs the same check over every module of the registry, so the core never ships a
collision between its modules.

### Courses

`modules.courses` takes `order` (`title` or `newest`) and `currentFirst` of the index, the index
`surface` (`width`, `kind`, `ratio`, as `surfaces.articlesIndex`), its `banner` photo or `off`, and
the `moreDocs` block of a course, written whole like a `moreDocs.<kind>` block. The courses are the
collection `src/content/courses/<translation-key>.<locale>.md`, with the fields of a page plus
`courseStatus` (`archive` or `current`) on the reference locale, which every course needs; they are
served at `/{locale}/courses/` and `/{locale}/courses/<slug>/`, and a `moreDocs.docs` target names
one with `kind: course`. The module's texts are the `courses.*` keys.

## UI texts

The core ships a full dictionary of UI texts for every locale it supports. A site overrides any of
them in `src/i18n/<locale>.yaml`, one file per locale of `content.locales`, with a required
`schemaVersion: 1` and the keys it changes, dotted as in `i18n.json`:

```yaml
# src/i18n/en.yaml
schemaVersion: 1
footer.quote: Notice where the light falls.
```

For each locale of `content.locales` the build lays the site's file over the core's dictionary and
those of the enabled modules; a locale without a file keeps the core's texts. A module's keys sit in
its namespace (`courses.title`), and a site may override them only while the module is enabled. The site's own copy, such as `footer.quote` and
`contacts.intro`, has a neutral default in the core for a site to replace. A key the core does not
know (`src/i18n/en.yaml: nav.hom: unrecognized key`), a blank text, a missing or unsupported
`schemaVersion` and any entry of `src/i18n/` other than `<locale>.yaml` for a locale of
`content.locales` (a file for another locale, `en.yml`) each fail the build with the file.
A key that neither the core nor the site gives a locale fails the build too (`i18n (ru): missing
keys: footer.quote`): a text never falls back to another locale.

## Replacement points

A site changes a visual part of the core by putting a component for a named replacement point in
`src/overrides/<point>.astro`; `astro.config` stays one `astrumScena()` call. The core renders that
component in place of its own part, while the element around it, its links, labels, classes and
scripts stay the core's, so the behaviour keeps working through core updates:

| Point              | Where                                                 | Props                             | The core keeps                                                                                                         |
| ------------------ | ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `logo`             | the header's logo slot and the banner logo on a phone | `LogoReplacementProps`            | the home link and its label, pinning, the swap with the section icon; `menu.logoSize` scales only an `<svg>` inside it |
| `footer-copyright` | the copyright line of the footer                      | `FooterCopyrightReplacementProps` | the `.site-footer__copyright` element                                                                                  |

The props types come from the package root:

```astro
---
// src/overrides/logo.astro
import type { LogoReplacementProps } from '@picasso-ai/astrum-scena'

type Props = LogoReplacementProps
const { placement, title } = Astro.props // placement: 'header' | 'banner'
---

<span class="flex items-center gap-3">…</span>
```

`LogoReplacementProps` gives `placement`, `lang` and the localized `identity.title`;
`FooterCopyrightReplacementProps` gives `lang`, `since` (`identity.copyright.since`), `year` (the
build year), the localized `holder` and the `rights` text of the locale. An `<svg>` inside the logo
takes the height of the logo slot (`menu.logoSize`, `menu.topLogoSize`); text and other content keep
their own size. A block-level root keeps the header from growing by a line's descender. The `logo`
replacement renders inside the core's home link, so it must contain no interactive elements (links,
buttons, form controls); the `footer-copyright` replacement renders inside the core's `<p>`, so it
must be phrasing content (`<span>`, `<em>`, text), never a `<div>` or `<p>`. With a `logo`
replacement the slot shows even without a brand SVG. A file for a point the
core does not know (`src/overrides/footer.astro: unknown replacement point "footer"; known:
footer-copyright, logo`) and anything but an `.astro` component in `src/overrides/` fail the build
and `astro dev`; the list is in `replacement-points.json` (Public API). The integration reads `src/overrides/` when
it starts, so a file added or removed while `astro dev` runs takes effect after a restart; an edit of
an existing replacement reloads as usual.

Without a `logo` replacement the core draws the site's brand files: `src/assets/brand/menu-logo.svg`
in the header (or `brand-logo.svg` when it is missing) and `brand-logo.svg` in the banner. The file
must be one root `<svg>` with a `viewBox`, and every element right under the root that has an `id` is
a layer: the core draws it with `<use href="<file>#<id>">` in document order, so a layer keeps
`fill="currentColor"` to follow the theme or a fill of its own. A file without a `viewBox` or without
any top-level `id` fails the build with its path.

## Imports and the ESLint preset

A site imports the core only through the entry points of its `package.json` `exports`:
`@picasso-ai/astrum-scena`, `@picasso-ai/astrum-scena/collections`,
`@picasso-ai/astrum-scena/eslint` and the presets (see Skills and presets). Anything under `src/` or `dist/` is internal and changes in any
release. The preset in `./eslint` reports any other specifier of the package, including a path
through `node_modules`, in static imports, `export … from` and dynamic `import()`. It reads the
allowed list from the installed `package.json`, so a new entry point needs no change in the site:

```js
// eslint.config.mjs
import { astrumScenaEslint } from '@picasso-ai/astrum-scena/eslint'

export default [
	// …the site's own configs
	...astrumScenaEslint(),
]
```

The preset is plain flat-config data on the built-in `no-restricted-imports` and
`no-restricted-syntax` rules; the core does not depend on `eslint`. A later config object that sets
one of these rules replaces its whole list, so a site that has its own `no-restricted-syntax`
selectors passes them in (`astrumScenaEslint({ files, syntax })`), or builds its objects from
`deepImportRules()`, which returns the import patterns and the selectors.

The objects of `astrumScenaEslint()` also set `linterOptions.noInlineConfig` and the rule
`astrum-scena/no-inline-config`: ESLint ignores every inline config comment (`eslint-disable…`,
`/* eslint … */`, `/* global … */`) and reports each as an error, so nothing can be suppressed.

ESLint does not read `.mdx`, so the build applies the same rule to ESM `import` and `export … from`
in a site's MDX and fails on an internal path.

## Skills and presets

`astrum-scena install` installs, with the version stamp of the core in every file:

- the skills, with `astrum-scena-shared`, the rules they share, into `.agents/skills/` (Codex and
  other agents) and `.claude/skills/` (Claude Code); each runs only `pnpm exec astrum-scena …` commands
  of the installed core and is invoked explicitly (`/name` in Claude Code, `$name` in Codex):
    - `validate` checks the content the owner edited, records the translation markers the owner confirms
      and builds; `fixcontent` applies one targeted correction; `sync-mdx` aligns the MDX block structure
      of a document's locales;
    - `factcheck` researches and reviews the external claims of a document into the fact-check ledger,
      and `factcheck-apply` applies the findings the owner accepted;
    - `translate` translates one document into another locale with two independent reviews;
    - `add-album` creates an album from local masters, and `process-images` runs the image pipeline
      from a build to the active release;
    - `front-audit` audits the changed frontend surface against the site's rules and a catalog of Astro
      traps, which a site extends in a catalog of its own;
- the agents `factcheck-researcher` and `factcheck-reviewer` of `/factcheck`, and `translator` and
  `translation-reviewer` of `/translate` and `/factcheck-apply`, into `.claude/agents/` and
  `.codex/agents/`;
- the block of `AGENTS.md` between `<!-- astrum-scena:begin -->` and `<!-- astrum-scena:end -->`,
  the rules every site of the core shares; the text outside the markers is never touched, and a site
  without `AGENTS.md` gets one with the block;
- a config for each preset the site has none of: `eslint.config.mjs`, `prettier.config.mjs`,
  `tsconfig.json` and `.markdownlint.json`. An existing config is never overwritten; install warns when
  it does not name the core's preset.

The names of the core's skills and agents are reserved: install stops, writing nothing, on a site
file under one of them without the stamp, and the gate `skills` fails on any of them that is not the
installed core's copy (edited, of another core version, or the site's own). A skill of the site takes
a name of its own. After upgrading the core, run `astrum-scena install` again: a run with the same
version changes nothing.

The presets are entry points of the package, so the site's lockfile pins them with the core:

- `@picasso-ai/astrum-scena/eslint`: `astrumScenaEslint()` (above) and `astrumScenaStyle()`, the code
  style of the core: typescript-eslint's recommended rules, sorted imports and exports, no `any`, enum,
  interface, JSDoc, `@ts-ignore` or default export outside `*.config.*`, lowercase comments and
  `prefer-const`. The style needs `typescript-eslint` and `eslint-plugin-simple-import-sort`, optional
  peers of the core it imports only when called; without them it fails asking for them;
- `@picasso-ai/astrum-scena/prettier`: `astrumScenaPrettier`, with `prettier-plugin-astro`, an
  optional peer, when the site has it;
- `@picasso-ai/astrum-scena/tsconfig.json`: Astro's strict config with the React JSX settings;
- `@picasso-ai/astrum-scena/markdownlint.json`: the markdownlint rules.

The config install writes for ESLint:

```js
// eslint.config.mjs
import {
	astrumScenaEslint,
	astrumScenaStyle,
	enumDeclaration,
} from '@picasso-ai/astrum-scena/eslint'

export default [
	{ ignores: ['dist/', '.astro/'] },
	...(await astrumScenaStyle()),
	...astrumScenaEslint({ syntax: [enumDeclaration] }),
]
```

## Public API

What a site may rely on is listed in `api-snapshot/` of the core's repository, one JSON file per
surface, each derived from the source the core itself reads:

- `exports.json` — the entry points of `exports` and the declaration of each of their exports; the
  package root exports the integration (`default`) and the props types of the replacement points;
- `cli.json` — the commands of the `astrum-scena` bin, each alone and with each of its options
  (`astrum-scena check pages --root <dir>`): a removed line is breaking, an added one compatible;
- `site-files.json` — the JSON Schema (input side) of every site file the core validates, keyed by
  its path: `site.yaml` (its `seo` and `images` sections included), `site.lock.yaml` (the same tree
  under `site`, with the collection versions), the content collections (by their loaders' base and
  pattern), the taxonomy and image-set files, `src/content/featured/home.yaml`, the site's
  dictionaries `src/i18n/<locale>.yaml` (one schema for every locale), the place zones
  `src/content/config/place-gps-bounds.yaml` and the image data files `data/images/*.jsonl` (the
  version of the first line, and the lines after it as `rows`). Every one of them but the content
  collections starts
  with a required `schemaVersion` (`4` in `site.yaml`, `2` in the taxonomy files
  `src/content/config/{categories,places,tags}.yaml` and in `src/content/featured/home.yaml`, `1`
  elsewhere, the lock included; the first
  line of a `.jsonl` file holds only it), as do the generated `src/generated/images-public.json` and
  `images-release.json`; the core checks it before the schema and rejects a missing or unsupported
  version with the file and the versions it reads. The schemas built from the site's lists (an
  album's `category` and the ids and kinds of the taxonomy files) show the core's default
  `content.taxonomy`, whose lists a site may replace;
- `mdx-components.json` — the global MDX components and the schema of their props;
- `directives.json` — the Markdown container directives (`:::name`) with their attributes: whether
  each is required and, for an enumerated one, its values;
- `tokens.json` — the CSS custom properties the core reads but does not define, the only names the
  site's `src/theme/theme.css` may declare: it defines every `required` one, and may override an
  `optional` one, which the core reads with a fallback or Tailwind defines (`--font-sans`,
  `--font-weight-*`, `--ease-out`, `--text-base`…). The layout tokens (`--container-prose` and the
  other widths) come from the generated `src/generated/layout-tokens.css`, never from the theme, and
  the core's own primitives (`--container-max`) are not listed. The package ships this file, and the
  integration checks the theme against it whenever the site builds or runs `astro dev`: an unknown
  token, a layout token and a missing required one each fail with the file and the names
  (`src/theme/theme.css: unknown tokens: --color-acent`); only names are checked, never values.
  Beside the list, each dimension of `content.taxonomy.dimensions` requires the token
  `--color-dimension-<id>`, the color of its chips, with no fallback to the tags' color; a
  `--color-dimension-*` token of a dimension the site does not declare is unknown;
- `i18n.json` — the keys of the core dictionaries, the ones a site dictionary may override;
- `replacement-points.json` — the names of the replacement points a site may fill in
  `src/overrides/`; removing or renaming one is breaking, and their props are types in `exports.json`;
- `modules.json` — each module of the registry as a site relies on it: its collections (source and
  versions), the schema of its `modules.<id>` section with every defaulted setting required as in
  the lock, its route and menu segments, i18n namespace, MDX components, directives, tokens,
  dependencies and `moreDocs` kinds. An added or removed module (a new one takes its menu segments
  and content directory at once), an added collection (the lock of a site that enables the module
  lacks its version), a removed collection version, an added route segment (it may hide a page of
  the site), an added dependency and a changed namespace are breaking, as is any other removal; the
  settings are compared as a schema, and any other addition is compatible;
- `env.json` — the environment variables a site sets. Every name the core reads is declared public or
  internal in `src/consumer-env.ts`; internal ones are not part of the API.

What JSON Schema cannot express is recorded on its field as a short digest of each function's
source. A check (a zod `refine`, `superRefine` or `z.custom`) goes into `x-refinements`: one that
appears or changes is breaking, one that disappears is compatible, since it only ever rejected. A
transform (`transform`, `preprocess`, `overwrite` and the built-in `.trim()`, `.toLowerCase()`,
`.toUpperCase()`, `.normalize()`) goes into `x-transforms`: any change is breaking, its removal too,
since a transform widens what a site may write (the Gallery shorthand `images: ['id']`).

The gate sees no more than that. A digest covers the text of the callback, not the helpers,
constants or modules it calls, so tightening `isValidIsoDate` or a list a callback reads changes no
digest. Of a directive, the gate sees the declared attributes (their names, whether each is required
and the enumerated values), not the rest of its parser's logic, such as the syntax of `claim` or a
non-empty `title`. A change that narrows what a site may write through such code is the author's to
mark: name it in a `**Breaking:**` entry of `CHANGELOG.md` and in `UPGRADING.md` by hand.

`pnpm check:api-snapshot` fails when the snapshot differs from the source and lists each change as
compatible (an addition, a widening) or breaking (a removal, a narrowing, anything it does not
recognise). After an intended change, regenerate the snapshot with `pnpm api:snapshot` and commit it
with the change. On a pull request, CI compares the snapshot with the one at the merge base with
`main`; every breaking change must be named in a `**Breaking:**` entry under `## [Unreleased]` in
`CHANGELOG.md` (or under the section of the repository version the branch bumps to, where a story
release moves it) and in an entry of `UPGRADING.md` (see Versions).

## Versions

The npm version of the package is its own, apart from the repository's `1.<epic>.<story>` versions
of `CHANGELOG.md`. A change is **breaking** when a site has to edit its config, content or code, or
re-encode its image derivatives, to take it: at least every change the API snapshot gate classifies
as breaking, a changed default that breaks a site or re-encodes its derivatives, and a change of a
byte-stable value below. A different formatting of a YAML file or a report the core writes is not
breaking by itself.

- **Until the first site adopts the core** the version is `0.<epic>.<story>` of the story that
  releases it (the first release is `0.6.9`). A story that changes the core releases it: its pull
  request bumps the version, and the merge to `main` publishes it; a repository version bump that
  changes the core without a new core version fails `check:api-breaking`. Any higher version may be breaking, so a site pins the
  exact version and reads `UPGRADING.md` before it moves: a release with a section there is breaking,
  one without needs no action.
- **From `1.0.0`**, the release in which the first site adopts the core, the version follows semver:
  a fix bumps the patch, a compatible feature the minor and a breaking change the major; a site pins
  `^x.y.z`.

Every breaking release has a section in `UPGRADING.md`, at the root of the core's repository, keyed
by its npm version, with one entry per breaking change: the form before and after, with examples, the
order of the steps, the versions of the commands that rewrite derived files, and how to verify the
result. A site that skipped releases applies the sections in order, oldest first. `pnpm check:upgrading` checks the file's
structure; on a pull request, CI requires an entry for each breaking change of the snapshot and
checks a bump of `version` against the file: a release with transitions must be a breaking one (any
higher `0.y.z` or `1.0.0` under `1.0.0`, from it on the next major), and a breaking release needs its
section.

These values keep every byte for the same input, because a site's derivatives and translations are
reused only while they do; `src/lib/images/byte-contract.test.ts` pins them:

- `configDigest` of the image manifest: the sha256 of the canonical serialization of a projection
  of the parsed `images` section of `site.yaml` that the core defines, versioned by
  `IMAGE_DIGEST_VERSION`. The
  projection takes values, not the file's shape: key order, a default written or omitted and a field
  the schema gains later outside the projection leave the digest unchanged, and changing the projection means a new digest
  version and a breaking release. Version 1 holds every current field in the layout of the former
  `config/images.yaml`, with the constant `2` under the key `version`, that file's version;
- the object key of a derivative, `<photoId>/<width>w-<sha256 of its bytes>.<format>`, which is its
  URL path under the site's media origin and which the manifest validates;
- `translatedFromDigest`: the sha256 of the reference body, normalized and without its errata note.

## Build

`dist/` holds only the code Node runs while Astro loads the config and the CLI, compiled by `tsc`;
Vite compiles the rest from `src/`, which the package ships as source. `bin/astrum-scena.js` only
loads `dist/cli/index.js`: a committed launcher, so the package manager links the bin even in a
workspace where `dist/` is not built yet.

## License

MIT, see `LICENSE`. A few assets are based on third-party work and keep their own licences; each
is listed with its source in `THIRD_PARTY_NOTICES.md`, which the package ships.
