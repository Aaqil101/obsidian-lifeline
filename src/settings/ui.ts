/**
 * Shared settings building blocks: the native group card (still used inside
 * imperative sub-pages), the wrapper that opens one of those sub-pages from
 * the declarative tab, and the row helper the landing groups are built from.
 *
 * Everything here is a free function taking a SettingsHost rather than a
 * method on the tab, so the tab can be split across page modules without any
 * of them importing it (they only `import type` the host interface).
 *
 * The landing rows are deliberately `render` definitions rather than native
 * `control` definitions: several of them carry behaviour a plain control
 * cannot express (a folder value that only commits on blur, a toggle the
 * Dataview gate can reject, a dropdown that rewrites generated scripts), so
 * the existing imperative rows are kept and merely hosted. The definition
 * still carries the name and desc, which is what settings search indexes.
 */
import {
	Setting,
	SettingPage,
	type SettingDefinitionPage,
	type SettingDefinitionRender,
} from 'obsidian';
import type LifelinePlugin from '../main';

/**
 * What a page module may touch on the tab. Declared here rather than in
 * index.ts so page modules depend on this file only, never on the tab class
 * itself (`plugin` is a type-only import, which esbuild erases).
 *
 * `refresh()` re-renders whichever view the caller is part of: the landing
 * tab, or the sub-page a page function was opened inside. It is the only
 * re-render entry point a page module gets, since the declarative tab has no
 * `display()` of its own to call.
 */
export interface SettingsHost {
	readonly plugin: LifelinePlugin;
	refresh(): void;
}

export const SECURITY_URL = 'https://github.com/Aaqil101/obsidian-lifeline#security--privacy';

/**
 * Imperative group card: a section heading plus a `.setting-items` card.
 *
 * Only sub-pages use this now: the landing groups come from
 * `getSettingDefinitions()`, whose groups carry their own heading. A
 * sub-page is drawn imperatively (its rows depend on live state the
 * definition tree has no way to express), so it keeps this helper.
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

/** How a sub-page module draws itself: a host plus the container to fill. */
export type PageRenderer = (host: SettingsHost, containerEl: HTMLElement) => void;

/**
 * One landing row as a declarative definition. The name and desc live on the
 * definition, which is what settings search indexes and the framework renders;
 * they are also written onto the row so a row the framework hands over bare
 * still labels itself. The draw callback only adds controls.
 */
export function renderRow(
	name: string,
	desc: string | undefined,
	draw: (setting: Setting) => void,
	visible?: () => boolean,
): SettingDefinitionRender {
	return {
		name,
		desc,
		visible,
		render: (setting) => {
			setting.setName(name);
			if (desc !== undefined) setting.setDesc(desc);
			draw(setting);
		},
	};
}

/**
 * A sub-page hosted by an existing imperative page renderer, opened through
 * the framework's own navigation (so it gets a native back affordance and no
 * longer needs the router's back crumb).
 *
 * The host handed to the page is scoped to this page: `refresh()` re-runs
 * this page's own `display()`, so a row that needs to repaint what it is part
 * of repaints the sub-page, not the whole tab.
 */
class HostedPage extends SettingPage {
	private bound!: { host: SettingsHost; render: PageRenderer };

	bind(host: SettingsHost, render: PageRenderer): void {
		this.bound = {
			host: { plugin: host.plugin, refresh: () => this.display() },
			render,
		};
	}

	display(): void {
		this.containerEl.empty();
		this.bound.render(this.bound.host, this.containerEl);
	}
}

/**
 * A navigable entry in the landing tab that opens an imperative sub-page.
 * `desc` is shown on the entry and indexed for settings search.
 */
export function pageDefinition(
	host: SettingsHost,
	name: string,
	desc: string,
	render: PageRenderer,
): SettingDefinitionPage {
	return {
		type: 'page',
		name,
		desc,
		page: () => {
			const page = new HostedPage();
			page.title = name;
			page.bind(host, render);
			return page;
		},
	};
}

/** Muted paragraph inside a card, for prose that is not a setting row. */
export function noteParagraph(card: HTMLElement, text: string): void {
	card.createEl('p', { cls: 'lifeline-settings-note', text });
}

/** Human-readable message for auth/catalog failures shown in notices. */
export function authErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
