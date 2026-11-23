import { describe, expect, it } from 'vitest'

import {
	type Denylist,
	describeLeak,
	findLeaks,
	isPublicHost,
	parseDenylist,
	PUBLIC_HOSTS,
} from './identity.ts'

// samples are assembled from parts, so this file does not trip the gate it tests
const url = (host: string, path = '') => `${['https:', '', host].join('/')}${path}`
const hex = (pair: string) => pair.repeat(16)
const ENTRIES = ['Acme Photo', 'acme-owner']
const DENYLIST = { entries: ENTRIES, allowed: [] }
const kinds = (line: string, denylist: Denylist = DENYLIST) =>
	findLeaks(line, denylist).map(describeLeak)

describe('parseDenylist', () => {
	it('keeps trimmed entries, skipping blank lines and # comments', () => {
		expect(parseDenylist('# owner strings\r\n  Acme Photo \n\nacme-owner\n')).toEqual(DENYLIST)
		expect(parseDenylist('')).toEqual({ entries: [], allowed: [] })
		expect(parseDenylist('\n# only a comment\n')).toEqual({ entries: [], allowed: [] })
	})

	it('reads `!` lines as allowed contexts, not entries', () => {
		expect(parseDenylist('acme\n! @acme-org/ \n!\n')).toEqual({
			entries: ['acme'],
			allowed: ['@acme-org/'],
		})
	})
})

describe('findLeaks: allowed contexts', () => {
	const scoped = { entries: ['acme'], allowed: ['@acme-org/', 'github.com/acme/'] }

	it('skips an entry inside an allowed context in any case', () => {
		expect(kinds("import core from '@ACME-org/core'", scoped)).toEqual([])
		expect(kinds('git+https://github.com/acme/core.git', scoped)).toEqual([])
	})

	it('still flags the entry outside the context, at its true column', () => {
		const leaks = findLeaks('@acme-org/core by Acme', scoped)
		expect(leaks.map(describeLeak)).toEqual(['denylist entry #1'])
		expect(leaks.map((leak) => leak.column)).toEqual([19])
	})
})

describe('findLeaks: owner denylist', () => {
	it('flags every occurrence in any case and names the entry by number, not by text', () => {
		const leaks = findLeaks('by ACME PHOTO, see acme-owner and acme photo', DENYLIST)
		expect(leaks.map(describeLeak)).toEqual([
			'denylist entry #1',
			'denylist entry #2',
			'denylist entry #1',
		])
		expect(leaks.map((leak) => leak.column)).toEqual([4, 20, 35])
		for (const leak of leaks) expect(describeLeak(leak)).not.toMatch(/acme/i)
	})

	it('passes a line without entries', () => {
		expect(kinds('an Acme-free line about photos')).toEqual([])
	})
})

describe('findLeaks: domains', () => {
	it('flags a URL to a host that is not public', () => {
		expect(kinds(`see ${url('owner-site.dev', '/rights/')}`)).toEqual(['domain'])
		expect(kinds(`<${url('cdn.owner-site.dev')}>`)).toEqual(['domain'])
		expect(kinds(`[x](${url('Owner-Site.DEV')})`)).toEqual(['domain'])
		expect(kinds(`{"u":"https:\\/\\/owner-site.dev\\/x"}`)).toEqual(['domain'])
		expect(kinds(url('user@owner-site.dev:8080', '/x'))).toEqual(['domain'])
		expect(kinds(['http:', '', 'owner-site.dev'].join('/'))).toEqual(['domain'])
		expect(kinds(`\`${url('owner-site.dev')}\${path}\``)).toEqual(['domain'])
	})

	it('allows public hosts, their subdomains and reserved TLDs', () => {
		for (const host of ['github.com', 'api.github.com', 'demo.example.com', 'shop.test'])
			expect(kinds(url(host, '/x')), host).toEqual([])
		expect(kinds(url('api.store.example'))).toEqual([])
		expect(isPublicHost('notgithub.com')).toBe(false)
	})

	it('ignores placeholders, templates, IP addresses and single-label hosts', () => {
		expect(kinds(`${url('<domain>')} and ${url('${host}', '/x')}`)).toEqual([])
		expect(kinds('`https://cognito-idp.${region}.amazonaws.com`')).toEqual([])
		expect(kinds('`https://cdn.${domain}/x`')).toEqual([])
		expect(
			kinds(`${url('127.0.0.1:4321')} ${url('localhost:4321')} ${url('intranet')}`),
		).toEqual([])
	})

	it('keeps the allowlist free of duplicates and in lower case', () => {
		expect(new Set(PUBLIC_HOSTS).size).toBe(PUBLIC_HOSTS.length)
		for (const host of PUBLIC_HOSTS) expect(host).toBe(host.toLowerCase())
	})
})

describe('findLeaks: account and bucket IDs', () => {
	it('flags a standalone 32-digit hex ID in either case', () => {
		expect(kinds(`account_id = "${hex('a1')}"`)).toEqual(['hex-id'])
		expect(kinds(`ID ${hex('F0')}`)).toEqual(['hex-id'])
		expect(kinds(`pub-${hex('0c')}.r2.dev`)).toEqual(['hex-id'])
	})

	it('ignores longer hashes and hex runs inside a word', () => {
		expect(kinds(`sha256 ${'ab'.repeat(32)}`)).toEqual([])
		expect(kinds(`commit ${'ab'.repeat(20)}`)).toEqual([])
		expect(kinds(`x${hex('ab')}z`)).toEqual([])
	})
})
