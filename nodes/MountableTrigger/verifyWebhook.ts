import { createHmac, timingSafeEqual } from 'node:crypto';

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, name: string): string {
	const value = headers[name];
	return Array.isArray(value) ? value.join(' ') : (value ?? '');
}

// Standard Webhooks signature, as on https://mountable.io/docs/webhooks#verify-the-signature.
// `webhook-signature` holds one or more space-separated `v1,<base64>` HMAC-SHA256
// signatures of `<webhook-id>.<webhook-timestamp>.<raw body>`, keyed with the
// base64-decoded secret after `whsec_`. Timestamps more than 300 s off are rejected.
export function verifyWebhook(
	secret: string,
	headers: Headers,
	body: Buffer | string,
	now: number = Date.now() / 1000,
): boolean {
	const id = header(headers, 'webhook-id');
	const timestamp = header(headers, 'webhook-timestamp');
	if (!/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300) return false;
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	if (key.length === 0) return false;
	const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest();
	return header(headers, 'webhook-signature')
		.split(' ')
		.some((sig) => {
			if (!sig.startsWith('v1,')) return false;
			const given = Buffer.from(sig.slice(3), 'base64');
			return given.length === expected.length && timingSafeEqual(given, expected);
		});
}
