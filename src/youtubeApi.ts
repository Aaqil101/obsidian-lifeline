/**
 * Typed YouTube Data API v3 client.
 *
 * - Native fetch only; loopback OAuth handled in auth.ts.
 * - 401 → refresh the access token and retry once.
 * - 403/429 rate limits and 5xx → exponential backoff with Retry-After support.
 * - Quota units are counted per call (list endpoints cost 1 unit each).
 * - Channel statistics are fetched in 50-id chunks (1 unit per chunk).
 * - Errors are thrown as classified SyncError values; the sync engine collects
 *   them per resource and never aborts the whole run.
 */
import { asArray, asRecord, asString, errorMessage } from './json';
import { SyncError, type PlaylistSummary, type SyncErrorKind } from './types';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_PAGES = 500;
const MAX_RETRIES = 2;
const STAT_CHUNK_SIZE = 50;
/** playlists.list accepts up to 50 ids per id= call (1 quota unit per call). */
const ID_BATCH_SIZE = 50;

/** Anything the plugin calls to authenticate a request. */
export interface ApiAuth {
	getAccessToken(): Promise<string>;
	refreshAccessToken(): Promise<string>;
}

/** Cumulative quota accounting for a single sync run. */
export class QuotaTracker {
	used = 0;

	constructor(public readonly softLimit: number) {}

	add(units: number): void {
		this.used += units;
	}

	get softWarn(): boolean {
		return this.softLimit > 0 && this.used >= this.softLimit;
	}
}

export interface ChannelItem {
	id: string;
	title: string;
	url: string;
	/** @handle (with @) when the subscription snippet carries one; '' otherwise. */
	handle: string;
	/** Date you subscribed to the channel (YYYY-MM-DD), from the snippet. */
	subscribedOn: string;
}

/** Enrichment for one channel, from channels.list. */
export interface ChannelStatistics {
	id: string;
	/** @handle (with @); '' when the channel has no custom URL. */
	handle: string;
	/** null when the channel hides its count or it is unknown. */
	subscribers: number | null;
	videos: number | null;
	views: number | null;
	/** ISO 3166-1 alpha-2 code; '' when unset. */
	country: string;
	/**
	 * Channel avatar URL, taken from the same snippet the handle comes from
	 * (`part=snippet` is already requested, so this costs no extra quota).
	 * '' when the channel carries no thumbnail.
	 */
	avatar: string;
	/**
	 * Channel banner URL from brandingSettings.image.bannerExternalUrl. The
	 * branding part is already requested for the country field, so this rides
	 * the same request and costs no extra quota either. '' when the channel
	 * never set a banner, which is common for smaller channels.
	 */
	banner: string;
}

export interface PlaylistVideoItem {
	videoId: string;
	title: string;
	channelTitle: string;
	channelId: string;
	position: number;
	/** YYYY-MM-DD the video was added to the playlist (may be empty). */
	dateAdded: string;
	unavailable: boolean;
}

interface RequestSpec {
	endpoint: string;
	resource: string;
	params: Record<string, string>;
	quotaUnits: number;
}

interface Failure {
	kind: SyncErrorKind;
	message: string;
	retryable: boolean;
	retryAfterMs: number | null;
}

/** Result of one subscriptions.list sweep: the channel subs plus any saved playlists. */
export interface SubscriptionsFeed {
	channels: ChannelItem[];
	/**
	 * Playlists saved from other channels. YouTube models "Save playlist to..."
	 * as a subscription whose resourceId.kind is youtube#playlist, so they ride
	 * along on the same subscriptions.list call that feeds Channels.md.
	 */
	savedPlaylists: PlaylistSummary[];
}

/** Subscriptions the channel is still subscribed to (subscriptions.list, mine=true). */
export async function listSubscriptions(
	auth: ApiAuth,
	quota: QuotaTracker,
): Promise<SubscriptionsFeed> {
	const rawItems = await collectPages(async (pageToken) => {
		const json = await requestJson(
			{
				endpoint: 'subscriptions',
				resource: 'subscriptions',
				quotaUnits: 1,
				params: {
					part: 'snippet',
					mine: 'true',
					maxResults: '50',
					...(pageToken ? { pageToken } : {}),
				},
			},
			auth,
			quota,
		);
		const record = asRecord(json) ?? {};
		return {
			items: asArray(record.items) ?? [],
			nextPageToken: asString(record.nextPageToken) || null,
		};
	});

	const channels: ChannelItem[] = [];
	const savedPlaylists: PlaylistSummary[] = [];
	const seen = new Set<string>();
	const seenPlaylists = new Set<string>();

	for (const raw of rawItems) {
		const item = asRecord(raw);
		const snippet = asRecord(item?.snippet);
		const resourceId = asRecord(snippet?.resourceId);

		// Saved playlists come through as playlist-kind subscriptions.
		if (asString(resourceId?.kind) === 'youtube#playlist') {
			const playlistId = asString(resourceId?.playlistId);
			if (!playlistId || seenPlaylists.has(playlistId)) continue;
			seenPlaylists.add(playlistId);
			savedPlaylists.push({
				id: playlistId,
				title: asString(snippet?.title) || playlistId,
				saved: true,
			});
			continue;
		}

		const id = asString(resourceId?.channelId);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const title = asString(snippet?.title) || id;
		const handle = normalizeHandle(asString(snippet?.customUrl));
		const url = handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${id}`;
		const subscribedOn = asString(snippet?.publishedAt).slice(0, 10);
		channels.push({ id, title, url, handle, subscribedOn });
	}
	return { channels, savedPlaylists };
}

/**
 * Statistics, handle backfill, and country for the given channel ids
 * (channels.list). Ids are chunked 50 per call at 1 quota unit each; a failed
 * chunk is collected as an error and the remaining chunks still run.
 */
export async function listChannelStatistics(
	auth: ApiAuth,
	quota: QuotaTracker,
	ids: string[],
): Promise<{ stats: ChannelStatistics[]; syncErrors: SyncError[] }> {
	const stats: ChannelStatistics[] = [];
	const syncErrors: SyncError[] = [];
	for (let start = 0; start < ids.length; start += STAT_CHUNK_SIZE) {
		const chunk = ids.slice(start, start + STAT_CHUNK_SIZE);
		try {
			const json = await requestJson(
				{
					endpoint: 'channels',
					resource: 'channels',
					quotaUnits: 1,
					params: {
						part: 'snippet,statistics,brandingSettings',
						id: chunk.join(','),
						// The endpoint default is 5 results; batches need the full chunk.
						maxResults: String(STAT_CHUNK_SIZE),
					},
				},
				auth,
				quota,
			);
			const items = asArray(asRecord(json)?.items) ?? [];
			for (const raw of items) {
				const item = asRecord(raw);
				const id = asString(item?.id);
				if (!id) continue;
				const statistics = asRecord(item?.statistics);
				const snippet = asRecord(item?.snippet);
				const brandingChannel = asRecord(asRecord(item?.brandingSettings)?.channel);
				const brandingImage = asRecord(asRecord(item?.brandingSettings)?.image);
				stats.push({
					id,
					handle: normalizeHandle(asString(snippet?.customUrl)),
					subscribers:
						statistics?.hiddenSubscriberCount === true
							? null
							: toCount(asString(statistics?.subscriberCount)),
					videos: toCount(asString(statistics?.videoCount)),
					views: toCount(asString(statistics?.viewCount)),
					country: asString(brandingChannel?.country),
					avatar: pickThumbnail(asRecord(snippet?.thumbnails)),
					// The only non-deprecated banner field; its siblings
					// (bannerImageUrl, bannerExtraImageUrl) were retired.
					banner: asString(brandingImage?.bannerExternalUrl),
				});
			}
		} catch (err) {
			syncErrors.push(err instanceof SyncError ? err : new SyncError('api', 'channels', errorMessage(err)));
		}
	}
	return { stats, syncErrors };
}

/** Playlists owned by the authenticated channel (playlists.list, mine=true). */
export interface OwnedPlaylists {
	playlists: PlaylistSummary[];
	/**
	 * The authenticated channel's id, taken from the owned playlists'
	 * `snippet.channelId` (every one of them carries it). Null when the
	 * account owns no playlists; by-ID resolution then can't tell owned
	 * from saved and labels imported ids as saved.
	 */
	ownerChannelId: string | null;
}

export async function listOwnedPlaylists(
	auth: ApiAuth,
	quota: QuotaTracker,
): Promise<OwnedPlaylists> {
	const rawItems = await collectPages(async (pageToken) => {
		const json = await requestJson(
			{
				endpoint: 'playlists',
				resource: 'playlists',
				quotaUnits: 1,
				params: {
					part: 'snippet',
					mine: 'true',
					maxResults: '50',
					...(pageToken ? { pageToken } : {}),
				},
			},
			auth,
			quota,
		);
		const record = asRecord(json) ?? {};
		return {
			items: asArray(record.items) ?? [],
			nextPageToken: asString(record.nextPageToken) || null,
		};
	});

	const playlists: PlaylistSummary[] = [];
	const seen = new Set<string>();
	let ownerChannelId: string | null = null;
	for (const raw of rawItems) {
		const item = asRecord(raw);
		const snippet = asRecord(item?.snippet);
		const id = asString(item?.id);
		if (id && !seen.has(id)) {
			seen.add(id);
			playlists.push({ id, title: asString(snippet?.title) || id, saved: false });
		}
		if (!ownerChannelId) ownerChannelId = asString(snippet?.channelId) || null;
	}
	return { playlists, ownerChannelId };
}

/**
 * Metadata for explicit playlist ids (playlists.list, id=…): the only way to
 * title ids collected from youtube.com/feed/playlists: `mine=true` never
 * lists saved playlists, but `id=` resolves any playlist the account can see.
 * Batches 50 ids per call (1 quota unit per call). Ids YouTube doesn't return
 * (deleted, private, mistyped) are simply absent from the result; callers keep
 * their existing fallback titles for those.
 *
 * The collector page holds created *and* saved playlists, so the saved flag
 * is decided per playlist: `snippet.channelId` is the owner, and it matches
 * `ownerChannelId` (from listOwnedPlaylists) for playlists the user created.
 * Without an owner id every resolved playlist is labeled saved.
 */
export async function listPlaylistsByIds(
	ids: string[],
	auth: ApiAuth,
	quota: QuotaTracker,
	ownerChannelId: string | null,
): Promise<PlaylistSummary[]> {
	const playlists: PlaylistSummary[] = [];
	const seen = new Set<string>();
	for (let start = 0; start < ids.length; start += ID_BATCH_SIZE) {
		const batch = ids.slice(start, start + ID_BATCH_SIZE);
		const json = await requestJson(
			{
				endpoint: 'playlists',
				resource: 'playlist metadata',
				quotaUnits: 1,
				params: {
					part: 'snippet',
					id: batch.join(','),
					maxResults: '50',
				},
			},
			auth,
			quota,
		);
		const record = asRecord(json) ?? {};
		for (const raw of asArray(record.items) ?? []) {
			const item = asRecord(raw);
			const id = asString(item?.id);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			const snippet = asRecord(item?.snippet);
			const ownedByUser = ownerChannelId !== null && asString(snippet?.channelId) === ownerChannelId;
			playlists.push({ id, title: asString(snippet?.title) || id, saved: !ownedByUser });
		}
	}
	return playlists;
}

/**
 * Entries of one playlist (playlistItems.list) with snippet + status parts,
 * plus the playlist's upstream title when the API echoes one
 * (`snippet.playlistTitle`, undocumented and often empty; imported ids get
 * their reliable title from listPlaylistsByIds, this is only a fallback).
 * Title is '' for an empty playlist.
 */
export async function listPlaylistItems(
	playlistId: string,
	auth: ApiAuth,
	quota: QuotaTracker,
): Promise<{ title: string; items: PlaylistVideoItem[] }> {
	const rawItems = await collectPages(async (pageToken) => {
		const json = await requestJson(
			{
				endpoint: 'playlistItems',
				resource: `playlist ${playlistId}`,
				quotaUnits: 1,
				params: {
					part: 'snippet,contentDetails,status',
					playlistId,
					maxResults: '50',
					...(pageToken ? { pageToken } : {}),
				},
			},
			auth,
			quota,
		);
		const record = asRecord(json) ?? {};
		return {
			items: asArray(record.items) ?? [],
			nextPageToken: asString(record.nextPageToken) || null,
		};
	});

	let playlistTitle = '';
	const items: PlaylistVideoItem[] = [];
	for (const raw of rawItems) {
		const item = asRecord(raw);
		if (!item) continue;
		const snippet = asRecord(item.snippet);
		// Same value on every row; read it before row-level skips so
		// placeholder rows still yield it.
		if (!playlistTitle) playlistTitle = asString(snippet?.playlistTitle);
		const videoId = asString(asRecord(item.contentDetails)?.videoId);
		if (!videoId) continue; // no identifiable video: nothing to track or link

		const title = asString(snippet?.title);
		const privacy = asString(asRecord(item.status)?.privacyStatus);
		const placeholder = title === 'Deleted video' || title === 'Private video';
		items.push({
			videoId,
			title: title || 'Untitled video',
			channelTitle: asString(snippet?.videoOwnerChannelTitle),
			channelId: asString(snippet?.videoOwnerChannelId),
			position: typeof snippet?.position === 'number' ? snippet.position : items.length,
			dateAdded: asString(snippet?.publishedAt).slice(0, 10),
			unavailable: privacy === 'private' || placeholder,
		});
	}
	return { title: playlistTitle, items };
}

async function collectPages(
	fetchPage: (pageToken: string | null) => Promise<{ items: unknown[]; nextPageToken: string | null }>,
): Promise<unknown[]> {
	const all: unknown[] = [];
	let pageToken: string | null = null;
	for (let page = 0; page < MAX_PAGES; page++) {
		const { items, nextPageToken } = await fetchPage(pageToken);
		all.push(...items);
		if (!nextPageToken) return all;
		pageToken = nextPageToken;
	}
	return all;
}

async function requestJson(spec: RequestSpec, auth: ApiAuth, quota: QuotaTracker): Promise<unknown> {
	const url = buildUrl(spec);
	let res = await fetchOnce(url, auth, spec.resource);
	if (res.status === 401) {
		await auth.refreshAccessToken();
		res = await fetchOnce(url, auth, spec.resource);
		if (res.status === 401) {
			throw new SyncError('auth', spec.resource, 'Access token rejected after refresh. Re-authenticate in Lifeline settings.');
		}
	}

	let failure: Failure | null = null;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			await sleep(backoffDelay(attempt, failure?.retryAfterMs ?? null));
			res = await fetchOnce(url, auth, spec.resource);
			if (res.status === 401) {
				await auth.refreshAccessToken();
				res = await fetchOnce(url, auth, spec.resource);
			}
		}
		if (res.ok) {
			quota.add(spec.quotaUnits);
			return await readJson(res, spec.resource);
		}
		failure = await classifyFailure(res);
		if (!failure.retryable) {
			throw new SyncError(failure.kind, spec.resource, failure.message);
		}
	}
	/* istanbul ignore next: loop always throws or returns */
	throw new SyncError(
		failure?.kind ?? 'api',
		spec.resource,
		failure?.message ?? 'Request failed after retries.',
	);
}

async function fetchOnce(url: string, auth: ApiAuth, resource: string): Promise<Response> {
	try {
		const token = await auth.getAccessToken();
		return await fetch(url, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${token}`,
			},
		});
	} catch (err) {
		if (err instanceof SyncError) throw err;
		throw new SyncError('network', resource, `Network error: ${errorMessage(err)}`);
	}
}

async function classifyFailure(res: Response): Promise<Failure> {
	const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'));
	let message = `HTTP ${res.status}`;
	let reason = '';
	try {
		const body = asRecord(await res.json());
		const error = asRecord(body?.error);
		if (error) {
			message = asString(error.message) || message;
			const details = asArray(error.errors);
			const first = asRecord(details?.[0] ?? null);
			reason = first ? asString(first.reason) : '';
		}
	} catch {
		// non-JSON error body: keep the HTTP status message
	}

	if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'batchQuotaExceeded') {
		return { kind: 'quota', message, retryable: false, retryAfterMs };
	}
	const rateLimited = res.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
	if (rateLimited || res.status >= 500) {
		return { kind: res.status >= 500 ? 'api' : 'quota', message, retryable: true, retryAfterMs };
	}
	return { kind: res.status === 401 ? 'auth' : 'api', message, retryable: false, retryAfterMs };
}

function buildUrl(spec: RequestSpec): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(spec.params)) params.set(key, value);
	return `${API_BASE}/${spec.endpoint}?${params.toString()}`;
}

function parseRetryAfter(header: string | null): number | null {
	if (!header) return null;
	const seconds = Number(header);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function backoffDelay(attempt: number, retryAfterMs: number | null): number {
	if (retryAfterMs !== null) return Math.min(retryAfterMs, 60_000);
	const base = Math.min(1000 * 2 ** attempt, 30_000);
	return base + Math.floor(Math.random() * 500);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readJson(res: Response, resource: string): Promise<unknown> {
	try {
		return await res.json();
	} catch {
		throw new SyncError('api', resource, 'Invalid JSON in the API response.');
	}
}

function normalizeHandle(customUrl: string): string {
	if (!customUrl) return '';
	return customUrl.startsWith('@') ? customUrl : `@${customUrl}`;
}

function toCount(value: string): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Best avatar URL out of a `snippet.thumbnails` object. The keys the API
 * populates vary per channel (`default`, `medium`, `high`, `maxres`), so try
 * them in size order rather than assuming one exists. 240px (`medium`) suits
 * both the chip and card sizes the views draw, so it wins over the 800px
 * `high`; '' means no thumbnail at all.
 */
function pickThumbnail(thumbnails: Record<string, unknown> | null): string {
	if (!thumbnails) return '';
	for (const key of ['medium', 'default', 'high', 'maxres']) {
		const url = asString(asRecord(thumbnails[key])?.url);
		if (url) return url;
	}
	return '';
}
