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
 * The sync log (sync-log.md) lives in the plugin folder, not here.
 *
 * Every entry uses Dataview inline fields with bracket syntax, which is
 * required for multiple fields on one line and is indexed per list item
 * (query via `file.lists`).
 */
import { normalizePath } from 'obsidian';
import type { ChannelsFieldSettings, PlaylistRecord, SyncRunResult, SyncState } from './types';

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

/**
 * Subscriptions as a Dataview-queryable list, one bullet per channel. Each
 * optional field is included only when its settings toggle is on and the data
 * exists, so the note degrades to just the channel link when everything is off.
 */
export function renderChannelsNote(
	state: SyncState,
	syncedAt: Date,
	fields: ChannelsFieldSettings,
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
 * One note per playlist. Each video is a single list item so Dataview sees
 * one record per video: title and channel as plain Markdown links, the
 * date-added as a `[[YYYY-MM-DD]]` link, and a status field only when the
 * video is unavailable or removed (no marker brackets).
 */
export function renderPlaylistNote(
	playlistId: string,
	title: string,
	record: PlaylistRecord,
	syncedAt: Date,
): string {
	const videos = Object.entries(record.videos).sort(
		([, a], [, b]) => Number(a.removed) - Number(b.removed) || a.position - b.position,
	);
	const lines: string[] = [
		'---',
		'type: lifeline-playlist',
		`playlist_id: ${playlistId}`,
		`title: ${yamlString(record.title)}`,
		`video_count: ${videos.length}`,
		`saved: ${record.saved === true}`,
		`last_synced: ${yamlString(formatDateTime(syncedAt))}`,
		'---',
		'',
		`# ${title}`,
		'',
	];
	for (const [videoId, video] of videos) {
		const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
		const channelValue = video.channelId
			? `[${video.channelTitle || 'unknown channel'}](https://www.youtube.com/channel/${video.channelId})`
			: video.channelTitle || 'unknown channel';
		const parts = [`[title:: [${video.title}](${watchUrl})]`, `[channel:: ${channelValue}]`];
		if (video.dateAdded) parts.push(`[date:: [[${video.dateAdded}]]]`);
		const statuses: string[] = [];
		if (video.unavailable) statuses.push('unavailable');
		if (video.removed) statuses.push('removed from playlist');
		if (statuses.length > 0) parts.push(`[status:: ${statuses.join(', ')}]`);
		lines.push(`- ${parts.join(' ')}`);
	}
	lines.push('');
	return lines.join('\n');
}

/** File header for sync-log.md, written when the log is created. */
export const SYNC_LOG_HEADER =
	'# Lifeline sync log\n\n> Append-only: one line per sync run (newest last).';

/** Single append-only log line, e.g. "2026-10-17 14:03:21 · ✓ · channels 42 · ..." */
export function renderSyncLogLine(result: SyncRunResult, syncedAt: Date): string {
	const icon = result.status === 'ok' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
	let line =
		`- ${formatDateTime(syncedAt)} · ${icon} · channels ${result.channelsSynced}` +
		` · playlists ${result.playlistsSynced} · videos ${result.videosFound}` +
		` · quota ${result.quotaUnits} units`;
	if (result.quotaSoftWarn) line += ' · soft limit reached';
	if (result.errors.length > 0) {
		const kinds = Array.from(new Set(result.errors.map((error) => error.kind))).join(', ');
		const first = result.errors[0];
		const detail = first ? `${first.resource}: ${first.message}` : '';
		line += ` · errors: ${kinds}${detail ? ` · ${detail.slice(0, 200)}` : ''}`;
	}
	return line;
}
