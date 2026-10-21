/**
 * Obsidian's **Web viewer** core plugin: enable check, opening a URL in it,
 * and discovery of its open tabs for collection.
 *
 * Mode 2 of the saved-playlist collector never embeds a browser of its own.
 * The <webview> tag is deprecated in Electron, and a fresh session always
 * lands on Google's sign-in wall. Instead it borrows the user's own Web
 * viewer tab: the same signed-in session as a normal browser tab, where the
 * plugin only ever reads the page (see collector.ts). Nothing is navigated,
 * no cookies, storage, or credentials are read.
 *
 * The view type string and the internal-plugin lookup are not part of the
 * public API, but both have been stable since the Web viewer shipped. Every
 * access here is structurally typed (never `any`) and feature-detected,
 * so a build that lacks them degrades to the console steps.
 */
import type { App } from 'obsidian';

/** The slice of Electron's WebviewTag this plugin uses. */
export interface PlaylistWebview extends HTMLElement {
	getURL(): string;
	executeJavaScript(code: string): Promise<unknown>;
}

/** Saved-playlists page: the URL to open, and the fragment to check. */
export const PLAYLISTS_URL = 'https://www.youtube.com/feed/playlists';
export const PLAYLISTS_FRAGMENT = 'youtube.com/feed/playlists';

const WEB_VIEWER_VIEW_TYPE = 'webviewer';
const WEB_VIEWER_PLUGIN_ID = 'webviewer';
const LOGIN_URL_PREFIX = 'https://accounts.google.com';

/** Minimal structural shape for Obsidian's internal-plugin registry. */
interface InternalPluginsHost {
	getPluginById(id: string): { enabled: boolean } | null;
}

/** What this plugin reads off a Web viewer view: its guest element. */
interface WebViewerView {
	webview?: PlaylistWebview | null;
}

/** True when the Web viewer core plugin is present and enabled. */
export function isWebViewerEnabled(app: App): boolean {
	return webViewerPlugin(app)?.enabled === true;
}

/**
 * Open a URL in the user's Web viewer, in a new tab. Returns false when the
 * core plugin is off or this build cannot host the view; the caller points
 * the user at Settings → Core plugins → Web viewer.
 */
export function openInWebViewer(app: App, url: string): boolean {
	if (!isWebViewerEnabled(app)) return false;
	try {
		void app.workspace
			.getLeaf('tab')
			.setViewState({ type: WEB_VIEWER_VIEW_TYPE, state: { url, navigate: true }, active: true });
		return true;
	} catch {
		return false;
	}
}

/** True when a tab URL is a Google sign-in page. */
export function isGoogleSignInUrl(url: string): boolean {
	return url.startsWith(LOGIN_URL_PREFIX);
}

/**
 * Find an open Web viewer tab whose URL satisfies the predicate (any
 * https tab when no predicate is given). Returns null when there is none,
 * or when the build exposes no reachable guest element.
 */
export function findWebViewerTab(app: App, matches?: (url: string) => boolean): PlaylistWebview | null {
	for (const webview of webViewerElements(app)) {
		let url = '';
		try {
			url = webview.getURL();
		} catch {
			continue; // not (yet) attached to a live guest
		}
		if (!url.startsWith('https://')) continue;
		if (!matches || matches(url)) return webview;
	}
	return null;
}

function webViewerPlugin(app: App): { enabled: boolean } | null {
	const host = (app as unknown as { internalPlugins?: Partial<InternalPluginsHost> }).internalPlugins;
	return host?.getPluginById?.(WEB_VIEWER_PLUGIN_ID) ?? null;
}

/**
 * The guest elements behind open Web viewer tabs. A view exposes its own
 * webview element (which also covers pop-out windows); scanning the main
 * document covers builds where the view keeps it private.
 */
function webViewerElements(app: App): PlaylistWebview[] {
	const fromViews: PlaylistWebview[] = [];
	for (const leaf of app.workspace.getLeavesOfType(WEB_VIEWER_VIEW_TYPE)) {
		const webview = (leaf.view as unknown as WebViewerView).webview;
		if (webview) fromViews.push(webview);
	}
	if (fromViews.length > 0) return fromViews;
	return Array.from(document.querySelectorAll<PlaylistWebview>('webview'));
}
