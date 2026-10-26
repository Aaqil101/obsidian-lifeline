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
 */
import { Notice, Setting } from 'obsidian';
import { DATAVIEW_REQUIRED_NOTICE, isDataviewEnabled } from '../dashboard';
import { type DashboardLimits, type DashboardSections } from '../types';
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
			}),
		);

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
