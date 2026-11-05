/**
 * Shorts detection: the one place that decides whether a video is a Short.
 *
 * The YouTube Data API has no Shorts flag, so this module combines the only
 * two sound signals:
 *
 * - `contentDetails.duration` is a ceiling. Nothing longer than 180 seconds
 *   can be a Short, so a long video is answered with no request at all.
 *   Duration is never an answer on its own: 18 of 26 YouTube-labelled Shorts
 *   measured while writing this ran 91-179 seconds, and a 19 second ordinary
 *   video exists.
 * - The watch page's `og:url` (or `canonical`) points at `/shorts/<id>` for a
 *   Short and `/watch?v=<id>` for a regular video. That is one full page
 *   request per candidate, so the caller caps how many a run may make and
 *   caches the answer on the video record.
 *
 * An ambiguous response (no marker, a non-200, a consent or bot page, a
 * timeout) is never guessed: the video stays unclassified and the next sync
 * retries it.
 */
import { requestUrl } from 'obsidian';

/**
 * The duration ceiling: above this a video cannot be a Short, so it is
 * classified without a request. Equal to it is still a candidate.
 */
export const SHORTS_MAX_SECONDS = 180;

/**
 * Page requests one sync run may make, matching STAT_CHUNK_SIZE in
 * youtubeApi.ts. A playlist of 500 short videos then fills in across several
 * syncs instead of pulling hundreds of megabytes in one run.
 */
export const SHORTS_PROBE_LIMIT = 50;

/**
 * Randomized pause between two probes, on top of the page's own response time.
 * A page lands in about 0.8s here, so the gap holds the pace near one request a
 * second instead of a back-to-back burst. It costs a few seconds per run and
 * makes the traffic look like ordinary browsing, which matters because a
 * throttled or captcha page reads as unknown and has to be retried later.
 */
export const SHORTS_PROBE_MIN_GAP_MS = 150;
export const SHORTS_PROBE_MAX_GAP_MS = 400;

/** Per-page budget, so one stalled host cannot hold the run. */
export const SHORTS_PROBE_TIMEOUT_MS = 15_000;

/**
 * Version of the `videos.list` metadata a record carries. Absent means "never
 * fetched", so an upgraded state.json refills once; #33 bumps this when it
 * widens the same call, and the sentinel then refills every record again
 * without a second migration.
 */
export const VIDEO_META_VERSION = 1;

/** What one probe could tell us. `unknown` is retried, never guessed. */
export type ShortsVerdict = 'short' | 'video' | 'unknown';

/**
 * Whole seconds from an ISO 8601 video duration (`PT1H2M3S`, `PT179S`).
 * Returns null for a missing, malformed, or zero-length value: a live stream
 * and an upcoming premiere report `P0D`, which is not a length, so those stay
 * unclassified rather than being read as zero seconds (which would make every
 * premiere a Short).
 */
export function parseIsoDuration(value: string): number | null {
	const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim());
	if (!match) return null;
	const days = Number(match[1] ?? 0);
	const hours = Number(match[2] ?? 0);
	const minutes = Number(match[3] ?? 0);
	const seconds = Number(match[4] ?? 0);
	const total = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
	return total > 0 ? Math.round(total) : null;
}

/**
 * Whether a known duration clears the ceiling, inclusive at 180 seconds. The
 * duration-only choice answers every candidate with this; Confirm uses it only
 * to skip the request, never as the answer.
 */
export function withinShortsCeiling(seconds: number): boolean {
	return seconds <= SHORTS_MAX_SECONDS;
}

/** A random pause for the gap between two probes, inclusive of both bounds. */
export function probeGapMs(): number {
	const span = SHORTS_PROBE_MAX_GAP_MS - SHORTS_PROBE_MIN_GAP_MS + 1;
	return SHORTS_PROBE_MIN_GAP_MS + Math.floor(Math.random() * span);
}

/** One attribute of an HTML tag, or '' when absent. */
function attr(tag: string, name: string): string {
	const match = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
	return match ? (match[1] ?? '') : '';
}

/**
 * The page's own URL as it declares it: og:url first, canonical second. The
 * attribute order inside the tag is not assumed; every candidate tag is
 * inspected. '' when neither declares one.
 */
export function readShortsUrl(html: string): string {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		if (attr(tag, 'property').toLowerCase() !== 'og:url') continue;
		const content = attr(tag, 'content').trim();
		if (content) return content;
	}
	for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
		if (attr(tag, 'rel').toLowerCase() !== 'canonical') continue;
		const href = attr(tag, 'href').trim();
		if (href) return href;
	}
	return '';
}

/**
 * Classify one watch page by the URL it declares. A `/shorts/` path is a
 * Short, a `v=` query is a regular video; anything else (including a consent
 * or bot page, which declares nothing) is unknown.
 */
export function classifyWatchPage(html: string): ShortsVerdict {
	const url = readShortsUrl(html);
	if (!url) return 'unknown';
	if (/\/shorts\//.test(url)) return 'short';
	if (/[?&]v=/.test(url)) return 'video';
	return 'unknown';
}

/**
 * Fetch the watch page and classify it. Never throws: a network failure, a
 * timeout, or a non-200 all come back as `unknown` so the caller can leave
 * the video unclassified and retry it on a later run.
 */
export async function probeShorts(videoId: string): Promise<ShortsVerdict> {
	let timer: number | undefined;
	// requestUrl takes no AbortSignal, so the timeout races the request and a
	// stalled host is abandoned rather than cancelled. window.* so the timer
	// belongs to the active window (Obsidian popouts included).
	const timeout = new Promise<never>((_, reject) => {
		timer = window.setTimeout(
			() => reject(new Error(`no response within ${SHORTS_PROBE_TIMEOUT_MS} ms`)),
			SHORTS_PROBE_TIMEOUT_MS,
		);
	});
	try {
		const res = await Promise.race([
			requestUrl({ url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, throw: false }),
			timeout,
		]);
		if (res.status < 200 || res.status >= 300) return 'unknown';
		return classifyWatchPage(res.text);
	} catch {
		return 'unknown';
	} finally {
		window.clearTimeout(timer);
	}
}
