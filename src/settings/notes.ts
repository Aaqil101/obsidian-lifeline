/**
 * Notes: where the notes go, the Dataview view rows (the toggle, the layout
 * dropdowns, items per page, and the two folders its generated files land in),
 * and the doors to the Channels.md fields and Dashboard sub-pages.
 *
 * The image rows deliberately live in their own group (images.ts): they are
 * content decisions with a folder of their own, not note structure.
 */
import { Notice, Setting } from 'obsidian';
import { DATAVIEW_REQUIRED_NOTICE, isDataviewEnabled } from '../dashboard';
import { DEFAULT_SCRIPTS_FOLDER, normalizeScriptsFolder } from '../dashboardScript';
import { DEFAULT_OUTPUT_FOLDER, normalizeFolder } from '../markdown';
import {
	DEFAULT_STYLES_FOLDER,
	MAX_VIEW_PAGE_SIZE,
	MIN_VIEW_PAGE_SIZE,
	normalizeStylesFolder,
	normalizeViewPageSize,
} from '../noteViewsScript';
import { writeNoteViewScripts } from '../sync';
import { DEFAULT_CHANNELS_FIELDS } from '../types';
import { folderSetting } from './folderPicker';
import {
	DEFAULT_JOURNAL_FOLDER,
	DEFAULT_NOTE_LAYOUTS,
	FIELD_ROWS,
	LAYOUT_ROWS,
	NOTE_LAYOUT_OPTIONS_BY_KIND,
	type NoteLayout,
} from './types';
import { group, navRow, type SettingsHost } from './ui';

/** Landing group: output folder, views, and the two structural sub-pages. */
export function renderNotesGroup(host: SettingsHost, containerEl: HTMLElement): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Notes');

	folderSetting(card, {
		app: plugin.app,
		name: 'Output folder',
		desc: 'Where Channels.md, Playlists/, and Watch Later.md are written. The sync log stays in the plugin folder.',
		value: settings.outputFolder,
		placeholder: DEFAULT_OUTPUT_FOLDER,
		normalize: (raw) => normalizeFolder(raw) || DEFAULT_OUTPUT_FOLDER,
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
	});

	// Daily journal notes: dated bullets (the playlist and Watch Later `date`
	// field, and Channels `subscribed_on`) wikilink a day only when the note
	// for that day lives here, or when the date is today or later; a folder
	// that holds no daily notes leaves every date plain, including the
	// playlist date that used to link unconditionally. Blank commits to the
	// default rather than storing an "off" state: the strict rule already
	// degrades to plain dates by itself, so no separate off value is needed.
	// The check happens at sync time, so the next run after the folder is
	// picked (or after a daily note comes to exist) rewrites the notes to
	// match; the empty data.json value older builds could save is filled by
	// the onload migration instead.
	folderSetting(card, {
		app: plugin.app,
		name: 'Journal folder',
		desc: 'Daily notes that bullet dates link into. A date links only when its note exists here, or when it is today or later. Blank falls back to the default.',
		value: settings.journalFolder,
		placeholder: DEFAULT_JOURNAL_FOLDER,
		normalize: (raw) => normalizeFolder(raw) || DEFAULT_JOURNAL_FOLDER,
		commit: async (path) => {
			settings.journalFolder = path;
			await plugin.saveSettings();
		},
	});

	// Opt-in DataviewJS views. Same Dataview gate as the dashboard toggle:
	// revert + Notice when the community plugin is missing. Toggling on writes
	// the three view scripts immediately so the next sync's baked dv.view()
	// calls resolve; toggling off needs nothing (the next sync rewrites the
	// notes without the block). The layout rows below stay live either way so
	// a choice survives the toggle, described as inactive while off.
	new Setting(card)
		.setName('Views in notes')
		.setDesc(
			'Draw a live view above the entries in Channels.md, playlist notes, and Watch Later.md, each with search and a Layout picker. Notes pick it up on the next sync. Requires the community Dataview plugin.',
		)
		.addToggle((toggle) =>
			toggle.setValue(settings.noteViews).onChange(async (on) => {
				if (on && !isDataviewEnabled(plugin.app)) {
					new Notice(DATAVIEW_REQUIRED_NOTICE, 20000);
					toggle.setValue(false);
					return;
				}
				settings.noteViews = on;
				await plugin.saveSettings();
				if (on) {
					try {
						await writeNoteViewScripts(plugin);
					} catch (err) {
						console.error('Lifeline: could not write the note-view scripts', err);
						new Notice('Could not write the view scripts.');
					}
				}
			}),
		);

	// Layout rows. Live while the toggle is off but described as inactive
	// rather than disabled, so a choice made with views off survives and is
	// still there when they come back on. No rewrite on change: each view
	// reads its own layout out of the live plugin settings at render time, so
	// the next re-render of an open note picks the new value up with no sync
	// and no regenerated script. The note's baked layout is only a fallback.
	for (const row of LAYOUT_ROWS) {
		// Every kind offers the same three layouts; the lists stay per kind so
		// the value written is always one this kind's script can render.
		const options = NOTE_LAYOUT_OPTIONS_BY_KIND[row.key];
		new Setting(card)
			.setName(row.name)
			.setDesc(settings.noteViews ? row.desc : `${row.desc} Only applies while Views in notes is on.`)
			.addDropdown((dropdown) => {
				for (const option of options) dropdown.addOption(option.value, option.label);
				dropdown.setValue(settings.noteLayouts[row.key]).onChange(async (value) => {
					settings.noteLayouts[row.key] = options.some((option) => option.value === value)
						? (value as NoteLayout)
						: DEFAULT_NOTE_LAYOUTS[row.key];
					await plugin.saveSettings();
				});
			});
	}

	// How many entries each view paints before a Show more button. Read live
	// from settings at render time, the same way the layout is, so changing it
	// needs no sync and no regenerated script. Committed on blur or Enter
	// rather than per keystroke, so a half-typed number never becomes the page
	// size; the value is clamped and written back into the field either way.
	new Setting(card)
		.setName('Items per page')
		.setDesc(
			settings.noteViews
				? 'How many channels or videos each layout draws before a Show more button. Applies on the next view render.'
				: 'How many channels or videos each layout draws before a Show more button. Only applies while Views in notes is on.',
		)
		.addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.min = String(MIN_VIEW_PAGE_SIZE);
			text.inputEl.max = String(MAX_VIEW_PAGE_SIZE);
			text.inputEl.step = '1';
			text.setValue(String(normalizeViewPageSize(settings.viewPageSize)));
			const commit = async (): Promise<void> => {
				const next = normalizeViewPageSize(text.getValue());
				text.setValue(String(next));
				if (next === settings.viewPageSize) return;
				settings.viewPageSize = next;
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

	// Folder for the per-view stylesheets the view scripts read at render
	// time (the quotebook.css pattern): lifeline-channels.css,
	// lifeline-playlists.css, lifeline-watchlater.css and the dashboard's
	// lifeline-dashboard.css. Commits only on blur/Enter, then rewrites the
	// three view scripts (they bake their stylesheet's path) and the
	// stylesheets themselves, which also trash the copies left in the old
	// folder.
	folderSetting(card, {
		app: plugin.app,
		name: 'Styles folder',
		desc: 'Receives the four view stylesheets: lifeline-channels.css, lifeline-playlists.css, lifeline-watchlater.css, and the dashboard\'s lifeline-dashboard.css. Regenerated on every sync, so hand edits are overwritten; a missing file leaves the views unstyled but working.',
		value: settings.stylesFolder,
		placeholder: DEFAULT_STYLES_FOLDER,
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
	});

	// Folder for all four generated view scripts, not just the dashboard one:
	// lifeline-dashboard.js for Dashboard.md, plus lifeline-channels.js,
	// lifeline-playlists.js, and lifeline-watchlater.js for the note views.
	// That is why this commit fans out to both features: whichever notices a
	// folder change rewrites its files into the new folder and trashes the
	// ones left behind. The styles folder above has one consumer, so it does
	// not. The row lives here rather than on the Dashboard sub-page because it
	// is shared infrastructure, and a shared setting buried under one of its
	// consumers is a setting nobody finds.
	folderSetting(card, {
		app: plugin.app,
		name: 'Script folder',
		desc: 'Receives all four generated scripts: lifeline-dashboard.js, plus lifeline-channels.js, lifeline-playlists.js, and lifeline-watchlater.js for the note views. Regenerated on every sync, so hand edits are overwritten.',
		value: settings.dashboardScriptsFolder,
		placeholder: DEFAULT_SCRIPTS_FOLDER,
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
	});

	navRow(
		host,
		card,
		'Channels.md fields',
		'Pick which fields each channel entry carries. The statistics rows cost 1 quota unit per 50 channels per sync while any is on.',
		'channels',
		'list',
	);

	navRow(
		host,
		card,
		'Dashboard',
		settings.dashboardNote
			? 'On. Dashboard.md refreshes after every sync; open this page to pick its live sections.'
			: 'Off. A home note with sync stats and live DataviewJS sections.',
		'dashboard',
		'home',
	);
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
					host.display();
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
