/**
 * Dashboard note (Dashboard.md): an opt-in home note. Pure rendering + one
 * capability check (isDataviewEnabled); no vault I/O here; sync.ts owns the
 * file writes (writeDashboardNote and the writeOutputs path) and also writes
 * the view script itself (dashboardScript.ts).
 *
 * Everything visible is DataviewJS: the note is one header call (hero status
 * badge, KPI tiles, and the "New since last sync" + "Needs attention" cards)
 * plus one call per list section into the generated script, which queries the
 * synced notes live. The note only carries
 * frontmatter (state-derived counts), the H1, the section headings, and the
 * view calls with their baked options (status, section toggles, the sync
 * date for the delta, output folder, watch-later id).
 *
 * When Dataview is missing the note degrades to frontmatter + H1 + a warning
 * callout (the settings toggle gates on isDataviewEnabled anyway, so this
 * only happens if Dataview is later disabled).
 */
import type { App } from 'obsidian';
import { dashboardViewName } from './dashboardScript';
import { dataviewBlock, formatDateTime, viewCall, yamlString, type OutputPaths } from './markdown';
import type { DashboardSections, SyncState, SyncStatus } from './types';

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
	/** User-configured folder holding lifeline-dashboard.js (settings value). */
	scriptsFolder: string;
}

/**
 * The note itself: frontmatter (state-derived counts), the H1, and one
 * dv.view() call per section under a real heading. The header call is always
 * present (hero status badge, stat tiles, and the new-since-sync/attention
 * cards when their toggles are on); the list
 * sections follow the section checklist, with the playlist table always on
 * (it has no toggle).
 *
 * When Dataview is unavailable, only frontmatter, the H1, and a warning
 * callout remain: there is no static fallback table by design.
 */
export function renderDashboardNote(state: SyncState, ctx: DashboardContext): string {
	const { paths, sections, dataviewReady, trackedIds, watchLaterId, syncedAt, status, scriptsFolder } = ctx;

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

	if (!dataviewReady) {
		lines.push(
			'> [!warning] Dataview is required',
			'> The dashboard needs the community Dataview plugin. Enable it in **Settings → Community plugins**, then refresh this note.',
			'',
			'',
		);
		return lines.join('\n');
	}

	// Common options every call needs: the output folder to query (the script
	// quotes it for dv.pages) and the watch-later identity used to pin and
	// deduplicate Watch Later copies.
	const base = { src: paths.folder, wlPath: paths.watchLater, wlId: watchLaterId };
	const viewName = dashboardViewName(scriptsFolder);

	// Day-granular last-sync date for the delta card; null before the first
	// sync so the header never reports a bogus "everything is new".
	const pad2 = (n: number): string => String(n).padStart(2, '0');
	const since =
		status === null ? null : `${syncedAt.getFullYear()}-${pad2(syncedAt.getMonth() + 1)}-${pad2(syncedAt.getDate())}`;

	lines.push(
		dataviewBlock(
			viewCall(viewName, {
				section: 'header',
				status,
				recent: sections.recent,
				attention: sections.attention,
				since,
				...base,
			}),
		),
		'',
		'## Playlists',
		'',
		dataviewBlock(viewCall(viewName, { section: 'playlists', ...base })),
		'',
	);
	if (sections.topChannels) {
		lines.push('## Top channels', '', dataviewBlock(viewCall(viewName, { section: 'channels', src: paths.folder })), '');
	}

	lines.push('');
	return lines.join('\n');
}
