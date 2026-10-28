/**
 * Hero banner channel row (Dashboard sub-page). Same two-way pick as the
 * folder rows, over the synced channels instead of vault folders:
 *
 * - typeahead: channels matching what you type appear under the input;
 * - a browse button that opens a fuzzy picker over every synced channel.
 *
 * Plus a clear button that restores the default mosaic.
 *
 * The box holds a label (the channel title) but the setting always holds the
 * channel URL, which is what the Channels.md bullets carry: titles and handles
 * change, and the `id` field is optional, so the URL is the only identity that
 * is always there. A stored URL whose channel is gone from state shows as the
 * raw URL, so a stale pick stays visible and clearable rather than silently
 * disappearing while still pointing at nothing.
 *
 * Nothing commits until blur, Enter, or a browse pick, so a sync running
 * concurrently never reads a half-typed name.
 */
import {
	AbstractInputSuggest,
	FuzzySuggestModal,
	Setting,
	type App,
	type TextComponent,
} from 'obsidian';
import type { ChannelRecord } from '../types';

/** How many channels the typeahead offers before it stops matching. */
const SUGGEST_LIMIT = 50;

/** Live channel list (state.json, already in memory), read per interaction so
 *  an open settings page offers a channel a just-finished sync discovered. */
export type ChannelSource = () => ChannelRecord[];

/** How a channel URL compares: trimmed, no trailing slash, so a hand-pasted
 *  variant still matches what the note wrote. Shared with the hero crop row,
 *  which has to find the same channel in the same way. */
export function normUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

/** Every channel by title, so both pickers list them in the same order. */
function sortedChannels(source: ChannelSource): ChannelRecord[] {
	return source().slice().sort((a, b) => a.title.localeCompare(b.title));
}

/** What the box shows for a stored URL: the title when the channel is still
 *  synced, else the raw URL so the stale value stays visible and clearable. */
function boxLabel(channels: ChannelRecord[], url: string): string {
	if (!url) return '';
	const found = channels.find((channel) => normUrl(channel.url) === normUrl(url));
	return found ? found.title : url;
}

/**
 * Turn what is in the box into the URL to store. Empty clears; a known URL,
 * title, or handle resolves to that channel; an unknown http(s) URL is kept
 * as-is (it may belong to a channel that is not synced yet, and the hero
 * falls back to the mosaic until it is); anything else is not a channel at
 * all and returns null, so the caller reverts instead of storing junk.
 */
function resolveBoxValue(channels: ChannelRecord[], raw: string): string | null {
	const text = raw.trim();
	if (!text) return '';
	const asUrl = normUrl(text);
	const byUrl = channels.find((channel) => normUrl(channel.url) === asUrl);
	if (byUrl) return byUrl.url;
	const needle = text.toLowerCase().replace(/^@/, '');
	const byName = channels.find((channel) => {
		const title = channel.title.trim().toLowerCase();
		const handle = channel.handle ? channel.handle.trim().replace(/^@/, '').toLowerCase() : '';
		return title === needle || (handle !== '' && handle === needle);
	});
	if (byName) return byName.url;
	return /^https?:\/\//i.test(text) ? text : null;
}

/** Popover suggestions while a channel row is being typed into. */
class ChannelSuggest extends AbstractInputSuggest<ChannelRecord> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly source: ChannelSource,
		private readonly onPick: (channel: ChannelRecord) => void,
	) {
		super(app, inputEl);
		// Fill the box with the title and commit the URL right away: the box
		// only shows a title, so two channels sharing one could not be told
		// apart by resolving the text on blur. The box stays editable, and a
		// later edit still re-resolves on blur as usual.
		this.onSelect((channel) => {
			this.setValue(channel.title);
			this.close();
			this.onPick(channel);
		});
	}

	protected getSuggestions(query: string): ChannelRecord[] {
		const needle = query.trim().toLowerCase().replace(/^@/, '');
		const channels = sortedChannels(this.source);
		const matches = needle
			? channels.filter((channel) => {
					const title = channel.title.toLowerCase();
					const handle = channel.handle ? channel.handle.toLowerCase() : '';
					return title.includes(needle) || handle.includes(needle);
				})
			: channels;
		return matches.slice(0, SUGGEST_LIMIT);
	}

	renderSuggestion(channel: ChannelRecord, el: HTMLElement): void {
		el.setText(channel.handle ? `${channel.title} (${channel.handle})` : channel.title);
	}
}

/** Click-to-pick modal over every synced channel. */
class ChannelPickModal extends FuzzySuggestModal<ChannelRecord> {
	constructor(
		app: App,
		private readonly source: ChannelSource,
		private readonly onPick: (url: string) => void,
	) {
		super(app);
		this.emptyStateText = 'No channel matches that.';
		this.setPlaceholder('Jump to a channel…');
	}

	getItems(): ChannelRecord[] {
		return sortedChannels(this.source);
	}

	getItemText(item: ChannelRecord): string {
		return item.handle ? `${item.title} (${item.handle})` : item.title;
	}

	onChooseItem(item: ChannelRecord): void {
		this.onPick(item.url);
	}
}

export interface HeroChannelRowOptions {
	app: App;
	name: string;
	desc: string;
	/** Stored URL; the box starts on its label. */
	value: string;
	/** Shown in the box while nothing is picked, so the row never looks unset. */
	placeholder: string;
	/** Live channel list. */
	channels: ChannelSource;
	/** Store the resolved URL ('' restores the default mosaic). */
	commit: (url: string) => void | Promise<void>;
	/** Fires after every commit, including clear, so a row below (the crop
	 *  preview) can follow the pick without the page re-rendering. */
	onPick?: (url: string) => void;
}

/**
 * One hero banner row: text input with typeahead, a browse button, and a
 * clear button. The label currently in the box is tracked so an untouched box
 * never re-resolves on blur: a programmatic label round-trip (browse pick,
 * clear) must not be mistaken for typing, and two channels sharing a title
 * cannot swap the stored URL out from under a click elsewhere.
 */
export function heroChannelSetting(card: HTMLElement, options: HeroChannelRowOptions): void {
	let committed = options.value;
	let shown = '';
	let input: TextComponent | null = null;

	/** Put a URL's label in the box and remember it as the untouched state. */
	const setBox = (url: string): void => {
		if (!input) return;
		shown = boxLabel(options.channels(), url);
		input.setValue(shown);
	};

	/** Resolve what was typed and store it only when it actually changed. */
	const commit = (): Promise<void> => {
		if (!input) return Promise.resolve();
		const raw = input.getValue();
		// Nothing typed since the last set: a label is not a new value, and
		// resolving it again could pick a different channel with the same title.
		if (raw === shown) return Promise.resolve();
		const next = resolveBoxValue(options.channels(), raw);
		if (next === null) {
			// Not a channel: put the last good value back instead of storing it.
			setBox(committed);
			return Promise.resolve();
		}
		return Promise.resolve(pick(next));
	};

	/** Show a URL in the box and store it, if it differs from what is stored.
	 *  The single path every programmatic pick (typeahead, browse, clear) takes. */
	const pick = (url: string): void => {
		setBox(url);
		options.onPick?.(url);
		if (url === committed) return;
		committed = url;
		void options.commit(url);
	};

	const row = new Setting(card).setName(options.name).setDesc(options.desc);
	row.addText((text) => {
		input = text;
		text.setPlaceholder(options.placeholder);
		// Start from the value, not setBox: `shown` is the label of the stored
		// URL and must match what the box displays before the first commit.
		shown = boxLabel(options.channels(), options.value);
		text.setValue(shown);
		// Enter means "done", not "newline": blur is what commits.
		text.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') text.inputEl.blur();
		});
		text.inputEl.addEventListener('blur', () => {
			void commit();
		});
		new ChannelSuggest(options.app, text.inputEl, options.channels, (channel) => {
			pick(channel.url);
		});
	});
	row.addExtraButton((button) =>
		button.setIcon('search').setTooltip('Browse channels').onClick(() => {
			if (!input) return;
			// The modal takes focus, so the input has usually blurred (and
			// committed its old value) by the time a pick comes back. Pick
			// directly rather than waiting for a blur that may never fire.
			new ChannelPickModal(options.app, options.channels, pick).open();
		}),
	);
	row.addExtraButton((button) =>
		button.setIcon('x').setTooltip('Clear hero banner').onClick(() => {
			pick('');
		}),
	);
}
