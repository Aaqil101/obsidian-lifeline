/**
 * Read-only viewer for the sync log, which lives as sync-log.json in the
 * plugin folder. Files under .obsidian are not vault-indexed, so the log
 * cannot be opened as a note; a modal is the practical way to show it.
 *
 * Renders a summary header (run counts, quota used today) followed by one
 * row per run, newest first. Rows with errors are expandable so a failure
 * can be inspected without leaving the vault.
 */
import { App, Modal } from 'obsidian';
import { formatDateTime, formatTime } from '../markdown';
import { quotaUsedToday, type SyncLogEntry } from '../syncLog';

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

	/** Header: total runs, last-run status/time, and quota used today. */
	private renderSummary(): void {
		const summary = this.contentEl.createDiv({ cls: 'lifeline-sync-log-summary' });
		const ok = this.count('ok');
		const warn = this.count('warn');
		const error = this.count('error');

		const headline = this.entries.length === 1 ? '1 run' : `${this.entries.length} runs`;
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `${headline} · ${ok} ok · ${warn} warn · ${error} error`,
		});

		const last = this.entries[0];
		if (last) {
			summary.createDiv({
				cls: 'lifeline-sync-log-summary-line',
				text: `Last run ${STATUS_ICON[last.status]} ${formatDateTime(new Date(last.startedAt))}`,
			});
		}

		const quota = quotaUsedToday(this.entries);
		const limit = this.quotaSoftLimit > 0 ? ` · soft limit ${this.quotaSoftLimit}` : '';
		summary.createDiv({
			cls: 'lifeline-sync-log-summary-line',
			text: `Quota used today: ${quota} units${limit}`,
		});
	}

	/** One row per run, newest first; error rows expand on select. */
	private renderRows(): void {
		const list = this.contentEl.createDiv({ cls: 'lifeline-sync-log-list' });
		for (const entry of this.entries) {
			list.appendChild(this.renderRow(entry));
		}
	}

	private renderRow(entry: SyncLogEntry): HTMLElement {
		const row = createDiv();
		row.className = `lifeline-sync-log-row lifeline-status-${entry.status}`;

		const head = row.createDiv({ cls: 'lifeline-sync-log-row-head' });
		head.createSpan({ cls: 'lifeline-sync-log-icon', text: STATUS_ICON[entry.status] });
		head.createSpan({ cls: 'lifeline-sync-log-time', text: formatTime(new Date(entry.startedAt)) });
		head.createSpan({
			cls: 'lifeline-sync-log-counts',
			text: `${entry.channelsSynced} ch · ${entry.playlistsSynced} pl · ${entry.videosFound} videos`,
		});
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

	private count(status: SyncLogEntry['status']): number {
		return this.entries.filter((entry) => entry.status === status).length;
	}
}
