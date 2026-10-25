# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## What this plugin is (Lifeline)

- Backs up YouTube subscriptions, playlists, and a watch-later substitute into Markdown notes (default folder `95 - Notes/YouTube/`): `Channels.md`, `Playlists/<name>.md`, `Watch Later.md`, an opt-in `Dashboard.md` home note (one `dv.view()` call per section into the generated `lifeline-dashboard.js` script in a configurable scripts folder; gated on the community Dataview plugin), opt-in per-note views above the bullets (one `dv.view()` call per note into one of three generated scripts: `lifeline-channels.js`, `lifeline-playlists.js`, and `lifeline-watchlater.js`, in one of three layouts each, picked per note type in settings or in the note's own toolbar), and opt-in avatar/thumbnail image fields at the end of the bullets themselves (`avatar_url`/`avatar`, `thumbnail_url`/`thumbnail`, channel `banner_url`/`banner`, drawn by the views; `off` / `link` / `download`). The sync log (`sync-log.json`) lives in the plugin folder.
- Desktop-only (`isDesktopOnly: true`, `minAppVersion: 1.11.4` for the native SecretStorage API). No mobile, no telemetry, no video downloads.

### Architecture (keep `main.ts` lifecycle-only)

- `src/main.ts`: lifecycle, commands, ribbon, status bar, `state.json`/`sync-log.json` persistence, the one-time `data.json` key upgrades (`noteTables` -> `noteViews`, `noteLayout` -> `noteLayouts` via `expandLegacyLayout()`, a saved empty `journalFolder` -> `DEFAULT_JOURNAL_FOLDER`, and `noteLayouts` itself via `normalizeStoredLayouts()`, which rewrites the retired `cards` and any unknown value to poster; each fills or purges the stale key and saves once only when something actually changed, so an ordinary startup stays read-only), startup auto-sync check (NOT a background scheduler), Dataview-gated `createDashboard()` write-and-open helper.
- `src/auth.ts`: Google OAuth 2.0 installed-app flow with a loopback HTTP listener on `127.0.0.1`. Client ID, client secret, and refresh token live in `app.secretStorage` (OS keychain); **never** in `data.json`/`state.json`, which store only the secret *names*.
- `src/youtubeApi.ts`: YouTube Data API v3 client: pagination, quota accounting, 401→refresh+retry once, exponential backoff on 403/429/5xx, batched channel statistics and by-ID playlist metadata (50 ids per quota unit; the latter titles imported saved-playlist IDs, which `mine=true` never lists).
- `src/sync.ts`: orchestration: per-resource error isolation (auth/quota/network/api/io; one failure never aborts the run), state diffing, vault writes (including the opt-in `Dashboard.md` and its generated script, plus the three per-kind note-view stylesheets, the three opt-in note-view scripts and the `dv.view()` blocks baked into Channels/playlist/Watch Later notes; the video scripts bake Channels.md's path so they can join channel avatars from it), the opt-in thumbnail downloads that run *before* the notes are written (bounded concurrency, abort timeout, magic-byte validation, one aggregated error per run), append-only sync log in the plugin folder.
- `src/markdown.ts`: pure Markdown renderers (Dataview inline-field entries, per-field channel rendering, optional `viewBlock` param for the opt-in DataviewJS view, optional trailing image fields (`avatar_url`/`avatar`, `thumbnail_url`/`thumbnail`, channel `banner_url`/`banner`, each gated on its own `channelsFields` toggle)) + output path/file-name helpers (`outputPaths()`, `imagesParentFolder()`, `normalizeFolder()`, resolving the configurable images parent down to its `thumbnails/` sub-folder, with `''` and `/` both meaning the vault root) + the shared `dataviewBlock()`/`viewCall()` fenced-block helpers used by both the Dashboard and note-views renderers; the dated bullets (`date` on playlist and Watch Later entries, `subscribed_on` on Channels) carry `journalDate()`, a pure helper that wikilinks `[[YYYY-MM-DD]]` only when the day's note exists in the configurable `journalFolder` (defaults to `01 - Journal/Daily`, blank rows commit to it, and a saved empty value is filled by a data.json key migration; a folder missing from the vault, or notes that are not inside it, print dates plain; the date is today or later always links; `first_seen`/`last_seen` are sync bookkeeping and never link), with sync.ts building the journal-name set once per run.
- `src/dashboard.ts`: `Dashboard.md` renderer (pure: frontmatter counts + one `dv.view()` block per section gated by the checklist; the header call bakes the sync date for the new-since-sync panel; no H1 or section headings in Dataview mode, because the hero carries the title and every panel carries its own; degraded path = H1 + warning callout, no dataviewjs) + `isDataviewEnabled()` capability check (narrow structural probe of `app.plugins`, no `any`).
- `src/dashboardScript.ts`: generator for `lifeline-dashboard.js` (the Glass cockpit dashboard: a banner-mosaic hero carrying the status badge, the sync line and the KPI chips, the new-since-sync and pulsing needs-attention panels side by side, and the playlists and channels panels each with a pill **Table / Cards** toggle, cards as the default: playlist covers from the newest thumbnail and channel cards with banner, avatar, handle and counts, tables drawing all playlists and the top ten channels transparently; injected CSS scoped to `.lifeline-dash`) + scripts-folder helpers (`DEFAULT_SCRIPTS_FOLDER`, `normalizeScriptsFolder`, `dashboardScriptPath`, `dashboardViewName`).
- `src/noteViewsScript.ts`: generators for the three opt-in note-view scripts (`lifeline-channels.js`, `lifeline-playlists.js`, `lifeline-watchlater.js`; DataviewJS views above the entries in Channels.md, playlist notes, and Watch Later.md, one script per note type with its section baked in: channels (columns follow `ChannelsFieldSettings`) or playlist (Video/Channel/Date added), each reading the calling note's own `dv.current().file.lists`) + `noteViewScriptPath`/`noteViewViewName` per-kind helpers, the legacy `lifeline-noteviews.js`/`lifeline-tables.js` path helpers for cleanup, and the view stylesheets: `NOTE_VIEWS_CSS_BY_KIND` written by sync to `viewsStylesheetPath(kind, stylesFolder)`, one sheet per kind (default folder `98 - Organize/Styles`, `normalizeStylesFolder`, the quotebook.css pattern; each sheet carries the shared glass toolbar plus that kind's three designs, and the superseded single `lifeline-views.css` is swept by sync), which each generated script bakes as `CSS_PATH` and reads at view time with `app.vault.cachedRead`, replacing the injected sheet when its text changed (so a regenerated stylesheet lands on the next render instead of an app restart) and dropping the retired shared `lifeline-views-style` element (missing file = unstyled but functional view, never a failed render). Layouts are chosen by the `layout` option, the same three on every kind: `poster` (the default), `chips`, and `table`. Channels draws Ambient, Split, and Cover rows; the video lists draw Cinema, Ticket, and Ledger. `cards` retired in poster's favor and `mixed` before it: both, and anything unrecognized, migrate to poster (and a stale value an old note can still bake in falls back the same way at render time), so no renderer sees a value its kind cannot draw. The rendered layout is resolved at view time from the live plugin setting under this note type's own key (`app.plugins.plugins.lifeline.settings.noteLayouts[kind]`), with the baked option only a fallback. The toolbar is a glass pill: the debounced (250ms) search box with the result count inside its right edge (compacted to `10 / 76`, expanding to `Showing 10 of 76 channels` while hovered), a field-scope select whose placeholder names the field it searches, a segmented Poster/Chips/Table control over a hidden native select (which stays the single value source; its change event writes the choice back through `plugin.saveSettings()` and then refreshes the other open views in the generated script's own copy of the Dataview force-refresh sequence, index revision bump + `dataview:refresh-views`, with the search stashed across the re-render, so switching layouts needs no sync), and an icon-only Refresh button that clears the joined-face cache and re-reads the note's bullets. Poster and chips read the image fields off the bullet (no fields means a clean text row, or a Cinema card with the title's first letter in the frame, no placeholder; a legacy embed from before the fields existed still renders) and paint one page of entries behind a **Show more** button, sized by the live `viewPageSize` setting (default 10, clamped to 1-1000; the table layout still draws every row). Table builds its own DOM (Cover rows or Ledger) so it re-renders into the same host, and every date goes through `fmtDate`, which forces `yyyy-MM-dd` (Dataview would otherwise render bare ISO fields as long Luxon dates, and the playlist `date` field is a `[[wiki link]]` that needs reading back out of the Link, and wiki syntax left as plain text is stripped the same way), then through `datePart`/`dateTarget`, which draw the same date as a real `a.internal-link` (href and data-href set to the raw wiki target) when the bullet wrote it as a wiki link and as a plain span otherwise, so a journal date opens its note from the Cinema pill, the Ticket stub, the Ledger Added column, the Split `subscribed since` line, and the Cover rows Tracked column. The video chips and poster join each entry's channel avatar lazily from Channels.md by channel URL and lowercased name, resolving a local avatar against Channels.md's own path (`CHANNELS_PATH` is baked into the two video scripts), so a channel with no avatar costs no lookup and no request. The Cover rows table shortens the 24-char channel ID with the full value on hover, and `fmtShort` gives YouTube-style counts (`4.67K`, `109M`) matching the dashboard.
- `src/collector.ts`: shared saved-playlist collector script source (Mode 1 console paste + Mode 2 `executeJavaScript` in the user's Web viewer tab); DOM-only reads.
- `src/playlistIds.ts`: lenient saved-ID parsing (JSON array / one-per-line / mixed), shape warnings (keep odd IDs), and the `importedPlaylistIds` set helpers for `data.json`.
- `src/webviewCompat.ts`: **Web viewer** core-plugin helpers: enable check, open a URL in a new tab (never enabling the core plugin ourselves), and finder for an open tab to collect from; structural, feature-detected access to Obsidian's internal-plugin registry (no `any`).
- `src/ui/syncLogModal.ts`: read-only modal viewer for `sync-log.json` (the plugin folder isn't vault-indexed, so the log can't open as a note).
- `src/settings/`: the settings tab, split one file per concern so no file carries the whole tab.
    - `index.ts`: `LifelineSettingTab`, the sub-page routing, and the five landing groups in order: Google account, Notes, Images, Playlists, Sync. The router itself renders `addBackCrumb()` for every sub-page, so a page function must never call it (a page that renders its own way out is a page that can forget to). Re-exports `LifelineSettings`/`DEFAULT_SETTINGS`/`NoteLayout`/`NoteLayouts`/`DEFAULT_NOTE_LAYOUTS`/`expandLegacyLayout`/`normalizeStoredLayouts`, so `from './settings'` still resolves and `playlistIds.ts` is unchanged.
    - `types.ts`: `LifelineSettings`, defaults, and the `FIELD_ROWS`/`DASHBOARD_ROWS` checklists (`ChannelsFieldSettings` now also has `avatar`/`banner`, default on) + the layout types: `NoteLayout` (`table`/`chips`/`poster`; `cards` is gone too, the poster card having replaced it), `NOTE_LAYOUT_OPTIONS` (the three dropdown choices, Poster first), `NoteLayouts` (`Record<NoteViewKind, NoteLayout>`, one per note type), `DEFAULT_NOTE_LAYOUTS` (poster/poster/poster, so an upgrade changes nothing), `LAYOUT_ROWS` (the three settings rows), `expandLegacyLayout()` (the pure `noteLayout` -> `noteLayouts` migration, landing `cards`, `mixed`, and anything unrecognized on the defaults and returning null when there is no legacy key so an ordinary load never writes), and `normalizeStoredLayouts()` (the load-time fixer: `cards` becomes poster, a missing or unknown per-kind value becomes that kind's default, and it returns null when the stored object was already valid, so startup only writes when something changed). `dashboardScriptsFolder`/`dashboardScriptsFolderWritten` keep their names even though the folder receives all four generated scripts, not just the dashboard one: renaming would have to migrate every existing `data.json`, and a botched migration silently drops a customized path back to the default. Change the labels, not the key.
    - `ui.ts`: `group()`/`navRow()`/`addBackCrumb()`/`noteParagraph()`/`authErrorMessage()` as free functions over a `SettingsHost` interface, so page modules `import type` it instead of the tab class and no cycle forms. `navRow` is focusable and answers Enter/Space, with an optional leading icon.
    - `folderPicker.ts`: `folderSetting()` rows are a text input with `AbstractInputSuggest<TFolder>` typeahead plus an extra button opening `FuzzySuggestModal<TFolder>`; they commit only on blur, Enter, or a browse pick, never per keystroke, so a concurrent sync never reads a half-typed path. Used by output folder, **Journal folder**, **Styles folder**, **Script folder**, and **Images folder**.
    - `account.ts`: connection row (colour-coded, CTA) + Credentials sub-page (two SecretComponents + Security link).
    - `notes.ts`: Notes group (output folder, **Journal folder** that dated bullets wikilink into under the exists-or-today-or-later rule, **Views in notes** toggle with the Dataview gate that writes the three view scripts on toggle-on, three **layout** dropdowns, an **Items per page** number row (committed on blur or Enter, read live by the views at render time), **Styles folder** that rewrites the stylesheets and three scripts when it moves, **Script folder** that rewrites the dashboard script and the three note-view scripts when it moves, two nav rows) + Channels.md fields sub-page with reset. The **Script folder** row lives here rather than on the Dashboard sub-page because the folder receives all four generated scripts: a shared setting buried under one of its two consumers is a setting nobody finds. The three layout rows come from `LAYOUT_ROWS` (one per note type, each naming the note it drives) and offer Poster/Chips/Table from `NOTE_LAYOUT_OPTIONS_BY_KIND`: they sit directly under the toggle they belong to, stay live while the toggle is off but are described as inactive there, and need no rewrite on change because each view reads its own slot out of `settings.noteLayouts` at render time. A layout changed in a note's toolbar lands in the same slot, so the two are one setting, not two. The output-folder commit also rewrites the view scripts when the views are on, because the two video scripts bake Channels.md's path to join channel avatars from it.
    - `images.ts`: **Channel avatars and banners** and **Video thumbnails** three-mode dropdowns (deliberately NOT gated on the views toggle; avatar and banner are separate checkboxes under Channels.md fields) + the **Images folder** row, rendered only while one of the two is set to Download, redrawing the tab only when that visibility flips.
    - `dashboardPage.ts`: Dashboard sub-page (Dataview gate, section checklist, heading refresh icon). The **Script folder** row lives in Notes, since that folder receives all four generated scripts; the toggle description points at it so this page is still a route to it.
    - `playlists.ts`: Playlists group (two nav rows, watch-later dropdown) + playlists sub-page with refresh.
    - `collectPage.ts`: saved-playlist-ID collector sub-page with Mode 1 steps/copy + textarea and Mode 2 Web viewer open/collect buttons.
    - `syncSection.ts`: sync interval, quota soft limit, Sync now.
- `src/types.ts` / `src/json.ts`: shared types + `SyncError`; type-safe JSON narrowing helpers (no `any`).

### Invariants

- Never persist secrets anywhere in the vault; `state.json` (plugin folder) holds sync state only.
- Never abort a whole sync because one fetch or write failed; record per-resource errors and continue.
- Keep native `fetch` for API calls; state sentinel `trackedPlaylists === null` means "track everything on first fetch".
- Notes stay Dataview-queryable: one bullet per video or channel with bracketed inline fields (`[title:: …] [date:: …]`), rendered in `src/markdown.ts`.
- Playlist notes list only watchable videos. Unavailable and removed entries stay in `state.json` (the backup) and surface as the disjoint frontmatter counts `unavailable_count` and `removed_count`, which the Dashboard's hidden-videos section reads.
- All three note-view features default to `off`, and with `noteViews` off, `channelAvatars` off, and `videoThumbnails` off the note output must stay byte-identical to pre-feature output.
- Image data lives in the bullets as `avatar_url`/`avatar`, `thumbnail_url`/`thumbnail`, and channel `banner_url`/`banner` inline fields, never as `![](...)`/`![[...]]` embeds, and never in the generated script; the script issues no fetch of its own (it only sets an `<img>` src, local file or remote URL). The fields are written for any vault, Dataview or not, so `channelAvatars`/`videoThumbnails` are never gated behind the `noteViews` toggle; only the drawing of the picture happens in the views, so with the views off the bullets carry the data but no picture. The channel pair is gated a second time by `channelsFields.avatar`/`channelsFields.banner` (both default on, so existing installs keep writing them), which is how the mode and the per-field choice stay independent; playlist thumbnails have no such checklist and are gated only by their mode.
- One bad image degrades one bullet: the `*_url` field is always written when a URL exists, and the local field only when the file really exists, so the view falls back from local to remote to none.
- Downloaded images are validated by magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, `RIFF`+`WEBP` at offset 8, `GIF8`) rather than by status code or size, written as `.jpg` regardless of the real type, and skipped when the file already exists.
- Releases: bump `manifest.json` + `versions.json`; GitHub release tag = version (no `v` prefix); attach `main.js`, `manifest.json`, `styles.css`.
- `npm run deploy` builds and copies artifacts into the personal vault (local convenience; `GITHUB_DIR` is the GitHub *root*, and the script derives `<GITHUB_DIR>/Obsidian/Zettelkasten/.obsidian/plugins/lifeline` from it rather than treating `GITHUB_DIR` itself as the target).


## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Current file structure**:
    ```
    src/
      main.ts               # Plugin entry point, lifecycle only
      auth.ts               # Google OAuth 2.0 loopback flow + keychain secrets
      youtubeApi.ts         # Quota-aware YouTube Data API v3 client
      sync.ts               # Sync orchestration, state diffing, vault writes, thumbnail downloads
      markdown.ts           # Pure Markdown renderers + image fields + output path helpers + dataviewBlock/viewCall
      dashboard.ts          # Dashboard.md renderer + Dataview capability check
      dashboardScript.ts    # Generated lifeline-dashboard.js + scripts-folder helpers
      noteViewsScript.ts    # Generated lifeline-channels/playlists/watchlater.js (opt-in note views) + three per-kind stylesheets + path helpers
      collector.ts          # Shared saved-playlist collector script source
      playlistIds.ts        # Lenient saved-ID parsing + imported-ID helpers
      webviewCompat.ts      # Web viewer core-plugin helpers + tab finder
      settings/             # Settings tab: one file per group and sub-page
        index.ts            # LifelineSettingTab + sub-page routing + landing groups
        types.ts            # LifelineSettings + defaults + field checklists
        ui.ts               # Shared row builders (group, navRow, back crumb)
        folderPicker.ts     # Typeahead + browse-button folder rows
        account.ts          # Google account group + Credentials sub-page
        notes.ts            # Notes group + Channels.md fields sub-page
        images.ts           # Images group + conditional images-folder row
        dashboardPage.ts    # Dashboard sub-page
        playlists.ts        # Playlists group + playlists sub-page
        collectPage.ts      # Saved-playlist ID collector sub-page
        syncSection.ts      # Sync group
      types.ts              # Shared types + SyncError
      json.ts               # Type-safe JSON narrowing helpers (no `any`)
      ui/
        syncLogModal.ts     # Read-only viewer for sync-log.json
    ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/<plugin-id>/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- **Never use em dashes (—)** in code comments, UI strings, docs, or commit messages; use commas, colons, semicolons, parentheses, or separate sentences instead.
- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from 'obsidian';
import { MySettings, DEFAULT_SETTINGS } from './settings';
import { registerCommands } from './commands';

export default class MyPlugin extends Plugin {
	settings!: MySettings;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MySettings>,
		);
		registerCommands(this);
	}
}
```

**settings.ts**:

```ts
export interface MySettings {
	enabled: boolean;
	apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
	enabled: true,
	apiKey: '',
};
```

**commands/index.ts**:

```ts
import { Plugin } from 'obsidian';
import { doSomething } from './my-command';

export function registerCommands(plugin: Plugin) {
	plugin.addCommand({
		id: 'do-something',
		name: 'Do something',
		callback: () => doSomething(plugin),
	});
}
```

### Add a command

```ts
this.addCommand({
	id: 'your-command-id',
	name: 'Do the thing',
	callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MySettings>);
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(
	this.app.workspace.on('file-open', (f) => {
		/* ... */
	}),
);
this.registerDomEvent(activeWindow, 'resize', () => {
	/* ... */
});
this.registerInterval(
	window.setInterval(() => {
		/* ... */
	}, 1000),
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
