/**
 * Note-view scripts: the optional DataviewJS views that sit above the
 * inline-field entries in Channels.md, every playlist note, and Watch
 * Later.md. One generated script per note type, so each note calls its own
 * file once:
 *
 *   dv.view("<scriptsFolder>/lifeline-channels", { layout: "mixed", fields: {...} })
 *   dv.view("<scriptsFolder>/lifeline-playlists", { layout: "mixed" })
 *   dv.view("<scriptsFolder>/lifeline-watchlater", { layout: "mixed" })
 *
 * The section (channels or playlist) is baked into each script rather than
 * passed in. Layouts: table, chips, cards, and mixed (chips for channels,
 * cards for playlists). Every layout reads the calling note's own list
 * entries via dv.current().file.lists, so the view always mirrors the bullets
 * below it and needs no vault-wide query.
 *
 * Each view opens with a toolbar in the spirit of the quotebook DataviewJS
 * script: one bordered container holding the search row (search box, a
 * "search in" scope select, a Layout select, a Refresh button) with the
 * result count in a bar beneath it. The Layout select switches the rendering
 * immediately and writes the choice back into the plugin's settings (there is
 * deliberately no settings row for it), then refreshes every open view the
 * way Dataview's own force-refresh command does, so no sync is needed: the
 * script prefers the live setting over the layout baked into the note, and
 * the baked value is only a fallback for when the plugin instance cannot be
 * reached.
 *
 * Sync writes the three scripts and the stylesheet whenever the "Views in
 * notes" setting is on (sync.ts: writeNoteViewScripts), trashes copies left
 * in a previous scripts folder (shared dashboardScriptsFolderWritten
 * tracking), and does the same for the stylesheet in a previous styles
 * folder (stylesFolderWritten). Written regardless of Dataview state: a
 * degraded note simply omits the block, and the scripts are ready when
 * Dataview comes back.
 *
 * The view chrome lives in its own vault file, lifeline-views.css in the
 * configured styles folder, exactly like quotebook and its quotebook.css:
 * sync writes the file, and every generated script reads it at view time
 * with app.vault.cachedRead and injects it once, so the CSS can be themed,
 * overridden, or updated without regenerating the scripts. With the file
 * missing the view still works, just unstyled.
 *
 * The scripts make no network request of their own. They read the image
 * fields the sync appended to the bullet (thumbnail/avatar for a local vault
 * file, thumbnail_url/avatar_url for a remote URL), and read the stylesheet
 * from the vault itself.
 *
 * Pure: this module only builds strings; sync.ts owns the vault writes.
 */
import { normalizeScriptsFolder } from './dashboardScript';

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

/** Default folder for the generated stylesheet (also the settings placeholder). */
export const DEFAULT_STYLES_FOLDER = '98 - Organize/Styles';

/** Generated stylesheet file name, mirroring quotebook.css in the same folder. */
export const VIEWS_STYLESHEET_FILE = 'lifeline-views.css';

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

/** Vault path of the generated stylesheet, e.g. `98 - Organize/Styles/lifeline-views.css`. */
export function viewsStylesheetPath(folder: string): string {
	return `${normalizeStylesFolder(folder)}/${VIEWS_STYLESHEET_FILE}`;
}

/** How many entries a chips or cards view paints before it needs a click. */
const PAGE_SIZE = 60;

/** Debounce for the toolbar search box, matching the quotebook script. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * View chrome, scoped under the `.lifeline-views` class that the script adds
 * to its container. Table rules preserve Dataview's default table and just
 * frame it; chips and cards are drawn from scratch with theme variables only,
 * so every accent follows the user's theme.
 *
 * Exported because sync writes it to the styles folder as lifeline-views.css
 * (the quotebook.css pattern): the generated script reads that file at view
 * time and injects it, so restyling never needs a code change here.
 */
export const NOTE_VIEWS_CSS = `.lifeline-views table.dataview.table-view-table {
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
  box-shadow: 0 0 0 2px var(--background-modifier-border-focus, var(--background-modifier-border));
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
  width: 48px;
  height: 48px;
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
  padding-top: 44px;
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
 *   dv.view("98 - Organize/Scripts/lifeline-${kind}", { layout: "mixed"${kind === 'channels' ? ', fields: {...}' : ''} })
 * Layouts: table, chips, cards, mixed (chips for channels, cards for
 * playlists; mixed is the default). Every layout reads the calling note's
 * own list entries (dv.current().file.lists), so the view mirrors the
 * inline-field entries below it. Regenerated on every sync while "Views in
 * notes" is on; hand edits are overwritten.
 *
 * The toolbar at the top offers search, a "search in" scope, a Layout select,
 * and Refresh, all inside one bordered container with the result count in a
 * bar beneath the controls. Layout changes are instant, are written back into
 * the plugin's settings, and refresh the other open views; the layout baked
 * into the note is only a fallback for when the plugin cannot be reached.
 *
 * Styling is NOT baked in: this script reads ${VIEWS_STYLESHEET_FILE} from
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

const STYLE_ID = "lifeline-views-style";
const CSS_PATH = ${JSON.stringify(viewsStylesheetPath(stylesFolder))};
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

// ---------------------------------------------------------------------------
// Toolbar: search, scope, layout, refresh
// ---------------------------------------------------------------------------

const KNOWN_LAYOUTS = ["table", "mixed", "chips", "cards"];
// Which note shape this file serves; baked per script ("channels" in
// lifeline-channels.js, "playlist" in the other two) rather than passed in.
const section = ${JSON.stringify(section)};

// The plugin instance is the live source of truth for the layout: switching
// in the toolbar saves it there, so every note follows without a sync. The
// layout baked into the note is only a fallback (plugin disabled, old note).
const pluginInstance = () => {
  try {
    return app.plugins && app.plugins.plugins ? app.plugins.plugins["lifeline"] : null;
  } catch (err) {
    return null;
  }
};

const liveLayout = () => {
  const plugin = pluginInstance();
  const value = plugin && plugin.settings ? plugin.settings.noteLayout : null;
  return KNOWN_LAYOUTS.indexOf(value) >= 0 ? value : null;
};

const persistLayout = (value) => {
  const plugin = pluginInstance();
  if (!plugin || !plugin.settings || typeof plugin.saveSettings !== "function") return;
  plugin.settings.noteLayout = value;
  try {
    Promise.resolve(plugin.saveSettings()).catch(() => {});
  } catch (err) {
    // A failed save only means the next note re-render falls back; harmless.
  }
};

// A layout switch here is a global choice, so other open views follow it the
// way Dataview's own force-refresh command makes them: bump the index
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

// "mixed" is per section: chips suit the flat alphabetical channel list, cards
// suit ordered video lists.
const resolveLayout = (requested) =>
  requested === "mixed" ? (section === "channels" ? "chips" : "cards") : requested;

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
for (const option of [["mixed", "Mixed"], ["chips", "Chips"], ["cards", "Cards"], ["table", "Table"]]) {
  const opt = document.createElement("option");
  opt.value = option[0];
  opt.textContent = option[1];
  layoutSelect.appendChild(opt);
}
layoutSelect.value = state.layout;
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
  // grid) that keeps entries from running together into one joined block.
  const resolved = resolveLayout(state.layout);
  host.className = "lv-results" + (resolved === "table" ? "" : " lv-" + resolved);
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
    mount(host, visible, (item) => (resolved === "cards" ? card(item, section) : chipRow(item, section)), setStats);
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
