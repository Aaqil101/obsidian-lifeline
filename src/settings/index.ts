/**
 * Settings tab. This file is the tab shell only: it implements the
 * declarative `getSettingDefinitions()` that Obsidian renders and indexes for
 * settings search, and the five landing groups it returns, each built by its
 * own module so no file has to carry the whole tab. Shared row builders live
 * in ui.ts, the settings shape in types.ts.
 *
 * There is no manual router anymore: a sub-page is a `page` definition whose
 * factory wraps the page module's renderer, so the way back is native and no
 * page has to remember to draw it.
 *
 * No Google credential ever lands in data.json: the client ID, client secret,
 * and refresh token all live in the Obsidian keychain, and only their *names*
 * are persisted here. Collected playlist IDs live in data.json and nowhere
 * else.
 */
import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type LifelinePlugin from '../main';
import { accountGroup } from './account';
import { notesGroup } from './notes';
import { imagesGroup } from './images';
import { playlistsGroup } from './playlists';
import { syncGroup } from './syncSection';
import type { SettingsHost } from './ui';

export {
	DEFAULT_SETTINGS,
	DEFAULT_NOTE_LAYOUTS,
	expandLegacyLayout,
	normalizeStoredLayouts,
	type LifelineSettings,
	type NoteLayout,
	type NoteLayouts,
} from './types';

export class LifelineSettingTab extends PluginSettingTab implements SettingsHost {
	plugin: LifelinePlugin;

	constructor(app: App, plugin: LifelinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * The landing page as definitions. Returning a non-empty array means the
	 * app renders the tab from these instead of calling `display()`, and
	 * indexes every name and desc for settings search, which is the whole
	 * point of the declarative API.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [accountGroup(this), notesGroup(this), imagesGroup(this), playlistsGroup(this), syncGroup(this)];
	}

	/**
	 * Re-render the tab. Rows whose change alters what else is shown (the
	 * image modes, which gate the images folder) call this; the app then
	 * re-runs `getSettingDefinitions()`, so a group rebuilt from live state
	 * picks the new state up.
	 */
	refresh(): void {
		this.update();
	}
}
