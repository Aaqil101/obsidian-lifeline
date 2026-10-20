/**
 * Webview availability detection + discovery of an open **Web viewer** tab
 * (Obsidian's core plugin), shared by settings and the Mode 2 modal.
 *
 * Detection is checked live, never assumed: whether a build exposes the
 * `<webview>` tag is a per-Electron-version decision (the tag is deprecated
 * upstream, yet the core Web viewer works where it works). The probe never
 * attaches the element to the DOM, so no guest process is created: a
 * synchronous `typeof` check only.
 *
 * An open Web viewer tab is the ideal collection surface: the user is
 * already signed in there (their own browser session; the plugin never
 * reads it), the tab is never navigated, and only the collector script ever
 * runs inside it. The same rules as Mode 1 apply: no cookies, no storage,
 * no credentials, DOM reads only.
 */

/** The slice of Electron's WebviewTag this plugin uses. */
export interface PlaylistWebview extends HTMLElement {
	getURL(): string;
	executeJavaScript(code: string): Promise<unknown>;
}

declare global {
	interface HTMLElementTagNameMap {
		webview: PlaylistWebview;
	}
}

/** URL fragment shared by the modal and settings for page checks. */
export const PLAYLISTS_FRAGMENT = 'youtube.com/feed/playlists';
const OWN_MARK = 'lifeline-collect-webview';

/**
 * True when this Obsidian build upgrades `<webview>` into a functional tag
 * (the same condition Mode 1's in-app fallback relies on).
 */
export function isWebviewSupported(): boolean {
	try {
		// Global createEl returns a detached element (no parent), so no webview
		// guest process spawns, and remove() below guarantees it is discarded
		// even in the worst case.
		const probe = createEl('webview');
		const supported = typeof probe.getURL === 'function';
		probe.remove();
		return supported;
	} catch {
		return false;
	}
}

/**
 * Find an open Web viewer tab that is already on the saved-playlists page,
 * ready to collect from. The modal's own webview is excluded so a mounted
 * window can never be mistaken for a borrowed tab. Returns null when no
 * such tab exists (including builds where the viewer exposes no DOM
 * element at all).
 */
export function findOpenCollectorTab(): PlaylistWebview | null {
	for (const element of Array.from(document.querySelectorAll<PlaylistWebview>('webview'))) {
		if (element.classList.contains(OWN_MARK)) continue;
		let url = '';
		try {
			url = element.getURL();
		} catch {
			continue; // not (yet) attached to a guest
		}
		if (url.startsWith('https://') && url.includes(PLAYLISTS_FRAGMENT)) return element;
	}
	return null;
}
