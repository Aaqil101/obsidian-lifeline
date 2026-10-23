/**
 * Note-view scripts: the optional DataviewJS views that sit above the
 * inline-field entries in Channels.md, every playlist note, and Watch
 * Later.md. One generated script per note type, so each note calls its own
 * file once:
 *
 *   dv.view("<scriptsFolder>/lifeline-channels", { layout: "chips", fields: {...} })
 *   dv.view("<scriptsFolder>/lifeline-playlists", { layout: "cards" })
 *   dv.view("<scriptsFolder>/lifeline-watchlater", { layout: "cards" })
 *
 * The section (channels or playlist) is baked into each script rather than
 * passed in, along with the note type, which is the key each view reads and
 * writes its layout under. Layouts: chips, cards, and table, plus the
 * YouTube-style poster card on Channels only. Every layout reads the calling
 * note's own list entries via dv.current().file.lists, so the view always
 * mirrors the bullets below it and needs no vault-wide query.
 *
 * Each view opens with a toolbar in the spirit of the quotebook DataviewJS
 * script: one bordered container holding the search row (search box, a
 * "search in" scope select, a Layout select, a Refresh button) with the
 * result count in a bar beneath it. The Layout select switches the rendering
 * immediately and writes the choice back into the plugin's settings under
 * this note type's own key, the same slot the three settings rows edit, then
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
 * one file per kind (the channels sheet additionally carries the poster
 * chrome), and each generated script caches its own file's path and reads it
 * at view time with app.vault.cachedRead, injecting it once under its own
 * style id, so the CSS can be themed, overridden, or updated without
 * regenerating the scripts. With the file missing the view still works, just
 * unstyled. The superseded single lifeline-views.css is cleaned up by sync.
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

/** How many entries a chips or cards view paints before it needs a click. */
const PAGE_SIZE = 60;

/** Debounce for the toolbar search box, matching the quotebook script. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * View chrome shared by every note view, scoped under the `.lifeline-views`
 * class that the script adds to its container: the toolbar (search, scope,
 * layout select, refresh) and the count bar. Table rules preserve Dataview's
 * default table and just frame it; chips and cards are drawn from scratch
 * with theme variables only, so every accent follows the user's theme.
 *
 * The per-kind sheets (NOTE_VIEWS_CSS_BY_KIND) assemble this plus the pieces
 * a kind can select; sync writes one file per kind into the styles folder and
 * the generated script reads that file at view time and injects it, so
 * restyling never needs a code change here.
 */
/**
 * The list layouts the layout select offers on every kind of note: Dataview's
 * framed table, chips, and the thumbnail cards.
 */
const NOTE_VIEWS_CSS_LISTS = `
.lifeline-views table.dataview.table-view-table {
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 8px);
    overflow: hidden;
    margin: 4px 0 8px;
}
.lifeline-views table.dataview.table-view-table thead > tr > th {
    background: var(--background-secondary);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.85em;
    text-align: left;
    border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-views table.dataview.table-view-table tbody > tr > td {
    border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-views table.dataview.table-view-table tbody > tr:last-child > td {
    border-bottom: none;
}
.lifeline-views table.dataview.table-view-table tbody > tr:hover > td {
    background: var(--background-modifier-hover);
}
.lifeline-views .lv-chips,
.lifeline-views .lv-cards {
    margin: 8px 0 14px;
}
.lifeline-views .lv-chips {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
.lifeline-views .lv-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
}
.lifeline-views .lv-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--background-modifier-border);
    border-left: 3px solid var(--text-accent, var(--interactive-accent));
    border-radius: var(--radius-s, 6px);
    background: var(--background-secondary);
    overflow: hidden;
}
.lifeline-views .lv-card:hover {
    background: var(--background-modifier-hover);
}
.lifeline-views .lv-card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
}
.lifeline-views .lv-card .lv-title {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
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
.lifeline-views .lv-card .lv-thumb {
    width: 100%;
    height: 110px;
    border-radius: 0;
}
.lifeline-views .lv-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-banner {
    position: relative;
    width: 100%;
    height: 110px;
    background: var(--background-modifier-border);
}
.lifeline-views .lv-banner img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.lifeline-views .lv-avatar {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-weight: 600;
}
.lifeline-views .lv-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
/* Inside a strip the badge straddles the banner's lower-left edge, the way a
   channel header sits on YouTube; the ring in the card's background color
   separates it from the artwork behind it. */
.lifeline-views .lv-banner .lv-avatar {
    position: absolute;
    left: 16px;
    bottom: -24px;
    border: 3px solid var(--background-secondary);
    z-index: 1;
}
.lifeline-views .lv-card--banner .lv-card-body {
    /* The badge's lower half hangs into the body, so the title clears it. */
    padding-top: 20px;
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
.lifeline-views .lv-meta-row {
    display: flex;
    gap: 6px;
    font-size: 0.85em;
}
.lifeline-views .lv-meta-label {
    color: var(--text-muted);
}
.lifeline-views .lv-more {
    width: 100%;
    /* The container gap already separates it from the last row. */
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
.lifeline-views .lv-cards > .lv-more {
    grid-column: 1 / -1;
}
.lifeline-views .lv-more:hover {
    background: var(--background-modifier-hover);
}
`;

/**
 * View chrome shared by every note view, scoped under the `.lifeline-views`
 * class that the script adds to its container: the toolbar (search, scope,
 * layout select, refresh) and the count bar.
 */
const NOTE_VIEWS_CSS_SHARED = `
.lifeline-views .lv-toolbar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 4px 0 16px;
    padding: 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 8px);
    background: var(--background-secondary);
}
.lifeline-views .lv-toolbar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.lifeline-views .lv-search {
    flex: 1 1 300px;
    min-width: 220px;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 6px);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 14px;
}
.lifeline-views .lv-search:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px
        var(
            --background-modifier-border-focus,
            var(--background-modifier-border)
        );
}
.lifeline-views .lv-search::placeholder {
    color: var(--text-muted);
    font-style: normal;
}
.lifeline-views .lv-select {
    min-height: 44px;
    padding: 0 12px;
    line-height: normal;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 6px);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 14px;
    max-width: 190px;
}
.lifeline-views .lv-refresh {
    padding: 12px 20px;
    cursor: pointer;
    border: none;
    border-radius: var(--radius-s, 6px);
    background: var(--interactive-accent);
    color: var(--text-on-accent, var(--text-normal));
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
}
.lifeline-views .lv-refresh:hover {
    background: var(--interactive-accent-hover, var(--interactive-hover));
}
.lifeline-views .lv-stats {
    padding: 10px 16px;
    border-radius: var(--radius-s, 6px);
    background: var(--background-primary);
    color: var(--text-accent, var(--interactive-accent));
    font-size: 14px;
    font-weight: 500;
}
.lifeline-views .lv-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 14px;
}
@media (max-width: 600px) {
    .lifeline-views .lv-toolbar-row {
        flex-direction: column;
        align-items: stretch;
    }
    .lifeline-views .lv-search,
    .lifeline-views .lv-select {
        max-width: unset;
        width: 100%;
    }
}
`;

/**
 * The poster layout, a Channels-only card drawn the way YouTube draws a
 * channel page: the banner fills the top with the identity strip (avatar,
 * name, handle) laid onto a gradient at its foot, stat tiles run under a
 * hairline, and a red subscribe badge plus a calendar button close the card.
 * The classes carry the lv-poster- prefix so they never meet the shipped
 * chips/cards chrome (lv-banner, lv-avatar, lv-card) even though the two
 * never render into the same container.
 */
const NOTE_VIEWS_CSS_POSTER = `
.lifeline-views .lv-posters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
    gap: 20px;
    margin: 8px 0 16px;
}
.lifeline-views .lv-poster-card {
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
/* Identity strip: avatar circle, name, and handle laid onto a gradient at
   the banner's foot, the way a channel page header reads on YouTube. */
.lifeline-views .lv-poster-strip {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 14px 10px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.82));
}
.lifeline-views .lv-poster-head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 16px;
}
/* The avatar is its own circle: standalone size, its own ring, pulled over
   the banner's lower edge like a channel badge. */
.lifeline-views .lv-poster-avatar {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 76px;
    height: 76px;
    margin-top: -22px;
    border: 4px solid var(--background-secondary);
    border-radius: 50%;
    overflow: hidden;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-weight: 600;
    z-index: 1;
}
.lifeline-views .lv-poster-card--bare .lv-poster-avatar {
    margin-top: 0;
}
.lifeline-views .lv-poster-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
/* Name and handle as a capsule beside the avatar circle, ending where the
   text ends. Inside the banner strip the same classes strip their capsule
   down and pick up the white-on-gradient colors instead. */
.lifeline-views .lv-poster-id {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    max-width: 100%;
    padding: 5px 12px 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-left: 3px solid var(--text-accent, var(--interactive-accent));
    border-radius: 8px;
    background: var(--background-secondary);
}
.lifeline-views .lv-poster-handle {
    color: var(--text-muted);
    font-size: 0.75em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.lifeline-views .lv-poster-name {
    display: block;
    flex: 0 1 auto;
    min-width: 0;
    font-size: 1.05em;
    font-weight: 700;
    color: var(--text-normal);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.lifeline-views .lv-poster-name:hover {
    text-decoration: underline;
}
/* Everything under the head, full width now. */
.lifeline-views .lv-poster-info {
    min-width: 0;
    padding: 12px 16px 16px;
}
/* Stat tiles: subscribers, videos, views, in one hairline-divided strip. */
.lifeline-views .lv-poster-stats {
    display: flex;
    padding: 9px 0;
    border-top: 1px solid var(--background-modifier-border);
}
.lifeline-views .lv-poster-stat {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
}
.lifeline-views .lv-poster-stat + .lv-poster-stat {
    border-left: 1px solid var(--background-modifier-border);
}
.lifeline-views .lv-poster-stat-num {
    font-weight: 700;
    font-size: 1.05em;
}
.lifeline-views .lv-poster-stat-label {
    color: var(--text-muted);
    font-size: 0.68em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
/* The subscribed badge: YouTube red, bell in front, the subscribed-since
   date on the calendar button beside it as a tooltip. */
.lifeline-views .lv-poster-footrow {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
}
.lifeline-views .lv-poster-sub-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: 50px;
    height: 30px;
    border-radius: 0;
    background: linear-gradient(180deg, #d31212, #a80404);
    color: #ffffff;
    line-height: 1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: filter 0.15s ease;
    cursor: default;
}
.lifeline-views .lv-poster-sub-badge:hover {
    filter: brightness(1.12);
}
.lifeline-views .lv-poster-since {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: 50px;
    height: 30px;
    border-radius: 0;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    color: var(--text-muted);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.03em;
    transition: color 0.15s ease, border-color 0.15s ease,
        background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.lifeline-views .lv-poster-since svg {
    flex: 0 0 auto;
    display: block;
}
/* The calendar sits dim-white until hover, when it turns YouTube red. The
   internal-link form answers the theme's own :hover styling, which would
   otherwise win the color fight against a plain class:hover. */
.lifeline-views a.lv-poster-since svg {
    fill: rgba(255, 255, 255, 0.85);
}
.lifeline-views a.internal-link.lv-poster-since:hover {
    color: #cc0000;
    background: var(--interactive-hover);
    border-color: rgba(255, 255, 255, 0.35);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.lifeline-views a.lv-poster-since:hover svg {
    fill: #cc0000;
}
/* The same button without a daily note behind it: plain text, no link. */
.lifeline-views span.lv-poster-since svg {
    fill: var(--text-faint);
}
.lifeline-views span.lv-poster-since:hover {
    transform: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
/* The open-external arrow pinned to the banner's top right corner: bare
   icon on a light-black scrim that reads on any artwork. */
.lifeline-views .lv-poster-banner-link {
    position: absolute;
    top: 10px;
    right: 12px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: 0;
    background: rgba(0, 0, 0, 0.35);
    color: #ffffff;
    text-decoration: none;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.7));
    transition: color 0.18s ease, background 0.18s ease, filter 0.18s ease,
        transform 0.18s ease;
}
.lifeline-views .lv-poster-banner-link:hover {
    color: #ff4d4d;
    background: rgba(0, 0, 0, 0.55);
    filter: drop-shadow(0 1px 5px rgba(204, 0, 0, 0.55))
        drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
    transform: translateY(-1px);
}
/* Poster with a banner: the head hides (the strip carries the identity) and
   the strip's avatar drops to its badge size on the gradient. */
.lifeline-views .lv-poster-card .lv-poster-head {
    display: none;
}
.lifeline-views .lv-poster-strip .lv-poster-avatar {
    width: 72px;
    height: 72px;
    margin: 0;
    border-width: 3px;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.lifeline-views .lv-poster-strip .lv-poster-avatar:hover {
    transform: scale(1.06);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.28);
}
.lifeline-views .lv-poster-strip .lv-poster-id {
    flex: 0 1 auto;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    opacity: 0;
    transform: translateX(-8px);
    transition: opacity 0.22s ease, transform 0.22s ease;
    pointer-events: none;
}
/* The name and handle hide themselves by default and show up when the
   pointer rests on the avatar circle: they slide in from its right, and
   the circle lifts a little as an invitation. */
.lifeline-views .lv-poster-strip .lv-poster-avatar:hover + .lv-poster-id {
    opacity: 1;
    transform: none;
}
.lifeline-views .lv-poster-strip .lv-poster-name {
    color: #ffffff;
    font-size: 1.1em;
}
.lifeline-views .lv-poster-strip .lv-poster-handle {
    color: rgba(255, 255, 255, 0.72);
}
/* Poster without a banner: fall back to a plain head, a smaller avatar, and
   the capsule back on, so the card stays a channel identity either way. */
.lifeline-views .lv-poster-card--bare .lv-poster-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 12px 16px 0;
}
.lifeline-views .lv-poster-card--bare .lv-poster-avatar {
    width: 56px;
    height: 56px;
    margin: 0;
    border-width: 3px;
}
.lifeline-views .lv-poster-card--bare .lv-poster-id {
    background: none;
    border: none;
    padding: 0;
    min-width: 0;
}
`;

/** One stylesheet per note kind: each script bakes its own file's path and
 *  reads it at view time. The channels sheet additionally carries the poster
 *  chrome, since only the channels layout picker offers Poster. */
export const NOTE_VIEWS_CSS_BY_KIND: Record<NoteViewKind, string> = {
	channels: NOTE_VIEWS_CSS_SHARED + NOTE_VIEWS_CSS_LISTS + NOTE_VIEWS_CSS_POSTER,
	playlists: NOTE_VIEWS_CSS_SHARED + NOTE_VIEWS_CSS_LISTS,
	watchlater: NOTE_VIEWS_CSS_SHARED + NOTE_VIEWS_CSS_LISTS,
};

/**
 * The poster card's builder, embedded verbatim (escapes included) into the
 * channels script only. Like the rest of the generated code it uses string
 * concatenation and no backticks. Image data comes off the bullet's own
 * fields through the shared helpers; the only network request an <img> ever
 * makes is for a remote *_url avatar or banner the user chose not to
 * download.
 */
const NOTE_VIEWS_POSTER_JS = `
// ---------------------------------------------------------------------------
// Poster layout: a YouTube-style channel card
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

// Name plus handle, the identity stack: capsule in the bare head,
// white-on-gradient labels inside the banner strip (CSS does the switch).
const posterIdStack = (item, link) => {
  const box = el("div", "lv-poster-id");
  box.appendChild(linkNode(link.label, link.href, "lv-poster-name"));
  if (item.handle) box.appendChild(el("div", "lv-poster-handle", String(item.handle)));
  return box;
};

// The identity laid onto the banner's lower gradient. The hover reveal
// (avatar circle slides the name in, circle lifts) is pure CSS:
// avatar:hover + id.
const posterIdentity = (item, link) => {
  const row = el("div", "lv-poster-strip");
  row.appendChild(posterAvatar(item, link.label));
  row.appendChild(posterIdStack(item, link));
  return row;
};

// Stat tiles: subscribers, videos, views, in one hairline-divided strip.
const posterStats = (item) => {
  const strip = el("div", "lv-poster-stats");
  const tile = (num, label) => {
    if (typeof num !== "number") return;
    const box = el("div", "lv-poster-stat");
    box.appendChild(el("div", "lv-poster-stat-num", fmtShort(num)));
    box.appendChild(el("div", "lv-poster-stat-label", label));
    strip.appendChild(box);
  };
  tile(item.subscribers, "subscribers");
  tile(item.videos, "videos");
  tile(item.views, "views");
  return strip.childElementCount ? strip : null;
};

// The old YouTube subscribe button's bell, drawn inline so the script never
// fetches anything; it inherits the badge's white.
const bellNode = () => {
  const svgNS = "http://www.w3.org/2000/svg";
  const bell = document.createElementNS(svgNS, "svg");
  bell.setAttribute("viewBox", "0 -960 960 960");
  bell.setAttribute("width", "24");
  bell.setAttribute("height", "24");
  bell.setAttribute("aria-hidden", "true");
  bell.setAttribute("fill", "currentColor");
  const shape = document.createElementNS(svgNS, "path");
  shape.setAttribute(
    "d",
    "M80-560q0-100 44.5-183.5T244-882l47 64q-60 44-95.5 111T160-560H80Zm720 0q0-80-35.5-147T669-818l47-64q75 55 119.5 138.5T880-560h-80ZM160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z",
  );
  bell.appendChild(shape);
  // The bell's cavity punches through to whatever sits behind it; fill it
  // white explicitly so it never takes on the badge or artwork color.
  const inner = document.createElementNS(svgNS, "path");
  inner.setAttribute("fill", "#ffffff");
  inner.setAttribute(
    "d",
    "M320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z",
  );
  bell.appendChild(inner);
  return bell;
};

// A small calendar icon, matching the bell's Material icon family.
const calendarNode = () => {
  const svgNS = "http://www.w3.org/2000/svg";
  const cal = document.createElementNS(svgNS, "svg");
  cal.setAttribute("viewBox", "0 -960 960 960");
  cal.setAttribute("width", "24");
  cal.setAttribute("height", "24");
  cal.setAttribute("aria-hidden", "true");
  cal.setAttribute("fill", "currentColor");
  const shape = document.createElementNS(svgNS, "path");
  shape.setAttribute(
    "d",
    "M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z",
  );
  cal.appendChild(shape);
  return cal;
};

// Resolves the daily note behind a subscribed-on date, through this note's
// own path like every other wikilink. A date with no journal entry renders
// as plain text rather than as a link to a note that does not exist.
const journalDest = (iso) => {
  try {
    const current = dv.current();
    const from = current && current.file ? current.file.path : "";
    return app.metadataCache.getFirstLinkpathDest(iso, from) ? from : null;
  } catch (err) {
    return null;
  }
};

const posterCard = (item) => {
  const link = mdLink(item.channel);
  const node = el("article", "lv-poster-card");
  const info = el("div", "lv-poster-info");
  const bannerSrc = imageSrc(mdBanner(item));
  if (!bannerSrc) node.classList.add("lv-poster-card--bare");

  // Banner with the identity strip at its foot and the open-external arrow
  // pinned to the top right corner (a plain anchor, the same way the title
  // links are handed to Obsidian, which routes external hrefs itself).
  // A dead or missing banner drops the strip entirely (bare card), so a
  // square avatar is never force-cropped into a wide band.
  if (bannerSrc) {
    const strip = el("div", "lv-poster-banner");
    const img = document.createElement("img");
    img.src = bannerSrc;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.style.display = "none";
    });
    strip.appendChild(img);
    if (link.href) {
      const corner = document.createElement("a");
      corner.className = "lv-poster-banner-link";
      corner.href = link.href;
      corner.target = "_blank";
      corner.rel = "noopener";
      corner.setAttribute("aria-label", "Open on YouTube");
      const svgNS = "http://www.w3.org/2000/svg";
      const icon = document.createElementNS(svgNS, "svg");
      icon.setAttribute("viewBox", "0 -960 960 960");
      icon.setAttribute("width", "18");
      icon.setAttribute("height", "18");
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("fill", "currentColor");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute(
        "d",
        "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z",
      );
      icon.appendChild(path);
      corner.appendChild(icon);
      strip.appendChild(corner);
    }
    strip.appendChild(posterIdentity(item, link));
    node.appendChild(strip);
  } else {
    // A banner-less card is a plain head: avatar + name, no forced art.
    const head = el("div", "lv-poster-head");
    head.appendChild(posterAvatar(item, link.label));
    head.appendChild(posterIdStack(item, link));
    node.appendChild(head);
  }

  const stats = posterStats(item);
  if (stats) info.appendChild(stats);

  // The subscription facts, the way YouTube draws them: a red bell badge,
  // then the since date as a framed calendar button that opens that day's
  // journal note. Both buttons are icon-only; their labels live in
  // (single) aria-label tooltips, and the country rides on the since one.
  const footrow = el("div", "lv-poster-footrow");
  if (item.subscribed_on) {
    const iso = fmtDate(item.subscribed_on);
    if (iso && iso !== "-") {
      const where = item.country ? " \\u00b7 " + String(item.country) : "";
      // The badge is icon-only; the label lives in the aria-label tooltip.
      const badge = el("span", "lv-poster-sub-badge");
      badge.appendChild(bellNode());
      badge.setAttribute("aria-label", "Subscribed");
      footrow.appendChild(badge);
      const from = journalDest(iso);
      let since;
      if (from) {
        since = document.createElement("a");
        since.className = "internal-link lv-poster-since";
        since.dataset.href = iso;
        since.addEventListener("click", (evt) => {
          evt.preventDefault();
          app.workspace.openLinkText(iso, from, false);
        });
      } else {
        since = document.createElement("span");
        since.className = "lv-poster-since";
      }
      since.appendChild(calendarNode());
      since.setAttribute("aria-label", "Subscribed since " + iso + where);
      footrow.appendChild(since);
    }
  }
  if (footrow.childElementCount) info.appendChild(footrow);

  node.appendChild(info);
  return node;
};
`;

/**
 * The full source of one generated view script (lifeline-channels.js,
 * lifeline-playlists.js, or lifeline-watchlater.js). The generated code
 * contains no backticks and no `${...}` placeholders, so it can be embedded
 * in this TS template literal; the stylesheet path is baked in and the CSS
 * itself is read from that file at view time (the quotebook.css pattern), so
 * restyling never regenerates the scripts. String building inside the script
 * uses concatenation rather than template literals for the same reason.
 */
export function renderNoteViewScript(kind: NoteViewKind, stylesFolder: string): string {
	const section = NOTE_VIEW_SECTIONS[kind];
	const note = NOTE_VIEW_NOTES[kind];
	return `/**
 * Lifeline note-view script for ${note} (generated).
 *
 * The note invokes this file once:
 *   dv.view("98 - Organize/Scripts/lifeline-${kind}", { layout: "${kind === 'channels' ? 'chips' : 'cards'}"${kind === 'channels' ? ', fields: {...}' : ''} })
 * Layouts: ${kind === 'channels' ? 'poster, chips, cards, table' : 'chips, cards, table'}. Every layout reads the calling
 * note's own list entries (dv.current().file.lists), so the view mirrors the
 * inline-field entries below it. Regenerated on every sync while "Views in
 * notes" is on; hand edits are overwritten.
 *
 * The toolbar at the top offers search, a "search in" scope, a Layout select,
 * and Refresh, all inside one bordered container with the result count in a
 * bar beneath the controls. Layout changes are instant, are written back into
 * the plugin's settings under this note type's own key, so playlists and Watch
 * Later can differ, and refresh the other open views; the layout baked into
 * the note is only a fallback for when the plugin cannot be reached.
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
const dash = (v) => (v == null || v === "" ? "-" : v);

const STYLE_ID = ${JSON.stringify("lifeline-views-style-" + kind)};
const CSS_PATH = ${JSON.stringify(viewsStylesheetPath(kind, stylesFolder))};
// Read the stylesheet like the quotebook script reads quotebook.css: from
// the vault itself, once per render, so edits apply on the next re-render.
// A missing file (views just enabled, folder moved) leaves the view
// unstyled but fully functional rather than breaking it.
const ensureStyle = async () => {
  if (document.getElementById(STYLE_ID)) return;
  let css = "";
  try {
    const file = app.vault.getAbstractFileByPath(CSS_PATH);
    css = file ? await app.vault.cachedRead(file) : "";
  } catch (err) {
    css = "";
  }
  if (!css) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
};

dv.container.classList.add("lifeline-views");
await ensureStyle();

// List entries of the calling note, in document order: channels are already
// alphabetical and playlist entries already in playlist position order.
const listEntries = () => {
  const current = dv.current();
  return toArr(current && current.file ? current.file.lists : current ? current.lists : null);
};

// Bare ISO dates (subscribed_on:: 2026-10-20) come back from Dataview as Luxon
// DateTimes, which dv.table would render long ("October 20, 2026") and wrap to
// two lines. Force the compact yyyy-MM-dd form so date columns stay one line.
// The playlist date field is written as a wiki link ([[2026-10-20]]), so
// Dataview hands back a Link rather than a date: read the date back out of it.
// The table column keeps passing the raw value to dv.table, which renders a
// Link natively; chips and cards build their own DOM, so they need fmtDate.
const fmtDate = (v) => {
  if (v == null || v === "") return "-";
  if (typeof v.toFormat === "function") return v.toFormat("yyyy-MM-dd");
  if (typeof v === "object" && (typeof v.path === "string" || typeof v.display === "string")) {
    const text = v.display != null ? String(v.display) : String(v.path);
    const found = /(\\d{4}-\\d{2}-\\d{2})/.exec(text);
    return found ? found[1] : text;
  }
  return String(v);
};

// A 24-char channel ID (UC...) is the widest column and the least scannable;
// show a short prefix and keep the full value in the native hover tooltip
// (dv.table renders an element cell as-is).
const idCell = (v) => {
  const full = String(v == null ? "" : v);
  if (full === "") return "-";
  const el = document.createElement("span");
  el.textContent = full.length > 12 ? full.slice(0, 8) + "\\u2026" : full;
  el.title = full;
  el.style.cursor = "help";
  return el;
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

const numCell = (n) => {
  const full = Number(n).toLocaleString("en-US");
  const el = document.createElement("span");
  el.textContent = fmtShort(n);
  el.title = full;
  el.style.cursor = "help";
  el.addEventListener("click", () => {
    el.textContent = el.textContent === full ? fmtShort(n) : full;
  });
  return el;
};

// Counts render compact when present, "-" when the field is off or missing.
const numOrDash = (v) => (typeof v === "number" ? numCell(v) : dash(v));

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
// own names. Channels only, and only the card layout draws it: at chip width
// a banner would be an unreadable sliver. No legacy-embed path, because
// bullets never carried a banner embed.
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
// the note's own path, so no folder setting has to be baked in. Both paths are
// offline lookups: neither issues a network request.
const imageSrc = (img) => {
  if (!img) return null;
  if (!img.local) return img.target;
  try {
    const current = dv.current();
    const from = current && current.file ? current.file.path : "";
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

// The channel avatar as a round badge, same lazy load and letter fallback as
// the chip thumb. In a card it straddles the banner's lower edge; with no
// banner it simply leads the body.
const avatarBadge = (src, label) => {
  const box = el("div", "lv-avatar");
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

const metaRow = (parent, label, value) => {
  if (value == null || value === "") return;
  const row = el("div", "lv-meta-row");
  row.appendChild(el("span", "lv-meta-label", label));
  const cell = el("span", "lv-meta-value");
  if (typeof value === "string") cell.textContent = value;
  else cell.appendChild(value);
  row.appendChild(cell);
  parent.appendChild(row);
};

// Chips and cards paint one page, then append the rest behind a button, so a
// 900-video Watch Later builds 60 nodes on open instead of 900. onPaint runs
// after every page so the toolbar count stays honest.
const mount = (host, items, renderOne, onPaint) => {
  let shown = 0;
  let more = null;
  const paint = (count) => {
    const end = Math.min(items.length, shown + count);
    for (let i = shown; i < end; i++) host.appendChild(renderOne(items[i]));
    shown = end;
    if (more) {
      more.textContent = "Show more (" + (items.length - shown) + ")";
      host.appendChild(more); // keep the button last as rows grow
    }
    if (shown >= items.length && more) {
      more.parentNode.removeChild(more);
      more = null;
    }
    if (onPaint) onPaint(shown);
  };
  paint(${PAGE_SIZE});
  if (shown < items.length) {
    more = el("button", "lv-more");
    more.type = "button";
    more.textContent = "Show more (" + (items.length - shown) + ")";
    more.addEventListener("click", () => paint(${PAGE_SIZE}));
    host.appendChild(more);
  }
};

// ---------------------------------------------------------------------------
// Table layout (phase 1 behavior; Dataview's own table when available)
// ---------------------------------------------------------------------------

// Build headers + values instead of calling dv.table directly, so the same
// columns feed both the native table and the plain fallback below.
const channelsTable = (rows) => {
  const headers = ["Channel"];
  const getters = [(item) => dash(item.channel)];
  const add = (key, header, get) => {
    if (want(key)) {
      headers.push(header);
      getters.push(get);
    }
  };
  add("channelId", "ID", (item) => idCell(item.id));
  add("subscribedOn", "Subscribed on", (item) => fmtDate(item.subscribed_on));
  add("syncDates", "First seen", (item) => fmtDate(item.first_seen));
  add("syncDates", "Last seen", (item) => fmtDate(item.last_seen));
  add("status", "Status", (item) => dash(item.status));
  add("handle", "Handle", (item) => dash(item.handle));
  add("subscribers", "Subscribers", (item) => numOrDash(item.subscribers));
  add("videos", "Videos", (item) => numOrDash(item.videos));
  add("views", "Views", (item) => numOrDash(item.views));
  add("country", "Country", (item) => dash(item.country));
  return { headers, values: rows.map((item) => getters.map((get) => get(item))) };
};

const playlistTable = (rows) => ({
  headers: ["Video", "Channel", "Date added"],
  values: rows.map((item) => [dash(item.title), dash(item.channel), dash(item.date)]),
});

// Plain DOM fallback for when dv.api.table is unavailable. Same classes as
// Dataview's table, so the injected CSS frames both identically. Values that
// dv.table would render natively (a date Link, a Luxon DateTime) are not DOM
// nodes here, so they go through fmtDate / String instead of appendChild.
const domTable = (headers, values) => {
  const table = el("table", "dataview table-view-table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of headers) headRow.appendChild(el("th", "", header));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const value of values) {
    const row = document.createElement("tr");
    for (const cell of value) {
      const td = document.createElement("td");
      if (cell != null && typeof cell.appendChild === "function") td.appendChild(cell);
      else if (cell != null && typeof cell === "object") td.textContent = fmtDate(cell);
      else td.textContent = String(cell == null ? "" : cell);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
};

// dv.table renders into dv.container, which would stack one table per
// re-render; the low-level api.table takes a container, so the table lands in
// the same host the chips and cards use and can be cleared like them.
const renderTable = (host, built) => {
  if (dv.api && typeof dv.api.table === "function") {
    dv.api.table(built.headers, built.values, host, dv.component, dv.currentFilePath);
    return;
  }
  host.appendChild(domTable(built.headers, built.values));
};

// ---------------------------------------------------------------------------
// Chips layout: one compact row per entry
// ---------------------------------------------------------------------------

const channelChipMeta = (item) => {
  const bits = [];
  if (want("handle") && item.handle) bits.push(String(item.handle));
  if (want("subscribers") && typeof item.subscribers === "number") bits.push(fmtShort(item.subscribers) + " subscribers");
  if (want("videos") && typeof item.videos === "number") bits.push(fmtShort(item.videos) + " videos");
  if (want("status") && item.status) bits.push(String(item.status));
  if (want("country") && item.country) bits.push(String(item.country));
  return bits.join(" \\u00b7 ");
};

const playlistChipMeta = (item) => {
  const bits = [];
  const channel = mdLink(item.channel);
  if (channel.label) bits.push(channel.label);
  if (item.date != null && item.date !== "") bits.push(fmtDate(item.date));
  return bits.join(" \\u00b7 ");
};

const chipRow = (item, section) => {
  const link = section === "channels" ? mdLink(item.channel) : mdLink(item.title);
  const row = el("div", "lv-chip");
  const image = thumb(item, link.label);
  if (image) row.appendChild(image);
  const body = el("div", "lv-body");
  body.appendChild(linkNode(link.label, link.href, "lv-title"));
  const meta = section === "channels" ? channelChipMeta(item) : playlistChipMeta(item);
  if (meta) body.appendChild(el("div", "lv-meta", meta));
  row.appendChild(body);
  return row;
};

// ---------------------------------------------------------------------------
// Cards layout: a bordered card per entry, accent on the left edge
// ---------------------------------------------------------------------------

const channelCard = (body, item) => {
  if (want("channelId") && item.id) metaRow(body, "ID", idCell(item.id));
  if (want("subscribedOn") && item.subscribed_on) metaRow(body, "Subscribed on", fmtDate(item.subscribed_on));
  if (want("syncDates") && item.first_seen) metaRow(body, "First seen", fmtDate(item.first_seen));
  if (want("syncDates") && item.last_seen) metaRow(body, "Last seen", fmtDate(item.last_seen));
  if (want("status") && item.status) metaRow(body, "Status", String(item.status));
  if (want("handle") && item.handle) metaRow(body, "Handle", String(item.handle));
  if (want("subscribers") && typeof item.subscribers === "number") metaRow(body, "Subscribers", numCell(item.subscribers));
  if (want("videos") && typeof item.videos === "number") metaRow(body, "Videos", numCell(item.videos));
  if (want("views") && typeof item.views === "number") metaRow(body, "Views", numCell(item.views));
  if (want("country") && item.country) metaRow(body, "Country", String(item.country));
};

const playlistCard = (body, item) => {
  const channel = mdLink(item.channel);
  if (channel.label) metaRow(body, "Channel", linkNode(channel.label, channel.href, "lv-meta-link"));
  if (item.date != null && item.date !== "") metaRow(body, "Date added", fmtDate(item.date));
};

// The channel header a card draws: the banner fills the top strip (the wide
// shape it was drawn for) and the avatar becomes a round badge half over its
// lower-left edge, the way a YouTube channel header sits. A channel with no
// banner skips the strip entirely and the badge simply leads the body, so a
// square avatar is never force-cropped into a wide band. Videos keep the
// plain thumbnail strip.
const cardHeader = (node, body, item, label) => {
  const avatar = imageSrc(mdImage(item));
  const banner = imageSrc(mdBanner(item));
  const badge = avatar ? avatarBadge(avatar, label) : null;
  if (banner) {
    const strip = el("div", "lv-banner");
    const img = document.createElement("img");
    img.src = banner;
    img.alt = "";
    img.loading = "lazy";
    // A dead banner link leaves the plain themed strip behind (the badge and
    // the rows below still render), never a broken-image icon.
    img.addEventListener("error", () => {
      img.style.display = "none";
    });
    strip.appendChild(img);
    if (badge) strip.appendChild(badge);
    node.appendChild(strip);
    // The class only means the badge overhangs the strip, so the body's top
    // padding clears it; a banner with no avatar keeps its normal padding.
    if (badge) node.classList.add("lv-card--banner");
  } else if (badge) {
    body.appendChild(badge);
  }
};

const card = (item, section) => {
  const link = section === "channels" ? mdLink(item.channel) : mdLink(item.title);
  const node = el("article", "lv-card");
  const body = el("div", "lv-card-body");
  if (section === "channels") cardHeader(node, body, item, link.label);
  else {
    const image = thumb(item, link.label);
    if (image) node.appendChild(image);
  }
  body.appendChild(linkNode(link.label, link.href, "lv-title"));
  if (section === "channels") channelCard(body, item);
  else playlistCard(body, item);
  node.appendChild(body);
  return node;
};
${kind === 'channels' ? NOTE_VIEWS_POSTER_JS : ""}
// ---------------------------------------------------------------------------
// Toolbar: search, scope, layout, refresh
// ---------------------------------------------------------------------------

const KNOWN_LAYOUTS = ${JSON.stringify(
      kind === 'channels' ? ['table', 'mixed', 'chips', 'cards', 'poster'] : ['table', 'mixed', 'chips', 'cards'],
    )};
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
// makes them: bump the index
// revision, then fire the refresh event (Dataview ignores the event unless
// the revision moved). Our own view re-renders too, which is why the current
// search is stashed below and restored by the next run instead of dropped.
// Guarded: the local render in the change handler already applied either way.
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

const baked = String(input.layout == null ? "mixed" : input.layout);
const state = {
  layout: liveLayout() || (KNOWN_LAYOUTS.indexOf(baked) >= 0 ? baked : "mixed"),
  query: "",
  scope: "all",
};

// "mixed" is per section: chips suit the flat alphabetical channel list,
// cards suit ordered video lists. A poster value can only exist in the
// channels script (the other kinds never offer or persist it), but the guard
// keeps a stray stored value from reaching posterCard anyway.
const resolveLayout = (requested) => {
  if (requested === "mixed") return section === "channels" ? "chips" : "cards";
  if (requested === "poster" && section !== "channels") return "cards";
  return requested;
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

const search = document.createElement("input");
search.type = "text";
search.className = "lv-search";
search.placeholder = "Search " + noun + "...";
search.setAttribute("aria-label", "Search " + noun);
toolbarRow.appendChild(search);

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
toolbarRow.appendChild(scope);

const layoutSelect = document.createElement("select");
layoutSelect.className = "lv-select";
layoutSelect.setAttribute("aria-label", "Layout");
// The layout choices, per note type: the video lists keep chips, cards, and
// table; Channels adds the poster card.
for (const option of ${JSON.stringify(
      kind === 'channels'
        ? [
            ['poster', 'Poster'],
            ['chips', 'Chips'],
            ['cards', 'Cards'],
            ['table', 'Table'],
          ]
        : [
            ['chips', 'Chips'],
            ['cards', 'Cards'],
            ['table', 'Table'],
          ],
    )}) {
  const opt = document.createElement("option");
  opt.value = option[0];
  opt.textContent = option[1];
  layoutSelect.appendChild(opt);
}
layoutSelect.value = resolveLayout(state.layout);
toolbarRow.appendChild(layoutSelect);

const refresh = document.createElement("button");
refresh.type = "button";
refresh.className = "lv-refresh";
refresh.textContent = "Refresh";
refresh.setAttribute("aria-label", "Re-read the entries in this note");
toolbarRow.appendChild(refresh);

const stats = el("div", "lv-stats");
toolbar.appendChild(toolbarRow);
toolbar.appendChild(stats);
dv.container.appendChild(toolbar);

const host = el("div", "lv-results");
dv.container.appendChild(host);

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

const render = () => {
  clear(host);
  // The rows are appended straight into the host, so the container class has
  // to be applied here: .lv-chips and .lv-cards carry the gap (and the card
  // grid), .lv-posters the channel-photo grid, that keeps entries from
  // running together into one joined block.
  const resolved = resolveLayout(state.layout);
  host.className =
    "lv-results" +
    (resolved === "table" ? "" : " lv-" + (resolved === "poster" ? "posters" : resolved));
  const visible = rows.filter(matches);
  if (visible.length === 0) {
    host.appendChild(el("div", "lv-empty", rows.length === 0 ? "No " + noun + " synced yet." : "No entries match your search."));
    stats.textContent = rows.length === 0 ? "" : "Found 0 of " + rows.length + " " + noun;
    return;
  }
  // Unfiltered mirrors quotebook ("Showing 60 of 120 channels"); filtered
  // states the hit count, and the Show more button carries the paging.
  const setStats = (shown) => {
    const filtered = state.query.trim() !== "";
    stats.textContent = filtered
      ? "Found " + visible.length + " of " + rows.length + " " + noun
      : "Showing " + shown + " of " + rows.length + " " + noun;
  };
  if (resolved === "table") {
    const built = section === "channels" ? channelsTable(visible) : playlistTable(visible);
    renderTable(host, built);
    setStats(visible.length);
  } else {
    mount(
      host,
      visible,
      (item) =>
        resolved === "poster"
          ? posterCard(item)
          : resolved === "cards" ? card(item, section) : chipRow(item, section),
      setStats,
    );
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
  render();
});

layoutSelect.addEventListener("change", () => {
  state.layout = KNOWN_LAYOUTS.indexOf(layoutSelect.value) >= 0 ? layoutSelect.value : "mixed";
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
});

refresh.addEventListener("click", () => {
  // Re-read the note's own bullets (Dataview's index is current by the time a
  // view renders) and keep any active search across the refresh.
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
}

// The toolbar stays even on an empty note, so the layout can still be
// switched; render() owns both empty states (nothing synced vs. no match).
render();
`;
}
