import { describe, expect, it } from 'vitest';
import { binaryBytes, executeOne } from './helpers/context';
import { fixture, fixtureBuffer } from './helpers/fixtures';

const RSA_PRIVATE = fixture('keys', 'rsa-private.asc');
const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const PLAINTEXT = fixtureBuffer('messages', 'plaintext.txt');
const BINARY_FILE = fixtureBuffer('messages', 'binary.bin');

const credential = { privateKey: RSA_PRIVATE };

function binaryInput(data: Buffer, fileName: string) {
	return { 0: { data: { data, fileName, mimeType: 'application/octet-stream' } } };
}

/** Verifies a signature through the node, so both sides of the contract are exercised. */
async function verifyWithNode(options: {
	message?: string;
	messageBytes?: Buffer;
	signature?: string;
	signatureBytes?: Buffer;
	publicKeys?: string;
}) {
	return executeOne({
		parameters: {
			operation: 'verify',
			signatureType: 'detached',
			messageSource: options.messageBytes ? 'binary' : 'text',
			messageText: options.message,
			signatureSource: options.signatureBytes ? 'binary' : 'text',
			signatureText: options.signature,
			// Both binary inputs default to `data`, so the signature needs its own field.
			signatureBinaryPropertyName: 'signature',
			publicKeys: options.publicKeys ?? RSA_PUBLIC,
		},
		binary: options.messageBytes
			? {
					0: {
						data: { data: options.messageBytes, fileName: 'message.bin' },
						...(options.signatureBytes
							? { signature: { data: options.signatureBytes, fileName: 'signature.sig' } }
							: {}),
					},
				}
			: {},
	});
}

describe('Sign', () => {
	it('creates a detached armored signature in the configured text field', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'text',
				textToSign: 'sign me\n',
			},
			credential,
		});

		expect(item.json.data).toMatch(/^-----BEGIN PGP SIGNATURE-----/);
		expect(item.pairedItem).toEqual({ item: 0 });
		const verified = await verifyWithNode({ message: 'sign me\n', signature: item.json.data as string });
		expect(verified.json.verified).toBe(true);
		expect(verified.json.keyID).toBe(fixture('keys', 'rsa-keyid.txt').trim().toLowerCase());
	});

	it('writes a raw detached signature with a .sig suffix when Armor Output is off', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'binary',
				outputAs: 'binary',
				options: { armorOutput: false },
			},
			binary: binaryInput(PLAINTEXT, 'plaintext.txt'),
			credential,
		});

		expect(item.json.fileName).toBe('plaintext.txt.sig');
		expect(item.json.mimeType).toBe('application/pgp-signature');
		const verified = await verifyWithNode({ messageBytes: PLAINTEXT, signatureBytes: binaryBytes(item) });
		expect(verified.json.verified).toBe(true);
	});

	it('writes an armored detached signature into a binary field by default', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'binary',
				outputAs: 'binary',
			},
			binary: binaryInput(PLAINTEXT, 'plaintext.txt'),
			credential,
		});

		expect(item.json.fileName).toBe('plaintext.txt.sig');
		expect(binaryBytes(item).toString('utf8')).toMatch(/^-----BEGIN PGP SIGNATURE-----/);
		const verified = await verifyWithNode({ messageBytes: PLAINTEXT, signatureBytes: binaryBytes(item) });
		expect(verified.json.verified).toBe(true);
	});

	it('creates a cleartext signature that stays readable', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'cleartext',
				textToSign: 'readable text\n',
				// Cleartext output is text-only, so this is ignored.
				outputAs: 'binary',
			},
			credential,
		});

		expect(item.json.data).toMatch(/^-----BEGIN PGP SIGNED MESSAGE-----/);
		expect(item.json.data).toContain('readable text');
		const verified = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: item.json.data,
				publicKeys: RSA_PUBLIC,
			},
		});
		expect(verified.json.verified).toBe(true);
		expect(verified.json.data).toBe('readable text\n');
	});

	it('creates an inline signed message that carries its content', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'inline',
				sourceData: 'text',
				textToSign: 'inline body\n',
			},
			credential,
		});

		expect(item.json.data).toMatch(/^-----BEGIN PGP MESSAGE-----/);
		const verified = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'text',
				messageText: item.json.data,
				publicKeys: RSA_PUBLIC,
			},
		});
		expect(verified.json.verified).toBe(true);
		expect(verified.json.data).toBe('inline body\n');
	});

	it('signs binary files inline without touching their bytes', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'inline',
				sourceData: 'binary',
				outputAs: 'binary',
				options: { armorOutput: false },
			},
			binary: binaryInput(BINARY_FILE, 'binary.bin'),
			credential,
		});

		expect(item.json.fileName).toBe('binary.bin.pgp');
		const verified = await executeOne({
			parameters: {
				operation: 'verify',
				signatureType: 'embedded',
				sourceData: 'binary',
				publicKeys: RSA_PUBLIC,
			},
			binary: { 0: { data: { data: binaryBytes(item), fileName: 'signed.pgp' } } },
		});
		expect(verified.json.verified).toBe(true);
		// Binary literal content is not recovered; that needs Decrypt and a key.
		expect(verified.json.data).toBeUndefined();
	});

	it('signs with a passphrase-protected credential key', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'text',
				textToSign: 'protected signer',
			},
			credential: {
				privateKey: fixture('keys', 'rsa-protected-private.asc'),
				passphrase: 'rsa-fixture-passphrase',
			},
		});

		const verified = await verifyWithNode({
			message: 'protected signer',
			signature: item.json.data as string,
			publicKeys: fixture('keys', 'rsa-protected-public.asc'),
		});
		expect(verified.json.verified).toBe(true);
	});
});
