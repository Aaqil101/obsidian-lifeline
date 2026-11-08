/**
 * The purged-video archive: videos the user removed from a playlist note with
 * Purge. They stay here so the Removed videos page can still show what was
 * deleted and put a bullet back, but they are no longer part of state/playlists.json.
 * The archive is disposable: clearing it forgets those entries, so their
 * removed_count contribution disappears on the next note rewrite.
 */
import type { PlaylistRecord, SyncState, VideoRecord } from './types';

export interface PurgedPlaylist {
	/** Playlist title at purge time, for archive-only pages. */
	title: string;
	/** Note file base name at purge time. */
	fileName: string;
	videos: Record<string, VideoRecord>;
}

export interface PurgedState {
	version: number;
	playlists: Record<string, PurgedPlaylist>;
}

export function createDefaultPurgedState(): PurgedState {
	return { version: 1, playlists: {} };
}

/** Copy one video into the archive, creating its playlist entry when needed. */
function archiveVideo(
	archive: PurgedState,
	playlistId: string,
	record: PlaylistRecord,
	videoId: string,
	video: VideoRecord,
): void {
	const entry =
		archive.playlists[playlistId] ?? { title: record.title, fileName: record.fileName, videos: {} };
	entry.title = record.title || entry.title;
	entry.fileName = record.fileName || entry.fileName;
	entry.videos[videoId] = video;
	archive.playlists[playlistId] = entry;
}

/** Move one removed video from state into the archive. */
export function purgeVideoToArchive(
	archive: PurgedState,
	state: SyncState,
	playlistId: string,
	videoId: string,
): boolean {
	const record = state.playlists[playlistId];
	const video = record?.videos[videoId];
	if (!record || !video || !video.removed) return false;
	archiveVideo(archive, playlistId, record, videoId, video);
	delete record.videos[videoId];
	return true;
}

/** Move one archived video back into state as a removed entry. */
export function restoreVideoFromArchive(
	archive: PurgedState,
	state: SyncState,
	playlistId: string,
	videoId: string,
): boolean {
	const entry = archive.playlists[playlistId];
	const video = entry?.videos[videoId];
	if (!entry || !video) return false;
	let record = state.playlists[playlistId];
	if (!record) {
		record = { title: entry.title, fileName: entry.fileName, videos: {} };
		state.playlists[playlistId] = record;
	}
	if (!record.videos[videoId]) record.videos[videoId] = video;
	delete entry.videos[videoId];
	if (Object.keys(entry.videos).length === 0) delete archive.playlists[playlistId];
	return true;
}

/** Remove archive copies of videos that are active again in state/playlists.json. */
export function pruneReturnedVideos(archive: PurgedState, state: SyncState): boolean {
	let changed = false;
	for (const [playlistId, entry] of Object.entries(archive.playlists)) {
		const record = state.playlists[playlistId];
		if (!record) continue;
		for (const videoId of Object.keys(entry.videos)) {
			if (!record.videos[videoId]) continue;
			delete entry.videos[videoId];
			changed = true;
		}
		if (Object.keys(entry.videos).length === 0) {
			delete archive.playlists[playlistId];
			changed = true;
		}
	}
	return changed;
}

/**
 * One-time move of the old `purged` flag records out of the live state. Earlier
 * builds kept them in place with `purged: true`; the archive is now the only
 * home for them, so leaving them would draw their bullets again.
 */
export function migratePurgedFlags(archive: PurgedState, state: SyncState): boolean {
	let changed = false;
	for (const [playlistId, record] of Object.entries(state.playlists)) {
		for (const [videoId, video] of Object.entries(record.videos)) {
			const legacy = video as VideoRecord & { purged?: boolean };
			if (!legacy.purged) continue;
			delete legacy.purged;
			archiveVideo(archive, playlistId, record, videoId, video);
			delete record.videos[videoId];
			changed = true;
		}
	}
	return changed;
}

/** Archived entries for one playlist, in insertion order. */
export function archivedEntries(archive: PurgedState, playlistId: string): Array<[string, VideoRecord]> {
	return Object.entries(archive.playlists[playlistId]?.videos ?? {});
}

/**
 * How many archive entries a playlist note still counts: an archived copy that
 * is also active (a stale duplicate) does not count twice.
 */
export function archivedCount(archive: PurgedState, state: SyncState, playlistId: string): number {
	const entry = archive.playlists[playlistId];
	if (!entry) return 0;
	const active = state.playlists[playlistId]?.videos ?? {};
	return Object.keys(entry.videos).filter((videoId) => !active[videoId]).length;
}

/** Archived entries counted across the tracked playlists. */
export function archivedTotal(
	archive: PurgedState,
	state: SyncState,
	playlistIds: Iterable<string>,
): number {
	let total = 0;
	for (const playlistId of playlistIds) total += archivedCount(archive, state, playlistId);
	return total;
}

/** Wipe every archived entry. */
export function clearArchive(archive: PurgedState): void {
	archive.playlists = {};
}
