/**
 * Settings tab. This file is routing only: it holds the sub-page switch and
 * the five landing groups, each in its own module so no file has to carry the
 * whole tab. Shared row builders live in ui.ts, the settings shape in types.ts.
 *
 * No Google credential ever lands in data.json: the client ID, client secret,
 * and refresh token all live in the Obsidian keychain, and only their *names*
 * are persisted here. Collected playlist IDs live in data.json and nowhere
 * else.
 */
import { App, PluginSettingTab } from 'obsidian';
import type LifelinePlugin from '../main';
import { renderAccountGroup, renderCredentialsPage } from './account';
import { renderChannelsFieldsPage, renderNotesGroup } from './notes';
import { renderImagesGroup } from './images';
import { renderDashboardPage } from './dashboardPage';
import { renderPlaylistsGroup, renderPlaylistsPage } from './playlists';
import { renderCollectIdsPage } from './collectPage';
import { renderSyncGroup } from './syncSection';
import { addBackCrumb, type SettingsHost, type SubPage } from './ui';

export { DEFAULT_SETTINGS, DEFAULT_NOTE_LAYOUT, type LifelineSettings, type NoteLayout } from './types';

/** The pages that can be open instead of the landing list. */
const SUB_PAGES: Record<Exclude<SubPage, 'none'>, (host: SettingsHost, containerEl: HTMLElement) => void> = {
	credentials: renderCredentialsPage,
	channels: renderChannelsFieldsPage,
	playlists: renderPlaylistsPage,
	collect: renderCollectIdsPage,
	dashboard: renderDashboardPage,
};

export class LifelineSettingTab extends PluginSettingTab implements SettingsHost {
	plugin: LifelinePlugin;
	/** Which in-settings sub-page is open (native Manage-page navigation). */
	private subPage: SubPage = 'none';

	constructor(app: App, plugin: LifelinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (this.subPage !== 'none') {
			// The way out is rendered here, not inside each page. A page that
			// has to remember its own back crumb is a page that can forget it,
			// and a sub-page with no way back is a trap.
			addBackCrumb(this, containerEl);
			SUB_PAGES[this.subPage](this, containerEl);
			return;
		}

		renderAccountGroup(this, containerEl);
		renderNotesGroup(this, containerEl);
		renderImagesGroup(this, containerEl);
		renderPlaylistsGroup(this, containerEl);
		renderSyncGroup(this, containerEl);
	}

	/** Open a sub-page (or return to the landing list with 'none'). */
	navigate(target: SubPage): void {
		this.subPage = target;
		this.display();
	}
}
