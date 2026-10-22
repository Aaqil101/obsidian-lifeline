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
import { DEFAULT_STYLES_FOLDER } from '../noteViewsScript';
import {
	DEFAULT_CHANNELS_FIELDS,
	DEFAULT_DASHBOARD_SECTIONS,
	type ChannelsFieldSettings,
	type DashboardSections,
	type ImageMode,
	type PlaylistSummary,
} from '../types';

/** Layout for the opt-in note views, picked in each note's toolbar (there is
 *  deliberately no settings row for it). `mixed` picks the layout per note:
 *  chips for Channels.md, cards for playlist notes. */
export type NoteLayout = 'table' | 'mixed' | 'cards' | 'chips';

/** Default note layout: chips in Channels.md, cards in playlists. */
export const DEFAULT_NOTE_LAYOUT: NoteLayout = 'mixed';

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
		desc: 'Writes banner_url and banner, drawn as the top strip of a channel card. Card view only; chips and the table never show a banner.',
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
	/** How those views render, written by each note's toolbar Layout select
	 *  (no settings row). `mixed` = chips for Channels.md, cards for playlist
	 *  notes; the other three apply one layout everywhere. Ignored while
	 *  `noteViews` is off. */
	noteLayout: NoteLayout;
	/** Vault folder holding the generated lifeline-views.css stylesheet the
	 *  view scripts read at view time (the quotebook.css pattern). */
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
	noteLayout: DEFAULT_NOTE_LAYOUT,
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
