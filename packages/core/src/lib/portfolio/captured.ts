// `capturedAt` is a partial date: YYYY renders as the year, YYYY-MM as a localized month and year;
// the date is built in UTC so the local time zone cannot shift the month. `intl` is the locale's tag
// in the site's `content.catalog`
export function formatCapturedAt(value: string, intl: string): string {
	const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value)
	if (!match) throw new Error(`capturedAt must be YYYY or YYYY-MM, got "${value}"`)
	const [, year, month] = match
	if (!month) return year!
	// setUTCFullYear because Date.UTC maps years 0..99 to 1900..1999
	const date = new Date(Date.UTC(2000, Number(month) - 1, 1))
	date.setUTCFullYear(Number(year))
	const label = new Intl.DateTimeFormat(intl, {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(date)
	return label
}
