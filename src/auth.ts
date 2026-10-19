/**
 * Google OAuth 2.0 "installed app" flow with a local loopback redirect.
 *
 * DESKTOP-ONLY: the flow starts a tiny HTTP listener on 127.0.0.1 to catch the
 * redirect, which only works in the desktop (Electron) app — this is why
 * manifest.json sets isDesktopOnly.
 *
 * Secret storage: the refresh token (and the client secret value) live in
 * Obsidian's native keychain via app.secretStorage (Obsidian 1.11.4+), keyed to
 * this vault. Nothing secret is ever written to data.json or anywhere else in
 * the vault. The keychain is per-machine, so a new computer means re-auth.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { Notice } from 'obsidian';
import { asRecord, asString, errorMessage } from './json';
import { SyncError } from './types';
import type LifelinePlugin from './main';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Keychain ID for the YouTube refresh token.
 * SecretStorage IDs must be lowercase alphanumeric with optional dashes.
 */
export const REFRESH_SECRET_ID = 'lifeline-refresh-token';

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	error?: string;
	error_description?: string;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

export class AuthManager {
	private cached: CachedToken | null = null;
	private cancelFlow: (() => void) | null = null;

	constructor(private readonly plugin: LifelinePlugin) {}

	/**
	 * Settings store only the *name* of each secret (via SecretComponent);
	 * the values come from the keychain on demand. Both OAuth credentials
	 * (client ID and client secret) live there, so data.json never holds a
	 * Google credential.
	 */
	private get clientIdValue(): string | null {
		const name = this.plugin.settings.clientIdName;
		if (!name) return null;
		return this.plugin.app.secretStorage.getSecret(name)?.trim() || null;
	}

	private get clientSecretValue(): string | null {
		const name = this.plugin.settings.clientSecretName;
		if (!name) return null;
		return this.plugin.app.secretStorage.getSecret(name)?.trim() || null;
	}

	getRefreshToken(): string | null {
		return this.plugin.app.secretStorage.getSecret(REFRESH_SECRET_ID);
	}

	isConnected(): boolean {
		return this.getRefreshToken() !== null;
	}

	/** Full interactive flow: loopback listener → browser consent → code exchange. */
	async authenticate(): Promise<void> {
		const clientId = this.clientIdValue;
		if (!clientId) {
			throw new SyncError(
				'auth',
				'oauth',
				'Select or create a secret for your OAuth client ID in settings first.',
			);
		}
		const clientSecret = this.clientSecretValue;
		if (!clientSecret) {
			throw new SyncError(
				'auth',
				'oauth',
				'Select or create a secret for your OAuth client secret in settings first.',
			);
		}
		const refreshToken = await this.runLoopbackFlow(clientId, clientSecret);
		this.plugin.app.secretStorage.setSecret(REFRESH_SECRET_ID, refreshToken);
		this.cached = null;
	}

	/** Cached access token, refreshed proactively when close to expiry. */
	async getAccessToken(): Promise<string> {
		const cached = this.cached;
		if (cached && cached.expiresAt - 30_000 > Date.now()) return cached.accessToken;
		return await this.refreshAccessToken();
	}

	/** Exchange the stored refresh token for a new access token. */
	async refreshAccessToken(): Promise<string> {
		const clientId = this.clientIdValue;
		const clientSecret = this.clientSecretValue;
		const refreshToken = this.getRefreshToken();
		if (!clientId || !clientSecret) {
			throw new SyncError(
				'auth',
				'oauth',
				'OAuth client ID or secret is missing. Check Lifeline settings.',
			);
		}
		if (!refreshToken) {
			throw new SyncError(
				'auth',
				'oauth',
				'Not authenticated yet. Run "Authenticate with Google" in Lifeline settings.',
			);
		}
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		});
		const token = await this.postToken(body, 'oauth');
		const accessToken = token.access_token;
		if (!accessToken) {
			const detail = token.error_description ?? token.error ?? 'no access token returned';
			throw new SyncError('auth', 'oauth', `Token refresh failed: ${detail}. Re-authenticate in Lifeline settings.`);
		}
		// Google may rotate the refresh token on refresh; persist the new one.
		if (token.refresh_token) {
			this.plugin.app.secretStorage.setSecret(REFRESH_SECRET_ID, token.refresh_token);
		}
		this.cached = {
			accessToken,
			expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
		};
		return accessToken;
	}

	/** Close a pending authorization flow (called from onunload). */
	dispose(): void {
		if (this.cancelFlow) this.cancelFlow();
	}

	private runLoopbackFlow(clientId: string, clientSecret: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let settled = false;
			let redirectUri = '';
			let timer: number | null = null;
			let server: http.Server | null = null;

			const settle = (fn: () => void): void => {
				if (settled) return;
				settled = true;
				if (timer !== null) {
					window.clearTimeout(timer);
					timer = null;
				}
				if (server) {
					server.close();
					server = null;
				}
				if (this.cancelFlow === cancel) this.cancelFlow = null;
				fn();
			};
			const cancel = (): void => {
				settle(() => reject(new SyncError('auth', 'oauth', 'Authorization cancelled.')));
			};
			this.cancelFlow = cancel;

			server = http.createServer((req, res) => {
				if (typeof req.url !== 'string') {
					res.writeHead(400);
					res.end('Missing URL');
					return;
				}
				const url = new URL(req.url, 'http://127.0.0.1');
				if (url.pathname !== '/callback') {
					res.writeHead(404);
					res.end('Not found');
					return;
				}
				const oauthError = url.searchParams.get('error');
				const code = url.searchParams.get('code');
				const respond = (ok: boolean): void => {
					res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
					res.end(
						ok
							? '<h2>Lifeline is connected</h2><p>You can close this tab and return to Obsidian.</p>'
							: '<h2>Authorization failed</h2><p>You can close this tab and return to Obsidian.</p>',
					);
				};
				if (oauthError !== null || !code) {
					respond(false);
					settle(() =>
						reject(new SyncError('auth', 'oauth', `Google denied the request: ${oauthError ?? 'no authorization code'}`)),
					);
					return;
				}
				// Respond immediately; the token exchange finishes in the background.
				respond(true);
				void this.exchangeCode(code, redirectUri, clientId, clientSecret).then(
					(refreshToken) => settle(() => resolve(refreshToken)),
					(err: unknown) =>
						settle(() => reject(err instanceof Error ? err : new Error(String(err)))),
				);
			});

			server.on('error', (err: Error) => {
				settle(() => reject(new SyncError('auth', 'oauth', `Could not start the local redirect server: ${err.message}`)));
			});

			server.listen(0, '127.0.0.1', () => {
				const active = server;
				if (!active) return;
				const address: AddressInfo | string | null = active.address();
				if (!address || typeof address === 'string') {
					settle(() => reject(new SyncError('auth', 'oauth', 'Could not determine the local redirect port.')));
					return;
				}
				redirectUri = `http://127.0.0.1:${address.port}/callback`;
				const authUrl = buildAuthUrl(clientId, redirectUri);
				const opened = window.open(authUrl, '_blank');
				if (!opened) {
					new Notice(`Lifeline could not open your browser automatically. Copy this URL to authorize:\n${authUrl}`, 30000);
				}
				timer = window.setTimeout(() => {
					settle(() => reject(new SyncError('auth', 'oauth', 'Authorization timed out after 5 minutes.')));
				}, FLOW_TIMEOUT_MS);
			});
		});
	}

	private async exchangeCode(
		code: string,
		redirectUri: string,
		clientId: string,
		clientSecret: string,
	): Promise<string> {
		const body = new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		});
		const token = await this.postToken(body, 'oauth');
		const refreshToken = token.refresh_token;
		if (!refreshToken) {
			throw new SyncError(
				'auth',
				'oauth',
				'Google did not return a refresh token. Revoke access at myaccount.google.com/permissions and try again.',
			);
		}
		return refreshToken;
	}

	private async postToken(params: URLSearchParams, resource: string): Promise<TokenResponse> {
		let res: Response;
		try {
			res = await fetch(TOKEN_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: params.toString(),
			});
		} catch (err) {
			throw new SyncError('network', resource, `Network error contacting Google: ${errorMessage(err)}`);
		}
		let json: unknown;
		try {
			json = await res.json();
		} catch {
			throw new SyncError('auth', resource, `Google's token endpoint returned HTTP ${res.status}.`);
		}
		const record = asRecord(json) ?? {};
		const response: TokenResponse = {
			access_token: asString(record.access_token) || undefined,
			expires_in: typeof record.expires_in === 'number' ? record.expires_in : undefined,
			refresh_token: asString(record.refresh_token) || undefined,
			error: asString(record.error) || undefined,
			error_description: asString(record.error_description) || undefined,
		};
		if (!res.ok && !response.error) {
			throw new SyncError('auth', resource, `Google's token endpoint returned HTTP ${res.status}.`);
		}
		return response;
	}
}

function buildAuthUrl(clientId: string, redirectUri: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: SCOPE,
		access_type: 'offline',
		prompt: 'consent',
	});
	return `${AUTH_ENDPOINT}?${params.toString()}`;
}
