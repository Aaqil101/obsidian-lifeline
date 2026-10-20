/**
 * Small, type-safe helpers for reading unknown JSON returned by the YouTube
 * and Google OAuth endpoints. No `any`: everything narrows from `unknown`.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

export function asArray(value: unknown): unknown[] | null {
	return Array.isArray(value) ? value : null;
}

export function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export function asNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
