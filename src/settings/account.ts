/**
 * Google account: the landing group carries the connection status and a door
 * to the credentials, because the client ID and secret are set once and then
 * never looked at again. Keeping them off the landing page leaves the first
 * screen for things that are checked regularly.
 */
import { Notice, SecretComponent, Setting, type SettingDefinitionGroup } from 'obsidian';
import { SECURITY_URL, authErrorMessage, group, pageDefinition, renderRow, type SettingsHost } from './ui';

/** Landing group: are we connected, and how to change that. */
export function accountGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;
	const connected = plugin.auth.isConnected();

	const status = renderRow(
		connected ? 'Connected' : 'Not connected',
		connected
			? 'Lifeline can read your subscriptions. The refresh token lives in the system keychain.'
			: 'Authenticate to let Lifeline read your subscriptions.',
		(setting) => {
			setting.setClass('lifeline-connection');
			setting.setClass(connected ? 'lifeline-connection--ok' : 'lifeline-connection--off');
			setting.addButton((button) =>
				button
					.setButtonText(connected ? 'Re-authenticate' : 'Authenticate with Google')
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText('Waiting for browser…');
						try {
							await plugin.auth.authenticate();
							new Notice('Lifeline is connected to YouTube.');
						} catch (err) {
							new Notice(authErrorMessage(err), 20000);
						} finally {
							button.setDisabled(false);
							host.refresh();
						}
					}),
			);
		},
	);

	return {
		type: 'group',
		heading: 'Google account',
		items: [
			status,
			pageDefinition(
				host,
				'Google credentials',
				'Client ID and client secret, stored in the system keychain rather than in data.json.',
				renderCredentialsPage,
			),
		],
	};
}

/** Credentials sub-page: the two keychain secrets plus the security notes. */
export function renderCredentialsPage(host: SettingsHost, containerEl: HTMLElement): void {
	const { settings } = host.plugin;
	const card = group(containerEl, 'Google credentials');

	new Setting(card)
		.setName('OAuth client ID')
		.setDesc(
			'From Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Desktop app). Stored in the system keychain.',
		)
		.addComponent((el) =>
			new SecretComponent(host.plugin.app, el)
				.setValue(settings.clientIdName)
				.onChange(async (value) => {
					settings.clientIdName = value ?? '';
					await host.plugin.saveSettings();
				}),
		);

	new Setting(card)
		.setName('OAuth client secret')
		.setDesc('Selected or created here, then kept in the system keychain. Never written to data.json.')
		.addComponent((el) =>
			new SecretComponent(host.plugin.app, el)
				.setValue(settings.clientSecretName)
				.onChange(async (value) => {
					settings.clientSecretName = value ?? '';
					await host.plugin.saveSettings();
				}),
		);

	new Setting(card)
		.setName('Security')
		.setDesc('How Lifeline stores your credentials, and what data leaves your machine.')
		.addButton((button) =>
			button.setButtonText('Open security notes').onClick(() => {
				window.open(SECURITY_URL, '_blank');
			}),
		);
}
