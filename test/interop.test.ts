import { describe, expect, it } from 'vitest';
import { binaryBytes, executeOne, type HarnessOptions } from './helpers/context';
import { FIXTURE_PASSPHRASES, fixture, fixtureBuffer, withGpg } from './helpers/fixtures';

/**
 * Cross-implementation tests: every artifact the node produces is checked with
 * GnuPG, and every artifact GnuPG produces is checked with the node. This is the
 * gate that catches a behaviour-shifting openpgp release.
 */

const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const RSA_PRIVATE = fixture('keys', 'rsa-private.asc');
const PLAINTEXT = fixtureBuffer('messages', 'plaintext.txt');
const PASSWORD = 'shared-fixture-password';

function binaryInput(data: Buffer, fileName: string) {
	return { 0: { data: { data, fileName, mimeType: 'application/octet-stream' } } };
}

/** Encrypts the plaintext fixture with the node, for GnuPG to decrypt. */
async function nodeEncrypt(parameters: Record<string, unknown> = {}, credential?: HarnessOptions['credential']) {
	const item = await executeOne({
		parameters: {
			operation: 'encrypt',
			sourceData: 'binary',
			encryptUsing: 'publicKeys',
			publicKeys: RSA_PUBLIC,
			outputAs: 'binary',
			...parameters,
		},
		binary: binaryInput(PLAINTEXT, 'plaintext.txt'),
		credential,
	});
	return binaryBytes(item);
}

/** Signs the plaintext fixture with the node, for GnuPG to verify. */
async function nodeSign(parameters: Record<string, unknown> = {}) {
	const item = await executeOne({
		parameters: {
			operation: 'sign',
			signatureType: 'detached',
			sourceData: 'binary',
			outputAs: 'binary',
			...parameters,
		},
		binary: binaryInput(PLAINTEXT, 'plaintext.txt'),
		credential: { privateKey: RSA_PRIVATE },
	});
	// Cleartext signatures are text-only, so they have no binary field.
	return item.binary?.data ? binaryBytes(item) : Buffer.from(item.json.data as string, 'utf8');
}

describe('node to GnuPG', () => {
	it('produces messages GnuPG decrypts with the recipient key', async () => {
		const binary = await nodeEncrypt({ options: { armorOutput: false } });
		const armored = await nodeEncrypt({ options: { armorOutput: true } });

		await withGpg(async (gpg) => {
			expect(gpg.decrypt(binary).equals(PLAINTEXT)).toBe(true);
			expect(gpg.decrypt(armored).equals(PLAINTEXT)).toBe(true);
		});
	});

	it('produces messages GnuPG decrypts with a password', async () => {
		const encrypted = await nodeEncrypt({ encryptUsing: 'password', password: PASSWORD, publicKeys: '' });

		await withGpg(async (gpg) => {
			expect(gpg.decrypt(encrypted, PASSWORD).equals(PLAINTEXT)).toBe(true);
		});
	});

	it('produces hidden-recipient messages GnuPG can still decrypt', async () => {
		const encrypted = await nodeEncrypt({ options: { armorOutput: false, hideRecipients: true } });

		await withGpg(async (gpg) => {
			expect(gpg.decrypt(encrypted).equals(PLAINTEXT)).toBe(true);
		});
	});

	it('compresses exactly when the Compression option asks for it', async () => {
		const plain = await nodeEncrypt({ options: { armorOutput: false } });
		const zipped = await nodeEncrypt({ options: { armorOutput: false, compression: 'zip' } });
		const zlibbed = await nodeEncrypt({ options: { armorOutput: false, compression: 'zlib' } });

		await withGpg(async (gpg) => {
			expect(gpg.listPackets(plain)).not.toContain('compressed packet');
			expect(gpg.listPackets(zipped)).toContain('compressed packet: algo=1');
			expect(gpg.listPackets(zlibbed)).toContain('compressed packet: algo=2');
		});
	});

	it('produces detached signatures GnuPG verifies', async () => {
		const signature = await nodeSign({ options: { armorOutput: false } });

		await withGpg(async (gpg) => {
			expect(gpg.verify(signature, PLAINTEXT).output).toContain('Good signature');
		});
	});

	it('produces cleartext signatures GnuPG verifies', async () => {
		const signature = await nodeSign({
			signatureType: 'cleartext',
			sourceData: 'text',
			textToSign: 'cleartext body\n',
		});

		await withGpg(async (gpg) => {
			expect(gpg.verifyEmbedded(signature).output).toContain('Good signature');
		});
	});

	it('produces inline signatures GnuPG verifies', async () => {
		const signed = await nodeSign({ signatureType: 'inline', options: { armorOutput: false } });

		await withGpg(async (gpg) => {
			expect(gpg.verifyEmbedded(signed).output).toContain('Good signature');
		});
	});
});

describe('GnuPG to node', () => {
	it('decrypts what GnuPG encrypted', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryInput(fixtureBuffer('ciphertexts', 'rsa-binary.pgp'), 'rsa.pgp'),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
		expect(item.json.fileName).toBe('plaintext.txt');
	});

	it('decrypts a hidden-recipient message GnuPG encrypted', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			binary: binaryInput(fixtureBuffer('ciphertexts', 'hidden-recipient.asc'), 'hidden.asc'),
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
	});

	it('decrypts what GnuPG encrypted with a password', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'password',
				password: FIXTURE_PASSPHRASES.password,
				outputAs: 'binary',
			},
			binary: binaryInput(fixtureBuffer('ciphertexts', 'password-armored.asc'), 'password.asc'),
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
	});

	it('verifies the signatures GnuPG created', async () => {
		const detached = await executeOne({
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
		const cleartext = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: fixture('signatures', 'rsa-cleartext.asc'),
				publicKeys: RSA_PUBLIC,
			},
		});
		const inline = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: fixture('signatures', 'rsa-inline.asc'),
				publicKeys: RSA_PUBLIC,
			},
		});

		expect([detached.json.verified, cleartext.json.verified, inline.json.verified]).toEqual([
			true,
			true,
			true,
		]);
		expect(detached.json.keyID).toBe(fixture('keys', 'rsa-keyid.txt').trim().toLowerCase());
	});
});
