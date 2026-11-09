/**
 * Playlist backup page: the one place that answers "which playlists get
 * backed up". Playlists are grouped by origin so created and saved lists are
 * easy to scan, and the saved-playlist collector is a collapsed section at
 * the bottom instead of a second page editing the same setting.
 */
import { Notice, Setting } from 'obsidian';
import { removeImportedPlaylistId } from '../playlistIds';
import { isSystemPlaylistId, SYSTEM_PLAYLISTS, systemPlaylistTitle } from '../systemPlaylists';
import { renderCollectSection } from './collectPage';
import { authErrorMessage, group, noteParagraph, type SettingsHost } from './ui';

interface PlaylistRow {
	id: string;
	title: string;
}

export function renderPlaylistBackupPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { settings } = host.plugin;
	const catalog = settings.playlistCatalog;
	const tracked = new Set(settings.trackedPlaylists ?? []);
	const imported = new Set(settings.importedPlaylistIds ?? []);
	const catalogIds = new Set(catalog.map((playlist) => playlist.id));
	const created = catalog.filter((playlist) => !playlist.saved);
	const saved = catalog.filter((playlist) => playlist.saved);

	/** Add one toggle row; the ID doubles as the description when it adds information. */
	const addRow = (card: HTMLElement, entry: PlaylistRow, note?: string): void => {
		const isWatchLater = entry.id === host.plugin.settings.watchLaterPlaylistId;
		const setting = new Setting(card).setName(entry.title);
		const parts = [entry.id === entry.title ? '' : entry.id, note];
		if (isWatchLater) parts.push('Always backed up as Watch later.');
		const desc = parts.filter(Boolean).join(' · ');
		if (desc) setting.setDesc(desc);

		setting.addToggle((toggle) => {
			toggle.setValue(isWatchLater || tracked.has(entry.id)).setDisabled(isWatchLater);
			toggle.onChange(async (on) => {
				if (on) tracked.add(entry.id);
				else tracked.delete(entry.id);
				host.plugin.settings.trackedPlaylists = Array.from(tracked);
				await host.plugin.saveSettings();
			});
		});

		if (imported.has(entry.id) && !isWatchLater) {
			setting.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('Forget this imported ID and stop backing it up')
					.onClick(async () => {
						removeImportedPlaylistId(host.plugin.settings, entry.id);
						await host.plugin.saveSettings();
						host.refresh();
					}),
			);
		}
	};

	const createdCard = group(containerEl, 'Created by me', (heading) =>
		addRefreshButton(host, heading),
	);
	if (created.length === 0) {
		noteParagraph(
			createdCard,
			catalog.length === 0
				? 'No playlists loaded yet. Authenticate, then refresh the list.'
				: 'No playlists created by you were found.',
		);
	} else {
		for (const playlist of created) addRow(createdCard, playlist);
	}

	const savedCard = group(containerEl, 'Saved from other channels');
	if (saved.length === 0) {
		noteParagraph(
			savedCard,
			'No saved playlists found. Use Add missing saved playlists below if the API missed any.',
		);
	} else {
		for (const playlist of saved) addRow(savedCard, playlist);
	}

	// The two system lists never enter the catalog or the tracked arrays: their
	// own booleans are the opt-in, and sync adds the enabled ids to a run's
	// working sets. They still produce notes, so they belong on this page.
	const systemCard = group(containerEl, 'System lists');
	noteParagraph(systemCard, 'These lists never appear in your playlist catalog. Turning one on writes its own note.');
	for (const entry of SYSTEM_PLAYLISTS) {
		const noteName = entry.notePath === 'likedVideos' ? 'Liked Videos.md' : 'Liked Music.md';
		// A legacy hand-tracked id still backs the list up even with its boolean
		// off, so the row mirrors that state and a toggle cleans the old entry
		// out, leaving this row as the one control.
		const legacy = tracked.has(entry.id) || imported.has(entry.id);
		const setting = new Setting(systemCard)
			.setName(systemPlaylistTitle(entry, host.plugin.state.playlists[entry.id]?.title))
			.setDesc(`${entry.id} · Writes ${noteName}. YouTube does not document this list id.`);
		setting.addToggle((toggle) =>
			toggle.setValue(settings[entry.settingKey] || legacy).onChange(async (on) => {
				settings[entry.settingKey] = on;
				if (tracked.has(entry.id) || imported.has(entry.id)) {
					removeImportedPlaylistId(settings, entry.id);
					tracked.delete(entry.id);
					imported.delete(entry.id);
				}
				await host.plugin.saveSettings();
			}),
		);
	}

	// Tracked or imported ids the latest catalog did not resolve. Kept visible
	// so a stale entry can be unchecked, and so an import that failed its title
	// lookup is not silently invisible until the next sync. The two system
	// lists are excluded here: the System lists card above owns them, and the
	// catalog never carries their ids.
	const unresolved: string[] = [];
	const seen = new Set<string>();
	for (const id of [...(settings.trackedPlaylists ?? []), ...(settings.importedPlaylistIds ?? [])]) {
		if (catalogIds.has(id) || seen.has(id) || isSystemPlaylistId(id)) continue;
		seen.add(id);
		unresolved.push(id);
	}
	if (unresolved.length > 0) {
		const unresolvedCard = group(containerEl, 'Not resolved yet');
		noteParagraph(
			unresolvedCard,
			'These IDs are backed up but are not in the latest playlist list. The next sync retries their titles.',
		);
		for (const id of unresolved) {
			addRow(unresolvedCard, { id, title: host.plugin.state.playlists[id]?.title ?? id });
		}
	}

	renderCollectSection(host, containerEl);
}

function addRefreshButton(host: SettingsHost, heading: Setting): void {
	heading.addExtraButton((button) =>
		button
			.setIcon('refresh-cw')
			.setTooltip('Refresh playlist list')
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
}
