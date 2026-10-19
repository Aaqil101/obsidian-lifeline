# Lifeline

Back up your YouTube subscriptions, playlists, and Watch Later list into Markdown notes in your Obsidian vault. Because accounts get banned, but vaults don't.

Lifeline is a **desktop-only** Obsidian plugin that periodically exports:

- **Channels.md**: every channel you're subscribed to, as queryable fields
- **Playlists/\*.md**: one note per playlist you choose to track
- **Watch Later.md**: a dedicated note for your watch-later substitute playlist
- **sync-log.md** (in the plugin folder): an append-only record of every sync run

All output is plain Markdown inside your vault. No proprietary formats, no databases. Your backup stays readable and searchable forever, and every entry is a Dataview-queryable record.

## Why

YouTube accounts get terminated, playlists get emptied, and videos disappear without notice. Your Obsidian vault is local, version-controlled, and under your control. Lifeline keeps a durable record of what you watched and organized, as plain text, in your vault.

## Install

### Option A: BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian-brat) from the community plugins browser.
2. Open **Settings → BRAT → Add beta plugin** and enter `Aaqil101/obsidian-lifeline`.
3. Enable **Lifeline** under **Settings → Community plugins**.

### Option B: Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Aaqil101/obsidian-lifeline/releases/latest).
2. Copy them into `<YourVault>/.obsidian/plugins/lifeline/`.
3. Reload Obsidian and enable **Lifeline** under **Settings → Community plugins**.

## Google Cloud setup

Lifeline uses the YouTube Data API v3 with your own OAuth credentials. This keeps your quota and your data under your control. Google now calls this area the **Google Auth Platform**; older guides (and some console screenshots) call it the **OAuth consent screen** and **Credentials** pages, same setup, renamed menus.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (any name, for example "Lifeline").
2. Enable the API: open the [YouTube Data API v3 library page](https://console.cloud.google.com/apis/library/youtube.googleapis.com) and select **Enable**.
3. Configure the app:
   - Open the [Google Auth Platform](https://console.cloud.google.com/auth/overview) (**APIs & Services → Google Auth Platform**).
   - Under **Branding**, fill in the app name and a support email; you can leave the optional fields blank.
   - Under **Audience**, add yourself under **Test users**. User type is **External**.
   - **Important:** while the app is in *Testing* mode, Google **expires refresh tokens after 7 days**. To avoid re-authenticating every week, click **Publish app** under **Audience**. For personal use this is fine; you can leave the app unverified, and Google may show you an unverified-app warning once during authorization.
4. Create the client:
   - Open the [Clients page](https://console.developers.google.com/auth/clients) and select **Create client** (or the **Create OAuth client** button on the OAuth overview).
   - Application type: **Desktop app** (not **Web application**).
   - Select **Create**, then immediately copy the **Client ID** and **Client secret** from the popup.
   - **The client secret is shown only once.** Google stores it hashed, so afterwards only the last 4 characters stay visible. If you lose it, select your client on the **Clients** page and use **Add secret** to mint a replacement.

If authorization later fails with a `deleted_client` error, Google has auto-deleted your client after six months of inactivity ([details](https://support.google.com/cloud/answer/6158849#unused-client-deletion)) - create a new client and update the stored secret.

## Connect Obsidian

1. Open **Settings → Lifeline**.
2. Next to **OAuth client ID**, create a new secret (or select an existing one) and store the copied client ID as its value.
3. Do the same for **OAuth client secret**. Both values are kept in your system's keychain via Obsidian's native secret storage and are never written to disk inside your vault. `data.json` only remembers the secret names and your preferences.
4. Select **Authenticate with Google** and approve access (scope: read-only YouTube access).
5. Pick your **output folder** (defaults to `95 - Notes/YouTube`).
6. Optionally choose a **watch-later playlist**, and open **Playlists to track** (chevron row) to uncheck any playlists you don't want backed up (everything is tracked by default on first sync; playlists you saved from other channels are included and labeled **(saved)**). The list refresh icon lives on that sub-page.
7. Optionally open **Dashboard** (chevron row) and turn on **Dashboard note** to get a `Dashboard.md` home note. Lifeline checks that the community **Dataview** plugin is enabled first; the live sections also degrade gracefully if Dataview is later disabled.
8. Select **Sync now**, or use the ribbon icon, or run the command **Lifeline: Sync now**.

## What gets written

```
95 - Notes/YouTube/
├── Channels.md          # one field-list entry per channel
├── Dashboard.md         # opt-in home note: static summary + live DataviewJS sections
├── Watch Later.md       # your watch-later substitute playlist
└── Playlists/
    ├── Favorites.md
    └── Watched later.md

.obsidian/plugins/lifeline/
└── sync-log.md          # one line per sync run (opened via the status bar)
```

### Playlist entries

Each video is a single list item with Dataview inline fields:

```markdown
- [title:: [Video Title](https://www.youtube.com/watch?v=abc123)] [channel:: [Blender Guru](https://www.youtube.com/channel/UCxyz)] [date:: [[2026-01-05]]]
```

- The date links your daily note (`[[YYYY-MM-DD]]`).
- Playlist notes carry `saved: true` in their frontmatter when the playlist was saved from another channel rather than created by you, so `WHERE saved` picks them out in Dataview.
- Videos removed from a playlist keep their entry with `[status:: removed from playlist]`; private or deleted videos get `[status:: unavailable]`. Nothing is ever silently dropped; that is the point of a backup.
- Channels use the same pattern, with statistics when enabled: `[channel:: …] [id:: …] [subscribed_on:: …] [first_seen:: …] [last_seen:: …] [status:: …] [handle:: @x] [subscribers:: N] [videos:: N] [views:: N] [country:: AU]`.
- Every channel field except the link itself is a checkbox under **Channels.md fields → Manage** (Settings → Lifeline → Notes). Subscribers, Videos, Views, and Country cost 1 quota unit per 50 channels per sync while any of them is enabled.

### Dashboard note

**Dashboard.md** (opt-in, off by default) is a home note with two halves:

- A **static header** written from plugin state (no Dataview needed): last sync time and status, channel/playlist/video counts, quick links, and a playlist overview table.
- **Live DataviewJS sections** that query the synced notes on render: recently added videos, top channels by subscribers, and videos that need attention (unavailable/removed). Each section has a toggle under **Dashboard** (Settings → Lifeline → Notes).

Turning the toggle on requires the community [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin; Lifeline checks and tells you to install it if it's missing. The note refreshes after every sync, and the **Create dashboard note** command (or the refresh icon on the Dashboard sub-page) rewrites it on demand. Zero API quota cost; if Dataview is disabled later, sync keeps the static header and replaces the live sections with a one-line hint.

## Dataview recipes

Query commands run in the order written (`FROM`, then `FLATTEN`, then `WHERE`), so flatten `file.lists` before filtering:

Every video across playlists and watch later:

```dataview
TABLE WITHOUT ID v.title AS Video, v.channel AS Channel, v.date AS Added, v.status AS Status
FROM "95 - Notes/YouTube"
FLATTEN file.lists AS v
WHERE v.title
SORT v.date DESC
```

All subscriptions, with status (the `WHERE` clause uses the ID field, so the **Channel ID** toggle must stay on):

```dataview
TABLE WITHOUT ID v.channel AS Channel, v.subscribed_on AS "Subscribed on", v.first_seen AS "First seen", v.status AS Status
FROM "95 - Notes/YouTube/Channels.md"
FLATTEN file.lists AS v
WHERE v.id
```

Biggest channels, by subscribers (needs at least Subscribers and Views enabled in settings):

```dataview
TABLE WITHOUT ID v.channel AS Channel, v.subscribers AS Subscribers, v.views AS "Total views"
FROM "95 - Notes/YouTube/Channels.md"
FLATTEN file.lists AS v
WHERE v.subscribers
SORT v.subscribers DESC
```

Watch later only:

```dataview
LIST WITHOUT ID v.title
FROM "95 - Notes/YouTube/Watch Later.md"
FLATTEN file.lists AS v
WHERE v.title
```

## Syncing

- **Manual:** command palette → **Lifeline: Sync now**, the ribbon refresh icon, or **Sync now** in settings.
- **Automatic:** on Obsidian startup, Lifeline syncs once if the last successful sync is older than the configured interval (default: 20 hours). This is **not a background scheduler**; nothing syncs while Obsidian is closed.
- The **status bar** shows a check/warn/cross icon plus the time of the last sync. Select it to open the sync log in a modal; hover for a summary (channels, playlists, videos, quota units, error kinds).
- Every run appends a line to `sync-log.md`, including failures, so you always know the state of your backup.

## Security & privacy

- **Secrets live in your system keychain.** The OAuth client ID, client secret, and refresh token are stored with Obsidian's native `SecretStorage` API (Obsidian 1.11.4+), which uses the OS credential store (for example Windows Credential Manager or macOS Keychain). They are **never** written to `data.json`, `state.json`, or any file in your vault. Those files hold only secret names, preferences, and sync state.
- **What leaves your machine:** OAuth calls to `accounts.google.com` and `oauth2.googleapis.com`, and YouTube Data API calls to `googleapis.com/youtube/v3` using the `youtube.readonly` scope. That is all.
- **No telemetry, no third-party services, no remote code.** Lifeline does exactly one thing: fetch your YouTube data and write Markdown notes.
- **Revoking access:** remove Lifeline's permission at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), and delete the stored secrets from Obsidian's secret storage if desired. On a new machine you'll need to authenticate again (the keychain is per-machine).

## Limitations

- **Desktop only.** The OAuth flow uses a loopback redirect (`127.0.0.1`), so mobile isn't supported.
- **YouTube's system "Watch Later" list is not accessible via the API.** Pick your own substitute playlist in settings; Lifeline writes it to `Watch Later.md`.
- **Quota:** the YouTube API allows about 10,000 units/day by default; a full sync costs roughly 2 units, plus 1 per tracked playlist, plus 1 per 50 subscribed channels while statistics fields are enabled. Lifeline counts usage and warns at a configurable soft limit.
- **One Google account per vault.**
- **No scheduler:** sync runs at startup (if due) or on demand.

## Development

```bash
npm install
npm run dev      # esbuild watch mode
npm run build    # type-check + production bundle
npm run lint     # eslint (obsidianmd plugin rules)
npm run deploy   # build, then copy artifacts into the real vault (local convenience)
```

Source layout: `src/main.ts` (lifecycle only) delegates to `auth.ts` (OAuth loopback), `youtubeApi.ts` (quota-aware client), `sync.ts` (orchestration + state diffing), `markdown.ts` (renderers), `dashboard.ts` (Dashboard.md renderer + Dataview capability check), and `settings.ts` (settings tab). Sync state persists in `state.json` next to `data.json`; the sync log lives beside them in the plugin folder. Neither holds secrets.

Progress is tracked in [GitHub issues](https://github.com/Aaqil101/obsidian-lifeline/issues): open issues are the roadmap, closed issues are what shipped.

A convenient dev loop is the [Hot-Reload](https://github.com/pjeby/hot-reload) community plugin pointed at the plugin folder while `npm run dev` is running.

## License

[0-BSD](LICENSE)
