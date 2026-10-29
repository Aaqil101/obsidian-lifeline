/**
 * Settings shape, defaults, and the two checklists that drive the Channels.md
 * fields and Dashboard sub-pages. Split out of settings.ts so the tab and
 * every page module share one import with no cycle back into the UI.
 *
 * No Google credential ever lands in data.json: the client ID, client secret,
 * and refresh token all live in the Obsidian keychain, and only their *names*
 * are persisted here. Collected playlist IDs live in data.json and nowhere
 * else.
 */
import { DEFAULT_SCRIPTS_FOLDER } from '../dashboardScript';
import { DEFAULT_OUTPUT_FOLDER } from '../markdown';
import {
	DEFAULT_STYLES_FOLDER,
	DEFAULT_VIEW_PAGE_SIZE,
	type NoteViewKind,
} from '../noteViewsScript';
import {
	DEFAULT_CHANNELS_FIELDS,
	DEFAULT_DASHBOARD_LIMITS,
	DEFAULT_DASHBOARD_SECTIONS,
	type ChannelsFieldSettings,
	type DashboardLimits,
	type DashboardSections,
	type ImageMode,
	type PlaylistSummary,
} from '../types';

/** Layout of one opt-in note view. The old `mixed` value is gone entirely,
 *  and so is `cards`: the poster card superseded it on every note type. The
 *  migration lands `cards`, `mixed`, and anything unrecognized on poster, and
 *  a stale value an old note can still bake in falls back the same way at
 *  render time. */
export type NoteLayout = 'table' | 'chips' | 'poster';

/**
 * Where the hero crop of a picked banner centers, in percent of the image
 * each way (0-100). A channel banner is far wider than the hero strip, so
 * `object-fit: cover` throws away everything outside this point's column and
 * row; this is the point the crop keeps. The middle (50, 50) is what the
 * hero drew before the crop was pickable, so an unset value changes nothing.
 */
export interface HeroFocusPoint {
	x: number;
	y: number;
}

/** The default crop: the center of the banner, matching the old behavior. */
export const DEFAULT_HERO_FOCUS: HeroFocusPoint = { x: 50, y: 50 };

/** Clamp a possibly hand-edited stored focus back into 0-100 each way, so a
 *  bad value in data.json cannot push the crop off the image entirely. Each
 *  axis falls back on its own: one bad number should not reset the other. */
export function normalizeHeroFocus(value: Partial<HeroFocusPoint> | null | undefined): HeroFocusPoint {
	const axis = (n: unknown): number | null =>
		typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
	return {
		x: axis(value?.x) ?? DEFAULT_HERO_FOCUS.x,
		y: axis(value?.y) ?? DEFAULT_HERO_FOCUS.y,
	};
}

/** One choice in a layout dropdown, in menu order (the same order the
 *  segmented control in the note shows). Deliberately no Mixed: within one
 *  note type it is just a slower way of naming the other value. */
export const NOTE_LAYOUT_OPTIONS: Array<{ value: NoteLayout; label: string }> = [
	{ value: 'poster', label: 'Poster' },
	{ value: 'chips', label: 'Chips' },
	{ value: 'table', label: 'Table' },
];

/** The same dropdown per note type. Every kind offers the same three layouts;
 *  the key stays per kind because the value itself is per kind, and the
 *  Channels poster is a channel shape (banner backdrop, avatar, counts) while
 *  the video poster is a thumbnail card. */
export const NOTE_LAYOUT_OPTIONS_BY_KIND: Record<
	NoteViewKind,
	Array<{ value: NoteLayout; label: string }>
> = {
	channels: NOTE_LAYOUT_OPTIONS,
	playlists: NOTE_LAYOUT_OPTIONS,
	watchlater: NOTE_LAYOUT_OPTIONS,
};

/** Layout of each note type's view, one row per type in the Notes group.
 *  Split per type because the notes are read differently: a long Watch Later
 *  queue scans better as a dense table while a curated playlist shows off
 *  its thumbnail as posters, and one shared row could never say that. */
export type NoteLayouts = Record<NoteViewKind, NoteLayout>;

/** Defaults: the poster card for every kind, which is what the retired cards
 *  layout resolved to. The migration rewrites an existing `cards`, so an
 *  upgrade changes nothing on screen either. */
export const DEFAULT_NOTE_LAYOUTS: NoteLayouts = {
	channels: 'poster',
	playlists: 'poster',
	watchlater: 'poster',
};

/** The three layout rows, in render order and in the order the notes appear
 *  in the vault. Each names the note it drives: a bare "Playlists" would read
 *  as though it covered Watch Later too, which is the whole point of the
 *  third row. */
export const LAYOUT_ROWS: Array<{ key: NoteViewKind; name: string; desc: string }> = [
	{
		key: 'channels',
		name: 'Channels layout',
		desc: 'How the view above Channels.md renders. Poster draws an Ambient card over the channel banner; chips and table fit more channels on screen.',
	},
	{
		key: 'playlists',
		name: 'Playlists layout',
		desc: 'How the view above every playlist note renders. Poster leads with the video thumbnail; chips and table fit more rows on screen.',
	},
	{
		key: 'watchlater',
		name: 'Watch Later layout',
		desc: 'How the view above Watch Later.md renders. Kept apart from Playlists because a long watch queue usually reads best as a table.',
	},
];

/**
 * Expand the pre-split `noteLayout` key, one layout for all three notes, into
 * the per-kind `noteLayouts` object. `mixed`, `cards`, and anything else the
 * dropdowns no longer offer expand to the defaults, which are poster for every
 * kind. Returns null when there is no legacy key to migrate, so the caller can
 * leave data.json untouched on every ordinary load.
 */
export function expandLegacyLayout(legacy: unknown): NoteLayouts | null {
	if (typeof legacy !== 'string') return null;
	if (legacy === 'chips' || legacy === 'table' || legacy === 'poster') {
		return { channels: legacy, playlists: legacy, watchlater: legacy };
	}
	return { ...DEFAULT_NOTE_LAYOUTS };
}

const LAYOUT_KINDS: NoteViewKind[] = ['channels', 'playlists', 'watchlater'];

/**
 * Bring a stored `noteLayouts` object up to date: `cards` becomes poster, a
 * missing or unrecognized value becomes that kind's default, and a value that
 * is already valid is kept. Returns the corrected object, or null when the
 * stored value was already exactly right, so the caller only writes data.json
 * when something actually changed.
 */
export function normalizeStoredLayouts(stored: unknown): NoteLayouts | null {
	const source =
		stored != null && typeof stored === 'object' ? (stored as Record<string, unknown>) : null;
	const next: NoteLayouts = { ...DEFAULT_NOTE_LAYOUTS };
	let changed = source === null;
	for (const kind of LAYOUT_KINDS) {
		const value = source?.[kind];
		const layout: NoteLayout =
			value === 'cards'
				? 'poster'
				: value === 'poster' || value === 'chips' || value === 'table'
					? value
					: DEFAULT_NOTE_LAYOUTS[kind];
		if (layout !== value) changed = true;
		next[kind] = layout;
	}
	return changed ? next : null;
}

/** One row of the Channels.md fields checklist, in render order. */
export interface FieldRow {
	key: keyof ChannelsFieldSettings;
	name: string;
	/** Shown under the name when a row needs more than a label. */
	desc?: string;
}

/** Channels.md checklist rows, in the order renderChannelsNote writes them. */
export const FIELD_ROWS: FieldRow[] = [
	{ key: 'channelId', name: 'Channel ID' },
	{ key: 'subscribedOn', name: 'Subscribed on' },
	{ key: 'syncDates', name: 'First seen & last seen' },
	{ key: 'status', name: 'Status' },
	{ key: 'handle', name: 'Handle' },
	{ key: 'subscribers', name: 'Subscribers' },
	{ key: 'videos', name: 'Videos' },
	{ key: 'views', name: 'Views' },
	{ key: 'country', name: 'Country' },
	{
		key: 'avatar',
		name: 'Avatar',
		desc: 'Writes avatar_url and avatar, the two fields the view above the note draws the picture from. Whether they hold a link or a downloaded file follows Channel images.',
	},
	{
		key: 'banner',
		name: 'Banner',
		desc: 'Writes banner_url and banner, drawn as the top strip of the poster card. Chips and the table never show a banner.',
	},
];

/** Dashboard.md live-section checklist rows, in render order. */
export const DASHBOARD_ROWS: Array<{ key: keyof DashboardSections; name: string; desc?: string }> = [
	{ key: 'recent', name: 'New since last sync card' },
	{ key: 'playlists', name: 'Playlists card' },
	{ key: 'topChannels', name: 'Top channels by subscribers' },
	{ key: 'attention', name: 'Needs attention card' },
];

/** Dashboard.md live-section limit rows, in render order. Each key matches
 *  one of the four live dashboard limits on `LifelineSettings`. */
export const DASHBOARD_LIMIT_ROWS: Array<{ key: keyof DashboardLimits; name: string; desc: string }> = [
	{
		key: 'feed',
		name: 'Feed entries',
		desc: 'How many new-since-sync rows the feed panel shows before the +N more line. Default 8.',
	},
	{
		key: 'attention',
		name: 'Attention entries',
		desc: 'How many needs-attention playlists the attention panel shows before the +N more line. Default 6.',
	},
	{
		key: 'cards',
		name: 'Playlist cards',
		desc: 'How many playlist cover cards the Playlists panel draws. Both Cards and Table modes use this cap; Table uses the same sorted list. Default 6.',
	},
	{
		key: 'channels',
		name: 'Top channels',
		desc: 'How many channel cards the Top channels panel draws. Both Cards and Table modes use this cap; Table draws the same sorted channels. Default 10.',
	},
];

/** Daily-notes folder dated bullets wikilink into by default. */
export const DEFAULT_JOURNAL_FOLDER = '01 - Journal/Daily';

export interface LifelineSettings {
	/** Keychain *name* of the secret holding the OAuth client ID. */
	clientIdName: string;
	/** Keychain *name* of the secret holding the OAuth client secret. */
	clientSecretName: string;
	/** Vault-relative folder that receives the generated notes. */
	outputFolder: string;
	/** Vault folder holding the daily journal notes that dated bullets
	 *  ([date:: ...], [subscribed_on:: ...]) wikilink into. A date links only
	 *  when that day's note exists, or when it is today or later; a folder
	 *  missing from the vault means nothing links, so every date prints
	 *  plain. Notes are matched anywhere under the folder, so subfolder
	 *  daily-note layouts work. A saved '' is filled with the default by the
	 *  onload migration, so the setting always names a folder. */
	journalFolder: string;
	/** Which fields render on each Channels.md entry (Manage sub-page). */
	channelsFields: ChannelsFieldSettings;
	/** Opt-in Dashboard.md note (requires the community Dataview plugin). */
	dashboardNote: boolean;
	/** Which live sections render on Dashboard.md (sub-page checklist). */
	dashboardSections: DashboardSections;
	/** Channel URL picked as the dashboard hero banner ('' = none, draw the
	 *  default mosaic of the top channels). Read live by the generated script
	 *  at view time, so picking or clearing needs no sync and no rewrite; a
	 *  stale URL simply falls back to the mosaic. */
	dashboardHeroChannel: string;
	/** Where the hero crop of that banner centers, in percent of the image
	 *  each way (0-100, default the middle). A banner is far wider than the
	 *  hero strip, so `object-fit: cover` discards everything outside this
	 *  point's column and row; the settings preview picks it by clicking the
	 *  part of the picture to keep. Also read live, and only meaningful while
	 *  `dashboardHeroChannel` resolves to a banner. */
	dashboardHeroFocus: HeroFocusPoint;
	/** Vault folder holding the generated lifeline-dashboard.js view script. */
	dashboardScriptsFolder: string;
	/** Folder the script was last written to (null = never); lets a folder
	 *  change trash the stale copy. Internal bookkeeping, not user-facing. */
	dashboardScriptsFolderWritten: string | null;
	/** Opt-in DataviewJS views above the entries in Channels.md, every
	 *  playlist note, and Watch Later.md (requires the community Dataview
	 *  plugin). Draw from the generated lifeline-channels.js,
	 *  lifeline-playlists.js, and lifeline-watchlater.js scripts. */
	noteViews: boolean;
	/** How those views render, one row per note type (Notes group). Written
	 *  back by each note's toolbar Layout select too, so switching there needs
	 *  no sync. Ignored while `noteViews` is off. */
	noteLayouts: NoteLayouts;
	/** How many entries the views on Channels.md, playlist notes, and Watch
	 *  Later.md paint before a Show more button, in every layout (Poster,
	 *  Chips, and Table). Read live at render time, so changing it needs no
	 *  sync and no regenerated script. Ignored while `noteViews` is off. */
	viewPageSize: number;
	/** Vault folder holding the per-view stylesheets (lifeline-channels.css,
	 *  lifeline-playlists.css, lifeline-watchlater.css, and the dashboard's
	 *  lifeline-dashboard.css) that the view scripts read at view time. */
	stylesFolder: string;
	/** Folder the stylesheet was last written to (null = never); lets a folder
	 *  change trash the stale copy. Internal bookkeeping, not user-facing. */
	stylesFolderWritten: string | null;
	/** Avatar at the end of every Channels.md bullet. Not gated on the views
	 *  toggle: images live in the bullets, so they need no Dataview. */
	channelAvatars: ImageMode;
	/** Thumbnail at the end of every playlist and Watch Later bullet. Not
	 *  gated on the views toggle either. */
	videoThumbnails: ImageMode;
	/** Parent folder for downloaded images; '' = keep them beside the notes.
	 *  Files always land in `<parent>/thumbnails/`. */
	imagesFolder: string;
	/** null = never fetched → every playlist is tracked on first fetch. */
	trackedPlaylists: string[] | null;
	/** IDs collected from youtube.com/feed/playlists; the API never lists them. */
	importedPlaylistIds: string[];
	/** Every playlist id ever discovered (so user-unchecked ids stay unchecked). */
	knownPlaylistIds: string[];
	/** Last fetched playlists.list result; powers settings UI and dropdowns. */
	playlistCatalog: PlaylistSummary[];
	/** Playlist written to Watch Later.md (YouTube's system list is API-inaccessible). */
	watchLaterPlaylistId: string;
	/** Load-time auto-sync threshold in hours; NOT a background scheduler. */
	syncIntervalHours: number;
	/** Soft quota cap per run (units); sync warns instead of hard-stopping. */
	quotaSoftLimit: number;
	/** Dashboard limits for the four live sections: feed, attention, cards, channels. */
	dashboardLimits: DashboardLimits;
}

export const DEFAULT_SETTINGS: LifelineSettings = {
	clientIdName: 'lifeline-client-id',
	clientSecretName: 'lifeline-client-secret',
	outputFolder: DEFAULT_OUTPUT_FOLDER,
	journalFolder: DEFAULT_JOURNAL_FOLDER,
	channelsFields: { ...DEFAULT_CHANNELS_FIELDS },
	dashboardNote: false,
	dashboardSections: { ...DEFAULT_DASHBOARD_SECTIONS },
	dashboardHeroChannel: '',
	dashboardHeroFocus: { ...DEFAULT_HERO_FOCUS },
	dashboardScriptsFolder: DEFAULT_SCRIPTS_FOLDER,
	dashboardScriptsFolderWritten: null,
	noteViews: false,
	noteLayouts: { ...DEFAULT_NOTE_LAYOUTS },
	viewPageSize: DEFAULT_VIEW_PAGE_SIZE,
	stylesFolder: DEFAULT_STYLES_FOLDER,
	stylesFolderWritten: null,
	channelAvatars: 'off',
	videoThumbnails: 'off',
	imagesFolder: '',
	trackedPlaylists: null,
	importedPlaylistIds: [],
	knownPlaylistIds: [],
	playlistCatalog: [],
	watchLaterPlaylistId: '',
	syncIntervalHours: 20,
	quotaSoftLimit: 8000,
	dashboardLimits: { feed: DEFAULT_DASHBOARD_LIMITS.feed, attention: DEFAULT_DASHBOARD_LIMITS.attention, cards: DEFAULT_DASHBOARD_LIMITS.cards, channels: DEFAULT_DASHBOARD_LIMITS.channels },
};
