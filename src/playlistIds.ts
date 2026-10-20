/**
 * Saved-playlist ID parsing and the tracked/imported id sets.
 *
 * The Mode 1 textarea parser is deliberately lenient: a JSON array, one id
 * per line, or a mix all parse (quotes, commas, brackets, and URLs are
 * trimmed/extracted). The shape check only *warns* about odd-looking ids;
 * everything non-empty is kept and persisted, per spec. Parsed ids are saved
 * to data.json only, never anywhere else.
 */
import type { LifelineSettings } from './settings';

/** The id shapes YouTube hands out: PL/OLAK5uy_ playlists, UU/FL channel lists. */
const EXPECTED_PREFIX = /^(PL|OLAK5uy_|UU|FL)/;
/** Typical modern id length (~34) and legacy id length (~18), ± tolerance. */
const LONG_ID_RANGE = { min: 32, max: 36 };
const SHORT_ID_RANGE = { min: 16, max: 20 };
/** How many unusual ids the feedback line spells out before "…". */
const MAX_LISTED_UNUSUAL = 5;

export interface PlaylistIdParse {
	/** Deduped ids in first-seen order; unusual shapes included. */
	ids: string[];
	/** Ids kept despite not matching the usual shapes. */
	unusual: string[];
	/** How many valid repeats the input contained. */
	duplicates: number;
}

/** True when an id looks like something YouTube actually issues. */
export function looksLikePlaylistId(id: string): boolean {
	if (EXPECTED_PREFIX.test(id)) return true;
	const longEnough = id.length >= LONG_ID_RANGE.min && id.length <= LONG_ID_RANGE.max;
	const legacyLength = id.length >= SHORT_ID_RANGE.min && id.length <= SHORT_ID_RANGE.max;
	return longEnough || legacyLength;
}

/** Lenient parse: JSON array / one-per-line / mixed input → deduped ids. */
export function parsePlaylistIds(raw: string): PlaylistIdParse {
	const trimmed = raw.trim();
	if (!trimmed) return { ids: [], unusual: [], duplicates: 0 };

	let tokens: string[] | null = null;
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (Array.isArray(parsed)) {
			tokens = parsed.map(scalarToken).filter(nonNull);
		} else if (typeof parsed === 'string' || typeof parsed === 'number') {
			tokens = [String(parsed)];
		} else {
			tokens = []; // JSON object/boolean/null: not an id list
		}
	} catch {
		// Not JSON (or near-JSON with a syntax slip); split leniently below.
	}
	if (tokens === null) tokens = trimmed.split(/[\s,;]+/);

	const ids: string[] = [];
	const seen = new Set<string>();
	let duplicates = 0;
	for (const token of tokens) {
		const id = normalizeToken(token);
		if (!id || seen.has(id)) {
			if (id) duplicates += 1;
			continue;
		}
		seen.add(id);
		ids.push(id);
	}
	return { ids, unusual: ids.filter((id) => !looksLikePlaylistId(id)), duplicates };
}

/** Filter a collector result (Mode 2's `return ids`) to clean string ids. */
export function cleanPlaylistIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	for (const entry of value) {
		if (typeof entry !== 'string') continue;
		const id = entry.trim();
		if (id) seen.add(id);
	}
	return Array.from(seen);
}

/**
 * Persist collected ids: track them, and remember they came from
 * youtube.com/feed/playlists so sync can resolve ids the API list never
 * returns. Returns how many were newly added to the tracked set.
 */
export function addImportedPlaylistIds(settings: LifelineSettings, ids: string[]): number {
	if (ids.length === 0) return 0;
	const tracked = new Set(settings.trackedPlaylists ?? []);
	const imported = new Set(settings.importedPlaylistIds ?? []);
	let added = 0;
	for (const id of ids) {
		if (!tracked.has(id)) {
			tracked.add(id);
			added += 1;
		}
		imported.add(id);
	}
	settings.trackedPlaylists = Array.from(tracked);
	settings.importedPlaylistIds = Array.from(imported);
	return added;
}

/** Stop tracking a collected id and forget its import entry. */
export function removeImportedPlaylistId(settings: LifelineSettings, id: string): void {
	settings.trackedPlaylists = (settings.trackedPlaylists ?? []).filter((t) => t !== id);
	settings.importedPlaylistIds = (settings.importedPlaylistIds ?? []).filter((t) => t !== id);
}

/** Human-readable summary lines for the parse feedback block. */
export function describeParse(
	parse: PlaylistIdParse,
	alreadyTracked: number,
): { countLine: string; warningLine: string | null } {
	const { ids, unusual, duplicates } = parse;
	let countLine = `${ids.length} ID${ids.length === 1 ? '' : 's'} parsed`;
	if (duplicates > 0) countLine += ` · ${duplicates} duplicate${duplicates === 1 ? '' : 's'} removed`;
	const newCount = ids.length - alreadyTracked;
	countLine += alreadyTracked === ids.length ? ' · all already tracked' : ` · ${newCount} new`;

	let warningLine: string | null = null;
	if (unusual.length > 0) {
		const shown = unusual.slice(0, MAX_LISTED_UNUSUAL).join(', ');
		const more = unusual.length > MAX_LISTED_UNUSUAL ? ` +${unusual.length - MAX_LISTED_UNUSUAL} more` : '';
		warningLine = `Kept ${unusual.length} unusual-looking ID${unusual.length === 1 ? '' : 's'}: ${shown}${more}`;
	}
	return { countLine, warningLine };
}

function scalarToken(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

function nonNull(value: string | null): value is string {
	return value !== null;
}

/** Trim quotes/brackets/commas, unwrap playlist URLs, and reduce to an id. */
function normalizeToken(token: string): string {
	let id = token.trim();
	const listParam = /[?&]list=([^&#]+)/.exec(id)?.[1];
	if (listParam) {
		try {
			return decodeURIComponent(listParam).trim();
		} catch {
			return listParam.trim();
		}
	}
	id = id.replace(/^["'`[{(,;]+/, '').replace(/["'`[\])},;]+$/, '').trim();
	return id;
}
