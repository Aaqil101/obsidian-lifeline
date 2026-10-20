/**
 * The saved-playlist collector, as page-context source text.
 *
 * One source string serves both entry points:
 *  - Mode 1 (default): the user pastes it into the DevTools console on
 *    youtube.com/feed/playlists; it logs the JSON array and tries `copy()`.
 *  - Mode 2 (experimental): the plugin evaluates the same source inside the
 *    embedded webview via `executeJavaScript`, whose promise resolves to the
 *    returned id array; this is the `return ids` variant of the script.
 *
 * Behaviour: scroll until the page height is stable for three consecutive
 * reads, collect every `list=` parameter from `a[href*="list="]` links,
 * dedupe in document order, and drop YouTube's system/auto ids
 * (WL = Watch Later, LL = Liked videos, RD* = radio/mix).
 *
 * The script only reads the DOM. It never touches cookies, storage, or
 * credentials, and it must stay that way (Mode 2's webview runs its own
 * session partition, so the page authenticates itself; the plugin never
 * sees any of it).
 */
export const COLLECTOR_SOURCE = `(async function collectLifelineSavedPlaylists() {
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	// Scroll every element that can scroll (the layout has used several
	// containers over the years) and watch the tallest height: it grows while
	// the page lazy-loads more rows, and stops growing at the end.
	let stable = 0;
	let lastHeight = -1;
	for (let tick = 0; stable < 3 && tick < 300; tick++) {
		const candidates = [
			document.scrollingElement,
			document.documentElement,
			document.body,
			document.querySelector('ytd-app'),
			document.querySelector('#page-manager'),
		];
		for (const el of candidates) {
			if (el && el.scrollHeight > el.clientHeight + 10) el.scrollTop = el.scrollHeight;
		}
		await sleep(400);
		let height = 0;
		for (const el of candidates) {
			if (el && el.scrollHeight > height) height = el.scrollHeight;
		}
		if (height === lastHeight) stable += 1;
		else stable = 0;
		lastHeight = height;
	}

	const ids = [];
	const seen = new Set();
	for (const anchor of document.querySelectorAll('a[href*="list="]')) {
		const href = anchor.getAttribute('href') || '';
		const match = /[?&]list=([^&#]+)/.exec(href);
		if (!match) continue;
		let id = match[1];
		try {
			id = decodeURIComponent(id);
		} catch (err) {
			// keep the raw parameter: better an odd id than a lost one
		}
		if (!id || id === 'WL' || id === 'LL' || id.startsWith('RD')) continue;
		if (!seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	}

	const json = JSON.stringify(ids);
	console.log('Lifeline saved playlist IDs (' + ids.length + '):', json);
	try {
		copy(json);
		console.log('Copied to clipboard.');
	} catch (err) {
		// no DevTools copy() here: the console line above is the source
	}
	return ids;
})();`;
