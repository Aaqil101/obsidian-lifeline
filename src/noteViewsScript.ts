/**
 * Note-view scripts: the optional DataviewJS views that sit above the
 * inline-field entries in Channels.md, every playlist note, and Watch
 * Later.md. One generated script per note type, so each note calls its own
 * file once:
 *
 *   dv.view("<scriptsFolder>/lifeline-channels", { layout: "poster", fields: {...} })
 *   dv.view("<scriptsFolder>/lifeline-playlists", { layout: "poster" })
 *   dv.view("<scriptsFolder>/lifeline-watchlater", { layout: "poster" })
 *
 * The section (channels or playlist) is baked into each script rather than
 * passed in, along with the note type, which is the key each view reads and
 * writes its layout under. Layouts: poster, chips, and table on every kind of
 * note. The old cards layout is gone; Channels draws Ambient as its poster
 * and Split as its chips, while the video lists draw Cinema and Ticket, and
 * each kind has its own table (Cover rows and Ledger). Every layout reads the
 * calling note's own list entries via dv.current().file.lists, so the view
 * always mirrors the bullets below it and needs no vault-wide query.
 *
 * Each view opens with a glass pill toolbar: the search box with the result
 * count inside it, a "search in" scope select, a segmented Layout control,
 * and an icon-only Refresh button. The segmented control drives a hidden
 * native select, which stays the single value source, switches the rendering
 * immediately, writes the choice back into the plugin's settings under this
 * note type's own key (the same slot the three settings rows edit), and then
 * refreshes every open view the way Dataview's own force-refresh command
 * does, so no sync is needed: the script prefers the live setting over the
 * layout baked into the note, and the baked value is only a fallback for
 * when the plugin instance cannot be reached.
 *
 * Sync writes the three scripts and their stylesheets whenever the "Views in
 * notes" setting is on (sync.ts: writeNoteViewScripts), trashes copies left
 * in a previous scripts folder (shared dashboardScriptsFolderWritten
 * tracking), and does the same for the stylesheets in a previous styles
 * folder (stylesFolderWritten). Written regardless of Dataview state: a
 * degraded note simply omits the block, and the scripts are ready when
 * Dataview comes back.
 *
 * The view chrome lives in per-kind vault files: lifeline-channels.css,
 * lifeline-playlists.css, and lifeline-watchlater.css in the configured
 * styles folder, exactly like quotebook and its quotebook.css. Sync writes
 * one file per kind, each sheet carrying that kind's three designs plus the
 * shared glass toolbar, and each generated script caches its own file's path
 * and reads it at view time with app.vault.cachedRead, injecting it once
 * under its own style id, so the CSS can be themed, overridden, or updated
 * without regenerating the scripts. With the file missing the view still
 * works, just unstyled. The superseded single lifeline-views.css is cleaned
 * up by sync.
 *
 * The scripts make no network request of their own. They read the image
 * fields the sync appended to the bullet (thumbnail/avatar for a local vault
 * file, thumbnail_url/avatar_url for a remote URL), and read the stylesheet
 * from the vault itself.
 *
 * Pure: this module only builds strings; sync.ts owns the vault writes.
 */
import { DASHBOARD_STYLESHEET_FILE, normalizeScriptsFolder } from './dashboardScript';

/** Which note a generated view script serves. */
export type NoteViewKind = 'channels' | 'playlists' | 'watchlater';

/** Every kind, in write order. */
export const NOTE_VIEW_KINDS: NoteViewKind[] = ['channels', 'playlists', 'watchlater'];

/** Generated file names inside the scripts folder, one per note type. */
const NOTE_VIEW_SCRIPT_FILES: Record<NoteViewKind, string> = {
	channels: 'lifeline-channels.js',
	playlists: 'lifeline-playlists.js',
	watchlater: 'lifeline-watchlater.js',
};

/** Generated stylesheet names inside the styles folder, one per note type:
 *  each script reads its own file at view time, so a broken or missing sheet
 *  only unstyles one kind of view while the others keep their look. */
const NOTE_VIEW_STYLESHEET_FILES: Record<NoteViewKind, string> = {
	channels: 'lifeline-channels.css',
	playlists: 'lifeline-playlists.css',
	watchlater: 'lifeline-watchlater.css',
};

/** The section each script bakes in: channels for Channels.md, playlist for
 *  the two video-list scripts. */
const NOTE_VIEW_SECTIONS: Record<NoteViewKind, 'channels' | 'playlist'> = {
	channels: 'channels',
	playlists: 'playlist',
	watchlater: 'playlist',
};

/** The note each script serves, for the generated header comment. */
const NOTE_VIEW_NOTES: Record<NoteViewKind, string> = {
	channels: 'Channels.md',
	playlists: 'every playlist note under Playlists/',
	watchlater: 'Watch Later.md',
};

/** Vault path of one generated script, e.g. `98 - Organize/Scripts/lifeline-channels.js`. */
export function noteViewScriptPath(kind: NoteViewKind, folder: string): string {
	return `${normalizeScriptsFolder(folder)}/${NOTE_VIEW_SCRIPT_FILES[kind]}`;
}

/** dv.view() target: the script path without the `.js` extension. */
export function noteViewViewName(kind: NoteViewKind, folder: string): string {
	return noteViewScriptPath(kind, folder).replace(/\.js$/, '');
}

/** Pre-split name, superseded by the three scripts above. Sync deletes it
 *  once every note has been rewritten onto the new view names. */
export const LEGACY_NOTE_VIEWS_SCRIPT_FILE = 'lifeline-noteviews.js';

/** Pre-rename name (the note views were once called note tables). It gets
 *  the same cleanup treatment as the pre-split name. */
export const LEGACY_TABLES_SCRIPT_FILE = 'lifeline-tables.js';

/** Vault path of the pre-split single view script. */
export function legacyNoteViewsScriptPath(folder: string): string {
	return `${normalizeScriptsFolder(folder)}/${LEGACY_NOTE_VIEWS_SCRIPT_FILE}`;
}

/** Vault path of the pre-rename note-tables script. */
export function legacyTablesScriptPath(folder: string): string {
	return `${normalizeScriptsFolder(folder)}/${LEGACY_TABLES_SCRIPT_FILE}`;
}

/** Default folder for the generated stylesheets (also the settings placeholder). */
export const DEFAULT_STYLES_FOLDER = '98 - Organize/Styles';

/** Pre-split name of the single shared stylesheet. Per-kind sheets have
 *  replaced it; sync deletes the old file once the new ones are written. */
export const LEGACY_VIEWS_STYLESHEET_FILE = 'lifeline-views.css';

/**
 * Normalize a user-entered styles folder: forward slashes, no duplicate or
 * edge slashes, trimmed. Empty (or slash-only) input falls back to the
 * default folder, so clearing the setting never writes to the vault root.
 * Same shape as normalizeScriptsFolder, kept local so dashboardScript.ts
 * stays dashboard-only.
 */
export function normalizeStylesFolder(folder: string): string {
	const cleaned = folder
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	return cleaned || DEFAULT_STYLES_FOLDER;
}

/** Vault path of one generated stylesheet, e.g. `98 - Organize/Styles/lifeline-channels.css`. */
export function viewsStylesheetPath(kind: NoteViewKind, folder: string): string {
	return `${normalizeStylesFolder(folder)}/${NOTE_VIEW_STYLESHEET_FILES[kind]}`;
}

/** Vault path of the pre-split single stylesheet, for the cleanup pass. */
export function legacyViewsStylesheetPath(folder: string): string {
	return `${normalizeStylesFolder(folder)}/${LEGACY_VIEWS_STYLESHEET_FILE}`;
}

/** Vault path of the dashboard stylesheet in a styles folder, kept beside the
 *  per-kind helpers so sync can write the folder's sheets together. */
export function dashboardStylesheetPath(folder: string): string {
	return `${normalizeStylesFolder(folder)}/${DASHBOARD_STYLESHEET_FILE}`;
}

/** How many entries any layout paints before Show more, for an
 *  install with no saved preference and for a render where the plugin
 *  instance cannot be reached. The live setting (`viewPageSize`) wins
 *  otherwise, so changing it needs no sync. */
export const DEFAULT_VIEW_PAGE_SIZE = 10;

/** Bounds for a page size, applied to what the settings row accepts and again
 *  at render time, so a stray value can neither paint a whole 900-entry note
 *  nor shrink the page to nothing. */
export const MIN_VIEW_PAGE_SIZE = 1;
export const MAX_VIEW_PAGE_SIZE = 1000;

/** Clamp a stored or typed page size to a whole number inside those bounds.
 *  Anything unusable (missing, blank, NaN) falls back to the default, and a
 *  number out of range is pulled to the nearest bound. */
export function normalizeViewPageSize(value: unknown): number {
	const raw = typeof value === 'string' ? value.trim() : value;
	if (raw == null || raw === '') return DEFAULT_VIEW_PAGE_SIZE;
	const n = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(n)) return DEFAULT_VIEW_PAGE_SIZE;
	return Math.min(MAX_VIEW_PAGE_SIZE, Math.max(MIN_VIEW_PAGE_SIZE, Math.floor(n)));
}

/** Debounce for the toolbar search box, matching the quotebook script. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * View chrome shared by every note view, scoped under the `.lifeline-views`
 * class that the script adds to its container: the glass toolbar (search pill
 * with the count inside it, scope select, segmented layout control, icon-only
 * refresh), plus the pieces every design shares (chips row, poster card,
 * thumbnail, Show more button).
 *
 * The per-kind sheets (NOTE_VIEWS_CSS_BY_KIND) assemble this plus the three
 * designs a kind can select; sync writes one file per kind into the styles
 * folder and the generated script reads that file at view time and injects
 * it, so restyling never needs a code change here.
 */
const NOTE_VIEWS_CSS_SHARED = `
.lifeline-views .lv-toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 2px 0 12px;
    padding: 0;
}
.lifeline-views .lv-toolbar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
/* The search pill and its count are one object: the input owns the shape,
   the stats sit inside its right edge. */
.lifeline-views .lv-glass-wrap {
    position: relative;
    flex: 1 1 300px;
    min-width: 220px;
}
.lifeline-views .lv-search {
    width: 100%;
    flex: none;
    min-height: 36px;
    padding: 0 96px 0 38px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background-color: var(--background-primary);
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round'%3e%3ccircle cx='11' cy='11' r='7'/%3e%3cpath d='m20 20-3.5-3.5'/%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: 16px center;
    background-size: 15px;
    color: var(--text-normal);
    font-size: 13px;
}
.lifeline-views .lv-search:focus {
    outline: none;
    border-color: var(--background-modifier-border-hover, var(--text-muted));
    box-shadow: none;
}
.lifeline-views .lv-search::placeholder {
    color: var(--text-faint);
    font-style: normal;
}
.lifeline-views .lv-stats {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    cursor: help;
}
.lifeline-views .lv-stats:empty {
    display: none;
}
.lifeline-views .lv-select {
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background-color: var(--background-primary);
    color: var(--text-muted);
    font-size: 13px;
    max-width: none;
    box-shadow: none;
}
.lifeline-views .lv-select option {
    background-color: var(--background-secondary);
    color: var(--text-normal);
}
.lifeline-views .lv-select:focus,
.lifeline-views .lv-select:hover {
    outline: none;
    box-shadow: none;
    color: var(--text-normal);
    border-color: var(--background-modifier-border-hover, var(--background-modifier-border));
}
/* Segmented layout control: three real buttons over the native select, which
   stays in the DOM (hidden) as the single value source. */
.lifeline-views .lv-seg {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 36px;
    padding: 3px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background: var(--background-primary);
}
.lifeline-views .lv-seg-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
}
.lifeline-views .lv-seg-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.lifeline-views .lv-seg-btn.on {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.lifeline-views .lv-refresh {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background: var(--background-primary);
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: none;
}
.lifeline-views .lv-refresh:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.lifeline-views .lv-refresh svg {
    display: block;
    width: 17px;
    height: 17px;
    fill: currentColor;
}
.lifeline-views .lv-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 14px;
}
/* A date that is a wiki link opens its journal note from any layout. It keeps
   the layout's own date look, with the underline reserved for hover, so the
   only visual change is the pointer. */
.lifeline-views a.internal-link {
    text-decoration: none;
    cursor: pointer;
}
.lifeline-views a.internal-link:hover {
    text-decoration: underline;
}
/* Chips: the base row both chip designs start from. */
.lifeline-views .lv-chips {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 8px 0 14px;
}
.lifeline-views .lv-chip {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid var(--background-modifier-border);
    border-left: 3px solid var(--text-accent, var(--interactive-accent));
    border-radius: var(--radius-s, 6px);
    background: var(--background-secondary);
}
.lifeline-views .lv-chip:hover {
    background: var(--background-modifier-hover);
}
.lifeline-views .lv-thumb {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-s, 6px);
    overflow: hidden;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-weight: 600;
}
.lifeline-views .lv-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-body {
    min-width: 0;
}
.lifeline-views .lv-title {
    font-weight: 600;
    text-decoration: none;
}
.lifeline-views .lv-title:hover {
    text-decoration: underline;
}
.lifeline-views .lv-meta {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.85em;
}
.lifeline-views .lv-more {
    width: 100%;
    margin-top: 0;
    padding: 10px 16px;
    cursor: pointer;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 6px);
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 14px;
    font-weight: 500;
}
.lifeline-views .lv-more:hover {
    background: var(--background-modifier-hover);
}
/* In a grid the Show more button takes a whole row rather than a cell. */
.lifeline-views .lv-posters .lv-more {
    grid-column: 1 / -1;
}
/* Poster: the card shell both poster designs share. */
.lifeline-views .lv-posters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
    gap: 20px;
    margin: 8px 0 16px;
}
.lifeline-views .lv-poster-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-secondary);
    overflow: hidden;
    transition: box-shadow 0.15s ease;
}
.lifeline-views .lv-poster-card:hover {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.lifeline-views .lv-poster-banner {
    position: relative;
    height: 150px;
    background: var(--background-modifier-border);
}
.lifeline-views .lv-poster-banner img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-poster-avatar {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-weight: 600;
}
.lifeline-views .lv-poster-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
@media (max-width: 700px) {
    .lifeline-views .lv-glass-wrap {
        flex-basis: 100%;
    }
    .lifeline-views .lv-glass-wrap .lv-search {
        padding-right: 16px;
    }
    .lifeline-views .lv-glass-wrap .lv-stats {
        display: none;
    }
}
`;

/**
 * Channels chips: Split. Identity on the left, a tinted pane on the right
 * holding the counts and the subscribe date.
 */
const NOTE_VIEWS_CSS_CHANNELS_CHIPS = `
.lifeline-views .lv-chip--split {
    padding: 0;
    gap: 0;
    align-items: stretch;
    flex-wrap: wrap;
    overflow: hidden;
}
.lifeline-views .lv-chip--split .lv-thumb {
    width: 40px;
    height: 40px;
    border-radius: 50%;
}
.lifeline-views .lv-chip--split .lv-chip-main {
    flex: 1 1 220px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 11px 16px;
}
.lifeline-views .lv-chip--split .lv-chip-pane {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    padding: 9px 14px;
    border-left: 1px solid var(--background-modifier-border);
    background: var(--background-secondary-alt, var(--background-modifier-hover));
}
.lifeline-views .lv-chip--split .lv-chip-stats {
    display: flex;
    align-items: baseline;
    gap: 12px;
}
.lifeline-views .lv-chip--split .lv-chip-stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.lifeline-views .lv-chip--split .lv-chip-stat-v {
    font-weight: 700;
    font-size: 0.86em;
}
.lifeline-views .lv-chip--split .lv-chip-stat-l {
    color: var(--text-muted);
    font-size: 0.6em;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}
.lifeline-views .lv-chip--split .lv-chip-since {
    color: var(--text-muted);
    font-size: 0.68em;
    font-variant-numeric: tabular-nums;
}
.lifeline-views .lv-chip--split .lv-chip-since .lv-chip-since-date {
    color: var(--text-accent, var(--link-color));
    font-weight: 600;
}
@media (max-width: 700px) {
    .lifeline-views .lv-chip--split .lv-chip-pane {
        flex: 1 1 100%;
        border-left: none;
        border-top: 1px solid var(--background-modifier-border);
    }
}
`;

/**
 * Channels table: Cover rows. The banner leads each row as a small blurred
 * crop with the avatar over it, the identity meta sits under the name, and
 * the dates stack in a tracked column.
 */
const NOTE_VIEWS_CSS_CHANNELS_TABLE = `
.lifeline-views .lv-cover {
    display: flex;
    flex-direction: column;
    overflow-x: auto;
}
/* The Show more button sits under the table (rows are paged into the tbody),
   so it needs the space the chips/poster gaps would otherwise give it. */
.lifeline-views .lv-cover .lv-more {
    margin: 14px 0;
}
.lifeline-views .lv-cover-table {
    width: 100%;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    border-collapse: separate;
    border-spacing: 0;
    overflow: hidden;
    background: var(--background-secondary);
    font-size: 0.88em;
}
.lifeline-views .lv-cover-table th {
    padding: 8px 12px;
    text-align: left;
    color: var(--text-faint);
    font-size: 0.66em;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    white-space: nowrap;
    background: var(--background-secondary-alt, var(--background-modifier-hover));
    border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-views .lv-cover-table td {
    padding: 9px 12px;
    vertical-align: middle;
}
.lifeline-views .lv-cover-table th.lv-cover-num,
.lifeline-views .lv-cover-table td.lv-cover-num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.lifeline-views .lv-cover-table tbody tr + tr td {
    border-top: 1px solid var(--background-modifier-border);
}
.lifeline-views .lv-cover-table tbody tr:hover td {
    background: var(--background-modifier-hover);
}
.lifeline-views .lv-cover-who {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}
.lifeline-views .lv-cover-art {
    position: relative;
    flex: 0 0 auto;
    width: 124px;
    height: 64px;
    border-radius: 10px;
    overflow: hidden;
    background: linear-gradient(
        135deg,
        var(--background-modifier-border),
        var(--background-secondary-alt, var(--background-secondary))
    );
}
.lifeline-views .lv-cover-art > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Soft focus on the banner so the sharp avatar badge sits in front of it. */
    filter: blur(2px) brightness(0.7) saturate(1.05);
    transform: scale(1.06);
    transition: transform 0.35s ease, filter 0.35s ease;
}
.lifeline-views .lv-cover-table tbody tr:hover .lv-cover-art > img {
    filter: blur(1.2px) brightness(0.74) saturate(1.05);
    transform: scale(1.12);
}
.lifeline-views .lv-cover-av {
    position: absolute;
    left: 10px;
    bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: 3px solid var(--background-secondary);
    border-radius: 50%;
    overflow: hidden;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 1.2em;
    font-weight: 700;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
}
.lifeline-views .lv-cover-av img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-cover-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.lifeline-views .lv-cover-name a {
    color: var(--text-normal);
    font-weight: 650;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lifeline-views .lv-cover-name a:hover {
    color: var(--link-color, var(--text-accent));
    text-decoration: underline;
}
.lifeline-views .lv-cover-handle {
    color: var(--text-muted);
    font-size: 0.78em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lifeline-views .lv-cover-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--text-muted);
    font-size: 0.72em;
}
.lifeline-views .lv-cover-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
}
.lifeline-views .lv-cover-id {
    color: var(--text-faint);
    font-family: var(--font-monospace, monospace);
    font-size: 1em;
    white-space: nowrap;
    cursor: help;
}
.lifeline-views .lv-cover-country {
    display: inline-block;
    padding: 1px 6px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 5px;
    font-size: 0.95em;
    letter-spacing: 0.06em;
}
.lifeline-views .lv-cover-status {
    display: inline-flex;
    align-items: center;
    font-size: 1em;
    white-space: nowrap;
}
.lifeline-views .lv-cover-table th.lv-cover-track-h,
.lifeline-views .lv-cover-table td.lv-cover-track {
    text-align: right;
    white-space: nowrap;
}
.lifeline-views .lv-cover-track-row {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 7px;
    line-height: 1.45;
}
.lifeline-views .lv-cover-track-l {
    color: var(--text-faint);
    font-size: 0.62em;
    letter-spacing: 0.07em;
    text-transform: uppercase;
}
.lifeline-views .lv-cover-track-v {
    color: var(--text-muted);
    font-size: 0.76em;
    font-variant-numeric: tabular-nums;
}
.lifeline-views .lv-cover-track-row:first-child .lv-cover-track-v {
    color: var(--text-normal);
}
`;

/**
 * Channels poster: Ambient. The banner becomes a blurred backdrop behind a
 * centred identity, with the counts as glass chips. No subscribe badge and no
 * journal button: the date lives in the Split chips row and the Cover rows
 * table instead.
 */
const NOTE_VIEWS_CSS_CHANNELS_POSTER = `
.lifeline-views .lv-amb {
    position: relative;
    min-height: 224px;
    justify-content: flex-end;
    border: none;
    border-radius: 16px;
    background: linear-gradient(135deg, #4a3a55, #1f2229);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.lifeline-views .lv-amb:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32);
}
.lifeline-views .lv-amb-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
}
.lifeline-views .lv-amb-bg img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(5px) brightness(0.62) saturate(1.1);
    transform: scale(1.06);
}
.lifeline-views .lv-amb-bg::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
        ellipse at 50% 30%,
        transparent 20%,
        rgba(0, 0, 0, 0.45)
    );
}
.lifeline-views .lv-amb-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 100%;
    padding: 22px 16px 18px;
    text-align: center;
}
.lifeline-views .lv-amb .lv-poster-avatar {
    width: 66px;
    height: 66px;
    margin: 0;
    border: 2px solid rgba(255, 255, 255, 0.55);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.22), 0 6px 16px rgba(0, 0, 0, 0.35);
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 1.5em;
}
.lifeline-views .lv-amb-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #ffffff;
    font-size: 1.04em;
    font-weight: 700;
    line-height: 1.25;
    text-decoration: none;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}
.lifeline-views .lv-amb-name:hover {
    color: #ffffff;
    text-decoration: underline;
}
.lifeline-views .lv-amb-handle {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.78em;
}
.lifeline-views .lv-amb-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 7px;
}
.lifeline-views .lv-amb-chip {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 4px 9px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.13);
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.68em;
    transition: border-color 0.18s ease, background 0.18s ease;
}
.lifeline-views .lv-amb:hover .lv-amb-chip {
    background: rgba(255, 255, 255, 0.18);
}
.lifeline-views .lv-amb-chip b {
    color: #ffffff;
    font-variant-numeric: tabular-nums;
}
`;

/**
 * Video chips: Ticket. A thumbnail and two-line title on the left, the
 * channel with its joined avatar underneath, and a date stub behind a dashed
 * tear line on the right.
 */
const NOTE_VIEWS_CSS_VIDEO_CHIPS = `
.lifeline-views .lv-chip--ticket {
    padding: 0;
    gap: 0;
    align-items: stretch;
    overflow: hidden;
    border-left: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.lifeline-views .lv-chip--ticket:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
}
.lifeline-views .lv-chip--ticket .lv-chip-main {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 9px 12px;
}
.lifeline-views .lv-chip--ticket .lv-thumb {
    width: 88px;
    height: 50px;
    border-radius: 8px;
}
.lifeline-views .lv-chip--ticket .lv-thumb img {
    transition: transform 0.3s ease;
}
.lifeline-views .lv-chip--ticket:hover .lv-thumb img {
    transform: scale(1.06);
}
.lifeline-views .lv-chip--ticket .lv-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.lifeline-views .lv-chip--ticket .lv-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
    color: var(--text-normal);
}
.lifeline-views .lv-chip--ticket .lv-title:hover {
    color: var(--link-color, var(--text-accent));
}
.lifeline-views .lv-chip--ticket .lv-meta--ticket {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.lifeline-views .lv-ticket-face {
    flex: 0 0 auto;
    display: inline-flex;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--background-modifier-border);
}
.lifeline-views .lv-ticket-face img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-ticket-chan {
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lifeline-views .lv-ticket-chan:hover {
    color: var(--text-normal);
    text-decoration: underline;
}
.lifeline-views .lv-ticket-stub {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 88px;
    padding: 8px 10px;
    border-left: 1px dashed var(--background-modifier-border);
    background: var(--background-secondary-alt, var(--background-modifier-hover));
}
.lifeline-views .lv-ticket-mon {
    color: var(--text-muted);
    font-size: 0.62em;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}
/* A linked stub (the day's journal note): the whole tear-off is the target, so
   brighten it on hover instead of underlining three stacked lines. */
.lifeline-views a.lv-ticket-stub:hover {
    text-decoration: none;
    background: var(--background-modifier-hover);
}
.lifeline-views a.lv-ticket-stub:hover .lv-ticket-day {
    color: var(--link-color, var(--text-accent));
}
.lifeline-views .lv-ticket-day {
    color: var(--text-normal);
    font-size: 1.24em;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}
.lifeline-views .lv-ticket-yr {
    color: var(--text-faint);
    font-size: 0.62em;
    font-variant-numeric: tabular-nums;
}
`;

/**
 * Video table: Ledger. The plain directory table with the thumbnail and title
 * in the first column, the channel next to it, and the date at the right edge.
 */
const NOTE_VIEWS_CSS_VIDEO_TABLE = `
.lifeline-views .lv-ledger {
    display: flex;
    flex-direction: column;
    overflow-x: auto;
}
/* The Show more button sits under the table (rows are paged into the tbody),
   so it needs the space the chips/poster gaps would otherwise give it. */
.lifeline-views .lv-ledger .lv-more {
    margin: 14px 0;
}
.lifeline-views .lv-ledger-table {
    width: 100%;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    border-collapse: separate;
    border-spacing: 0;
    overflow: hidden;
    background: var(--background-secondary);
    font-size: 0.88em;
}
.lifeline-views .lv-ledger-table th {
    padding: 8px 12px;
    text-align: left;
    color: var(--text-faint);
    font-size: 0.66em;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    white-space: nowrap;
    background: var(--background-secondary-alt, var(--background-modifier-hover));
    border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-views .lv-ledger-table td {
    padding: 9px 12px;
    vertical-align: middle;
}
.lifeline-views .lv-ledger-table th.lv-r,
.lifeline-views .lv-ledger-table td.lv-r {
    text-align: right;
}
.lifeline-views .lv-ledger-table tbody tr + tr td {
    border-top: 1px solid var(--background-modifier-border);
}
.lifeline-views .lv-ledger-table tbody tr:hover td {
    background: var(--background-modifier-hover);
}
.lifeline-views .lv-ledger-thumb {
    flex: 0 0 auto;
    width: 72px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--background-modifier-border);
}
.lifeline-views .lv-ledger-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-ledger-who {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}
.lifeline-views .lv-ledger-stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.lifeline-views .lv-ledger-title {
    color: var(--text-normal);
    font-weight: 600;
    line-height: 1.3;
    text-decoration: none;
    overflow-wrap: break-word;
    white-space: normal;
}
.lifeline-views .lv-ledger-title:hover {
    color: var(--link-color, var(--text-accent));
    text-decoration: underline;
}
.lifeline-views .lv-ledger-chan {
    color: var(--text-muted);
    font-size: 0.8em;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lifeline-views .lv-ledger-chan:hover {
    color: var(--text-normal);
    text-decoration: underline;
}
.lifeline-views .lv-ledger-date {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
`;

/**
 * Video poster: Cinema. The thumbnail is full-bleed 16:9, a date pill and a
 * hover play button sit on it, and the title and channel ride a gradient veil
 * at its foot. A video with no thumbnail keeps the frame and shows the title's
 * initial instead of an empty box.
 */
const NOTE_VIEWS_CSS_VIDEO_POSTER = `
.lifeline-views .lv-poster-cinema .lv-poster-banner {
    height: auto;
    aspect-ratio: 16 / 9;
}
.lifeline-views .lv-poster-cinema .lv-poster-banner img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
}
.lifeline-views .lv-poster-cinema:hover .lv-poster-banner img {
    transform: scale(1.045);
}
.lifeline-views .lv-cine-pill {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 4;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.68em;
    font-variant-numeric: tabular-nums;
    backdrop-filter: blur(6px);
}
.lifeline-views a.lv-cine-pill:hover {
    color: #ffffff;
}
.lifeline-views .lv-cine-play {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: auto;
    height: auto;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    box-sizing: border-box;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.18s ease;
}
.lifeline-views .lv-poster-cinema:hover .lv-cine-play,
.lifeline-views .lv-cine-play:focus-visible {
    opacity: 1;
}
.lifeline-views .lv-cine-play-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border: 2px solid rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.62);
}
.lifeline-views .lv-cine-play svg {
    display: block;
    width: 20px;
    height: 20px;
    margin-left: 2px;
    fill: #ffffff;
}
/* The veil sits above the play overlay so the title and channel links stay
   clickable; it steps aside on hover to expose the play button. */
.lifeline-views .lv-cine-veil {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 30px 12px 11px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.88));
    transition: opacity 0.18s ease;
}
.lifeline-views .lv-poster-cinema:hover .lv-cine-veil {
    opacity: 0;
    pointer-events: none;
}
.lifeline-views .lv-cine-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: #ffffff;
    font-size: 0.95em;
    font-weight: 650;
    line-height: 1.3;
    text-decoration: none;
}
.lifeline-views .lv-cine-title:hover {
    color: #ffffff;
    text-decoration: underline;
}
.lifeline-views .lv-cine-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.72em;
}
.lifeline-views .lv-cine-channel {
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lifeline-views .lv-cine-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
    color: #ffffff;
    font-size: 0.62em;
    font-weight: 700;
    text-transform: uppercase;
}
.lifeline-views .lv-cine-badge img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-cine-badge--img {
    background: rgba(255, 255, 255, 0.15);
}
.lifeline-views .lv-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
/* No thumbnail (or a dead one): the frame stays, and the title's initial sits
   centred in it, dim enough to read as art rather than as a label. */
.lifeline-views .lv-cine-fallback {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: center;
    font-size: 2.2em;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.22);
}
.lifeline-views .lv-cine-noimg .lv-cine-fallback {
    display: flex;
}
.lifeline-views .lv-cine-noimg {
    background: linear-gradient(135deg, var(--background-modifier-border), var(--background-secondary-alt, var(--background-secondary)));
}
`;

/** One stylesheet per note kind: each script bakes its own file's path and
 *  reads it at view time. Every kind offers Poster, Chips, and Table, so each
 *  sheet carries the three designs for its own note shape and nothing else. */
export const NOTE_VIEWS_CSS_BY_KIND: Record<NoteViewKind, string> = {
	channels: NOTE_VIEWS_CSS_SHARED + NOTE_VIEWS_CSS_CHANNELS_CHIPS + NOTE_VIEWS_CSS_CHANNELS_TABLE + NOTE_VIEWS_CSS_CHANNELS_POSTER,
	playlists: NOTE_VIEWS_CSS_SHARED + NOTE_VIEWS_CSS_VIDEO_CHIPS + NOTE_VIEWS_CSS_VIDEO_TABLE + NOTE_VIEWS_CSS_VIDEO_POSTER,
	watchlater: NOTE_VIEWS_CSS_SHARED + NOTE_VIEWS_CSS_VIDEO_CHIPS + NOTE_VIEWS_CSS_VIDEO_TABLE + NOTE_VIEWS_CSS_VIDEO_POSTER,
};

/**
 * Channels layout builders, embedded verbatim into the channels script only.
 * Like the rest of the generated code it uses string concatenation and no
 * backticks. Image data comes off the bullet's own fields through the shared
 * helpers; the only network request an <img> ever makes is for a remote
 * *_url avatar or banner the user chose not to download.
 */
const NOTE_VIEWS_CHANNELS_JS = `
// ---------------------------------------------------------------------------
// Channels layouts: Ambient poster, Split chips, Cover rows table
// ---------------------------------------------------------------------------

// The avatar as its own ringed circle; with no image it carries the initial.
const posterAvatar = (item, label) => {
  const badge = el("div", "lv-poster-avatar");
  const src = imageSrc(mdImage(item));
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = label == null ? "" : String(label);
    img.loading = "lazy";
    img.addEventListener("error", () => {
      badge.textContent = initialOf(label);
    });
    badge.appendChild(img);
  } else {
    badge.textContent = initialOf(label);
  }
  return badge;
};

// Poster layout: Ambient. The banner is a blurred backdrop behind a centred
// identity, and the counts are glass chips. No subscribe badge and no journal
// button: the date lives in the Split chips row and the Cover rows table.
const ambientChip = (num, label) => {
  if (typeof num !== "number") return null;
  const chip = el("span", "lv-amb-chip");
  chip.appendChild(el("b", null, fmtShort(num)));
  chip.appendChild(el("span", null, label));
  chip.title = Number(num).toLocaleString("en-US") + " " + label;
  return chip;
};

const posterCard = (item) => {
  const link = mdLink(item.channel);
  const node = el("article", "lv-poster-card lv-amb");

  const backdrop = el("div", "lv-amb-bg");
  const bannerSrc = imageSrc(mdBanner(item));
  if (bannerSrc) {
    const img = document.createElement("img");
    img.src = bannerSrc;
    img.alt = "";
    img.loading = "lazy";
    // A dead banner link leaves the gradient backdrop behind, never a
    // broken-image icon.
    img.addEventListener("error", () => img.remove());
    backdrop.appendChild(img);
  }
  node.appendChild(backdrop);

  const body = el("div", "lv-amb-body");
  body.appendChild(posterAvatar(item, link.label));
  body.appendChild(linkNode(link.label, link.href, "lv-amb-name"));
  if (item.handle) body.appendChild(el("div", "lv-amb-handle", String(item.handle)));
  const chips = el("div", "lv-amb-chips");
  const count = (key, num, label) => {
    if (!want(key)) return;
    const chip = ambientChip(num, label);
    if (chip) chips.appendChild(chip);
  };
  count("subscribers", item.subscribers, "subs");
  count("videos", item.videos, "videos");
  count("views", item.views, "views");
  if (chips.childElementCount) body.appendChild(chips);
  node.appendChild(body);
  return node;
};

// Chips layout: Split. Identity on the left, a tinted pane on the right with
// the counts and the subscribe date.
const chipRow = (item) => {
  const link = mdLink(item.channel);
  const row = el("div", "lv-chip lv-chip--split");
  const main = el("div", "lv-chip-main");
  const image = thumb(item, link.label);
  if (image) main.appendChild(image);
  const body = el("div", "lv-body");
  body.appendChild(linkNode(link.label, link.href, "lv-title"));
  if (want("handle") && item.handle) {
    body.appendChild(el("div", "lv-meta", String(item.handle)));
  }
  main.appendChild(body);
  row.appendChild(main);

  const pane = el("div", "lv-chip-pane");
  const stats = el("div", "lv-chip-stats");
  const stat = (key, num, label) => {
    if (!want(key) || typeof num !== "number") return;
    const box = el("div", "lv-chip-stat");
    const value = el("div", "lv-chip-stat-v", fmtShort(num));
    value.title = Number(num).toLocaleString("en-US") + " " + label;
    box.appendChild(value);
    box.appendChild(el("div", "lv-chip-stat-l", label));
    stats.appendChild(box);
  };
  stat("subscribers", item.subscribers, "subs");
  stat("videos", item.videos, "videos");
  stat("views", item.views, "views");
  if (stats.childElementCount) pane.appendChild(stats);
  // Always the compact yyyy-MM-dd form through fmtDate, never a raw ISO
  // string and never the status field. A missing date or a field switched off
  // simply leaves the pane to the counts.
  if (want("subscribedOn")) {
    const iso = fmtDate(item.subscribed_on);
    if (iso && iso !== "-") {
      const since = el("div", "lv-chip-since");
      since.appendChild(document.createTextNode("subscribed since "));
      since.appendChild(datePart(item.subscribed_on, "lv-chip-since-date"));
      pane.appendChild(since);
    }
  }
  if (pane.childElementCount) row.appendChild(pane);
  return row;
};

// Table layout: Cover rows. The banner leads each row as a small blurred crop
// with the avatar over it, the identity meta sits under the name, and the
// dates stack in a Tracked column.
const coverFace = (src, label) => {
  const box = el("div", "lv-cover-av");
  if (!src) {
    box.textContent = initialOf(label);
    return box;
  }
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => {
    img.remove();
    box.textContent = initialOf(label);
  });
  box.appendChild(img);
  return box;
};
const coverNum = (value) => {
  const td = el("td", "lv-cover-num", typeof value === "number" ? fmtShort(value) : "-");
  if (typeof value === "number") td.title = value.toLocaleString("en-US");
  return td;
};
const coverTrack = (item) => {
  const td = el("td", "lv-cover-track");
  const line = (label, value) => {
    const text = fmtDate(value);
    if (!text || text === "-") return;
    const row = el("div", "lv-cover-track-row");
    row.appendChild(el("span", "lv-cover-track-l", label));
    row.appendChild(datePart(value, "lv-cover-track-v"));
    td.appendChild(row);
  };
  if (want("subscribedOn")) line("since", item.subscribed_on);
  if (want("syncDates")) {
    line("first", item.first_seen);
    line("last", item.last_seen);
  }
  return td;
};
const coverRow = (item) => {
  const link = mdLink(item.channel);
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  const who = el("div", "lv-cover-who");
  const art = el("div", "lv-cover-art");
  const banner = imageSrc(mdBanner(item));
  if (banner) {
    const img = document.createElement("img");
    img.src = banner;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    art.appendChild(img);
  }
  art.appendChild(coverFace(imageSrc(mdImage(item)), link.label));
  who.appendChild(art);
  const stack = el("div", "lv-cover-name");
  stack.appendChild(linkNode(link.label, link.href, ""));
  if (want("handle") && item.handle) {
    stack.appendChild(el("div", "lv-cover-handle", String(item.handle)));
  }
  const bits = [];
  if (want("channelId") && item.id) {
    const id = String(item.id);
    const span = el("span", "lv-cover-id", id.length > 12 ? id.slice(0, 8) + "\\u2026" : id);
    span.title = id;
    bits.push(span);
  }
  if (want("country") && item.country) {
    bits.push(el("span", "lv-cover-country", String(item.country)));
  }
  if (want("status") && item.status) {
    bits.push(el("span", "lv-cover-status", String(item.status)));
  }
  if (bits.length) {
    const meta = el("div", "lv-cover-meta");
    bits.forEach((bit, index) => {
      if (index) meta.appendChild(el("span", "lv-cover-dot"));
      meta.appendChild(bit);
    });
    stack.appendChild(meta);
  }
  who.appendChild(stack);
  cell.appendChild(who);
  row.appendChild(cell);
  return row;
};
const renderTableRows = (host, items, onPaint) => {
  host.classList.add("lv-cover");
  const cols = [];
  if (want("subscribers")) cols.push(["Subs", "lv-cover-num", (item) => coverNum(item.subscribers)]);
  if (want("videos")) cols.push(["Videos", "lv-cover-num", (item) => coverNum(item.videos)]);
  if (want("views")) cols.push(["Views", "lv-cover-num", (item) => coverNum(item.views)]);
  if (want("subscribedOn") || want("syncDates")) cols.push(["Tracked", "lv-cover-track-h", coverTrack]);
  const table = el("table", "lv-cover-table");
  const thead = document.createElement("thead");
  const head = document.createElement("tr");
  head.appendChild(el("th", "", "Channel"));
  for (const col of cols) head.appendChild(el("th", col[1], col[0]));
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  host.appendChild(table);
  // Rows into the tbody, the button beside the table: one page at a time on
  // the same live setting the poster and chips layouts read.
  mount(
    tbody,
    items,
    (item) => {
      const row = coverRow(item);
      for (const col of cols) row.appendChild(col[2](item));
      return row;
    },
    onPaint,
    host,
  );
};

// The channels script draws no channel faces, so the refresh handler's cache
// reset is a no-op here.
const resetKindCache = () => {};
`;

/**
 * Video layout builders, embedded into the two video scripts. `channelsPath`
 * is the vault path of Channels.md: video bullets carry no avatar of their
 * own, so the channel faces are joined from that note. As with the channels
 * block, the generated code uses string concatenation and no backticks.
 */
function noteViewsVideoJs(channelsPath: string): string {
	return `
// ---------------------------------------------------------------------------
// Video layouts: Cinema poster, Ticket chips, Ledger table
// ---------------------------------------------------------------------------

// Channel faces for video entries, joined from Channels.md by channel URL
// and by lowercased name. Built on first render, so a text-heavy layout never
// pays for the lookup, and reset by Refresh so newly synced avatars land.
// A local avatar file belongs to Channels.md, not to the video note this view
// reads, which is why the image resolves against CHANNELS_PATH.
const CHANNELS_PATH = ${JSON.stringify(channelsPath)};
let channelFaces = null;
const channelFaceMap = () => {
  if (channelFaces) return channelFaces;
  channelFaces = new Map();
  const faceSrc = (row) => imageSrc(mdImage(row), CHANNELS_PATH);
  try {
    const page = dv.page(CHANNELS_PATH);
    const raw = page && page.file ? page.file.lists : null;
    const rows = !raw ? [] : typeof raw.array === "function" ? raw.array() : Array.from(raw);
    for (const row of rows) {
      const src = faceSrc(row);
      if (!src) continue;
      const link = mdLink(row.channel);
      if (link.href) channelFaces.set(link.href, src);
      const key = link.label.trim().toLowerCase();
      if (key) channelFaces.set(key, src);
    }
  } catch (err) {
    // No Channels.md, or no avatar fields on it: rows keep the plain name.
  }
  return channelFaces;
};
const channelFace = (channel) => {
  const map = channelFaceMap();
  if (channel.href && map.has(channel.href)) return map.get(channel.href);
  const key = (channel.label || "").trim().toLowerCase();
  return key && map.has(key) ? map.get(key) : "";
};
const resetKindCache = () => {
  channelFaces = null;
};

// A lettered gradient for a channel with no joined avatar: distinct, stable,
// and no image request.
const tint = (node, label) => {
  let h = 0;
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) % 360;
  node.style.background =
    "linear-gradient(135deg, hsl(" + h + ", 62%, 50%), hsl(" + ((h + 40) % 360) + ", 58%, 38%))";
};
const channelBadge = (channel) => {
  const label = (channel.label || "?").trim();
  const node = el("span", "lv-cine-badge");
  const src = channelFace(channel);
  if (src) {
    node.classList.add("lv-cine-badge--img");
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      node.classList.remove("lv-cine-badge--img");
      node.textContent = label.charAt(0).toUpperCase() || "?";
      tint(node, label);
    });
    node.appendChild(img);
    return node;
  }
  node.textContent = label.charAt(0).toUpperCase() || "?";
  tint(node, label);
  return node;
};

const playGlyph = () => {
  const svgNS = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", "M8 5v14l11-7z");
  icon.appendChild(path);
  return icon;
};

// Poster layout: Cinema. Full-bleed 16:9 art, a date pill, a hover play
// button, and the title and channel on a gradient veil. A video with no
// thumbnail (or a dead one) keeps the frame and shows the title's initial, so
// the grid stays even and the entry still reads as a video card.
const posterCard = (item) => {
  const link = mdLink(item.title);
  const channel = mdLink(item.channel);
  const node = el("article", "lv-poster-card lv-poster-cinema");
  const bannerSrc = imageSrc(mdImage(item));
  const banner = el("div", "lv-poster-banner");
  if (!bannerSrc) banner.classList.add("lv-cine-noimg");

  if (bannerSrc) {
    const img = document.createElement("img");
    img.src = bannerSrc;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      banner.classList.add("lv-cine-noimg");
    });
    banner.appendChild(img);
  }
  banner.appendChild(el("span", "lv-cine-fallback", link.label.charAt(0).toUpperCase()));

  const date = item.date == null || item.date === "" ? "" : fmtDate(item.date);
  if (date && date !== "-") banner.appendChild(datePart(item.date, "lv-cine-pill"));

  if (link.href) {
    // A button, not an anchor: no link tooltip over the art. The accessible
    // name is hidden text; Obsidian turns aria-label into a tooltip.
    const play = el("button", "lv-cine-play");
    play.type = "button";
    play.appendChild(el("span", "lv-sr", "Open on YouTube"));
    play.addEventListener("click", () => {
      window.open(link.href, "_blank", "noopener");
    });
    const circle = el("span", "lv-cine-play-circle");
    circle.appendChild(playGlyph());
    play.appendChild(circle);
    banner.appendChild(play);
  }

  const veil = el("div", "lv-cine-veil");
  veil.appendChild(linkNode(link.label, link.href, "lv-cine-title"));
  if (channel.label) {
    const meta = el("div", "lv-cine-meta");
    meta.appendChild(channelBadge(channel));
    meta.appendChild(linkNode(channel.label, channel.href, "lv-cine-channel"));
    veil.appendChild(meta);
  }
  banner.appendChild(veil);

  node.appendChild(banner);
  return node;
};

// Chips layout: Ticket. A thumbnail and a two-line title on the left, the
// channel with its joined avatar underneath, and a date stub behind a dashed
// tear line on the right.
const ticketDate = (iso) => {
  const found = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(iso || "");
  if (!found) return null;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return { year: found[1], month: months[Number(found[2]) - 1] || found[2], day: found[3] };
};
const chipRow = (item) => {
  const link = mdLink(item.title);
  const row = el("div", "lv-chip lv-chip--ticket");
  const main = el("div", "lv-chip-main");
  const image = thumb(item, link.label);
  if (image) main.appendChild(image);
  const body = el("div", "lv-body");
  body.appendChild(linkNode(link.label, link.href, "lv-title"));

  const channel = mdLink(item.channel);
  const meta = el("div", "lv-meta lv-meta--ticket");
  const face = channelFace(channel);
  if (face) {
    const ring = el("span", "lv-ticket-face");
    const img = document.createElement("img");
    img.src = face;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => ring.remove());
    ring.appendChild(img);
    meta.appendChild(ring);
  }
  if (channel.label) meta.appendChild(linkNode(channel.label, channel.href, "lv-ticket-chan"));
  if (meta.childElementCount) body.appendChild(meta);
  main.appendChild(body);
  row.appendChild(main);

  const parts = ticketDate(fmtDate(item.date));
  if (parts) {
    // The whole stub is the link, so the tear-off date is one big click target
    // with the same internal-link behavior as the other date spots.
    const stubTarget = dateTarget(item.date);
    const stub = document.createElement(stubTarget ? "a" : "div");
    stub.className = "lv-ticket-stub";
    if (stubTarget) {
      stub.classList.add("internal-link");
      stub.setAttribute("href", stubTarget);
      stub.setAttribute("data-href", stubTarget);
    }
    stub.appendChild(el("div", "lv-ticket-mon", parts.month));
    stub.appendChild(el("div", "lv-ticket-day", parts.day));
    stub.appendChild(el("div", "lv-ticket-yr", parts.year));
    row.appendChild(stub);
  }
  return row;
};

// Table layout: Ledger. The thumbnail and title in the first column, the
// channel next to it, and the date added at the right edge.
const renderTableRows = (host, items, onPaint) => {
  host.classList.add("lv-ledger");
  const table = el("table", "lv-ledger-table");
  const thead = document.createElement("thead");
  const head = document.createElement("tr");
  head.appendChild(el("th", "", "Video"));
  head.appendChild(el("th", "", "Channel"));
  head.appendChild(el("th", "lv-r", "Added"));
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  host.appendChild(table);
  const ledgerRow = (item) => {
    const title = mdLink(item.title);
    const channel = mdLink(item.channel);
    const row = document.createElement("tr");
    const first = document.createElement("td");
    const who = el("div", "lv-ledger-who");
    const src = imageSrc(mdImage(item));
    if (src) {
      const frame = el("div", "lv-ledger-thumb");
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
      frame.appendChild(img);
      who.appendChild(frame);
    }
    const stack = el("div", "lv-ledger-stack");
    stack.appendChild(linkNode(title.label || "-", title.href, "lv-ledger-title"));
    who.appendChild(stack);
    first.appendChild(who);
    row.appendChild(first);
    const chan = document.createElement("td");
    if (channel.label) chan.appendChild(linkNode(channel.label, channel.href, "lv-ledger-chan"));
    else chan.appendChild(el("span", "lv-ledger-date", "-"));
    row.appendChild(chan);
    const added = el("td", "lv-r");
    added.appendChild(datePart(item.date, "lv-ledger-date"));
    row.appendChild(added);
    return row;
  };
  // Rows into the tbody, the button beside the table: one page at a time on
  // the same live setting the poster and chips layouts read.
  mount(tbody, items, ledgerRow, onPaint, host);
};
`;
}

/**
 * The full source of one generated view script (lifeline-channels.js,
 * lifeline-playlists.js, or lifeline-watchlater.js). The generated code
 * contains no backticks and no `${...}` placeholders, so it can be embedded
 * in this TS template literal; the stylesheet path is baked in and the CSS
 * itself is read from that file at view time (the quotebook.css pattern), so
 * restyling never regenerates the scripts. String building inside the script
 * uses concatenation rather than template literals for the same reason.
 * `channelsPath` is baked into the two video scripts, which join the channel
 * faces for their chips and poster cards from Channels.md.
 */
export function renderNoteViewScript(
	kind: NoteViewKind,
	stylesFolder: string,
	channelsPath: string,
): string {
	const section = NOTE_VIEW_SECTIONS[kind];
	const note = NOTE_VIEW_NOTES[kind];
	return `/**
 * Lifeline note-view script for ${note} (generated).
 *
 * The note invokes this file once:
 *   dv.view("98 - Organize/Scripts/lifeline-${kind}", { layout: "poster"${kind === 'channels' ? ', fields: {...}' : ''} })
 * Layouts: poster, chips, table. Every layout reads the calling note's own
 * list entries (dv.current().file.lists), so the view mirrors the
 * inline-field entries below it. Regenerated on every sync while "Views in
 * notes" is on; hand edits are overwritten.
 *
 * The toolbar at the top is a glass pill: search with the result count inside
 * it, a "search in" scope select, a segmented Layout control, and Refresh.
 * Layout changes are instant, are written back into the plugin's settings
 * under this note type's own key, so playlists and Watch Later can differ, and
 * refresh the other open views; the layout baked into the note is only a
 * fallback for when the plugin cannot be reached.
 *
 * Styling is NOT baked in: this script reads ${NOTE_VIEW_STYLESHEET_FILES[kind]} from
 * the vault's styles folder at view time and injects it, so hand edits to
 * that file apply on the next render without regenerating anything.
 *
 * This script makes no network request. Images come from the bullet's own
 * image fields: a local vault file when one was downloaded, or the remote URL
 * otherwise. The stylesheet is read from the local vault.
 */
if (input == null) input = {};

const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v.array === "function" ? v.array() : []);

const STYLE_ID = ${JSON.stringify("lifeline-views-style-" + kind)};
const CSS_PATH = ${JSON.stringify(viewsStylesheetPath(kind, stylesFolder))};
// Read the stylesheet like the quotebook script reads quotebook.css: from
// the vault itself, once per render, so edits apply on the next re-render.
// A missing file (views just enabled, folder moved) leaves the view
// unstyled but fully functional rather than breaking it.
//
// An existing sheet is compared, not assumed: a script update or a sync can
// change the file while Obsidian stays open, and the injected copy would
// otherwise keep the old look until the whole app restarts (a hot reload of
// the plugin does not empty document.head). Replacing the text in place means
// new rules land on the next render.
const ensureStyle = async () => {
  let css = "";
  try {
    const file = app.vault.getAbstractFileByPath(CSS_PATH);
    css = file ? await app.vault.cachedRead(file) : "";
  } catch (err) {
    css = "";
  }
  const existing = document.getElementById(STYLE_ID);
  if (!css) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
};

dv.container.classList.add("lifeline-views");
// One shared sheet became one per kind. A sheet injected by an older build
// under the old id would otherwise keep competing with the new rules until the
// app restarts, so drop it here.
const legacyStyle = document.getElementById("lifeline-views-style");
if (legacyStyle) legacyStyle.remove();
await ensureStyle();

// List entries of the calling note, in document order: channels are already
// alphabetical and playlist entries already in playlist position order.
const listEntries = () => {
  const current = dv.current();
  return toArr(current && current.file ? current.file.lists : current ? current.lists : null);
};

// Bare ISO dates (subscribed_on:: 2026-10-20) come back from Dataview as Luxon
// DateTimes, which would otherwise render long ("October 20, 2026"). Force
// the compact yyyy-MM-dd form so every date reads the same and stays on one
// line. The playlist date field is written as a wiki link ([[2026-10-20]]),
// so Dataview hands back a Link rather than a date: read the date back out of
// it. A hand-edited bullet can also carry the wiki syntax as plain text, so
// strip that form too rather than printing the brackets. Every layout builds
// its own DOM, so every date goes through fmtDate.
const fmtDate = (v) => {
  if (v == null || v === "") return "-";
  if (typeof v.toFormat === "function") return v.toFormat("yyyy-MM-dd");
  if (typeof v === "object" && (typeof v.path === "string" || typeof v.display === "string")) {
    const text = v.display != null ? String(v.display) : String(v.path);
    // The display text wins when it holds the date; an aliased link ([[date|Oct 20]])
    // still has the date in its target.
    const found = /(\\d{4}-\\d{2}-\\d{2})/.exec(text) || /(\\d{4}-\\d{2}-\\d{2})/.exec(String(v.path));
    return found ? found[1] : text;
  }
  const raw = String(v).trim();
  const wiki = /^\\[\\[([^\\]|]+)(?:\\|([^\\]]*))?\\]\\]$/.exec(raw);
  if (wiki) {
    const label = wiki[2] != null && wiki[2] !== "" ? wiki[2] : wiki[1];
    const found = /(\\d{4}-\\d{2}-\\d{2})/.exec(label) || /(\\d{4}-\\d{2}-\\d{2})/.exec(wiki[1]);
    return found ? found[1] : label;
  }
  return raw;
};

// A date is plain text unless the bullet wrote it as a wiki link (the day's
// journal note), in which case the view renders it as an internal link so the
// date opens that note from any layout. Only the link field earns this: the
// sync bookkeeping fields (first_seen/last_seen) are written plain, so they
// stay plain. The link target is the raw target, not the resolved path, so a
// renamed or not-yet-created daily note behaves the way the note's own link
// does.
const dateTarget = (v) => {
  if (v == null || v === "") return "";
  if (typeof v === "object" && typeof v.path === "string") return v.path.trim();
  const raw = String(v).trim();
  const wiki = /^\\[\\[([^\\]|]+)(?:\\|[^\\]]*)?\\]\\]$/.exec(raw);
  return wiki ? wiki[1].trim() : "";
};
// The date as a span, or as an internal link when it is a wiki link. The class
// is the layout's own date class either way, so the two look identical apart
// from the hover underline.
const datePart = (v, cls) => {
  const target = dateTarget(v);
  const node = document.createElement(target ? "a" : "span");
  if (cls) node.className = cls;
  node.textContent = fmtDate(v);
  if (target) {
    node.classList.add("internal-link");
    node.setAttribute("href", target);
    node.setAttribute("data-href", target);
  }
  return node;
};

// YouTube-style compact numbers (109M, 4.67K), matching the dashboard: hover
// for the full value, select to flip between short and full.
const fmtShort = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n == null ? "" : n);
  const abs = Math.abs(v);
  if (abs < 1000) return String(v);
  const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const div = unit[0];
    const suffix = unit[1];
    if (abs < div) continue;
    const scaled = v / div;
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    let s = scaled.toFixed(decimals);
    if (s.indexOf(".") >= 0) s = s.replace(/\\.?0+$/, "");
    if (Math.abs(Number(s)) < 1000) return s + suffix;
    // Rounded up to 1000 (e.g. 999500 -> "1000K"): carry into the next unit.
    if (i > 0) {
      const nextUnit = units[i - 1];
      const next = (v / nextUnit[0]).toFixed(2);
      const trimmed = next.indexOf(".") >= 0 ? next.replace(/\\.?0+$/, "") : next;
      return trimmed + nextUnit[1];
    }
    return s + suffix;
  }
  return String(v);
};

// Which columns and card rows to draw. Every value except Channel follows the
// same toggle as the bullets, so one switch drives both the note and the view.
const fields = input.fields && typeof input.fields === "object" ? input.fields : {};
const want = (key) => fields[key] !== false;

// ---------------------------------------------------------------------------
// Layout-independent helpers
// ---------------------------------------------------------------------------

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// "[Label](https://...)" into {label, href}. The strict pattern reads a
// well-formed label; the greedy retry reads a label that itself carries
// brackets (a title written before notes swapped them for parentheses), so
// those entries still link instead of falling back to raw text. Falls back to
// the raw text either way, so a value with no link still renders readable.
const mdLink = (v) => {
  const s = v == null ? "" : String(v);
  const strict = /^\\s*\\[([^\\]]*)\\]\\(([^)]+)\\)/.exec(s);
  if (strict) return { label: strict[1], href: strict[2] };
  const nested = /^\\s*\\[(.*)\\]\\(([^)]+)\\)/.exec(s);
  return nested ? { label: nested[1], href: nested[2] } : { label: s, href: "" };
};

const linkNode = (label, href, cls) => {
  const a = document.createElement("a");
  if (cls) a.className = cls;
  a.textContent = label;
  if (href) a.href = href;
  return a;
};

// The image fields the sync appended to the bullet, if the user enabled one:
// avatar/avatar_url on channels, thumbnail/thumbnail_url on videos. Fields,
// never embeds, so they come straight off Dataview's parsed list-item
// properties: the *_url field carries the remote link, the local field carries
// the downloaded file. The local one wins, so download mode stays offline.
// Read off the bullet so this script never has to know which mode is set.
const imageField = (v) =>
  v == null
    ? ""
    : typeof v === "object" && typeof v.path === "string"
      ? v.path
      : String(v).trim();
const mdImage = (item) => {
  if (!item) return null;
  const local = imageField(item.avatar) || imageField(item.thumbnail);
  if (local) return { local: true, target: local };
  const remote = imageField(item.avatar_url) || imageField(item.thumbnail_url);
  if (remote) return { local: false, target: remote };
  // Bullets written before the fields existed can still carry an embed; read
  // it too, so an image keeps rendering until the next sync rewrites the note.
  // New bullets never write one.
  const s = item.text != null ? String(item.text) : "";
  const oldLocal = /!\\[\\[([^\\]|]+)(?:\\|[^\\]]*)?\\]\\]/.exec(s);
  if (oldLocal) return { local: true, target: oldLocal[1].trim() };
  const oldRemote = /!\\[\\]\\(([^)]+)\\)/.exec(s);
  if (oldRemote) return { local: false, target: oldRemote[1] };
  return null;
};

// The channel banner fields, the same local-first rule as mdImage under their
// own names. Channels only, and only two layouts draw it: the Ambient poster
// (as a blurred backdrop) and the Cover rows table (as a small crop). No
// legacy-embed path, because bullets never carried a banner embed.
const mdBanner = (item) => {
  if (!item) return null;
  const local = imageField(item.banner);
  if (local) return { local: true, target: local };
  const remote = imageField(item.banner_url);
  if (remote) return { local: false, target: remote };
  return null;
};

// Resolve that image to something an <img> can load. A remote URL is used as
// is; a local file is resolved the same way the note itself resolves it, from
// the note's own path, so no folder setting has to be baked in. The optional
// fromPath overrides that base for the channel faces joined from Channels.md,
// whose local avatar files belong to that note rather than the video note. Both
// paths are offline lookups: neither issues a network request.
const imageSrc = (img, fromPath) => {
  if (!img) return null;
  if (!img.local) return img.target;
  try {
    let from = fromPath;
    if (from == null) {
      const current = dv.current();
      from = current && current.file ? current.file.path : "";
    }
    const file = app.metadataCache.getFirstLinkpathDest(img.target, from);
    return file ? app.vault.getResourcePath(file) : null;
  } catch (err) {
    return null;
  }
};

const initialOf = (label) => {
  const s = label == null ? "" : String(label).trim();
  return s ? s.charAt(0).toUpperCase() : "?";
};

// The entry's image, or null when the bullet carries no image fields (both
// image modes off, or this entry has no avatar). Without an image the entry
// is a clean text row, in the spirit of the quotebook script this view is
// modeled on. lazy keeps a 900-entry note from decoding 900 images on open;
// the letter fallback covers a file removed after sync (the box already
// occupies its space, so swapping in the initial does not reflow the row).
const thumb = (item, label) => {
  const src = imageSrc(mdImage(item));
  if (!src) return null;
  const box = el("div", "lv-thumb");
  const img = document.createElement("img");
  img.src = src;
  img.alt = label == null ? "" : String(label);
  img.loading = "lazy";
  img.addEventListener("error", () => {
    box.textContent = initialOf(label);
  });
  box.appendChild(img);
  return box;
};

// Every layout paints one page, then appends the rest behind a button, so a
// 900-video Watch Later builds one page of nodes on open instead of 900.
// onPaint runs after every page so the toolbar count stays honest. The page
// size is the live Items per page setting, clamped; the baked default only
// covers a render where the plugin instance cannot be reached.
const DEFAULT_PAGE_SIZE = ${DEFAULT_VIEW_PAGE_SIZE};
const normalizePageSize = (value) => {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw == null || raw === "") return DEFAULT_PAGE_SIZE;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(${MAX_VIEW_PAGE_SIZE}, Math.max(${MIN_VIEW_PAGE_SIZE}, Math.floor(n)));
};
const livePageSize = () => {
  const plugin = pluginInstance();
  const value = plugin && plugin.settings ? plugin.settings.viewPageSize : null;
  return normalizePageSize(value);
};
const mount = (host, items, renderOne, onPaint, buttonHost) => {
  let shown = 0;
  let more = null;
  // Where the button lives: beside the rows, or beside the table when the
  // rows are painted into a tbody (a button child of a tbody is invalid HTML
  // and inherits none of the table's surroundings).
  const holder = buttonHost || host;
  // Read once per mount, so every Show more click adds the same page the view
  // opened with even if the setting changes mid-read.
  const pageSize = livePageSize();
  const paint = (count) => {
    const end = Math.min(items.length, shown + count);
    for (let i = shown; i < end; i++) host.appendChild(renderOne(items[i]));
    shown = end;
    if (more) {
      more.textContent = "Show more (" + (items.length - shown) + ")";
      holder.appendChild(more); // keep the button last as rows grow
    }
    if (shown >= items.length && more) {
      more.parentNode.removeChild(more);
      more = null;
    }
    if (onPaint) onPaint(shown);
  };
  paint(pageSize);
  if (shown < items.length) {
    more = el("button", "lv-more");
    more.type = "button";
    more.textContent = "Show more (" + (items.length - shown) + ")";
    more.addEventListener("click", () => paint(pageSize));
    holder.appendChild(more);
  }
};

${kind === 'channels' ? NOTE_VIEWS_CHANNELS_JS : noteViewsVideoJs(channelsPath)}
// ---------------------------------------------------------------------------
// Toolbar: search, scope, layout, refresh
// ---------------------------------------------------------------------------

const KNOWN_LAYOUTS = ["table", "chips", "poster"];
// Which note shape this file serves; baked per script ("channels" in
// lifeline-channels.js, "playlist" in the other two) rather than passed in.
const section = ${JSON.stringify(section)};
// Which note type this file serves, baked beside the section so the layout is
// read and written under its own key: playlists and Watch Later share a shape
// but deliberately not a layout, which is the point of the three settings rows.
const kind = ${JSON.stringify(kind)};

// The plugin instance is the live source of truth for the layout: switching
// in the toolbar, or in the settings rows, saves it there, so every note of
// this type follows without a sync. The layout baked into the note is only a
// fallback (plugin disabled, old note).
const pluginInstance = () => {
  try {
    return app.plugins && app.plugins.plugins ? app.plugins.plugins["lifeline"] : null;
  } catch (err) {
    return null;
  }
};

const liveLayout = () => {
  const plugin = pluginInstance();
  const layouts = plugin && plugin.settings ? plugin.settings.noteLayouts : null;
  const value = layouts ? layouts[kind] : null;
  return KNOWN_LAYOUTS.indexOf(value) >= 0 ? value : null;
};

// Read at render time like the layout, so the Sort order setting applies on the
// next render with no sync. Anything but "desc" counts as newest first.
const liveSortOrder = () => {
  const plugin = pluginInstance();
  const value = plugin && plugin.settings ? plugin.settings.viewSortOrder : null;
  return value === "desc" ? "desc" : "asc";
};

// Order by the dated field: subscribed_on on Channels.md, date on playlist and
// Watch Later bullets. Compared as yyyy-MM-dd text, which sorts by date. Entries
// with no usable date sink to the end in either order.
const sortDate = (item) => {
  const v = section === "channels" ? item.subscribed_on : item.date;
  if (v == null || v === "") return "";
  if (typeof v.toFormat === "function") return v.toFormat("yyyy-MM-dd");
  if (v instanceof Date && !isNaN(v.getTime())) {
    const pad = (n) => (n < 10 ? "0" + n : String(n));
    return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
  }
  const found = /(\\d{4})-(\\d{2})-(\\d{2})/.exec(fmtDate(v) + " " + String(v));
  return found ? found[0] : "";
};
const orderRows = (list) => {
  const keyed = Array.from(list, (item) => ({ item, key: sortDate(item) }));
  const dated = keyed.filter((e) => e.key !== "");
  const undated = keyed.filter((e) => e.key === "");
  dated.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (liveSortOrder() !== "desc") dated.reverse();
  return dated.concat(undated).map((e) => e.item);
};

const persistLayout = (value) => {
  const plugin = pluginInstance();
  if (!plugin || !plugin.settings || typeof plugin.saveSettings !== "function") return;
  // Under this note type's own key, so switching here never touches the
  // layout of a different kind of note.
  if (!plugin.settings.noteLayouts) plugin.settings.noteLayouts = {};
  plugin.settings.noteLayouts[kind] = value;
  try {
    Promise.resolve(plugin.saveSettings()).catch(() => {});
  } catch (err) {
    // A failed save only means the next note re-render falls back; harmless.
  }
};

// A layout switch here is a choice shared by every note of this type, so the
// other open views follow it the way Dataview's own force-refresh command
// makes them: bump the index revision, then fire the refresh event (Dataview
// ignores the event unless the revision moved). Our own view re-renders too,
// which is why the current search is stashed below and restored by the next
// run instead of dropped. Guarded: the local render in the change handler
// already applied either way.
const refreshOtherViews = () => {
  try {
    const registry = app.plugins && app.plugins.plugins ? app.plugins.plugins : null;
    const dataview = registry ? registry["dataview"] : null;
    if (!dataview || !dataview.index || typeof dataview.index.revision !== "number") return;
    dataview.index.revision += 1;
    app.workspace.trigger("dataview:refresh-views");
  } catch (err) {
    // Without the event the other open views keep this layout until their
    // next re-render.
  }
};

// The search state across that re-render, kept on window (top-level bindings
// die with the script instance) and keyed by note so two open views cannot
// cross-contaminate. Read once: the restore below deletes the entry.
const STASH = (() => {
  try {
    if (!window.lifelineNoteViewStash) window.lifelineNoteViewStash = {};
    return window.lifelineNoteViewStash;
  } catch (err) {
    return null;
  }
})();
const viewKey = String(dv.currentFilePath || "");

// Poster is the layout every kind opens on. The retired cards layout meant the
// same card grid this poster now provides, so a stored or baked "cards" lands
// on poster, and any other unrecognized value lands on the default too. The
// migration runs at load time as well (the plugin normalizes settings once),
// this is the fallback for a note that still bakes an old value.
const DEFAULT_LAYOUT = "poster";
const migrateLayout = (value) => {
  if (value === "cards") return DEFAULT_LAYOUT;
  return KNOWN_LAYOUTS.indexOf(value) >= 0 ? value : DEFAULT_LAYOUT;
};
const baked = migrateLayout(input.layout == null ? DEFAULT_LAYOUT : String(input.layout));
const state = {
  layout: migrateLayout(liveLayout() || baked),
  query: "",
  scope: "all",
};

// Channels.md bullets carry a channel link and never a title; playlist bullets
// carry a title (and a channel). The title check keeps playlist entries out of
// a channels view should a note ever hold both shapes. Re-read on demand so
// the Refresh button picks up bullets edited since this view was rendered.
const readRows = () =>
  listEntries().filter((item) =>
    section === "channels" ? item.channel != null && item.title == null : item.title != null,
  );
let rows = readRows();

// Search covers the readable text of each entry, optionally scoped to one
// field. Dates are matched in their compact yyyy-MM-dd form.
const scopesFor = (item) => {
  if (section === "channels") {
    return [
      ["name", mdLink(item.channel).label],
      ["handle", item.handle == null ? "" : String(item.handle)],
      ["id", item.id == null ? "" : String(item.id)],
      ["country", item.country == null ? "" : String(item.country)],
      ["status", item.status == null ? "" : String(item.status)],
    ];
  }
  return [
    ["title", mdLink(item.title).label],
    ["channel", mdLink(item.channel).label],
    ["date", item.date == null ? "" : fmtDate(item.date)],
  ];
};

const matches = (item) => {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  const pairs = scopesFor(item);
  if (state.scope === "all") return pairs.some((pair) => pair[1].toLowerCase().indexOf(query) >= 0);
  const hit = pairs.find((pair) => pair[0] === state.scope);
  return hit != null && hit[1].toLowerCase().indexOf(query) >= 0;
};

const noun = section === "channels" ? "channels" : "videos";

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

const toolbar = el("div", "lv-toolbar");
const toolbarRow = el("div", "lv-toolbar-row");

// The search box and its count are one object: the input owns the pill shape,
// the count sits inside its right edge. The placeholder names the field the
// scope select is narrowed to, so a scoped search says what it searches.
const glass = el("div", "lv-glass-wrap");
const search = document.createElement("input");
search.type = "text";
search.className = "lv-search";
search.setAttribute("aria-label", "Search " + noun);
glass.appendChild(search);
const stats = el("div", "lv-stats");
glass.appendChild(stats);
toolbarRow.appendChild(glass);

// The count reads "10 / 76" so the pill stays narrow, and expands to the full
// sentence ("Showing 10 of 76 channels") while the pointer is over it, which
// is also where the words were before. Every render writes through
// setStatsText, so a repaint while hovered keeps the expanded form.
let statsFull = "";
let statsHovered = false;
const statsShort = () => {
  const found = /([0-9]+) of ([0-9]+)/.exec(statsFull);
  return found ? found[1] + " / " + found[2] : statsFull;
};
const paintStats = () => {
  stats.textContent = statsFull === "" ? "" : statsHovered ? statsFull : statsShort();
};
const setStatsText = (text) => {
  statsFull = text;
  paintStats();
};
stats.addEventListener("mouseenter", () => {
  statsHovered = true;
  paintStats();
});
stats.addEventListener("mouseleave", () => {
  statsHovered = false;
  paintStats();
});

// The placeholder names the scoped field: the scope option's own label,
// lowercased, or the plural noun for All fields. Derived from the option list
// so adding a scope cannot leave the placeholder lying about what it searches.
const syncPlaceholder = () => {
  const found = scopeOptions.filter((option) => option[0] === scope.value)[0];
  const label = !found || found[0] === "all" ? noun : found[1].toLowerCase();
  search.placeholder = "Search " + label + "...";
};

const scope = document.createElement("select");
scope.className = "lv-select";
scope.setAttribute("aria-label", "Search in");
const scopeOptions = section === "channels"
  ? [["all", "All fields"], ["name", "Name"], ["handle", "Handle"], ["id", "ID"], ["country", "Country"], ["status", "Status"]]
  : [["all", "All fields"], ["title", "Title"], ["channel", "Channel"], ["date", "Date"]];
for (const option of scopeOptions) {
  const opt = document.createElement("option");
  opt.value = option[0];
  opt.textContent = option[1];
  scope.appendChild(opt);
}
scope.value = state.scope;
toolbarRow.appendChild(scope);
syncPlaceholder();

// The layout choices every kind offers, in the same order in the segmented
// control, the settings rows, and the note's own dv.view call.
const LAYOUT_CHOICES = [
  ["poster", "Poster"],
  ["chips", "Chips"],
  ["table", "Table"],
];

// The native select stays in the DOM, hidden, as the single value source: the
// segmented buttons only set its value and fire its change event.
const layoutSelect = document.createElement("select");
layoutSelect.className = "lv-select";
layoutSelect.setAttribute("aria-label", "Layout");
for (const option of LAYOUT_CHOICES) {
  const opt = document.createElement("option");
  opt.value = option[0];
  opt.textContent = option[1];
  layoutSelect.appendChild(opt);
}
layoutSelect.value = state.layout;
layoutSelect.style.display = "none";

const seg = el("div", "lv-seg");
seg.setAttribute("role", "group");
seg.setAttribute("aria-label", "Layout");
const segButtons = [];
for (const option of LAYOUT_CHOICES) {
  const btn = el("button", "lv-seg-btn", option[1]);
  btn.type = "button";
  btn.dataset.layout = option[0];
  btn.addEventListener("click", () => {
    if (layoutSelect.value === option[0]) return;
    layoutSelect.value = option[0];
    layoutSelect.dispatchEvent(new Event("change"));
  });
  segButtons.push(btn);
  seg.appendChild(btn);
}
seg.appendChild(layoutSelect);
toolbarRow.appendChild(seg);

const syncSeg = () => {
  for (const btn of segButtons) {
    const on = btn.dataset.layout === state.layout;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
};
syncSeg();

// Icon-only: the accessible name is the tooltip (aria-label), so there is no
// second, native title tooltip competing with it.
const refresh = document.createElement("button");
refresh.type = "button";
refresh.className = "lv-refresh";
refresh.setAttribute("aria-label", "Refresh entries");
const refreshIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
refreshIcon.setAttribute("viewBox", "0 0 24 24");
// Explicit size and paint as well as the stylesheet rule: a theme that resets
// svg sizing, or a stale sheet from before the toolbar redesign, would
// otherwise leave the button an empty block.
refreshIcon.setAttribute("width", "17");
refreshIcon.setAttribute("height", "17");
refreshIcon.setAttribute("fill", "currentColor");
refreshIcon.setAttribute("aria-hidden", "true");
refreshIcon.setAttribute("focusable", "false");
const refreshPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
refreshPath.setAttribute(
  "d",
  "M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
);
refreshPath.setAttribute("fill", "currentColor");
refreshIcon.appendChild(refreshPath);
refresh.appendChild(refreshIcon);
toolbarRow.appendChild(refresh);

toolbar.appendChild(toolbarRow);
dv.container.appendChild(toolbar);

const host = el("div", "lv-results");
dv.container.appendChild(host);

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

const render = () => {
  clear(host);
  // The rows are appended straight into the host, so the container class has
  // to be applied here: .lv-chips and .lv-posters carry the gap (and the
  // poster grid), which keeps entries from running together into one block.
  const resolved = state.layout;
  host.className =
    "lv-results" +
    (resolved === "table" ? "" : " lv-" + (resolved === "poster" ? "posters" : resolved));
  const visible = rows.filter(matches);
  const ordered = orderRows(visible);
  if (visible.length === 0) {
    host.appendChild(el("div", "lv-empty", rows.length === 0 ? "No " + noun + " synced yet." : "No entries match your search."));
    setStatsText(rows.length === 0 ? "" : "Found 0 of " + rows.length + " " + noun);
    return;
  }
  // Unfiltered mirrors quotebook ("Showing 10 of 120 channels"); filtered
  // states the hit count, and the Show more button carries the paging. The
  // pill shows only the numbers until hovered (see statsShort above).
  const setStats = (shown) => {
    const filtered = state.query.trim() !== "";
    const text = filtered
      ? "Found " + visible.length + " of " + rows.length + " " + noun
      : "Showing " + shown + " of " + rows.length + " " + noun;
    setStatsText(text);
  };
  if (resolved === "table") {
    renderTableRows(host, ordered, setStats);
  } else {
    mount(host, ordered, resolved === "poster" ? posterCard : chipRow, setStats);
  }
};

let searchTimer = null;
search.addEventListener("input", () => {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.query = search.value;
    render();
  }, ${SEARCH_DEBOUNCE_MS});
});

scope.addEventListener("change", () => {
  state.scope = scope.value;
  syncPlaceholder();
  render();
});

const applyLayout = (value) => {
  state.layout = migrateLayout(value);
  layoutSelect.value = state.layout;
  syncSeg();
  persistLayout(state.layout);
  // Stash the search for the re-render the refresh below triggers, then
  // apply locally (instant, and the fallback when that refresh does not
  // happen, for example when Dataview's own auto refresh is switched off).
  if (STASH) STASH[viewKey] = { query: search.value, scope: scope.value };
  render();
  refreshOtherViews();
  // If nothing consumed the stash, drop it so a much later re-render does
  // not resurrect a stale search.
  window.setTimeout(() => {
    if (STASH) delete STASH[viewKey];
  }, 0);
};
layoutSelect.addEventListener("change", () => applyLayout(layoutSelect.value));

refresh.addEventListener("click", () => {
  // Joined channel faces are cached on first render; drop them so newly
  // synced avatars land. Then re-read the note's own bullets (Dataview's
  // index is current by the time a view renders) and keep any active search.
  resetKindCache();
  rows = readRows();
  state.query = search.value;
  render();
});

// A layout switch in this note stashes the search so the re-render it
// triggers keeps it; restore it here, before the first paint. Scope values
// only apply when the option still exists (the sections offer different
// scope lists).
if (STASH && STASH[viewKey]) {
  const saved = STASH[viewKey];
  delete STASH[viewKey];
  if (saved.query) {
    search.value = saved.query;
    state.query = saved.query;
  }
  if (saved.scope) {
    for (const option of scope.children) {
      if (option.value === saved.scope) {
        scope.value = saved.scope;
        state.scope = saved.scope;
        break;
      }
    }
  }
  syncPlaceholder();
}

// The toolbar stays even on an empty note, so the layout can still be
// switched; render() owns both empty states (nothing synced vs. no match).
render();
`;
}

