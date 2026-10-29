/**
 * Videos whose thumbnail is kept but drawn blurred until clicked: the ones
 * YouTube flags as age-restricted, plus the ids the user pastes into settings.
 */
import type { PlaylistRecord } from './types';

const VIDEO_ID = /^[\w-]{11}$/;
const VIDEO_URL = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/;

/**
 * Video ids out of pasted text: bare ids or watch, short, shorts, embed, and
 * live links, separated by any whitespace or commas. Unrecognised tokens are
 * dropped rather than stored.
 */
export function parseBlurredVideoIds(text: string): string[] {
	const ids = new Set<string>();
	for (const token of text.split(/[\s,]+/)) {
		if (!token) continue;
		const fromUrl = VIDEO_URL.exec(token);
		if (fromUrl?.[1]) ids.add(fromUrl[1]);
		else if (VIDEO_ID.test(token)) ids.add(token);
	}
	return Array.from(ids);
}

/** Age-restricted ids across every playlist, merged with the manual list. */
export function blurredVideoIds(
	playlists: Record<string, PlaylistRecord>,
	manual: readonly string[],
): Set<string> {
	const blurred = new Set(manual);
	for (const record of Object.values(playlists)) {
		for (const [videoId, video] of Object.entries(record.videos)) {
			if (video.ageRestricted === true) blurred.add(videoId);
		}
	}
	return blurred;
}
