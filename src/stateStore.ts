/**
 * Persistence for Lifeline's sync state.
 *
 * State lives in a `state/` folder beside data.json, split by concern:
 * channels, playlists, the channel-face cache, the last-sync bookkeeping, and
 * the purged archive. The split keeps a corrupt or truncated file from taking
 * the whole backup with it, and it lets a Shorts checkpoint rewrite only the
 * playlists instead of every field.
 *
 * The folder is not vault-indexed (the plugin folder never is), so nothing
 * here appears in search or Dataview. No file holds a secret.
 */
import { normalizePath, type DataAdapter } from 'obsidian';
import {
	createDefaultState,
	type ChannelFace,
	type ChannelRecord,
	type LastSyncInfo,
	type PlaylistRecord,
	type SyncState,
	type VideoRecord,
} from './types';
import {
	createDefaultPurgedState,
	type PurgedPlaylist,
	type PurgedState,
} from './purgedState';

export const STATE_FOLDER = 'state';

export const STATE_FILE = {
	channels: 'channels.json',
	playlists: 'playlists.json',
	faces: 'faces.json',
	runtime: 'runtime.json',
	purged: 'purged.json',
} as const;

const LEGACY_STATE_FILE = 'state.json';
const LEGACY_PURGED_FILE = 'state_purged.json';

/**
 * Sync stays paused while this is set: a missing playlists file after the
 * folder was initialized is not a fresh install, it is a lost backup. Delete
 * state/runtime.json to accept a fresh start.
 */
export const MISSING_BACKUP_WARNING =
	'Lifeline could not find state/playlists.json, so sync is paused to avoid replacing your backup. ' +
	'Restore the file, or delete state/runtime.json and reload Obsidian to start a new backup.';

export interface StateLoadResult {
	state: SyncState;
	purged: PurgedState;
	/** Set when a required state file is missing but the folder was initialized. */
	warning: string | null;
}

interface ReadOutcome<T> {
	status: 'ok' | 'missing' | 'corrupt';
	value?: T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parseVersion(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

function toChannels(value: unknown): Record<string, ChannelRecord> | null {
	const source = asRecord(value);
	if (!source) return null;
	const channels: Record<string, ChannelRecord> = {};
	for (const [id, entry] of Object.entries(source)) {
		if (asRecord(entry)) channels[id] = entry as ChannelRecord;
	}
	return channels;
}

function toPlaylists(value: unknown): Record<string, PlaylistRecord> | null {
	const source = asRecord(value);
	if (!source) return null;
	const playlists: Record<string, PlaylistRecord> = {};
	for (const [id, entry] of Object.entries(source)) {
		const record = asRecord(entry);
		const videos = record ? asRecord(record.videos) : null;
		if (!record || !videos) continue;
		const parsed: PlaylistRecord = {
			title: typeof record.title === 'string' ? record.title : id,
			fileName: typeof record.fileName === 'string' ? record.fileName : id,
			videos: videos as Record<string, VideoRecord>,
		};
		if (record.saved === true) parsed.saved = true;
		if (typeof record.addedOn === 'string') parsed.addedOn = record.addedOn;
		playlists[id] = parsed;
	}
	return playlists;
}

function toFaces(value: unknown): Record<string, ChannelFace> | null {
	const source = asRecord(value);
	if (!source) return null;
	const faces: Record<string, ChannelFace> = {};
	for (const [id, entry] of Object.entries(source)) {
		const face = asRecord(entry);
		if (!face) continue;
		faces[id] = {
			title: typeof face.title === 'string' ? face.title : '',
			avatar: typeof face.avatar === 'string' ? face.avatar : '',
		};
	}
	return faces;
}

function toLastSync(value: unknown): LastSyncInfo | null {
	const record = asRecord(value);
	if (!record || typeof record.at !== 'number') return null;
	return record as unknown as LastSyncInfo;
}

function parseChannelsFile(raw: unknown): Record<string, ChannelRecord> | null {
	const file = asRecord(raw);
	return file ? toChannels(file.channels) : null;
}

function parsePlaylistsFile(raw: unknown): Record<string, PlaylistRecord> | null {
	const file = asRecord(raw);
	return file ? toPlaylists(file.playlists) : null;
}

function parseFacesFile(raw: unknown): Record<string, ChannelFace> | null {
	const file = asRecord(raw);
	return file ? toFaces(file.faces) : null;
}

interface RuntimeData {
	lastSync: LastSyncInfo | null;
	lastSuccessAt: number | null;
}

function parseRuntimeFile(raw: unknown): RuntimeData | null {
	const file = asRecord(raw);
	if (!file) return null;
	return {
		lastSync: toLastSync(file.lastSync),
		lastSuccessAt: typeof file.lastSuccessAt === 'number' ? file.lastSuccessAt : null,
	};
}

function parsePurgedFile(raw: unknown): PurgedState | null {
	const file = asRecord(raw);
	const source = file ? asRecord(file.playlists) : null;
	if (!source) return null;
	const playlists: Record<string, PurgedPlaylist> = {};
	for (const [playlistId, entry] of Object.entries(source)) {
		const record = asRecord(entry);
		const videos = record ? asRecord(record.videos) : null;
		if (!record || !videos) continue;
		const parsedVideos: Record<string, VideoRecord> = {};
		for (const [videoId, video] of Object.entries(videos)) {
			if (asRecord(video)) parsedVideos[videoId] = video as VideoRecord;
		}
		playlists[playlistId] = {
			title: typeof record.title === 'string' ? record.title : playlistId,
			fileName: typeof record.fileName === 'string' ? record.fileName : playlistId,
			videos: parsedVideos,
		};
	}
	return { version: 1, playlists };
}

function parseLegacyState(raw: unknown): SyncState | null {
	const file = asRecord(raw);
	if (!file) return null;
	return {
		version: parseVersion(file.version),
		channels: toChannels(file.channels) ?? {},
		faces: toFaces(file.faces) ?? {},
		playlists: toPlaylists(file.playlists) ?? {},
		lastSync: toLastSync(file.lastSync),
		lastSuccessAt: typeof file.lastSuccessAt === 'number' ? file.lastSuccessAt : null,
	};
}

function stamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

export class StateStore {
	constructor(
		private readonly adapter: DataAdapter,
		private readonly pluginDir: string,
	) {}

	get folder(): string {
		return normalizePath(`${this.pluginDir}/${STATE_FOLDER}`);
	}

	private path(fileName: string): string {
		return normalizePath(`${this.folder}/${fileName}`);
	}

	private legacyPath(fileName: string): string {
		return normalizePath(`${this.pluginDir}/${fileName}`);
	}

	/**
	 * Read every group, migrating the old single state.json once when the
	 * folder has not been initialized yet. A missing group file falls back to
	 * the legacy content while it is still present, so a half-written migration
	 * never loses the archive.
	 */
	async load(): Promise<StateLoadResult> {
		await this.migrateLegacy();

		const [runtime, channels, playlists, faces, purged] = await Promise.all([
			this.read(STATE_FILE.runtime, parseRuntimeFile),
			this.read(STATE_FILE.channels, parseChannelsFile),
			this.read(STATE_FILE.playlists, parsePlaylistsFile),
			this.read(STATE_FILE.faces, parseFacesFile),
			this.read(STATE_FILE.purged, parsePurgedFile),
		]);

		const legacy = await this.readLegacyState();
		const fallback = createDefaultState();
		const state: SyncState = {
			version: legacy?.version ?? fallback.version,
			channels: channels.status === 'ok' ? (channels.value ?? {}) : (legacy?.channels ?? {}),
			faces: faces.status === 'ok' ? (faces.value ?? {}) : (legacy?.faces ?? {}),
			playlists: playlists.status === 'ok' ? (playlists.value ?? {}) : (legacy?.playlists ?? {}),
			lastSync:
				runtime.status === 'ok' ? (runtime.value?.lastSync ?? null) : (legacy?.lastSync ?? null),
			lastSuccessAt:
				runtime.status === 'ok'
					? (runtime.value?.lastSuccessAt ?? null)
					: (legacy?.lastSuccessAt ?? null),
		};

		const initialized = runtime.status === 'ok';
		const warning = initialized && playlists.status === 'missing' ? MISSING_BACKUP_WARNING : null;

		return {
			state,
			purged: purged.status === 'ok' ? (purged.value ?? createDefaultPurgedState()) : await this.loadLegacyPurged(),
			warning,
		};
	}

	/** Read only the archive, so a run can pick up an external wipe or edit. */
	async loadPurged(): Promise<PurgedState> {
		const outcome = await this.read(STATE_FILE.purged, parsePurgedFile);
		if (outcome.status === 'ok') return outcome.value ?? createDefaultPurgedState();
		return this.loadLegacyPurged();
	}

	private async loadLegacyPurged(): Promise<PurgedState> {
		const outcome = await this.readLegacy(LEGACY_PURGED_FILE, parsePurgedFile);
		return outcome ?? createDefaultPurgedState();
	}

	private async readLegacyState(): Promise<SyncState | null> {
		return this.readLegacy(LEGACY_STATE_FILE, parseLegacyState);
	}

	private async readLegacy<T>(
		fileName: string,
		parse: (raw: unknown) => T | null,
	): Promise<T | null> {
		const path = this.legacyPath(fileName);
		if (!(await this.adapter.exists(path))) return null;
		const outcome = await this.readFile(path, parse);
		return outcome.status === 'ok' ? (outcome.value ?? null) : null;
	}

	/**
	 * One-time move from the single state.json and state_purged.json files.
	 * Runtime is written last and acts as the commit marker: until it lands, a
	 * later startup re-runs the migration instead of treating a partial result
	 * as the truth.
	 */
	private async migrateLegacy(): Promise<void> {
		const statePath = this.legacyPath(LEGACY_STATE_FILE);
		const initialized = await this.adapter.exists(this.path(STATE_FILE.runtime));
		if (!initialized && (await this.adapter.exists(statePath))) {
			const legacy = await this.readFile(statePath, parseLegacyState);
			if (legacy.status === 'ok' && legacy.value) {
				try {
					await this.writeChannels(legacy.value);
					await this.writePlaylists(legacy.value);
					await this.writeFaces(legacy.value);
					await this.writeRuntime(legacy.value);
					await this.retire(statePath, LEGACY_STATE_FILE);
				} catch (err) {
					console.error('Lifeline: could not migrate state.json, will retry on the next launch', err);
				}
			} else if (legacy.status === 'corrupt') {
				// The unreadable copy was preserved by readFile; move it aside so
				// every launch does not preserve another copy of the same bytes.
				await this.retire(statePath, LEGACY_STATE_FILE);
			}
		}

		const purgedPath = this.legacyPath(LEGACY_PURGED_FILE);
		const purgedInitialized = await this.adapter.exists(this.path(STATE_FILE.purged));
		if (purgedInitialized || !(await this.adapter.exists(purgedPath))) return;
		const legacyPurged = await this.readFile(purgedPath, parsePurgedFile);
		if (legacyPurged.status === 'ok' && legacyPurged.value) {
			try {
				await this.writePurged(legacyPurged.value);
				await this.retire(purgedPath, LEGACY_PURGED_FILE);
			} catch (err) {
				console.error('Lifeline: could not migrate state_purged.json, will retry on the next launch', err);
			}
		} else if (legacyPurged.status === 'corrupt') {
			await this.retire(purgedPath, LEGACY_PURGED_FILE);
		}
	}

	async saveChannels(state: SyncState): Promise<void> {
		try {
			await this.writeChannels(state);
		} catch (err) {
			console.error('Lifeline: could not write state/channels.json', err);
		}
	}

	async savePlaylists(state: SyncState): Promise<void> {
		try {
			await this.writePlaylists(state);
		} catch (err) {
			console.error('Lifeline: could not write state/playlists.json', err);
		}
	}

	async saveFaces(state: SyncState): Promise<void> {
		try {
			await this.writeFaces(state);
		} catch (err) {
			console.error('Lifeline: could not write state/faces.json', err);
		}
	}

	async saveRuntime(state: SyncState): Promise<void> {
		try {
			await this.writeRuntime(state);
		} catch (err) {
			console.error('Lifeline: could not write state/runtime.json', err);
		}
	}

	/** Persist every live group. One group failing never skips the others. */
	async saveAll(state: SyncState): Promise<void> {
		await this.saveChannels(state);
		await this.savePlaylists(state);
		await this.saveFaces(state);
		await this.saveRuntime(state);
	}

	/** Persist the archive. Throws so purge/restore can refuse to half-apply. */
	async savePurged(purged: PurgedState): Promise<void> {
		await this.writePurged(purged);
	}

	private async writeChannels(state: SyncState): Promise<void> {
		await this.ensureFolder();
		await this.adapter.write(
			this.path(STATE_FILE.channels),
			JSON.stringify({ version: state.version, channels: state.channels }, null, '\t'),
		);
	}

	private async writePlaylists(state: SyncState): Promise<void> {
		await this.ensureFolder();
		await this.adapter.write(
			this.path(STATE_FILE.playlists),
			JSON.stringify({ version: state.version, playlists: state.playlists }, null, '\t'),
		);
	}

	private async writeFaces(state: SyncState): Promise<void> {
		await this.ensureFolder();
		await this.adapter.write(
			this.path(STATE_FILE.faces),
			JSON.stringify({ version: state.version, faces: state.faces }, null, '\t'),
		);
	}

	private async writeRuntime(state: SyncState): Promise<void> {
		await this.ensureFolder();
		await this.adapter.write(
			this.path(STATE_FILE.runtime),
			JSON.stringify(
				{ version: state.version, lastSync: state.lastSync, lastSuccessAt: state.lastSuccessAt },
				null,
				'\t',
			),
		);
	}

	private async writePurged(purged: PurgedState): Promise<void> {
		await this.ensureFolder();
		await this.adapter.write(this.path(STATE_FILE.purged), JSON.stringify(purged, null, '\t'));
	}

	private async ensureFolder(): Promise<void> {
		const folder = this.folder;
		if (!(await this.adapter.exists(folder))) await this.adapter.mkdir(folder);
	}

	private async retire(path: string, fileName: string): Promise<void> {
		const target = this.legacyPath(`${fileName}.migrated-${stamp()}`);
		try {
			await this.adapter.rename(path, target);
		} catch (err) {
			// The folder is authoritative now, so a failed rename only leaves a
			// stale copy behind; it is never read again.
			console.error(`Lifeline: could not move ${fileName} aside`, err);
		}
	}

	private async read<T>(fileName: string, parse: (raw: unknown) => T | null): Promise<ReadOutcome<T>> {
		return this.readFile(this.path(fileName), parse);
	}

	/**
	 * Read one JSON file. A corrupt file has its raw text copied beside it
	 * before defaults are used, so the next save cannot overwrite the only
	 * surviving copy of the data.
	 */
	private async readFile<T>(
		path: string,
		parse: (raw: unknown) => T | null,
	): Promise<ReadOutcome<T>> {
		let raw: string;
		try {
			if (!(await this.adapter.exists(path))) return { status: 'missing' };
			raw = await this.adapter.read(path);
		} catch (err) {
			console.error(`Lifeline: could not read ${path}`, err);
			return { status: 'corrupt' };
		}
		try {
			const value = parse(JSON.parse(raw) as unknown);
			if (value === null) throw new Error('unexpected shape');
			return { status: 'ok', value };
		} catch (err) {
			console.error(`Lifeline: could not parse ${path}, starting with defaults`, err);
			try {
				await this.adapter.write(`${path}.corrupt-${stamp()}`, raw);
			} catch (copyErr) {
				console.error(`Lifeline: could not preserve the corrupt copy of ${path}`, copyErr);
			}
			return { status: 'corrupt' };
		}
	}
}
