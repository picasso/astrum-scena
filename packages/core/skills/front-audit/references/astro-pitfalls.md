# Astro pitfalls — the trap catalog of `/front-audit`

Traps of an Astro photography site on the Astrum Scena core: failure modes of the frontend, the MDX
blocks and the rendering of content that were paid for once, so a change can be checked against them
instead of learning them again. This catalog comes with the core and is rewritten by
`astrum-scena install`; a site keeps its own traps in a catalog of its own (see the skill).

**Entry shape.** Every trap has the same fields, so a finding can cite it by its `trap-id`:

- **Problem**: what breaks.
- **Symptom**: how it shows (what you would observe).
- **Root**: the underlying cause.
- **Rule**: the imperative rule that prevents it.

A trap of the site's own catalog adds **Source**: where the site learned it (a file and line, a commit,
a document of the site).

---

## 1. CSS cascade and View Transitions

### `reinjected-stylesheet-wins-a-tie`

- **Problem**: an override of a library's CSS works on the first load and is lost after a View
  Transition navigation.
- **Symptom**: correct after a hard refresh, wrong after navigating back with `<ClientRouter />`; it
  looks like a hydration bug and is not.
- **Root**: on a transition the router injects the library's module CSS into `<head>` again, after the
  site's stylesheet; an override of the same specificity loses to the later rule.
- **Rule**: never rely on source order to beat a stylesheet that can be injected again; raise the
  override's specificity (for example double the class) for every property it overrides.

### `css-imported-in-island-lost-after-swap`

- **Problem**: CSS imported from an island's JavaScript disappears after a View Transition navigation.
- **Symptom**: the component is styled on a full load and unstyled after `astro:after-swap`.
- **Root**: an import in the island's module is a side-effect injection; the router swaps `<head>` for
  the target page's, and the module that already ran never injects it again.
- **Rule**: import such CSS in the frontmatter of an `.astro` component, so it becomes a page
  `<link>` the router keeps, never as a side effect of the island's script.

### `reapply-state-after-swap`

- **Problem**: state written on `<html>` before paint (a theme, a mode) is lost or wrong after a View
  Transition.
- **Symptom**: a flash on load, or the wrong state after a navigation.
- **Root**: the router rewrites the attributes of `<html>` from the new page on a swap.
- **Rule**: apply such state synchronously in an `is:inline` script before paint **and** again on
  `astro:after-swap`, reading the new page's attributes; bind the listener once.

### `no-element-fade-over-view-transition`

- **Problem**: an element's own fade-in stacked on the router's cross-fade makes large text shimmer.
- **Symptom**: a heading dithers during page-to-page navigation.
- **Root**: two overlapping opacity transitions fight over the same frames.
- **Rule**: leave page-to-page transitions to View Transitions and drop the element's own fade.

### `close-overlay-before-navigate`

- **Problem**: a link in an open overlay starts its close animation and the view transition at once.
- **Symptom**: a visible flash when navigating from an open menu.
- **Root**: the overlay's close and `navigate()` start together.
- **Rule**: close the overlay first and navigate after its animation; never hijack a modified or
  non-left click, so opening in a new tab keeps working.

### `scoped-link-rule-specificity`

- **Problem**: a broad link rule (`.prose a`) recolors a link inside a block that styles its own links.
- **Symptom**: links of the wrong color or underline inside a block.
- **Root**: the surrounding rule wins unless the block's rule is more specific.
- **Rule**: scope the block's link rule under the same ancestor (`.prose .block a`) so it wins.

### `effect-wrapper-clips-focus-ring`

- **Problem**: a hover-effect wrapper with `overflow: hidden` clips the `:focus-visible` outline.
- **Symptom**: the keyboard focus ring is trimmed or invisible.
- **Root**: the wrapper crops the outline and the box shadow with the effect.
- **Rule**: keep `:focus-visible` visible outside the effect wrapper, and keep the wrapper's geometry
  the same under `prefers-reduced-motion`.

### `decorative-underline-on-whole-link`

- **Problem**: an `::after` underline on a text span leaves an icon of the same link outside the line.
- **Symptom**: the underline starts under the text; the icon sits beside it without one.
- **Root**: under a flex parent the pseudo-element is scoped to the text box, not the link.
- **Rule**: put the decorative `::after` on the whole `inline-block` link and align the children with
  `vertical-align`.

---

## 2. Tailwind v4, tokens and the gates of the core

### `tailwind-v4-css-var-paren-syntax`

- **Problem**: a Tailwind v4 utility that names a custom property in **brackets** compiles to invalid
  CSS and is dropped silently.
- **Symptom**: lint and types are clean, but the declaration is gone (a container renders full-bleed,
  its computed `max-width` is `none`).
- **Root**: `max-w-[--container-max]` compiles to `max-width: --container-max`; only the parenthesis
  form `max-w-(--container-max)` expands to `var(--container-max)`.
- **Rule**: always `utility-(--var)`, never `utility-[--var]`; treat a missing layout property as a
  possible silent drop.

### `overflow-x-clip-not-hidden`

- **Problem**: `overflow-x: hidden` on `html` or `body` makes `body` a scroll container.
- **Symptom**: scroll-driven animations stop and `position: sticky` stops sticking, with no error.
- **Root**: `overflow: hidden` creates a scroll port, so scroll timelines and sticky resolve against
  `body` instead of the viewport.
- **Rule**: suppress horizontal overflow with `overflow-x: clip`, never `hidden`.

### `wide-pseudo-element-needs-clip`

- **Problem**: a decorative pseudo-element wider than its box causes horizontal page scroll.
- **Symptom**: the page scrolls sideways on text surfaces.
- **Root**: the over-wide pseudo-element overflows its container.
- **Rule**: pair it with `overflow-x: clip` on the container that holds it.

### `layout-from-generated-tokens`

- **Problem**: container widths and gaps written by hand in components drift from the config.
- **Symptom**: two sources of truth; inline styles break a strict CSP.
- **Root**: the widths have to reach CSS without inline styles.
- **Rule**: widths and gaps live in `layout` of `site.yaml`; `astrum-scena layout-tokens` writes the
  tokens and `astrum-scena check layout-tokens` guards them. Never pin them by hand.

### `colors-only-in-the-theme`

- **Problem**: a color literal in a component or stylesheet escapes the theme.
- **Symptom**: a color that does not follow the theme or its light and dark modes;
  `astrum-scena check color-literals` fails.
- **Root**: the theme sets only the tokens the core exports; a literal elsewhere bypasses them.
- **Rule**: set colors in the site's theme file through the core's tokens and use the tokens
  everywhere else; a color that must not follow the theme (text over a photo) is a token of its own.

### `rules-inside-cascade-layers`

- **Problem**: a rule outside a cascade layer beats every layered rule of the core, whatever its
  specificity.
- **Symptom**: an override that wins too much, or a core style that cannot be reached;
  `astrum-scena check css-layers` fails.
- **Root**: unlayered styles take precedence over all layers.
- **Rule**: put every rule in a layer and declare the layer order first in every entry stylesheet.

### `one-owner-for-spacing-and-display`

- **Problem**: a Tailwind utility and a global rule both set the spacing or the `display` of one
  element.
- **Symptom**: doubled spacing, or a utility such as `lg:hidden` losing to a global `display: flex` of
  the same specificity.
- **Root**: two sources apply at once, and a single-class utility ties with a single-class rule.
- **Rule**: own the spacing and the visibility of an element in one place, either the utilities or the
  stylesheet.

---

## 3. Images and geometry

### `slot-width-against-the-derivative`

- **Problem**: a layout asks for more pixels than the surface's derivatives provide, or far more than
  it needs.
- **Symptom**: soft thumbnails on high-density screens, or unexpectedly large transfers.
- **Root**: the derivatives come from one width ladder, and each surface caps the width it selects.
- **Rule**: compare the CSS width of the slot times the device pixel ratio with the width the surface
  selects before changing a layout, and keep `sizes` tied to the measured geometry.

### `intrinsic-dimensions-no-layout-shift`

- **Problem**: images without intrinsic dimensions shift the layout as they load.
- **Symptom**: layout shift on article, page and gallery images.
- **Root**: the HTML lacks `width` and `height` (and a placeholder color).
- **Rule**: emit intrinsic `width` and `height` for every image; `sizes` is presentation, pass it
  explicitly, never guess it.

### `geometry-from-the-container`

- **Problem**: justified or masonry rows lose their geometry across container sizes.
- **Symptom**: distorted frames at some breakpoints; items overflowing before the wide layout has room.
- **Root**: the layout math did not start from the actual container width.
- **Rule**: compute row geometry from the actual container width and test it at each breakpoint.

### `paint-placeholder-behind-the-image`

- **Problem**: a placeholder color set on the transparent `<img>` never shows.
- **Symptom**: a white flash on load despite the placeholder.
- **Root**: the color has to sit behind the fading image, not on it.
- **Rule**: paint the placeholder on the image's wrapper, fade the image in over it, and mute the fade
  under `prefers-reduced-motion`.

---

## 4. Islands and hydration

### `forms-hydrate-on-load`

- **Problem**: a form island hydrated with `client:visible` submits natively before it hydrates.
- **Symptom**: the form posts as plain HTML, without validation, when below the fold.
- **Root**: `client:visible` leaves the island inert until it is visible.
- **Rule**: hydrate with `client:load` anything whose handlers must work at once (forms, controls that
  must `preventDefault`).

### `island-state-through-state-not-refs`

- **Problem**: callbacks of a child library fire before a deferred island mounts its refs, and
  `matchMedia` at render time differs between server and client.
- **Symptom**: `data-*` attributes that never update; hydration mismatch warnings.
- **Root**: the island mounts later than the callbacks run; `matchMedia` does not exist during
  server rendering.
- **Rule**: reflect derived UI state through component state, not ref writes; read media queries only
  after mount, so the server and the first client render agree.

### `capture-event-fields-before-set-state`

- **Problem**: reading `event.currentTarget` inside a deferred state updater throws and unmounts the
  island.
- **Symptom**: the second keystroke in a field breaks the form.
- **Root**: the event's `currentTarget` is cleared by the time the updater runs.
- **Rule**: copy the event fields into locals synchronously, before `setState`.

### `focus-without-scroll-on-close`

- **Problem**: returning focus to a toggle after closing an overlay scrolls the page.
- **Symptom**: closing a menu jumps the viewport to the top.
- **Root**: `element.focus()` scrolls its target into view by default.
- **Rule**: restore focus with `element.focus({ preventScroll: true })`.

### `restart-transition-with-reflow`

- **Problem**: rapid repeated navigation leaves a CSS cross-fade stuck.
- **Symptom**: a fast second click does not restart the transition.
- **Root**: toggling a component flag does not force the reflow a transition restart needs.
- **Rule**: restart a CSS transition with an imperative reflow (read `offsetWidth`), and cancel a
  pending swap under `prefers-reduced-motion`.

### `resolvers-fail-closed`

- **Problem**: a resolver renders media or content that does not match what was asked for.
- **Symptom**: the wrong image in a slot, or a silent fallback that hides a broken reference.
- **Root**: the resolver failed open: it did not check the result against the request.
- **Rule**: check that the resolved item matches the requested id and role and refuse a mismatch;
  validate a whole map of assignments at build time, not only the entry the page asks for.

### `visible-without-javascript`

- **Problem**: a reveal that hides elements until a script adds a class leaves them hidden forever
  when the class never comes.
- **Symptom**: elements stuck at `opacity: 0`.
- **Root**: the page lifecycle that added the class does not exist here.
- **Rule**: elements are visible by default; an entrance effect only enhances them.

---

## 5. Responsive and accessibility

### `reduced-motion-covers-every-animation`

- **Problem**: a new animation left out of the `prefers-reduced-motion` block keeps playing.
- **Symptom**: an entrance or transition still animates while the others are muted.
- **Root**: the reduce block lists elements one by one, and an unlisted animation leaks.
- **Rule**: mute every animation a change adds under `@media (prefers-reduced-motion: reduce)`
  (`animation`, `transition` and `transform` none, `opacity: 1`, no delay); this also makes end-to-end
  runs deterministic.

### `discrete-responsive-thresholds`

- **Problem**: behavior that steps at a breakpoint is turned into fluid scaling.
- **Symptom**: an element that should disappear or move below a width stays.
- **Root**: some rules are steps, not curves.
- **Rule**: keep step behaviors as discrete media rules and use `clamp()` only for type and sizes;
  check the change at a phone, a tablet, a laptop and a wide screen, with no horizontal overflow.

### `single-h1-per-page`

- **Problem**: a page renders two H1 elements, or the same heading twice.
- **Symptom**: a banner H1 and a content H1 back to back; an accessibility and search regression.
- **Root**: a heading kept both in the banner and in the content.
- **Rule**: exactly one H1 per page; never hide a duplicate with `display: none`, remove it.

### `hover-is-not-the-only-path`

- **Problem**: information reachable only on hover is lost on touch screens.
- **Symptom**: content hidden behind `:hover` cannot be reached on a phone.
- **Root**: devices with `(hover: none)` never trigger hover.
- **Rule**: a hover effect enhances; every piece of content stays reachable without it.

### `aria-current-exact-vs-current-section`

- **Problem**: naive matching of the active navigation item highlights siblings or misses nested
  routes.
- **Symptom**: a prefix match lights up a link whose path only starts the same; nested pages light
  nothing.
- **Root**: the exact page (`aria-current="page"`) and the current section are conflated, and a prefix
  match has no path-segment boundary.
- **Rule**: keep `aria-current` for the exact URL, mark the current section separately by whole path
  segments, and style the marker, not `aria-current`.

### `parallax-scroll-driven-not-fixed`

- **Problem**: `background-attachment: fixed` parallax breaks on iOS.
- **Symptom**: a janky or broken background on touch devices.
- **Root**: fixed attachment is unsupported or broken there.
- **Rule**: implement parallax as a scroll-driven transform (`animation-timeline: scroll()`), off on
  touch devices, narrow screens and under reduced motion; a static background is the fallback.

---

## 6. Content and its rendering

### `status-is-the-only-publicity`

- **Problem**: publicity inferred from `publishedAt` or another field publishes drafts.
- **Symptom**: draft items in public lists or routes.
- **Root**: only `status` says whether an item is public.
- **Rule**: filter on `status: published` alone; a published album lists only published photos.

### `unlisted-is-not-a-status`

- **Problem**: an unlisted item treated as a draft or a tag breaks its route or leaks into listings.
- **Symptom**: an unlisted photo hidden everywhere, or listed in a grid.
- **Root**: `unlisted` is a separate visibility axis: published, reachable by its link, left out of
  listings.
- **Rule**: keep its route and links working and leave it out of every discovery listing.

### `distinct-text-fallbacks`

- **Problem**: title, caption and id fallbacks are cross-wired (a title made from a filename).
- **Symptom**: a file name shown as a title; the wrong display name.
- **Root**: the fields have different fallbacks: a title is authored or absent, an id may come from a
  filename, a caption has its own rules.
- **Rule**: render the fields the core resolves; never fabricate a title from a filename or an id.

### `mdx-structural-parity`

- **Problem**: the locales of an MDX document drift apart in their block structure (components, order,
  directives).
- **Symptom**: a block present in one locale and missing or moved in another.
- **Root**: the structure was edited in one locale only.
- **Rule**: report it as this trap and route the fix to `/sync-mdx <key>`, which syncs structure only;
  different props of the same component are authorial and not a finding.

### `safe-link-schemes`

- **Problem**: an editorial link carries an executable scheme (`javascript:`, `data:`) or a
  protocol-relative or backslash form (`//host`, `\\host`) that leaves the site.
- **Symptom**: script execution from a link, or an "internal" link opening another origin.
- **Root**: the Markdown pipeline does not sanitize link destinations.
- **Rule**: allow only `http:`, `https:` and relative internal links; a link opening a new tab carries
  `rel="noopener noreferrer"`.

### `no-locale-literals`

- **Problem**: site code that names a locale breaks when the locales change.
- **Symptom**: a missing text, a wrong route or an untranslated label in one locale.
- **Root**: the locales, the reference locale and the origin come from `site.yaml`.
- **Rule**: never write a locale in code; read it from the config, and put UI texts in the site's
  dictionaries, one per locale.

---

## 7. The boundary with the core

### `import-only-entry-points`

- **Problem**: a site imports a file of the core by its path inside the package.
- **Symptom**: a build that breaks on a core upgrade; the ESLint preset of the core reports the import.
- **Root**: only the entry points of the package are its API.
- **Rule**: import the core only through its entry points, in code and in MDX alike.

### `replacement-points-only`

- **Problem**: a site changes the core's markup outside the named replacement points.
- **Symptom**: a patched or copied core component that falls behind the core's next version.
- **Root**: the interactive shell and its DOM belong to the core; a site customizes it through the
  theme, the config and the replacement points under `src/overrides/`.
- **Rule**: use a replacement point with its typed props, render only inside the element the core gives
  it, and ask for a new point rather than copying a component.

---

_When a site adds an entry to its own catalog, it keeps the fields above with a real **Source**, places
it in the matching section and prefers merging into an existing trap over a near-duplicate._
