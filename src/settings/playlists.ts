/**
 * Playlists: which playlists get backed up, and the door to the collector.
 * The saved-playlist collector lives in its own file (collectPage.ts) because
 * it is a self-contained walkthrough with two modes.
 */
import { Notice, Setting, type SettingDefinitionGroup } from 'obsidian';
import { renderCollectIdsPage } from './collectPage';
import { authErrorMessage, group, noteParagraph, pageDefinition, renderRow, type SettingsHost } from './ui';

/** Landing group: the two sub-page doors and the watch-later substitute. */
export function playlistsGroup(host: SettingsHost): SettingDefinitionGroup {
	const { settings } = host.plugin;

	const catalog = settings.playlistCatalog;
	const tracked = new Set(settings.trackedPlaylists ?? []);
	const trackedCount = catalog.filter((playlist) => tracked.has(playlist.id)).length;
	const desc =
		catalog.length === 0
			? 'Every playlist is tracked by default. Open this page after authenticating to choose which ones are backed up.'
			: `${trackedCount} of ${catalog.length} tracked. Uncheck the ones you don’t want backed up.`;

	const toTrack = pageDefinition(host, 'Playlists to track', desc, renderPlaylistsPage);

	const collect = pageDefinition(
		host,
		'Get saved playlist IDs',
		'Import IDs collected from youtube.com/feed/playlists, a list the API never returns.',
		renderCollectIdsPage,
	);

	const watchLater = renderRow(
		'Watch later playlist',
		'YouTube’s system Watch Later list isn’t readable through the API. Pick the playlist you use instead and Lifeline writes it to Watch Later.md.',
		(setting) => {
			setting.addDropdown((dropdown) => {
				dropdown.addOption('', 'Not set');
				for (const playlist of catalog)
					dropdown.addOption(playlist.id, playlist.saved ? `${playlist.title} (saved)` : playlist.title);
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

	return {
		type: 'group',
		heading: 'Playlists',
		items: [toTrack, collect, watchLater],
	};
}

/** Playlists to track sub-page: one checkbox per playlist, with a refresh. */
export function renderPlaylistsPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { settings } = host.plugin;

	const card = group(containerEl, 'Playlists to track', (heading) => {
		heading.addExtraButton((button) =>
			button
				.setIcon('refresh-cw')
				.setTooltip('Refresh list')
				.onClick(async () => {
					button.setDisabled(true);
					try {
						await host.plugin.fetchPlaylistCatalog();
						new Notice('Playlist list refreshed.');
					} catch (err) {
						new Notice(authErrorMessage(err), 15000);
					} finally {
						button.setDisabled(false);
						host.refresh();
					}
				}),
		);
	});

	if (settings.playlistCatalog.length === 0) {
		noteParagraph(card, 'No playlists loaded yet. Authenticate, then refresh the list.');
	}

	const tracked = new Set(settings.trackedPlaylists ?? []);
	for (const playlist of settings.playlistCatalog) {
		const label = playlist.saved ? `${playlist.title} (saved)` : playlist.title;
		new Setting(card).setName(label).addToggle((toggle) =>
			toggle.setValue(tracked.has(playlist.id)).onChange(async (on) => {
				const set = new Set(host.plugin.settings.trackedPlaylists ?? []);
				if (on) set.add(playlist.id);
				else set.delete(playlist.id);
				host.plugin.settings.trackedPlaylists = Array.from(set);
				await host.plugin.saveSettings();
			}),
		);
	}
}
