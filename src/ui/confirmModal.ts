/**
 * A small confirmation dialog for destructive settings actions. Resolves true
 * only when the action button is pressed; Cancel, Escape, and a click outside
 * all resolve false exactly once.
 */
import { Modal, type App } from 'obsidian';

class ConfirmModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly titleText: string,
		private readonly message: string,
		private readonly actionLabel: string,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.titleText);
		this.contentEl.createEl('p', { text: this.message });
		const row = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = row.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.finish(false));
		const action = row.createEl('button', { text: this.actionLabel, cls: 'mod-warning' });
		action.addEventListener('click', () => this.finish(true));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) {
			this.settled = true;
			this.resolve(false);
		}
	}

	private finish(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(confirmed);
		this.close();
	}
}

export function confirmAction(app: App, title: string, message: string, actionLabel: string): Promise<boolean> {
	return new Promise((resolve) => new ConfirmModal(app, title, message, actionLabel, resolve).open());
}
