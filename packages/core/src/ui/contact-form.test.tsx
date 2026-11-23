// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CONTACT_LIMITS } from '../lib/contact/schema.ts'
import { ContactForm, type ContactStrings } from './contact-form'

// built here rather than taken from the i18n dictionary: the tests cover behaviour, not copy
const strings: ContactStrings = {
	name: 'Name',
	email: 'Email',
	message: 'Message',
	send: 'Send',
	sending: 'Sending…',
	verifying: 'Loading…',
	success: 'Success! Your message was sent.',
	mailFailed: 'Sorry, your message could not be sent. Please try again.',
	summaryError: 'There was a problem with your submission. Errors have been highlighted below.',
	requiredName: 'Please give your name.',
	requiredEmail: 'Please give your email address.',
	requiredMessage: 'Please give a message.',
	tooLong: 'Please shorten your message.',
	invalidEmail: 'Please give a valid email address.',
	challenge: 'Please complete the verification and try again.',
}

function renderForm(props: Partial<ComponentProps<typeof ContactForm>> = {}) {
	return render(
		<ContactForm
			locale="en"
			siteKey="test-key"
			strings={strings}
			privacyNotice={{
				lead: 'For details, see the',
				label: 'Privacy Policy',
				href: '/en/privacy/',
			}}
			{...props}
		/>,
	)
}

const nameField = () => screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
const emailField = () => screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement
const messageField = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
// selected by role alone because its label changes with state (Send / Sending… / Loading…)
const sendButton = () => screen.getByRole('button')
const loader = () => document.querySelector('.contact-form__loader')

// synchronous Turnstile whose render issues the token at once
function stubTurnstile(token = 'turnstile-token') {
	const api = {
		render: (_el: HTMLElement, opts: { callback: (t: string) => void }) => {
			opts.callback(token)
			return 'widget-id'
		},
		reset: vi.fn(),
	}
	vi.stubGlobal('turnstile', api)
	return api
}

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	// the lazy loader caches its promise on window
	delete (window as unknown as { __turnstileLoading?: Promise<void> }).__turnstileLoading
	document.querySelectorAll('script[src*="turnstile"]').forEach((s) => s.remove())
})

// emulates autofill or a password manager: the value is set without a focus, so the lazy Turnstile
// start on field focus never fires
function fillWithoutFocus(selector: string, value: string): void {
	const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
	if (!el) throw new Error(`field not found: ${selector}`)
	const proto =
		el instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype
	Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
	el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ContactForm', () => {
	it('renders the privacy link in the introductory note before hydration', () => {
		const html = renderToStaticMarkup(
			<ContactForm
				locale="ru"
				siteKey="test-key"
				strings={strings}
				subheading="Напишите мне о печати, лицензировании или о любом вопросе по моим фотографиям."
				privacyNotice={{
					lead: 'Об обработке данных и ваших правах – в',
					label: 'Политике конфиденциальности',
					href: '/ru/privacy/',
				}}
			/>,
		)
		expect(html).toContain('contact-form__subheading')
		expect(html).toContain('href="/ru/privacy/"')
		expect(html.indexOf('href="/ru/privacy/"')).toBeLessThan(html.indexOf('name="name"'))
		expect(html).toContain(
			'<p>Напишите мне о печати, лицензировании или о любом вопросе по моим фотографиям. Об обработке данных и ваших правах – в <a href="/ru/privacy/">Политике конфиденциальности</a>.</p>',
		)
	})

	// regression: reading event.currentTarget inside the deferred updater threw on the second
	// character and unmounted the island
	it('keeps the form mounted and controlled while typing several characters', async () => {
		const user = userEvent.setup()
		renderForm()

		await user.type(nameField(), 'Alice')

		expect(nameField().value).toBe('Alice')
		expect(sendButton()).toBeTruthy()
	})

	it('blocks an empty submit, shows the summary and per-field errors, and never calls the endpoint', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const user = userEvent.setup()
		renderForm()

		await user.click(sendButton())

		expect(fetchMock).not.toHaveBeenCalled()
		await waitFor(() => {
			expect(screen.getByText(strings.summaryError)).toBeTruthy()
		})
		expect(screen.getByText(strings.requiredName)).toBeTruthy()
		expect(screen.getByText(strings.requiredEmail)).toBeTruthy()
		expect(screen.getByText(strings.requiredMessage)).toBeTruthy()
	})

	it('flags a malformed email and does not submit', async () => {
		// the field focus starts the lazy load; the stub resolves it so the button stays enabled
		stubTurnstile('tok-123')
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const user = userEvent.setup()
		renderForm()

		await user.type(nameField(), 'Alice')
		await user.type(emailField(), 'not-an-email')
		await user.type(messageField(), 'A perfectly valid message body.')
		await user.click(sendButton())

		await waitFor(() => {
			expect(screen.getByText(strings.invalidEmail)).toBeTruthy()
		})
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('arms Turnstile from submit when fields were filled without focus (autofill), not a dead-end', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const user = userEvent.setup()
		renderForm()

		fillWithoutFocus('input[name="name"]', 'Auto Fill')
		fillWithoutFocus('input[name="email"]', 'auto@example.com')
		fillWithoutFocus('textarea[name="message"]', 'Filled by a password manager without focus.')

		// with no Turnstile stub its load never resolves and the form waits for the token
		await user.click(sendButton())

		await waitFor(() => expect((sendButton() as HTMLButtonElement).disabled).toBe(true))
		expect(sendButton().textContent).toBe(strings.verifying)
		expect(fetchMock).not.toHaveBeenCalled()
		expect(screen.queryByText(strings.challenge)).toBeNull()
	})

	it('submits a valid payload, shows success, and KEEPS the field values (legacy)', async () => {
		stubTurnstile('tok-123')
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		)
		vi.stubGlobal('fetch', fetchMock)
		const user = userEvent.setup()
		renderForm()

		await user.type(nameField(), 'Alice')
		await user.type(emailField(), 'alice@example.com')
		await user.type(messageField(), 'Hello, I would like a print.')
		await user.click(sendButton())

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
		expect(url).toBe('/api/contact')
		expect(init.method).toBe('POST')
		expect(JSON.parse(init.body as string)).toMatchObject({
			locale: 'en',
			name: 'Alice',
			email: 'alice@example.com',
			message: 'Hello, I would like a print.',
			token: 'tok-123',
		})

		await waitFor(() => expect(screen.getByText(strings.success)).toBeTruthy())
		expect(nameField().value).toBe('Alice')
		expect(messageField().value).toBe('Hello, I would like a print.')
	})

	it('shows the sending spinner while the request is in flight, then resolves to success', async () => {
		stubTurnstile('tok-123')
		let resolveFetch!: (response: Response) => void
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve
				}),
		)
		vi.stubGlobal('fetch', fetchMock)
		const user = userEvent.setup()
		renderForm()

		await user.type(nameField(), 'Alice')
		await user.type(emailField(), 'alice@example.com')
		await user.type(messageField(), 'Hello, I would like a print.')
		await user.click(sendButton())

		await waitFor(() => expect(loader()).not.toBeNull())
		expect((sendButton() as HTMLButtonElement).disabled).toBe(true)

		resolveFetch(
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		)

		await waitFor(() => expect(loader()).toBeNull())
		expect(screen.getByText(strings.success)).toBeTruthy()
	})

	it('shows the mail-failed summary when the endpoint responds non-ok', async () => {
		stubTurnstile('tok-123')
		const fetchMock = vi.fn(async () => new Response('nope', { status: 502 }))
		vi.stubGlobal('fetch', fetchMock)
		const user = userEvent.setup()
		renderForm()

		await user.type(nameField(), 'Alice')
		await user.type(emailField(), 'alice@example.com')
		await user.type(messageField(), 'Hello, I would like a print.')
		await user.click(sendButton())

		await waitFor(() => expect(screen.getByText(strings.mailFailed)).toBeTruthy())
	})

	it('hides the honeypot field from assistive tech and tab order', () => {
		renderForm()
		expect(screen.queryByRole('textbox', { name: /company/i })).toBeNull()
		const honeypot = document.querySelector<HTMLInputElement>('input[name="company"]')
		expect(honeypot).not.toBeNull()
		expect(honeypot?.tabIndex).toBe(-1)
	})
})

it('shows the length error instead of asking for an empty message', async () => {
	stubTurnstile()
	const transport = vi.fn()
	vi.stubGlobal('fetch', transport)
	const user = userEvent.setup()
	renderForm()
	await user.type(nameField(), 'N'.repeat(80))
	await user.type(emailField(), 'jane@example.com')
	fireEvent.change(messageField(), { target: { value: 'M'.repeat(4000) } })
	await user.click(sendButton())
	expect(screen.getByText(strings.tooLong)).toBeTruthy()
	expect(screen.queryByText(strings.requiredMessage)).toBeNull()
	expect(messageField().getAttribute('aria-invalid')).toBe('true')
	expect(transport).not.toHaveBeenCalled()
})

it.each([
	['name', 'Ж'.repeat(Math.floor(CONTACT_LIMITS.name / 2) + 1)],
	['message', '😀'.repeat(Math.floor(CONTACT_LIMITS.message / 4) + 1)],
] as const)('shows the length error when %s exceeds its UTF-8 byte limit', async (field, value) => {
	stubTurnstile()
	const transport = vi.fn()
	vi.stubGlobal('fetch', transport)
	const user = userEvent.setup()
	renderForm()
	fireEvent.change(nameField(), { target: { value: field === 'name' ? value : 'Jane' } })
	fireEvent.change(emailField(), { target: { value: 'jane@example.com' } })
	fireEvent.change(messageField(), { target: { value: field === 'message' ? value : 'Hello' } })
	await user.click(sendButton())
	expect(screen.getByText(strings.tooLong)).toBeTruthy()
	expect(screen.queryByText(strings.requiredName)).toBeNull()
	expect(screen.queryByText(strings.requiredMessage)).toBeNull()
	expect((field === 'name' ? nameField() : messageField()).getAttribute('aria-invalid')).toBe(
		'true',
	)
	expect(transport).not.toHaveBeenCalled()
})
