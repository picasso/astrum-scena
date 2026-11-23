import { z } from 'astro/zod'

import { LANGUAGE_SWITCHER_MODES } from './language-switcher.ts'
import { localizedLabelSchema } from './localized-label.ts'

// desktop top-menu hover animations, matching the legacy theme. The single source of the list: the Zod
// schema (`site.ts`), the modifier classes in `src/components/site-nav.astro` and the enum↔CSS contract
// (`menu.test.ts`) derive from it. `off` is a plain accessible link without the decorative copy. The
// config offers only implemented variants, so all nine effects are listed, not just the default.
export const MENU_ANIMATIONS = [
	'off',
	'bottom-line-slide-in', // the underline slides in from below
	'bottom-line-drop', // the underline grows down from the top
	'word-slide-in', // a copy of the word (data-hover) slides in from below; the legacy default
	'circles-expand', // two circles expand from the center
	'bottom-dots-expand', // a dot splits into three
	'borders-slide-in', // top and bottom borders slide toward the text
	'opacity-change', // a dimmed link turns fully opaque
	'text-grow', // the text grows smoothly
	'text-bounce-in', // the text grows with a bounce
] as const

// `off` plus the nine legacy effects
export type MenuAnimation = (typeof MENU_ANIMATIONS)[number]

// container widths from narrow to wide: prose < medium < standard < gallery. Matches the --container-*
// tokens and serves both as the `menu.minWidth` values and as the "wider than" order. Each tier has a
// `.site-header__inner--<tier>` modifier in site-header.css (menu.test.ts checks the contract).
export const MENU_WIDTH_LADDER = ['prose', 'medium', 'standard', 'gallery'] as const

export type MenuWidthTier = (typeof MENU_WIDTH_LADDER)[number]

// `screen` spans the browser width and ignores minWidth; `adaptive` follows the page container but
// never goes below menu.minWidth (see resolveMenuWidth)
export const MENU_WIDTH_MODES = ['screen', 'adaptive'] as const

export type MenuWidthMode = (typeof MENU_WIDTH_MODES)[number]

// `sun` is a sun/crescent icon that follows the theme, `duo` a half-filled circle (Tabler contrast),
// `off` keeps it out of the menu. theme.toggleVisible is the master switch and also gates the overlay
// panel toggle; `menu.theme` only picks the desktop menu presentation
export const MENU_THEME_MODES = ['sun', 'duo', 'off'] as const

export type MenuThemeMode = (typeof MENU_THEME_MODES)[number]

// page containers (`<main class="content--*">`) use only some of the tiers, so the resolver accepts
// the whole ladder
const rank = (tier: MenuWidthTier): number => MENU_WIDTH_LADDER.indexOf(tier)

// the menu is never narrower than `menu.minWidth`, so narrow prose pages get a wider menu while
// gallery pages keep their full width
export function resolveMenuWidth(pageWidth: MenuWidthTier, minWidth: MenuWidthTier): MenuWidthTier {
	return rank(pageWidth) >= rank(minWidth) ? pageWidth : minWidth
}

// the file name of an svg in one asset folder (`src/assets/icons/<folder>/<name>.svg`); that the file
// exists is checked by the component that loads the folder
export const iconNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
	message: 'expected an icon file name such as `mail`',
})

// one icon for the section index and its nested pages, or a [index, nested] pair (articles: bookmark on
// the index, text inside an article); names point into src/assets/icons/menu
const menuIconSchema = z.union([iconNameSchema, z.tuple([iconNameSchema, iconNameSchema])])

export type MenuIcon = z.infer<typeof menuIconSchema>

const menuItemSchema = z
	.object({
		segment: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
			message: 'expected a section path segment such as `portfolio`',
		}),
		label: localizedLabelSchema,
		icon: menuIconSchema.optional(),
	})
	.strict()

export type MenuItem = z.infer<typeof menuItemSchema>

// fail-closed: an unknown key or value fails the build. The presentation keys style the desktop top
// menu; the fullscreen overlay has its own contract and does not inherit the animation
export const menuSchema = z
	.object({
		animate: z.enum(MENU_ANIMATIONS).default('word-slide-in'),
		width: z.enum(MENU_WIDTH_MODES).default('adaptive'),
		minWidth: z.enum(MENU_WIDTH_LADDER).default('standard'),
		// header only: the footer (`footer.lang`) and the home overlay are unaffected
		lang: z.enum(LANGUAGE_SWITCHER_MODES).default('code'),
		theme: z.enum(MENU_THEME_MODES).default('sun'),
		// how much larger the menu logo gets, 0..1 (0 keeps 100%, 1 doubles it), or off to leave it out;
		// the adaptive base and pixel rounding stay in code
		logoSize: z.union([z.literal('off'), z.number().min(0).max(1)]).default(0.5),
		// banner logo below the menu breakpoint: scales only the upper bound of its fluid height
		// (80px × (1 + topLogoSize), the lower bound stays 40px), or off to leave it out
		topLogoSize: z.union([z.literal('off'), z.number().min(0).max(1)]).default(0.2),
		// banner logo below the menu breakpoint: on pins it to the corner over the scroll like the hamburger,
		// off lets it scroll away with the top section as the legacy overlay header did
		topLogoSticky: z.enum(['off', 'on']).default('off'),
		// desktop only: below the breakpoint the bar is hidden behind the hamburger anyway
		sticky: z.enum(['off', 'on']).default('on'),
		// opacity of the stuck bar (legacy dynamic_opacity), or off; needs `sticky: on`, and "stuck" is
		// detected with a sentinel and an IntersectionObserver
		stickyFade: z.union([z.literal('off'), z.number().min(0).max(1)]).default(0.9),
		// the current section's icon in the logo slot (legacy current_icon); icons come from
		// `menu.items[].icon`
		sectionIcon: z.enum(['off', 'on']).default('on'),
		// swaps the section icon for the logo once the bar is stuck (legacy dynamic-swap), so the site stays
		// identifiable; works only with `sticky: on` and `sectionIcon: on`
		sectionIconSwap: z.enum(['off', 'on']).default('on'),
		// the menu, overlay panel and footer navigation in this order; a section left out keeps its routes
		items: z
			.array(menuItemSchema)
			.min(1)
			.superRefine((items, context) => {
				const seen = new Set<string>()
				items.forEach((item, index) => {
					if (seen.has(item.segment))
						context.addIssue({
							code: 'custom',
							path: [index, 'segment'],
							message: `duplicate menu segment "${item.segment}"`,
						})
					seen.add(item.segment)
				})
			}),
	})
	.strict()

export type MenuConfig = z.infer<typeof menuSchema>
