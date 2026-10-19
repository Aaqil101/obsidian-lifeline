/**
 * Dashboard note (Dashboard.md): an opt-in home note with a static summary
 * computed from sync state, plus live DataviewJS sections over the synced
 * notes. Pure rendering + one capability check (isDataviewEnabled) — no
 * vault I/O here; sync.ts owns the file writes (writeDashboardNote and the
 * writeOutputs path).
 *
 * Static parts (frontmatter, sync status, counts, quick links, playlist
 * table) work with or without Dataview. The DataviewJS blocks select notes
 * by their `type` frontmatter inside the output folder, with the folder path
 * baked into each block, so custom output folders keep working.
 *
 * The live sections degrade instead of breaking: when Dataview is missing the
 * blocks are replaced by a one-line hint (the settings toggle gates on
 * isDataviewEnabled anyway, so this only happens if Dataview is later
 * disabled).
 */
import type { App } from 'obsidian';
import { formatDateTime, yamlString, type OutputPaths } from './markdown';
import type { DashboardSections, PlaylistRecord, SyncState, SyncStatus } from './types';

/** Community plugin id that powers the live sections. */
const DATAVIEW_PLUGIN_ID = 'dataview';

/** Shown instead of the live sections when Dataview is not enabled. */
export const DATAVIEW_REQUIRED_NOTICE =
	'The dashboard needs the community Dataview plugin. Install and enable it (Settings → Community plugins), then try again.';

interface PluginHost {
	enabledPlugins?: ReadonlySet<string> | Record<string, boolean | undefined>;
	plugins?: Record<string, unknown>;
}

/**
 * Whether the community Dataview plugin is enabled. Obsidian has no public
 * API for this, so probe the plugin host with a narrow structural type (no
 * `any`), handling both Set- and record-shaped `enabledPlugins` and falling
 * back to a loaded plugin instance.
 */
export function isDataviewEnabled(app: App): boolean {
	const host = (app as unknown as { plugins?: PluginHost }).plugins;
	const enabled = host?.enabledPlugins;
	if (enabled) {
		const asSet = enabled as ReadonlySet<string>;
		// Set-like shape (`has`), else record-shaped (`[id]`).
		if (typeof asSet.has === 'function') return asSet.has(DATAVIEW_PLUGIN_ID);
		return Boolean((enabled as Record<string, boolean | undefined>)[DATAVIEW_PLUGIN_ID]);
	}
	return Boolean(host?.plugins?.[DATAVIEW_PLUGIN_ID]);
}

export interface DashboardContext {
	paths: OutputPaths;
	sections: DashboardSections;
	dataviewReady: boolean;
	trackedIds: Set<string>;
	watchLaterId: string;
	/** When this note is rendered (frontmatter `last_synced`). */
	syncedAt: Date;
	/** Status of the sync this note reflects; null before the first sync. */
	status: SyncStatus | null;
}

/** Newest `dateAdded` in the playlist (ISO, so lexicographic max works). */
function newestDate(record: PlaylistRecord): string {
	let newest = '';
	for (const video of Object.values(record.videos)) {
		if (video.dateAdded > newest) newest = video.dateAdded;
	}
	return newest || '—';
}

/** Wikilink target without the `.md` suffix. */
function linkTarget(path: string): string {
	return path.replace(/\.md$/, '');
}

/** One fenced dataviewjs block. */
function dataviewBlock(code: string): string {
	return ['```dataviewjs', code.trimEnd(), '```'].join('\n');
}

/**
 * Static header (state-derived): frontmatter, last-sync status line, counts,
 * quick links, and the playlist overview table — then the opt-in live
 * sections, or a hint line when Dataview is unavailable.
 */
export function renderDashboardNote(state: SyncState, ctx: DashboardContext): string {
	const { paths, sections, dataviewReady, trackedIds, watchLaterId, syncedAt, status } = ctx;

	const channels = Object.entries(state.channels).sort(([, a], [, b]) => a.title.localeCompare(b.title));
	const playlists = Object.entries(state.playlists)
		.filter(([id]) => trackedIds.has(id))
		.sort(([, a], [, b]) => a.title.localeCompare(b.title));
	const videoCount = playlists.reduce((sum, [, record]) => sum + Object.keys(record.videos).length, 0);

	const lines: string[] = ['---', 'type: lifeline-dashboard'];
	if (status !== null) lines.push(`last_synced: ${yamlString(formatDateTime(syncedAt))}`);
	lines.push(
		`channel_count: ${channels.length}`,
		`playlist_count: ${playlists.length}`,
		`video_count: ${videoCount}`,
		'---',
		'',
		'# YouTube dashboard',
		'',
	);

	if (status === null) {
		lines.push('**Last sync:** never', '');
	} else {
		const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
		lines.push(`**Last sync:** ${formatDateTime(syncedAt)} · ${icon}`, '');
	}
	lines.push(
		`**Backed up:** ${channels.length} channels · ${playlists.length} playlists · ${videoCount} videos`,
		'',
	);

	// --- quick links (only links whose target exists or will exist) ----------
	if (sections.quickLinks) {
		const links: string[] = [];
		if (channels.length > 0) links.push(`[[${linkTarget(paths.channels)}|Channels]]`);
		if (watchLaterId && state.playlists[watchLaterId]) {
			links.push(`[[${linkTarget(paths.watchLater)}|Watch Later]]`);
		}
		for (const [id, record] of playlists) {
			if (id === watchLaterId) continue;
			links.push(`[[${paths.playlistsFolder}/${record.fileName}|${record.fileName}]]`);
		}
		if (links.length > 0) lines.push(`**Quick links:** ${links.join(' · ')}`, '');
	}

	// --- playlist overview table (always) ------------------------------------
	lines.push('## Playlists', '');
	if (playlists.length === 0) {
		lines.push('_No playlists tracked yet._', '');
	} else {
		lines.push('| Playlist | Videos | Newest |', '| --- | --- | --- |');
		for (const [id, record] of playlists) {
			const watchLater = id === watchLaterId;
			const target = linkTarget(watchLater ? paths.watchLater : `${paths.playlistsFolder}/${record.fileName}`);
			const alias = watchLater ? 'Watch Later' : record.fileName;
			lines.push(
				`| [[${target}|${alias}]] | ${Object.keys(record.videos).length} | ${newestDate(record)} |`,
			);
		}
		lines.push('');
	}

	// --- live sections -------------------------------------------------------
	const liveWanted = sections.recent || sections.topChannels || sections.attention;
	if (!dataviewReady) {
		if (liveWanted) {
			lines.push('*Dataview is disabled — live sections hidden. Enable the community Dataview plugin to restore them.*', '');
		}
	} else {
		const source = JSON.stringify(`"${paths.folder}"`);
		if (sections.recent) {
			lines.push('## Recently added', '', dataviewBlock(recentCode(source)), '');
		}
		if (sections.topChannels) {
			lines.push('## Top channels', '', dataviewBlock(channelsCode(source)), '');
		}
		if (sections.attention) {
			lines.push('## Needs attention', '', dataviewBlock(attentionCode(source)), '');
		}
	}

	lines.push('');
	return lines.join('\n');
}

/** Shared prelude: normalize Dataview list fields (DataArray or array) to an array. */
const TO_ARR = `const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v.array === "function" ? v.array() : []);`;

/** Newest videos across every playlist note (Watch Later included). */
function recentCode(source: string): string {
	return `${TO_ARR}
const SRC = ${source};
const items = [];
for (const page of dv.pages(SRC).array()) {
  if (page.type !== "lifeline-playlist") continue;
  for (const item of toArr(page.file?.lists ?? page.lists)) {
    if (item.date) items.push(item);
  }
}
items.sort((a, b) => String(b.date?.path ?? b.date).localeCompare(String(a.date?.path ?? a.date)));
const top = items.slice(0, 15);
if (top.length === 0) {
  dv.paragraph("No videos synced yet.");
} else {
  dv.table(["Added", "Video", "Channel"], top.map((l) => [l.date, l.title, l.channel]));
}`;
}

/** Biggest channels by subscribers; degrades to a hint when the field is off. */
function channelsCode(source: string): string {
	return `${TO_ARR}
const SRC = ${source};
const rows = [];
for (const page of dv.pages(SRC).array()) {
  if (page.type !== "lifeline-channels") continue;
  for (const item of toArr(page.file?.lists ?? page.lists)) {
    if (typeof item.subscribers === "number") rows.push(item);
  }
}
rows.sort((a, b) => b.subscribers - a.subscribers);
const top = rows.slice(0, 10);
if (top.length === 0) {
  dv.paragraph("No subscriber counts found. Turn on Subscribers in Settings → Lifeline → Channels.md fields.");
} else {
  dv.table(["Channel", "Subscribers", "Videos"], top.map((l) => [l.channel, l.subscribers, l.videos ?? "—"]));
}`;
}

/** Unavailable or removed videos, grouped by playlist. */
function attentionCode(source: string): string {
	return `${TO_ARR}
const SRC = ${source};
const rows = [];
for (const page of dv.pages(SRC).array()) {
  if (page.type !== "lifeline-playlist") continue;
  for (const item of toArr(page.file?.lists ?? page.lists)) {
    if (item.status) rows.push({ playlist: page.title ?? page.file.name, item });
  }
}
rows.sort((a, b) => String(a.playlist).localeCompare(String(b.playlist)));
if (rows.length === 0) {
  dv.paragraph("Nothing needs attention.");
} else {
  dv.table(["Playlist", "Video", "Status"], rows.map((r) => [r.playlist, r.item.title, r.item.status]));
}`;
}
