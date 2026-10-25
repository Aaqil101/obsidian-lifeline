/**
 * Shared types for the Lifeline plugin.
 *
 * Lifeline backs up YouTube subscriptions, playlists, and a watch-later
 * substitute into Markdown notes so the record survives account loss.
 */

/** Classification of sync failures, surfaced in the sync log and status bar. */
export type SyncErrorKind = 'auth' | 'quota' | 'network' | 'api' | 'io';

/** A classified error raised while syncing. Never lets one failure abort the run. */
export class SyncError extends Error {
	readonly kind: SyncErrorKind;
	readonly resource: string;

	constructor(kind: SyncErrorKind, resource: string, message: string) {
		super(message);
		this.name = 'SyncError';
		this.kind = kind;
		this.resource = resource;
	}
}

/** Convert any thrown value into a SyncError so errors are always classifiable. */
export function asSyncError(err: unknown, resource: string): SyncError {
	if (err instanceof SyncError) return err;
	const message = err instanceof Error ? err.message : String(err);
	return new SyncError('api', resource, message);
}

export interface SyncErrorRecord {
	kind: SyncErrorKind;
	resource: string;
	message: string;
}

/** ✓ ok: nothing failed. ⚠ warn: partial success or soft-limit hit. ✗ error: nothing usable. */
export type SyncStatus = 'ok' | 'warn' | 'error';

export interface SyncRunResult {
	status: SyncStatus;
	startedAt: number;
	channelsSynced: number;
	playlistsSynced: number;
	videosFound: number;
	quotaUnits: number;
	quotaSoftWarn: boolean;
	errors: SyncErrorRecord[];
}

/** Persisted in state.json; powers the status bar and sync-log summary. */
export interface LastSyncInfo {
	at: number;
	status: SyncStatus;
	channels: number;
	playlists: number;
	videos: number;
	quotaUnits: number;
	errorSummary: string | null;
}

export interface ChannelRecord {
	title: string;
	url: string;
	/** @handle (with @) from the subscription snippet; absent when unknown. */
	handle?: string;
	/** Date you subscribed to the channel (YYYY-MM-DD); '' if unknown. */
	subscribedOn: string;
	firstSeen: string;
	lastSeen: string;
	subscribed: boolean;
	/** Latest channels.list statistics; absent until first fetched. */
	subscribers?: number;
	videoCount?: number;
	viewCount?: number;
	/** ISO 3166-1 alpha-2 code from brandingSettings; absent when unknown. */
	country?: string;
	/** Channel avatar URL from channels.list snippet.thumbnails; absent until fetched. */
	avatar?: string;
	/** Channel banner URL from brandingSettings.image; absent when the channel has no banner. */
	banner?: string;
}

/**
 * How an optional image in a note renders. Independent of the Dataview-gated
 * views: the image is an inline field in the bullet, so it works with the
 * community Dataview plugin absent and while "Views in notes" is off.
 *
 * - `off`: no image at all (the default, and the only byte-identical mode).
 * - `link`: write the remote URL into the *_url field; the host is fetched
 *   every time a view renders the image.
 * - `download`: fetch once during sync and also write the local file's
 *   wikilink into the field, so views render offline and nothing is fetched
 *   when a note is opened.
 */
export type ImageMode = 'off' | 'link' | 'download';

/** Which fields render on each Channels.md entry (settings checklist). */
export interface ChannelsFieldSettings {
	channelId: boolean;
	subscribedOn: boolean;
	syncDates: boolean;
	status: boolean;
	handle: boolean;
	subscribers: boolean;
	videos: boolean;
	views: boolean;
	country: boolean;
	/** avatar_url/avatar fields. Gated separately from the image mode, so a
	 *  mode that is on can still be told to skip the avatar. */
	avatar: boolean;
	/** banner_url/banner fields, the same way. */
	banner: boolean;
}

export const DEFAULT_CHANNELS_FIELDS: ChannelsFieldSettings = {
	channelId: true,
	subscribedOn: true,
	syncDates: true,
	status: true,
	handle: true,
	subscribers: true,
	videos: true,
	views: true,
	country: true,
	// On by default so an existing install that already downloads images keeps
	// writing them; with every image mode off (the default) nothing renders
	// either way, so the note stays byte-identical.
	avatar: true,
	banner: true,
};

/** Which optional sections render on Dashboard.md (settings checklist). */
export interface DashboardSections {
	recent: boolean;
	topChannels: boolean;
	attention: boolean;
}

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSections = {
	recent: true,
	topChannels: true,
	attention: true,
};

export interface VideoRecord {
	title: string;
	channelTitle: string;
	channelId: string;
	/** First time this video was seen in this playlist (YYYY-MM-DD). */
	firstSeen: string;
	/** Date the video was last (re-)added to the playlist (YYYY-MM-DD). */
	dateAdded: string;
	position: number;
	/** Kept in state but no longer present in the live playlist. */
	removed: boolean;
	/** Private or deleted at fetch time; kept deliberately, never dropped. */
	unavailable: boolean;
}

export interface PlaylistRecord {
	title: string;
	/** Sanitized file base name (without .md) inside the Playlists folder. */
	fileName: string;
	/** Saved from another channel rather than created by you. Optional for pre-existing state files. */
	saved?: boolean;
	videos: Record<string, VideoRecord>;
}

export interface SyncState {
	version: number;
	channels: Record<string, ChannelRecord>;
	playlists: Record<string, PlaylistRecord>;
	lastSync: LastSyncInfo | null;
	lastSuccessAt: number | null;
}

export function createDefaultState(): SyncState {
	return {
		version: 1,
		channels: {},
		playlists: {},
		lastSync: null,
		lastSuccessAt: null,
	};
}

/** A playlist as returned by playlists.list/subscriptions.list; also persisted as the settings catalog. */
export interface PlaylistSummary {
	id: string;
	title: string;
	/** Saved from another channel (a subscription to a playlist) rather than created by you. */
	saved: boolean;
}
