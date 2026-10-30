/**
 * Dashboard sub-page: the master toggle (gated on the community Dataview
 * plugin) and the section checklist. A heading refresh icon writes and opens
 * the note now.
 *
 * The Script folder row deliberately lives in the Notes group rather than
 * here: that folder receives all four generated view scripts, so it belongs
 * at the level both Dataview features share, next to its sibling the Styles
 * folder. The toggle description points at it so the page is still a route.
 *
 * No reset button: the section defaults are one all-on state, not worth a
 * control.
 *
 * The Hero banner row and the Banner crop row do not rewrite the note: both
 * values are read live by the generated script, so Dashboard.md never changes
 * for them (a rewrite would be skipped as unchanged anyway). The generated
 * script watches both values and repaints the hero in place, so a change takes
 * effect on the note already on screen with no sync and no re-render trigger.
 */
import { Notice, Setting } from 'obsidian';
import { DATAVIEW_REQUIRED_NOTICE, isDataviewEnabled } from '../dashboard';
import { normalizeFolder, outputPaths } from '../markdown';
import { writeDisabledDashboardNote } from '../sync';
import { heroChannelSetting } from './channelPicker';
import { heroFocusSetting } from './heroFocus';
import { DASHBOARD_LIMIT_ROWS, DASHBOARD_ROWS } from './types';
import { group, type SettingsHost } from './ui';

export function renderDashboardPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { plugin } = host;
	const { settings } = plugin;

	const card = group(containerEl, 'Dashboard', (heading) => {
		heading.addExtraButton((button) =>
			button
				.setIcon('refresh-cw')
				.setTooltip('Write dashboard note now')
				.onClick(() => {
					void plugin.createDashboard();
				}),
		);
	});

	new Setting(card)
		.setName('Dashboard note')
		.setDesc(
			'Write Dashboard.md at the top of the output folder: sync status, counts, and live sections. Refreshed after every sync. Its script lives in the Script folder, under Notes. Requires the community Dataview plugin.',
		)
		.addToggle((toggle) =>
			toggle.setValue(settings.dashboardNote).onChange(async (on) => {
				if (on && !isDataviewEnabled(plugin.app)) {
					new Notice(DATAVIEW_REQUIRED_NOTICE, 20000);
					toggle.setValue(false);
					return;
				}
				settings.dashboardNote = on;
				await plugin.saveSettings();
				if (on) await plugin.createDashboard();
				else if (normalizeFolder(settings.outputFolder)) {
					await writeDisabledDashboardNote(plugin.app.vault, outputPaths(settings.outputFolder, settings.imagesFolder).dashboard);
				}
			}),
		);

	// The crop preview lives under the pick row and follows it, so the pick
	// row is given a hook that repoints the preview instead of the whole page
	// re-rendering (which would drop the settings scroll position).
	let repointCrop: ((url: string) => void) | null = null;
	heroChannelSetting(card, {
		app: plugin.app,
		name: 'Hero banner',
		desc: 'Show one channel\'s banner full-bleed across the dashboard hero. Leave empty, or pick a channel without a banner, for the default mosaic of top channels. Read live by the open dashboard, so no sync is needed.',
		value: settings.dashboardHeroChannel,
		placeholder: 'Top channels by default',
		channels: () => Object.values(plugin.state.channels),
		commit: async (url) => {
			settings.dashboardHeroChannel = url;
			await plugin.saveSettings();
			// The note itself never changes for this pick, so there is nothing
			// to rewrite. The generated script watches this value and repaints
			// the hero in place, so the open dashboard follows with no sync.
		},
		onPick: (url) => repointCrop?.(url),
	});

	const showCrop = heroFocusSetting(card, {
		plugin,
		name: 'Banner crop',
		desc: 'Which part of the banner the hero keeps: a banner is much wider than the hero, so the rest is cropped away. Select a point on the preview, or focus it and use the arrow keys (Shift for larger steps, Home to recenter). Read live, like the pick itself.',
		commit: async (focus) => {
			settings.dashboardHeroFocus = focus;
			await plugin.saveSettings();
			// The generated script watches this value too and repaints the hero
			// in place, so the open dashboard follows with no sync.
		},
	});
	repointCrop = showCrop;
	showCrop(settings.dashboardHeroChannel);

	for (const row of DASHBOARD_ROWS) {
		new Setting(card).setName(row.name).addToggle((toggle) => {
			const key = row.key;
			toggle.setValue(settings.dashboardSections[key]).onChange(async (on) => {
				settings.dashboardSections[key] = on;
				await plugin.saveSettings();
				// Keep an existing note in step with its checklist; skip the
				// open so ticking rows does not yank focus away from settings.
				if (settings.dashboardNote) await plugin.createDashboard({ open: false });
			});
		});
	}

	for (const row of DASHBOARD_LIMIT_ROWS) {
		new Setting(card).setName(row.name).setDesc(row.desc).addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.min = '1';
			text.inputEl.max = '100';
			text.inputEl.step = '1';
			text.setValue(String(settings.dashboardLimits[row.key]));
			const commit = async (): Promise<void> => {
				const key = row.key;
			const next = Math.max(1, Math.min(100, Math.floor(Number(text.getValue()))));
				text.setValue(String(next));
				if (next === settings.dashboardLimits[key]) return;
				settings.dashboardLimits[key] = next;
				await plugin.saveSettings();
			};
			text.inputEl.addEventListener('blur', () => {
				void commit();
			});
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				text.inputEl.blur();
			});
		});
	}
}
