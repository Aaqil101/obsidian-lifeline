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
import { isDataviewEnabled, renderDashboardNote, renderDisabledDashboardNote } from './dashboard';
import {
	DASHBOARD_CSS,
	dashboardScriptPath,
	normalizeScriptsFolder,
	renderDashboardScript,
} from './dashboardScript';
import {
	channelBannerImageBase,
	channelImageBase,
	dataviewBlock,
	formatDate,
	normalizeFolder,
	outputPaths,
	renderChannelsNote,
	renderPlaylistNote,
	sanitizeFileName,
	videoImageBase,
	videoThumbnailUrl,
	viewCall,
	type BulletImages,
	type JournalDates,
	type OutputPaths,
} from './markdown';
import { appendSyncLogRun } from './syncLog';
import {
	NOTE_VIEWS_CSS_BY_KIND,
	NOTE_VIEW_KINDS,
	dashboardStylesheetPath,
	legacyNoteViewsScriptPath,
	legacyTablesScriptPath,
	legacyViewsStylesheetPath,
	normalizeStylesFolder,
	noteViewScriptPath,
	noteViewViewName,
	renderNoteViewScript,
	viewsStylesheetPath,
} from './noteViewsScript';
import {
	listChannelStatistics,
	listOwnedPlaylists,
	listPlaylistsByIds,
	listPlaylistItems,
	listSubscriptions,
	QuotaTracker,
	type ChannelItem,
	type PlaylistVideoItem,
} from './youtubeApi';
import {
	asSyncError,
	SyncError,
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
 * first; an id the user unchecked stays unchecked, because it is already
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
			// New playlist discovered after the first run; tracked by default.
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
	const paths = outputPaths(plugin.settings.outputFolder, plugin.settings.imagesFolder);
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
		let ownerChannelId: string | null = null;
		try {
			// Saved playlists ride on the subscriptions call above; owned ones
			// need playlists.list. If subscriptions failed, keep the previously
			// cataloged saved entries so one failure doesn't stall their sync.
			const saved = channelsOk
				? savedPlaylists
				: plugin.settings.playlistCatalog.filter((playlist) => playlist.saved);
			const owned = await listOwnedPlaylists(plugin.auth, quota);
			ownerChannelId = owned.ownerChannelId;
			playlists = mergeCatalog(owned.playlists, saved);
			playlistsOk = true;
		} catch (err) {
			errors.push(recordError(err, 'playlists'));
		}

		// Titles for imported ids: mine=true never lists saved playlists, but
		// playlists.list?id= resolves any playlist the account can see: one
		// quota unit per 50 ids. Isolated like every fetch: on failure the ids
		// keep their previous titles and the rest of the run continues. Runs
		// every sync so upstream renames of saved playlists are followed too.
		// The collector page also lists the user's own created playlists, so
		// each resolved id is labeled owned or saved by comparing its owner
		// channel against the one captured above (not assumed saved).
		const catalogIds = new Set(playlists.map((playlist) => playlist.id));
		const unresolved = (plugin.settings.importedPlaylistIds ?? []).filter((id) => !catalogIds.has(id));
		if (unresolved.length > 0) {
			try {
				playlists = mergeCatalog(
					playlists,
					await listPlaylistsByIds(unresolved, plugin.auth, quota, ownerChannelId),
				);
			} catch (err) {
				errors.push(recordError(err, 'playlist metadata'));
			}
		}
		if (playlistsOk) {
			try {
				await adoptCatalog(plugin, playlists);
			} catch (err) {
				errors.push(recordError(err, 'playlists'));
			}
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
		const statsWanted =
			fields.subscribers ||
			fields.videos ||
			fields.views ||
			fields.country ||
			// Avatars and banners arrive on this same part=snippet response, so
			// wanting either is the only reason to keep the call; it adds no
			// request of its own. Both field toggles count, since a mode that is
			// on writes nothing once they are off.
			(plugin.settings.channelAvatars !== 'off' && (fields.avatar || fields.banner));
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
				record.avatar = stat.avatar || record.avatar;
				record.banner = stat.banner || record.banner;
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
				const { title: upstreamTitle, items } = await listPlaylistItems(target.id, plugin.auth, quota);
				applyPlaylistDiff(state, target.id, upstreamTitle || target.title, target.saved, items, today);
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
		await appendSyncLogRun(plugin.app.vault.adapter, plugin.syncLogPath(), result);
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
	const importedIds = new Set(settings.importedPlaylistIds ?? []);

	const catalog = new Map(playlists.map((playlist) => [playlist.id, playlist] as const));
	const targets: Array<{ id: string; title: string; saved: boolean }> = [];
	for (const id of trackedIds) {
		const fromCatalog = catalog.get(id);
		if (fromCatalog) {
			targets.push(fromCatalog);
			continue;
		}
		const record = plugin.state.playlists[id];
		if (importedIds.has(id)) {
			// Collected from youtube.com/feed/playlists and not in the catalog:
			// either the metadata lookup failed this run, or the playlist is
			// gone upstream. Sync anyway so items still back up; state keeps a
			// known title and saved flag, else the id syncs under its last known
			// label (default saved: the catalog above is complete when it ok'd).
			targets.push({ id, title: record?.title ?? id, saved: record?.saved ?? true });
			continue;
		}
		if (!playlistsOk && record) {
			// Catalog fetch failed: fall back to state so items still sync.
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
		// Skipped on the first sync, so the whole existing catalog is not "new".
		if (state.lastSync !== null) record.addedOn = today;
		state.playlists[playlistId] = record;
	} else {
		record.title = title;
		if (record.fileName !== desiredName && !fileNameTaken(state, playlistId, desiredName)) {
			// Playlist was renamed upstream; follow the new name.
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

	// Note views (opt-in): write the three scripts first so the dv.view()
	// calls baked into the notes always resolve. Written regardless of
	// Dataview state (a degraded note simply omits the block), matching the
	// dashboard script precedent. Per-script error isolation, so one failing
	// write never costs the others.
	if (plugin.settings.noteViews) {
		await writeNoteViewScripts(plugin, (err, path) => ctx.errors.push(recordError(err, path)));
	}
	// The block itself is only baked in when Dataview is actually enabled.
	// Each note type calls its own script; the section is baked into each.
	const viewsReady = plugin.settings.noteViews && isDataviewEnabled(plugin.app);
	const folder = plugin.settings.dashboardScriptsFolder;
	// One layout per note type. The note only ever bakes its own type's value,
	// and the view re-reads the live setting at render time, so this is purely
	// the fallback for a note rendered while the plugin cannot be reached.
	const layouts = plugin.settings.noteLayouts;
	const channelsView = viewsReady
		? dataviewBlock(
				viewCall(noteViewViewName('channels', folder), {
					layout: layouts.channels,
					fields: plugin.settings.channelsFields,
				}),
			)
		: undefined;
	const playlistView = viewsReady
		? dataviewBlock(viewCall(noteViewViewName('playlists', folder), { layout: layouts.playlists }))
		: undefined;
	const watchLaterView = viewsReady
		? dataviewBlock(viewCall(noteViewViewName('watchlater', folder), { layout: layouts.watchlater }))
		: undefined;

	// Thumbnails first, and only when a download setting is on: a bullet
	// names the local copy only once it exists on disk, so every download
	// has to finish before any note is rendered. Runs regardless of the views
	// toggle, since the image fields live in the bullets rather than the view.
	const available = await collectThumbnails(plugin, ctx);
	const channelImages: BulletImages = { mode: plugin.settings.channelAvatars, available };
	const videoImages: BulletImages = { mode: plugin.settings.videoThumbnails, available };
	// Journal dates: the base names of the notes already sitting in the
	// configured daily-notes folder, matched once per run from the vault
	// index with no extra reads. A dated bullet wikilinks a day only when
	// that day's note really exists (today and later always link, since the
	// daily note will exist when it comes around), and a folder missing from
	// the vault means nothing can exist, so every date prints plain. The
	// saved empty value older builds could store is migrated to the default
	// at load, so the setting always names a folder after onload. Recursion
	// is free: basenames are vault-wide-wikilinkable either way, and
	// year/month daily-note layouts get picked up as well.
	const journalFolder = normalizeFolder(plugin.settings.journalFolder);
	let journal: JournalDates | undefined;
	if (journalFolder) {
		// A vault-root journal ('/') holds files with no separator in the
		// path; any other folder is a plain path prefix.
		const root = journalFolder === '/';
		const names = new Set<string>();
		for (const file of vault.getMarkdownFiles()) {
			if (root ? !file.path.includes('/') : file.path.startsWith(`${journalFolder}/`)) {
				names.add(file.basename);
			}
		}
		journal = { names, today: formatDate(ctx.now) };
	}
	// Where the error list stands before any note write: the legacy-script
	// cleanup below may only run once every note has been rewritten onto the
	// current view names, and a failed write leaves its note pointing at the
	// old ones.
	const errorsBeforeNotes = ctx.errors.length;

	// Channels.md: only write when the fetch succeeded or we have known channels.
	if (ctx.channelsOk || Object.keys(ctx.state.channels).length > 0) {
		try {
			await writeNote(
				vault,
				ctx.paths.channels,
				renderChannelsNote(
					ctx.state,
					ctx.now,
					plugin.settings.channelsFields,
					channelsView,
					channelImages,
					journal,
				),
			);
		} catch (err) {
			ctx.errors.push(recordError(err, ctx.paths.channels));
		}
	}

	for (const [playlistId, record] of Object.entries(ctx.state.playlists)) {
		if (!ctx.trackedIds.has(playlistId)) continue;
		try {
			if (playlistId === ctx.watchLaterId) {
				await writeNote(
					vault,
					ctx.paths.watchLater,
					renderPlaylistNote(playlistId, record.title, record, ctx.now, watchLaterView, videoImages, journal),
				);
			} else {
				const path = `${ctx.paths.playlistsFolder}/${record.fileName}.md`;
				await writeNote(
					vault,
					path,
					renderPlaylistNote(playlistId, record.title, record, ctx.now, playlistView, videoImages, journal),
				);
				const previous = ctx.previousFiles.get(playlistId);
				if (previous && previous !== record.fileName) {
					await deleteNote(plugin.app, `${ctx.paths.playlistsFolder}/${previous}.md`);
				}
			}
		} catch (err) {
			ctx.errors.push(recordError(err, `note ${record.title}`));
		}
	}

	// Superseded scripts (the pre-split lifeline-noteviews.js and the
	// pre-rename lifeline-tables.js): only once every note above has been
	// rewritten onto the current view names, so no note can be left pointing
	// at a file this deletes. Best effort, never fails the run.
	try {
		await deleteLegacyViewScripts(plugin, ctx.errors.length === errorsBeforeNotes);
	} catch {
		// a stale copy is harmless; the next sync retries it
	}

	// Dashboard (opt-in): last so its header reflects every write above.
	if (plugin.settings.dashboardNote) {
		// Script first, in its own try: Dashboard.md's dv.view() calls need it,
		// and a script failure is recorded as its own error before status runs.
		try {
			await writeDashboardScript(plugin);
		} catch (err) {
			ctx.errors.push(recordError(err, dashboardScriptPath(plugin.settings.dashboardScriptsFolder)));
		}
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
				scriptsFolder: plugin.settings.dashboardScriptsFolder,
			}));
		} catch (err) {
			ctx.errors.push(recordError(err, ctx.paths.dashboard));
		}
	} else {
		try {
			await writeDisabledDashboardNote(vault, ctx.paths.dashboard);
		} catch (err) {
			ctx.errors.push(recordError(err, ctx.paths.dashboard));
		}
	}
}

/**
 * Write one generated view script into the configured scripts folder and
 * record which folder it landed in. All four generated scripts (the
 * dashboard script and the three note-view scripts) share the same folder
 * setting and the same bookkeeping key, so whichever one notices a folder
 * change trashes the copies left in the old folder, along with the legacy
 * lifeline-noteviews.js and lifeline-tables.js. Written regardless of
 * Dataview state: a degraded note simply does not reference it, and the
 * script is ready when Dataview comes back.
 */
async function writeGeneratedScript(
	plugin: LifelinePlugin,
	scriptPath: (folder: string) => string,
	content: string,
): Promise<void> {
	const folder = normalizeScriptsFolder(plugin.settings.dashboardScriptsFolder);
	await writeNote(plugin.app.vault, scriptPath(folder), content);
	const previous = plugin.settings.dashboardScriptsFolderWritten;
	if (previous !== folder) {
		plugin.settings.dashboardScriptsFolderWritten = folder;
		await plugin.saveSettings();
		if (previous) {
			const oldFolder = normalizeScriptsFolder(previous);
			await deleteNote(plugin.app, dashboardScriptPath(oldFolder));
			for (const kind of NOTE_VIEW_KINDS) await deleteNote(plugin.app, noteViewScriptPath(kind, oldFolder));
			await deleteNote(plugin.app, legacyNoteViewsScriptPath(oldFolder));
			await deleteNote(plugin.app, legacyTablesScriptPath(oldFolder));
		}
	}
}

/**
 * Remove the scripts superseded by the current names: lifeline-noteviews.js
 * (now split into three) and lifeline-tables.js (from before the rename).
 * Only called once every note has been rewritten off the old view names, so
 * nothing that still points at them can be left holding a deleted script.
 * Best effort: a missing file is a no-op and a failure never fails the sync.
 */
async function deleteLegacyViewScripts(plugin: LifelinePlugin, notesRewritten: boolean): Promise<void> {
	if (!notesRewritten) return;
	const current = normalizeScriptsFolder(plugin.settings.dashboardScriptsFolder);
	const previous = plugin.settings.dashboardScriptsFolderWritten;
	const folders = [current];
	if (previous && previous !== current) folders.push(normalizeScriptsFolder(previous));
	for (const folder of folders) {
		await deleteNote(plugin.app, legacyNoteViewsScriptPath(folder));
		await deleteNote(plugin.app, legacyTablesScriptPath(folder));
	}
}

/**
 * Write the generated dv.view script (lifeline-dashboard.js) and its
 * stylesheet. Called alongside every Dashboard.md write so the note's baked
 * view name always resolves: Dataview's dv.view() lookup does not throw, it
 * silently renders "custom view not found" otherwise, and an unstyled
 * dashboard renders worse than not.
 */
async function writeDashboardScript(plugin: LifelinePlugin): Promise<void> {
	await writeViewStylesheets(plugin);
	await writeGeneratedScript(
		plugin,
		dashboardScriptPath,
		renderDashboardScript(dashboardStylesheetPath(plugin.settings.stylesFolder)),
	);
}

/**
 * Write the generated view stylesheets into the configured styles folder:
 * one per note kind (lifeline-channels.css, lifeline-playlists.css,
 * lifeline-watchlater.css) plus the dashboard's lifeline-dashboard.css.
 * Every view script reads its own file at view time, so they must exist
 * before the notes are rendered; written alongside the scripts for the same
 * reason the dashboard script is written before the note. The bookkeeping
 * key (stylesFolderWritten) trashes copies left in a previous styles folder,
 * mirroring writeGeneratedScript's cleanup, and the superseded single
 * lifeline-views.css is removed from both folders on the same pass. A
 * missing or unreadable stylesheet leaves views unstyled but functional, so
 * a failure here is recorded by the caller and never blocks the scripts.
 */
async function writeViewStylesheets(plugin: LifelinePlugin): Promise<void> {
	const folder = normalizeStylesFolder(plugin.settings.stylesFolder);
	await writeNote(
		plugin.app.vault,
		viewsStylesheetPath('channels', folder),
		NOTE_VIEWS_CSS_BY_KIND.channels,
	);
	await writeNote(
		plugin.app.vault,
		viewsStylesheetPath('playlists', folder),
		NOTE_VIEWS_CSS_BY_KIND.playlists,
	);
	await writeNote(
		plugin.app.vault,
		viewsStylesheetPath('watchlater', folder),
		NOTE_VIEWS_CSS_BY_KIND.watchlater,
	);
	await writeNote(plugin.app.vault, dashboardStylesheetPath(folder), DASHBOARD_CSS);
	const previous = plugin.settings.stylesFolderWritten;
	if (previous !== folder) {
		plugin.settings.stylesFolderWritten = folder;
		await plugin.saveSettings();
		if (previous) {
			const before = normalizeStylesFolder(previous);
			for (const kind of NOTE_VIEW_KINDS) {
				await deleteNote(plugin.app, viewsStylesheetPath(kind, before));
			}
			await deleteNote(plugin.app, dashboardStylesheetPath(before));
		}
	}
	// The single shared sheet the four per-kind files replaced is stale in
	// the current folder and wherever the sheets used to live; each run
	// sweeps both so a folder move never leaves one behind.
	const staleFolders = new Set<string>([folder]);
	if (previous) staleFolders.add(normalizeStylesFolder(previous));
	for (const stale of staleFolders) {
		await deleteNote(plugin.app, legacyViewsStylesheetPath(stale));
	}
}

/**
 * Write the generated view stylesheets (one per note kind plus the
 * dashboard's) and the three generated note-view scripts
 * (lifeline-channels.js, lifeline-playlists.js, lifeline-watchlater.js).
 * Exported so the settings toggle-on can write them immediately, before the
 * next sync bakes the dv.view() calls into the notes. The stylesheets go
 * first: each script reads its own at view time, so they must be in place
 * before any note is rendered. With an error sink each write is isolated
 * (one failing write is recorded and never blocks the others); without one
 * the first failure is rethrown for the caller to report.
 */
export async function writeNoteViewScripts(
	plugin: LifelinePlugin,
	onError?: (err: unknown, path: string) => void,
): Promise<void> {
	// Errors land in the array rather than a captured `let`: each step keeps
	// running so one failing write never blocks the rest, and the first
	// normalized error is rethrown once everything has been attempted.
	const firstErrors: Error[] = [];
	const step = async (fn: () => Promise<void>, path: string): Promise<void> => {
		try {
			await fn();
		} catch (err) {
			if (onError) onError(err, path);
			else firstErrors.push(err instanceof Error ? err : new Error(String(err)));
		}
	};
	await step(
		() => writeViewStylesheets(plugin),
		dashboardStylesheetPath(plugin.settings.stylesFolder),
	);
	// The two video scripts join channel avatars from Channels.md, so the note's
	// vault path is baked in beside the script: a local avatar belongs to that
	// note, not to the playlist note the view is reading.
	const channelsPath = outputPaths(plugin.settings.outputFolder).channels;
	for (const kind of NOTE_VIEW_KINDS) {
		await step(
			() =>
				writeGeneratedScript(
					plugin,
					(folder) => noteViewScriptPath(kind, folder),
					renderNoteViewScript(kind, plugin.settings.stylesFolder, channelsPath),
				),
			noteViewScriptPath(kind, plugin.settings.dashboardScriptsFolder),
		);
	}
	const firstError = firstErrors[0];
	if (firstError !== undefined) throw firstError;
}

/**
 * Swap an existing Dashboard.md for the disabled-notice callout. Only
 * touches a note that already exists, so turning the setting off never
 * creates a file for someone who never enabled the dashboard.
 */
export async function writeDisabledDashboardNote(vault: Vault, path: string): Promise<void> {
	if (!(vault.getAbstractFileByPath(path) instanceof TFile)) return;
	await writeNote(vault, path, renderDisabledDashboardNote());
}

/**
 * Write Dashboard.md on demand (create-dashboard command, settings toggle-on,
 * sub-page refresh). Uses current state + `state.lastSync` for the header, so
 * it works before any sync has run (status null → "never").
 */
export async function writeDashboardNote(plugin: LifelinePlugin): Promise<string> {
	const paths = outputPaths(plugin.settings.outputFolder, plugin.settings.imagesFolder);
	const trackedIds = new Set(plugin.settings.trackedPlaylists ?? []);
	if (plugin.settings.watchLaterPlaylistId) trackedIds.add(plugin.settings.watchLaterPlaylistId);
	const last = plugin.state.lastSync;
	// Script first: the note's dv.view() calls would break without it.
	await writeDashboardScript(plugin);
	const content = renderDashboardNote(plugin.state, {
		paths,
		sections: plugin.settings.dashboardSections,
		dataviewReady: isDataviewEnabled(plugin.app),
		trackedIds,
		watchLaterId: plugin.settings.watchLaterPlaylistId,
		syncedAt: last ? new Date(last.at) : new Date(),
		status: last?.status ?? null,
		scriptsFolder: plugin.settings.dashboardScriptsFolder,
	});
	await writeNote(plugin.app.vault, paths.dashboard, content);
	return paths.dashboard;
}

// ---------------------------------------------------------------------------
// Thumbnails (opt-in "Download" mode, into the configured Images folder)
// ---------------------------------------------------------------------------

/** Parallel image fetches. Deliberately low: these race with the note writes
 *  the user is waiting on, and a bulk first sync can ask for thousands. */
const THUMBNAIL_CONCURRENCY = 5;

/** Per-image budget, so one stalled host cannot hold a worker slot forever. */
const THUMBNAIL_TIMEOUT_MS = 15_000;

/**
 * Bail out of the download phase after this many *network* failures in a row.
 * Offline, one 15s timeout per slot would otherwise stall a sync for minutes
 * before writing a single note. Stopping early records one error and lets the
 * run finish; HTTP rejections and malformed payloads do not count, because
 * they return immediately and are usually one bad image, not a dead link.
 */
const THUMBNAIL_NETWORK_BAIL = 5;

/** Returned when no download is owed, so callers need no special case. */
const NO_THUMBNAILS: ReadonlySet<string> = new Set<string>();

/**
 * True only for genuine image bytes, judged by signature rather than by a
 * status code or content-type header. A bad YouTube image URL answers with an
 * HTML error page, and saving that as `.jpg` would leave a permanently broken
 * file behind, which download mode would then skip forever.
 */
function looksLikeImage(bytes: Uint8Array): boolean {
	if (bytes.length < 4) return false;
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true; // PNG
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true; // GIF8
	if (bytes.length < 12) return false;
	return (
		bytes[0] === 0x52 && // "RIFF"
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 && // "WEBP"
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	);
}

/** Discriminated so `ok` narrows `data` and `reason` without a cast. */
type FetchOutcome =
	| { ok: true; data: ArrayBuffer }
	| { ok: false; reason: 'http' | 'invalid' | 'network' };

/**
 * Fetch one image under an abort timeout. Returns the bytes when they are
 * real image data, otherwise why it failed, so the caller can tally every
 * miss into a single sync-log line instead of one line per file.
 */
async function fetchImage(url: string): Promise<FetchOutcome> {
	const controller = new AbortController();
	// window.* so a timer created here belongs to the active window: Obsidian
	// popouts would otherwise clear a timer they never created.
	const timer = window.setTimeout(() => controller.abort(), THUMBNAIL_TIMEOUT_MS);
	try {
		// Native fetch, not requestUrl: requestUrl accepts no AbortSignal, so it
		// cannot honour the timeout above and a stalled host would hold a worker
		// slot indefinitely. The CORS concern behind the fetch lint rule does not
		// apply to these image hosts: both yt3.ggpht.com and i.ytimg.com were
		// verified to respond with `access-control-allow-origin: *`.
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) return { ok: false, reason: 'http' };
		const data = await res.arrayBuffer();
		if (!looksLikeImage(new Uint8Array(data))) return { ok: false, reason: 'invalid' };
		return { ok: true, data };
	} catch {
		// Aborted, DNS failure, or reset: indistinguishable here, all "network".
		return { ok: false, reason: 'network' };
	} finally {
		window.clearTimeout(timer);
	}
}

/**
 * Download every thumbnail this run's notes will reference, before any note
 * is written, and return the file base names now present in the thumbnails
 * folder.
 *
 * Costs nothing when both image settings are off (the default). Existing
 * files are never re-fetched: the folder is listed once instead of checking
 * file by file. Nothing here ever throws: an image that cannot be fetched
 * leaves that one bullet on its remote URL field or with no image, and the
 * run still writes every note.
 */
async function collectThumbnails(plugin: LifelinePlugin, ctx: WriteContext): Promise<ReadonlySet<string>> {
	const { channelAvatars, videoThumbnails } = plugin.settings;
	if (channelAvatars !== 'download' && videoThumbnails !== 'download') return NO_THUMBNAILS;

	const folder = ctx.paths.thumbnails;
	const adapter = plugin.app.vault.adapter;

	const present = new Set<string>();
	try {
		const { files } = await adapter.list(folder);
		for (const path of files) {
			if (!path.toLowerCase().endsWith('.jpg')) continue;
			present.add(path.slice(path.lastIndexOf('/') + 1, -4));
		}
	} catch {
		// Folder absent or unreadable: an empty set means "fetch them all".
	}

	const jobs: Array<{ base: string; url: string }> = [];
	const queued = new Set<string>();
	const queue = (base: string, url: string): void => {
		if (!url || present.has(base) || queued.has(base)) return;
		queued.add(base);
		jobs.push({ base, url });
	};

	if (channelAvatars === 'download') {
		for (const [id, channel] of Object.entries(ctx.state.channels)) {
			queue(channelImageBase(id), channel.avatar ?? '');
			// The banner rides the same toggle and folder; a channel without one
			// simply queues nothing.
			queue(channelBannerImageBase(id), channel.banner ?? '');
		}
	}
	if (videoThumbnails === 'download') {
		for (const [playlistId, record] of Object.entries(ctx.state.playlists)) {
			if (!ctx.trackedIds.has(playlistId)) continue;
			for (const [videoId, video] of Object.entries(record.videos)) {
				// The same set the bullets come from: never fetch for a hidden entry.
				if (video.removed || video.unavailable) continue;
				queue(videoImageBase(videoId), videoThumbnailUrl(videoId));
			}
		}
	}
	if (jobs.length === 0) return present;

	await ensureFolder(plugin.app.vault, folder);

	let attempted = 0;
	let http = 0;
	let invalid = 0;
	let network = 0;
	let consecutiveNetwork = 0;
	let bailed = false;

	let next = 0;
	const worker = async (): Promise<void> => {
		while (!bailed && next < jobs.length) {
			const job = jobs[next++];
			if (!job) break;
			attempted++;
			const outcome = await fetchImage(job.url);
			if (outcome.ok) {
				consecutiveNetwork = 0;
				try {
					await adapter.writeBinary(`${folder}/${job.base}.jpg`, outcome.data);
					present.add(job.base);
				} catch {
					// One unwritable file is still one file: the bullet falls back
					// to a link and the run carries on.
					invalid++;
				}
				continue;
			}
			if (outcome.reason === 'network') {
				network++;
				consecutiveNetwork++;
				if (consecutiveNetwork >= THUMBNAIL_NETWORK_BAIL) bailed = true;
			} else if (outcome.reason === 'http') {
				http++;
			} else {
				invalid++;
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(THUMBNAIL_CONCURRENCY, jobs.length) }, () => worker()),
	);

	const failed = http + invalid + network;
	if (failed > 0) {
		// One record for the whole run: per-file lines would bury the log.
		const detail = bailed
			? `; ${jobs.length - attempted} skipped after ${THUMBNAIL_NETWORK_BAIL} consecutive network failures`
			: '';
		ctx.errors.push(
			recordError(
				new SyncError(
					network > 0 ? 'network' : 'api',
					'thumbnails',
					`${failed} of ${attempted} thumbnail downloads failed${detail}`,
				),
				'thumbnails',
			),
		);
	}

	return present;
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
				// created concurrently; idempotent ensure, safe to ignore
			}
		}
	}
}

async function writeNote(vault: Vault, path: string, content: string): Promise<void> {
	const file = vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		const current = await vault.cachedRead(file);
		if (current === content) return; // unchanged: skip to avoid needless events
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
		// lost a creation race: modify if the file now exists
		const raced = vault.getAbstractFileByPath(path);
		if (raced instanceof TFile) await vault.modify(raced, content);
		else throw new Error(`Could not create note: ${path}`);
	}
}

/**
 * Remove a superseded note after an upstream playlist rename; uses
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
