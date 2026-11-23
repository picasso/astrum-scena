import './contact-form.css'

import {
	type ChangeEvent,
	type FocusEvent,
	type SyntheticEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react'

import type { Locale } from '../config/locale-schema'
import { contactSubmissionSchema } from '../lib/contact/schema'
import { TURNSTILE_SRC } from '../lib/contact/turnstile-script'

// state behaviour is taken from the legacy theme's Contact-Plus form (`sass/optionals/_cplus.scss`
// plus the owner's screenshots): a summary banner on top, labels and asterisks coloured by field
// validity, a red glow on errors, a spinner while sending, and values kept after success;
// validation uses the same `contactSubmissionSchema` the server re-checks

type Status = 'idle' | 'submitting' | 'success' | 'error'
// field validation failure / missing Turnstile token / send failure (network or server)
type ErrorKind = 'validation' | 'challenge' | 'mailfail'
type FieldKey = 'name' | 'email' | 'message'
type FieldState = 'idle' | 'error' | 'success'

export type ContactStrings = {
	name: string
	email: string
	message: string
	send: string
	sending: string
	// disabled-button label while the lazily loaded Turnstile has not yet issued a token
	verifying: string
	// summary banner on top (legacy `.cplus-status`)
	success: string
	mailFailed: string
	summaryError: string
	challenge: string
	// inline errors under the fields (legacy per-field `.validation`)
	requiredName: string
	requiredEmail: string
	requiredMessage: string
	tooLong: string
	invalidEmail: string
}

// decorative: `required` on the control tells AT; CSS colours it by field state
function RequiredMark() {
	return (
		<span className="contact-form__req" aria-hidden="true">
			{' '}
			*
		</span>
	)
}

// legacy `mail.svg` from the approved `sources/_minified/icons` set, with fill #444 replaced by
// currentColor so the info-tone `.note__icon` colours it
function IntroIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="currentColor"
				d="M19 5.5H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-9.684 7.316l1.602 1.4c.305.266.691.398 1.082.398.391 0 .777-.133 1.082-.398l1.602-1.4-.037.037 3.646 3.646H5.707l3.646-3.646-.037-.037zM5 15.793V9.04l3.602 3.151L5 15.793zm10.398-3.602L19 9.04v6.75l-3.602-3.599zM19 7.5v.21l-6.576 5.754a.68.68 0 0 1-.848 0L5 7.71V7.5h14z"
			/>
		</svg>
	)
}

function SummaryIcon({ kind }: { kind: 'success' | 'error' }) {
	if (kind === 'success') {
		return (
			<svg className="contact-form__summary-icon" viewBox="0 0 24 24" aria-hidden="true">
				<rect
					x="2"
					y="5"
					width="20"
					height="14"
					rx="2"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				/>
				<path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="2" />
			</svg>
		)
	}
	return (
		<svg className="contact-form__summary-icon" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
			<path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
		</svg>
	)
}

export type ContactFormProps = {
	locale: Locale
	siteKey: string
	strings: ContactStrings
	// legacy `.cplus-subheading`: shares the top slot with the status banner, hidden while it shows
	subheading?: string
	privacyNotice: { lead: string; label: string; href: string }
	endpoint?: string
	action?: string
}

// minimal type for the Turnstile global, to avoid a types package
type TurnstileApi = {
	render: (
		el: HTMLElement,
		opts: {
			sitekey: string
			action?: string
			callback: (token: string) => void
			'error-callback'?: () => void
			'expired-callback'?: () => void
		},
	) => string
	reset: (id?: string) => void
}
type TurnstileWindow = Window & {
	turnstile?: TurnstileApi
	__turnstileLoading?: Promise<void>
}

const turnstileWindow = (): TurnstileWindow => window

function loadTurnstile(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve()
	const w = turnstileWindow()
	if (w.turnstile) return Promise.resolve()
	if (w.__turnstileLoading) return w.__turnstileLoading
	w.__turnstileLoading = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script')
		script.src = TURNSTILE_SRC
		script.async = true
		script.defer = true
		script.addEventListener('load', () => resolve())
		script.addEventListener('error', () => reject(new Error('turnstile failed to load')))
		document.head.appendChild(script)
	})
	return w.__turnstileLoading
}

export function ContactForm({
	locale,
	siteKey,
	strings,
	subheading,
	privacyNotice,
	endpoint = '/api/contact',
	action = 'contact',
}: ContactFormProps) {
	const [values, setValues] = useState({ name: '', email: '', message: '', company: '' })
	const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
	const [status, setStatus] = useState<Status>('idle')
	const [errorKind, setErrorKind] = useState<ErrorKind | null>(null)
	// fields get validity colours only after the first submit (legacy `.cplus-processed`)
	const [processed, setProcessed] = useState(false)
	const [token, setToken] = useState('')
	// while the lazy Turnstile is loading, submit is blocked (disabled button, no-op onSubmit); a
	// token that is still missing afterwards, failed or expired, is caught by validation
	const [turnstileLoading, setTurnstileLoading] = useState(false)

	const uid = useId()
	const fieldId = (key: string) => `${uid}-${key}`
	const errorId = (key: string) => `${uid}-${key}-error`

	const widgetRef = useRef<HTMLDivElement>(null)
	const widgetId = useRef<string | null>(null)
	const summaryRef = useRef<HTMLParagraphElement>(null)

	// the Turnstile script loads on the first field focus, not on mount, keeping it off the critical
	// path: Lighthouse never interacts with the page, so the script does not drag down
	// /contacts/ performance, while a real user has a token by the time the form is filled
	const turnstileStarted = useRef(false)
	const startTurnstile = () => {
		if (turnstileStarted.current) return
		turnstileStarted.current = true
		setTurnstileLoading(true)
		loadTurnstile()
			.then(() => {
				if (!widgetRef.current) return // unmounted while loading
				const { turnstile } = turnstileWindow()
				if (!turnstile) {
					setTurnstileLoading(false) // the server still rejects the empty token
					return
				}
				widgetId.current = turnstile.render(widgetRef.current, {
					sitekey: siteKey,
					action,
					callback: (value) => {
						setToken(value)
						setTurnstileLoading(false)
					},
					'error-callback': () => {
						setToken('')
						setTurnstileLoading(false)
					},
					'expired-callback': () => setToken(''),
				})
			})
			.catch(() => {
				// unblock anyway: the server still rejects the empty token
				setTurnstileLoading(false)
			})
	}

	// only a field focus starts loading: focusing the submit button would disable it and swallow
	// its own click
	const handleFieldFocus = (event: FocusEvent<HTMLFormElement>) => {
		const tag = (event.target as HTMLElement).tagName
		if (tag === 'INPUT' || tag === 'TEXTAREA') startTurnstile()
	}

	// focus the summary so AT announces the outcome; a validation failure focuses the first invalid
	// field in onSubmit instead
	useEffect(() => {
		if (status === 'success' || (status === 'error' && errorKind !== 'validation')) {
			summaryRef.current?.focus()
		}
	}, [status, errorKind])

	const resetTurnstile = () => {
		setToken('')
		const { turnstile } = turnstileWindow()
		if (turnstile && widgetId.current) turnstile.reset(widgetId.current)
	}

	const update =
		(key: keyof typeof values) =>
		(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			// read synchronously: React runs the functional updater later, when currentTarget is
			// already null, and reading it there throws and unmounts the island
			const { value } = event.currentTarget
			setValues((prev) => ({ ...prev, [key]: value }))
		}

	async function onSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
		event.preventDefault()
		if (status === 'submitting') return
		// the button is disabled too, but Enter in a field still submits
		if (turnstileLoading) return
		setProcessed(true)

		const candidate = {
			locale,
			name: values.name,
			email: values.email,
			message: values.message,
			token,
			company: values.company,
		}
		const result = contactSubmissionSchema.safeParse(candidate)
		if (!result.success) {
			const next: Partial<Record<FieldKey, string>> = {}
			let tokenMissing = false
			for (const issue of result.error.issues) {
				const path = issue.path[0]
				if (path === 'token') {
					tokenMissing = true
					continue
				}
				if (
					issue.message.endsWith('too long') ||
					issue.message === 'submission is too large'
				) {
					if (path === 'name' || path === 'email' || path === 'message')
						next[path] = strings.tooLong
				} else if (path === 'name') next.name = strings.requiredName
				else if (path === 'email')
					next.email = values.email.trim() ? strings.invalidEmail : strings.requiredEmail
				else if (path === 'message') next.message = strings.requiredMessage
			}
			setErrors(next)
			const firstInvalid = (['name', 'email', 'message'] as FieldKey[]).find((k) => next[k])
			if (firstInvalid) {
				setErrorKind('validation')
				setStatus('error')
				document.getElementById(fieldId(firstInvalid))?.focus()
			} else if (tokenMissing) {
				// autofill can fill the fields without a focus, so Turnstile may not have started
				// yet: start it here and let the user resend once the token arrives, rather than
				// dead-ending on a challenge error that has no recovery
				if (!turnstileStarted.current) {
					startTurnstile()
				} else {
					setErrorKind('challenge')
					setStatus('error')
				}
			}
			return
		}

		setErrors({})
		setErrorKind(null)
		setStatus('submitting')
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(result.data),
			})
			if (response.ok) {
				// values are kept after success, as in the legacy form
				setStatus('success')
				resetTurnstile()
			} else {
				setStatus('error')
				setErrorKind('mailfail')
				resetTurnstile()
			}
		} catch {
			setStatus('error')
			setErrorKind('mailfail')
			resetTurnstile()
		}
	}

	const busy = status === 'submitting'
	// legacy `.cplus-control.error|.success`
	const fieldState = (key: FieldKey): FieldState =>
		!processed ? 'idle' : errors[key] ? 'error' : 'success'

	const summaryKind: 'success' | 'error' | null =
		status === 'success' ? 'success' : status === 'error' ? 'error' : null
	const summaryText =
		status === 'success'
			? strings.success
			: status === 'error'
				? errorKind === 'challenge'
					? strings.challenge
					: errorKind === 'mailfail'
						? strings.mailFailed
						: strings.summaryError
				: ''

	return (
		<form
			className={`contact-form${busy ? ' is-submitting' : ''}`}
			onSubmit={onSubmit}
			onFocusCapture={handleFieldFocus}
			noValidate
		>
			{/* one reserved slot, as in the legacy form, so the fields never jump: the intro at
			    rest, the spinner while sending, the status banner after; only one shows at a time */}
			<div className="contact-form__masthead">
				<p
					ref={summaryRef}
					className={`contact-form__summary${summaryKind ? ` is-${summaryKind}` : ''}`}
					role="status"
					aria-live="polite"
					tabIndex={-1}
				>
					{summaryKind && <SummaryIcon kind={summaryKind} />}
					<span>{summaryText}</span>
				</p>

				{/* reuses the `:::note` info-tone markup and CSS with i18n text; `is-concealed`
				    hides it by visibility, not `hidden`, because preflight makes `[hidden]`
				    display:none !important and the intro must keep the slot height */}
				{subheading && (
					<div
						className={`note note--info contact-form__subheading${summaryKind || busy ? ' is-concealed' : ''}`}
						role="note"
					>
						<span className="note__icon" aria-hidden="true">
							<IntroIcon />
						</span>
						<div className="contact-form__subheading-copy">
							<p>
								{subheading} {privacyNotice.lead}{' '}
								<a href={privacyNotice.href}>{privacyNotice.label}</a>.
							</p>
						</div>
					</div>
				)}

				{busy && (
					<div className="contact-form__loader" aria-hidden="true">
						<span className="contact-form__ring" />
					</div>
				)}
			</div>

			<div className={`contact-form__field is-${fieldState('name')}`}>
				<label className="contact-form__label" htmlFor={fieldId('name')}>
					{strings.name}
					<RequiredMark />
				</label>
				<input
					id={fieldId('name')}
					className="contact-form__input"
					name="name"
					type="text"
					autoComplete="name"
					value={values.name}
					onChange={update('name')}
					aria-invalid={errors.name ? 'true' : undefined}
					aria-describedby={errors.name ? errorId('name') : undefined}
					disabled={busy}
					required
				/>
				{errors.name && (
					<span id={errorId('name')} className="contact-form__error">
						{errors.name}
					</span>
				)}
			</div>

			<div className={`contact-form__field is-${fieldState('email')}`}>
				<label className="contact-form__label" htmlFor={fieldId('email')}>
					{strings.email}
					<RequiredMark />
				</label>
				<input
					id={fieldId('email')}
					className="contact-form__input"
					name="email"
					type="email"
					autoComplete="email"
					value={values.email}
					onChange={update('email')}
					aria-invalid={errors.email ? 'true' : undefined}
					aria-describedby={errors.email ? errorId('email') : undefined}
					disabled={busy}
					required
				/>
				{errors.email && (
					<span id={errorId('email')} className="contact-form__error">
						{errors.email}
					</span>
				)}
			</div>

			<div className={`contact-form__field is-${fieldState('message')}`}>
				<label className="contact-form__label" htmlFor={fieldId('message')}>
					{strings.message}
					<RequiredMark />
				</label>
				<textarea
					id={fieldId('message')}
					className="contact-form__input contact-form__textarea"
					name="message"
					rows={6}
					value={values.message}
					onChange={update('message')}
					aria-invalid={errors.message ? 'true' : undefined}
					aria-describedby={errors.message ? errorId('message') : undefined}
					disabled={busy}
					required
				/>
				{errors.message && (
					<span id={errorId('message')} className="contact-form__error">
						{errors.message}
					</span>
				)}
			</div>

			{/* honeypot: bots fill it, people and AT never reach it */}
			<div className="contact-form__hp" aria-hidden="true">
				<label htmlFor={fieldId('company')}>Company</label>
				<input
					id={fieldId('company')}
					name="company"
					type="text"
					tabIndex={-1}
					autoComplete="off"
					value={values.company}
					onChange={update('company')}
				/>
			</div>

			{/* the legacy form has no "* required fields" note */}
			<div ref={widgetRef} className="contact-form__turnstile" />

			<div className="contact-form__actions">
				<button
					className="contact-form__submit"
					type="submit"
					disabled={busy || turnstileLoading}
					aria-busy={busy || turnstileLoading}
				>
					{busy ? strings.sending : turnstileLoading ? strings.verifying : strings.send}
				</button>
			</div>
		</form>
	)
}
