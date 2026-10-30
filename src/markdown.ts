/**
 * Pure note-rendering helpers: everything returns Markdown strings and takes
 * data as input. No vault access here, so sync.ts owns all file I/O.
 *
 * Output layout (vault-relative, under the configured output folder):
 *   Channels.md          - one field-list entry per subscribed channel
 *   Playlists/<name>.md  - one field-list entry per video, per tracked playlist
 *   Watch Later.md       - the designated watch-later substitute playlist
 *   Dashboard.md         - opt-in home note (static summary + DataviewJS sections)
 *
 * The sync log (sync-log.json) lives in the plugin folder, not here.
 *
 * Every entry uses Dataview inline fields with bracket syntax, which is
 * required for multiple fields on one line and is indexed per list item
 * (query via `file.lists`).
 */
import { normalizePath } from 'obsidian';
import type { ChannelsFieldSettings, ChannelFace, ImageMode, PlaylistRecord, SyncState } from './types';

export interface OutputPaths {
	folder: string;
	channels: string;
	playlistsFolder: string;
	watchLater: string;
	dashboard: string;
	/** Vault folders receiving downloaded images (download mode), one per kind. */
	thumbnails: string;
	avatars: string;
	banners: string;
}

export const DEFAULT_OUTPUT_FOLDER = '95 - Notes/YouTube';

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
 */
export function outputPaths(outputFolder: string, imagesFolder?: string | null): OutputPaths {
	const folder = cleanFolder(outputFolder) ?? DEFAULT_OUTPUT_FOLDER;
	const parent = cleanFolder(imagesFolder ?? '') ?? folder;
	return {
		folder,
		channels: joinPath(folder, 'Channels.md'),
		playlistsFolder: joinPath(folder, 'Playlists'),
		watchLater: joinPath(folder, 'Watch Later.md'),
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
	return cleanFolder(outputFolder) ?? DEFAULT_OUTPUT_FOLDER;
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
 * file base names already on disk. Both image kinds below are shaped like it,
 * which is why the renderer can hand either one to the same helper.
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
 * The channel faces a video note's bullets carry themselves: `mode` and
 * `available` follow Channel avatars and banners (not the thumbnail mode, so
 * the two stay independent), and `channels` holds the avatar per channel id
 * for the channels that are playlist owners only. Subscribing to one prunes
 * its entry at the next sync, which drops the fields again and lets the view
 * join the face from Channels.md instead.
 */
export interface FaceImages extends ImageFields {
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
 * is derived from it, so state.json carries no URLs and a moved CDN is a
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
 * note, and with the mode off nothing is appended at all.
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
): string[] {
	if (!images || images.mode === 'off') return [];
	const fields: string[] = [];
	if (url) fields.push(`[${urlField}:: ${url}]`);
	if (images.mode === 'download' && images.available.has(base)) {
		fields.push(`[${localField}:: [[${base}.jpg]]]`);
	}
	return fields;
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

export function yamlString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** One fenced dataviewjs block. */
export function dataviewBlock(code: string): string {
	return ['```dataviewjs', code.trimEnd(), '```'].join('\n');
}

/**
 * Remove the note-view blocks (the three opt-in lifeline-channels/playlists/
 * watchlater dv.view() fences) from a note's text, restoring the pre-feature
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
		lines.push(`- ${parts.join(' ')}`);
	}
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
 * output is unchanged.
 *
 * `images.faces` adds the channel's avatar the same way (`avatar_url`, plus
 * `avatar` once downloaded) but only for a channel with no row in
 * Channels.md, since a channel that has one is joined by the view from there.
 * Its own mode (Channel avatars and banners) governs it, so the thumbnail
 * mode never writes an avatar and vice versa.
 *
 * `date-added` behaves the same for `journal` as `subscribed_on` does for
 * Channels: the `date` field wikilinks that day's journal note when it
 * exists, or when the date is today or later; plain ISO text otherwise. This
 * supersedes the old unconditional `[[date]]`, so a date whose note has not
 * been journalled stops linking until it is (or until the next sync after
 * the note appears), keeping every note type under one rule.
 */
export function renderPlaylistNote(
	playlistId: string,
	title: string,
	record: PlaylistRecord,
	syncedAt: Date,
	viewBlock?: string,
	images?: BulletImages,
	journal?: JournalDates,
): string {
	const entries = Object.entries(record.videos);
	let unavailableCount = 0;
	let removedCount = 0;
	for (const [, video] of entries) {
		if (video.removed) removedCount++;
		else if (video.unavailable) unavailableCount++;
	}
	const videos = entries
		.filter(([, video]) => !video.removed && !video.unavailable)
		.sort(([, a], [, b]) => a.position - b.position);

	const lines: string[] = [
		'---',
		'type: lifeline-playlist',
		`playlist_id: ${playlistId}`,
		`url: ${yamlString(`https://www.youtube.com/playlist?list=${playlistId}`)}`,
		`title: ${yamlString(record.title)}`,
		`video_count: ${entries.length}`,
		`unavailable_count: ${unavailableCount}`,
		`removed_count: ${removedCount}`,
		`saved: ${record.saved === true}`,
		`last_synced: ${yamlString(formatDateTime(syncedAt))}`,
		'---',
		'',
		`# ${title}`,
		'',
	];
	if (viewBlock) lines.push(viewBlock, '');
	for (const [videoId, video] of videos) {
		const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
		const channelValue = video.channelId
			? `[${labelText(video.channelTitle || 'unknown channel')}](https://www.youtube.com/channel/${video.channelId})`
			: labelText(video.channelTitle || 'unknown channel');
		const parts = [`[title:: [${labelText(video.title)}](${watchUrl})]`, `[channel:: ${channelValue}]`];
		if (video.dateAdded) parts.push(`[date:: ${journalDate(video.dateAdded, journal)}]`);
		const imageParts = bulletImageFields(
			images,
			videoImageBase(video.channelTitle, video.title, videoId),
			videoThumbnailUrl(videoId),
			'thumbnail_url',
			'thumbnail',
		);
		if (imageParts.length > 0 && images?.blurred?.has(videoId)) imageParts.push('[sensitive:: true]');
		parts.push(...imageParts);
		// The channel's own face, for a channel with no Channels.md row to
		// join one from (a playlist owner you do not subscribe to). Gated on
		// Channel avatars and banners, exactly like the fields on a channel
		// bullet; nothing is written for a channel the view can join instead.
		const face = images?.faces?.channels[video.channelId];
		if (face) {
			parts.push(
				...bulletImageFields(
					images.faces,
					channelImageBase(face.title, video.channelId),
					face.avatar,
					'avatar_url',
					'avatar',
				),
			);
		}
		lines.push(`- ${parts.join(' ')}`);
	}
	lines.push('');
	return lines.join('\n');
}
