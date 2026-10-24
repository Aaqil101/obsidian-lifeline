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
import { readSyncLog, removeLegacySyncLog } from './syncLog';
import { adoptCatalog, mergeCatalog, runSync, writeDashboardNote } from './sync';
import { listOwnedPlaylists, listSubscriptions, QuotaTracker } from './youtubeApi';
import {
	DEFAULT_JOURNAL_FOLDER,
	DEFAULT_SETTINGS,
	LifelineSettingTab,
	expandLegacyLayout,
	normalizeStoredLayouts,
	type LifelineSettings,
} from './settings';
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
		// Pre-rename key: "noteTables" became "noteViews" when the feature grew
		// layouts. Copy it across so an existing opt-in survives, then drop the
		// stale key so it does not round-trip back into data.json.
		const legacy = loaded as { noteTables?: boolean } | null;
		const hadLegacyTables = legacy?.noteTables !== undefined;
		if (hadLegacyTables && legacy && loaded && loaded.noteViews === undefined) {
			loaded.noteViews = legacy.noteTables;
		}
		if (legacy) delete legacy.noteTables;
		// One `noteLayout` for all three notes became one per note type, so the
		// old value is expanded rather than dropped. Any value the dropdowns no
		// longer offer (mixed, cards, anything unrecognized) expands to the
		// defaults, which are poster for every kind, so the stale key never
		// reaches a renderer. The key is purged here rather than waiting for
		// some later settings change to happen to write it out.
		const staleLayout = loaded as { noteLayout?: unknown } | null;
		const hadStaleLayout = staleLayout?.noteLayout !== undefined;
		const expandedLayout = hadStaleLayout ? expandLegacyLayout(staleLayout?.noteLayout) : null;
		if (staleLayout) delete staleLayout.noteLayout;
		if (expandedLayout && loaded && loaded.noteLayouts === undefined) loaded.noteLayouts = expandedLayout;
		// The journal folder shipped with '' meaning "the rule is off"; it now
		// always names a folder (the settings row falls back to the default on
		// empty), so a saved empty string is a stale state rather than a
		// choice: fill it with the default once, here, so the row shows it and
		// dated bullets start linking without a settings visit.
		const emptyJournal = loaded?.journalFolder === '';
		if (emptyJournal && loaded) loaded.journalFolder = DEFAULT_JOURNAL_FOLDER;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		// The retired cards layout is the poster card's forerunner, so a stored
		// `cards` is rewritten to poster once here instead of only at render
		// time: the settings rows and the generated scripts then never see a
		// value no dropdown offers. Null means every stored value was already
		// valid, so an ordinary startup still writes nothing.
		const normalizedLayouts = normalizeStoredLayouts(this.settings.noteLayouts);
		if (normalizedLayouts) this.settings.noteLayouts = normalizedLayouts;
		// Per-key merge so field toggles added later still get their defaults.
		this.settings.channelsFields = {
			...DEFAULT_SETTINGS.channelsFields,
			...(loaded?.channelsFields ?? {}),
		};
		this.settings.dashboardSections = {
			...DEFAULT_SETTINGS.dashboardSections,
			...(loaded?.dashboardSections ?? {}),
		};
		// Persist the migrations once, and only when a legacy or retired key was
		// actually found. Startup stays read-only on every other load, and the
		// stale noteTables and noteLayout keys are purged from data.json instead
		// of waiting for some later settings change to happen to write them out.
		if (hadLegacyTables || hadStaleLayout || emptyJournal || normalizedLayouts) await this.saveSettings();
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
		this.addCommand({
			id: 'refresh-dashboard',
			name: 'Refresh dashboard note',
			callback: () => {
				void this.createDashboard({ open: false });
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
		// Clean up a stale pre-JSON text log (best-effort, never blocks viewing).
		await removeLegacySyncLog(adapter, this.pluginDataPath('sync-log.md'));
		try {
			const entries = await readSyncLog(adapter, this.syncLogPath());
			if (entries.length === 0) {
				new Notice('No sync log yet. Run a sync first.');
				return;
			}
			new SyncLogModal(this.app, entries, this.settings.quotaSoftLimit).open();
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

	/** Plugin data folder (next to data.json): holds state.json and sync-log.json, never secrets. */
	private pluginDataPath(fileName: string): string {
		const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/lifeline`;
		return normalizePath(`${pluginDir}/${fileName}`);
	}

	private stateFilePath(): string {
		return this.pluginDataPath('state.json');
	}

	/** Sync log path: JSON run history written by sync.ts, shown by the log modal. */
	syncLogPath(): string {
		return this.pluginDataPath('sync-log.json');
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
