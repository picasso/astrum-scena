# Upgrading

How a site moves from one release of `@picasso-ai/astrum-scena` to the next, when the move needs
more than a new version: every change that requires editing the site's config, content or code, or
re-encoding its image derivatives. The [version policy](packages/core/README.md#versions) says which
releases those are.

Sections are keyed by the npm version of the core, the version a site pins, not by the repository
versions of `CHANGELOG.md`. There is one section per breaking release, newest first; a release
without a section needs no action. To skip several releases, apply the sections between the pinned
version and the target from the oldest to the newest, each completely and verified, before the next.

Each entry names, in its heading, the breaking changes it covers the way the `**Breaking:**` entry of
`CHANGELOG.md` names them (a field path, `Component.prop`, a key, a token or an export), and has five
parts, each a paragraph that starts with its label:

```md
### `<name>`, `<name>`

**Before:** what the site has now, with an example of the file or code.

**After:** what it must have after the transition, with the same example rewritten.

**Order:** where the step goes relative to the other entries of the release and to the build, the
image pipeline and the commit.

**Writers:** the commands that regenerate derived files, with the core version they must come from
(`none` when nothing is regenerated).

**Verify:** how to confirm the result from the data the site started with: the commands to run and
what they must report.
```

A transition that is laborious or easy to get wrong also gets a script, named in its entry.
`pnpm check:upgrading` checks this file's structure; on a pull request, `check:api-breaking` requires
an entry under `[Unreleased]` that names each breaking change of the API snapshot, and a section for
the core version a breaking release bumps to.

## [Unreleased]

## [0.6.11]

### `site.content.taxonomy`, `src/content/config/categories.yaml`, `places` of `src/content/config/places.yaml`

**Before:** The album categories (`series`, `places`), the place kinds (`country`, `region`,
`locality`) and the tag kinds (`subject`, `condition`, `motif`, `moment`, `technique`) are fixed in
the core, `site.lock.yaml` has no taxonomy, and `src/content/config/categories.yaml` may label only
some of the categories:

```yaml
# site.lock.yaml (excerpt)
site:
    content:
        locales:
            - en
        referenceLocale: en
```

```yaml
# src/content/config/categories.yaml, on a site with `locales: [en]`
schemaVersion: 2
categories:
    - id: series
      label:
          en: Series
```

**After:** The lists come from `site.yaml` `content.taxonomy` (optional; `categories`, `placeKinds`
and `tagKinds`, each a non-empty list of distinct kebab-case ids that replaces the default whole), and
the core's defaults are the lists above. `site.lock.yaml` holds the effective lists; a lock without
them fails with `site.lock.yaml: site.content.taxonomy: missing; run astrum-scena config resolve`.
The rank of a place kind is its position in `placeKinds`, and `places.yaml` follows it: a place of
the first kind has no `parentId`, any other has one, and a parent in the file has a lower rank;
otherwise it fails with the path, e.g. `places.2.parentId: a locality place requires a parentId
(content.taxonomy.placeKinds [country, region, locality])`.
`categories.yaml` labels exactly the declared categories: an undeclared id fails with
`categories.1.id: "studies" is not one of content.taxonomy.categories [series, places]` and a
declared one without a label with
`src/content/config/categories.yaml: categories: missing "places" of content.taxonomy.categories [series, places]`.
A site that keeps the defaults and labels both categories edits nothing; one that labels only some
either labels the rest or declares only those it uses:

```yaml
# site.lock.yaml (excerpt)
site:
    content:
        locales:
            - en
        referenceLocale: en
        taxonomy:
            categories:
                - series
                - places
            placeKinds:
                - country
                - region
                - locality
            tagKinds:
                - subject
                - condition
                - motif
                - moment
                - technique
```

```yaml
# site.yaml (excerpt), a site with only the series category
content:
    locales:
        - en
    referenceLocale: en
    taxonomy:
        categories:
            - series
```

**Order:** Before the first build with this release: declare `content.taxonomy` in `site.yaml` when
the site needs other lists than the defaults, make `categories.yaml` label exactly the declared
categories and give every place of `places.yaml` a parent as its kind requires, then run `astrum-scena config resolve`, which writes `site.content.taxonomy` into
`site.lock.yaml`. Do not rerun the image pipeline: the image digests do not read the taxonomy.

**Writers:** `astrum-scena config resolve` of this release.

**Verify:** `astrum-scena check config-lock` and `astrum-scena check content` pass; `git diff
site.lock.yaml` adds only `site.content.taxonomy`, and a site without `content.taxonomy` in
`site.yaml` builds the same pages with the same markup as before.

### `site`, `site.yaml`, `src/content/photos/**/*.{yaml,yml}`

**Before:** `site.lock.yaml` has no dimensions under `site.content.taxonomy`, and the theme declares
no `--color-dimension-*` token:

```yaml
# site.lock.yaml (excerpt)
site:
    content:
        taxonomy:
            tagKinds:
                - subject
```

**After:** `site.content.taxonomy.dimensions` is part of the lock, `{}` for a site without
dimensions; a lock without it fails with `site.lock.yaml: site.content.taxonomy.dimensions: missing;
run astrum-scena config resolve`. A site that declares no dimensions edits nothing else: its photos
need no `dimensions` and its theme no new token. A site that declares one adds its label (and
optionally a Lucide icon) to `site.yaml`, its dictionary `src/content/config/<id>.yaml`, the theme
token `--color-dimension-<id>` and the values on its photos; a photo with a repeated value in one
dimension fails with `dimensions.<id>.1: repeats "<value>"`:

```yaml
# site.lock.yaml (excerpt), a site without dimensions
site:
    content:
        taxonomy:
            tagKinds:
                - subject
            dimensions: {}
```

```yaml
# site.yaml (excerpt), a site with an events dimension
content:
    taxonomy:
        dimensions:
            events:
                label:
                    en: Events
                icon: calendar-days
```

```yaml
# src/content/config/events.yaml
schemaVersion: 1
events:
    - id: tide-fair
      label:
          en: Tide Fair
```

```css
/* src/theme/theme.css (excerpt) */
:root {
	--color-dimension-events: #7fc4ff;
}
```

```yaml
# src/content/photos/wide-tide.yaml (excerpt)
dimensions:
    events:
        - tide-fair
```

**Order:** Together with the `site.content.taxonomy` entry above and before the first build with
this release: declare any dimension in `site.yaml`, write its dictionary and theme token, then run
`astrum-scena config resolve`, which writes `site.content.taxonomy.dimensions` into `site.lock.yaml`,
and only then refer to the values from the photos. Do not rerun the image pipeline: the image digests
do not read the taxonomy.

**Writers:** `astrum-scena config resolve` of this release.

**Verify:** `astrum-scena check config-lock` and `astrum-scena check content` pass; `git diff
site.lock.yaml` adds only `site.content.taxonomy.dimensions` (`{}` without dimensions), and a site
without dimensions builds the same photo pages with the same markup as before.

## [0.6.10]

### `schemaVersion` 4 of `site.yaml`, `site.yaml`, `site`, `site.schemaVersion`, `privacy.controller.name.(keys)`, `privacy.controller.name.en`, `privacy.controller.name.ru`, `seo.description.(keys)`, `seo.description.en`, `seo.description.ru`, `site.privacy.controller.name.(keys)`, `site.privacy.controller.name.en`, `site.privacy.controller.name.ru`, `site.seo.description.(keys)`, `site.seo.description.en`, `site.seo.description.ru`

**Before:** `site.yaml` has `schemaVersion: 3`. `privacy.controller.name` and `seo.description`
always hold an `en` and a `ru` text, whatever `content.locales` lists, and the other config texts
(`identity`, `menu.items[].label`, `social[].label`) may carry a locale the site does not build:

```yaml
# site.yaml (excerpt)
schemaVersion: 3
content:
    locales:
        - en
    referenceLocale: en
privacy:
    controller:
        name:
            en: Example Person
            ru: Пример Человека
seo:
    description:
        en: Photographs by Example.
        ru: Фотографии Примера.
```

**After:** `site.yaml` has `schemaVersion: 4`; version 3 fails with
`site.yaml: schemaVersion 3 is not supported; supported: 4; see UPGRADING.md`. Every config text,
`privacy.controller.name` and `seo.description` included, holds exactly the locales of
`content.locales`: a missing one fails with
`site.yaml: seo.description.ru: missing the "ru" text required by content.locales` and another one
with `site.yaml: privacy.controller.name.ru: not one of content.locales [en]`. A site with two
locales changes only the number; a one-locale site deletes the texts of the other locale.

```yaml
# site.yaml (excerpt)
schemaVersion: 4
content:
    locales:
        - en
    referenceLocale: en
privacy:
    controller:
        name:
            en: Example Person
seo:
    description:
        en: Photographs by Example.
```

**Order:** In one commit with the content entry below, before the first build with this release:
edit `site.yaml`, then run `astrum-scena config resolve`, which writes `site.schemaVersion: 4` into
`site.lock.yaml` (the lock's own `schemaVersion` stays 1) once the collection versions of the entry below are raised. Do not rerun the image
pipeline: `configDigest` does not read these sections.

**Writers:** `astrum-scena config resolve` of this release.

**Verify:** `astrum-scena check config-lock` (`pnpm check:config-lock` in the demo) passes; on a
two-locale site `git diff site.yaml` shows only the `schemaVersion` line, and the site builds the same
pages with the same markup as before.

### `collections.albums`, `collections.photos`, `schemaVersion` 2 of `src/content/config/categories.yaml`, `places.yaml`, `tags.yaml` and `src/content/featured/home.yaml`, `title`, `title.(keys)`, `title.en`, `title.ru`, `description`, `description.(keys)`, `description.en`, `description.ru`, `excerpt`, `excerpt.(keys)`, `excerpt.en`, `excerpt.ru`, `caption`, `caption.(keys)`, `caption.en`, `caption.ru`, `alt`, `alt.(keys)`, `alt.en`, `alt.ru`, `categories[].label`, `categories[].label.(keys)`, `categories[].label.en`, `categories[].label.ru`, `places[].name`, `places[].name.(keys)`, `places[].name.en`, `places[].name.ru`, `tags[].label`, `tags[].label.(keys)`, `tags[].label.en`, `tags[].label.ru`, `slides[].copy.title`, `slides[].copy.title.(keys)`, `slides[].copy.title.en`, `slides[].copy.title.ru`, `slides[].copy.description`, `slides[].copy.description.(keys)`, `slides[].copy.description.en`, `slides[].copy.description.ru`, `CoreCollections`

**Before:** The localized fields of the albums and photos, the labels and names of the taxonomy
files and the inline copy of the featured slides are `{en, ru}` pairs, both required on every site;
the lock reads the two collections at version 1 and the four files carry `schemaVersion: 1`:

```yaml
# site.lock.yaml (excerpt)
collections:
    albums: 1
    photos: 1
```

```yaml
# src/content/config/tags.yaml
schemaVersion: 1
tags:
    - id: dusk
      label:
          en: Dusk
          ru: Сумерки
      kind: moment
```

```yaml
# src/content/photos/harbor-dawn.yaml (excerpt), on a site with `locales: [en]`
title:
    en: Harbor at Dawn
    ru: Гавань на рассвете
```

**After:** Each of these fields holds exactly the locales of `content.locales`, the same rule as the
config texts: `src/content/photos/harbor-dawn.yaml: title.ru: not one of content.locales [en]` for
another locale, `alt.ru: missing the "ru" text required by content.locales` for a missing one; an
optional field (`excerpt`, `caption`, `alt`, a photo's `description`) may still be left out, and a
`title` may not be blank in any locale. The collections `albums` and `photos` are at version 2 in the
lock, and the four files at `schemaVersion: 2`; an older version fails with
`site.lock.yaml: collections.albums: version 1 is not supported; supported: 2; see UPGRADING.md` or
`src/content/config/tags.yaml: schemaVersion 1 is not supported; supported: 2; see UPGRADING.md`. A
site with two locales changes only the numbers; a one-locale site deletes the texts of the other
locale from every album, photo, taxonomy entry and inline slide copy. `src/content.config.ts` stays
`defineCoreCollections()`, which now builds the two schemas from the lock, and the type
`CoreCollections` names them by their new types.

```yaml
# site.lock.yaml (excerpt)
collections:
    albums: 2
    photos: 2
```

```yaml
# src/content/config/tags.yaml, on a site with `locales: [en]`
schemaVersion: 2
tags:
    - id: dusk
      label:
          en: Dusk
      kind: moment
```

```yaml
# src/content/photos/harbor-dawn.yaml (excerpt), on a site with `locales: [en]`
title:
    en: Harbor at Dawn
```

```yaml
# src/content/albums/harbor.yaml (excerpt), on a site with `locales: [en]`
title:
    en: Harbor
description:
    en: Mornings at the old harbor.
excerpt:
    en: Mornings at the harbor.
```

```yaml
# src/content/featured/home.yaml (excerpt), on a site with `locales: [en]`
schemaVersion: 2
slides:
    - id: harbor
      copySource: inline
      copy:
          title:
              en: Harbor
          description:
              en: Mornings at the old harbor.
```

**Order:** In one commit with the `site.yaml` entry above, before the first build with this release:
set `albums` and `photos` under `collections` of `site.lock.yaml` to `2` (resolve keeps the versions
a lock holds, so this is the step that raises them), set `schemaVersion: 2` in the three taxonomy files and in `src/content/featured/home.yaml` when the
site has one, delete
the texts of a locale the site does not build, then run `astrum-scena config resolve`. Do not rerun
the image pipeline: the image digests do not read these fields.

**Writers:** `astrum-scena config resolve` of this release.

**Verify:** `astrum-scena check content` and `astrum-scena check config-lock` pass, and the site
builds (`astro build`), which is what reads `src/content/featured/home.yaml`; on a two-locale site
`git diff` shows only the version lines, the site builds the same pages with the same markup as
before, and its visual baselines, if it has any, pass unchanged.

### `content`, `content.locales[]`, `content.locales[0]`, `content.referenceLocale`, `identity.title.(keys)`, `identity.photoAlt.(keys)`, `identity.copyright.holder.(keys)`, `menu.items[].label.(keys)`, `social[].label.(keys)`, `site.content`, `site.content.catalog`, `site.content.locales[]`, `site.content.locales[0]`, `site.content.referenceLocale`, `site.identity.title.(keys)`, `site.identity.photoAlt.(keys)`, `site.identity.copyright.holder.(keys)`, `site.menu.items[].label.(keys)`, `site.social[].label.(keys)`, `locale`

**Before:** A locale is one of the codes the core lists (`en`, `ru`), with the core's fixed `og:locale`,
Intl tag, font script and glyph width; `site.yaml` cannot change them, and `site.lock.yaml` holds
only the list and the reference locale:

```yaml
# site.lock.yaml (excerpt)
site:
    content:
        locales:
            - en
            - ru
        referenceLocale: en
```

**After:** A locale is any code of two or three lowercase letters that has an entry in the catalog:
the core's defaults for `en` and `ru`, overridden field by field and extended with new codes in
`site.yaml` `content.catalog` (optional; a new code needs `script`, `ogLocale`, `intl` and
`charWidthPx`, and `script` is `latin` or `cyrillic`). A locale without an entry fails with
`site.yaml: content.locales.0: "de" has no entry in the catalog; add content.catalog.de`, a malformed
code with `expected a locale code of two or three lowercase letters`. The lock holds the effective
entry of each locale of `content.locales` and of `en`, the language of `/status/`; a lock without it
fails with `site.lock.yaml: site.content.catalog: missing; run astrum-scena config resolve`. A
content file's `locale` and the keys of the config texts accept any code of that format, and the
loader still checks them against `content.locales`. A site that keeps the defaults edits nothing:

```yaml
# site.lock.yaml (excerpt)
site:
    content:
        locales:
            - en
            - ru
        referenceLocale: en
        catalog:
            en:
                script: latin
                ogLocale: en_US
                intl: en-US
                charWidthPx: 7.1
            ru:
                script: cyrillic
                ogLocale: ru_RU
                intl: ru-RU
                charWidthPx: 8.1
```

```yaml
# site.yaml (excerpt), a site that announces British English
content:
    locales:
        - en
    referenceLocale: en
    catalog:
        en:
            ogLocale: en_GB
```

**Order:** After the entries above, before the first build with this release: run
`astrum-scena config resolve`, which writes `site.content.catalog` into `site.lock.yaml`. Do not
rerun the image pipeline: the image digests do not read the catalog.

**Writers:** `astrum-scena config resolve` of this release.

**Verify:** `astrum-scena check config-lock` passes; `git diff site.lock.yaml` adds only
`site.content.catalog`, and a site without `content.catalog` in `site.yaml` builds the same pages
with the same markup as before.

## [0.6.9]

### `schemaVersion` in every site file the core reads, `version` of `config/images.yaml`, `src/content/config/image-sets.yaml`

**Before:** The site files carry no version, except `config/images.yaml`, which has `version: 2`:

```yaml
# config/images.yaml
version: 2
publicPath: /media
```

```yaml
# src/content/config/tags.yaml
tags:
    - id: dusk
```

**After:** Every site file the core reads starts with a `schemaVersion`. `config/images.yaml` renames
its `version` to `schemaVersion: 2`; `src/config/site.yaml`, `src/config/seo.yaml`,
`src/content/config/categories.yaml`, `places.yaml`, `tags.yaml`, `image-sets.yaml` and
`src/content/featured/home.yaml` add `schemaVersion: 1`; the generated
`src/generated/images-public.json` and `src/generated/images-release.json` add a top-level
`"schemaVersion": 1`, as their last key, since the files keep their keys sorted. An
`image-sets.yaml` without sets holds only its `schemaVersion`; an empty one now fails. A missing
`featured/home.yaml` stays valid, and the content collections (`albums`, `photos`, `articles`,
`pages`, `legal`) are not versioned.

```yaml
# config/images.yaml
schemaVersion: 2
publicPath: /media
```

```yaml
# src/content/config/tags.yaml
schemaVersion: 1
tags:
    - id: dusk
```

**Order:** Edit every file in one commit together with the one-`site.yaml` entry below, before the
first build with this release: the build fails until both are applied. Edit the two
generated JSON files by hand rather than rerunning the image pipeline: `configDigest` still hashes
the version under the key `version`, so it stays the same and no derivative is re-encoded.

**Writers:** none.

**Verify:** The build and `pnpm check:image-files` are checked on the combined result, as the
one-`site.yaml` entry below describes. `git diff` of `src/generated/images-release.json` shows only the added
`schemaVersion` line and the comma before it, with `configDigest` unchanged. A file left without the
field fails with `<path>: missing schemaVersion; supported: <versions>`.

### `src/config/site.yaml`, `src/config/seo.yaml`, `config/images.yaml` into one `site.yaml`

**Before:** The config the core reads is split into three files with a version each:

```yaml
# src/config/site.yaml
schemaVersion: 1
origin: https://example.com
```

```yaml
# src/config/seo.yaml
schemaVersion: 1
description:
    en: Photographs by Example.
```

```yaml
# config/images.yaml
schemaVersion: 2
publicPath: /media
```

**After:** One `site.yaml` at the site root, next to `astro.config.mjs`, with `schemaVersion: 2`.
The content of `src/config/site.yaml` stays at the top level; `seo.yaml` and `images.yaml` become
its `seo` and `images` sections, nested as they are, without their own `schemaVersion`. Delete the
three old files: the core fails while any of them is left, naming it, for example
`config/images.yaml: folded into site.yaml (images); see UPGRADING.md`. A `site.yaml` still at
`schemaVersion: 1` fails with `site.yaml: schemaVersion 1 is not supported; supported: 2; see UPGRADING.md`, and an
unknown key anywhere in the file fails with its full path, such as
`site.yaml: images.ladder.widthz: unrecognized key`. Every field outside the site's own data has a
core default (Site config in `packages/core/README.md`), so values equal to it may be dropped, but
need not be.

```yaml
# site.yaml
schemaVersion: 2
origin: https://example.com
seo:
    description:
        en: Photographs by Example.
images:
    publicPath: /media
```

**Order:** After the `schemaVersion` entry above, in the same commit, before the first build with
this release. A script that sets `SITE_CONFIG_PATH` points it at the new file. Do not rerun the image
pipeline: `configDigest` keeps the `2` of the old file's version as a constant, so it stays the same
and no derivative is re-encoded.

**Writers:** none.

**Verify:** The site builds, and `pnpm check:image-files` (in the demo) or the site's own image
tooling reports the release descriptor current, since `configDigest` did not change; `git status`
shows the three old files deleted and `site.yaml` added, and `src/generated/images-*.json` unchanged.

### `site.lock.yaml`

**Before:** The site has only `site.yaml`, and the build merges it with the core defaults on every
run, so a new default of the core changes the site without a diff:

```yaml
# site.yaml
schemaVersion: 2
origin: https://example.com
viewer:
    counter: on
```

**After:** Next to `site.yaml` the site commits `site.lock.yaml`, the effective config that
`pnpm config:resolve` writes from it: `site.yaml` with every core default filled in, under `site`,
and the version of each content collection, under `collections`. The build, `astro dev`, the
commands and the gates read only the lock and never compare it with `site.yaml`; without it they fail
with `site.lock.yaml: missing; run pnpm config:resolve`. The lock is strict: an unknown key, a
missing branch (`site.lock.yaml: site.viewer.counter: missing; run pnpm config:resolve`) or a
collection version the core does not read fails. It is never edited by hand: after every edit of
`site.yaml`, and after moving to a core with other defaults, rerun the command and commit both files.

```yaml
# site.lock.yaml
# generated by pnpm config:resolve from site.yaml and the core defaults; do not edit
schemaVersion: 1
collections:
    albums: 1
    articles: 1
    legal: 1
    pages: 1
    photos: 1
site:
    schemaVersion: 2
    origin: https://example.com
    viewer:
        counter: on
        # …and every other field at its default
```

**Order:** After the one-`site.yaml` entry above, in the same commit, before the first build with
this release: run `pnpm config:resolve` once `site.yaml` is in place. A script that set
`SITE_CONFIG_PATH` to build from another `site.yaml` puts that file in a directory of its own inside
the repository, runs `pnpm config:resolve --site <dir>` and sets `SITE_LOCK_PATH` to the
`site.lock.yaml` it writes there (a relative path resolves against the site root). Do not rerun the image pipeline: the effective image config is the same, so
`configDigest` stays the same and no derivative is re-encoded.

**Writers:** `pnpm config:resolve` of this release.

**Verify:** `pnpm check:config-lock` passes, and a second `pnpm config:resolve` leaves `git diff`
empty. The site builds, `pnpm check:image-files` (in the demo) or the site's own image tooling
reports the release descriptor current, and `git status` shows only `site.lock.yaml` added.

### `images.rights.source`, `images.rights.webStatement`, `site.images.rights.source`, `site.images.rights.webStatement`

**Before:** `site.yaml` writes the domain of `origin` again in the two rights fields that the image
pipeline embeds in the XMP of every derivative:

```yaml
# site.yaml (excerpt)
origin: https://example.com
images:
    rights:
        copyright: © Example
        source: example.com
        webStatement: https://example.com/rights/
```

**After:** No action is required. The core derives both fields from `origin` when `site.yaml` leaves
them out (`source` is its host, `webStatement` the URL of `/rights/` on it) and writes them into
`site.lock.yaml`, where both stay required; a written value still overrides the derivation. Both
lines may be deleted when they equal the derived values; a site that keeps other values, such as the
old domain after a move, keeps writing them.

```yaml
# site.yaml (excerpt)
origin: https://example.com
images:
    rights:
        copyright: © Example
```

**Order:** Any time after the `site.lock.yaml` entry above, in a commit of its own or with it: delete
the two lines, then run `pnpm config:resolve`. Do not rerun the image pipeline.

**Writers:** `pnpm config:resolve` of this release.

**Verify:** `pnpm config:resolve` leaves `site.lock.yaml` unchanged (`git diff` shows only the two
deleted lines of `site.yaml`), `pnpm check:config-lock` passes, and `pnpm check:image-files` (in the
demo) or the site's own image tooling reports the release descriptor current, since `configDigest`
did not change. If `site.images.rights.source` or `webStatement` in the lock changes, the written
values differed from the derived ones: restore those lines.

### `src/assets/brand/brand-logo.svg`, `src/assets/brand/menu-logo.svg` layers

**Before:** The core drew a fixed list of fragment ids from the brand files, wherever in the file each
id sat, and took the `viewBox` from its own list:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 144">
	<g transform="translate(120 0)">
		<g id="menu-photography" fill="currentColor">…</g>
		<g id="menu-signature" fill="#EE112D">…</g>
	</g>
</svg>
```

**After:** Every element right under the root `<svg>` that has an `id` is a layer, drawn in document
order, and the root must have a `viewBox`; a nested id is no longer drawn, and a file without any
top-level id fails the build. Move each layer to a direct child of the root as it is: `<use>` never
applied the wrapper's attributes, so leaving them behind keeps the drawn logo the same:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 144">
	<g id="menu-photography" fill="currentColor">…</g>
	<g id="menu-signature" fill="#EE112D">…</g>
</svg>
```

**Order:** Before the build with the new core version; independent of the other entries.

**Writers:** none.

**Verify:** `pnpm build` passes without a `src/assets/brand/…: …` error, and the header and the banner
on a phone show the same logo as before.

### `site.theme.favicon`

**Before:** The lock of the site has no `favicon` under `theme`, and the core paints the placeholder
favicon with fixed colors:

```yaml
# site.lock.yaml (excerpt)
site:
    theme:
        default: dark
        toggleVisible: true
```

**After:** No edit of `site.yaml` is required. `theme.favicon.background` and
`theme.favicon.foreground` of `site.yaml` set the two colors of the placeholder favicon (a hex color
or a color function such as `oklch(…)`); left out, they default to the colors the favicon had before,
and resolve writes them into `site.lock.yaml`, where both are required.

```yaml
# site.lock.yaml (excerpt)
site:
    theme:
        default: dark
        toggleVisible: true
        favicon:
            background: '#1b1b1f'
            foreground: '#fcbf00'
```

**Order:** Before the first build with this release, in any commit: run `pnpm config:resolve` and
commit the lock. Do not rerun the image pipeline: `configDigest` does not read the theme.

**Writers:** `pnpm config:resolve` of this release.

**Verify:** `pnpm check:config-lock` passes, `git diff` shows only the `favicon` block added to
`site.lock.yaml`, and the built pages carry the same favicon data URI as before.

### `src/theme/theme.css` tokens

**Before:** The site's theme may declare any custom property; a token the core does not read, a
misspelt one or a `--container-*` layout token is silently ignored:

```css
/* src/theme/theme.css (excerpt) */
@theme {
	--color-accent: #fcbf00;
	--color-logo-dark: #3a86ff; /* read by nothing */
	--container-prose: 700px; /* overridden by the generated layout tokens */
}
```

**After:** The theme declares only the tokens of the core's `api-snapshot/tokens.json`: every
`required` one, and any `optional` one it overrides (the Tailwind tokens the core reads, such as
`--font-sans`). The build and `astro dev` fail with the file and the names on an unknown token
(`src/theme/theme.css: unknown tokens: --color-logo-dark`), a layout token (they are generated from
`layout.*` of `site.yaml`) and a missing required one. A rule of the site's own that needs a private
custom property declares it in the site's own stylesheet, not in the theme.

```css
/* src/theme/theme.css (excerpt) */
@theme {
	--color-accent: #fcbf00;
}
```

**Order:** Before the first build with this release, in any commit: delete or move the tokens the
build names, then build. The image pipeline is not involved.

**Writers:** none.

**Verify:** The site builds, and its built CSS differs from the previous build only by the deleted
declarations; the visual baselines of the site, if it has any, pass unchanged. One exception: the
mono shade of a banner now paints `var(--color-shade)` instead of a fixed `#000`, so a theme whose
`--color-shade` is not black sees its mono banners change; to keep the old look, set
`--color-shade: #000` in the theme.

### `schemaVersion` 3 of `site.yaml`, `modules`, `courses`, `moreDocs`, `moreDocs.course`, `surfaces.coursesIndex`, `banners.surfaces.coursesIndex`, `site`, `site.schemaVersion`, `site.modules`, `site.courses`, `site.moreDocs`, `site.moreDocs.course`, `site.surfaces.coursesIndex`, `site.banners.surfaces.coursesIndex`, `kind` and `courseStatus` of `src/content/pages`, `course.status.archive`, `course.status.current`, `moreDocuments.course.heading`, `moreDocuments.course.label`, `defineCoreCollections`

**Before:** Courses are pages: a course is a file of `src/content/pages` with `kind: course` and,
on the reference locale, `courseStatus`; their settings are top-level sections of `site.yaml`, and
the core's dictionary holds their texts:

```yaml
# site.yaml (excerpt)
schemaVersion: 2
menu:
    items:
        - segment: courses
courses:
    currentFirst: off
moreDocs:
    course:
        source: off
        # …the rest of the block
surfaces:
    coursesIndex:
        kind: grid
banners:
    surfaces:
        coursesIndex: dawn-ridge
```

```yaml
# src/content/pages/night-sky.en.md (frontmatter)
translationKey: night-sky
locale: en
slug: night-sky
title: Night Sky
status: published
kind: course
courseStatus: current
```

```yaml
# src/i18n/en.yaml (excerpt)
schemaVersion: 1
course.status.current: Enrolling
moreDocuments.course.heading: More workshops
```

**After:** Courses are the courses module, enabled by its section `modules.courses` of `site.yaml`,
which now has `schemaVersion: 3`; version 2 fails with
`site.yaml: schemaVersion 2 is not supported; supported: 3; see UPGRADING.md`. The section takes the
course settings under new names: `courses.order` and `courses.currentFirst` keep theirs,
`moreDocs.course` becomes `moreDocs` (still written whole), `surfaces.coursesIndex` becomes
`surface` and `banners.surfaces.coursesIndex` becomes `banner`; `modules: { courses: {} }` enables
the module with all its defaults, which are the old ones. The courses move, file names unchanged, to
`src/content/courses/`, without `kind` (a page with `kind` or `courseStatus` now fails its schema);
`courseStatus` stays on the reference locale. The menu item keeps its segment `courses`. The module's
texts are `courses.*` keys: `courses.title` keeps its name, `course.status.archive` and
`course.status.current` become `courses.status.archive` and `courses.status.current`, and
`moreDocuments.course.heading` and `moreDocuments.course.label` become
`courses.moreDocuments.heading` and `courses.moreDocuments.label`; a site dictionary may write them
only while the module is enabled. `src/content.config.ts` stays one line: `defineCoreCollections()`
adds the `courses` collection while the lock enables the module, and its type now also names it.
A site with a fact-check ledger, `data/factcheck/ledger.yaml`, changes `targetCollection: pages`
to `courses` on the entries of moved courses that it has, and adds none; their `sourceDigest` and
findings stay, since the body is the same. An entry left at `pages` fails
`astrum-scena check factcheck` with
`factcheck "night-sky": targetCollection "pages" disagrees with the document folder "courses"`.

```yaml
# site.yaml (excerpt)
schemaVersion: 3
menu:
    items:
        - segment: courses
modules:
    courses:
        currentFirst: off
        moreDocs:
            source: off
            # …the rest of the block
        surface:
            kind: grid
        banner: dawn-ridge
```

```yaml
# src/content/courses/night-sky.en.md (frontmatter)
translationKey: night-sky
locale: en
slug: night-sky
title: Night Sky
status: published
courseStatus: current
```

```yaml
# src/i18n/en.yaml (excerpt)
schemaVersion: 1
courses.status.current: Enrolling
courses.moreDocuments.heading: More workshops
```

A site without courses writes no `modules` section and removes the `courses` menu item, any
`moreDocs.docs` target with `kind: course` and the files of `src/content/courses/`: the build fails
on each of them while the module is disabled, naming the key or the file
(`src/content/courses: content of module "courses", which is not enabled in site.yaml (modules.courses)`).

**Order:** In one commit, before the first build with this release: edit `site.yaml`, move the
course files with `git mv` and drop their `kind` line, set `targetCollection: courses` on their
entries of the fact-check ledger if it has any, rename the keys of `src/i18n/<locale>.yaml`, then
run `pnpm config:resolve`, which writes `schemaVersion: 3`, `modules` and the `courses` collection
version into `site.lock.yaml`. After a ledger edit, run `astrum-scena content factcheck review`
once both this edit and the ledger entry below are applied, in whichever order: the review packet
names the collection of each document. Do not rerun the image pipeline: `configDigest` does not
read these sections, and `translatedFromDigest` of a moved course stays valid, since its body is
the same.

**Writers:** `pnpm config:resolve` of this release, and `astrum-scena content factcheck review` of
this release after a ledger edit.

**Verify:** `pnpm check:config-lock` passes; `git diff --stat` shows the course files as renames.
With a ledger, `astrum-scena check factcheck` passes once the ledger entry below is applied too; the
courses' part of the ledger diff is only their `targetCollection` lines, and the review packet
`data/factcheck/review.md` changes only in the headings of the moved courses, which now end in
`→ courses`. The site builds the same course pages (`/{locale}/courses/` and
`/{locale}/courses/<slug>/`) with the same markup and sitemap entries as before, and its visual
baselines, if it has any, pass unchanged.

### A `slug` of `src/content/pages` equal to a route segment

**Before:** A generic page whose `slug` is the route segment of the core (`portfolio`, `articles`,
`contacts`) or of an enabled module (`courses`) built nothing of its own: the static route of that
segment took `/{locale}/<slug>/`, so the page was silently lost, whether published or unlisted.

```yaml
# src/content/pages/workshops.en.md (frontmatter)
translationKey: workshops
locale: en
slug: courses
title: Workshops
status: published
```

**After:** The build fails, naming the page and the owner of the segment:
`page "workshops": slug "courses" is the route segment of module "courses"` (or `… of the core`).
Rename the slug in every locale of the page; the page was never served at the old address, so
there is nothing to redirect from it. A segment of a disabled module stays free: with no `modules.courses`, a
page with `slug: courses` builds as before.

```yaml
# src/content/pages/workshops.en.md (frontmatter)
translationKey: workshops
locale: en
slug: workshops
title: Workshops
status: published
```

**Order:** Before the first build with this release, in any order relative to the other entries;
the page's `translatedFromDigest` stays valid, since its body is the same.

**Writers:** none.

**Verify:** The site builds; `/{locale}/<new slug>/` serves the page, and the address of the route
segment still serves the route's own page.

### `config/place-gps-bounds.yaml` into `src/content/config/place-gps-bounds.yaml`, `version` of the place zones, `data/images/masters.jsonl`, `data/images/publication-ledger.jsonl`

**Before:** The image scripts of the site read their own files: the coarse place zones at
`config/place-gps-bounds.yaml` with `version: 1`, and the master registry and the publication ledger
as rows only, one JSON object per line:

```yaml
# config/place-gps-bounds.yaml
version: 1
bounds:
    - placeId: coastland
      box: { south: 0, west: 0, north: 40, east: 40 }
```

```text
{"id":"amber-dunes","masterFilename":"amber-dunes.jpg","masterSha256":"3c20…"}
```

**After:** The core's image commands read them. The place zones move next to `places.yaml`, to
`src/content/config/place-gps-bounds.yaml`, and rename `version` to `schemaVersion: 1`; the file
stays optional, and a zone of a place that `places.yaml` does not list fails `astrum-scena check
place-gps-bounds` with the file and the id. Each `data/images/*.jsonl` file gains one first line,
`{"schemaVersion":1}`; the rows below it keep their bytes, and a row is still appended at the end.
A file left in the old form fails with `<path>: missing schemaVersion; supported: 1`.

```yaml
# src/content/config/place-gps-bounds.yaml
schemaVersion: 1
bounds:
    - placeId: coastland
      box: { south: 0, west: 0, north: 40, east: 40 }
```

```text
{"schemaVersion":1}
{"id":"amber-dunes","masterFilename":"amber-dunes.jpg","masterSha256":"3c20…"}
```

**Order:** Before the first image command of this release, in one commit, in any order relative to
the other entries: `git mv` the zones, edit their `version` line, and prepend the line to each
`.jsonl` file. Do not rerun the image pipeline: neither file enters `configDigest`, so no derivative
is re-encoded and the release descriptor stays as it is.

**Writers:** none.

**Verify:** `astrum-scena check` passes, `place-gps-bounds` included; `git diff` shows the zones
renamed with only the `version` line changed, and one added first line in each `.jsonl` file;
`astrum-scena images check-derivatives` reports the active release as before.

### `version` of `data/factcheck/ledger.yaml`, the fact-check review packet into `data/factcheck/review.md`

**Before:** The fact-check scripts of the site read their own ledger, `data/factcheck/ledger.yaml`
with `version: 1`, and wrote the review packet to `docs/factcheck-review.md`:

```yaml
# data/factcheck/ledger.yaml
version: 1
documents:
    - key: reading-the-light
      targetCollection: articles
      sourceDigest: 3c20…
      findings: []
```

**After:** The core's `astrum-scena content factcheck` commands and the gate `factcheck` of
`astrum-scena check` read and write them. The ledger renames `version` to `schemaVersion: 1`; it
stays optional, and without it the gate passes with nothing to check. `targetCollection` also takes
`courses`, the collection of the courses module. The review packet lives beside the ledger, at
`data/factcheck/review.md`, and the gate fails while it differs from the projection of the ledger.
A ledger left in the old form fails with
`data/factcheck/ledger.yaml: missing schemaVersion; supported: 1`.

```yaml
# data/factcheck/ledger.yaml
schemaVersion: 1
documents:
    - key: reading-the-light
      targetCollection: articles
      sourceDigest: 3c20…
      findings: []
```

**Order:** Before the first fact-check command of this release, in one commit, in any order relative
to the other entries: edit the `version` line of the ledger, delete the old packet, then run
`astrum-scena content factcheck review`, which writes the new one. The finding ids, the source
digests and the documents stay as they are, so nothing needs to be researched again. The image
pipeline is not involved.

**Writers:** `astrum-scena content factcheck review` of this release.

**Verify:** `astrum-scena check factcheck` passes; `git diff` shows the ledger with only the
`version` line changed, the old packet deleted and `data/factcheck/review.md` added.

### The finding ids of `data/factcheck/review.md`

**Before:** The review packet listed each finding without its id, so the owner could not record a
decision from the packet alone:

```md
- `https://example.com/page` — _url_ · status: **dead** · decision: open
    - Доказательство: gone for good
```

**After:** Each finding shows its id, the one `astrum-scena content factcheck decide --set <id>=<status>`
takes. A packet written by the previous release differs from the projection of the ledger, and
`astrum-scena check factcheck` fails until it is written again.

```md
- `https://example.com/page` — _url_ · status: **dead** · decision: open
    - id: `url-3f2a9c1b`
    - Доказательство: gone for good
```

**Order:** Right after installing this release, before the next fact-check command or commit; it is
independent of the other entries. The ledger and the image pipeline are not involved.

**Writers:** `astrum-scena content factcheck review` of this release.

**Verify:** `astrum-scena check factcheck` passes; `git diff` of `data/factcheck/review.md` shows only
added `- id:` lines, one per finding.

### `LintConfig`, `astrumScenaEslint`: no inline config

**Before:** The ESLint preset of the core only banned deep imports, and an inline comment could turn a
rule off:

```js
// eslint-disable-next-line no-restricted-imports
import { x } from '@picasso-ai/astrum-scena/src/lib/x'
```

**After:** The objects of `astrumScenaEslint()` set `linterOptions.noInlineConfig` and the rule
`astrum-scena/no-inline-config`: ESLint ignores every inline config comment (`eslint-disable…`,
`eslint-enable`, `/* eslint … */`, `/* global … */`) and reports each as an error. The code the comment
covered is fixed instead, and the comment removed:

```js
import { x } from '@picasso-ai/astrum-scena'
```

**Order:** With the upgrade of the core, before the site's next lint run; independent of the other
entries, the build and the image pipeline.

**Writers:** none.

**Verify:** The site's ESLint run passes with no `astrum-scena/no-inline-config` error, and
`grep -rn "eslint-disable" src` finds nothing.
