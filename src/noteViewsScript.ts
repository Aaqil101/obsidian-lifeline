/**
 * Note-views script (lifeline-noteviews.js): the optional DataviewJS views
 * that sit above the inline-field entries in Channels.md, every playlist
 * note, and Watch Later.md. The note calls it once:
 *
 *   dv.view("<scriptsFolder>/lifeline-noteviews", { section: "channels", layout: "mixed", fields: {...} })
 *   dv.view("<scriptsFolder>/lifeline-noteviews", { section: "playlist", layout: "mixed" })
 *
 * Sections: channels (the column set follows the baked ChannelsFieldSettings
 * toggles) and playlist (fixed: Video, Channel, Date added). Layouts: table,
 * chips, cards, and mixed (chips for channels, cards for playlists). Every
 * layout reads the calling note's own list entries via dv.current().file.lists,
 * so the view always mirrors the bullets below it and needs no vault-wide query.
 *
 * Sync writes the script whenever the "Views in notes" setting is on
 * (sync.ts: writeNoteViewsScript) and trashes a copy left in a previous
 * scripts folder (shared dashboardScriptsFolderWritten tracking). Written
 * regardless of Dataview state: a degraded note simply omits the block, and
 * the script is ready when Dataview comes back.
 *
 * The script makes no network request of its own. It reads any image the sync
 * already appended to the bullet, either a remote URL or a local vault file.
 *
 * Pure: this module only builds strings; sync.ts owns the vault writes.
 */
import { normalizeScriptsFolder } from './dashboardScript';

/** Generated file name inside the scripts folder. */
export const NOTE_VIEWS_SCRIPT_FILE = 'lifeline-noteviews.js';

/** Vault path of the generated script, e.g. `98 - Organize/Scripts/lifeline-noteviews.js`. */
export function noteViewsScriptPath(folder: string): string {
	return `${normalizeScriptsFolder(folder)}/${NOTE_VIEWS_SCRIPT_FILE}`;
}

/** dv.view() target: the script path without the `.js` extension. */
export function noteViewsViewName(folder: string): string {
	return noteViewsScriptPath(folder).replace(/\.js$/, '');
}

/** How many entries a chips or cards view paints before it needs a click. */
const PAGE_SIZE = 60;

/**
 * View chrome, scoped under the `.lifeline-views` class that the script adds
 * to its container. Table rules preserve Dataview's default table and just
 * frame it; chips and cards are drawn from scratch with theme variables only,
 * so every accent follows the user's theme.
 */
const NOTE_VIEWS_CSS = `.lifeline-views table.dataview.table-view-table {
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
  margin: 4px 0 10px;
}
.lifeline-views .lv-chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lifeline-views .lv-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  background: var(--background-secondary);
}
.lifeline-views .lv-chip:hover {
  background: var(--background-modifier-hover);
}
.lifeline-views .lv-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.lifeline-views .lv-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--background-modifier-border);
  border-left: 3px solid var(--text-accent, var(--interactive-accent));
  border-radius: var(--radius-m, 8px);
  background: var(--background-secondary);
  overflow: hidden;
}
.lifeline-views .lv-card:hover {
  background: var(--background-modifier-hover);
}
.lifeline-views .lv-card-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
}
.lifeline-views .lv-thumb {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
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
  margin-top: 8px;
  padding: 6px;
  cursor: pointer;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  background: var(--background-secondary);
  color: var(--text-muted);
}
.lifeline-views .lv-more:hover {
  background: var(--background-modifier-hover);
  color: var(--text);
}
`;

/**
 * The full source of lifeline-noteviews.js. The generated code contains no
 * backticks and no `${...}` placeholders, so it can be embedded in this TS
 * template literal; the CSS is injected via JSON.stringify to keep quoting
 * mechanical. String building inside the script uses concatenation rather
 * than template literals for the same reason.
 */
export function renderNoteViewsScript(): string {
	return `/**
 * Lifeline note-views script (generated).
 *
 * Notes invoke this file once:
 *   dv.view("98 - Organize/Scripts/lifeline-noteviews", { section: "channels", layout: "mixed", fields: {...} })
 *   dv.view("98 - Organize/Scripts/lifeline-noteviews", { section: "playlist", layout: "mixed" })
 * Sections: channels (Channels.md), playlist (Playlists/*.md and Watch Later.md).
 * Layouts: table, chips, cards, mixed (chips for channels, cards for playlists).
 * Every layout reads the calling note's own list entries (dv.current().file.lists),
 * so the view mirrors the inline-field entries below it. Regenerated on every
 * sync while "Views in notes" is on; hand edits are overwritten.
 *
 * This script makes no network request. Images come from the bullet itself,
 * which the sync either left as a remote URL or replaced with a local embed.
 */
if (input == null) input = {};

const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v.array === "function" ? v.array() : []);
const dash = (v) => (v == null || v === "" ? "-" : v);

const STYLE_ID = "lifeline-views-style";
const STYLE = ${JSON.stringify(NOTE_VIEWS_CSS)};
const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLE;
  document.head.appendChild(el);
};

dv.container.classList.add("lifeline-views");
ensureStyle();

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

// "[Label](https://...)" into {label, href}. Falls back to the raw text, so a
// value with no link still renders as something readable.
const mdLink = (v) => {
  const s = v == null ? "" : String(v);
  const m = /^\\s*\\[([^\\]]*)\\]\\(([^)]+)\\)/.exec(s);
  return m ? { label: m[1], href: m[2] } : { label: s, href: "" };
};

const linkNode = (label, href, cls) => {
  const a = document.createElement("a");
  if (cls) a.className = cls;
  a.textContent = label;
  if (href) a.href = href;
  return a;
};

// The trailing image the sync appended to the bullet, if the user enabled one:
// "![](https://...)" when the mode is link, "![[file.jpg]]" when it is download.
// Read off the bullet so this script never has to know which mode is set.
const mdImage = (item) => {
  const s = item && item.text != null ? String(item.text) : "";
  const local = /!\\[\\[([^\\]|]+)(?:\\|[^\\]]*)?\\]\\]/.exec(s);
  if (local) return { local: true, target: local[1].trim() };
  const remote = /!\\[\\]\\(([^)]+)\\)/.exec(s);
  if (remote) return { local: false, target: remote[1] };
  return null;
};

// Resolve that image to something an <img> can load. A remote URL is used as
// is; a local embed is resolved the same way the note itself resolves it, from
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

// Thumbnail or letter placeholder. lazy keeps a 900-entry note from decoding
// 900 images on open; the error fallback covers a file removed after sync.
const thumb = (item, label) => {
  const box = el("div", "lv-thumb");
  const src = imageSrc(mdImage(item));
  if (!src) {
    box.textContent = initialOf(label);
    return box;
  }
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
// 900-video Watch Later builds 60 nodes on open instead of 900.
const mount = (host, items, renderOne) => {
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
// Table layout (phase 1, unchanged behavior)
// ---------------------------------------------------------------------------

function sectionChannels(rows) {
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

  dv.table(
    headers,
    rows.map((item) => getters.map((get) => get(item)))
  );
}

function sectionPlaylist(rows) {
  dv.table(
    ["Video", "Channel", "Date added"],
    rows.map((item) => [dash(item.title), dash(item.channel), dash(item.date)])
  );
}

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
  row.appendChild(thumb(item, link.label));
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

const card = (item, section) => {
  const link = section === "channels" ? mdLink(item.channel) : mdLink(item.title);
  const node = el("article", "lv-card");
  node.appendChild(thumb(item, link.label));
  const body = el("div", "lv-card-body");
  body.appendChild(linkNode(link.label, link.href, "lv-title"));
  if (section === "channels") channelCard(body, item);
  else playlistCard(body, item);
  node.appendChild(body);
  return node;
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

// "mixed" is per section: chips suit the flat alphabetical channel list, cards
// suit ordered video lists.
const resolveLayout = (section, layout) =>
  layout === "mixed" ? (section === "channels" ? "chips" : "cards") : layout;

const section = String(input.section == null ? "playlist" : input.section);
// Honor only the four known layouts. An unrecognized value (a typo, or an
// option added after this copy of the script was generated) renders the table
// rather than a host div carrying a class that no CSS matches.
const KNOWN_LAYOUTS = ["table", "mixed", "chips", "cards"];
const requested = String(input.layout == null ? "table" : input.layout);
const layout = KNOWN_LAYOUTS.indexOf(requested) >= 0 ? requested : "table";
// Channels.md bullets carry a channel link and never a title; playlist bullets
// carry a title (and a channel). The title check keeps playlist entries out of
// a channels view should a note ever hold both shapes.
const rows = listEntries().filter((item) =>
  section === "channels" ? item.channel != null && item.title == null : item.title != null
);
const resolved = resolveLayout(section, layout);

if (rows.length === 0) {
  dv.paragraph(section === "channels" ? "No channels synced yet." : "No videos yet.");
} else if (resolved === "table") {
  if (section === "channels") sectionChannels(rows);
  else sectionPlaylist(rows);
} else {
  const host = el("div", resolved === "cards" ? "lv-cards" : "lv-chips");
  dv.container.appendChild(host);
  mount(host, rows, (item) => (resolved === "cards" ? card(item, section) : chipRow(item, section)));
}
`;
}
