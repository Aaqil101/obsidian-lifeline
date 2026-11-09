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
import { listOwnedPlaylists, listPlaylistsByIds, listSubscriptions, QuotaTracker } from './youtubeApi';
import { isSystemPlaylistId } from './systemPlaylists';
import {
	DEFAULT_SETTINGS,
	LifelineSettingTab,
	expandLegacyLayout,
	normalizeRemovedMode,
	normalizeRemovedOverrides,
	normalizeStoredLayouts,
	type LifelineSettings,
} from './settings';
import { SyncError, type SyncRunResult, type SyncState } from './types';
import { migratePurgedFlags, pruneReturnedVideos, type PurgedState } from './purgedState';
import { StateStore } from './stateStore';

/** Delay before the startup auto-sync check fires, so the vault can settle. */
const AUTO_SYNC_DELAY_MS = 15_000;

export default class LifelinePlugin extends Plugin {
	settings!: LifelineSettings;
	state!: SyncState;
	/** Purged-video archive (state/purged.json), kept out of the live backup. */
	purgedState!: PurgedState;
	/** Set when the backup is incomplete; sync refuses to overwrite it. */
	stateLoadError: string | null = null;
	stateStore!: StateStore;
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
		this.settings.videoFields = {
			...DEFAULT_SETTINGS.videoFields,
			...(loaded?.videoFields ?? {}),
		};
		this.settings.dashboardSections = {
			...DEFAULT_SETTINGS.dashboardSections,
			...(loaded?.dashboardSections ?? {}),
		};
		// Removed-video modes: an unknown stored value falls back to the
		// default, and override keys that are not real modes are dropped. Both
		// are new keys, so an ordinary load writes nothing.
		const storedRemovedMode = this.settings.removedVideosMode;
		const storedRemovedOverrides = this.settings.removedVideoOverrides;
		this.settings.removedVideosMode = normalizeRemovedMode(storedRemovedMode);
		this.settings.removedVideoOverrides = normalizeRemovedOverrides(storedRemovedOverrides);
		const removedSettingsChanged =
			this.settings.removedVideosMode !== storedRemovedMode ||
			Object.keys(this.settings.removedVideoOverrides).length !==
				Object.keys(storedRemovedOverrides ?? {}).length ||
			Object.entries(this.settings.removedVideoOverrides).some(
				([id, mode]) => storedRemovedOverrides?.[id] !== mode,
			);
		// Persist the migrations once, and only when a legacy or retired key was
		// actually found. Startup stays read-only on every other load, and the
		// stale noteTables and noteLayout keys are purged from data.json instead
		// of waiting for some later settings change to happen to write them out.
		if (hadLegacyTables || hadStaleLayout || normalizedLayouts || removedSettingsChanged) await this.saveSettings();
		this.stateStore = new StateStore(
			this.app.vault.adapter,
			this.manifest.dir ?? `${this.app.vault.configDir}/plugins/lifeline`,
		);
		const loadedState = await this.stateStore.load();
		this.state = loadedState.state;
		this.purgedState = loadedState.purged;
		this.stateLoadError = loadedState.warning;
		// Earlier builds kept purged records in state.json with a flag. Move
		// them to the archive once, and drop any archive copy that is active
		// again, so a stale duplicate never counts twice.
		const migratedPurged = migratePurgedFlags(this.purgedState, this.state);
		const prunedPurged = pruneReturnedVideos(this.purgedState, this.state);
		if (migratedPurged) await this.savePlaylists();
		if (migratedPurged || prunedPurged) {
			try {
				await this.savePurgedState();
			} catch (err) {
				console.error('Lifeline: could not write state/purged.json', err);
			}
		}
		if (this.stateLoadError) new Notice(this.stateLoadError, 15000);
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

	/** Fetch the playlist catalog (owned, saved, and imported ids) and adopt it. */
	async fetchPlaylistCatalog(): Promise<void> {
		const quota = new QuotaTracker(this.settings.quotaSoftLimit);
		// Saved playlists ride on subscriptions.list, the same call that feeds
		// Channels.md, so the refresh gains them for one extra quota unit.
		const [owned, { savedPlaylists }] = await Promise.all([
			listOwnedPlaylists(this.auth, quota),
			listSubscriptions(this.auth, quota),
		]);
		let playlists = mergeCatalog(owned.playlists, savedPlaylists);

		// Imported ids appear in neither list. Sync resolves them by id, so a
		// refresh that skipped that step would drop every imported saved playlist
		// the last sync adopted into "Not resolved yet". Resolve them here too.
		const catalogIds = new Set(playlists.map((playlist) => playlist.id));
		const unresolved = (this.settings.importedPlaylistIds ?? []).filter(
			(id) => !catalogIds.has(id) && !isSystemPlaylistId(id),
		);
		if (unresolved.length > 0) {
			try {
				playlists = mergeCatalog(
					playlists,
					await listPlaylistsByIds(unresolved, this.auth, quota, owned.ownerChannelId),
				);
			} catch {
				// A failed metadata call must not demote those ids to "Not resolved
				// yet": keep what the previous catalog knew about them.
				const resolved = new Set(playlists.map((playlist) => playlist.id));
				playlists = [
					...playlists,
					...this.settings.playlistCatalog.filter(
						(playlist) => unresolved.includes(playlist.id) && !resolved.has(playlist.id),
					),
				];
			}
		}
		await adoptCatalog(this, playlists);
	}

	/**
	 * Write Dashboard.md from current state and open it. Shared by the
	 * create-dashboard command, the settings toggle-on, and the sub-page
	 * refresh icon. The Dataview gate runs first (the same check the settings
	 * toggle does) so a missing Dataview always yields the same Notice.
	 */
	async createDashboard(options?: { open?: boolean }): Promise<boolean> {
		if (this.stateLoadError) {
			new Notice(this.stateLoadError, 15000);
			return false;
		}
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
			new Notice(err instanceof SyncError ? err.message : 'Could not write the dashboard note.');
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

	/** Plugin data folder (next to data.json): holds sync-log.json, never secrets. */
	private pluginDataPath(fileName: string): string {
		const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/lifeline`;
		return normalizePath(`${pluginDir}/${fileName}`);
	}

	/** Sync log path: JSON run history written by sync.ts, shown by the log modal. */
	syncLogPath(): string {
		return this.pluginDataPath('sync-log.json');
	}

	// State persistence delegates to StateStore, which owns the state/ folder.
	// Each save swallows and logs its own failure so a bad write never aborts a
	// sync; the archive save throws on purpose so purge/restore can refuse to
	// half-apply.

	async savePlaylists(): Promise<void> {
		await this.stateStore.savePlaylists(this.state);
	}

	async saveAll(): Promise<void> {
		await this.stateStore.saveAll(this.state);
	}

	async savePurgedState(): Promise<void> {
		await this.stateStore.savePurged(this.purgedState);
	}

	/** Re-read the archive from disk, picking up an external wipe or edit. */
	async reloadPurgedState(): Promise<void> {
		this.purgedState = await this.stateStore.loadPurged();
	}
}
