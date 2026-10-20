/**
 * Mode 2 (experimental, desktop-only): collect saved-playlist IDs from
 * youtube.com/feed/playlists inside an embedded Chromium surface.
 *
 * Two surfaces, picked when the modal opens (and re-picked if the borrowed
 * one disappears):
 *  1. An already-open **Web viewer** tab (Obsidian's core plugin) on the
 *     saved-playlists page, the user's own signed-in tab, so no sign-in
 *     wall appears. The plugin only runs the collector script in the page;
 *     it never navigates the tab, and never reads cookies, storage, or
 *     credentials.
 *  2. A webview this modal owns, in its own session partition
 *     (`persist:yt-playlists`), where the page authenticates exactly like a
 *     normal browser tab. When Google shows a sign-in wall we say so and
 *     point back to Mode 1 (the console steps); nothing is spoofed and
 *     nothing is bypassed.
 *
 * On builds without a working webview tag (feature-detected, never
 * assumed; see webviewCompat.ts) the modal says so immediately and points
 * at Mode 1.
 *
 * Collection runs the same collector script Mode 1 copies
 * (`src/collector.ts`) via `executeJavaScript`, whose promise resolves to
 * the returned id array.
 */
import { Modal, Notice, type App } from 'obsidian';
import { COLLECTOR_SOURCE } from '../collector';
import { errorMessage } from '../json';
import { cleanPlaylistIds } from '../playlistIds';
import {
	findOpenCollectorTab,
	isWebviewSupported,
	PLAYLISTS_FRAGMENT,
	type PlaylistWebview,
} from '../webviewCompat';

const START_URL = 'https://www.youtube.com/feed/playlists';
const PARTITION = 'persist:yt-playlists';
const LOGIN_URL_PREFIX = 'https://accounts.google.com';
const READY_TIMEOUT_MS = 10000;
const WATCH_INTERVAL_MS = 500;
const COLLECT_LABEL = 'Collect IDs from this page';
const LOGIN_MESSAGE =
	'Google is asking you to sign in. Close this window and use the console steps instead; Lifeline never handles your Google login.';
const NO_WEBVIEW_MESSAGE =
	'Embedded browsing is unavailable in this Obsidian build. Close this window and use the console steps instead.';
const TAB_GONE_MESSAGE =
	'The Web viewer tab was closed. Reopen YouTube.com/feed/playlists in the Web viewer, or use the console steps.';

export class PlaylistWebviewModal extends Modal {
	private readonly onCollected: (ids: string[]) => Promise<number>;
	private readonly onClosed: () => void;
	private element: PlaylistWebview | null = null;
	private usingCoreTab = false;
	private hint: HTMLElement | null = null;
	private hintText: HTMLElement | null = null;
	private status: HTMLElement | null = null;
	private collectButton: HTMLButtonElement | null = null;
	private ready = false;
	private running = false;
	private fallbackTimer: number | null = null;
	private watchTimer: number | null = null;
	private lastUrl = '';

	constructor(
		app: App,
		onCollected: (ids: string[]) => Promise<number>,
		onClosed: () => void = () => {},
	) {
		super(app);
		this.onCollected = onCollected;
		this.onClosed = onClosed;
	}

	onOpen(): void {
		this.modalEl.addClass('lifeline-collect-modal');
		this.titleEl.setText('Saved playlists on YouTube');
		const content = this.contentEl;

		this.hint = content.createDiv({ cls: 'lifeline-collect-hint lifeline-hidden' });
		this.hintText = this.hint.createSpan({ cls: 'lifeline-collect-hint-text' });
		this.hint.createEl('button', { text: 'Use console steps' }).addEventListener('click', () => this.close());

		const toolbar = content.createDiv({ cls: 'lifeline-collect-toolbar' });
		this.status = toolbar.createSpan({ cls: 'lifeline-collect-status', text: 'Starting…' });
		this.collectButton = toolbar.createEl('button', { cls: 'mod-cta', text: COLLECT_LABEL });
		this.collectButton.disabled = true;
		this.collectButton.addEventListener('click', () => void this.collect());

		this.establishSurface(content);
		this.startWatching();
	}

	onClose(): void {
		if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
		this.fallbackTimer = null;
		if (this.watchTimer !== null) window.clearInterval(this.watchTimer);
		this.watchTimer = null;
		// Removing the guest element tears down a window we mounted; an open
		// Web viewer tab belongs to the core plugin; never remove it.
		if (!this.usingCoreTab) this.element?.remove();
		this.element = null;
		this.contentEl.empty();
		this.onClosed();
	}

	private establishSurface(content: HTMLElement): void {
		// Surface 1: an already-open Web viewer tab on the playlists page:
		// it carries the user's own sign-in, so no sign-in wall appears.
		const tab = findOpenCollectorTab();
		if (tab) {
			this.element = tab;
			this.usingCoreTab = true;
			this.ready = true;
			this.setStatus('Using your open Web viewer tab.');
			this.setCollectEnabled(true);
			return;
		}
		// Surface 2: this build allows <webview>; mount our own window.
		if (isWebviewSupported()) {
			this.mountWebview(content);
			return;
		}
		// Surface 3: none available; say so immediately, no timeout wait.
		this.element = null;
		this.ready = false;
		this.setStatus('Unavailable.');
		this.showHint(NO_WEBVIEW_MESSAGE);
	}

	private mountWebview(content: HTMLElement): void {
		// createEl applies attrs before inserting, which is required: the
		// partition (and src) must exist before the guest element initializes.
		// Own persistent session for this window only; the plugin never reads it.
		const webview = content.createEl('webview', {
			cls: 'lifeline-collect-webview',
			attr: { partition: PARTITION, src: START_URL },
		});
		this.element = webview;
		this.usingCoreTab = false;
		this.ready = false;
		this.lastUrl = '';
		this.setStatus('Loading youtube.com/feed/playlists…');
		webview.addEventListener('dom-ready', () => {
			this.ready = true;
			this.setCollectEnabled(true);
			this.syncLoginHint();
		});
		webview.addEventListener('did-stop-loading', () => this.syncLoginHint());
		webview.addEventListener('did-navigate', () => this.syncLoginHint());
		webview.addEventListener('did-navigate-in-page', () => this.syncLoginHint());
		webview.addEventListener('did-fail-load', () => {
			if (!this.ready) this.setStatus('Could not load the page.');
		});

		// Defensive: a build whose probe passed but whose guest never
		// initializes never fires dom-ready; fall back to Mode 1.
		if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
		this.fallbackTimer = window.setTimeout(() => {
			if (this.ready || this.usingCoreTab) return;
			this.setStatus('Unavailable.');
			this.showHint(NO_WEBVIEW_MESSAGE);
			this.setCollectEnabled(false);
		}, READY_TIMEOUT_MS);
	}

	private startWatching(): void {
		if (this.watchTimer !== null) return;
		this.watchTimer = window.setInterval(() => this.watch(), WATCH_INTERVAL_MS);
	}

	/** Keep status and hint truthful while the user browses; recover if a borrowed tab closes. */
	private watch(): void {
		if (this.usingCoreTab && this.element?.isConnected) {
			this.syncLoginHint();
			return;
		}
		if (this.usingCoreTab) {
			// The borrowed tab closed; pick it back up if it is reopened.
			const tab = findOpenCollectorTab();
			if (tab) {
				this.element = tab;
				this.ready = true;
				this.lastUrl = '';
				this.setStatus('Using your open Web viewer tab.');
				this.setCollectEnabled(true);
				this.syncLoginHint();
				return;
			}
			this.element = null;
			this.ready = false;
			this.setStatus('Browser tab closed.');
			this.showHint(TAB_GONE_MESSAGE);
			this.setCollectEnabled(false);
			return;
		}
		// Own webview: it lives inside this modal, so it stays connected.
		this.syncLoginHint();
	}

	private async collect(): Promise<void> {
		const element = this.element;
		if (!element || !this.ready || this.running) return;
		const url = this.currentUrl();
		if (url.startsWith(LOGIN_URL_PREFIX)) {
			this.showHint(LOGIN_MESSAGE);
			new Notice('Google is asking you to sign in; use the console steps instead.');
			return;
		}
		if (!url.includes(PLAYLISTS_FRAGMENT)) {
			new Notice('Open YouTube.com/feed/playlists in the browser view first.');
			return;
		}

		this.running = true;
		this.setCollectEnabled(false);
		if (this.collectButton) this.collectButton.setText('Collecting…');
		try {
			const result = await element.executeJavaScript(COLLECTOR_SOURCE);
			const ids = cleanPlaylistIds(result);
			if (ids.length === 0) {
				this.setStatus('No playlists found on this page.');
				new Notice('No playlists found on this page.');
				return;
			}
			const added = await this.onCollected(ids);
			this.setStatus(`Collected ${ids.length} IDs · ${added} new.`);
			new Notice(`Collected ${ids.length} playlist IDs · ${added} new.`);
		} catch (err) {
			this.setStatus('Could not read the page.');
			new Notice(
				`Could not collect from the page: ${errorMessage(err)}. Close this window and use the console steps instead.`,
				12000,
			);
		} finally {
			this.running = false;
			if (this.collectButton) this.collectButton.setText(COLLECT_LABEL);
			this.setCollectEnabled(this.ready);
		}
	}

	private currentUrl(): string {
		try {
			return this.element?.getURL() ?? '';
		} catch {
			return '';
		}
	}

	private syncLoginHint(): void {
		const url = this.currentUrl();
		if (url === this.lastUrl) return;
		this.lastUrl = url;
		if (url.startsWith(LOGIN_URL_PREFIX)) {
			this.setStatus('Sign-in page.');
			this.showHint(LOGIN_MESSAGE);
			return;
		}
		if (url.includes(PLAYLISTS_FRAGMENT)) {
			this.hideHint();
			this.setStatus(this.usingCoreTab ? 'Using your open Web viewer tab.' : 'Ready.');
		}
	}

	private setCollectEnabled(enabled: boolean): void {
		if (this.collectButton) this.collectButton.disabled = !enabled || this.running;
	}

	private showHint(text: string): void {
		if (!this.hint || !this.hintText) return;
		this.hintText.setText(text);
		this.hint.removeClass('lifeline-hidden');
	}

	private hideHint(): void {
		this.hint?.addClass('lifeline-hidden');
	}

	private setStatus(text: string): void {
		this.status?.setText(text);
	}
}
