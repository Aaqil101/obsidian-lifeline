/**
 * Dashboard view script (lifeline-dashboard.js): every DataviewJS feature of
 * Dashboard.md lives in this one external file, written into a user-editable
 * scripts folder. The note calls it once per section:
 *
 *   dv.view("<scriptsFolder>/lifeline-dashboard", { section: "playlists", ... })
 *
 * Sections: header (status hero, KPI tiles, and the "New since last sync" +
 * "Needs attention" cards), playlists (top-5 summary plus the full table in a
 * collapsed block, both drawn in the note views' Ledger table style), and
 * channels (top ten by subscribers in the note views' Cover rows table style,
 * avatar and banner included). All data is queried live from dv.pages() inside
 * the output folder (src option); status, section toggles, and the sync date
 * (since) are baked in per call.
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
.lifeline-dash .lifeline-scroll {
  overflow-x: auto;
}
.lifeline-dash .lifeline-table {
  width: 100%;
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  background: var(--background-secondary);
  font-size: 0.88em;
  margin: 4px 0 10px;
}
.lifeline-dash .lifeline-table th {
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
.lifeline-dash .lifeline-table td {
  padding: 9px 12px;
  vertical-align: middle;
}
.lifeline-dash .lifeline-table th.lifeline-num,
.lifeline-dash .lifeline-table td.lifeline-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lifeline-dash .lifeline-table tbody tr + tr td {
  border-top: 1px solid var(--background-modifier-border);
}
.lifeline-dash .lifeline-table tbody tr:hover td {
  background: var(--background-modifier-hover);
}
.lifeline-dash .lifeline-title {
  color: var(--text-normal);
  font-weight: 600;
  text-decoration: none;
}
.lifeline-dash .lifeline-title:hover {
  color: var(--link-color, var(--text-accent));
  text-decoration: underline;
}
.lifeline-dash .lifeline-date {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lifeline-dash .lifeline-who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.lifeline-dash .lifeline-art {
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
.lifeline-dash .lifeline-art > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Soft focus on the banner so the sharp avatar badge sits in front of it. */
  filter: blur(2px) brightness(0.7) saturate(1.05);
  transform: scale(1.06);
  transition: transform 0.35s ease, filter 0.35s ease;
}
.lifeline-dash .lifeline-table tbody tr:hover .lifeline-art > img {
  filter: blur(1.2px) brightness(0.74) saturate(1.05);
  transform: scale(1.12);
}
.lifeline-dash .lifeline-av {
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
.lifeline-dash .lifeline-av img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.lifeline-dash .lifeline-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.lifeline-dash .lifeline-name a {
  color: var(--text-normal);
  font-weight: 650;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lifeline-dash .lifeline-name a:hover {
  color: var(--link-color, var(--text-accent));
  text-decoration: underline;
}
.lifeline-dash .lifeline-handle {
  color: var(--text-muted);
  font-size: 0.78em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
 * Sections: header (hero + KPI tiles + new/attention cards), playlists
 * (Ledger table style), channels (Cover rows table style). The plugin
 * regenerates this file on every dashboard refresh; hand edits are overwritten.
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

// The playlist date field arrives three ways: a wikilink (bullet dates were
// written unconditionally as [[YYYY-MM-DD]] once), a bare ISO string (the
// journal rule prints plain), and the Luxon DateTime Dataview parses out of
// that bare string, whose String() is the long offset form
// (2026-10-22T00:00:00.000+05:30). Pull the yyyy-MM-dd out of whatever it
// is: both the >= since check and the Newest column want the day, and
// lexicographic order works once the value has that shape.
const itemDate = (item) => {
  const raw = String(item?.date?.path ?? item?.date ?? "");
  const found = /(\\d{4}-\\d{2}-\\d{2})/.exec(raw);
  return found ? found[1] : raw;
};

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

// Image fields sit on the bullet as inline fields (avatar/avatar_url,
// banner/banner_url), never as embeds: the bare field is a vault path, the
// *_url field a remote link. Dataview hands either back as a Link or a plain
// string, so both shapes are read. The local field wins, so download mode
// stays offline.
const imageField = (v) =>
  v == null ? "" : isLinkValue(v) ? String(v.path).trim() : String(v).trim();
const picture = (item, key) => {
  const local = imageField(item?.[key]);
  if (local) return { local: true, target: local };
  const remote = imageField(item?.[key + "_url"]);
  if (remote) return { local: false, target: remote };
  return null;
};
// Resolve that image for an <img> src. A local file is resolved from
// Channels.md's own path (where those bullets live), the way the note views
// resolve their joined channel faces; no folder setting has to be baked in.
const imageSrc = (img, fromPath) => {
  if (!img) return null;
  if (!img.local) return img.target;
  try {
    const file = app.metadataCache.getFirstLinkpathDest(img.target, fromPath);
    return file ? app.vault.getResourcePath(file) : null;
  } catch (err) {
    return null;
  }
};

// A channel value is a markdown link inside the inline field; Dataview may
// hand it back parsed, so both shapes resolve to {label, href}.
const linkParts = (v) => {
  if (isLinkValue(v)) return { label: String(v.display || v.path), href: String(v.path) };
  const s = v == null ? "" : String(v);
  const found = /^\\s*\\[(.*)\\]\\(([^)]+)\\)/.exec(s);
  return found ? { label: found[1], href: found[2] } : { label: s, href: "" };
};
const linkInto = (parent, label, href) => {
  if (!href) return parent.createSpan({ text: label });
  if (/^https?:\\/\\//.test(href)) {
    const a = parent.createEl("a", { text: label });
    a.setAttribute("href", href);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    return a;
  }
  return internalLink(parent, label, href);
};
const initialOf = (label) => {
  const s = label == null ? "" : String(label).trim();
  return s ? s.charAt(0).toUpperCase() : "?";
};

// Both list sections borrow a note-view table design: Ledger for playlists,
// Cover rows for channels. Building the DOM here (instead of dv.table) is what
// lets the stylesheet own the look; the head classes are the layout's own.
const tableBody = (host, cols) => {
  const wrap = host.createDiv({ cls: "lifeline-scroll" });
  const table = wrap.createEl("table", { cls: "lifeline-table" });
  const head = table.createEl("thead").createEl("tr");
  for (const col of cols) head.createEl("th", { cls: col[1], text: col[0] });
  return table.createEl("tbody");
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
    rows.push({ name: page.file.name, path: page.file.path, count: items.length, newest: newest });
  }
  if (rows.length === 0) {
    dv.paragraph("No playlists tracked yet.");
    return;
  }

  // Ledger table style: the playlist title in the first column, then the
  // counts and the newest date at the right edge, one rounded container.
  const cols = [["Playlist", ""], ["Videos", "lifeline-num"], ["Newest", "lifeline-num"]];
  const draw = (host, list) => {
    const body = tableBody(host, cols);
    for (const r of list) {
      const tr = body.createEl("tr");
      internalLink(tr.createEl("td"), r.name, r.path, "lifeline-title");
      tr.createEl("td", { cls: "lifeline-num" }).appendChild(numCell(r.count));
      tr.createEl("td", { cls: "lifeline-num" }).createSpan({ cls: "lifeline-date", text: r.newest || "-" });
    }
  };

  // Small collection: one full table (Watch Later pinned, then alphabetical).
  if (rows.length <= 5) {
    rows.sort((a, b) => (a.path === WL_PATH ? -1 : b.path === WL_PATH ? 1 : a.name.localeCompare(b.name)));
    draw(dv.container, rows);
    return;
  }

  // Summary first: the most recently active playlists, then the full table
  // inside a collapsed block.
  const top = rows.slice().sort((a, b) => b.newest.localeCompare(a.newest)).slice(0, 5);
  draw(dv.container, top);
  rows.sort((a, b) => (a.path === WL_PATH ? -1 : b.path === WL_PATH ? 1 : a.name.localeCompare(b.name)));
  const details = dv.container.createEl("details", { cls: "lifeline-more" });
  details.createEl("summary", { text: "All " + rows.length + " playlists" });
  draw(details, rows);
}

function sectionChannels() {
  let channelsPath = "";
  const rows = [];
  for (const page of dv.pages(SRC).array()) {
    if (page.type !== "lifeline-channels") continue;
    channelsPath = String(page.file?.path ?? "");
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

  // Cover rows table style: the banner as a soft crop with the avatar over it,
  // the name (and handle) stacked beside it, and the counts right-aligned.
  const body = tableBody(dv.container, [
    ["Channel", ""],
    ["Subs", "lifeline-num"],
    ["Videos", "lifeline-num"],
  ]);
  for (const item of top) {
    const link = linkParts(item.channel);
    const tr = body.createEl("tr");
    const who = tr.createEl("td").createDiv({ cls: "lifeline-who" });
    const art = who.createDiv({ cls: "lifeline-art" });
    const banner = imageSrc(picture(item, "banner"), channelsPath);
    if (banner) {
      const img = art.createEl("img");
      img.src = banner;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
    }
    const face = art.createDiv({ cls: "lifeline-av" });
    const avatar = imageSrc(picture(item, "avatar"), channelsPath);
    if (avatar) {
      const img = face.createEl("img");
      img.src = avatar;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        img.remove();
        face.textContent = initialOf(link.label);
      });
    } else {
      face.textContent = initialOf(link.label);
    }
    const name = who.createDiv({ cls: "lifeline-name" });
    linkInto(name, link.label, link.href);
    if (item.handle) name.createDiv({ cls: "lifeline-handle", text: String(item.handle) });
    tr.createEl("td", { cls: "lifeline-num" }).appendChild(numCell(item.subscribers));
    const videos = tr.createEl("td", { cls: "lifeline-num" });
    if (item.videos == null) videos.createSpan({ cls: "lifeline-date", text: "-" });
    else videos.appendChild(numCell(item.videos));
  }
}

const section = String(input.section ?? "header");
if (section === "playlists") sectionPlaylists();
else if (section === "channels") sectionChannels();
else sectionHeader();
`;
}
