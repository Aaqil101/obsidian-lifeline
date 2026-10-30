/**
 * Hero banner crop row (Dashboard sub-page, under the Hero banner row).
 *
 * A channel banner is far wider than the dashboard hero, so `object-fit:
 * cover` throws away everything outside a band of the image and keeps the
 * middle by default. This row lets the user say which part survives: the
 * preview is the same banner at the hero's shape, clicking a spot on it
 * stores that spot as the crop center, and the generated script reads the
 * value live (like the pick itself) and applies it as `object-position`, so
 * moving the point needs no sync and no rewritten note.
 *
 * The preview resolves the image the way the hero will: the downloaded copy
 * in the thumbnails folder when it is on disk, else the remote `banner` URL.
 * With no channel picked, or one without a banner, the row shows a hint
 * instead, because there is nothing to crop.
 *
 * Keyboard: the preview is focusable, arrow keys nudge the point (Shift for
 * a bigger step), Home recenters. Commit happens on release / keyup, so a
 * drag is one save, not one per pixel.
 */
import { Setting, TFile, type App } from 'obsidian';
import { channelBannerImageBase, outputPaths } from '../markdown';
import type LifelinePlugin from '../main';
import type { SyncState } from '../types';
import { normUrl } from './channelPicker';
import { DEFAULT_HERO_FOCUS, normalizeHeroFocus, type HeroFocusPoint } from './types';

/** Arrow-key step in percent, with and without Shift held. */
const NUDGE_SMALL = 2;
const NUDGE_LARGE = 10;

/** Preview box, roughly the hero's proportions so the crop reads true. */
const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = 64;
/** Bounds for the shape-matched height, kept well clear of the banner's own
 *  aspect so a clamp can never flip which axis crops. */
const PREVIEW_MIN_HEIGHT = 48;
const PREVIEW_MAX_HEIGHT = 220;

/**
 * The banner strip is wider than a banner, so only the vertical crop applies.
 * The horizontal point is pinned to the middle, whatever a stored value says.
 */
const verticalOnly = (point: HeroFocusPoint): HeroFocusPoint => ({
	x: DEFAULT_HERO_FOCUS.x,
	y: point.y,
});

/**
 * The live banner strip's proportions, or the wide fallback when no dashboard
 * is on screen. `object-fit: cover` only crops the axis the banner overflows,
 * and that depends on the strip's shape: a wide strip crops vertically.
 * Reading the open strip's real box lets the preview crop on the same axis,
 * so what the user drags here is what actually moves there at any pane width.
 */
const heroAspect = (): number => {
  const strip = document.querySelector<HTMLElement>('.lifeline-hero .lifeline-mosaic');
  const box = strip ? strip.getBoundingClientRect() : null;
  return box && box.width && box.height ? box.width / box.height : PREVIEW_WIDTH / PREVIEW_HEIGHT;
};

export interface HeroFocusRowOptions {
	plugin: LifelinePlugin;
	name: string;
	desc: string;
	/** Store the new crop point. */
	commit: (focus: HeroFocusPoint) => void | Promise<void>;
}

/**
 * The banner the hero would draw for a picked channel URL: the downloaded
 * copy when it is really on disk, else the remote URL, else null when the
 * channel is unknown or has no banner at all. Mirrors the script's own
 * local-then-remote preference so the preview never disagrees with the note.
 */
export function heroBannerSource(
	app: App,
	state: SyncState,
	outputFolder: string,
	imagesFolder: string | undefined,
	url: string,
): string | null {
	const wanted = normUrl(url);
	if (!wanted) return null;
	const banners = outputPaths(outputFolder, imagesFolder).banners;
	for (const [id, channel] of Object.entries(state.channels)) {
		if (normUrl(channel.url) !== wanted) continue;
		if (!channel.banner) return null;
		const local = app.vault.getAbstractFileByPath(`${banners}/${channelBannerImageBase(channel.title, id)}.jpg`);
		return local instanceof TFile ? app.vault.getResourcePath(local) : channel.banner;
	}
	return null;
}

/**
 * One crop row. Returns a setter so a later pick in the row above can point
 * the preview at the new channel's banner without re-rendering the page.
 */
export function heroFocusSetting(
	card: HTMLElement,
	options: HeroFocusRowOptions,
): (url: string) => void {
	const { plugin } = options;
	let focus = verticalOnly(normalizeHeroFocus(plugin.settings.dashboardHeroFocus));
	// True between the first press and the release that ends the gesture, so
	// one drag saves once instead of once per pixel.
	let dirty = false;

	const row = new Setting(card).setName(options.name).setDesc(options.desc);

	const stage = row.controlEl.createDiv({ cls: 'lifeline-hero-focus' });
	stage.style.width = `${PREVIEW_WIDTH}px`;
	// Track the live hero's shape so this preview crops on the same axis the
	// hero will, at any pane width. Re-read on each gesture and on a new pick,
	// since the pane (and so the hero) can change between interactions.
	const syncShape = (): void => {
		const want = PREVIEW_WIDTH / heroAspect();
		stage.style.height = `${Math.round(Math.min(PREVIEW_MAX_HEIGHT, Math.max(PREVIEW_MIN_HEIGHT, want)))}px`;
	};
	syncShape();
	stage.tabIndex = 0; // focusable: arrow keys move the crop without a mouse
	stage.setAttribute('role', 'application');
	stage.setAttribute(
		'aria-label',
		'Banner crop position. Arrow keys move the shown part of the banner, home recenters.',
	);

	const img = stage.createEl('img', { cls: 'lifeline-hero-focus-img' });
	const dot = stage.createDiv({ cls: 'lifeline-hero-focus-dot' });
	const hint = row.controlEl.createDiv({ cls: 'lifeline-hero-focus-hint' });
	hint.setText('Pick a channel with a banner to crop it.');

	/** Paint the stored point onto the preview: same property the hero uses. */
	const paint = (): void => {
		const pos = `${focus.x}% ${focus.y}%`;
		img.style.objectPosition = pos;
		dot.style.left = `${focus.x}%`;
		dot.style.top = `${focus.y}%`;
	};

	/** Store a new point and tell the page, so the open dashboard follows.
	 *  Clamps the local copy too: a drag past the preview's edge can leave it
	 *  momentarily out of range, and the next paint should show what was saved. */
	const commit = (): void => {
		if (!dirty) return;
		dirty = false;
		focus = verticalOnly(normalizeHeroFocus(focus));
		paint();
		void options.commit(focus);
	};

	/** Convert a click inside the preview to a point on the image. */
	const pointAt = (event: MouseEvent): HeroFocusPoint => {
		const rect = stage.getBoundingClientRect();
		if (!rect.width || !rect.height) return focus;
		return verticalOnly({
			x: DEFAULT_HERO_FOCUS.x,
			y: ((event.clientY - rect.top) / rect.height) * 100,
		});
	};

	stage.addEventListener('mousedown', (event) => {
		if (!img.src) return;
		syncShape();
		event.preventDefault();
		focus = pointAt(event);
		dirty = true;
		paint();
		// Drag to sweep the crop; the save lands on mouseup, not per pixel.
		const move = (moveEvent: MouseEvent): void => {
			focus = pointAt(moveEvent);
			paint();
		};
		const up = (): void => {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', up);
			commit();
		};
		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', up);
	});

	stage.addEventListener('keydown', (event) => {
		if (!img.src) return;
		const step = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
		let dy = 0;
		if (event.key === 'ArrowUp') dy = -step;
		else if (event.key === 'ArrowDown') dy = step;
		else if (event.key === 'Home') {
			focus = { ...DEFAULT_HERO_FOCUS };
			dirty = true;
			paint();
			event.preventDefault();
			return;
		} else return;
		event.preventDefault();
		focus = verticalOnly(normalizeHeroFocus({ x: focus.x, y: focus.y + dy }));
		dirty = true;
		paint();
	});

	// A held key repeats keydown but fires keyup once: save then.
	stage.addEventListener('keyup', commit);
	stage.addEventListener('blur', commit);

	row.addExtraButton((button) =>
		button
			.setIcon('locate-fixed')
			.setTooltip('Recenter the crop')
			.onClick(() => {
				if (!img.src) return;
				focus = { ...DEFAULT_HERO_FOCUS };
				dirty = true;
				paint();
				commit();
			}),
	);

	/** Point the preview at a (possibly new) picked channel URL. */
	return (url: string): void => {
		const src = url
			? heroBannerSource(
					plugin.app,
					plugin.state,
					plugin.settings.outputFolder,
					plugin.settings.imagesFolder,
					url,
				)
			: null;
		const has = Boolean(src);
		stage.style.display = has ? '' : 'none';
		hint.style.display = has ? 'none' : '';
		if (!has) {
			img.removeAttribute('src');
			return;
		}
		img.src = src as string;
		syncShape();
		// Re-read in case the pick changed since this page first drew.
		focus = verticalOnly(normalizeHeroFocus(plugin.settings.dashboardHeroFocus));
		paint();
	};
}
