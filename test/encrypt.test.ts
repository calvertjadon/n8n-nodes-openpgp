import * as openpgp from 'openpgp';
import { describe, expect, it } from 'vitest';
import { binaryBytes, executeOne } from './helpers/context';
import { fixture, fixtureBuffer } from './helpers/fixtures';

const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const CURVE_PUBLIC = fixture('keys', 'curve-public.asc');
const RSA_PRIVATE = fixture('keys', 'rsa-private.asc');
const CURVE_PRIVATE = fixture('keys', 'curve-private.asc');
const PLAINTEXT = fixtureBuffer('messages', 'plaintext.txt');
const BINARY_FILE = fixtureBuffer('messages', 'binary.bin');

/** Decrypts with openpgp directly, so the assertions do not lean on the node. */
async function openpgpDecrypt(ciphertext: string | Buffer, privateKey: string) {
	const [key] = await openpgp.readPrivateKeys({ armoredKeys: privateKey });
	const armored =
		typeof ciphertext === 'string' ||
		ciphertext.subarray(0, 64).toString('utf8').trimStart().startsWith('-----BEGIN PGP');
	const message = armored
		? await openpgp.readMessage({ armoredMessage: ciphertext.toString('utf8') })
		: await openpgp.readMessage({ binaryMessage: ciphertext });
	const { data, filename } = await openpgp.decrypt({ message, decryptionKeys: [key], format: 'binary' });
	return { data: Buffer.from(data), filename };
}

function binaryInput(data: Buffer, fileName: string) {
	return { 0: { data: { data, fileName, mimeType: 'application/octet-stream' } } };
}

describe('Encrypt', () => {
	it('encrypts inline text for a public key into the configured text field', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'line one\nline two\n',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				outputAs: 'text',
				outputFieldName: 'ciphertext',
			},
		});

		expect(item.json.ciphertext).toMatch(/^-----BEGIN PGP MESSAGE-----/);
		expect(item.pairedItem).toEqual({ item: 0 });
		const { data } = await openpgpDecrypt(item.json.ciphertext as string, RSA_PRIVATE);
		expect(data.toString('utf8')).toBe('line one\nline two\n');
	});

	it('names a binary output after the input file and arms it by default', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'binary',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				outputAs: 'binary',
			},
			binary: binaryInput(PLAINTEXT, 'plaintext.txt'),
		});

		expect(item.json.fileName).toBe('plaintext.txt.asc');
		expect(item.json.mimeType).toBe('application/pgp-encrypted');
		expect(item.json.fileSize).toBe(binaryBytes(item).length);
		expect(binaryBytes(item).toString('utf8')).toMatch(/^-----BEGIN PGP MESSAGE-----/);
		const { data, filename } = await openpgpDecrypt(binaryBytes(item), RSA_PRIVATE);
		expect(data.equals(PLAINTEXT)).toBe(true);
		expect(filename).toBe('plaintext.txt');
	});

	it('writes raw packets with a .pgp suffix when Armor Output is off', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'binary',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				outputAs: 'binary',
				options: { armorOutput: false },
			},
			binary: binaryInput(PLAINTEXT, 'plaintext.txt'),
		});

		expect(item.json.fileName).toBe('plaintext.txt.pgp');
		expect(binaryBytes(item).subarray(0, 14).toString('utf8')).not.toContain('BEGIN PGP');
		const { data } = await openpgpDecrypt(binaryBytes(item), RSA_PRIVATE);
		expect(data.equals(PLAINTEXT)).toBe(true);
	});

	it('round-trips through the node with a password in both modes', async () => {
		const encrypted = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'shared secret',
				encryptUsing: 'password',
				password: 'hunter2',
				outputAs: 'text',
			},
		});
		expect(encrypted.json.data).toMatch(/^-----BEGIN PGP MESSAGE-----/);

		const decrypted = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'text',
				textToDecrypt: encrypted.json.data,
				decryptUsing: 'password',
				password: 'hunter2',
				outputAs: 'text',
			},
		});
		expect(decrypted.json.data).toBe('shared secret');
	});

	it('encrypts for every key in a multi-key block', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'two recipients',
				encryptUsing: 'publicKeys',
				publicKeys: `${RSA_PUBLIC}\n${CURVE_PUBLIC}`,
				outputAs: 'text',
			},
		});

		const withRsa = await openpgpDecrypt(item.json.data as string, RSA_PRIVATE);
		const withCurve = await openpgpDecrypt(item.json.data as string, CURVE_PRIVATE);
		expect(withRsa.data.toString('utf8')).toBe('two recipients');
		expect(withCurve.data.toString('utf8')).toBe('two recipients');
	});

	it('hides the recipient key IDs when Hide Recipients is on', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'anonymous recipient',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				outputAs: 'text',
				options: { hideRecipients: true },
			},
		});

		const message = await openpgp.readMessage({ armoredMessage: item.json.data as string });
		expect(message.getEncryptionKeyIDs()[0].toHex()).toBe('0000000000000000');
		const { data } = await openpgpDecrypt(item.json.data as string, RSA_PRIVATE);
		expect(data.toString('utf8')).toBe('anonymous recipient');
	});

	it('signs the message with the credential when Also Sign is on', async () => {
		const [rsaKey] = await openpgp.readKeys({ armoredKeys: RSA_PUBLIC });
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'signed and encrypted',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				alsoSign: true,
				outputAs: 'text',
			},
			credential: { privateKey: RSA_PRIVATE },
		});

		const message = await openpgp.readMessage({ armoredMessage: item.json.data as string });
		const { data, signatures } = await openpgp.decrypt({
			message,
			decryptionKeys: await openpgp.readPrivateKeys({ armoredKeys: RSA_PRIVATE }),
			verificationKeys: [rsaKey],
			format: 'binary',
		});
		expect(Buffer.from(data).toString('utf8')).toBe('signed and encrypted');
		await expect(signatures[0].verified).resolves.toBe(true);
		expect(signatures[0].keyID.toHex()).toBe(fixture('keys', 'rsa-keyid.txt').trim().toLowerCase());
	});

	it('keeps binary input bytes intact through a text-format literal packet', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'binary',
				encryptUsing: 'publicKeys',
				publicKeys: CURVE_PUBLIC,
				outputAs: 'binary',
			},
			binary: binaryInput(BINARY_FILE, 'binary.bin'),
		});

		const { data, filename } = await openpgpDecrypt(binaryBytes(item), CURVE_PRIVATE);
		expect(data.equals(BINARY_FILE)).toBe(true);
		expect(filename).toBe('binary.bin');
	});
});
