/**
 * Notes: where the notes go, the two folders the generated view files land
 * in, and the doors to the Views in notes, Channels.md fields, and Dashboard
 * sub-pages.
 *
 * The image rows deliberately live in their own group (images.ts): they are
 * content decisions with a folder of their own, not note structure.
 *
 * Every row here is a `render` definition rather than a native `control` one:
 * the folders commit only on blur, and several rewrite generated scripts when
 * they move. The definition still carries the name and desc, so settings
 * search indexes them.
 */
import { Notice, Setting, type SettingDefinitionGroup } from 'obsidian';
import { normalizeScriptsFolder } from '../dashboardScript';
import { normalizeFolder } from '../markdown';
import { normalizeStylesFolder } from '../noteViewsScript';
import { writeNoteViewScripts } from '../sync';
import { DEFAULT_CHANNELS_FIELDS } from '../types';
import { folderSetting } from './folderPicker';
import { renderDashboardPage } from './dashboardPage';
import { renderViewsPage } from './viewsPage';
import { FIELD_ROWS } from './types';
import { group, pageDefinition, renderRow, type SettingsHost } from './ui';

/** Landing group: output folder, the sub-page doors, and the shared folders. */
export function notesGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;
	const { settings } = plugin;

	const outputFolder = renderRow(
		'Output folder',
		'Where Channels.md, Playlists/, and Watch Later.md are written. The sync log stays in the plugin folder.',
		(setting) =>
			folderSetting(setting, {
				app: plugin.app,
				value: settings.outputFolder,
				placeholder: 'Choose a folder',
				normalize: normalizeFolder,
				commit: async (path) => {
					settings.outputFolder = path;
					await plugin.saveSettings();
					// The two video view scripts bake Channels.md's vault path so they
					// can join channel avatars from it, so a moved output folder has to
					// re-point them.
					if (settings.noteViews) {
						try {
							await writeNoteViewScripts(plugin);
						} catch (err) {
							console.error('Lifeline: could not rewrite the note-view scripts for the new output folder', err);
							new Notice('Could not write the view scripts.');
						}
					}
				},
			}),
	);

	// Daily journal notes: dated bullets (the playlist and Watch Later `date`
	// field, and Channels `subscribed_on`) wikilink a day only when the note
	// for that day lives here, or when the date is today or later; a folder
	// that holds no daily notes leaves every date plain, including the
	// playlist date that used to link unconditionally. Blank is not an "off"
	// state: sync stops and asks for a folder, so the choice is always
	// explicit. The check happens at sync time, so the next run after the
	// folder is picked (or after a daily note comes to exist) rewrites the
	// notes to match.
	const journalFolder = renderRow(
		'Journal folder',
		'Daily notes that bullet dates link into. A date links only when its note exists here, or when it is today or later. Required: sync stops until a folder is chosen.',
		(setting) =>
			folderSetting(setting, {
				app: plugin.app,
				value: settings.journalFolder,
				placeholder: 'Choose a folder',
				normalize: normalizeFolder,
				commit: async (path) => {
					settings.journalFolder = path;
					await plugin.saveSettings();
				},
			}),
	);

	// Folder for the per-view stylesheets the view scripts read at render
	// time (the quotebook.css pattern): lifeline-channels.css,
	// lifeline-playlists.css, lifeline-watchlater.css and the dashboard's
	// lifeline-dashboard.css. Commits only on blur/Enter, then rewrites the
	// three view scripts (they bake their stylesheet's path) and the
	// stylesheets themselves, which also trash the copies left in the old
	// folder.
	const stylesFolder = renderRow(
		'Styles folder',
		'Receives the four view stylesheets: lifeline-channels.css, lifeline-playlists.css, lifeline-watchlater.css, and the dashboard\'s lifeline-dashboard.css. Regenerated on every sync, so hand edits are overwritten; a missing file leaves the views unstyled but working.',
		(setting) =>
			folderSetting(setting, {
				app: plugin.app,
				value: settings.stylesFolder,
				placeholder: 'Choose a folder',
				normalize: normalizeStylesFolder,
				commit: async (path) => {
					settings.stylesFolder = path;
					await plugin.saveSettings();
					// The dashboard script bakes its stylesheet's path too, so whichever
					// of the two Dataview features is on gets re-pointed: createDashboard
					// rewrites the script into the new folder; writeNoteViewScripts does
					// the same for the three note-view scripts. Both pass also trash the
					// stylesheets left in the old folder.
					if (settings.dashboardNote) await plugin.createDashboard({ open: false });
					if (settings.noteViews) {
						try {
							await writeNoteViewScripts(plugin);
						} catch (err) {
							console.error('Lifeline: could not rewrite the note-view scripts for the new styles folder', err);
							new Notice('Could not write the view stylesheet.');
						}
					}
				},
			}),
	);

	// Folder for all four generated view scripts, not just the dashboard one:
	// lifeline-dashboard.js for Dashboard.md, plus lifeline-channels.js,
	// lifeline-playlists.js, and lifeline-watchlater.js for the note views.
	// That is why this commit fans out to both features: whichever notices a
	// folder change rewrites its files into the new folder and trashes the
	// ones left behind. The styles folder above has one consumer, so it does
	// not. The row lives here rather than on the Dashboard sub-page because it
	// is shared infrastructure, and a shared setting buried under one of its
	// consumers is a setting nobody finds.
	const scriptsFolder = renderRow(
		'Script folder',
		'Receives all four generated scripts: lifeline-dashboard.js, plus lifeline-channels.js, lifeline-playlists.js, and lifeline-watchlater.js for the note views. Regenerated on every sync, so hand edits are overwritten.',
		(setting) =>
			folderSetting(setting, {
				app: plugin.app,
				value: settings.dashboardScriptsFolder,
				placeholder: 'Choose a folder',
				normalize: normalizeScriptsFolder,
				commit: async (path) => {
					settings.dashboardScriptsFolder = path;
					await plugin.saveSettings();
					// Both Dataview features keep a script in this folder, so both have
					// to be re-pointed. The dashboard refresh also trashes the script
					// left in the old folder; writeNoteViewScripts does the same for
					// the three note-view scripts whose path the notes have baked in.
					if (settings.dashboardNote) await plugin.createDashboard({ open: false });
					if (settings.noteViews) {
						try {
							await writeNoteViewScripts(plugin);
						} catch (err) {
							console.error('Lifeline: could not rewrite the view scripts for the new scripts folder', err);
							new Notice('Could not write the view scripts.');
						}
					}
				},
			}),
	);

	const channelsFields = pageDefinition(
		host,
		'Channels.md fields',
		'Pick which fields each channel entry carries. The statistics rows cost 1 quota unit per 50 channels per sync while any is on.',
		renderChannelsFieldsPage,
	);

	const views = pageDefinition(
		host,
		'Views in notes',
		settings.noteViews
			? 'On. Live views above the entries in Channels.md, playlist notes, and Watch Later.md; open this page to change their layouts.'
			: 'Off. Live views above the entries in Channels.md, playlist notes, and Watch Later.md.',
		renderViewsPage,
	);

	const dashboard = pageDefinition(
		host,
		'Dashboard',
		settings.dashboardNote
			? 'On. Dashboard.md refreshes after every sync; open this page to pick its live sections.'
			: 'Off. A home note with sync stats and live DataviewJS sections.',
		renderDashboardPage,
	);

	return {
		type: 'group',
		heading: 'Notes',
		items: [
			outputFolder,
			journalFolder,
			views,
			stylesFolder,
			scriptsFolder,
			channelsFields,
			dashboard,
		],
	};
}

/** Channels.md fields sub-page: one toggle per field, plus a reset in the heading. */
export function renderChannelsFieldsPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { settings } = host.plugin;
	const card = group(containerEl, 'Channels.md fields', (heading) => {
		heading.addExtraButton((button) =>
			button
				.setIcon('rotate-ccw')
				.setTooltip('Reset all fields to defaults')
				.onClick(async () => {
					settings.channelsFields = { ...DEFAULT_CHANNELS_FIELDS };
					await host.plugin.saveSettings();
					host.refresh();
				}),
		);
	});

	for (const row of FIELD_ROWS) {
		const setting = new Setting(card).setName(row.name);
		if (row.desc) setting.setDesc(row.desc);
		setting.addToggle((toggle) =>
			toggle.setValue(settings.channelsFields[row.key]).onChange(async (on) => {
				settings.channelsFields[row.key] = on;
				await host.plugin.saveSettings();
			}),
		);
	}
}
