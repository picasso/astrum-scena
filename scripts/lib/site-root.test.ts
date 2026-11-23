import { describe, expect, it } from 'vitest'

import { DEFAULT_SITE_ROOT, sitePath, siteRootArg } from './site-root.ts'

describe('siteRootArg', () => {
	it('defaults to the demo', () => {
		expect(siteRootArg([])).toBe(DEFAULT_SITE_ROOT)
		expect(DEFAULT_SITE_ROOT).toBe('demo')
	})

	it('takes the directory after --site, normalized to a POSIX path', () => {
		expect(siteRootArg(['--site', 'sites/a/'])).toBe('sites/a')
		expect(siteRootArg(['--site', './sites\\a'])).toBe('sites/a')
		expect(siteRootArg(['--site', '.'])).toBe('.')
	})

	it('rejects --site without a directory', () => {
		expect(() => siteRootArg(['--site'])).toThrow('--site needs a directory')
		expect(() => siteRootArg(['--site', '--other'])).toThrow('--site needs a directory')
	})

	it('rejects an absolute path or one escaping the repository', () => {
		for (const value of ['/x/site', 'C:\\x\\site'])
			expect(() => siteRootArg(['--site', value]), value).toThrow(
				'--site must be relative to the repository root',
			)
		for (const value of ['..', '../x', 'sites/../../x'])
			expect(() => siteRootArg(['--site', value]), value).toThrow(
				'--site must stay inside the repository',
			)
		expect(siteRootArg(['--site', 'sites/../demo'])).toBe('demo')
	})
})

describe('sitePath', () => {
	it('joins a site-relative path onto the site root', () => {
		expect(sitePath('demo', 'src/theme/theme.css')).toBe('demo/src/theme/theme.css')
		expect(sitePath('.', 'src/theme/theme.css')).toBe('src/theme/theme.css')
	})
})
