/**
 * Pure note-rendering helpers: everything returns Markdown strings and takes
 * data as input. No vault access here, so sync.ts owns all file I/O.
 *
 * Output layout (vault-relative, under the configured output folder):
 *   Channels.md          - one field-list entry per subscribed channel
 *   Playlists/<name>.md  - one field-list entry per video, per tracked playlist
 *   Watch Later.md       - the designated watch-later substitute playlist
 *   Liked Videos.md      - opt-in backup of the thumbs-up list (system LL)
 *   Liked Music.md       - opt-in backup of YouTube Music's liked songs (LM)
 *   Dashboard.md         - opt-in home note (static summary + DataviewJS sections)
 *
 * The sync log (sync-log.json) lives in the plugin folder, not here.
 *
 * Every entry uses Dataview inline fields with bracket syntax, which is
 * required for multiple fields on one line and is indexed per list item
 * (query via `file.lists`).
 */
import { normalizePath } from 'obsidian';
import type { ChannelsFieldSettings, ChannelFace, ImageMode, PlaylistRecord, RemovedVideosMode, SyncState, VideoFieldSettings, VideoRecord } from './types';

export interface OutputPaths {
	folder: string;
	channels: string;
	playlistsFolder: string;
	watchLater: string;
	/** Opt-in system-list notes, routed by id rather than by file name. */
	likedVideos: string;
	likedMusic: string;
	dashboard: string;
	/** Vault folders receiving downloaded images (download mode), one per kind. */
	thumbnails: string;
	avatars: string;
	banners: string;
}

/** How a root-level folder is stored: a slash, distinct from '' meaning unset. */
const VAULT_ROOT = '/';

/**
 * Trim a folder the user entered. Returns null when nothing was entered (so a
 * caller can fall back to a default) and '' when the vault root was picked
 * deliberately, which is the only way to tell those two apart.
 */
function cleanFolder(path: string): string | null {
	const trimmed = path.trim();
	if (!trimmed) return null;
	const stripped = trimmed.replace(/^\/+|\/+$/g, '');
	return stripped ? normalizePath(stripped) : '';
}

/** Join a folder with a child name, so a root-level folder yields no leading slash. */
function joinPath(base: string, name: string): string {
	return base ? `${base}/${name}` : name;
}

/**
 * Where the notes go. `imagesFolder` is the parent folder chosen for
 * downloaded images: empty means "keep them beside the notes", and files
 * always land in its `thumbnails/`, `avatars/` or `banners/` sub-folder.
 * A blank `outputFolder` resolves to the root here, but sync refuses to run
 * until it is set, so nothing is ever written there by accident.
 */
export function outputPaths(outputFolder: string, imagesFolder?: string | null): OutputPaths {
	const folder = cleanFolder(outputFolder) ?? '';
	const parent = cleanFolder(imagesFolder ?? '') ?? folder;
	return {
		folder,
		channels: joinPath(folder, 'Channels.md'),
		playlistsFolder: joinPath(folder, 'Playlists'),
		watchLater: joinPath(folder, 'Watch Later.md'),
		likedVideos: joinPath(folder, 'Liked Videos.md'),
		likedMusic: joinPath(folder, 'Liked Music.md'),
		dashboard: joinPath(folder, 'Dashboard.md'),
		thumbnails: joinPath(parent, 'thumbnails'),
		avatars: joinPath(parent, 'avatars'),
		banners: joinPath(parent, 'banners'),
	};
}

/**
 * The folder downloaded images sit in, shown in the settings picker when
 * `imagesFolder` is empty so the row never looks unset.
 */
export function imagesParentFolder(outputFolder: string, imagesFolder?: string | null): string {
	const custom = cleanFolder(imagesFolder ?? '');
	// A non-null result means the row was set; '' there means the vault root.
	if (custom !== null) return custom || VAULT_ROOT;
	return cleanFolder(outputFolder) ?? '';
}

/** Canonical stored form of a folder a user typed: '' when the box is blank,
 *  '/' when they deliberately mean the vault root (so blank stays "unset" and
 *  the root stays selectable). */
export function normalizeFolder(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return '';
	return cleanFolder(trimmed) ?? VAULT_ROOT;
}

/**
 * What one `bulletImageFields` call needs: the mode the fields follow and the
 * file base names already on disk. Downloaded channel images and video
 * thumbnails are both shaped like it, so the renderer hands either one to the
 * same helper.
 */
export interface ImageFields {
	mode: ImageMode;
	available: ReadonlySet<string>;
}

/**
 * Image data for one note, handed in by sync.ts (which owns the vault reads).
 * `available` holds the file base names already present in the thumbnails
 * folder, so a bullet names the local copy only when it actually exists.
 */
export interface BulletImages extends ImageFields {
	/** Video ids whose thumbnail the views draw blurred (age-restricted or set by the user). */
	blurred?: ReadonlySet<string>;
	/** Channel avatars for bullets whose channel has no Channels.md row to join a face from. */
	faces?: FaceImages;
}

/**
 * The channel faces a video note's bullets carry themselves: `mode` follows
 * Channel avatars and banners (not the thumbnail mode, so the two stay
 * independent), and `channels` holds the avatar per channel id for the
 * channels that are playlist owners only. Those channels are not subscribed,
 * so nothing is downloaded for them: the bullet carries `avatar_url` only and
 * the view reads it online. Subscribing to one prunes its entry at the next
 * sync, which drops the field again and lets the view join the face from
 * Channels.md instead.
 */
export interface FaceImages {
	mode: ImageMode;
	channels: Record<string, ChannelFace>;
}

/**
 * One title as a file-name part. `#`, `^`, `[` and `]` are stripped on top of
 * the usual filesystem characters, because they would break the `[[...]]`
 * wikilink that points at the downloaded file.
 */
function imageNamePart(title: string, fallback: string): string {
	return sanitizeFileName(title.replace(/[#^[\]]/g, ' '), fallback);
}

/**
 * Base name (no extension) of a downloaded channel avatar: `{channel}_{id}_avatar`.
 * The channel id keeps it unique, as for video thumbnails.
 */
export function channelImageBase(channelTitle: string, channelId: string): string {
	return `${imageNamePart(channelTitle, channelId)}_${channelId}_avatar`;
}

/** Base name (no extension) of a downloaded channel banner: `{channel}_{id}_banner`. */
export function channelBannerImageBase(channelTitle: string, channelId: string): string {
	return `${imageNamePart(channelTitle, channelId)}_${channelId}_banner`;
}

/**
 * Base name (no extension) of a downloaded video thumbnail: `{channel}_{video}_{id}`.
 * The id keeps it unique: titles can differ only by case, which Windows treats
 * as the same file name.
 */
export function videoImageBase(channelTitle: string, videoTitle: string, videoId: string): string {
	return `${imageNamePart(channelTitle, 'unknown channel')}_${imageNamePart(videoTitle, videoId)}_${videoId}`;
}

/**
 * Remote thumbnail for a video. Never persisted: state stores the id and this
 * is derived from it, so the state files carry no URLs and a moved CDN is a
 * one-line change rather than a data migration.
 */
export function videoThumbnailUrl(videoId: string): string {
	return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * Text for a Markdown link label, or for a plain inline-field value.
 *
 * Square brackets are structural in both roles: they close the link and they
 * close the Dataview field around it, so a title like "The ENTIRE History of
 * ROME [No AI]" would write `[title:: [The ENTIRE History of ROME [No AI]](url)]`
 * and break the parsing on both ends. The brackets are rewritten as
 * parentheses instead: "The ENTIRE History of ROME (No AI)". Every other
 * character is passed through untouched, so titles without brackets render
 * exactly as before.
 */
function labelText(text: string): string {
	return text.replace(/\[/g, '(').replace(/\]/g, ')');
}

/**
 * The image fields appended to one bullet, or [] when there is none.
 *
 * Two fields, deliberately: the `*_url` field always carries the remote link
 * when one exists (in both modes), so queries and the view's fallback work
 * the same either way; the local field (`thumbnail`/`avatar`/`banner`) is
 * written only in download mode and only while the file is really on disk,
 * holding the wikilink of the downloaded image, which the view prefers. A
 * failed download therefore degrades to the remote field rather than the
 * note, and with the mode off nothing is appended at all. `allowLocal` is
 * false for a removed video: its downloaded copy is deleted, so even a disk
 * hit from a stale set must not creep back into the bullet.
 *
 * Fields only, never embeds: the image is data in the bullet, and the view
 * above it is what draws the picture.
 */
function bulletImageFields(
	images: ImageFields | undefined,
	base: string,
	url: string | undefined,
	urlField: 'avatar_url' | 'thumbnail_url' | 'banner_url',
	localField: 'avatar' | 'thumbnail' | 'banner',
	allowLocal = true,
): string[] {
	if (!images || images.mode === 'off') return [];
	const fields: string[] = [];
	if (url) fields.push(`[${urlField}:: ${url}]`);
	if (allowLocal && images.mode === 'download' && images.available.has(base)) {
		fields.push(`[${localField}:: [[${base}.jpg]]]`);
	}
	return fields;
}

/**
 * Whether one playlist bullet may name a downloaded thumbnail file.
 *
 * Removed and unavailable entries never do: sync deletes their file, and the
 * bullet keeps the remote `thumbnail_url`. While Identify Shorts is on, a
 * Short never does either: its `mqdefault.jpg` is a landscape frame cut from a
 * vertical video, and every layout crops it, so the download is dead weight
 * and the bullet carries the online URL only.
 *
 * The renderer and the download pass share this one rule, so a bullet never
 * names a file sync skipped, and sync never keeps a file no bullet draws. A
 * video the classifier has not placed (`short` absent) counts as a regular
 * video, so it may be downloaded once before a later run identifies it.
 */
export function allowsLocalThumbnail(video: VideoRecord, shortsOn: boolean): boolean {
	return !video.removed && !video.unavailable && !(shortsOn && video.short === true);
}

/**
 * Journal-folder context, handed in by sync.ts (which owns the vault reads).
 * `names` holds the base names of the notes sitting in the configured journal
 * folder; `today` is the sync day, YYYY-MM-DD, so a date on or after it links
 * even though that daily note does not exist yet.
 */
export interface JournalDates {
	names: ReadonlySet<string>;
	today: string;
}

/**
 * One datable bullet field: a `[[YYYY-MM-DD]]` wikilink when the day's note
 * exists in the journal folder, or when the date is today or later (the daily
 * note will exist when it comes around, and Obsidian resolves the link then).
 * Plain ISO text otherwise, and always plain with no journal configured, so a
 * date never dangles as a link without something to open. Both inputs are
 * YYYY-MM-DD, so ordering compares as strings.
 */
export function journalDate(value: string, journal: JournalDates | undefined): string {
	if (!journal) return value;
	if (value >= journal.today || journal.names.has(value)) return `[[${value}]]`;
	return value;
}

/** Filesystem-safe note name (kept to 120 characters). */
export function sanitizeFileName(title: string, fallback: string): string {
	const cleaned = title
		.replace(/[\\/:*?"<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/g, '')
		.slice(0, 120);
	return cleaned || fallback;
}

export function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

export function formatDate(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatTime(date: Date): string {
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDateTime(date: Date): string {
	return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * Long notes are split into independent Markdown lists every N bullets.
 * Obsidian renders a list as one block in a single shot and keeps it in the
 * DOM, so one 5,000-bullet list is slow to open and scroll; several smaller
 * lists can be unloaded and reloaded as the reader scrolls. `0` disables the
 * split and keeps the single-list output.
 */
export const DEFAULT_NOTE_CHUNK_SIZE = 200;
export const MIN_NOTE_CHUNK_SIZE = 25;
export const MAX_NOTE_CHUNK_SIZE = 1000;

/** Clamp a stored or typed chunk size: 0 (or less) means off, otherwise the
 *  usable range, with anything non-numeric falling back to the default. */
export function normalizeNoteChunkSize(value: unknown): number {
	const raw = typeof value === 'string' ? value.trim() : value;
	if (raw == null || raw === '') return DEFAULT_NOTE_CHUNK_SIZE;
	const n = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(n)) return DEFAULT_NOTE_CHUNK_SIZE;
	if (n <= 0) return 0;
	return Math.min(MAX_NOTE_CHUNK_SIZE, Math.max(MIN_NOTE_CHUNK_SIZE, Math.floor(n)));
}

/**
 * Bullet lines for one note, split into independent lists every `chunkSize`
 * items. Changing the unordered-list marker starts a new list in CommonMark
 * without a blank line or a visible separator, so the note still renders as
 * one continuous list while the reading view gets separate blocks.
 */
const BULLET_MARKERS = ['-', '*', '+'];

function bulletLines(texts: string[], chunkSize: number): string[] {
	const size = chunkSize > 0 ? Math.floor(chunkSize) : 0;
	return texts.map((text, index) => {
		const chunk = size > 0 ? Math.floor(index / size) : 0;
		return `${BULLET_MARKERS[chunk % BULLET_MARKERS.length]} ${text}`;
	});
}

export function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** One fenced dataviewjs block. */
export function dataviewBlock(code: string): string {
	return ['```dataviewjs', code.trimEnd(), '```'].join('\n');
}

/**
 * Remove the note-view blocks (the five opt-in lifeline-channels/playlists/
 * watchlater/liked/liked-music dv.view() fences) from a note's text, restoring the pre-feature
 * bytes. Each block is exactly three lines plus the blank line `renderNote`
 * pushes after it, so the match takes that trailing blank line too. The
 * dashboard's own dataviewjs blocks name a different view and are untouched.
 */
export function stripNoteViewBlocks(content: string): string {
	return content.replace(
		/```dataviewjs\r?\n[^\r\n]*dv\.view\("[^"\r\n]*lifeline-(?:channels|playlists|watchlater)"[^\r\n]*\r?\n```\r?\n(?:\r?\n)?/g,
		'',
	);
}

/** One `dv.view()` call into a generated script, with baked options. */
export function viewCall(viewName: string, options: Record<string, string | boolean | null | object>): string {
	return `dv.view(${JSON.stringify(viewName)}, ${JSON.stringify(options)});`;
}

/**
 * Subscriptions as a Dataview-queryable list, one bullet per channel. Each
 * optional field is included only when its settings toggle is on and the data
 * exists, so the note degrades to just the channel link when everything is off.
 *
 * When `viewBlock` is provided (opt-in DataviewJS views), it renders
 * directly under the H1, above the bullets. The bullets always stay: the
 * view is additive so `file.lists` queries are unaffected.
 *
 * When `images` is provided (and its mode is not `off`), each bullet ends
 * with that channel's images as fields: `avatar_url`, plus `avatar` when the
 * local file exists, and `banner_url`/`banner` the same pair for the
 * channel banner. Each pair is also gated on its own `fields` toggle, so the
 * checkbox can drop one without the other. Omitted or `off`, the output is
 * unchanged.
 *
 * When `journal` is provided, `subscribed_on` wikilinks that day's journal
 * note when it exists (or when the date is today or later) and prints plain
 * otherwise; `first_seen` and `last_seen` are sync bookkeeping and always
 * stay plain. Omitted, `subscribed_on` is plain ISO text.
 */
export function renderChannelsNote(
	state: SyncState,
	syncedAt: Date,
	fields: ChannelsFieldSettings,
	viewBlock?: string,
	images?: BulletImages,
	journal?: JournalDates,
	chunkSize?: number,
): string {
	const entries = Object.entries(state.channels).sort(([, a], [, b]) => a.title.localeCompare(b.title));
	const lines: string[] = [
		'---',
		'type: lifeline-channels',
		`channel_count: ${entries.length}`,
		`last_synced: ${yamlString(formatDateTime(syncedAt))}`,
		'---',
		'',
		'# YouTube subscriptions',
		'',
	];
	if (viewBlock) lines.push(viewBlock, '');
	const bullets: string[] = [];
	for (const [id, channel] of entries) {
		const parts = [`[channel:: [${labelText(channel.title)}](${channel.url})]`];
		if (fields.channelId) parts.push(`[id:: ${id}]`);
		if (fields.subscribedOn && channel.subscribedOn) {
			parts.push(`[subscribed_on:: ${journalDate(channel.subscribedOn, journal)}]`);
		}
		if (fields.syncDates) {
			parts.push(`[first_seen:: ${channel.firstSeen}]`, `[last_seen:: ${channel.lastSeen}]`);
		}
		if (fields.status) {
			parts.push(`[status:: ${channel.subscribed ? 'subscribed' : 'no longer subscribed'}]`);
		}
		if (fields.handle && channel.handle) parts.push(`[handle:: ${channel.handle}]`);
		if (fields.subscribers && typeof channel.subscribers === 'number') {
			parts.push(`[subscribers:: ${channel.subscribers}]`);
		}
		if (fields.videos && typeof channel.videoCount === 'number') parts.push(`[videos:: ${channel.videoCount}]`);
		if (fields.views && typeof channel.viewCount === 'number') parts.push(`[views:: ${channel.viewCount}]`);
		if (fields.country && channel.country) parts.push(`[country:: ${channel.country}]`);
		// Image fields ride their own checkboxes too: a mode that is on still
		// writes nothing when the row is off, so avatars and banners can be
		// picked apart instead of being all-or-nothing.
		if (fields.avatar) {
			parts.push(
				...bulletImageFields(images, channelImageBase(channel.title, id), channel.avatar, 'avatar_url', 'avatar'),
			);
		}
		if (fields.banner) {
			parts.push(
				...bulletImageFields(
					images,
					channelBannerImageBase(channel.title, id),
					channel.banner,
					'banner_url',
					'banner',
				),
			);
		}
		bullets.push(parts.join(' '));
	}
	lines.push(...bulletLines(bullets, chunkSize ?? 0));
	lines.push('');
	return lines.join('\n');
}

/**
 * One note per playlist. The frontmatter carries a `url` that opens the
 * playlist on YouTube (Watch Later included). Each video is a single list
 * item so Dataview sees one record per video: title and channel as plain
 * Markdown links, and the date-added as a `[[YYYY-MM-DD]]` link when the
 * journal rule allows it (see the `journal` param below).
 *
 * Only watchable videos get a bullet: entries flagged unavailable (private
 * or deleted) or removed from the playlist upstream are skipped. They stay
 * in state as part of the backup, and the frontmatter reports them as
 * `unavailable_count` and `removed_count` (always present, never null), so
 * `video_count - unavailable_count - removed_count` is the bullet count and
 * Dataview can still find the playlists that lost entries.
 *
 * The two counts are disjoint: a video that is both removed and unavailable
 * counts once, under `removed`, so they always add up to the hidden total.
 *
 * When `viewBlock` is provided (opt-in DataviewJS views), it renders
 * directly under the H1, above the bullets. The bullets always stay: the
 * view is additive so `file.lists` queries are unaffected.
 *
 * When `images` is provided (and its mode is not `off`), each bullet ends
 * with that video's thumbnail as fields (`thumbnail_url`, plus `thumbnail`
 * when the local file exists). A blurred video also gets `[sensitive:: true]`,
 * which the views read to draw its picture blurred. Omitted or `off`, the
 * output is unchanged. A removed video, and a Short while Identify Shorts is
 * on, get `thumbnail_url` only (see `allowsLocalThumbnail()`).
 *
 * `images.faces` adds the channel's avatar as `avatar_url` only, for a channel
 * with no row in Channels.md (a playlist owner you are not subscribed to),
 * since a channel that has one is joined by the view from there. Those
 * channels are never downloaded: the view reads the URL. Its own mode (Channel
 * avatars and banners) governs the field, so the thumbnail mode never writes
 * an avatar and vice versa.
 *
 * `date-added` behaves the same for `journal` as `subscribed_on` does for
 * Channels: the `date` field wikilinks that day's journal note when it
 * exists, or when the date is today or later; plain ISO text otherwise. This
 * supersedes the old unconditional `[[date]]`, so a date whose note has not
 * been journalled stops linking until it is (or until the next sync after
 * the note appears), keeping every note type under one rule.
 *
 * `options.shorts` is the Identify Shorts gate: while true, a video with a
 * known duration gets `[duration:: N]` (whole seconds, so Dataview sorts it as
 * a number) and, when it is a Short, `[short:: true]`. A Short also stops
 * naming its downloaded `thumbnail` while this gate is on, because every
 * layout crops its landscape frame (see `allowsLocalThumbnail()`). Off (or
 * omitted) writes neither field and lets the download pass treat the video as
 * an ordinary one, which is the byte-identical path.
 *
 * `options.fields` is the separate video-fields checklist: `published` writes
 * the upload date as bare ISO text (never a journal link, since an upload date
 * is virtually always in the past), `blocked` writes `[blocked:: true]` only
 * when the restriction means effectively global, and `live` writes
 * `[live:: true]` or `[upcoming:: true]` for the matching liveBroadcastContent.
 * A missing toggle or missing fact writes nothing, and all three default off.
 *
 * `options.removedMode` decides what happens to videos that left the playlist:
 * `count` (the default when omitted) hides them as before, while `keep`
 * appends them after the live videos with `[removed:: true]` and, when the
 * first-missing date is known, `[removed_on:: ...]`. That date follows the
 * same journal rule as `date`, so the field itself links the day's note when
 * one exists. The frontmatter records the resolved mode in `removed_mode`.
 *
 * `options.archivedCount` is the number of entries for this playlist parked in
 * `state/purged.json`. They are never drawn, but they are added to
 * `video_count` and `removed_count`, so purging a bullet does not change the
 * frontmatter. Clearing the archive drops them from both counts.
 */
export interface PlaylistNoteOptions {
	shorts?: boolean;
	fields?: VideoFieldSettings;
	removedMode?: RemovedVideosMode;
	/** Frontmatter type. Defaults to lifeline-playlist, so ordinary playlist
	 *  output stays byte-identical; the two liked notes write lifeline-liked
	 *  so the Dashboard's playlist type guard skips them. */
	noteType?: 'lifeline-playlist' | 'lifeline-liked';
	/** Entries in state/purged.json for this playlist: never drawn, but still
	 *  counted in `video_count` and `removed_count` until the archive is wiped. */
	archivedCount?: number;
	/** Split the bullet list every N items so Obsidian can render long notes
	 *  in blocks. Omitted or 0 keeps the single-list output. */
	chunkSize?: number;
}

export function renderPlaylistNote(
	playlistId: string,
	title: string,
	record: PlaylistRecord,
	syncedAt: Date,
	viewBlock?: string,
	images?: BulletImages,
	journal?: JournalDates,
	options?: PlaylistNoteOptions,
): string {
	const removedMode: RemovedVideosMode = options?.removedMode === 'keep' ? 'keep' : 'count';
	// Archived entries live in state/purged.json and are never drawn, but the
	// note still reports them until the archive is cleared.
	const archivedCount = Math.max(0, Math.floor(options?.archivedCount ?? 0));
	const entries = Object.entries(record.videos);
	let unavailableCount = 0;
	let removedCount = 0;
	for (const [, video] of entries) {
		if (video.removed) removedCount++;
		else if (video.unavailable) unavailableCount++;
	}
	const ordered = entries.sort(([, a], [, b]) => a.position - b.position);
	const live = ordered.filter(([, video]) => !video.removed && !video.unavailable);
	// Removed bullets only in Keep mode, and never for a video that is also
	// unavailable: that one stays count-only in both modes.
	const removed =
		removedMode === 'keep' ? ordered.filter(([, video]) => video.removed && !video.unavailable) : [];

	const lines: string[] = [
		'---',
		`type: ${options?.noteType === 'lifeline-liked' ? 'lifeline-liked' : 'lifeline-playlist'}`,
		`playlist_id: ${playlistId}`,
		`url: ${yamlString(`https://www.youtube.com/playlist?list=${playlistId}`)}`,
		`title: ${yamlString(record.title)}`,
		`video_count: ${entries.length + archivedCount}`,
		`unavailable_count: ${unavailableCount}`,
		`removed_count: ${removedCount + archivedCount}`,
		`removed_mode: ${removedMode}`,
		`saved: ${record.saved === true}`,
		`last_synced: ${yamlString(formatDateTime(syncedAt))}`,
		'---',
		'',
		`# ${title}`,
		'',
	];
	if (viewBlock) lines.push(viewBlock, '');
	const bullet = (videoId: string, video: PlaylistRecord['videos'][string]): string => {
		const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
		const channelValue = video.channelId
			? `[${labelText(video.channelTitle || 'unknown channel')}](https://www.youtube.com/channel/${video.channelId})`
			: labelText(video.channelTitle || 'unknown channel');
		const parts = [`[title:: [${labelText(video.title)}](${watchUrl})]`, `[channel:: ${channelValue}]`];
		if (video.dateAdded) parts.push(`[date:: ${journalDate(video.dateAdded, journal)}]`);
		// Removed bullets keep every other field a live one carries, and add
		// the removal marker. `removed_on` follows the journal rule, so it can
		// open that day's note.
		if (video.removed) {
			parts.push('[removed:: true]');
			if (video.removedOn) parts.push(`[removed_on:: ${journalDate(video.removedOn, journal)}]`);
		}
		// Upload date and playability facts, each independent and each behind its
		// own toggle. `published` is plain ISO text by design: an upload date is
		// almost always in the past with no journal note, so linking it would
		// only add a vault lookup and a surprise. `blocked` and the two live
		// flags are written only when true, so the field itself is the signal.
		if (options?.fields?.published && video.published) parts.push(`[published:: ${video.published}]`);
		if (options?.fields?.blocked && video.blocked === true) parts.push('[blocked:: true]');
		if (options?.fields?.live) {
			if (video.live === true) parts.push('[live:: true]');
			if (video.upcoming === true) parts.push('[upcoming:: true]');
		}
		// Shorts fields, written only while Identify Shorts is anything but Off.
		// Duration stays absent for a live or upcoming video (P0D), and a video
		// the classifier could not place carries no `short` field at all rather
		// than a guess.
		if (options?.shorts) {
			if (typeof video.durationSeconds === 'number') parts.push(`[duration:: ${video.durationSeconds}]`);
			if (video.short === true) parts.push('[short:: true]');
		}
		const imageParts = bulletImageFields(
			images,
			videoImageBase(video.channelTitle, video.title, videoId),
			videoThumbnailUrl(videoId),
			'thumbnail_url',
			'thumbnail',
			allowsLocalThumbnail(video, options?.shorts === true),
		);
		if (imageParts.length > 0 && images?.blurred?.has(videoId)) imageParts.push('[sensitive:: true]');
		parts.push(...imageParts);
		// The channel's own face, for a channel with no Channels.md row to
		// join one from (a playlist owner you do not subscribe to). Gated on
		// Channel avatars and banners, exactly like the fields on a channel
		// bullet; nothing is written for a channel the view can join instead.
		// That channel is not subscribed, so its face is never downloaded: the
		// field always carries the online URL and the view reads it from there.
		const faces = images?.faces;
		const face = faces?.channels[video.channelId];
		if (faces && faces.mode !== 'off' && face?.avatar) {
			parts.push(`[avatar_url:: ${face.avatar}]`);
		}
		return parts.join(' ');
	};
	lines.push(
		...bulletLines(
			[...live, ...removed].map(([videoId, video]) => bullet(videoId, video)),
			options?.chunkSize ?? 0,
		),
	);
	lines.push('');
	return lines.join('\n');
}
