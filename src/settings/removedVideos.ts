/**
 * Removed videos sub-pages: one navigable entry per playlist, holding that
 * playlist's mode override, the removed videos still in state.json, and the
 * purged entries parked in state_purged.json. The global default lives on the
 * Playlists landing group; a playlist gets its own page so a library with many
 * playlists stays scannable instead of one long scroll of "No removed videos".
 */
import {
	Notice,
	Setting,
	type SettingDefinitionItem,
	type SettingDefinitionPage,
	type SettingGroupItem,
} from 'obsidian';
import type LifelinePlugin from '../main';
import { archivedEntries, type PurgedState } from '../purgedState';
import {
	clearPurgedArchive,
	offlineTrackedIds,
	purgeRemovedVideo,
	restoreRemovedVideo,
	rewritePlaylistNotes,
	waitForSync,
} from '../sync';
import type { PlaylistRecord, SyncState, VideoRecord } from '../types';
import { confirmAction } from '../ui/confirmModal';
import { REMOVED_OVERRIDE_OPTIONS, resolveRemovedMode } from './types';
import { authErrorMessage, group, noteParagraph, pageDefinition, renderRow, type SettingsHost } from './ui';

const NEWEST_FIRST = (a: [string, VideoRecord], b: [string, VideoRecord]): number =>
	(b[1].removedOn ?? '').localeCompare(a[1].removedOn ?? '') || a[1].title.localeCompare(b[1].title);

interface PlaylistView {
	id: string;
	title: string;
	record: PlaylistRecord | undefined;
	/** Removed entries still in state.json. */
	active: Array<[string, VideoRecord]>;
	/** Purged entries in state_purged.json. */
	archived: Array<[string, VideoRecord]>;
	tracked: boolean;
}

/** Rewrite the affected notes and tell the user what happened. */
export async function rewriteRemovedNotes(plugin: LifelinePlugin, playlistIds?: string[]): Promise<void> {
	try {
		await waitForSync();
		const result = await rewritePlaylistNotes(plugin, playlistIds);
		const notes = result.rewritten === 1 ? 'note' : 'notes';
		if (result.errors.length > 0) {
			new Notice(
				`Rewrote ${result.rewritten} playlist ${notes} with ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}. ${result.errors[0]?.message ?? ''}`,
				12000,
			);
			return;
		}
		new Notice(`Rewrote ${result.rewritten} playlist ${notes}.`);
	} catch (err) {
		new Notice(authErrorMessage(err), 15000);
	}
}

/** Removed entries that a note may draw and a purge may move to the archive. */
function removedEntries(record: PlaylistRecord): Array<[string, VideoRecord]> {
	const removed = Object.entries(record.videos).filter(
		([, video]) => video.removed && !video.unavailable,
	);
	removed.sort(NEWEST_FIRST);
	return removed;
}

/** Archived entries that are not somehow active again (a stale duplicate). */
function archivedEntriesFor(
	archive: PurgedState,
	state: SyncState,
	playlistId: string,
): Array<[string, VideoRecord]> {
	const active = state.playlists[playlistId]?.videos ?? {};
	const archived = archivedEntries(archive, playlistId).filter(([videoId]) => !active[videoId]);
	archived.sort(NEWEST_FIRST);
	return archived;
}

/** Every playlist with something to show, tracked or archived. */
function playlistViews(host: SettingsHost): PlaylistView[] {
	const { plugin } = host;
	const { settings, state } = plugin;
	const tracked = offlineTrackedIds(settings, state);
	const ids = new Set<string>(tracked);
	for (const [playlistId, record] of Object.entries(state.playlists)) {
		if (removedEntries(record).length > 0) ids.add(playlistId);
	}
	for (const playlistId of Object.keys(plugin.purgedState.playlists)) ids.add(playlistId);
	return Array.from(ids)
		.map((id) => {
			const record = state.playlists[id];
			const entry = plugin.purgedState.playlists[id];
			return {
				id,
				title: record?.title ?? entry?.title ?? id,
				record,
				active: record ? removedEntries(record) : [],
				archived: archivedEntriesFor(plugin.purgedState, state, id),
				tracked: tracked.has(id),
			} satisfies PlaylistView;
		})
		.filter((view) => view.record !== undefined || plugin.purgedState.playlists[view.id] !== undefined)
		.sort((a, b) => a.title.localeCompare(b.title));
}

/** The summary row on the Removed videos page. */
function playlistSummary(settings: LifelinePlugin['settings'], view: PlaylistView): string {
	const parts: string[] = [];
	if (view.active.length > 0) {
		parts.push(`${view.active.length} removed ${view.active.length === 1 ? 'video' : 'videos'}`);
	}
	if (view.archived.length > 0) {
		parts.push(`${view.archived.length} archived`);
	}
	if (parts.length === 0) parts.push('No removed videos');
	if (!view.record) parts.push('not in the backup');
	else if (!view.tracked) parts.push('not tracked');
	else parts.push(resolveRemovedMode(settings, view.id) === 'keep' ? 'Keep' : 'Count only');
	return parts.join(' · ');
}

/** Total entries across the whole archive. */
function archivedTotalCount(archive: PurgedState): number {
	return Object.values(archive.playlists).reduce((sum, entry) => sum + Object.keys(entry.videos).length, 0);
}

/** The navigable Removed videos page: an archive control plus one sub-page per playlist. */
export function removedVideosPage(host: SettingsHost): SettingDefinitionPage {
	const { plugin } = host;
	const views = playlistViews(host);
	const total = archivedTotalCount(plugin.purgedState);
	const items: SettingGroupItem[] = views.map((view) =>
		pageDefinition(
			host,
			view.title,
			playlistSummary(plugin.settings, view),
			(pageHost, containerEl) => renderRemovedPlaylistPage(pageHost, containerEl, view.id),
		),
	);
	if (items.length === 0) {
		items.push(
			renderRow(
				'No tracked playlists',
				'Run a sync first, then each playlist gets its own page here.',
				() => {
					// Informational row: no control.
				},
			),
		);
	}
	const pageItems: SettingDefinitionItem[] = [];
	if (total > 0) {
		pageItems.push(
			renderRow(
				'Clear archive',
				`${total} purged ${total === 1 ? 'entry' : 'entries'} in state_purged.json. Clearing it forgets them, removes their bullets for good, and drops their contribution from removed_count.`,
				(setting) => {
					setting.addButton((button) =>
						button
							.setButtonText('Clear archive')
							.setDestructive()
							.onClick(async () => {
								const confirmed = await confirmAction(
									plugin.app,
									'Clear the purged-video archive?',
									`${total} archived ${total === 1 ? 'entry' : 'entries'} will be deleted. They can no longer be restored, and removed_count will drop on the next rewrite.`,
									'Clear archive',
								);
								if (!confirmed) return;
								try {
									const cleared = await clearPurgedArchive(plugin);
									new Notice(`Cleared ${cleared} archived ${cleared === 1 ? 'entry' : 'entries'}.`);
									host.refresh();
								} catch (err) {
									new Notice(authErrorMessage(err), 15000);
								}
							}),
					);
				},
			),
		);
	}
	pageItems.push({ type: 'group', heading: 'Playlists', items });
	return {
		type: 'page',
		name: 'Removed videos',
		desc: 'Pick a playlist to see the videos it lost, purge one from the note, restore one from the archive, or set that playlist’s own mode.',
		items: pageItems,
	};
}

/** One playlist's page: its mode override, live removed entries, and archive. */
export function renderRemovedPlaylistPage(
	host: SettingsHost,
	containerEl: HTMLElement,
	playlistId: string,
): void {
	const { plugin } = host;
	const { settings, state } = plugin;
	const record = state.playlists[playlistId];
	const entry = plugin.purgedState.playlists[playlistId];
	if (!record && !entry) {
		noteParagraph(containerEl, 'This playlist is no longer in the backup or the archive. Run a sync to refresh.');
		return;
	}
	const title = record?.title ?? entry?.title ?? playlistId;
	const tracked = offlineTrackedIds(settings, state).has(playlistId);
	const active = record ? removedEntries(record) : [];
	const archived = archivedEntriesFor(plugin.purgedState, state, playlistId);
	const card = group(containerEl, title);

	if (record && tracked) {
		const mode = resolveRemovedMode(settings, playlistId);
		new Setting(card)
			.setName('Mode')
			.setDesc(
				mode === 'keep'
					? 'Removed videos are shown in the note.'
					: 'Removed videos are hidden; only the count is written.',
			)
			.addDropdown((dropdown) => {
				for (const option of REMOVED_OVERRIDE_OPTIONS) dropdown.addOption(option.value, option.label);
				dropdown.setValue(settings.removedVideoOverrides[playlistId] ?? '');
				dropdown.onChange(async (value) => {
					if (value === 'keep' || value === 'count') {
						settings.removedVideoOverrides[playlistId] = value;
					} else {
						delete settings.removedVideoOverrides[playlistId];
					}
					await plugin.saveSettings();
					await rewriteRemovedNotes(plugin, [playlistId]);
					host.refresh();
				});
			});
	} else {
		noteParagraph(
			card,
			'This playlist is not tracked, so Lifeline does not write its note. Its archive is still listed below; restoring an entry rebuilds the backup record.',
		);
	}

	if (active.length === 0 && archived.length === 0) {
		noteParagraph(card, 'No removed videos.');
		return;
	}

	for (const [videoId, video] of active) {
		const channel = video.channelTitle || 'unknown channel';
		const when = video.removedOn ? `removed ${video.removedOn}` : 'removal date unknown';
		new Setting(card)
			.setName(video.title || videoId)
			.setDesc(`${channel} · ${when} · in the note`)
			.addButton((button) =>
				button
					.setButtonText('Purge')
					.setTooltip('Move this entry to the archive. It still counts until the archive is cleared.')
					.setDestructive()
					.onClick(async () => {
						const confirmed = await confirmAction(
							plugin.app,
							'Purge removed video?',
							`The bullet for "${video.title || videoId}" will be removed from "${title}" and the entry moves to state_purged.json. It still counts in removed_count until you clear the archive.`,
							'Purge',
						);
						if (!confirmed) return;
						try {
							const purged = await purgeRemovedVideo(plugin, playlistId, videoId);
							if (purged) {
								new Notice(`Moved "${video.title || videoId}" to the archive.`);
								host.refresh();
							} else {
								new Notice('That video is no longer in the backup. Refresh the page.');
							}
						} catch (err) {
							new Notice(authErrorMessage(err), 15000);
						}
					}),
			);
	}

	for (const [videoId, video] of archived) {
		const channel = video.channelTitle || 'unknown channel';
		const when = video.removedOn ? `removed ${video.removedOn}` : 'removal date unknown';
		new Setting(card)
			.setName(video.title || videoId)
			.setDesc(`${channel} · ${when} · archived`)
			.addButton((button) =>
				button
					.setButtonText('Restore')
					.setCta()
					.setTooltip('Move this entry back into the backup so its bullet returns.')
					.onClick(async () => {
						try {
							const restored = await restoreRemovedVideo(plugin, playlistId, videoId);
							if (restored) {
								new Notice(`Restored "${video.title || videoId}" to the backup.`);
								host.refresh();
							} else {
								new Notice('That entry is no longer in the archive. Refresh the page.');
							}
						} catch (err) {
							new Notice(authErrorMessage(err), 15000);
						}
					}),
			);
	}
}
