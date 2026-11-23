import type { DocumentSurfaceKind, ExcerptHiddenBelow } from '../../config/site-schema.ts'
import type { PictureModel } from '../images/media.ts'

// one model serves every tiled or listed collection (albums, articles, courses); each domain's
// build-data resolves the data so presentation receives finished models

// media and excerpt are optional: a document may have no `coverId` and a body with no excerpt to
// derive, and the card must still look finished
export type CardModel = {
	href: string
	title: string
	excerpt?: string
	media?: PictureModel
	// set with `media` on document cards so the page can tell the footer promo it is already shown
	photoId?: string
	// cover focal point in %, used only by fixed-ratio frames (`ratio` ≠ original); else centred
	focal?: { x: number; y: number }
	mediaPlaceholder?: boolean
	ratio?: 'pano' | 'vista' | 'landscape' | 'square' | 'portrait' | 'original'
	// course cards only; the label is already localized
	badge?: { status: 'archive' | 'current'; label: string }
}

// the thumbnail surface follows the configured layout (masonry stretches to the column, a list
// shows a fixed thumbnail), kept in one place so a page cannot pick sizes apart from its layout
export type DocumentCardSurface = 'documentCard' | 'documentListItem'

export function documentCardSurface(kind: DocumentSurfaceKind): DocumentCardSurface {
	return kind === 'list' ? 'documentListItem' : 'documentCard'
}

// modifier that hides the card excerpt below a breakpoint (legacy hid it below 768). The threshold is
// an enum of implemented values because a media query cannot read a custom property; each value has
// its own static rule in card.css.
const EXCERPT_HIDE_CLASS: Record<Exclude<ExcerptHiddenBelow, 'off'>, string> = {
	480: 'cards--excerpt-hidden-480',
	768: 'cards--excerpt-hidden-768',
	1024: 'cards--excerpt-hidden-1024',
}

export function excerptHiddenClass(threshold: ExcerptHiddenBelow): string | undefined {
	return threshold === 'off' ? undefined : EXCERPT_HIDE_CLASS[threshold]
}
