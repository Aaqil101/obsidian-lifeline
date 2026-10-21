/**
 * Sync log storage and quota math.
 *
 * The log is a JSON file (sync-log.json) in the plugin data folder, holding
 * one entry per run, newest first, capped so it never grows unbounded. It
 * cannot live in the vault because .obsidian dot-folders are not indexed.
 *
 * Entries reuse the SyncRunResult shape the rest of the plugin already
 * produces, so no separate record type or serialization layer is needed.
 *
 * The legacy sync-log.md is never parsed or migrated; it is only deleted.
 */
import type { DataAdapter } from 'obsidian';
import type { SyncRunResult } from './types';

/** One persisted run. Alias of SyncRunResult; the log stores it verbatim. */
export type SyncLogEntry = SyncRunResult;

/** YouTube Data API quota resets at midnight Pacific Time each day. */
const QUOTA_RESET_TIME_ZONE = 'America/Los_Angeles';

/** Most recent runs kept on disk; older entries are dropped on append. */
export const SYNC_LOG_MAX_ENTRIES = 200;

/** On-disk envelope; the version lets the shape evolve without ambiguity. */
interface SyncLogFile {
	version: number;
	runs: SyncLogEntry[];
}

const CURRENT_FILE_VERSION = 1;

/**
 * Read the log, newest first. Returns [] when the file is missing or
 * unparseable so a corrupt log never breaks the viewer.
 */
export async function readSyncLog(adapter: DataAdapter, path: string): Promise<SyncLogEntry[]> {
	if (!(await adapter.exists(path))) return [];
	try {
		const parsed = JSON.parse(await adapter.read(path)) as Partial<SyncLogFile>;
		const runs = Array.isArray(parsed.runs) ? parsed.runs : [];
		return runs.filter(isSyncLogEntry);
	} catch (err) {
		console.warn('Lifeline: could not read sync-log.json, treating as empty', err);
		return [];
	}
}

/** Prepend a run (newest first), enforce the cap, and persist atomically. */
export async function appendSyncLogRun(
	adapter: DataAdapter,
	path: string,
	entry: SyncLogEntry,
): Promise<void> {
	const existing = await readSyncLog(adapter, path);
	const runs = [entry, ...existing].slice(0, SYNC_LOG_MAX_ENTRIES);
	const file: SyncLogFile = { version: CURRENT_FILE_VERSION, runs };
	await adapter.write(path, JSON.stringify(file, null, '\t'));
}

/**
 * Total quota units consumed since the most recent Pacific-midnight reset,
 * across every run that falls on the current quota day. Each entry's
 * quotaUnits is the total for that single run, so we sum them.
 */
export function quotaUsedToday(entries: readonly SyncLogEntry[], now: Date = new Date()): number {
	const dayStart = pacificDayStartMs(now);
	return entries.reduce(
		(total, entry) => (entry.startedAt >= dayStart ? total + entry.quotaUnits : total),
		0,
	);
}

/** Structural guard so a corrupt entry can't crash the viewer. */
function isSyncLogEntry(value: unknown): value is SyncLogEntry {
	const entry = value as Partial<SyncLogEntry> | null;
	return (
		!!entry &&
		typeof entry === 'object' &&
		typeof entry.startedAt === 'number' &&
		(entry.status === 'ok' || entry.status === 'warn' || entry.status === 'error') &&
		typeof entry.quotaUnits === 'number' &&
		Array.isArray(entry.errors)
	);
}

/**
 * Epoch ms of the most recent midnight in Pacific Time. Uses Intl so the
 * correct PST/PDT offset is applied without a timezone dependency.
 */
function pacificDayStartMs(now: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: QUOTA_RESET_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(now);
	const get = (type: string): number =>
		Number(parts.find((part) => part.type === type)?.value ?? '0');
	// hour12: false can render midnight as hour "24"; normalize to 0.
	const hour = get('hour') % 24;
	const secondsIntoDay = hour * 3600 + get('minute') * 60 + get('second');
	return now.getTime() - secondsIntoDay * 1000 - now.getMilliseconds();
}

/** Best-effort removal of a stale pre-JSON sync-log.md. Never throws. */
export async function removeLegacySyncLog(adapter: DataAdapter, path: string): Promise<void> {
	try {
		if (await adapter.exists(path)) await adapter.remove(path);
	} catch (err) {
		console.warn('Lifeline: could not remove legacy sync-log.md', err);
	}
}
