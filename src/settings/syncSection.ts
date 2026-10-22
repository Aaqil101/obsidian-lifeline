/**
 * Sync: when the automatic startup check runs, how much quota it may spend,
 * and a manual run. The security notes moved to the credentials sub-page,
 * where the thing they describe actually lives.
 */
import { Setting } from 'obsidian';
import { group, type SettingsHost } from './ui';

export function renderSyncGroup(host: SettingsHost, containerEl: HTMLElement): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Sync');

	new Setting(card)
		.setName('Sync interval (hours)')
		.setDesc(
			'Checked once at startup: Lifeline syncs if the last one is older than this. This is not a background scheduler, so nothing syncs while Obsidian is closed.',
		)
		.addText((text) =>
			text.setPlaceholder('20').setValue(String(settings.syncIntervalHours)).onChange(async (value) => {
				const parsed = Number(value);
				if (Number.isFinite(parsed) && parsed > 0) {
					settings.syncIntervalHours = parsed;
					await plugin.saveSettings();
				}
			}),
		);

	new Setting(card)
		.setName('Quota soft limit')
		.setDesc(
			'Soft warning per sync run, in quota units. YouTube’s default budget is 10,000 a day and each list call costs 1 unit.',
		)
		.addText((text) =>
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

	new Setting(card)
		.setName('Sync now')
		.setDesc('Fetch subscriptions and tracked playlists, then refresh the notes immediately.')
		.addButton((button) =>
			button.setButtonText('Sync now').setCta().onClick(() => {
				void plugin.syncNow();
			}),
		);
}
