/**
 * Dashboard view script (lifeline-dashboard.js): every DataviewJS feature of
 * Dashboard.md lives in this one external file, written into a user-editable
 * scripts folder. The note calls it once per section:
 *
 *   dv.view("<scriptsFolder>/lifeline-dashboard", { section: "playlists", ... })
 *
 * Sections: header (status hero, KPI tiles, quick-link chips, and the "New
 * since last sync" + "Needs attention" cards), playlists (top-5 summary plus
 * the full table in a collapsed block), channels (subscriber bars). All data
 * is queried live from dv.pages() inside the output folder (src option);
 * status, section toggles, and the sync date (since) are baked in per call.
 *
 * The plugin regenerates the file on every dashboard refresh, so hand edits
 * are overwritten (an explicit user choice). Sync writes it alongside every
 * Dashboard.md write (sync.ts: writeDashboardScript) and trashes a copy left
 * in a previous scripts folder (dashboardScriptsFolderWritten tracking).
 *
 * Pure: this module only builds strings; sync.ts owns the vault writes.
 */

/** Default folder for the generated script (also the settings placeholder). */
export const DEFAULT_SCRIPTS_FOLDER = '98 - Organize/Scripts';

/** Generated file name inside the scripts folder. */
export const DASHBOARD_SCRIPT_FILE = 'lifeline-dashboard.js';

/** Generated stylesheet name inside the styles folder, read by the generated
 *  script at view time (the quotebook.css pattern, like the note views). */
export const DASHBOARD_STYLESHEET_FILE = 'lifeline-dashboard.css';

/**
 * Normalize a user-entered scripts folder: forward slashes, no duplicate or
 * edge slashes, trimmed. Empty (or slash-only) input falls back to the
 * default folder, so clearing the setting never writes to the vault root.
 */
export function normalizeScriptsFolder(folder: string): string {
	const cleaned = folder
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
	return cleaned || DEFAULT_SCRIPTS_FOLDER;
}

/** Vault path of the generated script, e.g. `98 - Organize/Scripts/lifeline-dashboard.js`. */
export function dashboardScriptPath(folder: string): string {
	return `${normalizeScriptsFolder(folder)}/${DASHBOARD_SCRIPT_FILE}`;
}

/** dv.view() target: the script path without the `.js` extension. */
export function dashboardViewName(folder: string): string {
	return dashboardScriptPath(folder).replace(/\.js$/, '');
}

/** All CSS for the dashboard, scoped under the `.lifeline-dash` class that the
 * script adds to every section container (so the rest of the vault keeps
 * Dataview's default look). Colors use theme variables with sane fallbacks.
 * Sync writes this into the styles folder as lifeline-dashboard.css; the
 * generated script reads the file at view time instead of baking it in. */
export const DASHBOARD_CSS = `.lifeline-dash .lifeline-hero {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 2px 0 12px;
}
.lifeline-dash .lifeline-badge {
  display: inline-flex;
  padding: 3px 12px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9em;
  border: 1px solid transparent;
}
.lifeline-dash .lifeline-badge-ok {
  color: var(--color-green, #2ea043);
  border-color: var(--color-green, #2ea043);
}
.lifeline-dash .lifeline-badge-warn {
  color: var(--color-yellow, #d29922);
  border-color: var(--color-yellow, #d29922);
}
.lifeline-dash .lifeline-badge-err {
  color: var(--color-red, #da3633);
  border-color: var(--color-red, #da3633);
}
.lifeline-dash .lifeline-badge-never {
  color: var(--text-muted);
  border-color: var(--background-modifier-border);
}
.lifeline-dash .lifeline-when {
  color: var(--text-muted);
  font-size: 0.9em;
}
.lifeline-dash .lifeline-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin: 0 0 14px;
}
.lifeline-dash .lifeline-tile {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  padding: 12px 16px;
}
.lifeline-dash .lifeline-tile-clickable {
  cursor: pointer;
}
.lifeline-dash .lifeline-tile-clickable:hover {
  background: var(--background-modifier-hover);
}
.lifeline-dash .lifeline-tile-accent {
  border-color: var(--color-green, #2ea043);
}
.lifeline-dash .lifeline-tile-value {
  font-size: 1.8em;
  font-weight: 700;
  line-height: 1.2;
}
.lifeline-dash .lifeline-tile-label {
  color: var(--text-muted);
  font-size: 0.85em;
  margin-top: 2px;
}
.lifeline-dash .lifeline-tile-sub {
  color: var(--text-faint);
  font-size: 0.78em;
  margin-top: 2px;
}
.lifeline-dash .lifeline-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 6px;
}
.lifeline-dash a.lifeline-chip {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-normal);
  text-decoration: none;
  font-size: 0.9em;
}
.lifeline-dash a.lifeline-chip:hover {
  background: var(--background-modifier-hover);
  color: var(--text-accent);
}
.lifeline-dash .lifeline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
  margin: 0 0 14px;
}
.lifeline-dash .lifeline-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  padding: 12px 16px;
}
.lifeline-dash .lifeline-card-title {
  font-weight: 600;
  font-size: 0.95em;
  margin-bottom: 6px;
}
.lifeline-dash .lifeline-card-empty {
  color: var(--text-muted);
  font-size: 0.9em;
}
.lifeline-dash .lifeline-feed-row {
  padding: 4px 0;
  font-size: 0.9em;
}
.lifeline-dash .lifeline-feed-row + .lifeline-feed-row {
  border-top: 1px solid var(--background-modifier-border);
}
.lifeline-dash .lifeline-card-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.9em;
}
.lifeline-dash .lifeline-card-row + .lifeline-card-row {
  border-top: 1px solid var(--background-modifier-border);
}
.lifeline-dash .lifeline-card-meta {
  color: var(--text-muted);
  font-size: 0.82em;
  margin-top: 1px;
}
.lifeline-dash .lifeline-count-new {
  color: var(--color-green, #2ea043);
  font-weight: 600;
}
.lifeline-dash .lifeline-count-warn {
  color: var(--color-yellow, #d29922);
  font-weight: 600;
}
.lifeline-dash .lifeline-count-err {
  color: var(--color-red, #da3633);
  font-weight: 600;
}
.lifeline-dash details.lifeline-more {
  margin: 6px 0 12px;
}
.lifeline-dash details.lifeline-more > summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.9em;
  padding: 4px 0;
}
.lifeline-dash .lifeline-bar-cell {
  position: relative;
  display: inline-block;
  min-width: 90px;
  padding: 2px 8px;
  border-radius: 4px;
  overflow: hidden;
}
.lifeline-dash .lifeline-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--color-blue, #3b82f6);
  opacity: 0.25;
  border-radius: 4px;
}
.lifeline-dash .lifeline-bar-num {
  position: relative;
}
.lifeline-dash table.dataview.table-view-table,
.lifeline-dash table.lifeline-mini-table {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  overflow: hidden;
  margin: 4px 0 10px;
}
.lifeline-dash table.dataview.table-view-table thead > tr > th,
.lifeline-dash table.lifeline-mini-table thead > tr > th {
  background: var(--background-secondary);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.85em;
  text-align: left;
  border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-dash table.dataview.table-view-table tbody > tr > td,
.lifeline-dash table.lifeline-mini-table tbody > tr > td {
  border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-dash table.dataview.table-view-table tbody > tr:last-child > td,
.lifeline-dash table.lifeline-mini-table tbody > tr:last-child > td {
  border-bottom: none;
}
.lifeline-dash table.dataview.table-view-table tbody > tr:hover > td,
.lifeline-dash table.lifeline-mini-table tbody > tr:hover > td {
  background: var(--background-modifier-hover);
}
`;

/**
 * The full source of lifeline-dashboard.js. The generated code contains no
 * backticks or template placeholders, so it can be embedded in this TS
 * template literal; regexes are double-escaped. The stylesheet path is baked
 * in, the CSS itself read from that file at view time.
 */
export function renderDashboardScript(cssPath: string): string {
	return `/**
 * Lifeline dashboard view script (generated).
 *
 * Dashboard.md invokes this file once per section:
 *   dv.view("98 - Organize/Scripts/lifeline-dashboard", { section: "playlists", ... })
 * Sections: header (hero + KPI tiles + new/attention cards), playlists,
 * channels. The plugin regenerates this file on every dashboard refresh; hand edits are overwritten.
 */
const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v.array === "function" ? v.array() : []);

// Tolerate dv.view() being called without options (hand-written call).
if (input == null) input = {};

const fmtShort = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "");
  const abs = Math.abs(v);
  if (abs < 1000) return String(v);
  const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (let i = 0; i < units.length; i++) {
    const [div, suffix] = units[i];
    if (abs < div) continue;
    const scaled = v / div;
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    let s = scaled.toFixed(decimals);
    if (s.indexOf(".") >= 0) s = s.replace(/\\.?0+$/, "");
    if (Math.abs(Number(s)) < 1000) return s + suffix;
    // Rounded up to 1000 (e.g. 999500 -> "1000K"): carry into the next unit.
    if (i > 0) {
      const [nextDiv, nextSuffix] = units[i - 1];
      const next = (v / nextDiv).toFixed(2);
      const trimmed = next.indexOf(".") >= 0 ? next.replace(/\\.?0+$/, "") : next;
      return trimmed + nextSuffix;
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

const SRC = '"' + String(input.src ?? "") + '"';
const WL_PATH = String(input.wlPath ?? "");
const WL_ID = String(input.wlId ?? "");

// A stale Watch Later copy claims the same playlist_id but lives at another path.
const isDuplicateWatchLater = (page) =>
  WL_ID !== "" && String(page.playlist_id ?? "") === WL_ID && page.file.path !== WL_PATH;

const playlistPages = (all) => {
  const out = [];
  for (const page of all) {
    if (page.type !== "lifeline-playlist") continue;
    if (isDuplicateWatchLater(page)) continue;
    out.push(page);
  }
  return out;
};

const listItems = (page) => toArr(page.file?.lists ?? page.lists);

const itemDate = (item) => String(item?.date?.path ?? item?.date ?? "");

// Inline-field values can be Dataview links ([Title](url) or [[Note]]); render
// them as real anchors, everything else as plain text.
const isLinkValue = (v) => v != null && typeof v === "object" && typeof v.path === "string";
const openPath = (path) => dv.app.workspace.openLinkText(path, dv.current().file.path, false);
const internalLink = (parent, text, path, extraCls) => {
  const a = parent.createEl("a", { cls: "internal-link" + (extraCls ? " " + extraCls : ""), text: text });
  a.setAttribute("data-href", path);
  a.setAttribute("href", path);
  a.addEventListener("click", (e) => {
    e.preventDefault();
    openPath(path);
  });
  return a;
};
const renderValue = (parent, v) => {
  if (!isLinkValue(v)) return parent.createSpan({ text: String(v == null ? "" : v) });
  const label = v.display || v.path;
  if (/^https?:\\/\\//.test(v.path)) {
    const a = parent.createEl("a", { text: label });
    a.setAttribute("href", v.path);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    return a;
  }
  return internalLink(parent, label, v.path);
};

const STYLE_ID = "lifeline-dash-style";
const CSS_PATH = ${JSON.stringify(cssPath)};
// Read the stylesheet from the vault like the note views do, so hand edits
// apply on the next render. A missing file (views just enabled, folder
// moved) leaves the dashboard unstyled but fully functional.
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

dv.container.classList.add("lifeline-dash");
await ensureStyle();

function sectionHeader() {
  const current = dv.current();
  const status = input.status ?? null;
  const since = typeof input.since === "string" && input.since ? input.since : "";
  const badge =
    status === "ok" ? ["lifeline-badge-ok", "Synced"]
      : status === "warn" ? ["lifeline-badge-warn", "Synced with issues"]
        : status === "error" ? ["lifeline-badge-err", "Sync failed"]
          : ["lifeline-badge-never", "Never synced"];

  const hero = dv.container.createDiv({ cls: "lifeline-hero" });
  hero.createSpan({ cls: "lifeline-badge " + badge[0], text: badge[1] });

  // Frontmatter stores last_synced as a string; Dataview may hand it back parsed.
  const raw = current?.last_synced;
  let rel = null;
  if (raw) {
    try {
      const dt = raw?.toFormat ? raw : dv.luxon.DateTime.fromFormat(String(raw), "yyyy-LL-dd HH:mm:ss");
      if (dt && dt.isValid) rel = dt.toRelative();
    } catch (e) {
      rel = null;
    }
  }
  if (rel) hero.createSpan({ cls: "lifeline-when", text: "Last sync " + rel });
  else if (raw) hero.createSpan({ cls: "lifeline-when", text: "Last sync " + String(raw) });

  const all = toArr(dv.pages(SRC).array());
  const pages = playlistPages(all);
  const channelsPage = all.find((p) => p.type === "lifeline-channels");
  const channelsPath = channelsPage ? String(channelsPage.file.path) : "";

  // Stat tiles (channels from frontmatter; the rest counted live from the
  // deduplicated playlist notes so numbers always match the cards below) and
  // the delta: videos whose date:: is on or after the baked last-sync date.
  let videos = 0;
  let hidden = 0;
  const fresh = [];
  for (const page of pages) {
    const items = listItems(page);
    videos += items.length;
    hidden += Number(page.unavailable_count ?? 0) + Number(page.removed_count ?? 0);
    if (!since) continue;
    for (const item of items) {
      const ds = itemDate(item);
      if (ds >= since) fresh.push({ item: item, date: ds, playlist: page.file.name, path: page.file.path });
    }
  }
  fresh.sort((a, b) => b.date.localeCompare(a.date));

  const dashboardPath = String(current?.file?.path ?? "");
  const tiles = dv.container.createDiv({ cls: "lifeline-tiles" });
  const tile = (value, label, sub, opts) => {
    const o = opts || {};
    const cls = "lifeline-tile" + (o.accent ? " lifeline-tile-accent" : "") + (o.click ? " lifeline-tile-clickable" : "");
    const box = tiles.createDiv({ cls: cls });
    const valueBox = box.createDiv({ cls: "lifeline-tile-value" });
    valueBox.appendChild(numCell(value));
    box.createDiv({ cls: "lifeline-tile-label", text: label });
    if (sub) box.createDiv({ cls: "lifeline-tile-sub " + (sub.cls || ""), text: sub.text });
    if (o.click) box.addEventListener("click", o.click);
    return box;
  };
  tile(Number(current?.channel_count ?? 0), "Channels", null, { click: channelsPath ? () => openPath(channelsPath) : null });
  tile(pages.length, "Playlists", null, { click: dashboardPath ? () => openPath(dashboardPath + "#Playlists") : null });
  tile(videos, "Videos", hidden > 0 ? { text: "+" + hidden + " hidden", cls: "lifeline-count-warn" } : null,
    { click: dashboardPath ? () => openPath(dashboardPath + "#Playlists") : null });
  if (since) {
    tile(fresh.length, "New since sync", { text: "since " + since, cls: "lifeline-count-new" }, { accent: true });
  }

  // Quick links: only notes NOT already reachable in this note. Every
  // playlist is linked in the cards/tables below, and this note links to
  // itself, so in practice the row carries Channels (plus any future
  // non-playlist note in the output folder).
  if (input.quickLinks) {
    const self = dashboardPath;
    const links = all
      .filter((p) => {
        const path = String(p.file?.path ?? "");
        if (!path || path === self) return false;
        return p.type !== "lifeline-playlist";
      })
      .map((p) => [String(p.file.name), String(p.file.path)])
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (links.length > 0) {
      const chips = dv.container.createDiv({ cls: "lifeline-chips" });
      for (const [label, path] of links) internalLink(chips, label, path, "lifeline-chip");
    }
  }

  // Cards grid: the delta and the attention queue, side by side when both fit.
  if ((input.recent && since) || input.attention) {
    const grid = dv.container.createDiv({ cls: "lifeline-grid" });
    if (input.recent && since) {
      const card = grid.createDiv({ cls: "lifeline-card" });
      card.createDiv({ cls: "lifeline-card-title", text: "New since last sync" });
      const top = fresh.slice(0, 8);
      if (top.length === 0) {
        card.createDiv({ cls: "lifeline-card-empty", text: "No new videos since " + since + "." });
      }
      for (const f of top) {
        const row = card.createDiv({ cls: "lifeline-feed-row" });
        renderValue(row, f.item.title);
        const meta = row.createDiv({ cls: "lifeline-card-meta" });
        meta.createSpan({ text: f.date + " · " + String(f.item.channel ?? "") + " · " });
        internalLink(meta, f.playlist, f.path);
      }
      if (fresh.length > top.length) {
        card.createDiv({ cls: "lifeline-card-meta", text: "+" + (fresh.length - top.length) + " more" });
      }
    }
    if (input.attention) {
      const card = grid.createDiv({ cls: "lifeline-card" });
      card.createDiv({ cls: "lifeline-card-title", text: "Needs attention" });
      const rows = [];
      for (const page of pages) {
        const un = Number(page.unavailable_count ?? 0);
        const rm = Number(page.removed_count ?? 0);
        if (un || rm) rows.push({ name: page.file.name, path: page.file.path, un: un, rm: rm });
      }
      rows.sort((a, b) => (b.un + b.rm) - (a.un + a.rm) || a.name.localeCompare(b.name));
      if (rows.length === 0) {
        card.createDiv({ cls: "lifeline-card-empty", text: "All clear: no hidden videos." });
      }
      for (const r of rows.slice(0, 6)) {
        const row = card.createDiv({ cls: "lifeline-card-row" });
        internalLink(row, r.name, r.path);
        const right = row.createDiv();
        if (r.un) right.createSpan({ cls: "lifeline-count-warn", text: r.un + " unavailable" });
        if (r.un && r.rm) right.createSpan({ text: " " });
        if (r.rm) right.createSpan({ cls: "lifeline-count-err", text: r.rm + " removed" });
      }
      if (rows.length > 6) {
        card.createDiv({ cls: "lifeline-card-meta", text: "+" + (rows.length - 6) + " more" });
      }
    }
  }
}

function sectionPlaylists() {
  const rows = [];
  for (const page of playlistPages(toArr(dv.pages(SRC).array()))) {
    const items = listItems(page);
    let newest = "";
    for (const item of items) {
      const ds = itemDate(item);
      if (ds > newest) newest = ds;
    }
    rows.push({ name: page.file.name, path: page.file.path, link: page.file.link, count: items.length, newest: newest });
  }
  if (rows.length === 0) {
    dv.paragraph("No playlists tracked yet.");
    return;
  }
  const tableRows = (list) => list.map((r) => [r.link, numCell(r.count), r.newest || "-"]);

  // Small collection: one full table (Watch Later pinned, then alphabetical).
  if (rows.length <= 5) {
    rows.sort((a, b) => (a.path === WL_PATH ? -1 : b.path === WL_PATH ? 1 : a.name.localeCompare(b.name)));
    dv.table(["Playlist", "Videos", "Newest"], tableRows(rows));
    return;
  }

  // Summary first: the most recently active playlists, then the full table
  // inside a collapsed block (Dataview cannot render a table into a nested
  // element, so the collapsed copy is built by hand with the same classes).
  const top = rows.slice().sort((a, b) => b.newest.localeCompare(a.newest)).slice(0, 5);
  dv.table(["Playlist", "Videos", "Newest"], tableRows(top));
  rows.sort((a, b) => (a.path === WL_PATH ? -1 : b.path === WL_PATH ? 1 : a.name.localeCompare(b.name)));
  const details = dv.container.createEl("details", { cls: "lifeline-more" });
  details.createEl("summary", { text: "All " + rows.length + " playlists" });
  const table = details.createEl("table", { cls: "lifeline-mini-table" });
  const htr = table.createEl("thead").createEl("tr");
  for (const h of ["Playlist", "Videos", "Newest"]) htr.createEl("th", { text: h });
  const tbody = table.createEl("tbody");
  for (const r of rows) {
    const tr = tbody.createEl("tr");
    internalLink(tr.createEl("td"), r.name, r.path);
    tr.createEl("td").appendChild(numCell(r.count));
    tr.createEl("td", { text: r.newest || "-" });
  }
}

function sectionChannels() {
  const rows = [];
  for (const page of dv.pages(SRC).array()) {
    if (page.type !== "lifeline-channels") continue;
    for (const item of toArr(page.file?.lists ?? page.lists)) {
      if (typeof item.subscribers === "number") rows.push(item);
    }
  }
  rows.sort((a, b) => b.subscribers - a.subscribers);
  const top = rows.slice(0, 10);
  if (top.length === 0) {
    dv.paragraph("No subscriber counts found. Turn on Subscribers in Settings → Lifeline → Channels.md fields.");
    return;
  }
  // Subscribers render as a bar behind the number so the table reads as a chart.
  const max = top[0].subscribers || 1;
  dv.table(["Channel", "Subscribers", "Videos"], top.map((l) => {
    const cell = document.createElement("div");
    cell.className = "lifeline-bar-cell";
    const bar = document.createElement("div");
    bar.className = "lifeline-bar";
    bar.style.width = Math.max(4, Math.round((l.subscribers / max) * 100)) + "%";
    cell.appendChild(bar);
    const num = numCell(l.subscribers);
    num.className = "lifeline-bar-num";
    cell.appendChild(num);
    return [l.channel, cell, l.videos == null ? "-" : numCell(l.videos)];
  }));
}

const section = String(input.section ?? "header");
if (section === "playlists") sectionPlaylists();
else if (section === "channels") sectionChannels();
else sectionHeader();
`;
}
