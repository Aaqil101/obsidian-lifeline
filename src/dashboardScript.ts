/**
 * Dashboard view script (lifeline-dashboard.js): every DataviewJS feature of
 * Dashboard.md lives in this one external file, written into a user-editable
 * scripts folder. The note calls it once per section:
 *
 *   dv.view("<scriptsFolder>/lifeline-dashboard", { section: "playlists", ... })
 *
 * Sections: header (a banner-mosaic hero with the status badge, the sync line,
 * KPI chips, and the "New since last sync" + "Needs attention" panels), and the
 * playlists and channels panels, each with a pill Table/Cards toggle: cards
 * draw playlist covers or channel cards, tables draw every row transparently
 * inside the panel. All data is queried live from dv.pages() inside the output
 * folder (src option); status, section toggles, and the sync date (since) are
 * baked in per call.
 *
 * The plugin regenerates the file on every dashboard refresh, so hand edits
 * are overwritten (an explicit user choice). Sync writes it alongside every
 * Dashboard.md write (sync.ts: writeDashboardScript) and trashes a copy left
 * in a previous scripts folder (dashboardScriptsFolderWritten tracking).
 *
 * Pure: this module only builds strings; sync.ts owns the vault writes.
 */

import { DEFAULT_DASHBOARD_LIMITS, type DashboardLimits } from './types';

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

/** Minimum allowed limit (inclusive). */
export const MIN_DASHBOARD_LIMIT = 1;

/** Maximum allowed limit (inclusive). */
export const MAX_DASHBOARD_LIMIT = 100;

/** Normalize a stored or typed limit to a whole number inside [MIN_DASHBOARD_LIMIT, MAX_DASHBOARD_LIMIT]; anything unusable falls back to the feed default. */
export function normalizeDashboardLimit(value: unknown): number {
	const raw = typeof value === 'string' ? value.trim() : value;
	if (raw == null || raw === '') return DEFAULT_DASHBOARD_LIMITS.feed;
	const n = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(n)) return DEFAULT_DASHBOARD_LIMITS.feed;
	return Math.min(MAX_DASHBOARD_LIMIT, Math.max(MIN_DASHBOARD_LIMIT, Math.floor(n)));
}

/** All CSS for the dashboard, scoped under the `.lifeline-dash` class that the
 * script adds to every section container (so the rest of the vault keeps
 * Dataview's default look). Colors use theme variables with sane fallbacks.
 * Sync writes this into the styles folder as lifeline-dashboard.css; the
 * generated script reads the file at view time instead of baking it in. */
export const DASHBOARD_CSS = `/* Glass cockpit: a banner mosaic hero, KPI chips, floating blurred panels, a
   pulsing attention stack, and transparent tables inside the panels. Scoped to
   .lifeline-dash, the class every section container carries, so the rest of
   the vault keeps Dataview's default look. Theme variables only, so Minimal
   drives light and dark; the hero is the one dark surface, so its own text is
   white. The three view calls are separate containers, so the rhythm between
   them is the container margin below rather than a shared gap. */
.lifeline-dash,
.lifeline-dash *,
.lifeline-dash *::before,
.lifeline-dash *::after {
  box-sizing: border-box;
}
.lifeline-dash {
  margin: 0 0 12px;
}
.lifeline-dash a.internal-link {
  text-decoration: none;
  cursor: pointer;
}
.lifeline-dash a.internal-link:hover {
  text-decoration: underline;
}
/* Images inside links never take the click: the anchor itself handles it, so
   the channel page opens instead of the raw image file. */
.lifeline-dash a img {
  pointer-events: none;
}
.lifeline-dash .lifeline-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lifeline-dash .lifeline-warn {
  color: var(--color-yellow, #d29922);
}

/* Status badge: ok, warn, error, never. */
.lifeline-dash .lifeline-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
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

/* Header stack: hero over the two panels. */
.lifeline-dash .lifeline-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Hero: up to four channel banners behind a heavy veil. */
.lifeline-dash .lifeline-hero {
  position: relative;
  min-height: 200px;
  display: flex;
  align-items: flex-end;
  border: 1px solid var(--background-modifier-border);
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--background-secondary), var(--background-modifier-border));
}
.lifeline-dash .lifeline-mosaic {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 1fr;
  gap: 2px;
}
.lifeline-dash .lifeline-mosaic img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.9) brightness(0.72);
}
.lifeline-dash .lifeline-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.72) 45%, rgba(0, 0, 0, 0.38) 100%);
}
.lifeline-dash .lifeline-hero-body {
  position: relative;
  z-index: 2;
  width: 100%;
  padding: 18px 20px;
  color: #ffffff;
}
.lifeline-dash .lifeline-hero-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.lifeline-dash .lifeline-hero-title {
  margin: 0;
  font-size: 1.5em;
  font-weight: 700;
  line-height: 1.15;
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
}
.lifeline-dash .lifeline-hero-sub {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.84em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
/* Bright banners would swallow the badge outline, so it gets a dark backing
   on the hero and drops the coloured border. */
.lifeline-dash .lifeline-hero .lifeline-badge {
  background: rgba(0, 0, 0, 0.42);
  border-color: rgba(255, 255, 255, 0.24);
}

/* KPI chips: the figure and its label, as a button when the chip navigates. */
.lifeline-dash .lifeline-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}
.lifeline-dash .lifeline-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(6px);
  font-size: 0.74em;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.86);
}
.lifeline-dash .lifeline-chip .lifeline-chip-num {
  color: #ffffff;
  font-size: 1.08em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lifeline-dash .lifeline-chip .lifeline-chip-label {
  color: rgba(255, 255, 255, 0.78);
}
.lifeline-dash button.lifeline-chip {
  font-family: inherit;
  cursor: pointer;
}
.lifeline-dash button.lifeline-chip:hover {
  background: rgba(0, 0, 0, 0.62);
  border-color: rgba(255, 255, 255, 0.42);
}
.lifeline-dash button.lifeline-chip:focus-visible {
  outline: 2px solid var(--text-accent);
  outline-offset: 2px;
}

/* Floating panel: the glass surface every block sits in. */
.lifeline-dash .lifeline-panel {
  padding: 12px 14px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 14px;
  background: var(--background-primary);
  background: color-mix(in srgb, var(--background-primary) 68%, transparent);
  backdrop-filter: blur(12px);
  min-width: 0;
}
.lifeline-dash .lifeline-panels > :only-child { grid-column: 1 / -1; }
.lifeline-dash .lifeline-panels {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 12px;
}
@media (max-width: 760px) {
  .lifeline-dash .lifeline-panels {
    grid-template-columns: 1fr;
  }
}
.lifeline-dash .lifeline-panel-head {
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.lifeline-dash .lifeline-panel-titles {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.lifeline-dash .lifeline-panel-body {
  margin-top: 2px;
}

/* Card headers, empty states, overflow notes. */
.lifeline-dash .lifeline-card-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.lifeline-dash .lifeline-card-title {
  font-weight: 600;
  font-size: 0.95em;
}
.lifeline-dash .lifeline-card-count {
  color: var(--text-faint);
  font-size: 0.74em;
  white-space: nowrap;
}
.lifeline-dash .lifeline-empty {
  color: var(--text-muted);
  font-size: 0.86em;
  line-height: 1.4;
  padding: 7px 0;
}
.lifeline-dash .lifeline-more {
  color: var(--text-faint);
  font-size: 0.76em;
  padding-top: 5px;
}

/* Feed rows (new since last sync). */
.lifeline-dash .lifeline-feed-row {
  padding: 7px 0;
  min-width: 0;
}
.lifeline-dash .lifeline-feed-row + .lifeline-feed-row {
  border-top: 1px solid var(--background-modifier-border);
}
.lifeline-dash .lifeline-feed-title {
  font-weight: 600;
  font-size: 0.92em;
  line-height: 1.3;
  min-width: 0;
}
.lifeline-dash .lifeline-feed-title a {
  color: var(--text-normal);
  text-decoration: none;
}
.lifeline-dash .lifeline-feed-title a:hover {
  color: var(--link-color, var(--text-accent));
  text-decoration: underline;
}
.lifeline-dash .lifeline-meta {
  color: var(--text-muted);
  font-size: 0.79em;
  line-height: 1.35;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lifeline-dash .lifeline-sub-link {
  color: var(--text-muted);
}
.lifeline-dash .lifeline-sub-link:hover {
  color: var(--text-normal);
}

/* Attention stack: the dot pulses while something is hidden. */
.lifeline-dash .lifeline-attn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.lifeline-dash .lifeline-attn-titles {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.lifeline-dash .lifeline-attn-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-yellow, #d29922);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-yellow, #d29922) 18%, transparent);
  animation: lifeline-attn-pulse 2.4s ease-out infinite;
}
.lifeline-dash .lifeline-attn-clear .lifeline-attn-dot {
  background: var(--color-green, #2ea043);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-green, #2ea043) 18%, transparent);
  animation: none;
}
@keyframes lifeline-attn-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-yellow, #d29922) 32%, transparent);
  }
  70% {
    box-shadow: 0 0 0 8px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
.lifeline-dash .lifeline-attn-title {
  font-weight: 600;
  font-size: 0.92em;
  white-space: nowrap;
}
.lifeline-dash .lifeline-attn-total {
  padding: 2px 9px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.7em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lifeline-dash .lifeline-attn-clear .lifeline-attn-total {
  color: var(--color-green, #2ea043);
  border-color: color-mix(in srgb, var(--color-green, #2ea043) 40%, var(--background-modifier-border));
}
.lifeline-dash .lifeline-attn-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.lifeline-dash .lifeline-attn-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background-primary) 52%, transparent);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.lifeline-dash .lifeline-attn-item:hover {
  background: color-mix(in srgb, var(--background-modifier-hover) 75%, transparent);
  border-color: var(--background-modifier-border);
}
.lifeline-dash .lifeline-attn-mark {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-yellow, #d29922) 16%, transparent);
  color: var(--color-yellow, #d29922);
  font-size: 0.72em;
  font-weight: 700;
}
.lifeline-dash .lifeline-attn-stack {
  min-width: 0;
}
.lifeline-dash .lifeline-attn-name {
  display: block;
  color: var(--text-normal);
  font-weight: 600;
  font-size: 0.84em;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
}
.lifeline-dash .lifeline-attn-name:hover {
  color: var(--link-color, var(--text-accent));
  text-decoration: underline;
}
.lifeline-dash .lifeline-attn-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}
.lifeline-dash .lifeline-attn-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.67em;
  line-height: 1.35;
}
.lifeline-dash .lifeline-attn-chip b {
  font-variant-numeric: tabular-nums;
}
.lifeline-dash .lifeline-attn-chip-warn {
  color: var(--color-yellow, #d29922);
  border-color: color-mix(in srgb, var(--color-yellow, #d29922) 38%, transparent);
  background: color-mix(in srgb, var(--color-yellow, #d29922) 10%, transparent);
}
.lifeline-dash .lifeline-attn-chip-bad {
  color: var(--color-red, #da3633);
  border-color: color-mix(in srgb, var(--color-red, #da3633) 38%, transparent);
  background: color-mix(in srgb, var(--color-red, #da3633) 10%, transparent);
}

/* Table/Cards pill toggle in a panel header. */
.lifeline-dash .lifeline-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-normal) 5%, transparent);
  backdrop-filter: blur(6px);
}
.lifeline-dash .lifeline-toggle-btn {
  min-height: 0;
  margin: 0;
  padding: 3px 10px;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.7em;
  line-height: 1.25;
  box-shadow: none;
  cursor: pointer;
}
.lifeline-dash .lifeline-toggle-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.lifeline-dash .lifeline-toggle-btn.on {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
  font-weight: 600;
}
.lifeline-dash .lifeline-toggle-btn:focus-visible {
  outline: 2px solid var(--text-accent);
  outline-offset: 1px;
}

/* Tables: the Ledger language. Inside a panel they drop their fill so the
   blur shows through. */
.lifeline-dash .lifeline-scroll {
  overflow-x: auto;
}
.lifeline-dash .lifeline-table {
  width: 100%;
  margin: 0;
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  background: var(--background-secondary);
  font-size: 0.86em;
}
.lifeline-dash .lifeline-table th {
  padding: 7px 11px;
  text-align: left;
  color: var(--text-faint);
  font-size: 0.68em;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  white-space: nowrap;
  background: var(--background-secondary-alt, var(--background-modifier-hover));
  border-bottom: 1px solid var(--background-modifier-border);
}
.lifeline-dash .lifeline-table td {
  padding: 8px 11px;
  vertical-align: middle;
}
.lifeline-dash .lifeline-table th.lifeline-num,
.lifeline-dash .lifeline-table td.lifeline-num {
  text-align: right;
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
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lifeline-dash .lifeline-panel .lifeline-table {
  background: transparent;
}
.lifeline-dash .lifeline-panel .lifeline-table th {
  background: transparent;
}
.lifeline-dash .lifeline-panel .lifeline-table tbody tr:hover td {
  background: color-mix(in srgb, var(--background-modifier-hover) 55%, transparent);
}

/* Cover rows: banner crop, avatar badge, stacked name and handle. */
.lifeline-dash .lifeline-who {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.lifeline-dash .lifeline-art {
  position: relative;
  flex: 0 0 auto;
  width: 104px;
  height: 52px;
  border-radius: 9px;
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
  filter: blur(1.5px) brightness(0.72) saturate(1.05);
  transform: scale(1.06);
}
.lifeline-dash .lifeline-av {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--background-modifier-border);
  color: var(--text-muted);
  font-size: 0.86em;
  font-weight: 700;
}
.lifeline-dash .lifeline-av img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* Over a banner crop the avatar pins to its foot and takes a ring, so it
   reads as a badge instead of a floating circle. */
.lifeline-dash .lifeline-art .lifeline-av {
  position: absolute;
  left: 8px;
  bottom: 8px;
  border: 2px solid var(--background-secondary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.lifeline-dash .lifeline-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.lifeline-dash .lifeline-name a {
  color: var(--text-normal);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}
.lifeline-dash .lifeline-name a:hover {
  color: var(--link-color, var(--text-accent));
  text-decoration: underline;
}
.lifeline-dash .lifeline-handle {
  color: var(--text-muted);
  font-size: 0.76em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Playlist covers: the newest video's thumbnail with a letter fallback. */
.lifeline-dash .lifeline-covers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}
.lifeline-dash .lifeline-cover {
  position: relative;
  display: block;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-modifier-border);
  color: #ffffff;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.lifeline-dash .lifeline-cover:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
  border-color: color-mix(in srgb, var(--text-normal) 22%, transparent);
  z-index: 2;
}
.lifeline-dash .lifeline-cover-art {
  position: absolute;
  inset: 0;
}
.lifeline-dash .lifeline-cover-art.lifeline-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2em;
  font-weight: 700;
}
.lifeline-dash .lifeline-cover-art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}
.lifeline-dash .lifeline-cover:hover .lifeline-cover-art img {
  transform: scale(1.04);
}
.lifeline-dash .lifeline-cover-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.08) 66%);
}
.lifeline-dash .lifeline-cover-body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  padding: 30px 11px 9px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.66) 55%, rgba(0, 0, 0, 0) 100%);
}
.lifeline-dash .lifeline-cover-name {
  font-size: 0.92em;
  font-weight: 600;
  line-height: 1.25;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lifeline-dash .lifeline-cover-meta {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.72em;
}
.lifeline-dash .lifeline-letter {
  background: linear-gradient(135deg, var(--background-modifier-border), var(--background-secondary));
  color: var(--text-muted);
}

/* Channel cards: banner strip, avatar over its foot, name and counts below.
   Declared after the cover rows so the avatar overrides win. */
.lifeline-dash .lifeline-ch-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.lifeline-dash .lifeline-ch-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background-primary) 52%, transparent);
  color: var(--text-normal);
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.lifeline-dash .lifeline-ch-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
  border-color: color-mix(in srgb, var(--text-normal) 22%, transparent);
  z-index: 2;
}
.lifeline-dash .lifeline-ch-banner {
  height: 52px;
  background: linear-gradient(135deg, var(--background-modifier-border), var(--background-secondary-alt, var(--background-secondary)));
}
.lifeline-dash .lifeline-ch-banner > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.8) saturate(1.05);
}
.lifeline-dash .lifeline-ch-face {
  position: absolute;
  left: 10px;
  top: 35px;
  width: 36px;
  height: 36px;
  border: 2px solid var(--background-secondary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.lifeline-dash .lifeline-ch-body {
  margin-top: 2px;
  padding: 22px 10px 9px;
  min-width: 0;
}
.lifeline-dash .lifeline-ch-name {
  display: block;
  color: var(--text-normal);
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.lifeline-dash .lifeline-ch-card:hover .lifeline-ch-name {
  color: var(--link-color, var(--text-accent));
}
.lifeline-dash .lifeline-ch-handle {
  margin-top: 1px;
  color: var(--text-muted);
  font-size: 0.72em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lifeline-dash .lifeline-ch-stats {
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 0.72em;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .lifeline-dash .lifeline-attn-dot {
    animation: none;
  }
  .lifeline-dash .lifeline-cover,
  .lifeline-dash .lifeline-ch-card {
    transition: none;
  }
  .lifeline-dash .lifeline-cover:hover,
  .lifeline-dash .lifeline-ch-card:hover {
    transform: none;
  }
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
 * Sections: header (banner-mosaic hero, KPI chips, and the new/attention
 * panels), playlists and channels (glass panels with a Table/Cards toggle:
 * covers or channel cards by default, transparent tables in table mode). The
 * plugin regenerates this file on every dashboard refresh; hand edits are
 * overwritten.
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

// Section geometry: what each panel draws before it overflows. Cards is the
// default mode; table mode draws every playlist, so nothing that the old
// collapsed block hid is now out of reach.
const MIN_DASHBOARD_LIMIT = 1;
const MAX_DASHBOARD_LIMIT = 100;
const DEFAULT_FEED_LIMIT = 6;
const DEFAULT_ATTENTION_LIMIT = 6;
const DEFAULT_CARDS_LIMIT = 12;
const DEFAULT_CHANNELS_LIMIT = 12;
const NO_PLAYLISTS = "No playlists tracked yet.";
const NO_CHANNELS = "No subscriber counts found. Turn on Subscribers in Settings → Lifeline → Channels.md fields.";

// The plugin instance is the live source of truth for the dashboard limits,
// the same way noteViews reads viewPageSize: switching in the settings rows,
// or live in the notes, takes effect on the next render with no sync.
const pluginInstance = () => {
  try {
    return app.plugins && app.plugins.plugins ? app.plugins.plugins["lifeline"] : null;
  } catch (err) {
    return null;
  }
};

const normalizeLimit = (value) => {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw == null || raw === "") return DEFAULT_FEED_LIMIT;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_FEED_LIMIT;
  return Math.min(MAX_DASHBOARD_LIMIT, Math.max(MIN_DASHBOARD_LIMIT, Math.floor(n)));
};

const liveLimit = (kind) => {
  const plugin = pluginInstance();
  const limits = plugin && plugin.settings ? plugin.settings.dashboardLimits : null;
  const value = limits ? limits[kind] : null;
  return normalizeLimit(value);
};

const liveLimits = () => ({
  feed: liveLimit("feed"),
  attention: liveLimit("attention"),
  cards: liveLimit("cards"),
  channels: liveLimit("channels"),
});

// Everything the three sections read is gathered once: the deduplicated
// playlist notes, the Channels.md page, and its rows sorted by subscribers.
const ALL = toArr(dv.pages(SRC).array());
const PAGES = playlistPages(ALL);
const CHANNELS_PAGE = ALL.find((p) => p.type === "lifeline-channels");
const CHANNELS_PATH = CHANNELS_PAGE ? String(CHANNELS_PAGE.file.path) : "";

const channelRows = () => {
  const out = [];
  if (!CHANNELS_PAGE) return out;
  for (const item of toArr(CHANNELS_PAGE.file?.lists ?? CHANNELS_PAGE.lists)) out.push(item);
  out.sort((a, b) => Number(b.subscribers ?? 0) - Number(a.subscribers ?? 0));
  return out;
};

// Plain DOM builders: this markup nests deep enough that createDiv chains
// would bury the structure.
const mk = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};
const add = (parent, tag, cls, text) => {
  const node = mk(tag, cls, text);
  parent.appendChild(node);
  return node;
};
const imgInto = (parent, src, alt) => {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt || "";
  img.loading = "lazy";
  img.addEventListener("error", () => img.remove());
  parent.appendChild(img);
  return img;
};
const bannerInto = (host, item) => {
  const src = imageSrc(picture(item, "banner"), CHANNELS_PATH);
  if (src) imgInto(host, src, "");
};
const avatarInto = (host, item, variant) => {
  const label = linkParts(item.channel).label;
  const face = add(host, "div", "lifeline-av" + (variant ? " " + variant : ""), initialOf(label));
  const src = imageSrc(picture(item, "avatar"), CHANNELS_PATH);
  if (src) {
    face.textContent = "";
    imgInto(face, src, "");
    const img = face.querySelector("img");
    if (img) img.addEventListener("error", () => { face.textContent = initialOf(label); });
  }
  return face;
};
const itemTitle = (parent, item, cls) => {
  const parts = linkParts(item.title);
  return linkInto(parent, parts.label, parts.href, cls);
};

// The note's section headings are gone, so the KPI chips scroll to the
// playlists panel itself instead of an anchor that no longer exists.
const scrollToPlaylists = () => {
  const el = document.getElementById("lifeline-playlists");
  if (el) el.scrollIntoView({ block: "start" });
};

// The hero: up to four channel banners behind a heavier veil than the note
// views use, because every line of text sits directly on the artwork.
const bannerHero = (host) => {
  const hero = add(host, "div", "lifeline-hero");
  const banners = channelRows()
    .map((item) => imageSrc(picture(item, "banner"), CHANNELS_PATH))
    .filter((src) => Boolean(src))
    .slice(0, 4);
  if (banners.length) {
    const mosaic = add(hero, "div", "lifeline-mosaic");
    mosaic.style.gridTemplateColumns = "repeat(" + banners.length + ", minmax(0, 1fr))";
    for (const src of banners) imgInto(mosaic, src, "");
  }
  add(hero, "div", "lifeline-veil");
  return add(hero, "div", "lifeline-hero-body");
};

// KPI chips: the figure and its label, as a button when the chip navigates.
const kpiChips = (host, chips) => {
  const wrap = add(host, "div", "lifeline-chips");
  for (const k of chips) {
    const chip = k.click ? add(wrap, "button", "lifeline-chip") : add(wrap, "span", "lifeline-chip");
    if (k.click) {
      chip.type = "button";
      chip.addEventListener("click", k.click);
    }
    const num = add(chip, "span", "lifeline-chip-num");
    num.appendChild(numCell(k.value));
    add(chip, "span", "lifeline-chip-label", k.label);
  }
  return wrap;
};

// "New since last sync": hairline-separated rows, newest first.
const feedPanel = (host, fresh, since) => {
  const LIMITS = liveLimits();
  const panel = add(host, "div", "lifeline-panel");
  const head = add(panel, "div", "lifeline-card-h lifeline-panel-head");
  const titles = add(head, "div", "lifeline-panel-titles");
  add(titles, "div", "lifeline-card-title", "New since last sync");
  add(titles, "div", "lifeline-card-count", since ? "since " + since : "");
  const body = add(panel, "div", "lifeline-panel-body");
  const rows = fresh.slice(0, LIMITS.feed);
  if (rows.length === 0) {
    add(body, "div", "lifeline-empty",
      since ? "No new videos since " + since + "." : "New videos appear after the next sync.");
    return panel;
  }
  for (const f of rows) {
    const row = add(body, "div", "lifeline-feed-row");
    const title = add(row, "div", "lifeline-feed-title");
    itemTitle(title, f.item);
    const meta = add(row, "div", "lifeline-meta");
    add(meta, "span", "", f.date + " · ");
    const channel = linkParts(f.item.channel);
    linkInto(meta, channel.label, channel.href, "lifeline-sub-link");
    add(meta, "span", "", " · ");
    internalLink(meta, f.playlist, f.path, "lifeline-sub-link");
  }
  if (fresh.length > rows.length) {
    add(body, "div", "lifeline-more", "+" + (fresh.length - rows.length) + " more");
  }
  return panel;
};

// "Needs attention": a glass alert stack instead of a plain list. The dot
// pulses while something is hidden, and each playlist keeps its counts as
// coloured chips under its name.
const attentionPanel = (host, attention, hidden) => {
  const LIMITS = liveLimits();
  const panel = add(host, "div", "lifeline-panel");
  const head = add(panel, "div", "lifeline-attn-head" + (attention.length ? "" : " lifeline-attn-clear"));
  const titles = add(head, "div", "lifeline-attn-titles");
  add(titles, "span", "lifeline-attn-dot");
  add(titles, "div", "lifeline-attn-title", "Needs attention");
  const total = add(head, "div", "lifeline-attn-total", hidden ? hidden + " hidden" : "All clear");
  if (attention.length) total.title = "Across " + attention.length + " playlists";
  if (attention.length === 0) {
    add(panel, "div", "lifeline-empty", "All clear: no hidden videos.");
    return panel;
  }
  const list = add(panel, "div", "lifeline-attn-list");
  const rows = attention.slice(0, LIMITS.attention);
  for (const p of rows) {
    const row = add(list, "div", "lifeline-attn-item");
    add(row, "span", "lifeline-attn-mark", "!");
    const stack = add(row, "div", "lifeline-attn-stack");
    internalLink(stack, p.name, p.path, "lifeline-attn-name");
    const chips = add(stack, "div", "lifeline-attn-chips");
    if (p.un) {
      const chip = add(chips, "span", "lifeline-attn-chip lifeline-attn-chip-warn");
      add(chip, "b", "", p.un);
      add(chip, "span", "", "unavailable");
    }
    if (p.rm) {
      const chip = add(chips, "span", "lifeline-attn-chip lifeline-attn-chip-bad");
      add(chip, "b", "", p.rm);
      add(chip, "span", "", "removed");
    }
  }
  if (attention.length > rows.length) {
    add(panel, "div", "lifeline-more", "+" + (attention.length - rows.length) + " more");
  }
  return panel;
};

// The pill Table/Cards switch in a panel header. It owns the first paint, so
// a caller only hands it the painter.
const addToggle = (host, paint) => {
  const wrap = add(host, "div", "lifeline-toggle");
  const tableBtn = add(wrap, "button", "lifeline-toggle-btn", "Table");
  const cardsBtn = add(wrap, "button", "lifeline-toggle-btn on", "Cards");
  tableBtn.type = "button";
  cardsBtn.type = "button";
  let mode = "cards";
  const apply = () => {
    tableBtn.classList.toggle("on", mode === "table");
    cardsBtn.classList.toggle("on", mode === "cards");
    tableBtn.setAttribute("aria-pressed", String(mode === "table"));
    cardsBtn.setAttribute("aria-pressed", String(mode === "cards"));
    paint(mode);
  };
  tableBtn.addEventListener("click", () => { if (mode !== "table") { mode = "table"; apply(); } });
  cardsBtn.addEventListener("click", () => { if (mode !== "cards") { mode = "cards"; apply(); } });
  apply();
  return wrap;
};

// Card mode: playlist covers built from the newest video's thumbnail, with the
// playlist's first letter when there is no image to show.
const playlistCovers = (host, rows) => {
  const grid = add(host, "div", "lifeline-covers");
  for (const p of rows) {
    const card = add(grid, "a", "lifeline-cover internal-link");
    card.setAttribute("data-href", p.path);
    card.setAttribute("href", p.path);
    card.addEventListener("click", (e) => {
      e.preventDefault();
      openPath(p.path);
    });
    const art = add(card, "div", "lifeline-cover-art");
    const src = p.newestItem ? imageSrc(picture(p.newestItem, "thumbnail"), p.path) : null;
    if (src) imgInto(art, src, "");
    else {
      art.classList.add("lifeline-letter");
      art.textContent = initialOf(p.name);
    }
    add(card, "div", "lifeline-cover-veil");
    const body = add(card, "div", "lifeline-cover-body");
    add(body, "div", "lifeline-cover-name", p.name);
    add(body, "div", "lifeline-cover-meta", p.count + " videos · newest " + (p.newest || "-"));
  }
  return grid;
};

// Table mode: the Ledger language, transparent inside its panel.
const playlistsTable = (host, rows) => {
  const wrap = add(host, "div", "lifeline-scroll");
  const table = add(wrap, "table", "lifeline-table");
  const head = add(add(table, "thead"), "tr");
  add(head, "th", "", "Playlist");
  add(head, "th", "lifeline-num", "Videos");
  add(head, "th", "lifeline-num", "Newest");
  const body = add(table, "tbody");
  for (const p of rows) {
    const tr = add(body, "tr");
    internalLink(add(tr, "td"), p.name, p.path, "lifeline-title");
    add(tr, "td", "lifeline-num").appendChild(numCell(p.count));
    add(tr, "td", "lifeline-num lifeline-date", p.newest || "-");
  }
  return table;
};

// Card mode for channels: banner strip, avatar over its foot, then name,
// handle, and counts. The card itself is the link, so the name stays plain
// text: a second anchor nested inside it would be invalid and misroute clicks.
const channelCards = (host, rows) => {
  const grid = add(host, "div", "lifeline-ch-cards");
  for (const item of rows) {
    const parts = linkParts(item.channel);
    const card = parts.href ? add(grid, "a", "lifeline-ch-card") : add(grid, "div", "lifeline-ch-card");
    if (parts.href) {
      card.setAttribute("href", parts.href);
      if (/^https?:\\/\\//.test(parts.href)) {
        card.setAttribute("target", "_blank");
        card.setAttribute("rel", "noopener");
      } else {
        card.addEventListener("click", (e) => {
          e.preventDefault();
          openPath(parts.href);
        });
      }
    }
    bannerInto(add(card, "div", "lifeline-ch-banner"), item);
    avatarInto(card, item, "lifeline-ch-face");
    const body = add(card, "div", "lifeline-ch-body");
    add(body, "div", "lifeline-ch-name", parts.label);
    if (item.handle) add(body, "div", "lifeline-ch-handle", String(item.handle));
    const stats = [fmtShort(item.subscribers) + " subs"];
    if (item.videos != null) stats.push(fmtShort(item.videos) + " videos");
    add(body, "div", "lifeline-ch-stats", stats.join(" · "));
  }
  return grid;
};

// Table mode for channels: the Cover rows markup, transparent in its panel.
const channelsTable = (host, rows) => {
  const wrap = add(host, "div", "lifeline-scroll");
  const table = add(wrap, "table", "lifeline-table");
  const head = add(add(table, "thead"), "tr");
  add(head, "th", "", "Channel");
  add(head, "th", "lifeline-num", "Subs");
  add(head, "th", "lifeline-num", "Videos");
  const body = add(table, "tbody");
  for (const item of rows) {
    const link = linkParts(item.channel);
    const tr = add(body, "tr");
    const who = add(add(tr, "td"), "div", "lifeline-who");
    const art = add(who, "div", "lifeline-art");
    const banner = imageSrc(picture(item, "banner"), CHANNELS_PATH);
    if (banner) imgInto(art, banner, "");
    avatarInto(art, item, "");
    const name = add(who, "div", "lifeline-name");
    linkInto(name, link.label, link.href);
    if (item.handle) add(name, "div", "lifeline-handle", String(item.handle));
    add(tr, "td", "lifeline-num").appendChild(numCell(item.subscribers));
    const videos = add(tr, "td", "lifeline-num");
    if (item.videos == null) add(videos, "span", "lifeline-date", "-");
    else videos.appendChild(numCell(item.videos));
  }
  return table;
};

function sectionHeader() {
  const current = dv.current();
  const status = input.status ?? null;
  const since = typeof input.since === "string" && input.since ? input.since : "";
  const badge =
    status === "ok" ? ["lifeline-badge-ok", "Synced"]
      : status === "warn" ? ["lifeline-badge-warn", "Synced with issues"]
        : status === "error" ? ["lifeline-badge-err", "Sync failed"]
          : ["lifeline-badge-never", "Never synced"];

  const wrap = add(dv.container, "div", "lifeline-wrap");
  const hero = bannerHero(wrap);

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
  const lastSync = rel ? "Last sync " + rel : raw ? "Last sync " + String(raw) : "";

  // Counts come from the deduplicated playlist notes so they always match the
  // panels below, and the delta from videos whose date:: is on or after the
  // baked last-sync date.
  let videos = 0;
  let hidden = 0;
  const fresh = [];
  for (const page of PAGES) {
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

  const titleRow = add(hero, "div", "lifeline-hero-title-row");
  add(titleRow, "h1", "lifeline-hero-title", "YouTube dashboard");
  add(titleRow, "span", "lifeline-badge " + badge[0], badge[1]);

  const sub = add(hero, "div", "lifeline-hero-sub");
  sub.textContent = [
    lastSync,
    Number(current?.channel_count ?? 0) + " channels",
    PAGES.length + " playlists",
    videos + " videos",
  ].filter((bit) => bit).join(" · ");
  if (hidden > 0) add(sub, "span", "lifeline-warn", " · +" + hidden + " hidden");

  const chips = [
    {
      label: "Channels",
      value: Number(current?.channel_count ?? 0),
      click: CHANNELS_PATH ? () => openPath(CHANNELS_PATH) : null,
    },
    { label: "Playlists", value: PAGES.length, click: scrollToPlaylists },
    { label: "Videos", value: videos, click: scrollToPlaylists },
  ];
  if (since) chips.push({ label: "New since sync", value: fresh.length, click: null });
  kpiChips(hero, chips);

  // The delta and the attention queue side by side, gated exactly as before.
  if ((input.recent && since) || input.attention) {
    const panels = add(wrap, "div", "lifeline-panels");
    if (input.recent && since) feedPanel(panels, fresh, since);
    if (input.attention) {
      const attention = [];
      for (const page of PAGES) {
        const un = Number(page.unavailable_count ?? 0);
        const rm = Number(page.removed_count ?? 0);
        if (un || rm) attention.push({ name: page.file.name, path: page.file.path, un: un, rm: rm });
      }
      attention.sort((a, b) => (b.un + b.rm) - (a.un + a.rm) || a.name.localeCompare(b.name));
      attentionPanel(panels, attention, hidden);
    }
  }
}

function sectionPlaylists() {
  const rows = [];
  for (const page of PAGES) {
    const items = listItems(page);
    let newest = "";
    let newestItem = null;
    for (const item of items) {
      const ds = itemDate(item);
      if (ds > newest) {
        newest = ds;
        newestItem = item;
      }
    }
    rows.push({
      name: page.file.name,
      path: page.file.path,
      count: items.length,
      newest: newest,
      newestItem: newestItem,
    });
  }

  const panel = add(dv.container, "div", "lifeline-panel");
  // The KPI chips scroll here by id; the note no longer carries a heading to
  // anchor to.
  panel.id = "lifeline-playlists";
  const head = add(panel, "div", "lifeline-card-h lifeline-panel-head");
  const titles = add(head, "div", "lifeline-panel-titles");
  add(titles, "div", "lifeline-card-title", "Playlists");
  add(titles, "div", "lifeline-card-count", rows.length + " tracked");
  const body = add(panel, "div", "lifeline-panel-body");
  if (rows.length === 0) {
    add(body, "div", "lifeline-empty", NO_PLAYLISTS);
    return;
  }

  // Cards: newest first. Table: Watch Later pinned, then alphabetical, so the
  // full list stays reachable now that the collapsed block is gone.
  const LIMITS = liveLimits();
  const byNewest = rows.slice().sort((a, b) => b.newest.localeCompare(a.newest));
  const byName = rows.slice().sort((a, b) => (a.path === WL_PATH ? -1 : b.path === WL_PATH ? 1 : a.name.localeCompare(b.name)));
  addToggle(head, (mode) => {
    body.textContent = "";
    if (mode === "table") playlistsTable(body, byName.slice(0, LIMITS.cards));
    else playlistCovers(body, byNewest.slice(0, LIMITS.cards));
  });
}

function sectionChannels() {
  const rows = channelRows().filter((item) => typeof item.subscribers === "number");

  const panel = add(dv.container, "div", "lifeline-panel");
  panel.id = "lifeline-channels";
  const head = add(panel, "div", "lifeline-card-h lifeline-panel-head");
  const titles = add(head, "div", "lifeline-panel-titles");
  add(titles, "div", "lifeline-card-title", "Top channels");
  add(titles, "div", "lifeline-card-count", "by subscribers");
  const body = add(panel, "div", "lifeline-panel-body");
  if (rows.length === 0) {
    add(body, "div", "lifeline-empty", NO_CHANNELS);
    return;
  }

  const LIMITS = liveLimits();
  const top = rows.slice(0, LIMITS.channels);
  addToggle(head, (mode) => {
    body.textContent = "";
    if (mode === "table") channelsTable(body, rows.slice(0, LIMITS.channels));
    else channelCards(body, top);
  });
}

const section = String(input.section ?? "header");
if (section === "playlists") sectionPlaylists();
else if (section === "channels") sectionChannels();
else sectionHeader();
`;
}
