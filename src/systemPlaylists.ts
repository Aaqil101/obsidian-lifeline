/**
 * The two YouTube system playlists Lifeline can back up beside Watch Later.
 *
 * They behave like any other playlist once fetched, but they never appear in
 * playlists.list?mine=true, so they have to travel through both the tracked set
 * and the by-id metadata lookup. Keeping their ids, note paths, view kinds,
 * settings keys, and fallback titles in one table means routing, fetching, the
 * settings rows, and the view wiring cannot drift apart.
 *
 * Nothing here writes to trackedPlaylists or importedPlaylistIds: the enabled
 * ids are added to a run's working sets only, so turning a toggle off leaves
 * the user's data.json exactly as it was.
 */
import type { OutputPaths } from './markdown';
import type { NoteViewKind } from './noteViewsScript';
import type { LifelineSettings } from './settings/types';

export type SystemPlaylistSettingKey = 'likedVideosEnabled' | 'likedMusicEnabled';
export type SystemPlaylistNoteKey = 'likedVideos' | 'likedMusic';

export interface SystemPlaylist {
	/** The undocumented playlist id YouTube's own UI uses. */
	id: string;
	/** The boolean setting that opts this list in. */
	settingKey: SystemPlaylistSettingKey;
	/** The OutputPaths key for the note this list writes. */
	notePath: SystemPlaylistNoteKey;
	/** The generated note-view kind that reads that note. */
	viewKind: NoteViewKind;
	/** Shown when the API cannot resolve a real title, never the raw id. */
	fallbackTitle: string;
}

/** Both lists, in settings and write order. */
export const SYSTEM_PLAYLISTS: readonly SystemPlaylist[] = [
	{
		id: 'LL',
		settingKey: 'likedVideosEnabled',
		notePath: 'likedVideos',
		viewKind: 'liked',
		fallbackTitle: 'Liked Videos',
	},
	{
		id: 'LM',
		settingKey: 'likedMusicEnabled',
		notePath: 'likedMusic',
		viewKind: 'likedmusic',
		fallbackTitle: 'Liked Music',
	},
];

/** The row for a playlist id, or undefined for an ordinary playlist. */
export function systemPlaylistForId(id: string): SystemPlaylist | undefined {
	return SYSTEM_PLAYLISTS.find((entry) => entry.id === id);
}

/** True when the id belongs to one of the system lists. */
export function isSystemPlaylistId(id: string): boolean {
	return SYSTEM_PLAYLISTS.some((entry) => entry.id === id);
}

/** The system lists the settings currently opt into, in table order. */
export function enabledSystemPlaylists(settings: LifelineSettings): SystemPlaylist[] {
	return SYSTEM_PLAYLISTS.filter((entry) => settings[entry.settingKey]);
}

/** The enabled ids, for adding to a run's tracked and imported working sets. */
export function enabledSystemPlaylistIds(settings: LifelineSettings): string[] {
	return enabledSystemPlaylists(settings).map((entry) => entry.id);
}

/**
 * The note a system playlist writes, or undefined when the id is ordinary.
 * Routing keys on the id, not the setting: an install that already tracks LL
 * by hand keeps working and gets the dedicated note instead of Playlists/LL.md.
 */
export function systemPlaylistPath(paths: OutputPaths, id: string): string | undefined {
	const entry = systemPlaylistForId(id);
	return entry ? paths[entry.notePath] : undefined;
}

/** The view kind a system playlist's note calls, or undefined. */
export function systemPlaylistViewKind(id: string): NoteViewKind | undefined {
	return systemPlaylistForId(id)?.viewKind;
}

/**
 * A resolved title, unless it is empty or just echoes the id. A failed lookup
 * then produces "Liked Videos" rather than a note headed "# LL".
 */
export function systemPlaylistTitle(entry: SystemPlaylist, resolved?: string): string {
	const title = (resolved ?? '').trim();
	if (!title || title === entry.id) return entry.fallbackTitle;
	return title;
}
