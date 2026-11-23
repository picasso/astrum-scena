# Astrum Scena

An Astro integration for photography sites: albums, a portfolio viewer, articles, an image pipeline
and the content tooling around them, shipped as one npm package that a site enables with one call in
`astro.config`. A site keeps only its config, content, theme and images; everything else comes from
the core and is updated by changing its version.

## Packages

- [`packages/core`](packages/core) — `@picasso-ai/astrum-scena`, the core: the integration, its
  content collections, the `astrum-scena` CLI, the content skills and the presets a site extends.
- [`demo`](demo) — a synthetic site built on the core, the way a real site uses it; its unit tests
  and end-to-end tests run against it.
- `packages/migrate-wp` — a placeholder for the WordPress migration tool.

## Installing the core in a site

The steps are in [Installation](packages/core/README.md#installation) of the core's README: the peer
dependencies, the integration in `astro.config`, the collections in `src/content.config.ts`, the
`site.yaml` config and `astrum-scena install`. The package is published to npm as
[`@picasso-ai/astrum-scena`](https://www.npmjs.com/package/@picasso-ai/astrum-scena).

## Development

The workspace uses pnpm and Node 24:

```sh
pnpm install
pnpm check   # typecheck, unit tests, format, lint and the repository gates
pnpm build   # the core, then the demo against it
```

`check:identity` also matches a list of the maintainer's private strings, kept outside the
repository; without it the gate checks only its generic patterns and prints a warning, and CI runs
it with the list.

## License

MIT, see [`LICENSE`](LICENSE). Third-party assets keep their own licences, listed in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
