/**
 * Playlists: the door to the playlist backup page, plus the watch-later
 * substitute, the opt-in system lists, and the removed-video settings.
 * The catalog itself and the saved-playlist collector live in
 * playlistBackup.ts and collectPage.ts.
 */
import type { SettingDefinitionGroup } from 'obsidian';
import { isSystemPlaylistId } from '../systemPlaylists';
import { renderPlaylistBackupPage } from './playlistBackup';
import { removedVideosPage, rewriteRemovedNotes } from './removedVideos';
import { normalizeRemovedMode, REMOVED_MODE_OPTIONS } from './types';
import { pageDefinition, renderRow, type SettingsHost } from './ui';

/** Landing group: the backup page door, watch-later, system lists, removed videos. */
export function playlistsGroup(host: SettingsHost): SettingDefinitionGroup {
	const { settings } = host.plugin;

	const catalog = settings.playlistCatalog;
	const catalogIds = new Set(catalog.map((playlist) => playlist.id));
	const tracked = new Set(settings.trackedPlaylists ?? []);
	const trackedCount = catalog.filter((playlist) => tracked.has(playlist.id)).length;
	const unresolvedCount = [...tracked].filter(
		(id) => !catalogIds.has(id) && !isSystemPlaylistId(id),
	).length;
	const countLine =
		unresolvedCount > 0
			? `${trackedCount} of ${catalog.length} found playlists backed up, plus ${unresolvedCount} not in the list. `
			: `${trackedCount} of ${catalog.length} backed up. `;
	const desc =
		catalog.length === 0
			? 'Everything is backed up by default on the first sync. Open this page after authenticating to see the grouped list.'
			: `${countLine}Created, saved, and system playlists (Liked Videos, Liked Music), with import for IDs the API misses.`;

	const backupPage = pageDefinition(host, 'Backed-up playlists', desc, renderPlaylistBackupPage);

	const watchLater = renderRow(
		'Watch later playlist',
		'YouTube’s system Watch Later list isn’t readable through the API. Pick the playlist you use instead and Lifeline writes it to Watch Later.md.',
		(setting) => {
			setting.addDropdown((dropdown) => {
				dropdown.addOption('', 'Not set');
				for (const playlist of catalog) {
					if (!playlist.saved) dropdown.addOption(playlist.id, playlist.title);
				}
				dropdown.setValue(settings.watchLaterPlaylistId);
				dropdown.onChange(async (value) => {
					settings.watchLaterPlaylistId = value;
					if (value) {
						// The watch-later substitute is always backed up when set.
						settings.trackedPlaylists = Array.from(new Set([...(settings.trackedPlaylists ?? []), value]));
					}
					await host.plugin.saveSettings();
				});
			});
		},
	);

	const removedVideos = renderRow(
		'Removed videos in notes',
		'What a playlist note does when a video leaves the playlist upstream. Keep writes it as a bullet after the live videos; Count only hides it and reports removed_count in the frontmatter. Override one playlist under Removed videos.',
		(setting) => {
			setting.addDropdown((dropdown) => {
				for (const option of REMOVED_MODE_OPTIONS) dropdown.addOption(option.value, option.label);
				dropdown.setValue(normalizeRemovedMode(settings.removedVideosMode));
				dropdown.onChange(async (value) => {
					settings.removedVideosMode = normalizeRemovedMode(value);
					await host.plugin.saveSettings();
					await rewriteRemovedNotes(host.plugin);
				});
			});
		},
	);

	const removedPage = removedVideosPage(host);

	return {
		type: 'group',
		heading: 'Playlists',
		items: [backupPage, watchLater, removedVideos, removedPage],
	};
}
