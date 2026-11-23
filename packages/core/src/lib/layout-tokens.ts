import type { LayoutConfig } from '../config/layout.ts'

// site.yaml owns the content widths but the stylesheet needs them, so they are projected into a
// tracked static CSS file instead of inline styles on the markup; `astrum-scena check layout-tokens`
// guards it against drift

export const LAYOUT_TOKENS_RELATIVE_PATH = 'src/generated/layout-tokens.css'

// byte-identical on every call
export const serializeLayoutTokens = (layout: LayoutConfig): string =>
	[
		'/* GENERATED FILE — do not edit by hand.',
		' * Source: site.yaml (layout.*). Regenerate with pnpm layout:tokens.',
		' * Drift gate: pnpm check:layout-tokens (part of pnpm check). */',
		'',
		':root {',
		`\t--container-prose: ${layout.prose}px;`,
		`\t--container-medium: ${layout.medium}px;`,
		`\t--container-standard: ${layout.standard}px;`,
		`\t--container-gallery: ${layout.gallery}px;`,
		'}',
		'',
	].join('\n')

type Verdict = { ok: true } | { ok: false; reason: string }

export const verifyLayoutTokens = (raw: string, layout: LayoutConfig): Verdict =>
	raw === serializeLayoutTokens(layout)
		? { ok: true }
		: { ok: false, reason: 'tracked CSS tokens differ from the site.yaml projection' }
