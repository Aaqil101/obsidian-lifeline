/**
 * Lifeline plugin entry point. Lifecycle only: load settings/state, wire
 * commands, ribbon, status bar, and the load-time auto-sync check. All feature
 * logic lives in the other modules (auth, youtubeApi, markdown, sync).
 */
import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { AuthManager } from './auth';
import { DATAVIEW_REQUIRED_NOTICE, isDataviewEnabled } from './dashboard';
import { formatTime } from './markdown';
import { SyncLogModal } from './ui/syncLogModal';
import { adoptCatalog, mergeCatalog, runSync, writeDashboardNote } from './sync';
import { listOwnedPlaylists, listSubscriptions, QuotaTracker } from './youtubeApi';
import { DEFAULT_SETTINGS, LifelineSettingTab, type LifelineSettings } from './settings';
import { createDefaultState, type SyncRunResult, type SyncState } from './types';

/** Delay before the startup auto-sync check fires, so the vault can settle. */
const AUTO_SYNC_DELAY_MS = 15_000;

export default class LifelinePlugin extends Plugin {
	settings!: LifelineSettings;
	state!: SyncState;
	auth!: AuthManager;
	private statusBarItem!: HTMLElement;

	async onload(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<LifelineSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		// Per-key merge so field toggles added later still get their defaults.
		this.settings.channelsFields = {
			...DEFAULT_SETTINGS.channelsFields,
			...(loaded?.channelsFields ?? {}),
		};
		this.settings.dashboardSections = {
			...DEFAULT_SETTINGS.dashboardSections,
			...(loaded?.dashboardSections ?? {}),
		};
		this.state = await this.loadState();
		this.auth = new AuthManager(this);

		this.addSettingTab(new LifelineSettingTab(this.app, this));

		this.addCommand({
			id: 'sync-now',
			name: 'Sync now',
			callback: () => {
				void this.syncNow();
			},
		});
		this.addCommand({
			id: 'open-sync-log',
			name: 'Open sync log',
			callback: () => {
				void this.openSyncLog();
			},
		});
		this.addCommand({
			id: 'create-dashboard',
			name: 'Create dashboard note',
			callback: () => {
				void this.createDashboard();
			},
		});

		this.addRibbonIcon('refresh-cw', 'Sync YouTube backup', () => {
			void this.syncNow();
		});

		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('lifeline-status-bar');
		this.registerDomEvent(this.statusBarItem, 'click', () => {
			void this.openSyncLog();
		});
		this.updateStatusBar();

		this.scheduleAutoSync();
	}

	onunload(): void {
		this.auth.dispose();
	}

	/** Manual sync entry point (command, ribbon, settings button). */
	syncNow(): Promise<SyncRunResult> {
		return runSync(this);
	}

	/** Fetch the playlist catalog (owned + saved) and adopt it into settings. */
	async fetchPlaylistCatalog(): Promise<void> {
		const quota = new QuotaTracker(this.settings.quotaSoftLimit);
		// Saved playlists ride on subscriptions.list, the same call that feeds
		// Channels.md, so the refresh gains them for one extra quota unit.
		const [owned, { savedPlaylists }] = await Promise.all([
			listOwnedPlaylists(this.auth, quota),
			listSubscriptions(this.auth, quota),
		]);
		await adoptCatalog(this, mergeCatalog(owned.playlists, savedPlaylists));
	}

	/**
	 * Write Dashboard.md from current state and open it. Shared by the
	 * create-dashboard command, the settings toggle-on, and the sub-page
	 * refresh icon. The Dataview gate runs first (the same check the settings
	 * toggle does) so a missing Dataview always yields the same Notice.
	 */
	async createDashboard(options?: { open?: boolean }): Promise<boolean> {
		if (!isDataviewEnabled(this.app)) {
			new Notice(DATAVIEW_REQUIRED_NOTICE, 20000);
			return false;
		}
		try {
			const path = await writeDashboardNote(this);
			if (options?.open === false) return true;
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
			return true;
		} catch (err) {
			console.error('Lifeline: could not write dashboard note', err);
			new Notice('Could not write the dashboard note.');
			return false;
		}
	}

	setSyncingIndicator(): void {
		this.statusBarItem.setText('Lifeline: syncing…');
	}

	/** ✓/⚠/✗ + last sync time; full details in the hover tooltip. */
	updateStatusBar(): void {
		const info = this.state.lastSync;
		if (!info) {
			this.statusBarItem.setText('Lifeline: never synced');
			this.statusBarItem.setAttribute('title', 'Lifeline has not synced yet. Select to open the sync log.');
			return;
		}
		const icon = info.status === 'ok' ? '✓' : info.status === 'warn' ? '⚠' : '✗';
		this.statusBarItem.setText(`Lifeline ${icon} ${formatTime(new Date(info.at))}`);
		const details =
			`Channels ${info.channels} · playlists ${info.playlists} · videos ${info.videos}` +
			` · quota ${info.quotaUnits} units${info.errorSummary ? ` · errors: ${info.errorSummary}` : ''}`;
		this.statusBarItem.setAttribute('title', `${details}\nSelect to open the sync log.`);
	}

	async openSyncLog(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const path = this.syncLogPath();
		if (!(await adapter.exists(path))) {
			new Notice('No sync log yet. Run a sync first.');
			return;
		}
		try {
			new SyncLogModal(this.app, await adapter.read(path)).open();
		} catch (err) {
			console.error('Lifeline: could not read sync log', err);
			new Notice('Could not open the sync log.');
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Startup auto-sync check. IMPORTANT: this is NOT a background scheduler;
	 * it fires once per Obsidian launch (after a short delay) and only when the
	 * last successful sync is older than the configured interval. Nothing ever
	 * syncs while Obsidian is closed; manual syncs (command/ribbon) fill the gap.
	 */
	private scheduleAutoSync(): void {
		if (!this.auth.isConnected()) return;
		const intervalMs = this.settings.syncIntervalHours * 60 * 60 * 1000;
		const lastSuccess = this.state.lastSuccessAt ?? 0;
		if (Date.now() - lastSuccess < intervalMs) return;
		const timer = window.setTimeout(() => {
			void this.syncNow();
		}, AUTO_SYNC_DELAY_MS);
		this.register(() => window.clearTimeout(timer));
	}

	/** Plugin data folder (next to data.json): holds state.json and sync-log.md, never secrets. */
	private pluginDataPath(fileName: string): string {
		const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/lifeline`;
		return normalizePath(`${pluginDir}/${fileName}`);
	}

	private stateFilePath(): string {
		return this.pluginDataPath('state.json');
	}

	/** Sync log path: written by sync.ts, shown by the log modal. */
	syncLogPath(): string {
		return this.pluginDataPath('sync-log.md');
	}

	private async loadState(): Promise<SyncState> {
		const fallback = createDefaultState();
		try {
			const adapter = this.app.vault.adapter;
			const path = this.stateFilePath();
			if (!(await adapter.exists(path))) return fallback;
			const parsed = JSON.parse(await adapter.read(path)) as Partial<SyncState>;
			return {
				version: parsed.version ?? fallback.version,
				channels: parsed.channels ?? {},
				playlists: parsed.playlists ?? {},
				lastSync: parsed.lastSync ?? null,
				lastSuccessAt: parsed.lastSuccessAt ?? null,
			};
		} catch (err) {
			console.error('Lifeline: could not read state.json, starting fresh', err);
			return fallback;
		}
	}

	async saveState(): Promise<void> {
		try {
			await this.app.vault.adapter.write(this.stateFilePath(), JSON.stringify(this.state, null, '\t'));
		} catch (err) {
			console.error('Lifeline: could not write state.json', err);
		}
	}
}
