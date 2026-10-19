/**
 * Read-only viewer for sync-log.md, which lives in the plugin folder.
 * Files under .obsidian are not vault-indexed, so the log cannot be opened
 * as a note; a modal is the practical way to show it.
 */
import { App, Modal } from 'obsidian';

export class SyncLogModal extends Modal {
	private readonly logContent: string;

	constructor(app: App, logContent: string) {
		super(app);
		this.logContent = logContent;
	}

	onOpen(): void {
		this.titleEl.setText('Lifeline sync log');
		this.contentEl.createEl('pre', {
			cls: 'lifeline-sync-log',
			text: this.logContent,
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
