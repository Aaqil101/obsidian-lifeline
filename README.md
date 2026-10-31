# Lifeline

Back up your YouTube subscriptions, playlists, and Watch Later list into Markdown notes in your Obsidian vault. Because accounts get banned, but vaults don't.

Lifeline is a **desktop-only** Obsidian plugin that exports:

- **Channels.md**: every channel you're subscribed to, as Dataview-queryable fields
- **Playlists/\*.md**: one note per playlist you choose to track
- **Watch Later.md**: a dedicated note for the playlist you use as your watch-later substitute
- **sync-log.json** (in the plugin folder): a record of every sync run, capped at the most recent 200

All output is plain Markdown inside your vault. There are no proprietary formats and no databases. Every entry is a record you can query with Dataview.

Lifeline never downloads videos and has no telemetry.

## Why

YouTube accounts get terminated, playlists get emptied, and videos disappear without notice. Your Obsidian vault is local and under your control. Lifeline keeps a durable record of what you watched and organized, as plain text, in your vault.

## Install

Lifeline is listed in the Obsidian community catalog: [community.obsidian.md/plugins/lifeline](https://community.obsidian.md/plugins/lifeline).

### Option A: Community plugins browser (recommended)

1. Open **Settings → Community plugins** and make sure restricted mode is off.
2. Select **Browse**, search for **Lifeline**, and install it.
3. Enable **Lifeline**.

### Option B: BRAT

Use this to test a beta build before it reaches the community catalog.

1. Install [BRAT](https://github.com/TfTHacker/obsidian-brat) from the community plugins browser.
2. Open **Settings → BRAT → Add beta plugin** and enter `Aaqil101/obsidian-lifeline`.
3. Enable **Lifeline** under **Settings → Community plugins**.

### Option C: Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Aaqil101/obsidian-lifeline/releases/latest).
2. Copy them into `<YourVault>/.obsidian/plugins/lifeline/`.
3. Reload Obsidian and enable **Lifeline** under **Settings → Community plugins**.

## Google Cloud setup

Lifeline uses the YouTube Data API v3 with your own OAuth credentials, so your quota and your data stay under your control. Google calls this area the **Google Auth Platform**. Older guides call it the **OAuth consent screen** and **Credentials** pages. It is the same setup under renamed menus.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (any name, for example "Lifeline").
2. Enable the API: open the [YouTube Data API v3 library page](https://console.cloud.google.com/apis/library/youtube.googleapis.com) and select **Enable**.
3. Configure the app:
   - Open the [Google Auth Platform](https://console.cloud.google.com/auth/overview) (**APIs & Services → Google Auth Platform**).
   - Under **Branding**, fill in the app name and a support email. The other optional fields can stay blank.
   - Under **Audience**, add yourself under **Test users**. The user type is **External**.
   - **Important:** while the app is in *Testing* mode, Google **expires refresh tokens after 7 days**. To avoid re-authenticating every week, select **Publish app** under **Audience**. For personal use you can leave the app unverified. Google may show an unverified-app warning once during authorization.
4. Create the client:
   - Open the [Clients page](https://console.developers.google.com/auth/clients) and select **Create client** (or **Create OAuth client** on the OAuth overview).
   - Application type: **Desktop app**, not **Web application**.
   - Select **Create**, then copy the **Client ID** and **Client secret** from the popup right away.
   - **The client secret is shown only once.** Google stores it hashed, so later you only see its last 4 characters. If you lose it, open your client on the **Clients** page and select **Add secret** to create a replacement.

If authorization later fails with a `deleted_client` error, Google has deleted your client after six months of inactivity ([details](https://support.google.com/cloud/answer/6158849#unused-client-deletion)). Create a new client and update the stored secret.

## Connect Obsidian

1. Open **Settings → Lifeline**. The **Google account** group shows **Not connected** until you authenticate.
2. Select the chevron row **Google credentials**. Next to **OAuth client ID**, create a new secret (or select an existing one) and store the copied client ID as its value.
3. Do the same for **OAuth client secret**. Both values are kept in your system keychain through Obsidian's secret storage. They are never written to a file in your vault. `data.json` stores only the secret names and your preferences.
4. Go back to **Settings → Lifeline**, select **Authenticate with Google**, and approve read-only YouTube access. The row then reads **Connected** and the button becomes **Re-authenticate**.
5. Under **Notes**, set **Output folder** (required; sync asks you to set it if blank). Folder fields suggest matches as you type, or you can select the folder icon to browse. A path that does not exist yet is fine, because the sync creates it.
6. Under **Playlists**, optionally set **Watch later playlist**. Open **Playlists to track** to uncheck any playlists you don't want backed up. Everything is tracked by default on the first sync. Playlists you saved from other channels are included and labeled **(saved)**. The refresh icon on that page reloads the list. For playlists you saved that the API cannot list, see [Saved playlists](#saved-playlists).
7. Optionally open **Notes → Dashboard** and turn on **Dashboard note**. See [Dashboard note](#dashboard-note).
8. Select **Sync now** under **Sync**, use the ribbon icon, or run the command **Lifeline: Sync now**.

## Settings reference

The settings tab has five groups. Chevron rows open sub-pages.

| Group | Rows |
| --- | --- |
| **Google account** | Connection status and **Authenticate with Google** / **Re-authenticate**. Sub-page **Google credentials**: OAuth client ID, OAuth client secret, and a **Security notes** button. |
| **Notes** | **Output folder**, **Journal folder**, sub-page **Views in notes**, **Styles folder**, **Script folder**, sub-page **Channels.md fields**, sub-page **Dashboard**. |
| **Images** | **Channel avatars and banners**, **Video thumbnails** (each Off, Link, or Download), **Blurred thumbnails**, and **Images folder** (shown only while one of the two modes is Download). |
| **Playlists** | Sub-page **Playlists to track**, sub-page **Get saved playlist IDs**, and **Watch later playlist**. |
| **Sync** | **Sync interval (hours)** (default 20), **Quota soft limit** (default 8000), and **Sync now**. |

Each sub-page has its own rows, described below.

## Saved playlists

The API returns the playlists you *created*. It does not return playlists you *saved* from other channels, and no endpoint lists them. Lifeline collects those IDs from the YouTube page itself. There are two ways, and both feed the same box under **Playlists → Get saved playlist IDs**:

1. **Console steps (works everywhere).** The sub-page has four numbered steps for opening `youtube.com/feed/playlists`, opening DevTools, and pasting the script. Select **Select collector script** to highlight it, then press **Ctrl+C**; expand **Show the collector script** to copy it by hand. The plugin never touches the clipboard itself. The script scrolls the page to the end, skips Watch Later, Liked videos, and radio/mix links, and prints a JSON array of IDs. Paste that array into **Paste the copied array**. Plain lists and mixed text also parse. The count line shows how many IDs were found. Select **Add to tracked playlists** to save them.
2. **Web viewer (desktop only).** The **Web viewer** card has **Open in Web viewer**, which opens the playlists page in Obsidian's built-in **Web viewer** core plugin. Enable that plugin under **Settings → Core plugins** if it is off. Lifeline never enables core plugins itself. Sign in there in your own browser session, then select **Collect from tab**. Lifeline runs the same collector in that tab and adds the IDs. If Google asks for sign-in inside that tab, Lifeline stops and asks you to sign in there yourself.

Imported IDs are stored in `data.json`. They appear under **Imported IDs** on the same sub-page, and each has a trash button to stop tracking it. Lifeline never handles your Google login, and the collector never reads cookies or storage.

## What gets written

Default layout. Folder names are configurable, as noted in each comment.

```
95 - Notes/YouTube/                  # Output folder
├── Channels.md                      # one field-list entry per channel
├── Dashboard.md                     # opt-in home note (Dataview)
├── Watch Later.md                   # your watch-later substitute playlist
├── Playlists/
│   ├── Favorites.md
│   └── Watched later.md
├── thumbnails/                      # Images folder: video thumbnails, one sub-folder per playlist
│   └── Favorites/
├── avatars/                         # Images folder: channel avatars (Download mode)
└── banners/                         # Images folder: channel banners (Download mode)

98 - Organize/Scripts/               # Script folder
├── lifeline-dashboard.js            # draws Dashboard.md
├── lifeline-channels.js             # draws the Channels.md view (opt-in)
├── lifeline-playlists.js            # draws the playlist-note views (opt-in)
└── lifeline-watchlater.js           # draws the Watch Later.md view (opt-in)

98 - Organize/Styles/                # Styles folder
├── lifeline-channels.css            # read by the Channels.md view (opt-in)
├── lifeline-playlists.css           # read by the playlist-note views (opt-in)
├── lifeline-watchlater.css          # read by the Watch Later.md view (opt-in)
└── lifeline-dashboard.css           # read by Dashboard.md (opt-in)

.obsidian/plugins/lifeline/
├── data.json                        # settings and collected playlist IDs (no secrets)
├── state.json                       # sync state: channels, playlists, videos, faces
└── sync-log.json                    # the most recent 200 sync runs
```

The Images folder defaults to the output folder, so its images land in `95 - Notes/YouTube/thumbnails/`, `avatars/`, and `banners/`. Lifeline writes the scripts and stylesheets only when the features that use them are on.

### Channels.md entries

Each channel is one list item with Dataview inline fields:

```markdown
- [channel:: [Blender Guru](https://www.youtube.com/channel/UCxyz)] [id:: UCxyz] [subscribed_on:: 2024-05-06] [first_seen:: 2024-05-07] [last_seen:: 2026-10-30] [status:: active] [handle:: @blenderguru] [subscribers:: 4670000] [videos:: 1200] [views:: 109000000] [country:: NL]
```

- Each field except the channel link is a checkbox under **Notes → Channels.md fields**: Channel ID, Subscribed on, First seen & last seen, Status, Handle, Subscribers, Videos, Views, Country, Avatar, and Banner. The **Reset** icon restores the defaults.
- Subscribers, Videos, Views, and Country need one statistics request per 50 channels while any of them is on. Avatar and Banner ride the same request, so it also runs while either image field is on.
- `subscribed_on`, and the date fields below, follow the [journal rule](#journal-links).

### Playlist entries

Each video is a single list item with Dataview inline fields:

```markdown
- [title:: [Video Title](https://www.youtube.com/watch?v=abc123)] [channel:: [Blender Guru](https://www.youtube.com/channel/UCxyz)] [date:: 2026-01-05]
```

- `date` is the day the video was added to the playlist.
- Every playlist note, Watch Later included, has a `url` frontmatter field that opens the playlist on YouTube.
- `saved: true` in frontmatter means the playlist was saved from another channel. `saved: false` means you created it. The owner channel decides the label, not the import path, so a playlist collected from the same page can still read `saved: false`.
- Only watchable videos get a bullet. Private, deleted, and removed videos stay in `state.json`, so the backup keeps them. The frontmatter reports them as `unavailable_count` and `removed_count`. Both are always present, so `video_count - unavailable_count - removed_count` gives the number of bullets. A video that is both removed and unavailable counts once, under `removed`.
- Age-restricted videos are blurred automatically, and any videos you list under **Blurred thumbnails** are blurred too. A blurred video's bullet carries `[sensitive:: true]`.

### Journal links

**Journal folder** (under **Notes**, required) controls whether a bullet's date becomes a wikilink:

- A date becomes `[[YYYY-MM-DD]]` only when that day's note exists somewhere under the journal folder, or when the date is today or later.
- Otherwise the date stays plain text. A missing journal folder means every date stays plain.

Dated fields are the playlist `date` and Watch Later `date`, plus Channels.md `subscribed_on`. `first_seen` and `last_seen` are sync bookkeeping and never link. The check runs at sync time, so the next sync after a daily note appears updates the links.

## Dashboard note

**Dashboard.md** is an opt-in home note, off by default. Turn it on under **Notes → Dashboard → Dashboard note**. It needs the community [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin. Lifeline checks for Dataview and shows a notice if it's missing.

The note holds frontmatter (`type`, `last_synced`, `channel_count`, `playlist_count`, `video_count`) and up to three `dv.view()` calls. There are no headings, because the hero carries the title. Each call runs `lifeline-dashboard.js` from the **Script folder**, which queries your synced notes live and draws floating panels over your theme:

- **Header:** a hero with the title, a status badge (**Synced**, **Synced with issues**, **Sync failed**, or **Never synced**), the last sync line with counts, and KPI chips for channels, playlists, videos, and **New since sync**. The first three chips open Channels.md or scroll to the playlists panel.
  - The hero shows the top four channel banners in a mosaic by default. Under **Dashboard → Hero banner**, you can pick one channel instead, and its banner fills the hero. **Banner crop** sets which part of a wide banner stays in view. Click a point on the preview, or focus it and use the arrow keys (Shift for bigger steps, Home to recenter). Both settings apply without a sync.
  - Two panels sit under the hero, side by side: **New since last sync** lists videos added on or after the last sync date, and **Needs attention** lists playlists with hidden, unavailable, or removed entries. It shows **All clear** when there are none.
- **Playlists:** a **Table / Cards** pill toggle. Cards show the newest playlists with covers. Table lists them alphabetically, with Watch Later pinned first. Both modes stop at **Playlist cards** (default 6).
- **Top channels:** the same toggle. Cards show banner, avatar, handle, and counts. Table lists channels by subscribers. Both modes stop at **Top channels** (default 10).

Four toggles under **Notes → Dashboard** turn each panel on or off: **New since last sync card**, **Needs attention card**, **Playlists card**, and **Top channels by subscribers**. The limits are **Feed entries** (default 8, for the new-since-sync list), **Attention entries** (default 6), **Playlist cards** (default 6), and **Top channels** (default 10).

Counts are formatted like YouTube (`109M`, `4.67K`). Hover a number to see the full value.

The note and script refresh after every sync. You can also rewrite them on demand with the **Create dashboard note** command, **Refresh dashboard note**, or the refresh icon on the Dashboard sub-page. The script is regenerated each time, so hand edits to it are overwritten. Changing **Script folder** moves the script and deletes the old copy.

If Dataview is disabled later, Lifeline keeps the frontmatter and replaces the sections with a warning callout. The dashboard makes no API calls of its own.

## Views in notes

**Views in notes** is an opt-in toggle, off by default, on the **Notes → Views in notes** sub-page. When it's on, a live view draws above the entries in Channels.md, in every playlist note, and in Watch Later.md. Each note type has its own script in the **Script folder**: `lifeline-channels.js`, `lifeline-playlists.js`, and `lifeline-watchlater.js`. Turning the toggle on requires Dataview. Turning it off removes the view blocks from the notes and deletes the scripts. The bullets stay where they are.

Each note type has its own layout row on the same sub-page: **Channels layout**, **Playlists layout**, and **Watch Later layout**. Each offers Poster, Chips, or Table.

- **Poster** (default): cards.
  - Channels.md: *Ambient* cards show the channel banner as a blurred backdrop, with the avatar, name, and count chips over it.
  - Playlist notes and Watch Later.md: *Cinema* cards show a 16:9 thumbnail with the date in a corner pill, and the title and channel over a gradient. A play button appears on hover. A video with no thumbnail shows the title's first letter.
- **Chips:** one row per entry.
  - Channels.md: *Split* rows show the avatar and name on the left, and the counts and `subscribed since` date in a tinted pane on the right.
  - Video lists: *Ticket* rows show the thumbnail, a two-line title, the channel and its avatar, and the date on a tear-off stub.
- **Table:** a dense grid.
  - Channels.md: *Cover* rows show a cropped banner with the avatar over it, the handle, counts, and a Tracked column with subscribe, first seen, and last seen dates. The channel ID is shortened to a prefix, and hovering shows the full value.
  - Video lists: *Ledger* rows show thumbnail, title, channel, and date added.

Layouts are saved per note type. Poster is the default everywhere. An old **Cards** or **Mixed** choice loads as Poster.

Every view has a toolbar:

- **Search** filters entries as you type. The field box beside it sets what it searches: all fields, or a single field such as name, handle, ID, country, or status for channels, and title, channel, or date for videos. The placeholder names the field. The count sits inside the search box. It shows `10 / 76` and expands to `Showing 10 of 76 channels` on hover.
- **Layout control** (Poster, Chips, Table) switches the view immediately, with no sync. It writes the same per-note-type setting as the Notes dropdowns, so every open view of that type follows it.
- **Sort order** (under **Views in notes**) sets the order by date: **Newest first** (default) or **Oldest first**. Entries without a date go last. This setting is read at render time.
- **Refresh entries** (icon only) re-reads the note's bullets, for when you edit them by hand.
- A count such as `Showing 10 of 412 channels`, or `Found 3 of 412 channels` while searching.

Each view paints one page of entries and puts the rest behind a **Show more** button. The page holds 10 entries by default. Change it with **Items per page**, and it takes effect on the next render.

The views read the note's own list entries (`dv.current().file.lists`), so they always match the bullets beneath them. Dates that are journal links stay clickable in the views: the Cinema pill, Ticket stub, Ledger Added column, Split `subscribed since` date, and Cover rows Tracked dates all open that note.

The stylesheets, one per note type, are regenerated on every sync while the views are on. Each script reads its CSS file when it renders, so a missing file leaves that view unstyled but still working. Hand edits to the CSS are overwritten.

Zero API quota cost. Nothing is fetched when a note opens.

## Images in notes

Two opt-in image settings, under **Images**:

- **Channel avatars and banners** adds `avatar_url` and `banner_url` to each channel bullet, and `avatar` and `banner` once a file is downloaded.
- **Video thumbnails** adds `thumbnail_url` to each playlist and Watch Later bullet, and `thumbnail` once a file is downloaded.

Image fields are inline data in the bullet, not `![[...]]` embeds. The views draw the picture from them. They are written whether or not **Views in notes** is on. Both settings default to **Off**. The channel image fields can each be dropped with the **Avatar** and **Banner** checkboxes under **Channels.md fields**.

Each setting has three modes:

- **Off** (default): no image fields. The notes are byte-for-byte what Lifeline wrote before this option existed.
- **Link**: the bullet carries the remote URL, for example `[thumbnail_url:: https://i.ytimg.com/vi/abc123/mqdefault.jpg]`. The view loads it from Google's image hosts (`yt3.ggpht.com` for avatars and banners, `i.ytimg.com` for thumbnails) **every time the view renders**. That is one request per render, and it tells those hosts which note you opened.
- **Download**: Lifeline fetches each image **once, during sync**, checks the bytes are really an image (JPEG, PNG, GIF, or WebP), and saves it. The bullet then also carries a local wikilink, for example `[avatar:: [[Blender Guru_UCxyz_avatar.jpg]]]`, `[banner:: [[Blender Guru_UCxyz_banner.jpg]]]`, or `[thumbnail:: [[Some Channel_abc123_Video Title_abc123.jpg]]]`. The view prefers the local file, so nothing is requested when you open a note. Images already on disk are never fetched again. Banners are large, often 100-300 KB each.

Where Download saves files:

- Channel avatars go to `<Images folder>/avatars/`.
- Channel banners go to `<Images folder>/banners/`.
- Video thumbnails go to `<Images folder>/thumbnails/<playlist name>/`.

**Images folder** appears when either image setting is set to Download. Leave it empty to keep the files under your output folder. The folder must be inside the vault.

A first sync with Download fetches images a few at a time, before it writes the notes. If the connection drops partway, Lifeline stops downloading, logs one warning, and still writes the notes. A failed image keeps its remote `*_url` field as a fallback. It drops to no picture only when there is no URL either, so one bad image affects one bullet.

**Video thumbnails** can also be blurred per video. Under **Images → Blurred thumbnails**, paste video links or IDs separated by spaces, commas, or new lines. Each blurred thumbnail is revealed with a click. The dashboard never reveals them.

Image downloads cost no API quota. Thumbnail URLs are built from the video ID. The avatar and banner URLs come from the channel statistics call described under [Quota](#quota).

## Dataview recipes

Query commands run in the order written (`FROM`, then `FLATTEN`, then `WHERE`), so flatten `file.lists` before filtering.

Every video across playlists and Watch Later:

```dataview
TABLE WITHOUT ID v.title AS Video, v.channel AS Channel, v.date AS Added
FROM "95 - Notes/YouTube"
FLATTEN file.lists AS v
WHERE v.title
SORT v.date DESC
```

All subscriptions, with status. The `WHERE` clause uses the ID field, so **Channel ID** must stay on:

```dataview
TABLE WITHOUT ID v.channel AS Channel, v.subscribed_on AS "Subscribed on", v.first_seen AS "First seen", v.status AS Status
FROM "95 - Notes/YouTube/Channels.md"
FLATTEN file.lists AS v
WHERE v.id
```

Biggest channels, by subscribers. This needs the **Subscribers** and **Views** fields on:

```dataview
TABLE WITHOUT ID v.channel AS Channel, v.subscribers AS Subscribers, v.views AS "Total views"
FROM "95 - Notes/YouTube/Channels.md"
FLATTEN file.lists AS v
WHERE v.subscribers
SORT v.subscribers DESC
```

Watch Later only:

```dataview
LIST WITHOUT ID v.title
FROM "95 - Notes/YouTube/Watch Later.md"
FLATTEN file.lists AS v
WHERE v.title
```

Saved playlists only:

```dataview
TABLE file.frontmatter.url AS Link, file.frontmatter.video_count AS Videos
FROM "95 - Notes/YouTube/Playlists"
WHERE saved
```

## Syncing

- **Manual:** command palette → **Lifeline: Sync now**, the ribbon icon (tooltip: **Sync YouTube backup**), or **Sync now** under **Sync** in settings.
- **Automatic:** on Obsidian startup, Lifeline syncs once if the last successful sync is older than **Sync interval (hours)** (default 20). This is **not a background scheduler**, so nothing syncs while Obsidian is closed.
- **Status bar:** shows ✓, ⚠, or ✗ and the time of the last sync. Select it to open the sync log. Hover for a summary of channels, playlists, videos, quota units, and error kinds.
- **Sync log:** the **Open sync log** command and the status bar both open it. It is a read-only view of `sync-log.json`.
- Each run appends an entry, including failed runs.
- A run where one resource fails still syncs everything else. Errors are recorded per resource and shown in the sync log and as a notice.
- A run that goes over **Quota soft limit** still completes. It is marked with a warning.

## Quota

The YouTube Data API allows 10,000 units per day by default. The quota resets at midnight Pacific time. Lifeline counts units for each successful request, and each list call costs 1 unit.

A sync costs roughly:

- **Subscriptions:** 1 unit per 50 subscribed channels.
- **Created playlists:** 1 unit per 50 playlists.
- **Imported playlist IDs:** 1 unit per 50 IDs.
- **Playlist contents:** 1 unit per 50 videos in each tracked playlist (including Watch Later). A playlist of 120 videos costs 3 units.
- **Channel statistics:** 1 unit per 50 channels, but only while a Subscribers, Videos, Views, or Country field is on, or a channel image field is on. Avatar and banner URLs ride this same request.
- **Playlist-owner faces:** when a video's channel is not in your Channels.md, Lifeline fetches that channel's avatar in batches of 50, 1 unit each batch, only while **Channel avatars and banners** is on. Those avatars are stored and only the missing ones are fetched.
- **Age ratings:** 1 unit per 50 new videos, only while **Video thumbnails** is on, to detect age-restricted videos.

Image downloads cost no quota.

**Quota soft limit** (default 8000) is a warning threshold, not a hard stop. A run over it completes and reports a warning. Set a lower value to be warned earlier.

## Security & privacy

- **Secrets stay in your system keychain.** The OAuth client ID, client secret, and refresh token are stored through Obsidian's `SecretStorage` (Obsidian 1.11.4 or newer). That uses the OS credential store, such as Windows Credential Manager or macOS Keychain. They are **never** written to `data.json`, `state.json`, or any file in your vault. Those files hold only secret names, preferences, and sync state.
- **What leaves your machine:**
  - OAuth calls to `accounts.google.com` and `oauth2.googleapis.com`.
  - YouTube Data API calls to `www.googleapis.com/youtube/v3`, with the `youtube.readonly` scope.
  - Image requests to `yt3.ggpht.com` and `i.ytimg.com`, but only when an image setting is on Link or Download.
- **Images are opt-in and off by default.** With Link, a note view loads each image from Google's image hosts, which reveals the note you opened and your IP address. With Download, the same images are fetched once, during sync. After that, opening a note requests nothing, and the generated scripts never fetch anything themselves.
- **Vault contents stay local.** Lifeline never sends your vault contents, note titles, or file names to Google. It only requests the data and images named above.
- **No telemetry, no third-party services, no remote code.** Scripts and stylesheets are generated locally.
- **Revoking access:** remove Lifeline at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), and delete the stored secrets from Obsidian's secret storage if you want. The keychain is per machine, so on a new machine you authenticate again.

## Limitations

- **Desktop only.** The OAuth flow uses a loopback redirect on `127.0.0.1`, which mobile Obsidian doesn't support.
- **YouTube's system Watch Later list is not available through the API.** Pick a playlist as your substitute under **Playlists → Watch later playlist**. Lifeline writes it to `Watch Later.md`.
- **One Google account per vault.**
- **No background scheduler.** A sync runs at startup if one is due, or when you start it.

## Development

```bash
npm install
npm run dev      # esbuild watch mode
npm run build    # type-check and production bundle
npm run lint     # eslint with the obsidianmd plugin rules
npm run deploy   # build, then copy artifacts into <GITHUB_DIR>/Obsidian/Zettelkasten/.obsidian/plugins/lifeline (GITHUB_DIR is your GitHub root)
```

Source layout:

- `src/main.ts`: plugin lifecycle, commands, ribbon, status bar, and persistence.
- `src/auth.ts`: OAuth loopback flow and keychain secrets.
- `src/youtubeApi.ts`: quota-aware YouTube Data API client.
- `src/sync.ts`: sync orchestration, state diffing, vault writes, and image downloads.
- `src/syncLog.ts`: the sync log.
- `src/markdown.ts`: note renderers, image fields, journal links, and output paths.
- `src/blurredThumbnails.ts`: parsing for the blurred-thumbnail list.
- `src/dashboard.ts` and `src/dashboardScript.ts`: Dashboard.md and `lifeline-dashboard.js`.
- `src/noteViewsScript.ts`: the three note-view scripts and their stylesheets.
- `src/collector.ts`, `src/playlistIds.ts`, `src/webviewCompat.ts`: saved-playlist collection.
- `src/json.ts`: type-safe JSON helpers.
- `src/ui/syncLogModal.ts`: the sync-log viewer.
- `src/settings/`: the settings tab. `index.ts` declares the five groups. Each group and sub-page is in its own file (`notes.ts`, `viewsPage.ts`, `dashboardPage.ts`, `images.ts`, `account.ts`, `playlists.ts`, `collectPage.ts`, `syncSection.ts`, and others). `types.ts` holds the settings shape, and `ui.ts` the shared builders.

Sync state persists in `state.json`, and settings persist in `data.json`. Both live in the plugin folder, next to `sync-log.json`. None of them holds secrets.

Progress is tracked in [GitHub issues](https://github.com/Aaqil101/obsidian-lifeline/issues).

For a faster dev loop, point the [Hot-Reload](https://github.com/pjeby/hot-reload) community plugin at the plugin folder while `npm run dev` runs.

## License

Copyright (C) 2026 Aaqil101.

Lifeline is free software licensed under the [GNU General Public License v3.0 or later](LICENSE).
