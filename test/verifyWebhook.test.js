// Runs against the compiled output: npm run build && npm test
const assert = require('node:assert/strict');
const { createHmac, randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { verifyWebhook } = require('../dist/nodes/MountableTrigger/verifyWebhook.js');

const secret = `whsec_${randomBytes(24).toString('base64')}`;
const body = '{"type":"files.changed","data":{"events":[]}}';
const now = 1760961600;

function sign(withSecret, id, timestamp, payload) {
	const key = Buffer.from(withSecret.replace(/^whsec_/, ''), 'base64');
	const mac = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
	return `v1,${mac}`;
}

function headers(signature, timestamp = String(now)) {
	return {
		'webhook-id': 'msg_1',
		'webhook-timestamp': timestamp,
		'webhook-signature': signature,
	};
}

test('accepts a valid signature over the raw body', () => {
	const signature = sign(secret, 'msg_1', now, body);
	assert.equal(verifyWebhook(secret, headers(signature), Buffer.from(body), now), true);
});

test('rejects a signature made with another secret', () => {
	const other = `whsec_${randomBytes(24).toString('base64')}`;
	const signature = sign(other, 'msg_1', now, body);
	assert.equal(verifyWebhook(secret, headers(signature), Buffer.from(body), now), false);
});

test('rejects a changed body', () => {
	const signature = sign(secret, 'msg_1', now, body);
	assert.equal(verifyWebhook(secret, headers(signature), Buffer.from(`${body} `), now), false);
});

test('rejects a timestamp more than 300 seconds old', () => {
	const old = now - 301;
	const signature = sign(secret, 'msg_1', old, body);
	assert.equal(verifyWebhook(secret, headers(signature, String(old)), body, now), false);
	const recent = now - 300;
	const fresh = sign(secret, 'msg_1', recent, body);
	assert.equal(verifyWebhook(secret, headers(fresh, String(recent)), body, now), true);
});

test('accepts any matching one of several space-separated signatures', () => {
	const other = `whsec_${randomBytes(24).toString('base64')}`;
	const several = [
		'v2,ignored',
		sign(other, 'msg_1', now, body),
		sign(secret, 'msg_1', now, body),
	].join(' ');
	assert.equal(verifyWebhook(secret, headers(several), body, now), true);
	const noneMatch = ['v2,ignored', sign(other, 'msg_1', now, body)].join(' ');
	assert.equal(verifyWebhook(secret, headers(noneMatch), body, now), false);
});
