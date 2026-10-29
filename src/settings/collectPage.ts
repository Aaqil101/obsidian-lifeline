/**
 * Saved-playlist ID collector sub-page. Mode 1 (default, every platform):
 * numbered DevTools steps, a copy button for the console collector, and a
 * lenient paste parser with an "N IDs parsed" count plus shape warnings.
 * Mode 2 (desktop-only): open the page in Obsidian's Web viewer core plugin
 * and collect from that tab with one click. Imported IDs are persisted to
 * data.json only.
 */
import { Notice, Platform, Setting, type ButtonComponent } from 'obsidian';
import { COLLECTOR_SOURCE } from '../collector';
import { errorMessage } from '../json';
import {
	addImportedPlaylistIds,
	cleanPlaylistIds,
	describeParse,
	parsePlaylistIds,
	removeImportedPlaylistId,
} from '../playlistIds';
import {
	findWebViewerTab,
	isGoogleSignInUrl,
	isWebViewerEnabled,
	openInWebViewer,
	PLAYLISTS_FRAGMENT,
	PLAYLISTS_URL,
} from '../webviewCompat';
import { group, noteParagraph, type SettingsHost } from './ui';

export function renderCollectIdsPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { settings } = host.plugin;

	const stepsCard = group(containerEl, 'Get saved playlist IDs');
	const steps = stepsCard.createEl('ol', { cls: 'lifeline-settings-steps' });
	steps.createEl('li', { text: 'Open YouTube.com/feed/playlists in a browser and sign in.' });
	steps.createEl('li', {
		text: 'Open DevTools (F12) and select the Console tab. If Chrome warns about pasting, type allow pasting and press Enter first.',
	});
	steps.createEl('li', {
		text: 'Paste the collector script and press Enter. It scrolls to the end of the page, then prints a JSON array of playlist IDs.',
	});
	const lastStep = steps.createEl('li');
	lastStep.appendText('Copy the printed array, paste it below, then select ');
	lastStep.createEl('b', { text: 'Add to tracked playlists' });
	lastStep.appendText('. The script only reads the page; it never touches your cookies or account.');

	new Setting(stepsCard)
		.setName('Collector script')
		.setDesc('Reads YouTube.com/feed/playlists: scrolls to the end, then collects every playlist ID it finds.')
		.addButton((button) =>
			button.setButtonText('Copy collector script').onClick(async () => {
				try {
					await navigator.clipboard.writeText(COLLECTOR_SOURCE);
					new Notice('Collector script copied. Paste it in the YouTube console.');
				} catch {
					new Notice('Could not copy automatically. Expand the script below and copy it manually.', 8000);
				}
			}),
		);

	const disclosure = stepsCard.createEl('details', { cls: 'lifeline-settings-note' });
	disclosure.createEl('summary', { text: 'Show the collector script' });
	disclosure.createEl('pre', { cls: 'lifeline-collect-script', text: COLLECTOR_SOURCE });

	let pasted = '';
	let addButton: ButtonComponent | null = null;

	new Setting(stepsCard)
		.setName('Paste the copied array')
		.setDesc('A JSON array, one ID per line, or a mix: quotes, commas, brackets, and playlist links all work.')
		.addTextArea((text) => {
			text.setPlaceholder('Paste the array you copied from the console');
			text.inputEl.rows = 6;
			text.onChange((value) => {
				pasted = value;
				updateFeedback();
			});
		});

	const feedback = stepsCard.createDiv({ cls: 'lifeline-settings-note lifeline-collect-feedback' });

	const updateFeedback = (): void => {
		feedback.empty();
		const parse = parsePlaylistIds(pasted);
		if (parse.ids.length === 0) {
			addButton?.setDisabled(true);
			if (pasted.trim()) feedback.createEl('p', { text: 'Nothing that looks like a playlist ID was found.' });
			return;
		}
		addButton?.setDisabled(false);
		const tracked = new Set(settings.trackedPlaylists ?? []);
		const alreadyTracked = parse.ids.filter((id) => tracked.has(id)).length;
		const { countLine, warningLine } = describeParse(parse, alreadyTracked);
		feedback.createEl('p', { text: countLine });
		if (warningLine) feedback.createEl('p', { text: warningLine });
	};

	new Setting(stepsCard)
		.setName('Import')
		.setDesc('Save the parsed IDs to data.json and start tracking them for backup.')
		.addButton((button) => {
			addButton = button;
			button
				.setButtonText('Add to tracked playlists')
				.setCta()
				.setDisabled(true)
				.onClick(async () => {
					const { ids } = parsePlaylistIds(pasted);
					if (ids.length === 0) return;
					const added = addImportedPlaylistIds(settings, ids);
					await host.plugin.saveSettings();
					new Notice(
						added > 0
							? `Added ${added} playlist ID${added === 1 ? '' : 's'}.`
							: 'Those IDs are already tracked.',
					);
					host.refresh();
				});
		});
	updateFeedback();

	renderImportedCard(host, containerEl);

	// Mode 2: the user's own Web viewer tab (core plugin), desktop-only.
	if (!Platform.isMobile) renderWebViewerCard(host, containerEl);
}

/** Imported IDs, each removable. */
function renderImportedCard(host: SettingsHost, containerEl: HTMLElement): void {
	const { settings } = host.plugin;
	const card = group(containerEl, 'Imported IDs');
	const imported = settings.importedPlaylistIds ?? [];
	if (imported.length === 0) {
		noteParagraph(card, 'Nothing imported yet. Start with the steps above.');
	}
	const catalog = new Map(settings.playlistCatalog.map((playlist) => [playlist.id, playlist] as const));
	for (const id of imported) {
		const title = catalog.get(id)?.title ?? host.plugin.state.playlists[id]?.title ?? id;
		const row = new Setting(card).setName(title).addExtraButton((button) =>
			button
				.setIcon('trash')
				.setTooltip('Stop tracking this playlist')
				.onClick(async () => {
					removeImportedPlaylistId(settings, id);
					await host.plugin.saveSettings();
					host.refresh();
				}),
		);
		if (title !== id) row.setDesc(id);
	}
}

/** Mode 2: collect straight from the user's own signed-in Web viewer tab. */
function renderWebViewerCard(host: SettingsHost, containerEl: HTMLElement): void {
	const { app } = host.plugin;
	const card = group(containerEl, 'Web viewer');
	// Never enable a core plugin ourselves: check it and say so.
	const webViewerEnabled = isWebViewerEnabled(app);

	new Setting(card)
		.setName('Open saved playlists')
		.setDesc(
			'Open YouTube.com/feed/playlists in the Web viewer, Obsidian’s built-in browser, where you keep your own sign-in.',
		)
		.addButton((button) => {
			button.setButtonText('Open in Web viewer').onClick(() => {
				if (!openInWebViewer(app, PLAYLISTS_URL)) {
					new Notice('Could not open the Web viewer. Enable it in Settings → Core plugins → Web viewer.', 10000);
				}
			});
			if (!webViewerEnabled) button.setDisabled(true);
		});

	let collecting = false;
	new Setting(card)
		.setName('Collect saved playlist IDs')
		.setDesc(
			'Run the collector in that tab: it scrolls to the end, collects every playlist ID, and starts tracking them. It only reads the page.',
		)
		.addButton((button) => {
			button.setButtonText('Collect from tab').onClick(async () => {
				if (collecting) return;
				collecting = true;
				button.setDisabled(true);
				try {
					await collectFromWebViewer(host);
				} finally {
					collecting = false;
					button.setDisabled(false);
				}
			});
			if (!webViewerEnabled) button.setDisabled(true);
		});

	if (!webViewerEnabled) {
		noteParagraph(
			card,
			'The Web viewer core plugin is off. Enable it in Settings → Core plugins → Web viewer, or use the console steps above.',
		);
	}
}

/**
 * Mode 2 collect: run the collector script inside the user's own Web viewer
 * tab (their signed-in session; the plugin only reads the page), then persist
 * the ids exactly like a Mode 1 paste.
 */
async function collectFromWebViewer(host: SettingsHost): Promise<void> {
	const { settings } = host.plugin;
	const tab = findWebViewerTab(host.plugin.app);
	if (!tab) {
		new Notice('Open YouTube.com/feed/playlists in the Web viewer first, then collect again.', 8000);
		return;
	}
	const url = tab.getURL();
	if (isGoogleSignInUrl(url)) {
		new Notice(
			'Google is asking you to sign in on that tab. Sign in there, open the playlists page, then collect again. Lifeline never handles your Google login.',
			12000,
		);
		return;
	}
	if (!url.includes(PLAYLISTS_FRAGMENT)) {
		new Notice('Open YouTube.com/feed/playlists in the Web viewer tab first.', 8000);
		return;
	}
	try {
		const ids = cleanPlaylistIds(await tab.executeJavaScript(COLLECTOR_SOURCE));
		if (ids.length === 0) {
			new Notice('No playlists found on that page.');
			return;
		}
		const added = addImportedPlaylistIds(settings, ids);
		await host.plugin.saveSettings();
		new Notice(`Collected ${ids.length} playlist IDs · ${added} new.`);
		host.refresh();
	} catch (err) {
		new Notice(
			`Could not read the Web viewer tab: ${errorMessage(err)}. Use the console steps instead.`,
			12000,
		);
	}
}
