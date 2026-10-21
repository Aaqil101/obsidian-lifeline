/**
 * Pure note-rendering helpers: everything returns Markdown strings and takes
 * data as input. No vault access here, so sync.ts owns all file I/O.
 *
 * Output layout (vault-relative, under the configured output folder):
 *   Channels.md          - one field-list entry per subscribed channel
 *   Playlists/<name>.md  - one field-list entry per video, per tracked playlist
 *   Watch Later.md       - the designated watch-later substitute playlist
 *   Dashboard.md         - opt-in home note (static summary + DataviewJS sections)
 *
 * The sync log (sync-log.json) lives in the plugin folder, not here.
 *
 * Every entry uses Dataview inline fields with bracket syntax, which is
 * required for multiple fields on one line and is indexed per list item
 * (query via `file.lists`).
 */
import { normalizePath } from 'obsidian';
import type { ChannelsFieldSettings, PlaylistRecord, SyncState } from './types';

export interface OutputPaths {
	folder: string;
	channels: string;
	playlistsFolder: string;
	watchLater: string;
	dashboard: string;
}

export const DEFAULT_OUTPUT_FOLDER = '95 - Notes/YouTube';

export function outputPaths(outputFolder: string): OutputPaths {
	const folder = normalizePath(outputFolder.trim() || DEFAULT_OUTPUT_FOLDER);
	return {
		folder,
		channels: `${folder}/Channels.md`,
		playlistsFolder: `${folder}/Playlists`,
		watchLater: `${folder}/Watch Later.md`,
		dashboard: `${folder}/Dashboard.md`,
	};
}

/** Filesystem-safe note name (kept to 120 characters). */
export function sanitizeFileName(title: string, fallback: string): string {
	const cleaned = title
		.replace(/[\\/:*?"<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/g, '')
		.slice(0, 120);
	return cleaned || fallback;
}

export function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

export function formatDate(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatTime(date: Date): string {
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDateTime(date: Date): string {
	return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** One fenced dataviewjs block. */
export function dataviewBlock(code: string): string {
	return ['```dataviewjs', code.trimEnd(), '```'].join('\n');
}

/** One `dv.view()` call into a generated script, with baked options. */
export function viewCall(viewName: string, options: Record<string, string | boolean | null | object>): string {
	return `dv.view(${JSON.stringify(viewName)}, ${JSON.stringify(options)});`;
}

/**
 * Subscriptions as a Dataview-queryable list, one bullet per channel. Each
 * optional field is included only when its settings toggle is on and the data
 * exists, so the note degrades to just the channel link when everything is off.
 *
 * When `tableBlock` is provided (opt-in DataviewJS tables), it renders
 * directly under the H1, above the bullets. The bullets always stay: the
 * table is additive so `file.lists` queries are unaffected.
 */
export function renderChannelsNote(
	state: SyncState,
	syncedAt: Date,
	fields: ChannelsFieldSettings,
	tableBlock?: string,
): string {
	const entries = Object.entries(state.channels).sort(([, a], [, b]) => a.title.localeCompare(b.title));
	const lines: string[] = [
		'---',
		'type: lifeline-channels',
		`channel_count: ${entries.length}`,
		`last_synced: ${yamlString(formatDateTime(syncedAt))}`,
		'---',
		'',
		'# YouTube subscriptions',
		'',
	];
	if (tableBlock) lines.push(tableBlock, '');
	for (const [id, channel] of entries) {
		const parts = [`[channel:: [${channel.title}](${channel.url})]`];
		if (fields.channelId) parts.push(`[id:: ${id}]`);
		if (fields.subscribedOn && channel.subscribedOn) {
			parts.push(`[subscribed_on:: ${channel.subscribedOn}]`);
		}
		if (fields.syncDates) {
			parts.push(`[first_seen:: ${channel.firstSeen}]`, `[last_seen:: ${channel.lastSeen}]`);
		}
		if (fields.status) {
			parts.push(`[status:: ${channel.subscribed ? 'subscribed' : 'no longer subscribed'}]`);
		}
		if (fields.handle && channel.handle) parts.push(`[handle:: ${channel.handle}]`);
		if (fields.subscribers && typeof channel.subscribers === 'number') {
			parts.push(`[subscribers:: ${channel.subscribers}]`);
		}
		if (fields.videos && typeof channel.videoCount === 'number') parts.push(`[videos:: ${channel.videoCount}]`);
		if (fields.views && typeof channel.viewCount === 'number') parts.push(`[views:: ${channel.viewCount}]`);
		if (fields.country && channel.country) parts.push(`[country:: ${channel.country}]`);
		lines.push(`- ${parts.join(' ')}`);
	}
	lines.push('');
	return lines.join('\n');
}

/**
 * One note per playlist. The frontmatter carries a `url` that opens the
 * playlist on YouTube (Watch Later included). Each video is a single list
 * item so Dataview sees one record per video: title and channel as plain
 * Markdown links, and the date-added as a `[[YYYY-MM-DD]]` link.
 *
 * Only watchable videos get a bullet: entries flagged unavailable (private
 * or deleted) or removed from the playlist upstream are skipped. They stay
 * in state as part of the backup, and the frontmatter reports them as
 * `unavailable_count` and `removed_count` (always present, never null), so
 * `video_count - unavailable_count - removed_count` is the bullet count and
 * Dataview can still find the playlists that lost entries.
 *
 * The two counts are disjoint: a video that is both removed and unavailable
 * counts once, under `removed`, so they always add up to the hidden total.
 *
 * When `tableBlock` is provided (opt-in DataviewJS tables), it renders
 * directly under the H1, above the bullets. The bullets always stay: the
 * table is additive so `file.lists` queries are unaffected.
 */
export function renderPlaylistNote(
	playlistId: string,
	title: string,
	record: PlaylistRecord,
	syncedAt: Date,
	tableBlock?: string,
): string {
	const entries = Object.entries(record.videos);
	let unavailableCount = 0;
	let removedCount = 0;
	for (const [, video] of entries) {
		if (video.removed) removedCount++;
		else if (video.unavailable) unavailableCount++;
	}
	const videos = entries
		.filter(([, video]) => !video.removed && !video.unavailable)
		.sort(([, a], [, b]) => a.position - b.position);

	const lines: string[] = [
		'---',
		'type: lifeline-playlist',
		`playlist_id: ${playlistId}`,
		`url: ${yamlString(`https://www.youtube.com/playlist?list=${playlistId}`)}`,
		`title: ${yamlString(record.title)}`,
		`video_count: ${entries.length}`,
		`unavailable_count: ${unavailableCount}`,
		`removed_count: ${removedCount}`,
		`saved: ${record.saved === true}`,
		`last_synced: ${yamlString(formatDateTime(syncedAt))}`,
		'---',
		'',
		`# ${title}`,
		'',
	];
	if (tableBlock) lines.push(tableBlock, '');
	for (const [videoId, video] of videos) {
		const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
		const channelValue = video.channelId
			? `[${video.channelTitle || 'unknown channel'}](https://www.youtube.com/channel/${video.channelId})`
			: video.channelTitle || 'unknown channel';
		const parts = [`[title:: [${video.title}](${watchUrl})]`, `[channel:: ${channelValue}]`];
		if (video.dateAdded) parts.push(`[date:: [[${video.dateAdded}]]]`);
		lines.push(`- ${parts.join(' ')}`);
	}
	lines.push('');
	return lines.join('\n');
}
