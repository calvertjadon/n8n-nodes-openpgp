import { describe, expect, it } from 'vitest';
import { binaryBytes, executeOne } from './helpers/context';
import { FIXTURE_PASSPHRASES, fixture, fixtureBuffer } from './helpers/fixtures';

const RSA_PRIVATE = fixture('keys', 'rsa-private.asc');
const RSA_PROTECTED_PRIVATE = fixture('keys', 'rsa-protected-private.asc');
const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const STRANGER_PUBLIC = fixture('keys', 'stranger-public.asc');
const PLAINTEXT = fixtureBuffer('messages', 'plaintext.txt');
const BINARY_FILE = fixtureBuffer('messages', 'binary.bin');

function textMessage(ciphertext: string) {
	return {
		operation: 'decrypt',
		sourceData: 'text',
		textToDecrypt: ciphertext,
		decryptUsing: 'privateKey',
		outputAs: 'text',
	};
}

function binaryMessage(data: Buffer, fileName: string) {
	return { 0: { data: { data, fileName, mimeType: 'application/pgp-encrypted' } } };
}

describe('Decrypt', () => {
	it('decrypts an armored GnuPG message and recovers the embedded file name', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'rsa-armored.asc'), 'rsa-armored.asc'),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(item.json.fileName).toBe('plaintext.txt');
		expect(item.json.mimeType).toBe('application/octet-stream');
		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
		expect(item.pairedItem).toEqual({ item: 0 });
	});

	it('decrypts a binary GnuPG message from a binary field', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'rsa-binary.pgp'), 'rsa-binary.pgp'),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
		expect(item.json.fileName).toBe('plaintext.txt');
	});

	it('decrypts binary content that is not valid UTF-8 into a binary field', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'curve-armored.asc'), 'curve-armored.asc'),
			credential: { privateKey: fixture('keys', 'curve-private.asc') },
		});

		expect(binaryBytes(item).equals(BINARY_FILE)).toBe(true);
		expect(item.json.fileName).toBe('binary.bin');
	});

	it('decrypts with a shared password in both armored and binary form', async () => {
		const armored = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'password',
				password: FIXTURE_PASSPHRASES.password,
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'password-armored.asc'), 'password.asc'),
		});
		const binary = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'password',
				password: FIXTURE_PASSPHRASES.password,
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'password-binary.pgp'), 'password.pgp'),
		});

		expect(binaryBytes(armored).equals(PLAINTEXT)).toBe(true);
		expect(binaryBytes(binary).equals(PLAINTEXT)).toBe(true);
	});

	it('decrypts a hidden-recipient message', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'hidden-recipient.asc'), 'hidden.asc'),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
	});

	it('decrypts a compressed message', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryMessage(fixtureBuffer('ciphertexts', 'compressed-zip-armored.asc'), 'zip.asc'),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
	});

	it('keeps GnuPG text-mode line endings instead of normalising them', async () => {
		const item = await executeOne({
			parameters: textMessage(fixture('ciphertexts', 'textmode-armored.asc')),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(item.json.data).toBe(PLAINTEXT.toString('utf8').replace(/\n/g, '\r\n'));
	});

	it('unlocks a passphrase-protected credential key', async () => {
		const item = await executeOne({
			parameters: textMessage(fixture('ciphertexts', 'rsa-protected-armored.asc')),
			credential: {
				privateKey: RSA_PROTECTED_PRIVATE,
				passphrase: FIXTURE_PASSPHRASES.rsa,
			},
		});

		expect(item.json.data).toBe(PLAINTEXT.toString('utf8'));
	});

	it('reports the credential copy when the passphrase is wrong', async () => {
		await expect(
			executeOne({
				parameters: textMessage(fixture('ciphertexts', 'rsa-protected-armored.asc')),
				credential: {
					privateKey: RSA_PROTECTED_PRIVATE,
					passphrase: 'not-the-passphrase',
				},
			}),
		).rejects.toThrow(
			/Couldn't decrypt with this credential's private key — check the Passphrase, or that the message was encrypted for this key\. \[Item 0\]/,
		);
	});

	it('reports signature fields when verification keys are supplied', async () => {
		const item = await executeOne({
			parameters: {
				...textMessage(fixture('ciphertexts', 'rsa-signed-armored.asc')),
				publicKeys: RSA_PUBLIC,
			},
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(item.json.signed).toBe(true);
		expect(item.json.verified).toBe(true);
		expect(item.json.keyID).toBe(fixture('keys', 'rsa-keyid.txt').trim().toLowerCase());
	});

	it('reports an unverified signature without failing by default', async () => {
		const item = await executeOne({
			parameters: {
				...textMessage(fixture('ciphertexts', 'rsa-signed-armored.asc')),
				publicKeys: STRANGER_PUBLIC,
			},
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(item.json.signed).toBe(true);
		expect(item.json.verified).toBe(false);
		expect(item.json.keyID).toBeNull();
	});

	it('fails on an unsigned message when Require Valid Signature is on', async () => {
		await expect(
			executeOne({
				parameters: {
					...textMessage(fixture('ciphertexts', 'rsa-armored.asc')),
					publicKeys: RSA_PUBLIC,
					requireValidSignature: true,
				},
				credential: { privateKey: RSA_PRIVATE },
			}),
		).rejects.toThrow(/Message is not signed — Require Valid Signature is on\. \[Item 0\]/);
	});

	it('fails on a signature from an unknown key when Require Valid Signature is on', async () => {
		await expect(
			executeOne({
				parameters: {
					...textMessage(fixture('ciphertexts', 'rsa-signed-armored.asc')),
					publicKeys: STRANGER_PUBLIC,
					requireValidSignature: true,
				},
				credential: { privateKey: RSA_PRIVATE },
			}),
		).rejects.toThrow(
			/Signature did not verify — the message was not signed by any provided Public Key\(s\)\. \[Item 0\]/,
		);
	});

	it('writes the plaintext into the configured text field', async () => {
		const item = await executeOne({
			parameters: {
				...textMessage(fixture('ciphertexts', 'rsa-armored.asc')),
				outputFieldName: 'message',
			},
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(item.json.message).toBe(PLAINTEXT.toString('utf8'));
	});
});
