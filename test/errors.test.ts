import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { binaryBytes, execute, executeOne } from './helpers/context';
import { fixture, fixtureBuffer } from './helpers/fixtures';

const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const RSA_PRIVATE = fixture('keys', 'rsa-private.asc');
const PLAINTEXT = fixtureBuffer('messages', 'plaintext.txt');

const CREDENTIAL = { privateKey: RSA_PRIVATE };

async function caughtError(options: Parameters<typeof executeOne>[0]): Promise<NodeOperationError> {
	try {
		await executeOne(options);
	} catch (error) {
		return error as NodeOperationError;
	}
	throw new Error('Expected the node to fail, but it returned an item');
}

describe('credential requirements', () => {
	it('asks for a credential when Sign has none', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'text',
				textToSign: 'needs a key',
			},
		});

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toBe(
			'This operation needs an OpenPGP Private Key credential — attach one to the node. [Item 0]',
		);
		expect(error.description).toMatch(/Create an "OpenPGP Private Key API" credential/);
	});

	it('asks for a credential when Encrypt also signs', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'needs a key',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				alsoSign: true,
				outputAs: 'text',
			},
		});

		expect(error.message).toContain('This operation needs an OpenPGP Private Key credential');
	});

	it('asks for a credential when Decrypt uses the private key', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'decrypt',
				sourceData: 'text',
				textToDecrypt: fixture('ciphertexts', 'rsa-armored.asc'),
				decryptUsing: 'privateKey',
				outputAs: 'text',
			},
		});

		expect(error.message).toContain('This operation needs an OpenPGP Private Key credential');
	});

	it('does not ask for a credential when Decrypt uses a password', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'password',
				password: 'shared-fixture-password',
				outputAs: 'binary',
			},
			binary: {
				0: { data: { data: fixtureBuffer('ciphertexts', 'password-binary.pgp'), fileName: 'pw.pgp' } },
			},
		});

		expect(binaryBytes(item).equals(PLAINTEXT)).toBe(true);
	});
});

describe('error copy', () => {
	it('names the key parameter when the key block is unreadable', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				publicKeys: 'this is not a key',
				outputAs: 'text',
			},
		});

		expect(error.message).toBe(
			"Public Key(s) doesn't contain a readable OpenPGP key — paste the full armored block, including BEGIN/END lines. [Item 0]",
		);
	});

	it('reports an empty key parameter as an unreadable key', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'verify',
				signatureType: 'detached',
				messageSource: 'text',
				messageText: 'x',
				signatureText: fixture('signatures', 'rsa-detached.asc'),
				publicKeys: '',
			},
		});

		expect(error.message).toContain("Public Key(s) doesn't contain a readable OpenPGP key");
	});

	it('asks for binary output when the plaintext is not UTF-8', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'text',
			},
			binary: {
				0: { data: { data: fixtureBuffer('ciphertexts', 'curve-armored.asc'), fileName: 'curve.asc' } },
			},
			credential: { privateKey: fixture('keys', 'curve-private.asc') },
		});

		expect(error.message).toBe(
			'Plaintext is not valid UTF-8 text — set Output As to Binary instead. [Item 0]',
		);
	});

	it('suffixes the failing item index and keeps it on the error', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			items: [{ json: {} }, { json: {} }],
			binary: {
				0: { data: { data: fixtureBuffer('ciphertexts', 'rsa-armored.asc'), fileName: 'ok.asc' } },
			},
			credential: CREDENTIAL,
		});

		expect(error.message).toContain('[Item 1]');
		expect(error).toMatchObject({ context: { itemIndex: 1 } });
	});
});

describe('per-item behaviour', () => {
	it('reports failures as items when the node continues on fail', async () => {
		const items = await execute({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
			},
			items: [{ json: {} }, { json: {} }],
			binary: {
				0: { data: { data: fixtureBuffer('ciphertexts', 'rsa-armored.asc'), fileName: 'ok.asc' } },
			},
			credential: CREDENTIAL,
			continueOnFail: true,
		});

		expect(items).toHaveLength(2);
		expect(binaryBytes(items[0]).equals(PLAINTEXT)).toBe(true);
		expect(items[1].json.error).toMatch(/\[Item 1\]/);
		expect(items[1].pairedItem).toEqual({ item: 1 });
	});

	it('pairs every output item with its input item', async () => {
		const items = await execute({
			parameters: {
				operation: 'encrypt',
				sourceData: 'binary',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				outputAs: 'binary',
			},
			items: [{ json: {} }, { json: {} }],
			binary: {
				0: { data: { data: fixtureBuffer('messages', 'plaintext.txt'), fileName: 'first.txt' } },
				1: { data: { data: fixtureBuffer('messages', 'binary.bin'), fileName: 'second.bin' } },
			},
		});

		expect(items).toHaveLength(2);
		expect(items.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
		expect(items[0].json.fileName).toBe('first.txt.asc');
		expect(items[1].json.fileName).toBe('second.bin.asc');
		expect(items[0].json.fileSize).not.toBe(items[1].json.fileSize);
	});

	it('leaves the input item untouched', async () => {
		const input = {
			json: { keep: 'me' },
			binary: { data: { data: 'filesystem:test', fileName: 'plaintext.txt' } },
		};
		await execute({
			parameters: {
				operation: 'encrypt',
				sourceData: 'binary',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC,
				outputAs: 'binary',
			},
			items: [input],
			binary: { 0: { data: { data: PLAINTEXT, fileName: 'plaintext.txt' } } },
		});

		expect(input).toEqual({
			json: { keep: 'me' },
			binary: { data: { data: 'filesystem:test', fileName: 'plaintext.txt' } },
		});
	});
});

describe('key input hardening', () => {
	const hardenedVariants: Record<string, string> = {
		'CRLF line endings': RSA_PUBLIC.replace(/\n/g, '\r\n'),
		'a stray Version header': RSA_PUBLIC.replace('\n\n', '\nVersion: GnuPG v2.4.4\n\n'),
		'junk around the block': `pasted from an email:\n\n${RSA_PUBLIC.trim()}\n\n-- \nsignature`,
		'surrounding whitespace': `\n\n  ${RSA_PUBLIC.trim()}  \n\n`,
		'a multi-key block': `${RSA_PUBLIC.trim()}\n${fixture('keys', 'curve-public.asc').trim()}`,
		'newlines flattened to spaces': RSA_PUBLIC.replace(/\n+/g, ' '),
	};

	for (const [description, publicKeys] of Object.entries(hardenedVariants)) {
		it(`accepts a key with ${description}`, async () => {
			const item = await executeOne({
				parameters: {
					operation: 'encrypt',
					sourceData: 'text',
					textToEncrypt: 'hardened',
					encryptUsing: 'publicKeys',
					publicKeys,
					outputAs: 'text',
				},
			});

			expect(item.json.data).toMatch(/^-----BEGIN PGP MESSAGE-----/);
		});
	}

	it('accepts an indented key, as pasted out of YAML or a quoted block', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'text',
				textToDecrypt: fixture('ciphertexts', 'rsa-armored.asc'),
				decryptUsing: 'privateKey',
				outputAs: 'text',
			},
			credential: { privateKey: RSA_PRIVATE.split('\n').map((line) => `    ${line}`).join('\n') },
		});

		expect(item.json.data).toBe(PLAINTEXT.toString('utf8'));
	});

	it('accepts a key whose newlines arrived escaped, as pasted out of JSON or an env var', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'escaped',
				encryptUsing: 'publicKeys',
				publicKeys: RSA_PUBLIC.replace(/\n/g, '\\n'),
				outputAs: 'text',
			},
		});

		expect(item.json.data).toMatch(/^-----BEGIN PGP MESSAGE-----/);
	});

	it('says a public key was pasted when the credential holds no private key', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'text',
				textToSign: 'needs a private key',
			},
			credential: { privateKey: RSA_PUBLIC },
		});

		expect(error.message).toBe(
			"Private Key holds a public key — it can't decrypt or sign. Paste the armored private key block instead. [Item 0]",
		);
		expect(error.description).toMatch(/--export-secret-keys/);
	});

	it('falls back to what the OpenPGP library reported when it has no better diagnosis', async () => {
		// A body that is valid base64 but truncated: only the packet parser can tell.
		const truncated = [
			'-----BEGIN PGP PUBLIC KEY BLOCK-----',
			'',
			...RSA_PUBLIC.split('\n').slice(2, 8),
			'-----END PGP PUBLIC KEY BLOCK-----',
		].join('\n');
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				publicKeys: truncated,
				outputAs: 'text',
			},
		});

		expect(error.description).toMatch(/The OpenPGP library reported: /);
	});

	it('prefers its own diagnosis over the library\'s vague message', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				// A body the library cannot decode: the node spots the offending line
				// itself, which beats the library's vague "Misformed armored text".
				publicKeys:
					'-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nnot base64 at all!!\n-----END PGP PUBLIC KEY BLOCK-----',
				outputAs: 'text',
			},
		});

		expect(error.description).toMatch(/line 3 of the block is not valid armored data/);
	});

	it('names the line that is not armored data', async () => {
		const lines = RSA_PUBLIC.split('\n');
		lines[5] = '!!!! this line is not base64 !!!!';
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				publicKeys: lines.join('\n'),
				outputAs: 'text',
			},
		});

		expect(error.description).toMatch(/line 6 of the block is not valid armored data/);
	});

	it('names quoting from a mail client', async () => {
		const quoted = RSA_PUBLIC.split('\n')
			.map((line) => (line === '' ? line : `> ${line}`))
			.join('\n');
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				publicKeys: quoted,
				outputAs: 'text',
			},
		});

		expect(error.description).toMatch(/leading ">" prefixes/);
	});

	it('names dash-escaping from a quoted message', async () => {
		const dashEscaped = RSA_PUBLIC.split('\n')
			.map((line) => (line.startsWith('-') ? `- ${line}` : line))
			.join('\n');
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				publicKeys: dashEscaped,
				outputAs: 'text',
			},
		});

		expect(error.description).toMatch(/dash-escaped/);
	});

	it('says when the block carries no key data at all', async () => {
		const error = await caughtError({
			parameters: {
				operation: 'encrypt',
				sourceData: 'text',
				textToEncrypt: 'x',
				encryptUsing: 'publicKeys',
				publicKeys: '-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n-----END PGP PUBLIC KEY BLOCK-----',
				outputAs: 'text',
			},
		});

		expect(error.description).toMatch(/no key data between its BEGIN and END lines/);
	});

	it('accepts a hardened credential key', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'text',
				textToDecrypt: fixture('ciphertexts', 'rsa-armored.asc'),
				decryptUsing: 'privateKey',
				outputAs: 'text',
			},
			credential: { privateKey: RSA_PRIVATE.replace(/\n/g, '\r\n') },
		});

		expect(item.json.data).toBe(PLAINTEXT.toString('utf8'));
	});

	it('accepts a credential key whose newlines were flattened to spaces', async () => {
		const item = await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'text',
				textToDecrypt: fixture('ciphertexts', 'rsa-armored.asc'),
				decryptUsing: 'privateKey',
				outputAs: 'text',
			},
			credential: { privateKey: RSA_PRIVATE.replace(/\n+/g, ' ') },
		});

		expect(item.json.data).toBe(PLAINTEXT.toString('utf8'));
	});
});
