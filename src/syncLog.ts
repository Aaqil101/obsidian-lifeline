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
 * Total quota units consumed since the most recent Pacific-midnight reset:
 * exactly the window YouTube counts against its daily limit. Each entry's
 * quotaUnits is that single run's total, so we sum the ones inside the
 * window and ignore runs from the closed day.
 */
export function quotaUsedSinceReset(
	entries: readonly SyncLogEntry[],
	now: Date = new Date(),
): number {
	const dayStart = pacificDayStartMs(now);
	return entries.reduce(
		(total, entry) => (entry.startedAt >= dayStart ? total + entry.quotaUnits : total),
		0,
	);
}

/**
 * The next 00:00 Pacific Time after `now`: the instant YouTube's daily quota
 * resets. Returned as a Date so callers can format it in the user's own time
 * zone (which is often midday: Pacific midnight is noon in UTC+5:30). The
 * target is the following Pacific calendar day's midnight (Pacific days run
 * 23 to 25 hours across DST changes, so adding 24h blindly can land an hour
 * off); its epoch ms comes from the zone offset at that wall-clock time,
 * refined once so a value guessed across a DST boundary still lands on the
 * real reset.
 */
export function nextQuotaReset(now: Date = new Date()): Date {
	const { year, month, day } = pacificParts(now);
	const wallClock = Date.UTC(year, month - 1, day + 1);
	const firstGuess = wallClock - pacificOffsetMs(new Date(wallClock));
	return new Date(wallClock - pacificOffsetMs(new Date(firstGuess)));
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
 * Epoch ms of the most recent midnight in Pacific Time: the start of the
 * window YouTube counts as one quota day. Uses Intl so the correct PST/PDT
 * offset is applied without a timezone dependency.
 */
function pacificDayStartMs(now: Date): number {
	const { hour, minute, second } = pacificParts(now);
	const secondsIntoDay = hour * 3600 + minute * 60 + second;
	return now.getTime() - secondsIntoDay * 1000 - now.getMilliseconds();
}

/** Pacific offset from UTC at an instant, in ms (negative west of Greenwich). */
function pacificOffsetMs(instant: Date): number {
	const { year, month, day, hour, minute, second } = pacificParts(instant);
	const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
	// Compare whole seconds: the parts carry no milliseconds.
	return wallClock - (instant.getTime() - instant.getMilliseconds());
}

/** Wall-clock fields of an instant as seen in the Pacific time zone. */
function pacificParts(instant: Date): {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
} {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: QUOTA_RESET_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(instant);
	const get = (type: string): number =>
		Number(parts.find((part) => part.type === type)?.value ?? '0');
	return {
		year: get('year'),
		month: get('month'),
		day: get('day'),
		// hour12: false can render midnight as hour "24"; normalize to 0.
		hour: get('hour') % 24,
		minute: get('minute'),
		second: get('second'),
	};
}

/** Best-effort removal of a stale pre-JSON sync-log.md. Never throws. */
export async function removeLegacySyncLog(adapter: DataAdapter, path: string): Promise<void> {
	try {
		if (await adapter.exists(path)) await adapter.remove(path);
	} catch (err) {
		console.warn('Lifeline: could not remove legacy sync-log.md', err);
	}
}
