# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## What this plugin is (Lifeline)

- Backs up YouTube subscriptions, playlists, and a watch-later substitute into Markdown notes (default folder `95 - Notes/YouTube/`): `Channels.md`, `Playlists/<name>.md`, `Watch Later.md`, an opt-in `Dashboard.md` home note (one `dv.view()` call per section into the generated `lifeline-dashboard.js` script in a configurable scripts folder; gated on the community Dataview plugin), opt-in per-note views above the bullets (one `dv.view()` call per note into `lifeline-noteviews.js`, in one of four layouts), and opt-in avatars/thumbnails appended as the last token on the bullets themselves (no Dataview needed; `off` / `link` / `download`). The sync log (`sync-log.json`) lives in the plugin folder.
- Desktop-only (`isDesktopOnly: true`, `minAppVersion: 1.11.4` for the native SecretStorage API). No mobile, no telemetry, no video downloads.

### Architecture (keep `main.ts` lifecycle-only)

- `src/main.ts`: lifecycle, commands, ribbon, status bar, `state.json`/`sync-log.json` persistence, startup auto-sync check (NOT a background scheduler), Dataview-gated `createDashboard()` write-and-open helper.
- `src/auth.ts`: Google OAuth 2.0 installed-app flow with a loopback HTTP listener on `127.0.0.1`. Client ID, client secret, and refresh token live in `app.secretStorage` (OS keychain); **never** in `data.json`/`state.json`, which store only the secret *names*.
- `src/youtubeApi.ts`: YouTube Data API v3 client: pagination, quota accounting, 401→refresh+retry once, exponential backoff on 403/429/5xx, batched channel statistics and by-ID playlist metadata (50 ids per quota unit; the latter titles imported saved-playlist IDs, which `mine=true` never lists).
- `src/sync.ts`: orchestration: per-resource error isolation (auth/quota/network/api/io; one failure never aborts the run), state diffing, vault writes (including the opt-in `Dashboard.md` and its generated script, plus the opt-in note-views script and the `dv.view()` blocks baked into Channels/playlist/Watch Later notes), the opt-in thumbnail downloads that run *before* the notes are written (bounded concurrency, abort timeout, magic-byte validation, one aggregated error per run), append-only sync log in the plugin folder.
- `src/markdown.ts`: pure Markdown renderers (Dataview inline-field entries, per-field channel rendering, optional `viewBlock` param for the opt-in DataviewJS view, optional trailing image token) + output path/file-name helpers (including the `thumbnails/` folder) + the shared `dataviewBlock()`/`viewCall()` fenced-block helpers used by both the Dashboard and note-views renderers.
- `src/dashboard.ts`: `Dashboard.md` renderer (pure: frontmatter counts + one `dv.view()` block per section gated by the checklist; the header call bakes the sync date for the delta card; degraded path = title + warning callout, no dataviewjs) + `isDataviewEnabled()` capability check (narrow structural probe of `app.plugins`, no `any`).
- `src/dashboardScript.ts`: generator for `lifeline-dashboard.js` (hero header, clickable stat tiles, quick-link chips, new-since-sync + needs-attention cards, top-5 playlists with a collapsed full table, subscriber bars; injected CSS) + scripts-folder helpers (`DEFAULT_SCRIPTS_FOLDER`, `normalizeScriptsFolder`, `dashboardScriptPath`, `dashboardViewName`).
- `src/noteViewsScript.ts`: generator for `lifeline-noteviews.js` (opt-in DataviewJS views above the entries in Channels.md, playlist notes, and Watch Later.md; sections `channels` (columns follow `ChannelsFieldSettings`) and `playlist` (Video/Channel/Date added), each reading the calling note's own `dv.current().file.lists`) + `noteViewsScriptPath`/`noteViewsViewName` helpers. Layouts are chosen by the baked `layout` option: `table`, `chips`, `cards`, or `mixed` (chips for channels, cards for playlists; anything unrecognized falls back to the table). Chips and cards read the trailing image off the bullet and paint 60 entries behind a **Show more** button. Channel cells stay narrow: `fmtDate` forces `yyyy-MM-dd` (Dataview would otherwise render bare ISO fields as long Luxon dates, and the playlist `date` field is a `[[wiki link]]` that needs reading back out of the Link), `idCell` shortens the 24-char channel ID with the full value on hover, and `numCell`/`fmtShort` give YouTube-style counts (`4.67K`, `109M`) matching the dashboard.
- `src/collector.ts`: shared saved-playlist collector script source (Mode 1 console paste + Mode 2 `executeJavaScript` in the user's Web viewer tab); DOM-only reads.
- `src/playlistIds.ts`: lenient saved-ID parsing (JSON array / one-per-line / mixed), shape warnings (keep odd IDs), and the `importedPlaylistIds` set helpers for `data.json`.
- `src/webviewCompat.ts`: **Web viewer** core-plugin helpers: enable check, open a URL in a new tab (never enabling the core plugin ourselves), and finder for an open tab to collect from; structural, feature-detected access to Obsidian's internal-plugin registry (no `any`).
- `src/ui/syncLogModal.ts`: read-only modal viewer for `sync-log.json` (the plugin folder isn't vault-indexed, so the log can't open as a note).
- `src/settings.ts`: `LifelineSettings`, defaults, settings tab (two SecretComponents, **Channel avatars** and **Video thumbnails** three-mode dropdowns that are deliberately NOT gated on the views toggle, Channels.md fields sub-page with reset, playlist sub-page with refresh, Dashboard sub-page with Dataview gate + **Script folder** text row + refresh, **Views in notes** toggle with Dataview gate + **View layout** dropdown, watch-later dropdown, saved-playlist-ID collector sub-page with Mode 1 steps/copy + textarea + Mode 2 Web viewer open/collect buttons).
- `src/types.ts` / `src/json.ts`: shared types + `SyncError`; type-safe JSON narrowing helpers (no `any`).

### Invariants

- Never persist secrets anywhere in the vault; `state.json` (plugin folder) holds sync state only.
- Never abort a whole sync because one fetch or write failed; record per-resource errors and continue.
- Keep native `fetch` for API calls; state sentinel `trackedPlaylists === null` means "track everything on first fetch".
- Notes stay Dataview-queryable: one bullet per video or channel with bracketed inline fields (`[title:: …] [date:: …]`), rendered in `src/markdown.ts`.
- Playlist notes list only watchable videos. Unavailable and removed entries stay in `state.json` (the backup) and surface as the disjoint frontmatter counts `unavailable_count` and `removed_count`, which the Dashboard's hidden-videos section reads.
- All three note-view features default to `off`, and with `noteViews` off, `channelAvatars` off, and `videoThumbnails` off the note output must stay byte-identical to pre-feature output.
- Images live in the bullets, never in the generated script, and the generated script makes no network request. `channelAvatars`/`videoThumbnails` are never gated behind the `noteViews` toggle: they need no Dataview.
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
      markdown.ts           # Pure Markdown renderers + image tokens + output path helpers + dataviewBlock/viewCall
      dashboard.ts          # Dashboard.md renderer + Dataview capability check
      dashboardScript.ts    # Generated lifeline-dashboard.js + scripts-folder helpers
      noteViewsScript.ts    # Generated lifeline-noteviews.js (opt-in note views) + path helpers
      collector.ts          # Shared saved-playlist collector script source
      playlistIds.ts        # Lenient saved-ID parsing + imported-ID helpers
      webviewCompat.ts      # Web viewer core-plugin helpers + tab finder
      settings.ts           # Settings tab, defaults, sub-pages
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

## Commits

- Commit only when explicitly asked, then one commit per file or logical change; don't bundle unrelated edits.
- Message style: a short imperative summary line (sentence case), followed by a body of `- ` bullet descriptions of what changed. Match the style of existing examples in `git log` (e.g. `Update Google Cloud setup steps for the new Google Auth Platform console`).
- Check `git status`/`git diff` before staging; stage files individually rather than `git add -A`.

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
