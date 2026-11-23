import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
	classifyOwnDomain,
	expectedFactcheckTargets,
	extractUrls,
	FACTCHECK_RELATIVE_PATH,
	type FactcheckDocument,
	type FactcheckFinding,
	factcheckSourceDigest,
	findingId,
	markDocumentResearched,
	mergeResearchFindings,
	mergeSeededFindings,
	missingUrlFindings,
	ownHostSet,
	parseFactcheck,
	recommendationDigest,
	reconcileFactcheck,
	setFindingDecisions,
	unresearchedDocumentKeys,
	verifyFactcheck,
} from './factcheck.ts'
import { type DocumentCollection, parseDocumentFile } from './translation-marker.ts'

function makeSource(
	key: string,
	body: string,
	{
		collection = 'articles',
		title = 'Заголовок',
	}: { collection?: DocumentCollection; title?: string } = {},
) {
	return parseDocumentFile({
		collection,
		filename: `${key}.ru.md`,
		raw: `---\ntranslationKey: ${key}\nlocale: ru\nslug: ${key}\ntitle: ${title}\nstatus: draft\n---\n\n${body}\n`,
	})
}

function makeFinding(overrides: Partial<FactcheckDocument['findings'][number]> = {}) {
	return {
		id: 'url-1',
		kind: 'url' as const,
		raw: 'https://example.com/a',
		status: 'unchecked' as const,
		recommendation: { action: 'none' as const },
		decision: { status: 'open' as const, reviewedByOwner: false },
		...overrides,
	}
}

function makeFactcheckDoc(overrides: Partial<FactcheckDocument> = {}): unknown {
	return {
		key: 'photogear',
		targetCollection: 'articles',
		sourceDigest: factcheckSourceDigest(makeSource('photogear', 'РУ тело')),
		findings: [],
		...overrides,
	}
}

describe('extractUrls', () => {
	it('collects, trims trailing punctuation, and dedupes preserving order', () => {
		const text = 'see https://a.test/x, and https://b.test/y. and https://a.test/x again'
		expect(extractUrls(text)).toEqual(['https://a.test/x', 'https://b.test/y'])
	})

	it('reads URLs out of Markdown links without the closing parenthesis', () => {
		expect(extractUrls('[Acme](https://www.acme.test/) и <https://x.test/a>')).toEqual([
			'https://www.acme.test/',
			'https://x.test/a',
		])
	})

	it('returns empty for text without URLs', () => {
		expect(extractUrls('no links here')).toEqual([])
	})
})

const OWN_HOSTS = ownHostSet('https://site.test', ['old-site.test'])

describe('ownHostSet', () => {
	it('derives the origin host, the former hosts and the www variant of each', () => {
		expect([...OWN_HOSTS].sort()).toEqual([
			'old-site.test',
			'site.test',
			'www.old-site.test',
			'www.site.test',
		])
		expect([...ownHostSet('https://www.site.test', [])].sort()).toEqual([
			'site.test',
			'www.site.test',
		])
	})
})

describe('classifyOwnDomain', () => {
	it('recognizes the configured own hosts and their www variants', () => {
		expect(classifyOwnDomain('https://old-site.test/about', OWN_HOSTS)).toBe(true)
		expect(classifyOwnDomain('https://www.old-site.test/about', OWN_HOSTS)).toBe(true)
		expect(classifyOwnDomain('https://www.site.test/', OWN_HOSTS)).toBe(true)
		expect(classifyOwnDomain('https://SITE.test/', OWN_HOSTS)).toBe(true)
	})
	it('rejects third-party and malformed URLs', () => {
		expect(classifyOwnDomain('https://www.acme.test/', OWN_HOSTS)).toBe(false)
		expect(classifyOwnDomain('https://site.test.evil.test/', OWN_HOSTS)).toBe(false)
		expect(classifyOwnDomain('not a url', OWN_HOSTS)).toBe(false)
	})
})

describe('factcheckSourceDigest', () => {
	const body = 'Текст со ссылкой https://x.test.'

	it('changes when the title or the body changes', () => {
		const base = factcheckSourceDigest(makeSource('a', body))
		expect(factcheckSourceDigest(makeSource('a', body, { title: 'Другой' }))).not.toBe(base)
		expect(factcheckSourceDigest(makeSource('a', 'Текст со ссылкой https://y.test.'))).not.toBe(
			base,
		)
	})

	it('ignores the managed :::note region, so an end-note never makes a document stale', () => {
		const finding = {
			id: 'prod-x',
			kind: 'product' as const,
			raw: 'Widget 3000',
			status: 'dead' as const,
			evidence: 'снят с производства',
			recommendation: { action: 'end-note' as const, noteRu: 'Widget 3000 снят.' },
			decision: { status: 'accepted' as const, reviewedByOwner: true },
		}
		const digest8 = recommendationDigest(finding).slice(0, 8)
		const withNote = `${body}\n\n:::note{claim="prod-x:${digest8}"}\nWidget 3000 снят.\n:::`
		expect(factcheckSourceDigest(makeSource('a', withNote))).toBe(
			factcheckSourceDigest(makeSource('a', body)),
		)
	})
})

describe('expectedFactcheckTargets', () => {
	it('keys documents by translationKey and keeps the folder as the collection', () => {
		const targets = expectedFactcheckTargets([
			makeSource('photogear', 'a'),
			makeSource('about', 'b', { collection: 'pages' }),
		])
		expect([...targets.keys()].sort()).toEqual(['about', 'photogear'])
		expect(targets.get('about')?.collection).toBe('pages')
		expect(targets.get('photogear')?.collection).toBe('articles')
	})

	it('fails closed on a key repeated across collections', () => {
		expect(() =>
			expectedFactcheckTargets([
				makeSource('about', 'a'),
				makeSource('about', 'b', { collection: 'pages' }),
			]),
		).toThrow(/not unique/)
	})
})

describe('reconcileFactcheck', () => {
	const source = makeSource('photogear', 'РУ тело со ссылкой https://x.test')
	const pageSource = makeSource('about', 'about ru', { collection: 'pages' })
	const sources = [source, pageSource]
	const photogear = (overrides: Partial<FactcheckDocument> = {}) =>
		makeFactcheckDoc({
			key: 'photogear',
			sourceDigest: factcheckSourceDigest(source),
			...overrides,
		})
	const about = (overrides: Partial<FactcheckDocument> = {}) =>
		makeFactcheckDoc({
			key: 'about',
			targetCollection: 'pages',
			sourceDigest: factcheckSourceDigest(pageSource),
			...overrides,
		})

	it('passes when documents exactly cover the src/content set with fresh digests', () => {
		const factcheck = parseFactcheck({ schemaVersion: 1, documents: [photogear(), about()] })
		const report = reconcileFactcheck(factcheck, sources)
		expect(report.errors).toEqual([])
		expect(report.warnings).toEqual([])
		expect(report.counts.documents).toBe(2)
	})

	it('warns, without an error, about a document missing from the ledger', () => {
		const factcheck = parseFactcheck({ schemaVersion: 1, documents: [photogear()] })
		const report = reconcileFactcheck(factcheck, sources)
		expect(report.errors).toEqual([])
		expect(report.warnings).toEqual([expect.stringContaining('missing document "about"')])
	})

	it('flags a key without a src/content document', () => {
		const factcheck = parseFactcheck({
			schemaVersion: 1,
			documents: [photogear(), about(), photogear({ key: 'ghost' })],
		})
		const report = reconcileFactcheck(factcheck, sources)
		expect(report.errors).toEqual([
			expect.stringContaining('"ghost" is not a src/content document'),
		])
		expect(report.warnings).toEqual([])
	})

	it('flags a targetCollection that disagrees with the document folder', () => {
		const factcheck = parseFactcheck({
			schemaVersion: 1,
			documents: [photogear(), about({ targetCollection: 'articles' })],
		})
		const report = reconcileFactcheck(factcheck, sources)
		expect(report.errors).toEqual([
			expect.stringContaining('"about": targetCollection "articles" disagrees'),
		])
	})

	it('warns, without an error, about a stale source digest and clears once it is restamped', () => {
		const edited = makeSource('photogear', 'ДРУГОЕ тело')
		const factcheck = parseFactcheck({ schemaVersion: 1, documents: [photogear(), about()] })
		const report = reconcileFactcheck(factcheck, [edited, pageSource])
		expect(report.errors).toEqual([])
		expect(report.warnings).toEqual([
			expect.stringContaining('"photogear": sourceDigest is stale'),
		])
		const restamped = parseFactcheck({
			schemaVersion: 1,
			documents: [photogear({ sourceDigest: factcheckSourceDigest(edited) }), about()],
		})
		const fresh = reconcileFactcheck(restamped, [edited, pageSource])
		expect(fresh.errors).toEqual([])
		expect(fresh.warnings).toEqual([])
	})

	it('keeps an extra entry an error while a stale digest beside it only warns', () => {
		const edited = makeSource('photogear', 'ДРУГОЕ тело')
		const factcheck = parseFactcheck({
			schemaVersion: 1,
			documents: [photogear(), about(), photogear({ key: 'ghost' })],
		})
		const report = reconcileFactcheck(factcheck, [edited, pageSource])
		expect(report.errors).toEqual([
			expect.stringContaining('"ghost" is not a src/content document'),
		])
		expect(report.warnings).toEqual([
			expect.stringContaining('"photogear": sourceDigest is stale'),
		])
	})

	it('rejects the removed sourceLegacyId field', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [{ ...(photogear() as object), sourceLegacyId: 'wp:article:605' }],
			}),
		).toThrow()
	})
})

describe('schema structural invariants', () => {
	it('rejects fix-in-place without a replacement', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [
					makeFactcheckDoc({
						findings: [
							makeFinding({
								status: 'renamed',
								recommendation: { action: 'fix-in-place' },
							}),
						],
					}),
				],
			}),
		).toThrow()
	})

	it('rejects an unchecked finding carrying a recommendation', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [
					makeFactcheckDoc({
						findings: [
							makeFinding({ recommendation: { action: 'end-note', noteRu: 'x' } }),
						],
					}),
				],
			}),
		).toThrow()
	})

	it('rejects accepted decision without reviewedByOwner', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [
					makeFactcheckDoc({
						findings: [
							makeFinding({
								status: 'dead',
								recommendation: { action: 'end-note', noteRu: 'умер' },
								decision: { status: 'accepted', reviewedByOwner: false },
							}),
						],
					}),
				],
			}),
		).toThrow()
	})
})

describe('verifyFactcheck', () => {
	it('flags an unsafe replacement target', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							status: 'moved',
							recommendation: {
								action: 'fix-in-place',
								replacement: 'javascript:alert(1)',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		const issues = verifyFactcheck(doc)
		expect(
			issues.some((i) => i.code === 'unsafe-replacement' && i.severity === 'blocking'),
		).toBe(true)
	})

	it('flags self-link-rewrite on a non-self-link status', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							status: 'moved',
							recommendation: {
								action: 'self-link-rewrite',
								replacement: '/portfolio',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'action-status-mismatch')).toBe(true)
	})

	it('flags accepting an unchecked finding', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							status: 'unchecked',
							recommendation: { action: 'none' },
							decision: { status: 'accepted', reviewedByOwner: true },
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'accepted-unchecked')).toBe(true)
	})

	it('passes a clean fixable finding with a safe replacement', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							status: 'moved',
							evidence: 'checked 2026-08',
							recommendation: {
								action: 'fix-in-place',
								replacement: 'https://new.example.com/x',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).filter((i) => i.severity === 'blocking')).toEqual([])
	})

	it('enforces the full status→action matrix', () => {
		const build = (status: string, action: string, extra: Record<string, unknown> = {}) =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [
					makeFactcheckDoc({
						findings: [
							makeFinding({
								status: status as never,
								evidence: 'e',
								recommendation: { action: action as never, ...extra },
							}),
						],
					}),
				],
			}).documents[0]!
		const mismatch = (doc: FactcheckDocument) =>
			verifyFactcheck(doc).some((i) => i.code === 'action-status-mismatch')
		// disallowed combinations
		expect(mismatch(build('alive', 'fix-in-place', { replacement: 'https://x.test' }))).toBe(
			true,
		)
		expect(mismatch(build('moved', 'end-note', { noteRu: 'x' }))).toBe(true)
		// allowed combinations
		expect(mismatch(build('dead', 'end-note', { noteRu: 'умер' }))).toBe(false)
		expect(mismatch(build('uncertain', 'end-note', { noteRu: 'неясно' }))).toBe(false)
	})

	it('catches a control-character unsafe-scheme bypass', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							status: 'moved',
							recommendation: {
								action: 'fix-in-place',
								replacement: 'java\tscript:alert(1)',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'unsafe-replacement')).toBe(true)
	})

	it('rejects an HTML-entity scheme-smuggling replacement on a URL finding (not URL-like)', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							kind: 'url',
							status: 'moved',
							recommendation: {
								action: 'fix-in-place',
								replacement: 'javascript&colon;alert(1)',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'non-url-replacement')).toBe(true)
	})

	it('rejects a malformed allowlisted URL with no host', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							status: 'moved',
							recommendation: { action: 'fix-in-place', replacement: 'https://' },
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'unsafe-replacement')).toBe(true)
	})

	it('accepts a plain-text name replacement for a renamed company finding', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							kind: 'company',
							status: 'renamed',
							evidence: 'brand merged',
							recommendation: {
								action: 'fix-in-place',
								replacement: 'Acme Optics (formerly Lumen)',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).filter((i) => i.severity === 'blocking')).toEqual([])
	})

	it('rejects a semicolon-less numeric HTML-reference on a URL finding (not URL-like)', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							kind: 'url',
							status: 'moved',
							evidence: 'x',
							recommendation: {
								action: 'fix-in-place',
								replacement: 'javascript&#58alert(1)',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'non-url-replacement')).toBe(true)
	})

	it('allows a legitimate relative URL with a query string on a URL finding', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							kind: 'url',
							status: 'moved',
							evidence: 'x',
							recommendation: {
								action: 'fix-in-place',
								replacement: '/search?a=1&b=2',
							},
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).filter((i) => i.severity === 'blocking')).toEqual([])
	})

	it('requires a URL/path replacement for a URL finding (rejects a bare name)', () => {
		const doc = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					findings: [
						makeFinding({
							kind: 'url',
							status: 'moved',
							evidence: 'x',
							recommendation: { action: 'fix-in-place', replacement: 'Portfolio' },
						}),
					],
				}),
			],
		}).documents[0]!
		expect(verifyFactcheck(doc).some((i) => i.code === 'non-url-replacement')).toBe(true)
	})
})

describe('factcheck schemaVersion', () => {
	it('names a missing schemaVersion, as the old version key leaves it, and the supported ones', () => {
		expect(() => parseFactcheck({ version: 1, documents: [] })).toThrow(
			`${FACTCHECK_RELATIVE_PATH}: missing schemaVersion; supported: 1`,
		)
		expect(() => parseFactcheck({ schemaVersion: 2, documents: [] })).toThrow(
			`${FACTCHECK_RELATIVE_PATH}: schemaVersion 2 is not supported; supported: 1`,
		)
	})

	it('names the file and the path of a field error', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [makeFactcheckDoc({ key: 1 as never })],
			}),
		).toThrow(`${FACTCHECK_RELATIVE_PATH}: documents.0.key: `)
	})
})

describe('a course of the courses module', () => {
	it('reconciles with targetCollection courses', () => {
		const course = makeSource('night-walk', 'course body', { collection: 'courses' })
		const factcheck = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({
					key: 'night-walk',
					targetCollection: 'courses',
					sourceDigest: factcheckSourceDigest(course),
				}),
			],
		})
		expect(reconcileFactcheck(factcheck, [course])).toMatchObject({
			errors: [],
			warnings: [],
		})
	})
})

describe('factcheck schema document-key uniqueness', () => {
	it('rejects duplicate document keys', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [makeFactcheckDoc({ key: 'dup' }), makeFactcheckDoc({ key: 'dup' })],
			}),
		).toThrow()
	})
})

describe('checkedAt validation', () => {
	it('rejects an impossible calendar date', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [
					makeFactcheckDoc({
						findings: [makeFinding({ checkedAt: '2026-13-40' })],
					}),
				],
			}),
		).toThrow()
	})
})

describe('mergeSeededFindings', () => {
	const existing: FactcheckFinding[] = [
		{
			id: 'url-aaaaaaaa',
			kind: 'url',
			raw: 'https://kept.test',
			status: 'renamed',
			evidence: 'owner-verified',
			recommendation: { action: 'fix-in-place', replacement: 'https://new.test' },
			decision: { status: 'accepted', reviewedByOwner: true },
		},
		{
			id: 'co-vendor',
			kind: 'company',
			raw: 'Vendor',
			status: 'alive',
			recommendation: { action: 'none' },
			decision: { status: 'open', reviewedByOwner: false },
		},
	]

	it('preserves existing findings untouched and appends only missing URLs', () => {
		const merged = mergeSeededFindings(
			existing,
			['https://kept.test', 'https://fresh.test'],
			OWN_HOSTS,
		)
		// existing url finding preserved verbatim (status/evidence/decision intact)
		const kept = merged.find((f) => f.raw === 'https://kept.test')
		expect(kept).toEqual(existing[0])
		// prose finding preserved
		expect(merged.find((f) => f.raw === 'Vendor')).toEqual(existing[1])
		// new url seeded as unchecked/open
		const fresh = merged.find((f) => f.raw === 'https://fresh.test')
		expect(fresh?.status).toBe('unchecked')
		expect(fresh?.decision).toEqual({ status: 'open', reviewedByOwner: false })
		// sorted by id, no duplicates
		expect(merged).toHaveLength(3)
		expect([...merged].map((f) => f.id)).toEqual([...merged].map((f) => f.id).sort())
	})

	it('is idempotent when all URLs already present', () => {
		const once = mergeSeededFindings(existing, ['https://kept.test'], OWN_HOSTS)
		expect(mergeSeededFindings(once, ['https://kept.test'], OWN_HOSTS)).toEqual(once)
	})
})

describe('researchedAt', () => {
	it('accepts a document with a valid researchedAt and rejects an impossible date', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [makeFactcheckDoc({ researchedAt: '2026-08-24' })],
			}),
		).not.toThrow()
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [makeFactcheckDoc({ researchedAt: '2026-13-40' })],
			}),
		).toThrow()
	})
})

describe('unresearchedDocumentKeys', () => {
	it('lists only documents without researchedAt, in file order', () => {
		const factcheck = parseFactcheck({
			schemaVersion: 1,
			documents: [
				makeFactcheckDoc({ key: 'a', researchedAt: '2026-08-24' }),
				makeFactcheckDoc({ key: 'b' }),
				makeFactcheckDoc({ key: 'c' }),
			],
		})
		expect(unresearchedDocumentKeys(factcheck)).toEqual(['b', 'c'])
	})
})

describe('URL coverage by an accepted fix', () => {
	const fixed: FactcheckFinding = {
		id: 'url-old',
		kind: 'url',
		raw: 'https://old.test/page',
		status: 'moved',
		evidence: 'moved to the new host',
		recommendation: { action: 'fix-in-place', replacement: 'https://new.test/page' },
		decision: { status: 'accepted', reviewedByOwner: true },
	}

	it('treats the replacement of an accepted fix as covered, seeding nothing', () => {
		expect(missingUrlFindings([fixed], ['https://new.test/page'])).toEqual([])
		expect(mergeSeededFindings([fixed], ['https://new.test/page'], OWN_HOSTS)).toEqual([fixed])
	})

	it('still seeds the replacement while the fix is not accepted', () => {
		const open: FactcheckFinding = {
			...fixed,
			decision: { status: 'open', reviewedByOwner: false },
		}
		expect(missingUrlFindings([open], ['https://new.test/page'])).toEqual([
			'https://new.test/page',
		])
	})

	it('keeps a URL finding whose URL has left the text', () => {
		expect(mergeSeededFindings([fixed], [], OWN_HOSTS)).toEqual([fixed])
	})
})

describe('recommendationDigest', () => {
	const endNote = (overrides: Partial<FactcheckFinding> = {}): FactcheckFinding => ({
		id: 'prod-x',
		kind: 'product',
		raw: 'Widget 3000',
		status: 'dead',
		evidence: 'снят с производства',
		checkedAt: '2026-08-20',
		recommendation: { action: 'end-note', noteRu: 'Widget 3000 давно снят с производства.' },
		decision: { status: 'accepted', reviewedByOwner: true },
		...overrides,
	})

	it('is stable for an identical recommendation and differs when the payload changes', () => {
		const a = endNote()
		expect(recommendationDigest(a)).toBe(recommendationDigest(endNote()))
		expect(recommendationDigest(a)).not.toBe(
			recommendationDigest(
				endNote({ recommendation: { action: 'end-note', noteRu: 'Иная заметка.' } }),
			),
		)
		expect(recommendationDigest(a)).not.toBe(
			recommendationDigest(endNote({ raw: 'Widget 4000' })),
		)
	})

	it('rejects decision fields beyond status and reviewedByOwner', () => {
		expect(() =>
			parseFactcheck({
				schemaVersion: 1,
				documents: [
					makeFactcheckDoc({
						findings: [
							{
								...endNote(),
								decision: { status: 'accepted', reviewedByOwner: true, note: 'x' },
							} as unknown as FactcheckFinding,
						],
					}),
				],
			}),
		).toThrow()
	})
})

describe('findingId', () => {
	const sha = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex')

	it('prefixes the first 8 hex of sha256(raw) by kind', () => {
		expect(findingId('url', 'https://a.test')).toBe(`url-${sha('https://a.test').slice(0, 8)}`)
		expect(findingId('company', 'Acme')).toBe(`co-${sha('Acme').slice(0, 8)}`)
		expect(findingId('product', 'Widget')).toBe(`prod-${sha('Widget').slice(0, 8)}`)
		expect(findingId('claim', 'Fact')).toBe(`claim-${sha('Fact').slice(0, 8)}`)
	})

	it('lengthens the slice on a collision with a taken id', () => {
		const short = findingId('company', 'Acme')
		expect(findingId('company', 'Acme', new Set([short]))).toBe(
			`co-${sha('Acme').slice(0, 12)}`,
		)
	})
})

describe('mergeResearchFindings', () => {
	const decided = makeFinding({
		id: 'url-aaaaaaaa',
		status: 'alive',
		evidence: 'old evidence',
		location: 'intro',
		checkedAt: '2026-01-01',
		decision: { status: 'rejected', reviewedByOwner: false },
	})
	const untouched = makeFinding({ id: 'co-bbbbbbbb', kind: 'company', raw: 'Kept' })
	const document = parseFactcheck({
		schemaVersion: 1,
		documents: [makeFactcheckDoc({ findings: [decided, untouched] })],
	}).documents[0]!

	it('keeps the decision of a matched finding while its recommendation is unchanged', () => {
		const merged = mergeResearchFindings(
			document,
			[
				{
					raw: decided.raw,
					kind: 'url',
					status: 'alive',
					evidence: 'still online',
					recommendation: { action: 'none' },
				},
			],
			'2026-10-13',
		)
		expect(merged.findings.find((finding) => finding.id === decided.id)).toEqual({
			id: decided.id,
			kind: 'url',
			raw: decided.raw,
			status: 'alive',
			evidence: 'still online',
			checkedAt: '2026-10-13',
			recommendation: { action: 'none' },
			decision: decided.decision,
		})
	})

	it('updates a matched finding and reopens it when the recommendation changes', () => {
		const merged = mergeResearchFindings(
			document,
			[
				{
					raw: decided.raw,
					kind: 'url',
					status: 'dead',
					recommendation: { action: 'end-note', noteRu: 'Сайт закрыт.' },
				},
			],
			'2026-10-13',
		)
		expect(merged.findings.find((finding) => finding.id === decided.id)).toEqual({
			id: decided.id,
			kind: 'url',
			raw: decided.raw,
			status: 'dead',
			checkedAt: '2026-10-13',
			recommendation: { action: 'end-note', noteRu: 'Сайт закрыт.' },
			decision: { status: 'open', reviewedByOwner: false },
		})
		expect(merged.findings.find((finding) => finding.id === untouched.id)).toEqual(untouched)
	})

	it('adds a new finding as open with a deterministic id, sorted by id', () => {
		const merged = mergeResearchFindings(
			document,
			[{ raw: 'Acme', kind: 'company', status: 'alive', recommendation: { action: 'none' } }],
			'2026-10-13',
		)
		const added = merged.findings.find((finding) => finding.raw === 'Acme')!
		expect(added.id).toBe(findingId('company', 'Acme'))
		expect(added.decision).toEqual({ status: 'open', reviewedByOwner: false })
		expect(merged.findings.map((finding) => finding.id)).toEqual(
			merged.findings.map((finding) => finding.id).sort(),
		)
	})

	it('matches by (kind, raw), not raw alone', () => {
		const merged = mergeResearchFindings(
			document,
			[{ raw: 'Kept', kind: 'product', status: 'alive', recommendation: { action: 'none' } }],
			'2026-10-13',
		)
		expect(merged.findings).toHaveLength(3)
	})

	it.each([
		['not an array', { raw: 'x' }],
		[
			'an extra field',
			[
				{
					id: 'x',
					raw: 'x',
					kind: 'claim',
					status: 'alive',
					recommendation: { action: 'none' },
				},
			],
		],
		[
			'a duplicate (kind, raw)',
			[
				{ raw: 'x', kind: 'claim', status: 'alive', recommendation: { action: 'none' } },
				{ raw: 'x', kind: 'claim', status: 'dead', recommendation: { action: 'none' } },
			],
		],
	])('rejects %s', (_label, input) => {
		expect(() => mergeResearchFindings(document, input, '2026-10-13')).toThrow()
	})

	it('rejects a non-calendar date', () => {
		expect(() => mergeResearchFindings(document, [], '2026-02-30')).toThrow(/YYYY-MM-DD/)
	})
})

describe('setFindingDecisions', () => {
	const document = parseFactcheck({
		schemaVersion: 1,
		documents: [makeFactcheckDoc({ findings: [makeFinding({ status: 'alive' })] })],
	}).documents[0]!

	it('sets the status and derives reviewedByOwner', () => {
		const accepted = setFindingDecisions(document, new Map([['url-1', 'accepted']]))
		expect(accepted.findings[0]!.decision).toEqual({
			status: 'accepted',
			reviewedByOwner: true,
		})
		const deferred = setFindingDecisions(accepted, new Map([['url-1', 'deferred']]))
		expect(deferred.findings[0]!.decision).toEqual({
			status: 'deferred',
			reviewedByOwner: false,
		})
	})

	it('rejects an unknown id or status', () => {
		expect(() => setFindingDecisions(document, new Map([['url-2', 'open']]))).toThrow(
			/no finding/,
		)
		expect(() => setFindingDecisions(document, new Map([['url-1', 'maybe']]))).toThrow(
			/decision status/,
		)
	})
})

describe('markDocumentResearched', () => {
	it('stamps researchedAt and the current source digest', () => {
		const document = parseFactcheck({
			schemaVersion: 1,
			documents: [makeFactcheckDoc({ sourceDigest: 'a'.repeat(64) })],
		}).documents[0]!
		const source = makeSource('photogear', 'Новое тело')
		expect(markDocumentResearched(document, source, '2026-10-13')).toEqual({
			...document,
			researchedAt: '2026-10-13',
			sourceDigest: factcheckSourceDigest(source),
		})
	})
})
