# Demo site

A synthetic site that consumes the core exactly as a real site does: one integration call in
`astro.config.mjs` and one line in `src/content.config.ts`, with `astro`, `react`, `react-dom` and
`@astrojs/react` declared here.

It holds only the site files the core reads: `site.yaml` (with its `seo` and `images` sections, and
only the site's own data, every behaviour left to the core's defaults) and `site.lock.yaml`, the
effective config resolved from it, the taxonomy and image sets
in `src/content/config/`, the generated image files, the theme, the Astrum Scena mark in
`src/assets/brand/` and a copy of the Ubuntu font in `public/fonts` (Ubuntu Font Licence,
`public/fonts/ubuntu/UFL.txt`). The core's unit tests run against this site.

The site has two locales, `en` (the reference) and `ru`, and every text exists in both. The
synthetic documents are the privacy policy (`src/content/pages/privacy.*.mdx`, with the
`<PrivacyController />` component), one article in `src/content/articles/`, the courses of the
courses module, which `modules.courses` of `site.yaml` enables, in `src/content/courses/` (an open,
an archived and a draft one) and the rights text in `src/content/legal/`.

## Config

The build reads `site.lock.yaml`, not `site.yaml`. After editing `site.yaml`, or when the core's
defaults change, regenerate the lock and commit both files:

```sh
pnpm config:resolve
```

The demo's package scripts only alias the core's `astrum-scena` bin, as a thin site's do:
`config:resolve` runs `astrum-scena config resolve`, `check:site` runs every gate of the site files
and `check:<gate>` one of them; the repository root has the same scripts, which call these. The lock
is never edited by hand; `pnpm check:config-lock` (part of `pnpm check`) fails when it differs from
a fresh resolve.

## Photos

Six synthetic photos in `src/content/photos/` (landscape, portrait, square, panorama, wide and one
black-and-white) fill two albums in `src/content/albums/`: a `series` album with the justified
layout and a `places` album with masonry. The places and tags they use are in
`src/content/config/`, and `src/content/featured/home.yaml` puts two album slides on the home page.

The pictures are procedural plates, not photographs: `scripts/lib/demo-images.ts` computes each
master in memory and the core's derivative engine cuts it into the core's default AVIF and WebP
ladder, with the watermark of the `images` section of `site.yaml` above `watermark.aboveWidth` and
without rights metadata. The derivatives live in `public/media/` and the site serves them itself
(the default `publicPath`, `/media`), so the build needs no image host. After a change to the
masters, the photo set or the `images` section, regenerate from the repository root:

```sh
pnpm demo:images
```

It rewrites `public/media/`, `src/generated/images-release.json` and
`src/generated/images-public.json`; none of them is edited by hand. A rerun on the same machine
changes nothing, while another platform or `sharp` version may encode different bytes, so the gates
never regenerate: `pnpm check:image-files` (part of `pnpm check`) only compares the files with the
release, by size and sha256.

## Builds

In the workspace the demo links the core package (`workspace:*`, its built `dist`; `pnpm build` builds
both). CI builds it the way a site gets it, from the `pnpm pack` tarball installed outside the
workspace: `pnpm demo:packed`, which also checks the album and photo pages of both locales, their
`<picture>` sources, the image files and the home slider, and builds the demo twice more without the
courses module: with its content left in place, which must fail naming it, and without it, which
must have no course page and no course URL in its sitemap.
