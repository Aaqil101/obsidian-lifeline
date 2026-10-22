/**
 * Row builders shared by every settings page: the native group card, the
 * chevron navigation row, the sub-page back crumb, and small helper text.
 *
 * Everything here is a free function taking a SettingsHost rather than a
 * method on the tab, so the tab can be split across page modules without any
 * of them importing it (they only `import type` the host interface).
 */
import { Setting, setIcon, type IconName } from 'obsidian';
import type LifelinePlugin from '../main';

/** Which in-settings sub-page is open (native Manage-page navigation). */
export type SubPage = 'none' | 'credentials' | 'channels' | 'playlists' | 'dashboard' | 'collect';

/**
 * What a page module may touch on the tab. Declared here rather than in
 * index.ts so page modules depend on this file only, never on the tab class
 * itself (`plugin` is a type-only import, which esbuild erases).
 */
export interface SettingsHost {
	readonly plugin: LifelinePlugin;
	display(): void;
	navigate(target: SubPage): void;
}

export const SECURITY_URL = 'https://github.com/Aaqil101/obsidian-lifeline#security--privacy';

/**
 * Native settings group (Obsidian 1.14+): section heading plus a
 * `.setting-items` card. On older versions these classes are inert and rows
 * keep the flat style those app versions use, so the tab always matches its
 * surroundings.
 */
export function group(
	containerEl: HTMLElement,
	name: string,
	decorateHeading?: (heading: Setting) => void,
): HTMLDivElement {
	const card = containerEl.createDiv({ cls: 'setting-group' });
	const heading = new Setting(card).setName(name).setHeading();
	decorateHeading?.(heading);
	return card.createDiv({ cls: 'setting-items' });
}

/**
 * Chevron navigation row (Ribbon menu configuration style). The whole row is
 * focusable and answers Enter and Space, not just the mouse: a row that opens
 * a page has to be reachable from the keyboard like the button it is.
 */
export function navRow(
	host: SettingsHost,
	card: HTMLElement,
	name: string,
	desc: string,
	target: SubPage,
	icon?: IconName,
): void {
	const row = new Setting(card)
		.setName(name)
		.setDesc(desc)
		.addExtraButton((button) => button.setIcon('chevron-right'));
	row.settingEl.addClass('lifeline-nav-row');
	row.settingEl.setAttr('role', 'button');
	row.settingEl.setAttr('tabindex', '0');
	if (icon) {
		const glyph = row.nameEl.createSpan({ cls: 'lifeline-nav-icon' });
		setIcon(glyph, icon);
		row.nameEl.prepend(glyph);
	}
	const open = (event: Event): void => {
		event.preventDefault();
		host.navigate(target);
	};
	row.settingEl.addEventListener('click', open);
	row.settingEl.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') open(event);
	});
}

/**
 * Back crumb for sub-pages (chevron + parent name), like native Manage pages.
 *
 * Rendered by the router in index.ts, not by the page itself: the way out of a
 * sub-page is not something a page should be able to forget.
 */
export function addBackCrumb(host: SettingsHost, containerEl: HTMLElement): void {
	const backRow = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
	const backLink = backRow.createEl('a', { cls: 'lifeline-subpage-back', href: '#' });
	setIcon(backLink, 'chevron-left');
	backLink.append(' Lifeline');
	backLink.addEventListener('click', (event) => {
		event.preventDefault();
		host.navigate('none');
	});
}

/** Muted paragraph inside a card, for prose that is not a setting row. */
export function noteParagraph(card: HTMLElement, text: string): void {
	card.createEl('p', { cls: 'lifeline-settings-note', text });
}

/** Human-readable message for auth/catalog failures shown in notices. */
export function authErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
