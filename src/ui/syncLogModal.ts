/**
 * Read-only viewer for the sync log, which lives as sync-log.json in the
 * plugin folder. Files under .obsidian are not vault-indexed, so the log
 * cannot be opened as a note; a modal is the practical way to show it.
 *
 * Renders a summary header (today's run counts, last run, the quota window
 * YouTube counts since the last Pacific reset, the viewer's local-day total,
 * the all-time total, and when the next reset falls in the viewer's own time
 * zone) followed by today's runs, newest first. Runs from earlier local days
 * are hidden behind a toggle so the retained history can't read as today's
 * activity, and rows from earlier days carry their date. Rows with errors
 * expand in place so a failure can be inspected without leaving the vault.
 */
import { App, Modal } from 'obsidian';
import { formatDate, formatDateTime, formatTime } from '../markdown';
import { nextQuotaReset, quotaUsedSinceReset, type SyncLogEntry } from '../syncLog';

const STATUS_ICON: Record<SyncLogEntry['status'], string> = {
	ok: '✓',
	warn: '⚠',
	error: '✗',
};

export class SyncLogModal extends Modal {
	private readonly entries: SyncLogEntry[];
	private readonly quotaSoftLimit: number;

	constructor(app: App, entries: SyncLogEntry[], quotaSoftLimit: number) {
		super(app);
		this.entries = entries;
		this.quotaSoftLimit = quotaSoftLimit;
	}

	onOpen(): void {
		this.titleEl.setText('Lifeline sync log');
		this.contentEl.empty();
		this.renderSummary();
		this.renderRows();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Header: today's counts, last run, three quota totals, next reset. */
	private renderSummary(): void {
		const summary = this.contentEl.createDiv({ cls: 'lifeline-sync-log-summary' });
		const { today } = this.splitRuns();

		const headline = today.length === 1 ? '1 run today' : `${today.length} runs today`;
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `${headline} · ${this.count(today, 'ok')} ok · ${this.count(today, 'warn')} warn · ${this.count(today, 'error')} error`,
		});

		const last = this.entries[0];
		if (last) {
			summary.createDiv({
				cls: 'lifeline-sync-log-summary-line',
				text: `Last run ${STATUS_ICON[last.status]} ${formatDateTime(new Date(last.startedAt))}`,
			});
		}

		// Primary figure: the window YouTube counts against its daily limit,
		// with the user's daily budget (quotaSoftLimit) beside it. The local
		// day can be far off that window (it rolls over at the viewer's
		// midnight instead of Pacific midnight), so it is a secondary line.
		const sinceReset = quotaUsedSinceReset(this.entries);
		const budget = this.quotaSoftLimit > 0 ? ` · soft limit ${this.quotaSoftLimit}` : '';
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `Quota since last reset: ${sinceReset} units${budget}`,
		});

		const todayQuota = today.reduce((total, entry) => total + entry.quotaUnits, 0);
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `Quota today (since your midnight): ${todayQuota} units`,
		});

		// All time covers every run still kept in sync-log.json (newest 200).
		const allQuota = this.entries.reduce((total, entry) => total + entry.quotaUnits, 0);
		const runs = this.entries.length === 1 ? '1 run' : `${this.entries.length} runs`;
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `All time: ${allQuota} units across ${runs}`,
		});

		// YouTube's counter clears at Pacific midnight, which is midday in
		// UTC+5:30; this line names that instant in the viewer's local clock.
		const reset = nextQuotaReset();
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `Next reset: ${formatDate(reset)} ${formatTime(reset)} your time`,
		});
	}

	/**
	 * Today's runs are the main list; runs from earlier local days hide
	 * behind a toggle so history can't read as current activity.
	 */
	private renderRows(): void {
		const { today, earlier } = this.splitRuns();
		const list = this.contentEl.createDiv({ cls: 'lifeline-sync-log-list' });
		for (const entry of today) list.appendChild(this.renderRow(entry));
		if (today.length === 0) {
			list.createDiv({ cls: 'lifeline-sync-log-empty', text: 'No runs today yet.' });
		}
		if (earlier.length === 0) return;

		const older = earlier.length === 1 ? '1 earlier run' : `${earlier.length} earlier runs`;
		const toggle = this.contentEl.createEl('button', {
			cls: 'lifeline-sync-log-earlier',
			text: `Show ${older}`,
		});
		const hidden = this.contentEl.createDiv({ cls: 'lifeline-sync-log-list is-collapsed' });
		for (const entry of earlier) hidden.appendChild(this.renderRow(entry));
		toggle.addEventListener('click', () => {
			const collapsed = hidden.classList.toggle('is-collapsed');
			toggle.setText(collapsed ? `Show ${older}` : 'Hide earlier runs');
		});
	}

	private renderRow(entry: SyncLogEntry): HTMLElement {
		const row = createDiv();
		row.className = `lifeline-sync-log-row lifeline-status-${entry.status}`;

		const head = row.createDiv({ cls: 'lifeline-sync-log-row-head' });
		head.createSpan({ cls: 'lifeline-sync-log-icon', text: STATUS_ICON[entry.status] });
		head.createSpan({ cls: 'lifeline-sync-log-time', text: this.rowLabel(entry) });
		head.createSpan({
			cls: 'lifeline-sync-log-counts',
			text: `${entry.channelsSynced} ch · ${entry.playlistsSynced} pl · ${entry.videosFound} videos`,
		});
		// Absent while no download mode was on. A 0 is the interesting case:
		// it means every wanted image was already on disk, so the skip
		// behaviour is visible without opening the vault.
		if (entry.imagesDownloaded !== undefined) {
			head.createSpan({
				cls: 'lifeline-sync-log-counts',
				text:
					entry.imagesDownloaded === 0
						? '0 images downloaded (all on disk)'
						: `${entry.imagesDownloaded} images downloaded`,
			});
		}
		head.createSpan({ cls: 'lifeline-sync-log-quota', text: `${entry.quotaUnits} units` });
		if (entry.quotaSoftWarn) {
			head.createSpan({ cls: 'lifeline-sync-log-flag', text: 'soft limit' });
		}

		if (entry.errors.length > 0) {
			const badge = head.createSpan({
				cls: 'lifeline-sync-log-flag lifeline-log-expand',
				text: `${entry.errors.length} error${entry.errors.length === 1 ? '' : 's'}`,
			});
			const details = row.createDiv({ cls: 'lifeline-sync-log-errors is-collapsed' });
			for (const error of entry.errors) {
				details.createDiv({
					cls: 'lifeline-sync-log-error',
					text: `[${error.kind}] ${error.resource}: ${error.message}`,
				});
			}
			badge.addEventListener('click', () => details.classList.toggle('is-collapsed'));
		}

		return row;
	}

	/**
	 * Row timestamp: today's runs keep the short HH:mm time; older runs get
	 * their date prefixed so a multi-day history can't read as one day.
	 */
	private rowLabel(entry: SyncLogEntry): string {
		const started = new Date(entry.startedAt);
		const time = formatTime(started);
		const day = formatDate(started);
		return day === formatDate(new Date()) ? time : `${day} ${time}`;
	}

	/**
	 * Runs partitioned by the local calendar day: `today` is the main list,
	 * `earlier` is the retained history kept behind the toggle.
	 */
	private splitRuns(): { today: SyncLogEntry[]; earlier: SyncLogEntry[] } {
		const todayKey = formatDate(new Date());
		const today: SyncLogEntry[] = [];
		const earlier: SyncLogEntry[] = [];
		for (const entry of this.entries) {
			const key = formatDate(new Date(entry.startedAt));
			(key === todayKey ? today : earlier).push(entry);
		}
		return { today, earlier };
	}

	private count(entries: readonly SyncLogEntry[], status: SyncLogEntry['status']): number {
		return entries.filter((entry) => entry.status === status).length;
	}
}
