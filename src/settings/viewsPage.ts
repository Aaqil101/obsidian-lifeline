/**
 * Views in notes sub-page: the opt-in DataviewJS views (the master toggle,
 * gated on the community Dataview plugin), the three per-note layout
 * pickers, and the items-per-page count.
 *
 * The Styles folder and Script folder rows stay in the Notes group: both
 * Dataview features share them, so they belong at the level both sit under.
 *
 * The sort order sits with the layouts because both shape what the view
 * draws; it is read live too.
 *
 * The layout rows and the page size are read live by the views at render
 * time, so changing them needs no sync. The toggle does need one: it writes
 * or strips the generated scripts and blocks, so it is the only row here
 * that rewrites anything.
 */
import { Notice, Setting } from 'obsidian';
import { DATAVIEW_REQUIRED_NOTICE, isDataviewEnabled } from '../dashboard';
import {
	DEFAULT_NOTE_LAYOUTS,
	LAYOUT_ROWS,
	NOTE_LAYOUT_OPTIONS_BY_KIND,
	VIEW_SORT_OPTIONS,
	type NoteLayout,
} from './types';
import { MAX_VIEW_PAGE_SIZE, MIN_VIEW_PAGE_SIZE, normalizeViewPageSize } from '../noteViewsScript';
import { removeNoteViews, writeNoteViewScripts } from '../sync';
import { group, type SettingsHost } from './ui';

export function renderViewsPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { plugin } = host;
	const { settings } = plugin;

	const card = group(containerEl, 'Views in notes');

	// Opt-in DataviewJS views. Same Dataview gate as the dashboard toggle:
	// revert + Notice when the community plugin is missing. Toggling on writes
	// the three view scripts immediately so the next sync's baked dv.view()
	// calls resolve; toggling off strips the blocks from the notes and trashes
	// the generated files right away. The page refreshes after either, so the
	// layout rows below pick up their active or inactive description.
	new Setting(card)
		.setName('Views in notes')
		.setDesc(
			'Draw a live view above the entries in each note, with search and a layout picker. Changes apply on the next sync.',
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
				} else {
					try {
						await removeNoteViews(plugin);
					} catch (err) {
						console.error('Lifeline: could not remove the note views', err);
						new Notice('Could not remove every view from the notes.');
					}
				}
				host.refresh();
			}),
		);

	// Layout rows. Live while the toggle is off but described as inactive
	// rather than disabled, so a choice made with views off survives and is
	// still there when they come back on. No rewrite on change: each view
	// reads its own layout out of the live plugin settings at render time, so
	// the next re-render of an open note picks the new value up with no sync
	// and no regenerated script. The note's baked layout is only a fallback.
	for (const row of LAYOUT_ROWS) {
		new Setting(card)
			.setName(row.name)
			.setDesc(settings.noteViews ? row.desc : `${row.desc} Only applies while Views in notes is on.`)
			.addDropdown((dropdown) => {
				// Every kind offers the same three layouts; the lists stay per kind so
				// the value written is always one this kind's script can render.
				const options = NOTE_LAYOUT_OPTIONS_BY_KIND[row.key];
				for (const option of options) dropdown.addOption(option.value, option.label);
				dropdown.setValue(settings.noteLayouts[row.key]).onChange(async (value) => {
					settings.noteLayouts[row.key] = options.some((option) => option.value === value)
						? (value as NoteLayout)
						: DEFAULT_NOTE_LAYOUTS[row.key];
					await plugin.saveSettings();
				});
			});
	}

	// Order the entries are drawn in, by date. Read live at render time like the
	// layouts, so no sync is needed.
	const sortDesc =
		'Order of the channels or videos in every view, by the date each one was subscribed or added. Newest first lists the most recent date at the top; oldest first lists the earliest. Entries without a date go last.';
	new Setting(card)
		.setName('Sort order')
		.setDesc(settings.noteViews ? sortDesc : `${sortDesc} Only applies while Views in notes is on.`)
		.addDropdown((dropdown) => {
			for (const option of VIEW_SORT_OPTIONS) dropdown.addOption(option.value, option.label);
			dropdown.setValue(settings.viewSortOrder).onChange(async (value) => {
				settings.viewSortOrder = value === 'desc' ? 'desc' : 'asc';
				await plugin.saveSettings();
			});
		});

	// How many entries each view paints before a Show more button. Committed on
	// blur or Enter rather than per keystroke, so a half-typed number never
	// becomes the page size; the value is clamped and written back into the
	// field either way.
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
}
