/**
 * Images: how the two opt-in image sets are attached to bullets, and where a
 * downloaded copy is kept.
 *
 * The mode rows are deliberately NOT gated on the views toggle: the image is
 * an inline field in the bullet, written for any vault, Dataview or not. The
 * views are what draw the picture. Default off, which is also the
 * byte-identical path. The folder row only exists while something is actually
 * set to Download, since it has nothing to say otherwise.
 */
import { Setting } from 'obsidian';
import { imagesParentFolder, normalizeFolder } from '../markdown';
import type { ImageMode } from '../types';
import { folderSetting } from './folderPicker';
import { group, type SettingsHost } from './ui';

const IMAGE_MODES: Array<[ImageMode, string]> = [
	['off', 'Off'],
	['link', 'Link'],
	['download', 'Download'],
];

/** True when at least one image setting wants files on disk. */
function downloadsOn(settings: { channelAvatars: ImageMode; videoThumbnails: ImageMode }): boolean {
	return settings.channelAvatars === 'download' || settings.videoThumbnails === 'download';
}

/** Landing group: the two image modes plus the folder they download into. */
export function renderImagesGroup(host: SettingsHost, containerEl: HTMLElement): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Images');

	imageModeRow(
		host,
		card,
		'Channel avatars and banners',
		'Adds avatar_url/banner_url to each channel bullet (avatar/banner too once Download has fetched them). Link loads them from Google when a view renders; Download fetches them once during sync, so views work offline.',
		'channelAvatars',
	);

	imageModeRow(
		host,
		card,
		'Video thumbnails',
		'Adds thumbnail_url to every playlist and Watch Later bullet (thumbnail too once Download has fetched it). Link loads it from Google when a view renders; Download fetches it once during sync.',
		'videoThumbnails',
	);

	if (!downloadsOn(settings)) return;

	folderSetting(card, {
		app: plugin.app,
		name: 'Images folder',
		desc: 'Parent folder for downloaded images. Files always land in its thumbnails/ sub-folder, and the next sync fills it.',
		value: settings.imagesFolder,
		placeholder: imagesParentFolder(settings.outputFolder, settings.imagesFolder),
		normalize: normalizeFolder,
		commit: async (path) => {
			settings.imagesFolder = path;
			await plugin.saveSettings();
		},
	});
}

/**
 * One three-mode picker. Redraws the tab only when the choice makes the folder
 * row appear or disappear, so the surrounding rows do not jump on every select.
 */
function imageModeRow(
	host: SettingsHost,
	card: HTMLElement,
	name: string,
	desc: string,
	key: 'channelAvatars' | 'videoThumbnails',
): void {
	const { plugin } = host;
	const { settings } = plugin;
	new Setting(card)
		.setName(name)
		.setDesc(desc)
		.addDropdown((dropdown) => {
			for (const [value, label] of IMAGE_MODES) dropdown.addOption(value, label);
			dropdown.setValue(settings[key]).onChange(async (value) => {
				const next = (IMAGE_MODES.some(([mode]) => mode === value) ? value : 'off') as ImageMode;
				if (next === settings[key]) return;
				const wasVisible = downloadsOn(settings);
				settings[key] = next;
				await plugin.saveSettings();
				if (wasVisible !== downloadsOn(settings)) host.display();
			});
		});
}
