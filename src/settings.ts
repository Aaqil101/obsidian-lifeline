/**
 * Settings: Google authentication (client ID + SecretComponent-backed client
 * secret), output locations, Channels.md fields and playlist checklist
 * sub-pages, watch-later substitute, and sync behaviour.
 *
 * Rows are grouped with Obsidian's native `.setting-group` /
 * `.setting-items` card structure, so the tab renders exactly like the
 * built-in settings pages.
 *
 * No Google credential ever lands in data.json: the client ID, client
 * secret, and refresh token all live in the Obsidian keychain, and only
 * their *names* are persisted here.
 */
import { App, Notice, PluginSettingTab, SecretComponent, Setting, setIcon } from 'obsidian';
import { DATAVIEW_REQUIRED_NOTICE, isDataviewEnabled } from './dashboard';
import { DEFAULT_OUTPUT_FOLDER } from './markdown';
import {
	DEFAULT_CHANNELS_FIELDS,
	DEFAULT_DASHBOARD_SECTIONS,
	type ChannelsFieldSettings,
	type DashboardSections,
	type PlaylistSummary,
} from './types';
import type LifelinePlugin from './main';

const SECURITY_URL = 'https://github.com/Aaqil101/obsidian-lifeline#security--privacy';

/** Channels.md checklist rows, in render order. */
const FIELD_ROWS: Array<{ key: keyof ChannelsFieldSettings; name: string }> = [
	{ key: 'channelId', name: 'Channel ID' },
	{ key: 'subscribedOn', name: 'Subscribed on' },
	{ key: 'syncDates', name: 'First seen & last seen' },
	{ key: 'status', name: 'Status' },
	{ key: 'handle', name: 'Handle' },
	{ key: 'subscribers', name: 'Subscribers' },
	{ key: 'videos', name: 'Videos' },
	{ key: 'views', name: 'Views' },
	{ key: 'country', name: 'Country' },
];

/** Dashboard.md live-section checklist rows, in render order. */
const DASHBOARD_ROWS: Array<{ key: keyof DashboardSections; name: string }> = [
	{ key: 'quickLinks', name: 'Quick links row' },
	{ key: 'recent', name: 'Recently added videos' },
	{ key: 'topChannels', name: 'Top channels by subscribers' },
	{ key: 'attention', name: 'Needs attention list' },
];

export interface LifelineSettings {
	/** Keychain *name* of the secret holding the OAuth client ID. */
	clientIdName: string;
	/** Keychain *name* of the secret holding the OAuth client secret. */
	clientSecretName: string;
	/** Vault-relative folder that receives the generated notes. */
	outputFolder: string;
	/** Which fields render on each Channels.md entry (Manage sub-page). */
	channelsFields: ChannelsFieldSettings;
	/** Opt-in Dashboard.md note (requires the community Dataview plugin). */
	dashboardNote: boolean;
	/** Which live sections render on Dashboard.md (sub-page checklist). */
	dashboardSections: DashboardSections;
	/** null = never fetched → every playlist is tracked on first fetch. */
	trackedPlaylists: string[] | null;
	/** Every playlist id ever discovered (so user-unchecked ids stay unchecked). */
	knownPlaylistIds: string[];
	/** Last fetched playlists.list result — powers settings UI and dropdowns. */
	playlistCatalog: PlaylistSummary[];
	/** Playlist written to Watch Later.md (YouTube's system list is API-inaccessible). */
	watchLaterPlaylistId: string;
	/** Load-time auto-sync threshold in hours; NOT a background scheduler. */
	syncIntervalHours: number;
	/** Soft quota cap per run (units); sync warns instead of hard-stopping. */
	quotaSoftLimit: number;
}

export const DEFAULT_SETTINGS: LifelineSettings = {
	clientIdName: 'lifeline-client-id',
	clientSecretName: 'lifeline-client-secret',
	outputFolder: DEFAULT_OUTPUT_FOLDER,
	channelsFields: { ...DEFAULT_CHANNELS_FIELDS },
	dashboardNote: false,
	dashboardSections: { ...DEFAULT_DASHBOARD_SECTIONS },
	trackedPlaylists: null,
	knownPlaylistIds: [],
	playlistCatalog: [],
	watchLaterPlaylistId: '',
	syncIntervalHours: 20,
	quotaSoftLimit: 8000,
};

export class LifelineSettingTab extends PluginSettingTab {
	plugin: LifelinePlugin;
	/** Which in-settings sub-page is open (native Manage-page navigation). */
	private subPage: 'none' | 'channels' | 'playlists' | 'dashboard' = 'none';

	constructor(app: App, plugin: LifelinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (this.subPage === 'channels') {
			this.renderChannelsFieldsPage(containerEl);
			return;
		}
		if (this.subPage === 'playlists') {
			this.renderPlaylistsPage(containerEl);
			return;
		}
		if (this.subPage === 'dashboard') {
			this.renderDashboardPage(containerEl);
			return;
		}

		this.renderAuthSection(containerEl);
		this.renderOutputSection(containerEl);
		this.renderPlaylistsSection(containerEl);
		this.renderSyncSection(containerEl);
	}

	/**
	 * Native settings group (Obsidian 1.14+): section heading plus a
	 * `.setting-items` card. On older versions these classes are inert and rows
	 * keep the flat style those app versions use, so the tab always matches its
	 * surroundings.
	 */
	private group(
		containerEl: HTMLElement,
		name: string,
		decorateHeading?: (heading: Setting) => void,
	): HTMLDivElement {
		const group = containerEl.createDiv({ cls: 'setting-group' });
		const heading = new Setting(group).setName(name).setHeading();
		decorateHeading?.(heading);
		return group.createDiv({ cls: 'setting-items' });
	}

	/** Chevron navigation row (Ribbon menu configuration style). */
	private navRow(
		card: HTMLElement,
		name: string,
		desc: string,
		target: 'channels' | 'playlists' | 'dashboard',
	): void {
		const row = new Setting(card)
			.setName(name)
			.setDesc(desc)
			.addExtraButton((button) => button.setIcon('chevron-right'));
		row.settingEl.addClass('lifeline-nav-row');
		row.settingEl.addEventListener('click', () => {
			this.subPage = target;
			this.display();
		});
	}

	/** Back crumb for sub-pages (chevron + parent name), like native Manage pages. */
	private addBackCrumb(containerEl: HTMLElement): void {
		const backRow = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
		const backLink = backRow.createEl('a', { cls: 'lifeline-subpage-back', href: '#' });
		setIcon(backLink, 'chevron-left');
		backLink.append(' Lifeline');
		backLink.addEventListener('click', (evt) => {
			evt.preventDefault();
			this.subPage = 'none';
			this.display();
		});
	}

	private renderAuthSection(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		const card = this.group(containerEl, 'Google authentication');

		new Setting(card)
			.setName('OAuth client ID')
			.setDesc('From Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Desktop app). Stored in the system keychain alongside the client secret.')
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(settings.clientIdName)
					.onChange(async (value) => {
						settings.clientIdName = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(card)
			.setName('OAuth client secret')
			.setDesc(
				'Select an existing secret or create a new one. The value is kept in the system keychain (via Obsidian), never in data.json.',
			)
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(settings.clientSecretName)
					.onChange(async (value) => {
						settings.clientSecretName = value;
						await this.plugin.saveSettings();
					}),
			);

		const connected = this.plugin.auth.isConnected();
		new Setting(card)
			.setName('Connection')
			.setDesc(
				connected
					? 'Connected. Your refresh token is stored in the system keychain.'
					: 'Not connected yet. Authenticate to allow Lifeline to read your subscriptions.',
			)
			.addButton((button) =>
				button
					.setButtonText(connected ? 'Re-authenticate' : 'Authenticate with Google')
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText('Waiting for browser…');
						try {
							await this.plugin.auth.authenticate();
							new Notice('Lifeline is connected to YouTube.');
						} catch (err) {
							new Notice(authErrorMessage(err), 20000);
						} finally {
							button.setDisabled(false);
							this.display();
						}
					}),
			);
	}

	private renderOutputSection(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		const card = this.group(containerEl, 'Notes');

		new Setting(card)
			.setName('Output folder')
			.setDesc('Vault-relative folder for Channels.md, Playlists/, and Watch Later.md. The sync log lives in the plugin folder.')
			.addText((text) =>
				text.setValue(settings.outputFolder).onChange(async (value) => {
					settings.outputFolder = value;
					await this.plugin.saveSettings();
				}),
			);

		this.navRow(
			card,
			'Channels.md fields',
			'Choose which fields appear on each channel entry. Subscribers, Videos, Views, and Country cost 1 quota unit per 50 channels per sync while any is enabled.',
			'channels',
		);

		this.navRow(
			card,
			'Dashboard',
			settings.dashboardNote
				? 'On. Dashboard.md refreshes after every sync; open this page to pick its live sections.'
				: 'Off. Create a home note with sync stats and live DataviewJS sections (requires the community Dataview plugin).',
			'dashboard',
		);
	}

	private renderChannelsFieldsPage(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		this.addBackCrumb(containerEl);

		const card = this.group(containerEl, 'Channels.md fields', (heading) => {
			heading.addExtraButton((button) =>
				button
					.setIcon('rotate-ccw')
					.setTooltip('Reset all fields to defaults')
					.onClick(async () => {
						settings.channelsFields = { ...DEFAULT_CHANNELS_FIELDS };
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		});
		for (const row of FIELD_ROWS) {
			new Setting(card).setName(row.name).addToggle((toggle) =>
				toggle.setValue(settings.channelsFields[row.key]).onChange(async (on) => {
					settings.channelsFields[row.key] = on;
					await this.plugin.saveSettings();
				}),
			);
		}
	}

	private renderPlaylistsSection(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		const card = this.group(containerEl, 'Playlists');

		const catalog = settings.playlistCatalog;
		const tracked = new Set(settings.trackedPlaylists ?? []);
		const trackedCount = catalog.filter((playlist) => tracked.has(playlist.id)).length;
		const desc =
			catalog.length === 0
				? 'Every playlist is tracked by default. Open this page after authenticating to choose which ones are backed up.'
				: `${trackedCount} of ${catalog.length} tracked. Uncheck the ones you don’t want backed up.`;
		this.navRow(card, 'Playlists to track', desc, 'playlists');

		new Setting(card)
			.setName('Watch later playlist')
			.setDesc(
				'YouTube’s system Watch Later list isn’t accessible via the API. Pick the playlist you use instead; Lifeline writes it to Watch Later.md.',
			)
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Not set');
				for (const playlist of catalog)
					dropdown.addOption(playlist.id, playlist.saved ? `${playlist.title} (saved)` : playlist.title);
				dropdown.setValue(settings.watchLaterPlaylistId);
				dropdown.onChange(async (value) => {
					settings.watchLaterPlaylistId = value;
					if (value) {
						// The watch-later substitute is always backed up when set.
						settings.trackedPlaylists = Array.from(
							new Set([...(settings.trackedPlaylists ?? []), value]),
						);
					}
					await this.plugin.saveSettings();
				});
			});
	}

	private renderPlaylistsPage(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		this.addBackCrumb(containerEl);

		const card = this.group(containerEl, 'Playlists to track', (heading) => {
			heading.addExtraButton((button) =>
				button
					.setIcon('refresh-cw')
					.setTooltip('Refresh list')
					.onClick(async () => {
						button.setDisabled(true);
						try {
							await this.plugin.fetchPlaylistCatalog();
							new Notice('Playlist list refreshed.');
						} catch (err) {
							new Notice(authErrorMessage(err), 15000);
						} finally {
							button.setDisabled(false);
							this.display();
						}
					}),
			);
		});

		const catalog = settings.playlistCatalog;
		if (catalog.length === 0) {
			card.createEl('p', {
				cls: 'lifeline-settings-note',
				text: 'No playlists loaded yet. Authenticate, then refresh the list.',
			});
		}
		const tracked = new Set(settings.trackedPlaylists ?? []);
		for (const playlist of catalog) {
			const label = playlist.saved ? `${playlist.title} (saved)` : playlist.title;
			new Setting(card).setName(label).addToggle((toggle) =>
				toggle.setValue(tracked.has(playlist.id)).onChange(async (on) => {
					const set = new Set(this.plugin.settings.trackedPlaylists ?? []);
					if (on) set.add(playlist.id);
					else set.delete(playlist.id);
					this.plugin.settings.trackedPlaylists = Array.from(set);
					await this.plugin.saveSettings();
				}),
			);
		}
	}

	/**
	 * Dashboard sub-page: master toggle with the Dataview gate (revert +
	 * Notice when Dataview is missing), section checklist, and a heading
	 * refresh icon that writes + opens the note now. No reset button — the
	 * section defaults are one all-on state, not worth a control.
	 */
	private renderDashboardPage(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		this.addBackCrumb(containerEl);

		const card = this.group(containerEl, 'Dashboard', (heading) => {
			heading.addExtraButton((button) =>
				button
					.setIcon('refresh-cw')
					.setTooltip('Write dashboard note now')
					.onClick(() => {
						void this.plugin.createDashboard();
					}),
			);
		});

		new Setting(card)
			.setName('Dashboard note')
			.setDesc(
				'Write Dashboard.md at the top of the output folder: sync status, counts, and quick links, plus live DataviewJS sections. Refreshed after every sync. Requires the community Dataview plugin.',
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.dashboardNote).onChange(async (on) => {
					if (on && !isDataviewEnabled(this.app)) {
						new Notice(DATAVIEW_REQUIRED_NOTICE, 20000);
						toggle.setValue(false);
						return;
					}
					settings.dashboardNote = on;
					await this.plugin.saveSettings();
					if (on) await this.plugin.createDashboard();
				}),
			);

		for (const row of DASHBOARD_ROWS) {
			new Setting(card).setName(row.name).addToggle((toggle) =>
				toggle.setValue(settings.dashboardSections[row.key]).onChange(async (on) => {
					settings.dashboardSections[row.key] = on;
					await this.plugin.saveSettings();
					// Keep an existing note in step with its checklist; skip the
					// open so ticking rows doesn't yank focus away from settings.
					if (settings.dashboardNote) await this.plugin.createDashboard({ open: false });
				}),
			);
		}
	}

	private renderSyncSection(containerEl: HTMLElement): void {
		const { settings } = this.plugin;
		const card = this.group(containerEl, 'Sync');

		new Setting(card)
			.setName('Sync interval (hours)')
			.setDesc(
				'AUTO-SYNC: Obsidian checks once at startup and syncs if the last successful sync is older than this. Default 20. This is NOT a background scheduler: sync never runs while Obsidian is closed.',
			)
			.addText((text) =>
				text.setPlaceholder('20').setValue(String(settings.syncIntervalHours)).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed) && parsed > 0) {
						settings.syncIntervalHours = parsed;
						await this.plugin.saveSettings();
					}
				}),
			);

		new Setting(card)
			.setName('Quota soft limit (units/day)')
			.setDesc(
				'Soft warning threshold for YouTube API quota per sync run (list calls cost 1 unit each; default limit is 10,000/day).',
			)
			.addText((text) =>
				text
					.setPlaceholder('8000')
					.setValue(String(settings.quotaSoftLimit))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed >= 0) {
							settings.quotaSoftLimit = parsed;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(card)
			.setName('Sync now')
			.setDesc('Fetch subscriptions and tracked playlists, then refresh the notes immediately.')
			.addButton((button) =>
				button.setButtonText('Sync now').setCta().onClick(() => {
					void this.plugin.syncNow();
				}),
			);

		new Setting(card)
			.setName('Security')
			.setDesc('Read how Lifeline stores your credentials and what data leaves your machine.')
			.addButton((button) =>
				button.setButtonText('Open security notes').onClick(() => {
					window.open(SECURITY_URL, '_blank');
				}),
			);
	}
}

/** Human-readable message for auth/catalog failures shown in notices. */
export function authErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
