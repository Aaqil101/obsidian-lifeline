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
import { DEFAULT_STYLES_FOLDER, type NoteViewKind } from '../noteViewsScript';
import {
	DEFAULT_CHANNELS_FIELDS,
	DEFAULT_DASHBOARD_SECTIONS,
	type ChannelsFieldSettings,
	type DashboardSections,
	type ImageMode,
	type PlaylistSummary,
} from '../types';

/** Layout of one opt-in note view. `mixed` is legacy only: it was the value
 *  the single setting used to hold, meaning "chips for Channels.md, cards for
 *  playlist notes", a choice the three per-kind rows below now express
 *  directly. Still understood wherever an old note or an unmigrated data.json
 *  can supply it (the view script resolves it, onload expands it), but no
 *  dropdown offers it. */
export type NoteLayout = 'table' | 'mixed' | 'cards' | 'chips' | 'poster';

/** One choice in a layout dropdown, in menu order. Deliberately no Mixed:
 *  within one note type it is just a slower way of naming the other value. */
export const NOTE_LAYOUT_OPTIONS: Array<{ value: NoteLayout; label: string }> = [
	{ value: 'chips', label: 'Chips' },
	{ value: 'cards', label: 'Cards' },
	{ value: 'table', label: 'Table' },
];

/** The same dropdown per note type: the poster card is a channel shape
 *  (banner, subscribe badge, journal link), so only the Channels row offers
 *  it; the video lists stay on chips, cards, and table. */
export const NOTE_LAYOUT_OPTIONS_BY_KIND: Record<
	NoteViewKind,
	Array<{ value: NoteLayout; label: string }>
> = {
	channels: [
		{ value: 'poster', label: 'Poster' },
		{ value: 'chips', label: 'Chips' },
		{ value: 'cards', label: 'Cards' },
		{ value: 'table', label: 'Table' },
	],
	playlists: NOTE_LAYOUT_OPTIONS,
	watchlater: NOTE_LAYOUT_OPTIONS,
};

/** Layout of each note type's view, one row per type in the Notes group.
 *  Split per type because the notes are read differently: a long Watch Later
 *  queue scans better as a dense table while a curated playlist shows off
 *  its thumbnail as cards, and one shared row could never say that. */
export type NoteLayouts = Record<NoteViewKind, NoteLayout>;

/** Defaults: chips for the flat channel list, cards for the video lists,
 *  which is exactly what the retired `mixed` resolved to, so an upgrade
 *  leaves every note looking the same. */
export const DEFAULT_NOTE_LAYOUTS: NoteLayouts = {
	channels: 'chips',
	playlists: 'cards',
	watchlater: 'cards',
};

/** The three layout rows, in render order and in the order the notes appear
 *  in the vault. Each names the note it drives: a bare "Playlists" would read
 *  as though it covered Watch Later too, which is the whole point of the
 *  third row. */
export const LAYOUT_ROWS: Array<{ key: NoteViewKind; name: string; desc: string }> = [
	{
		key: 'channels',
		name: 'Channels layout',
		desc: 'How the view above Channels.md renders. Poster draws a YouTube-style channel card (banner, subscribe badge, journal link); chips keep the long list compact; cards add the avatar and banner.',
	},
	{
		key: 'playlists',
		name: 'Playlists layout',
		desc: 'How the view above every playlist note renders. Cards lead with the video thumbnail; table fits more rows on screen.',
	},
	{
		key: 'watchlater',
		name: 'Watch Later layout',
		desc: 'How the view above Watch Later.md renders. Kept apart from Playlists because a long watch queue usually reads best as a table.',
	},
];

/**
 * Expand the pre-split `noteLayout` key, one layout for all three notes, into
 * the per-kind `noteLayouts` object. `mixed` expands to what it used to resolve
 * to at view time, so an upgrade leaves every note looking the same. Returns
 * null when there is no legacy key to migrate, so the caller can leave
 * data.json untouched on every ordinary load.
 */
export function expandLegacyLayout(legacy: unknown): NoteLayouts | null {
	if (typeof legacy !== 'string') return null;
	// Anything that is not one of the three concrete layouts lands on the
	// defaults: that covers "mixed", which was chips for Channels.md and cards
	// for the video lists, and any unrecognized value, which used to fall back
	// to it as well. Either way the migrated object never carries a value no
	// dropdown offers any more.
	if (legacy !== 'chips' && legacy !== 'cards' && legacy !== 'table') return { ...DEFAULT_NOTE_LAYOUTS };
	return { channels: legacy, playlists: legacy, watchlater: legacy };
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
		desc: 'Writes banner_url and banner, drawn as the top strip of a channel card or the poster card. Chips and the table never show a banner.',
	},
];

/** Dashboard.md live-section checklist rows, in render order. */
export const DASHBOARD_ROWS: Array<{ key: keyof DashboardSections; name: string }> = [
	{ key: 'quickLinks', name: 'Quick links row' },
	{ key: 'recent', name: 'New since last sync card' },
	{ key: 'topChannels', name: 'Top channels by subscribers' },
	{ key: 'attention', name: 'Needs attention card' },
];

export interface LifelineSettings {
	/** Keychain *name* of the secret holding the OAuth client ID. */
	clientIdName: string;
	/** Keychain *name* of the secret holding the OAuth client secret. */
	clientSecretName: string;
	/** Vault-relative folder that receives the generated notes. */
	outputFolder: string;
	/** Which fields render on each Channels.md entry (Manage sub-page). */
	channelsFields: ChannelsFieldSettings;
	/** Opt-in Dashboard.md note (requires the community Dataview plugin). */
	dashboardNote: boolean;
	/** Which live sections render on Dashboard.md (sub-page checklist). */
	dashboardSections: DashboardSections;
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
}

export const DEFAULT_SETTINGS: LifelineSettings = {
	clientIdName: 'lifeline-client-id',
	clientSecretName: 'lifeline-client-secret',
	outputFolder: DEFAULT_OUTPUT_FOLDER,
	channelsFields: { ...DEFAULT_CHANNELS_FIELDS },
	dashboardNote: false,
	dashboardSections: { ...DEFAULT_DASHBOARD_SECTIONS },
	dashboardScriptsFolder: DEFAULT_SCRIPTS_FOLDER,
	dashboardScriptsFolderWritten: null,
	noteViews: false,
	noteLayouts: { ...DEFAULT_NOTE_LAYOUTS },
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
};
