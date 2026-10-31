/**
 * Folder rows. Every path in this plugin is vault-relative, so there is no
 * operating-system dialog to open; instead each row offers two ways to pick:
 *
 * - typeahead: folders matching what you type appear under the input, the same
 *   popover Obsidian uses for its own path fields, and the box stays typeable
 *   so a folder that does not exist yet can still be named;
 * - a browse button that opens a fuzzy picker over every folder in the vault.
 *
 * The value only commits on blur or Enter (or right after a browse pick), so a
 * sync running concurrently never reads a half-typed path.
 */
import {
	AbstractInputSuggest,
	FuzzySuggestModal,
	TFolder,
	type App,
	type Setting,
	type TextComponent,
} from 'obsidian';

/** How many folders the typeahead offers before it stops matching. */
const SUGGEST_LIMIT = 50;

/** The vault root, spelled the way Obsidian reports it. */
const ROOT_PATH = '/';

/** How a folder is shown and stored: the root as '/', every other path as-is. */
function folderPath(folder: TFolder): string {
	return folder.path === ROOT_PATH ? ROOT_PATH : folder.path;
}

/** Every folder in the vault, root first, so the list is stable and sorted. */
function vaultFolders(app: App): TFolder[] {
	// Walk the folder tree only: a picker needs folder paths, never file paths.
	const folders: TFolder[] = [];
	const walk = (folder: TFolder): void => {
		folders.push(folder);
		for (const child of folder.children) if (child instanceof TFolder) walk(child);
	};
	walk(app.vault.getRoot());
	return folders.sort((a, b) => folderPath(a).localeCompare(folderPath(b)));
}

/** Popover suggestions while a folder row is being typed into. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		// Fill the box only: the path is still committed on blur, so a suggestion
		// can be edited into a deeper folder before anything is stored.
		this.onSelect((folder) => {
			this.setValue(folderPath(folder));
			this.close();
		});
	}

	protected getSuggestions(query: string): TFolder[] {
		const needle = query.trim().replace(/^\/+/, '').toLowerCase();
		const folders = vaultFolders(this.app);
		const matches = needle
			? folders.filter((folder) => folderPath(folder).toLowerCase().includes(needle))
			: folders;
		return matches.slice(0, SUGGEST_LIMIT);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folderPath(folder));
	}
}

/** Click-to-pick modal over every folder in the vault. */
export class FolderPickModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly onPick: (path: string) => void,
	) {
		super(app);
		this.emptyStateText = 'No folder matches that.';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.setPlaceholder('Jump to a folder…');
	}

	getItems(): TFolder[] {
		return vaultFolders(this.app);
	}

	getItemText(item: TFolder): string {
		return folderPath(item);
	}

	onChooseItem(item: TFolder): void {
		this.onPick(folderPath(item));
	}
}

export interface FolderRowOptions {
	app: App;
	/** Stored value; the box starts here. */
	value: string;
	/** Shown in the box while it is empty, so the row never looks unset. */
	placeholder: string;
	/** Turn what was typed into the canonical stored path. */
	normalize: (raw: string) => string;
	/** Store the normalized path, and do whatever moving it implies. */
	commit: (path: string) => void | Promise<void>;
}

/**
 * One folder row: text input with typeahead, a browse button, and a
 * commit-on-blur. A no-op when nothing changed, so tabbing through the form
 * rewrites nothing.
 *
 * The row's name and desc come from the caller's setting definition, so this
 * only adds the controls.
 */
export function folderSetting(row: Setting, options: FolderRowOptions): void {
	let committed = options.value;
	let input: TextComponent | null = null;

	/** Normalize what is in the box and store it if it actually changed. */
	const commit = (): Promise<void> => {
		if (!input) return Promise.resolve();
		const next = options.normalize(input.getValue());
		input.setValue(next);
		if (next === committed) return Promise.resolve();
		committed = next;
		return Promise.resolve(options.commit(next));
	};

	row.addText((text) => {
		input = text;
		text.setPlaceholder(options.placeholder).setValue(options.value);
		// Enter means "done", not "newline": blur is what commits.
		text.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') text.inputEl.blur();
		});
		text.inputEl.addEventListener('blur', () => {
			void commit();
		});
		new FolderSuggest(options.app, text.inputEl);
	});
	row.addExtraButton((button) =>
		button.setIcon('folder').setTooltip('Browse folders').onClick(() => {
			if (!input) return;
			// The modal takes focus, so the input has usually blurred (and
			// committed its old value) by the time a pick comes back. Commit
			// explicitly rather than waiting for a blur that may never fire.
			new FolderPickModal(options.app, (path) => {
				if (!input) return;
				input.setValue(path);
				void commit();
			}).open();
		}),
	);
}
