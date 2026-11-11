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
	/**
	 * Images fetched and written this run, recorded only while a download mode
	 * is on. A 0 makes the skip behaviour visible: every wanted image was
	 * already on disk, so none was fetched. Absent when no download mode was
	 * on, so those runs carry no meaningless zero.
	 */
	imagesDownloaded?: number;
	/**
	 * Watch pages fetched this run to tell Shorts from regular videos, recorded
	 * only while Identify Shorts is on Confirm with YouTube. A 0 makes the
	 * cache visible: every candidate was already classified. Absent for the
	 * duration-only choice and Off, which make no request at all.
	 */
	shortsProbed?: number;
	quotaUnits: number;
	quotaSoftWarn: boolean;
	errors: SyncErrorRecord[];
}

/** Persisted in state/runtime.json; powers the status bar and sync-log summary. */
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

/**
 * Which optional non-duration facts a playlist and Watch Later bullet carries.
 * All three default on: these are backup facts, and the upload date in
 * particular is unrecoverable once a video is deleted, so a default install
 * records them. Turning one off strips its field on the next sync. Duration
 * and the Shorts flag are deliberately absent: they follow the Identify Shorts
 * choice (see `shortsDetection`), and a second switch over the same fields
 * would silently do nothing.
 */
export interface VideoFieldSettings {
	/** `published`, the video's own upload date (contentDetails.videoPublishedAt). */
	published: boolean;
	/** `blocked`, true only when distribution is effectively blocked everywhere. */
	blocked: boolean;
	/** `live` and `upcoming` from liveBroadcastContent. */
	live: boolean;
}

export const DEFAULT_VIDEO_FIELDS: VideoFieldSettings = {
	published: true,
	blocked: true,
	live: true,
};

/** Which optional sections render on Dashboard.md (settings checklist). */
export interface DashboardSections {
	recent: boolean;
	playlists: boolean;
	topChannels: boolean;
	attention: boolean;
}

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSections = {
	recent: true,
	playlists: true,
	topChannels: true,
	attention: true,
};

export const DEFAULT_DASHBOARD_LIMITS: DashboardLimits = {
	feed: 8,
	attention: 6,
	cards: 6,
	channels: 10,
};

/** How many entries each live dashboard section paints before it cuts off
 *  with a `+N more` line. Read live at render time, so changing a limit needs
 *  no sync or regenerated script. */
export interface DashboardLimits {
	/** New-since-sync feed rows. */
	feed: number;
	/** Needs-attention playlist rows. */
	attention: number;
	/** Playlist cover cards drawn in Cards mode. */
	cards: number;
	/** Top channels shown in Cards mode (Table mode shows every channel). */
	channels: number;
}

/** How Identify Shorts classifies videos. `confirm` reads the watch page;
 *  `duration180` skips the request and classifies by the ceiling instead;
 *  `off` writes no fields and strips them on the next sync. */
export type ShortsDetectionMode = 'confirm' | 'duration180' | 'off';

/** How the video views and the dashboard feed treat Shorts. Read live at
 *  render time, so changing it needs no sync. */
export type ShortsFilter = 'all' | 'hide' | 'only';

/** How the video note views treat removed bullets the note carries in Keep
 *  mode. Read live at render time, so changing it needs no sync. `hide` is the
 *  default, matching the views' behaviour before this control existed. */
export type RemovedFilter = 'all' | 'hide' | 'only';

/** What playlist notes do with videos that left the playlist upstream.
 *  `keep` writes them as bullets after the live ones, marked `removed`;
 *  `count` hides them and only reports `removed_count`. */
export type RemovedVideosMode = 'keep' | 'count';

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
	/** Day Lifeline first saw this video missing (YYYY-MM-DD). Absent for a
	 *  video that was already removed before this field existed. */
	removedOn?: string;
	/** Private or deleted at fetch time; kept deliberately, never dropped. */
	unavailable: boolean;
	/** YouTube's age-restriction flag (videos.list contentRating); absent until checked. */
	ageRestricted?: boolean;
	/** Upload date from contentDetails.videoPublishedAt (YYYY-MM-DD); absent until
	 *  the playlist is refetched. Written as plain ISO text, never a journal link. */
	published?: string;
	/** True when regionRestriction means the video is effectively blocked
	 *  everywhere (an allowlist, or a blocking list at or above
	 *  GLOBAL_BLOCK_MIN_COUNTRIES). A partial block list writes nothing. */
	blocked?: boolean;
	/** liveBroadcastContent is `live`; absent until the metadata pass runs. */
	live?: boolean;
	/** liveBroadcastContent is `upcoming` (a premiere); absent until fetched. */
	upcoming?: boolean;
	/** Whole seconds from contentDetails.duration; absent until fetched, and for
	 *  a live or upcoming video (P0D) that has no length yet. */
	durationSeconds?: number;
	/** True for a Short, false for a regular video. Absent means unclassified,
	 *  so it is retried on a later sync rather than guessed. */
	short?: boolean;
	/** Version of the videos.list metadata this record has (see
	 *  VIDEO_META_VERSION). Absent means never fetched, which is what makes an
	 *  upgraded state/playlists.json refill once instead of forever. */
	metaVersion?: number;
}

/**
 * Avatar for a channel that shows up in playlists but has no row in
 * Channels.md, because it was never subscribed to. The video scripts cannot
 * join a face from Channels.md for those, so sync resolves the URL once and
 * the video bullet carries it as `avatar_url`. Nothing is downloaded for these
 * channels, even in Download mode; the entry is pruned when the channel
 * becomes a subscription, and Channels.md takes over the face and its file.
 */
export interface ChannelFace {
	/** Channel title as the playlist records it: the avatar's file name is built from it. */
	title: string;
	/** Avatar URL from channels.list; '' while none is known yet. */
	avatar: string;
}

export interface PlaylistRecord {
	title: string;
	/** Sanitized file base name (without .md) inside the Playlists folder. */
	fileName: string;
	/** Saved from another channel rather than created by you. Optional for pre-existing state files. */
	saved?: boolean;
	/** Date the playlist first appeared after the first sync (YYYY-MM-DD). Absent on the first sync and on older state files. */
	addedOn?: string;
	videos: Record<string, VideoRecord>;
}

export interface SyncState {
	version: number;
	channels: Record<string, ChannelRecord>;
	/** Playlist-owner channels absent from `channels`, keyed by channel id. */
	faces: Record<string, ChannelFace>;
	playlists: Record<string, PlaylistRecord>;
	lastSync: LastSyncInfo | null;
	lastSuccessAt: number | null;
}

export function createDefaultState(): SyncState {
	return {
		version: 1,
		channels: {},
		faces: {},
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
