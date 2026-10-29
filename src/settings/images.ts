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
import { type SettingDefinitionGroup } from 'obsidian';
import { parseBlurredVideoIds } from '../blurredThumbnails';
import { imagesParentFolder, normalizeFolder } from '../markdown';
import type { ImageMode } from '../types';
import { folderSetting } from './folderPicker';
import { renderRow, type SettingsHost } from './ui';

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
export function imagesGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;
	const { settings } = plugin;

	const avatars = imageModeRow(
		host,
		'Channel avatars and banners',
		'Adds avatar_url/banner_url to each channel bullet (avatar/banner too once Download has fetched them). Link loads them from Google when a view renders; Download fetches them once during sync, so views work offline.',
		'channelAvatars',
	);

	const thumbnails = imageModeRow(
		host,
		'Video thumbnails',
		'Adds thumbnail_url to every playlist and Watch Later bullet (thumbnail too once Download has fetched it). Link loads it from Google when a view renders; Download fetches it once during sync.',
		'videoThumbnails',
	);

	const blurred = renderRow(
		'Blurred thumbnails',
		'Videos whose thumbnail is shown blurred until you click it. Paste video links or IDs, separated by spaces, commas, or new lines. Age-restricted videos are blurred automatically.',
		(setting) => {
			setting.addTextArea((text) => {
				text.setValue(settings.blurredThumbnailVideos.join('\n'));
				text.inputEl.addEventListener('blur', () => {
					const next = parseBlurredVideoIds(text.getValue());
					text.setValue(next.join('\n'));
					if (next.join(' ') === settings.blurredThumbnailVideos.join(' ')) return;
					settings.blurredThumbnailVideos = next;
					void plugin.saveSettings();
				});
			});
		},
	);

	// The folder row is always defined but only rendered while a mode is set
	// to Download; the mode rows refresh the tab when that predicate flips,
	// so the row appears and disappears without a jump on every other select.
	const folder = renderRow(
		'Images folder',
		'Parent folder for downloaded images. Files always land in its thumbnails/ sub-folder, and the next sync fills it.',
		(setting) =>
			folderSetting(setting, {
				app: plugin.app,
				value: settings.imagesFolder,
				placeholder: imagesParentFolder(settings.outputFolder, settings.imagesFolder),
				normalize: normalizeFolder,
				commit: async (path) => {
					settings.imagesFolder = path;
					await plugin.saveSettings();
				},
			}),
		() => downloadsOn(settings),
	);

	return {
		type: 'group',
		heading: 'Images',
		items: [avatars, thumbnails, blurred, folder],
	};
}

/**
 * One three-mode picker. Refreshes the tab only when the choice makes the
 * folder row appear or disappear, so the surrounding rows do not jump on
 * every select.
 */
function imageModeRow(
	host: SettingsHost,
	name: string,
	desc: string,
	key: 'channelAvatars' | 'videoThumbnails',
) {
	const { plugin } = host;
	const { settings } = plugin;
	return renderRow(
		name,
		desc,
		(setting) => {
			setting.addDropdown((dropdown) => {
				for (const [value, label] of IMAGE_MODES) dropdown.addOption(value, label);
				dropdown.setValue(settings[key]).onChange(async (value) => {
					const next = (IMAGE_MODES.some(([mode]) => mode === value) ? value : 'off') as ImageMode;
					if (next === settings[key]) return;
					const wasVisible = downloadsOn(settings);
					settings[key] = next;
					await plugin.saveSettings();
					if (wasVisible !== downloadsOn(settings)) host.refresh();
				});
			});
		},
	);
}
