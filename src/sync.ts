/**
 * Sync orchestration: fetch → diff state → write notes → append log.
 *
 * Rules:
 * - One run at a time (in-flight promise is reused; commands/ribbon/auto-sync
 *   all funnel through runSync).
 * - Every fetch is isolated: an error in one resource is recorded and the run
 *   continues. Status is ✓ ok / ⚠ warn / ✗ error based on what succeeded.
 * - State lives in state.json (plugin data, no secrets) and is saved at the
 *   end of every run so partial failures never lose known data.
 */
import { App, Notice, TFile, type Vault } from 'obsidian';
import { isDataviewEnabled, renderDashboardNote } from './dashboard';
import {
	formatDate,
	outputPaths,
	renderChannelsNote,
	renderPlaylistNote,
	renderSyncLogLine,
	sanitizeFileName,
	SYNC_LOG_HEADER,
	type OutputPaths,
} from './markdown';
import {
	listChannelStatistics,
	listOwnedPlaylists,
	listPlaylistItems,
	listSubscriptions,
	QuotaTracker,
	type ChannelItem,
	type PlaylistVideoItem,
} from './youtubeApi';
import {
	asSyncError,
	type PlaylistRecord,
	type PlaylistSummary,
	type SyncErrorRecord,
	type SyncRunResult,
	type SyncState,
	type SyncStatus,
} from './types';
import type LifelinePlugin from './main';

let inFlight: Promise<SyncRunResult> | null = null;

/** Deduplicated sync entry point used by the command, ribbon, and auto-sync. */
export function runSync(plugin: LifelinePlugin): Promise<SyncRunResult> {
	if (inFlight) return inFlight;
	const promise = doSync(plugin).finally(() => {
		inFlight = null;
	});
	inFlight = promise;
	return promise;
}

/**
 * Adopt a freshly fetched playlist catalog into settings: refresh titles,
 * remember every id ever seen, and track NEW playlists by default (backup
 * first — an id the user unchecked stays unchecked, because it is already
 * known).
 */
/**
 * Merge owned and saved playlists into one catalog, owned first. YouTube can't
 * return the same playlist in both lists, but dedupe defensively by id.
 */
export function mergeCatalog(owned: PlaylistSummary[], saved: PlaylistSummary[]): PlaylistSummary[] {
	const merged = [...owned];
	const seen = new Set(owned.map((playlist) => playlist.id));
	for (const playlist of saved) {
		if (seen.has(playlist.id)) continue;
		seen.add(playlist.id);
		merged.push(playlist);
	}
	return merged;
}

export async function adoptCatalog(plugin: LifelinePlugin, playlists: PlaylistSummary[]): Promise<void> {
	const settings = plugin.settings;
	const firstRun = settings.trackedPlaylists === null;
	const known = new Set(settings.knownPlaylistIds);
	const tracked = new Set(settings.trackedPlaylists ?? []);

	for (const playlist of playlists) {
		if (firstRun) {
			tracked.add(playlist.id);
			known.add(playlist.id);
		} else if (!known.has(playlist.id)) {
			// New playlist discovered after the first run — tracked by default.
			known.add(playlist.id);
			tracked.add(playlist.id);
		}
	}
	if (settings.watchLaterPlaylistId) tracked.add(settings.watchLaterPlaylistId);

	settings.playlistCatalog = playlists;
	settings.knownPlaylistIds = Array.from(known);
	settings.trackedPlaylists = Array.from(tracked);
	await plugin.saveSettings();
}

async function doSync(plugin: LifelinePlugin): Promise<SyncRunResult> {
	const startedAt = Date.now();
	const now = new Date(startedAt);
	const errors: SyncErrorRecord[] = [];
	const paths = outputPaths(plugin.settings.outputFolder);
	const quota = new QuotaTracker(plugin.settings.quotaSoftLimit);
	const state = plugin.state;

	plugin.setSyncingIndicator();

	let channelsOk = false;
	let channels: ChannelItem[] = [];
	let savedPlaylists: PlaylistSummary[] = [];
	let videosFound = 0;
	let playlistsSynced = 0;

	// Pre-flight: without a token nothing below can work; the run is still logged.
	try {
		await plugin.auth.getAccessToken();
	} catch (err) {
		errors.push(recordError(err, 'oauth'));
	}

	if (errors.length === 0) {
		// --- subscriptions ----------------------------------------------------
		try {
			const feed = await listSubscriptions(plugin.auth, quota);
			channels = feed.channels;
			savedPlaylists = feed.savedPlaylists;
			channelsOk = true;
		} catch (err) {
			errors.push(recordError(err, 'subscriptions'));
		}

		// --- playlist catalog (owned + saved) ----------------------------------
		let playlists: PlaylistSummary[] = [];
		let playlistsOk = false;
		try {
			// Saved playlists ride on the subscriptions call above; owned ones
			// need playlists.list. If subscriptions failed, keep the previously
			// cataloged saved entries so one failure doesn't stall their sync.
			const saved = channelsOk
				? savedPlaylists
				: plugin.settings.playlistCatalog.filter((playlist) => playlist.saved);
			playlists = mergeCatalog(await listOwnedPlaylists(plugin.auth, quota), saved);
			playlistsOk = true;
			await adoptCatalog(plugin, playlists);
		} catch (err) {
			errors.push(recordError(err, 'playlists'));
		}

		// --- channel state diff ------------------------------------------------
		if (channelsOk) {
			const currentIds = new Set(channels.map((channel) => channel.id));
			const today = formatDate(now);
			for (const channel of channels) {
				const existing = state.channels[channel.id];
				if (existing) {
					existing.title = channel.title;
					existing.url = channel.url;
					existing.subscribedOn = channel.subscribedOn || existing.subscribedOn || '';
					existing.lastSeen = today;
					existing.subscribed = true;
				} else {
					state.channels[channel.id] = {
						title: channel.title,
						url: channel.url,
						subscribedOn: channel.subscribedOn,
						firstSeen: today,
						lastSeen: today,
						subscribed: true,
					};
				}
			}
			for (const [id, channel] of Object.entries(state.channels)) {
				if (!currentIds.has(id)) channel.subscribed = false;
			}
		}

		// --- channel statistics (only when a paid field toggle is on) ----------
		const fields = plugin.settings.channelsFields;
		const statsWanted = fields.subscribers || fields.videos || fields.views || fields.country;
		if (channelsOk && statsWanted) {
			const { stats, syncErrors } = await listChannelStatistics(
				plugin.auth,
				quota,
				channels.map((channel) => channel.id),
			);
			errors.push(...syncErrors);
			// Store-then-render: everything fetched lands in state regardless of
			// render toggles, so enabling a field later renders immediately.
			for (const stat of stats) {
				const record = state.channels[stat.id];
				if (!record) continue; // deleted upstream or not currently tracked
				record.handle = stat.handle || record.handle;
				if (stat.subscribers !== null) record.subscribers = stat.subscribers;
				if (stat.videos !== null) record.videoCount = stat.videos;
				if (stat.views !== null) record.viewCount = stat.views;
				record.country = stat.country || record.country;
			}
		}

		// --- per-playlist items (each fetch isolated) ---------------------------
		const { trackedIds, targets } = buildTargets(plugin, playlistsOk, playlists);
		const previousFiles = new Map(
			Object.entries(state.playlists).map(([id, record]) => [id, record.fileName] as const),
		);
		const today = formatDate(now);

		for (const target of targets) {
			try {
				const items = await listPlaylistItems(target.id, plugin.auth, quota);
				applyPlaylistDiff(state, target.id, target.title, target.saved, items, today);
				playlistsSynced++;
				videosFound += items.length;
			} catch (err) {
				errors.push(recordError(err, `playlist ${target.title}`));
			}
		}

		// --- write notes (each write isolated) ---------------------------------
		const ctx: WriteContext = {
			paths,
			state,
			now,
			trackedIds,
			watchLaterId: plugin.settings.watchLaterPlaylistId,
			previousFiles,
			channelsOk,
			quotaSoftWarn: quota.softWarn,
			playlistsSynced,
			errors,
		};
		await writeOutputs(plugin, ctx);
	}

	// --- assemble result + append sync log ------------------------------------
	const quotaSoftWarn = quota.softWarn;
	const buildResult = (): SyncRunResult => ({
		status: computeStatus(errors, quotaSoftWarn, channelsOk || playlistsSynced > 0),
		startedAt,
		channelsSynced: channelsOk ? channels.length : 0,
		playlistsSynced,
		videosFound,
		quotaUnits: quota.used,
		quotaSoftWarn,
		errors,
	});

	let result = buildResult();
	try {
		const line = renderSyncLogLine(result, now);
		await appendSyncLog(plugin, line);
	} catch (err) {
		errors.push(recordError(err, 'sync-log'));
		result = buildResult();
	}

	state.lastSync = {
		at: startedAt,
		status: result.status,
		channels: result.channelsSynced,
		playlists: result.playlistsSynced,
		videos: result.videosFound,
		quotaUnits: result.quotaUnits,
		errorSummary: errors.length > 0 ? summarizeKinds(errors) : null,
	};
	if (result.status !== 'error') state.lastSuccessAt = startedAt;
	await plugin.saveState();

	plugin.updateStatusBar();
	new Notice(noticeFor(result), 8000);
	return result;
}

// ---------------------------------------------------------------------------
// State diffing
// ---------------------------------------------------------------------------

interface WriteContext {
	paths: OutputPaths;
	state: SyncState;
	now: Date;
	trackedIds: Set<string>;
	watchLaterId: string;
	previousFiles: Map<string, string>;
	channelsOk: boolean;
	/** Snapshot inputs so the dashboard header shows this run's status. */
	quotaSoftWarn: boolean;
	playlistsSynced: number;
	errors: SyncErrorRecord[];
}

function buildTargets(
	plugin: LifelinePlugin,
	playlistsOk: boolean,
	playlists: PlaylistSummary[],
): { trackedIds: Set<string>; targets: Array<{ id: string; title: string; saved: boolean }> } {
	const settings = plugin.settings;
	const trackedIds = new Set(settings.trackedPlaylists ?? []);
	if (settings.watchLaterPlaylistId) trackedIds.add(settings.watchLaterPlaylistId);

	const catalog = new Map(playlists.map((playlist) => [playlist.id, playlist] as const));
	const targets: Array<{ id: string; title: string; saved: boolean }> = [];
	for (const id of trackedIds) {
		const fromCatalog = catalog.get(id);
		if (fromCatalog) {
			targets.push(fromCatalog);
		} else if (!playlistsOk && plugin.state.playlists[id]) {
			// Catalog fetch failed — fall back to state so items still sync.
			const record = plugin.state.playlists[id];
			targets.push({ id, title: record.title, saved: record.saved === true });
		}
		// Catalog OK but id missing → playlist deleted upstream; skip quietly.
	}
	return { trackedIds, targets };
}

function applyPlaylistDiff(
	state: SyncState,
	playlistId: string,
	title: string,
	saved: boolean,
	items: PlaylistVideoItem[],
	today: string,
): void {
	let record: PlaylistRecord | undefined = state.playlists[playlistId];
	const desiredName = sanitizeFileName(title, `playlist-${playlistId.slice(-6)}`);
	if (!record) {
		record = {
			title,
			fileName: uniqueFileName(state, playlistId, desiredName),
			videos: {},
		};
		state.playlists[playlistId] = record;
	} else {
		record.title = title;
		if (record.fileName !== desiredName && !fileNameTaken(state, playlistId, desiredName)) {
			// Playlist was renamed upstream — follow the new name.
			record.fileName = desiredName;
		}
	}
	record.saved = saved;

	const seen = new Set(items.map((item) => item.videoId));
	for (const [videoId, video] of Object.entries(record.videos)) {
		if (!seen.has(videoId)) video.removed = true;
	}
	for (const item of items) {
		const existing = record.videos[item.videoId];
		if (existing) {
			existing.title = item.title;
			existing.channelTitle = item.channelTitle || existing.channelTitle;
			existing.channelId = item.channelId || existing.channelId;
			existing.dateAdded = item.dateAdded || existing.dateAdded;
			existing.position = item.position;
			existing.removed = false;
			existing.unavailable = item.unavailable;
		} else {
			record.videos[item.videoId] = {
				title: item.title,
				channelTitle: item.channelTitle,
				channelId: item.channelId,
				firstSeen: today,
				dateAdded: item.dateAdded,
				position: item.position,
				removed: false,
				unavailable: item.unavailable,
			};
		}
	}
}

function fileNameTaken(state: SyncState, exceptId: string, fileName: string): boolean {
	return Object.entries(state.playlists).some(([id, record]) => id !== exceptId && record.fileName === fileName);
}

function uniqueFileName(state: SyncState, playlistId: string, base: string): string {
	if (!fileNameTaken(state, playlistId, base)) return base;
	const suffix = playlistId.slice(-6);
	let candidate = `${base} (${suffix})`;
	let counter = 2;
	while (fileNameTaken(state, playlistId, candidate)) {
		candidate = `${base} (${suffix}-${counter})`;
		counter++;
	}
	return candidate;
}

// ---------------------------------------------------------------------------
// Vault I/O (isolated per note)
// ---------------------------------------------------------------------------

async function writeOutputs(plugin: LifelinePlugin, ctx: WriteContext): Promise<void> {
	const vault = plugin.app.vault;

	// Channels.md: only write when the fetch succeeded or we have known channels.
	if (ctx.channelsOk || Object.keys(ctx.state.channels).length > 0) {
		try {
			await writeNote(
				vault,
				ctx.paths.channels,
				renderChannelsNote(ctx.state, ctx.now, plugin.settings.channelsFields),
			);
		} catch (err) {
			ctx.errors.push(recordError(err, ctx.paths.channels));
		}
	}

	for (const [playlistId, record] of Object.entries(ctx.state.playlists)) {
		if (!ctx.trackedIds.has(playlistId)) continue;
		try {
			if (playlistId === ctx.watchLaterId) {
				await writeNote(vault, ctx.paths.watchLater, renderPlaylistNote(playlistId, record.title, record, ctx.now));
			} else {
				const path = `${ctx.paths.playlistsFolder}/${record.fileName}.md`;
				await writeNote(vault, path, renderPlaylistNote(playlistId, record.title, record, ctx.now));
				const previous = ctx.previousFiles.get(playlistId);
				if (previous && previous !== record.fileName) {
					await deleteNote(plugin.app, `${ctx.paths.playlistsFolder}/${previous}.md`);
				}
			}
		} catch (err) {
			ctx.errors.push(recordError(err, `note ${record.title}`));
		}
	}

	// Dashboard (opt-in): last so its header reflects every write above.
	if (plugin.settings.dashboardNote) {
		try {
			const status = computeStatus(ctx.errors, ctx.quotaSoftWarn, ctx.channelsOk || ctx.playlistsSynced > 0);
			await writeNote(vault, ctx.paths.dashboard, renderDashboardNote(ctx.state, {
				paths: ctx.paths,
				sections: plugin.settings.dashboardSections,
				dataviewReady: isDataviewEnabled(plugin.app),
				trackedIds: ctx.trackedIds,
				watchLaterId: ctx.watchLaterId,
				syncedAt: ctx.now,
				status,
			}));
		} catch (err) {
			ctx.errors.push(recordError(err, ctx.paths.dashboard));
		}
	}
}

/**
 * Write Dashboard.md on demand (create-dashboard command, settings toggle-on,
 * sub-page refresh). Uses current state + `state.lastSync` for the header, so
 * it works before any sync has run (status null → "never").
 */
export async function writeDashboardNote(plugin: LifelinePlugin): Promise<string> {
	const paths = outputPaths(plugin.settings.outputFolder);
	const trackedIds = new Set(plugin.settings.trackedPlaylists ?? []);
	if (plugin.settings.watchLaterPlaylistId) trackedIds.add(plugin.settings.watchLaterPlaylistId);
	const last = plugin.state.lastSync;
	const content = renderDashboardNote(plugin.state, {
		paths,
		sections: plugin.settings.dashboardSections,
		dataviewReady: isDataviewEnabled(plugin.app),
		trackedIds,
		watchLaterId: plugin.settings.watchLaterPlaylistId,
		syncedAt: last ? new Date(last.at) : new Date(),
		status: last?.status ?? null,
	});
	await writeNote(plugin.app.vault, paths.dashboard, content);
	return paths.dashboard;
}

async function ensureFolder(vault: Vault, folder: string): Promise<void> {
	const parts = folder.split('/').filter(Boolean);
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!vault.getAbstractFileByPath(current)) {
			try {
				await vault.createFolder(current);
			} catch {
				// created concurrently — idempotent ensure, safe to ignore
			}
		}
	}
}

async function writeNote(vault: Vault, path: string, content: string): Promise<void> {
	const file = vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		const current = await vault.cachedRead(file);
		if (current === content) return; // unchanged — skip to avoid needless events
		await vault.modify(file, content);
		return;
	}
	if (file) {
		throw new Error(`Path exists but is not a file: ${path}`);
	}
	const slash = path.lastIndexOf('/');
	if (slash > 0) await ensureFolder(vault, path.slice(0, slash));
	try {
		await vault.create(path, content);
	} catch {
		// lost a creation race — modify if the file now exists
		const raced = vault.getAbstractFileByPath(path);
		if (raced instanceof TFile) await vault.modify(raced, content);
		else throw new Error(`Could not create note: ${path}`);
	}
}

/** Append one line to the sync log in the plugin folder. Uses the adapter
 * because .obsidian dot-folders are not vault-indexed. */
async function appendSyncLog(plugin: LifelinePlugin, line: string): Promise<void> {
	const adapter = plugin.app.vault.adapter;
	const path = plugin.syncLogPath();
	if (await adapter.exists(path)) {
		const current = await adapter.read(path);
		const prefix = current.endsWith('\n') ? current : `${current}\n`;
		await adapter.write(path, `${prefix}${line}\n`);
		return;
	}
	await adapter.write(path, `${SYNC_LOG_HEADER}\n\n${line}\n`);
}

/**
 * Remove a superseded note after an upstream playlist rename — uses
 * FileManager.trashFile so the user's trash preference is respected.
 */
async function deleteNote(app: App, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		try {
			await app.fileManager.trashFile(file);
		} catch (err) {
			console.warn(`Lifeline: could not delete renamed note ${path}`, err);
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recordError(err: unknown, resource: string): SyncErrorRecord {
	const error = asSyncError(err, resource);
	return { kind: error.kind, resource: error.resource, message: error.message };
}

function computeStatus(errors: SyncErrorRecord[], quotaSoftWarn: boolean, hadSuccess: boolean): SyncStatus {
	if (errors.length === 0) return quotaSoftWarn ? 'warn' : 'ok';
	return hadSuccess ? 'warn' : 'error';
}

function summarizeKinds(errors: SyncErrorRecord[]): string {
	return Array.from(new Set(errors.map((error) => error.kind))).join(', ');
}

function noticeFor(result: SyncRunResult): string {
	if (result.status === 'error') {
		const first = result.errors[0];
		const kinds = summarizeKinds(result.errors);
		return `Lifeline sync failed (${kinds})${first ? `: ${first.message}` : ''}`;
	}
	const base =
		`Lifeline sync finished: ${result.channelsSynced} channels, ` +
		`${result.playlistsSynced} playlists, ${result.videosFound} videos.`;
	if (result.status === 'warn') {
		const first = result.errors[0];
		return `${base} Completed with warnings${first ? ` (${first.kind}: ${first.message})` : ''}`;
	}
	return base;
}
