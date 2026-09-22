import * as openpgp from 'openpgp';
import { describe, expect, it } from 'vitest';
import { executeOne } from './helpers/context';
import { fixture, fixtureBuffer } from './helpers/fixtures';

const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const RSA_KEY_ID = fixture('keys', 'rsa-keyid.txt').trim().toLowerCase();
const PLAINTEXT = fixtureBuffer('messages', 'plaintext.txt');
const PLAINTEXT_TEXT = PLAINTEXT.toString('utf8');

/** A signed message that carries no signature, for the unsigned cases. */
async function unsignedArmoredMessage(): Promise<string> {
	const message = await openpgp.createMessage({
		binary: new TextEncoder().encode('plain and unsigned\n'),
		format: 'text',
	});
	return message.armor();
}

describe('Verify', () => {
	it('verifies a detached GnuPG signature over inline text', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'detached',
				messageSource: 'text',
				messageText: PLAINTEXT_TEXT,
				// Signature Source defaults to Text.
				signatureText: fixture('signatures', 'rsa-detached.asc'),
				publicKeys: RSA_PUBLIC,
			},
		});

		expect(item.json).toEqual({ verified: true, signed: true, keyID: RSA_KEY_ID });
		expect(item.pairedItem).toEqual({ item: 0 });
	});

	it('verifies a binary GnuPG signature over a binary file', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'detached',
				messageSource: 'binary',
				signatureSource: 'binary',
				signatureBinaryPropertyName: 'signature',
				publicKeys: RSA_PUBLIC,
			},
			binary: {
				0: {
					data: { data: PLAINTEXT, fileName: 'plaintext.txt' },
					signature: { data: fixtureBuffer('signatures', 'rsa-detached.sig'), fileName: 'plaintext.txt.sig' },
				},
			},
		});

		expect(item.json.verified).toBe(true);
		expect(item.json.keyID).toBe(RSA_KEY_ID);
	});

	it('verifies a cleartext signature and recovers its text', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: fixture('signatures', 'rsa-cleartext.asc'),
				publicKeys: RSA_PUBLIC,
			},
		});

		expect(item.json.verified).toBe(true);
		// The cleartext signature framework strips trailing whitespace per line
		// and carries no trailing newline.
		const cleartextBody = PLAINTEXT_TEXT.split('\n')
			.map((line) => line.trimEnd())
			.join('\n')
			.trimEnd();
		expect(item.json.data).toBe(cleartextBody);
	});

	it('verifies an inline signature over binary literal data without recovering it', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: fixture('signatures', 'rsa-inline.asc'),
				publicKeys: RSA_PUBLIC,
			},
		});

		expect(item.json.verified).toBe(true);
		expect(item.json.signed).toBe(true);
		expect(item.json.data).toBeUndefined();
	});

	it('recovers text from an inline signature over text-mode literal data', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: fixture('signatures', 'rsa-inline-textmode.asc'),
				publicKeys: RSA_PUBLIC,
			},
		});

		expect(item.json.verified).toBe(true);
		expect(item.json.data).toBe(PLAINTEXT_TEXT.replace(/\n/g, '\r\n'));
	});

	it('reports an unknown signer as unverified when throwing is off', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'detached',
				messageSource: 'text',
				messageText: PLAINTEXT_TEXT,
				signatureText: fixture('signatures', 'stranger-detached.asc'),
				publicKeys: RSA_PUBLIC,
				throwOnInvalidSignature: false,
			},
		});

		expect(item.json).toEqual({ verified: false, signed: true, keyID: null });
	});

	it('fails on an unknown signer by default', async () => {
		await expect(
			executeOne({
				parameters: {
					operation: 'verify',
					signatureType: 'detached',
					messageSource: 'text',
					messageText: PLAINTEXT_TEXT,
					signatureText: fixture('signatures', 'stranger-detached.asc'),
					publicKeys: RSA_PUBLIC,
				},
			}),
		).rejects.toThrow(
			/Signature did not verify — the message was not signed by any provided Public Key\(s\)\. \[Item 0\]/,
		);
	});

	it('fails on an unsigned embedded message by default', async () => {
		await expect(
			executeOne({
				parameters: {
					operation: 'verify',
					signatureType: 'embedded',
					sourceData: 'text',
					messageText: await unsignedArmoredMessage(),
					publicKeys: RSA_PUBLIC,
				},
			}),
		).rejects.toThrow(
			/Signature did not verify — the message was not signed by any provided Public Key\(s\)\. \[Item 0\]/,
		);
	});

	it('reports an unsigned embedded message as a predicate when throwing is off', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: await unsignedArmoredMessage(),
				publicKeys: RSA_PUBLIC,
				throwOnInvalidSignature: false,
			},
		});

		expect(item.json).toEqual({
			verified: false,
			signed: false,
			keyID: null,
			data: 'plain and unsigned\n',
		});
	});

	it('reports a signature that does not match the message as unverified', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'detached',
				messageSource: 'text',
				messageText: 'different content',
				signatureText: fixture('signatures', 'rsa-detached.asc'),
				publicKeys: RSA_PUBLIC,
				throwOnInvalidSignature: false,
			},
		});

		expect(item.json.verified).toBe(false);
		expect(item.json.signed).toBe(true);
	});
});
