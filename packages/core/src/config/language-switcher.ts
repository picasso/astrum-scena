// language switcher modes shared by the header (`menu.lang`) and the footer (`footer.lang`): `full`
// shows the language name, `code` shows EN/RU, `off` hides it. The two settings are independent
export const LANGUAGE_SWITCHER_MODES = ['full', 'code', 'off'] as const

export type LanguageSwitcherMode = (typeof LANGUAGE_SWITCHER_MODES)[number]

// a locale-neutral page (`/rights/`, `/status/`) overrides the setting: it has no other-language
// version to link to
export function switcherDisplay(
	mode: LanguageSwitcherMode,
	localeNeutral: boolean,
): Exclude<LanguageSwitcherMode, 'off'> | undefined {
	return localeNeutral || mode === 'off' ? undefined : mode
}
