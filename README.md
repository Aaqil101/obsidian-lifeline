# Lifeline

Back up your YouTube subscriptions, playlists, and Watch Later list into Markdown notes in your Obsidian vault. Because accounts get banned, but vaults don't.

Lifeline is a **desktop-only** Obsidian plugin that periodically exports:

- **Channels.md**: every channel you're subscribed to, as queryable fields
- **Playlists/\*.md**: one note per playlist you choose to track
- **Watch Later.md**: a dedicated note for your watch-later substitute playlist
- **sync-log.json** (in the plugin folder): an append-only record of every sync run

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
6. Optionally choose a **watch-later playlist**, and open **Playlists to track** (chevron row) to uncheck any playlists you don't want backed up (everything is tracked by default on first sync; playlists you saved from other channels are included and labeled **(saved)**). The list refresh icon lives on that sub-page. For playlists you *saved* that the API can't enumerate, see **Saved playlists** below.
7. Optionally open **Dashboard** (chevron row) and turn on **Dashboard note** to get a `Dashboard.md` home note. Lifeline checks that the community **Dataview** plugin is enabled first, writes its script to the **Script folder** (default `98 - Organize/Scripts`), and degrades to a warning callout if Dataview is later disabled.
8. Select **Sync now**, or use the ribbon icon, or run the command **Lifeline: Sync now**.

## Saved playlists

YouTube's API returns the playlists you *created*, but not the ones you *saved* from other channels (subscriptions.list includes only created lists, and there is no endpoint that lists a user's saved playlists). To back those up too, Lifeline collects their IDs from the web page itself: two ways, both feeding the same box in **Settings → Lifeline → Get saved playlist IDs**:

1. **Console steps (default, works everywhere).** The settings page has numbered steps for opening `youtube.com/feed/playlists` with DevTools and a **Copy collector script** button. Paste the script into the console; it scrolls the page, collects every saved playlist ID (skipping Watch Later, Liked videos, and radio/mix links), and copies a JSON array. Paste that array back into the settings box. Plain lists and mixed text work too, not just JSON. IDs are then stored in `data.json` and synced like any other tracked playlist.
2. **Web viewer (desktop-only).** **Settings → Lifeline → Get saved playlist IDs → Web viewer** has **Open in Web viewer**, which opens the playlists page in Obsidian's built-in **Web viewer** core plugin (enable it in **Settings → Core plugins** if it is off). That is your own signed-in browser session, so no sign-in page ever appears inside the plugin. Once the page is open, select **Collect from tab**: Lifeline runs the same collector script in that tab (it scrolls to the end for you), then adds the IDs to the tracked list directly. The script only reads the page; the plugin never handles your Google login and never reads cookies or storage, and the console steps above always remain an option.

Whichever route you use, imported IDs land in `data.json`, appear on the same settings page, and can be removed there; the plugin never sees your Google credentials in any of these flows.

## What gets written

```
95 - Notes/YouTube/
├── Channels.md          # one field-list entry per channel
├── Dashboard.md         # opt-in home note: one dv.view() call per section
├── Watch Later.md       # your watch-later substitute playlist
├── Playlists/
│   ├── Favorites.md
│   └── Watched later.md
└── thumbnails/          # opt-in avatars, banners, and thumbnails (Download mode only)

98 - Organize/Scripts/   # default Script folder (configurable in settings)
├── lifeline-dashboard.js  # generated DataviewJS that draws Dashboard.md
├── lifeline-channels.js   # generated DataviewJS that draws the Channels.md view (opt-in)
├── lifeline-playlists.js  # generated DataviewJS that draws the playlist-note views (opt-in)
└── lifeline-watchlater.js # generated DataviewJS that draws the Watch Later.md view (opt-in)

98 - Organize/Styles/    # default Styles folder (configurable in settings)
└── lifeline-views.css     # generated stylesheet read by the note views (opt-in)

.obsidian/plugins/lifeline/
└── sync-log.json        # the last 200 sync runs (opened from the status bar)
```

### Playlist entries

Each video is a single list item with Dataview inline fields:

```markdown
- [title:: [Video Title](https://www.youtube.com/watch?v=abc123)] [channel:: [Blender Guru](https://www.youtube.com/channel/UCxyz)] [date:: [[2026-01-05]]]
```

- The date links your daily note (`[[YYYY-MM-DD]]`).
- Every playlist note (Watch Later included) carries a `url` in its frontmatter that opens the playlist on YouTube, so `file.frontmatter.url` is one click away in Dataview or the properties pane.
- Playlist notes carry `saved: true` in their frontmatter when the playlist was saved from another channel rather than created by you, so `WHERE saved` picks them out in Dataview. Playlists you created and collected from the same page are labeled `saved: false` (the owner channel decides, not the import path).
- Only watchable videos get a bullet. Private or deleted videos and videos removed from the playlist upstream are left out of the note, but never out of the backup: they stay in `state.json` and the frontmatter reports them as `unavailable_count` and `removed_count` (both always present, so `video_count - unavailable_count - removed_count` is the number of bullets). The two counts never overlap, so a video that is both removed and unavailable counts once under `removed`.
- Channels use the same pattern, with statistics when enabled: `[channel:: …] [id:: …] [subscribed_on:: …] [first_seen:: …] [last_seen:: …] [status:: …] [handle:: @x] [subscribers:: N] [videos:: N] [views:: N] [country:: AU]`.
- Every channel field except the link itself is a checkbox under **Channels.md fields → Manage** (Settings → Lifeline → Notes). Subscribers, Videos, Views, and Country cost 1 quota unit per 50 channels per sync while any of them is enabled, and so does **Channel avatars and banners** (both ride the same request).

### Dashboard note

**Dashboard.md** (opt-in, off by default) is a home note whose visible content is all DataviewJS. The note itself stays small: frontmatter (state-derived counts), the title, and a `dv.view()` call per section under a real `##` heading. Each call runs `lifeline-dashboard.js`, a script Lifeline generates in the **Script folder** (default `98 - Organize/Scripts`, changeable under **Dashboard**), which queries the synced notes live:

- A **header**: the last sync time and status, clickable stat tiles (channels, playlists, videos, and a green **New since sync** count), a quick links row, and two cards side by side: **New since last sync** (videos added on or after the last sync date) and **Needs attention** (playlists with hidden, unavailable, or removed entries; **All clear** when there are none).
- A **Playlists** section: the five most recently active playlists, with the full table (Watch Later pinned first, then alphabetical) inside a collapsed toggle below it.
- A **Top channels** section with subscriber bars so the table reads as a chart.

The cards, quick links row, and Top channels section each have a toggle under **Dashboard** (Settings → Lifeline → Notes); the playlist table is always on.

Turning the toggle on requires the community [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin; Lifeline checks and tells you to install it if it's missing. The note and its script refresh after every sync, and the **Create dashboard note** command, the **Refresh dashboard note** command, or the refresh icon on the Dashboard sub-page rewrites them on demand (the script is regenerated, so hand edits to it are overwritten). Changing **Script folder** moves the script and rewrites the note's calls; the old copy is cleaned up. Subscriber and video counts render YouTube-style (`109M`, `4.67K`); hover a number for the full value, or select it to switch between short and full. Zero API quota cost; if Dataview is disabled later, sync keeps the frontmatter and title and replaces every section with a one-line warning callout.

### Views in notes

**Views in notes** (opt-in, off by default; Settings → Lifeline → Notes) draws a live view above the entries in Channels.md, every playlist note, and Watch Later.md. Each note type calls its own script in the same **Script folder**: Channels.md calls `lifeline-channels.js`, playlist notes call `lifeline-playlists.js`, and Watch Later.md calls `lifeline-watchlater.js`. Lifeline generates all three.

Each view can render in four layouts:

- **Mixed** (default): chips in Channels.md, cards in playlist notes. The three options below apply one layout everywhere.
- **Chips**: one compact row per entry with the title and a muted meta line, plus the avatar on the left when **Channel avatars and banners** (or **Video thumbnails**) is on.
- **Cards**: a bordered card per entry with the accent on the left edge. Channel cards put the banner across the top (when the channel has one) with the avatar as a round badge half over its lower-left edge, the way a channel header sits on YouTube; a channel with no banner simply leads the card with the avatar, so nothing is ever force-cropped. Playlist and watch-later cards put the video thumbnail across the top. Labeled rows sit underneath.
- **Table**: the original grid, best when you want to scan several columns at once.

Whatever the layout, the Channels.md columns and card rows follow your **Channels.md fields** checkboxes, so turning a field off removes it everywhere. To keep things narrow, dates render as `YYYY-MM-DD`, the channel ID shows a short prefix (hover for the full 24-character value), and Subscribers/Videos/Views render YouTube-style (`4.67K`, `109M`; hover for the full value, select it to flip between short and full).

Every view opens with a toolbar:

- A **search box** that filters the entries as you type (search covers the name or title, handle, ID, country, status, channel, or date, whichever you pick in the box beside it).
- A **Layout** select that switches between Mixed, Chips, Cards, and Table immediately, with no sync needed. The choice is saved as your new default (there is no settings row for it), so every note follows it, including any other view already open.
- A **Refresh** button that re-reads the note's bullets, for when you edited them by hand.
- A count line, for example `Showing 60 of 412 channels`, or `Found 3 of 412 channels` while searching.

Chips and cards paint the first 60 entries when the note opens and put the rest behind a **Show more** button, so a 900-entry Watch Later does not build 900 nodes before you can read it.

The view reads the note's own list entries (`dv.current().file.lists`), so it always matches the bullets directly below it. The bullets stay: the view is purely additive, and your `file.lists` Dataview queries are unaffected. Turning the toggle on requires the community [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin (Lifeline checks and tells you to install it if it's missing); the scripts are written immediately, and the notes pick up the view on the next sync. If Dataview is missing or the toggle is off, the notes carry no `dataviewjs` block at all. Changing **Script folder** moves these scripts alongside the dashboard one, and the old copies are cleaned up. Zero API quota cost.

The styling lives in its own file, `lifeline-views.css`, written to the **Styles folder** (default `98 - Organize/Styles`, changeable under **Notes**, the same idea as quotebook.css for the quotebook script). Each script reads that file when it renders, so restyling the views is a matter of editing the CSS, and moving the folder moves the file with it. The file is regenerated on every sync while the views are on, so hand edits to it are overwritten; if it is missing, the views still work, just unstyled. No network request is involved: the CSS is read from your vault.

### Images in notes

**Channel avatars and banners** (Channels.md) and **Video thumbnails** (playlist notes and Watch Later.md) each append image fields to the end of every bullet: `avatar_url`/`thumbnail_url` (and for channels `banner_url`) holding the remote link, and, once Download has fetched the file, `avatar`/`thumbnail` (and `banner`) holding the local copy. The fields are plain Dataview data, so `file.lists` queries see them whatever is installed; the views above the notes are what draw the picture from them. Both sit outside **Views in notes** (the setting is never gated on it), and both default to **Off**.

Each setting has three modes:

- **Off** (default): no image fields, and the notes are byte-for-byte what Lifeline wrote before this option existed.
- **Link to YouTube**: the bullet carries `[thumbnail_url:: https://…]` (and `[banner_url:: https://…]` on channels), so the view loads the image from Google's image hosts (`yt3.ggpht.com` for avatars and banners, `i.ytimg.com` for video thumbnails) **every time the view renders**. Convenient, but it is one request per view render and it tells those hosts which note you are reading. This is a deliberate opt-in: convenience over offline.
- **Download into the vault**: Lifeline fetches each image **once, during sync**, checks that the bytes really are an image rather than an error page, and stores it in `<output folder>/thumbnails/`. The bullet then also carries `[avatar:: [[channel-<id>.jpg]]]`, `[banner:: [[channel-<id>-banner.jpg]]]`, or `[thumbnail:: [[<videoId>.jpg]]]`, and the view resolves that local file first, so nothing is requested when you open a note. Files already on disk are never fetched again, so after the first sync only new entries cost anything. Note the banners are large (often 100-300 KB each), so Download mode for a big subscription list is tens of megabytes.

A first sync with **Download into the vault** selected fetches every image, a few at a time, before it writes the notes; if your connection drops partway, Lifeline stops early, records one warning in the sync log, and writes the notes anyway. Any image that failed keeps its remote `*_url` field as a fallback, and drops to no image only if there is no URL either, so one bad thumbnail affects one bullet rather than the note.

Neither mode costs extra API quota. Video thumbnail URLs are derived from the video ID and never requested from the API. Avatar and banner URLs ride the same statistics request as the Subscribers, Videos, Views, and Country fields (the banner comes from the channel's branding settings, which that request already carries), which costs 1 unit per 50 channels per sync; it only becomes an extra cost if you had turned all four of those fields off.

## Dataview recipes

Query commands run in the order written (`FROM`, then `FLATTEN`, then `WHERE`), so flatten `file.lists` before filtering:

Every video across playlists and watch later:

```dataview
TABLE WITHOUT ID v.title AS Video, v.channel AS Channel, v.date AS Added
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
- Every run appends an entry to `sync-log.json`, including failures, so you always know the state of your backup.

## Security & privacy

- **Secrets live in your system keychain.** The OAuth client ID, client secret, and refresh token are stored with Obsidian's native `SecretStorage` API (Obsidian 1.11.4+), which uses the OS credential store (for example Windows Credential Manager or macOS Keychain). They are **never** written to `data.json`, `state.json`, or any file in your vault. Those files hold only secret names, preferences, and sync state.
- **What leaves your machine:** OAuth calls to `accounts.google.com` and `oauth2.googleapis.com`, and YouTube Data API calls to `googleapis.com/youtube/v3` using the `youtube.readonly` scope. That is all, unless you enable images.
- **Images are opt-in and off by default.** With **Channel avatars and banners** or **Video thumbnails** set to **Link to YouTube**, a view renders that image from Google's image hosts (`yt3.ggpht.com`, `i.ytimg.com`), which reveals which note you opened and your IP address to Google. Set either to **Download into the vault** and the same fetches happen once, during sync, after which nothing is requested when a note opens (the view reads the local file, and the generated script never fetches anything itself). Lifeline never sends your vault contents, note titles, or file names to Google: it only requests the images themselves.
- **No telemetry, no third-party services, no remote code.** Lifeline does exactly one thing: fetch your YouTube data and write Markdown notes.
- **Revoking access:** remove Lifeline's permission at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), and delete the stored secrets from Obsidian's secret storage if desired. On a new machine you'll need to authenticate again (the keychain is per-machine).

## Limitations

- **Desktop only.** The OAuth flow uses a loopback redirect (`127.0.0.1`), so mobile isn't supported.
- **YouTube's system "Watch Later" list is not accessible via the API.** Pick your own substitute playlist in settings; Lifeline writes it to `Watch Later.md`.
- **Quota:** the YouTube API allows about 10,000 units/day by default; a full sync costs roughly 2 units, plus 1 per tracked playlist, plus 1 per 50 subscribed channels while statistics fields or channel images are enabled, plus 1 per 50 imported playlist IDs. Lifeline counts usage and warns at a configurable soft limit. Image downloads cost no quota.
- **One Google account per vault.**
- **No scheduler:** sync runs at startup (if due) or on demand.

## Development

```bash
npm install
npm run dev      # esbuild watch mode
npm run build    # type-check + production bundle
npm run lint     # eslint (obsidianmd plugin rules)
npm run deploy   # build, then copy artifacts into <GITHUB_DIR>/Obsidian/Zettelkasten/.obsidian/plugins/lifeline (set GITHUB_DIR to your GitHub root)
```

Source layout: `src/main.ts` (lifecycle only) delegates to `auth.ts` (OAuth loopback), `youtubeApi.ts` (quota-aware client), `sync.ts` (orchestration + state diffing + opt-in thumbnail downloads), `markdown.ts` (renderers and the image fields they append), `dashboard.ts` (Dashboard.md renderer + Dataview capability check), `dashboardScript.ts` (generator for `lifeline-dashboard.js` + script-folder helpers), `noteViewsScript.ts` (generators for the three note-view scripts, `lifeline-channels.js`, `lifeline-playlists.js`, and `lifeline-watchlater.js`, plus the `lifeline-views.css` stylesheet and its styles-folder helpers), `collector.ts`/`playlistIds.ts`/`webviewCompat.ts` (saved-playlist ID collection), and `settings.ts` (settings tab). Sync state persists in `state.json` next to `data.json`; the sync log lives beside them in the plugin folder. Neither holds secrets.

Progress is tracked in [GitHub issues](https://github.com/Aaqil101/obsidian-lifeline/issues): open issues are the roadmap, closed issues are what shipped.

A convenient dev loop is the [Hot-Reload](https://github.com/pjeby/hot-reload) community plugin pointed at the plugin folder while `npm run dev` is running.

## License

[0-BSD](LICENSE)
