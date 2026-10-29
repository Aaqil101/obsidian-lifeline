/**
 * Sync: when the automatic startup check runs, how much quota it may spend,
 * and a manual run. The security notes moved to the credentials sub-page,
 * where the thing they describe actually lives.
 *
 * All three rows are `render` definitions rather than native `control` ones:
 * each text field validates before it stores (a half-typed or nonsense number
 * is never written to settings), which is the kind of behaviour a plain
 * control cannot express. The name and desc still live on the definition, so
 * settings search indexes them.
 */
import { type SettingDefinitionGroup } from 'obsidian';
import { renderRow, type SettingsHost } from './ui';

export function syncGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;
	const { settings } = plugin;

	const interval = renderRow(
		'Sync interval (hours)',
		'Checked once at startup: Lifeline syncs if the last one is older than this. This is not a background scheduler, so nothing syncs while Obsidian is closed.',
		(setting) => {
			setting.addText((text) =>
				text.setPlaceholder('20').setValue(String(settings.syncIntervalHours)).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed) && parsed > 0) {
						settings.syncIntervalHours = parsed;
						await plugin.saveSettings();
					}
				}),
			);
		},
	);

	const quota = renderRow(
		'Quota soft limit',
		'Soft warning per sync run, in quota units. YouTube’s default budget is 10,000 a day and each list call costs 1 unit.',
		(setting) => {
			setting.addText((text) =>
				text
					.setPlaceholder('8000')
					.setValue(String(settings.quotaSoftLimit))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed >= 0) {
							settings.quotaSoftLimit = parsed;
							await plugin.saveSettings();
						}
					}),
			);
		},
	);

	const syncNow = renderRow(
		'Sync now',
		'Fetch subscriptions and tracked playlists, then refresh the notes immediately.',
		(setting) => {
			setting.addButton((button) =>
				button.setButtonText('Sync now').setCta().onClick(() => {
					void plugin.syncNow();
				}),
			);
		},
	);

	return {
		type: 'group',
		heading: 'Sync',
		items: [interval, quota, syncNow],
	};
}
