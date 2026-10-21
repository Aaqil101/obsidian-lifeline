/**
 * Note-tables view script (lifeline-tables.js): the optional DataviewJS
 * tables that sit above the inline-field entries in Channels.md, every
 * playlist note, and Watch Later.md. The note calls it once:
 *
 *   dv.view("<scriptsFolder>/lifeline-tables", { section: "channels", fields: {...} })
 *   dv.view("<scriptsFolder>/lifeline-tables", { section: "playlist" })
 *
 * Sections: channels (column set follows the baked ChannelsFieldSettings
 * toggles) and playlist (fixed: Video, Channel, Date added). Both read the
 * calling note's own list entries via dv.current().file.lists, so the table
 * always mirrors the bullets below it and needs no vault-wide query.
 *
 * Sync writes the script whenever the "Dataview tables in notes" setting is
 * on (sync.ts: writeTablesScript) and trashes a copy left in a previous
 * scripts folder (shared dashboardScriptsFolderWritten tracking). Written
 * regardless of Dataview state: a degraded note simply omits the block, and
 * the script is ready when Dataview comes back.
 *
 * Pure: this module only builds strings; sync.ts owns the vault writes.
 */
import { normalizeScriptsFolder } from './dashboardScript';

/** Generated file name inside the scripts folder. */
export const TABLES_SCRIPT_FILE = 'lifeline-tables.js';

/** Vault path of the generated script, e.g. `98 - Organize/Scripts/lifeline-tables.js`. */
export function tablesScriptPath(folder: string): string {
	return `${normalizeScriptsFolder(folder)}/${TABLES_SCRIPT_FILE}`;
}

/** dv.view() target: the script path without the `.js` extension. */
export function tablesViewName(folder: string): string {
	return tablesScriptPath(folder).replace(/\.js$/, '');
}

/** Table chrome, scoped under the `.lifeline-tables` class that the script
 *  adds to its container (Dataview's default table look otherwise). */
const TABLES_CSS = `.lifeline-tables table.dataview.table-view-table {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  overflow: hidden;
  margin: 4px 0 8px;
}
.lifeline-tables table.dataview.table-view-table thead > tr > th {
  background: var(--background-secondary);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.85em;
  text-align: left;
  border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-tables table.dataview.table-view-table tbody > tr > td {
  border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-tables table.dataview.table-view-table tbody > tr:last-child > td {
  border-bottom: none;
}
.lifeline-tables table.dataview.table-view-table tbody > tr:hover > td {
  background: var(--background-modifier-hover);
}
`;

/**
 * The full source of lifeline-tables.js. The generated code contains no
 * backticks or template placeholders, so it can be embedded in this TS
 * template literal; the CSS is injected via JSON.stringify to keep quoting
 * mechanical.
 */
export function renderTablesScript(): string {
	return `/**
 * Lifeline note-tables view script (generated).
 *
 * Notes invoke this file once:
 *   dv.view("98 - Organize/Scripts/lifeline-tables", { section: "channels", fields: {...} })
 *   dv.view("98 - Organize/Scripts/lifeline-tables", { section: "playlist" })
 * Sections: channels (Channels.md), playlist (Playlists/*.md and Watch Later.md).
 * Both read the calling note's own list entries (dv.current().file.lists), so the
 * table mirrors the inline-field entries below it. Regenerated on every sync while
 * "Dataview tables in notes" is on; hand edits are overwritten.
 */
if (input == null) input = {};

const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v.array === "function" ? v.array() : []);

const STYLE_ID = "lifeline-tables-style";
const STYLE = ${JSON.stringify(TABLES_CSS)};
const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLE;
  document.head.appendChild(el);
};

dv.container.classList.add("lifeline-tables");
ensureStyle();

// List entries of the calling note, in document order: channels are already
// alphabetical and playlist entries already in playlist position order.
const listEntries = () => {
  const current = dv.current();
  return toArr(current?.file?.lists ?? current?.lists);
};

const dash = (v) => (v == null || v === "" ? "-" : v);

// Bare ISO dates (subscribed_on:: 2026-10-20) come back from Dataview as Luxon
// DateTimes, which dv.table would render long ("October 20, 2026") and wrap to
// two lines. Force the compact yyyy-MM-dd form so date columns stay one line.
const fmtDate = (v) => {
  if (v == null || v === "") return "-";
  if (typeof v.toFormat === "function") return v.toFormat("yyyy-MM-dd");
  return String(v);
};

// A 24-char channel ID (UC...) is the widest column and the least scannable;
// show a short prefix and keep the full value in the native hover tooltip
// (dv.table renders an element cell as-is).
const idCell = (v) => {
  const full = String(v ?? "");
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

// Counts render compact when present, "-" when the field is off or missing.
const numOrDash = (v) => (typeof v === "number" ? numCell(v) : dash(v));

function sectionChannels() {
  const fields = input.fields && typeof input.fields === "object" ? input.fields : {};
  // Every column except Channel is gated by the same toggle as the bullets.
  const want = (key) => fields[key] !== false;
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

  const rows = listEntries().filter((item) => item.channel != null);
  if (rows.length === 0) {
    dv.paragraph("No channels synced yet.");
    return;
  }
  dv.table(
    headers,
    rows.map((item) => getters.map((get) => get(item)))
  );
}

function sectionPlaylist() {
  const rows = listEntries().filter((item) => item.title != null);
  if (rows.length === 0) {
    dv.paragraph("No videos yet.");
    return;
  }
  dv.table(
    ["Video", "Channel", "Date added"],
    rows.map((item) => [dash(item.title), dash(item.channel), dash(item.date)])
  );
}

const section = String(input.section ?? "playlist");
if (section === "channels") sectionChannels();
else sectionPlaylist();
`;
}
