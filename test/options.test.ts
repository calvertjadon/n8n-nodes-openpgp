import type * as openpgpModule from 'openpgp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeOne } from './helpers/context';
import { fixture, fixtureBuffer } from './helpers/fixtures';

/**
 * The per-call openpgp config is asserted through a recording wrapper around the
 * library: `openpgp.config` is a process-global singleton, so the node must pass
 * its own config to every call instead of touching it.
 */
const recorded = vi.hoisted(() => ({
	calls: [] as { call: string; config?: Record<string, unknown> }[],
	globalConfig: null as unknown,
	globalConfigSnapshot: '',
}));

vi.mock('openpgp', async (importOriginal) => {
	const actual = await importOriginal<typeof openpgpModule>();
	recorded.globalConfig = actual.config;
	recorded.globalConfigSnapshot = JSON.stringify(actual.config);
	const recording = <Args extends unknown[], Result>(name: string, fn: (...args: Args) => Result) => {
		return (...args: Args): Result => {
			const [options] = args;
			if (options && typeof options === 'object' && 'config' in options) {
				recorded.calls.push({
					call: name,
					config: (options as { config?: Record<string, unknown> }).config,
				});
			}
			return fn(...args);
		};
	};
	return {
		...actual,
		readKeys: recording('readKeys', actual.readKeys),
		decryptKey: recording('decryptKey', actual.decryptKey),
		encrypt: recording('encrypt', actual.encrypt),
		decrypt: recording('decrypt', actual.decrypt),
		sign: recording('sign', actual.sign),
		verify: recording('verify', actual.verify),
	};
});

const RSA_PUBLIC = fixture('keys', 'rsa-public.asc');
const RSA_PRIVATE = fixture('keys', 'rsa-private.asc');

const BOUNDS = {
	maxArgon2MemoryExponent: 20,
	maxDecompressedMessageSize: 512 * 1024 * 1024,
};

function configsFor(call: string): Record<string, unknown>[] {
	const configs = recorded.calls.filter((entry) => entry.call === call).map((entry) => entry.config);
	if (configs.length === 0) {
		throw new Error(`openpgp.${call} was never called with a config`);
	}
	return configs as Record<string, unknown>[];
}

function encryptOptions(overrides: Record<string, unknown> = {}) {
	return {
		operation: 'encrypt',
		sourceData: 'text',
		textToEncrypt: 'config probe',
		encryptUsing: 'publicKeys',
		publicKeys: RSA_PUBLIC,
		outputAs: 'text',
		...overrides,
	};
}

beforeEach(() => {
	recorded.calls.length = 0;
});

describe('per-call openpgp config', () => {
	it('bounds argon2 memory and decompressed message size on every call', async () => {
		await executeOne({ parameters: encryptOptions() });
		await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'text',
				textToDecrypt: fixture('ciphertexts', 'rsa-armored.asc'),
				decryptUsing: 'privateKey',
				outputAs: 'text',
			},
			credential: { privateKey: RSA_PRIVATE },
		});
		await executeOne({
			parameters: {
				operation: 'sign',
				signatureType: 'detached',
				sourceData: 'text',
				textToSign: 'config probe',
			},
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(recorded.calls.length).toBeGreaterThan(0);
		for (const entry of recorded.calls) {
			expect(entry.config).toMatchObject(BOUNDS);
		}
	});

	it('maps the Compression option onto the preferred algorithm', async () => {
		await executeOne({ parameters: encryptOptions({ options: { compression: 'none' } }) });
		await executeOne({ parameters: encryptOptions({ options: { compression: 'zip' } }) });
		await executeOne({ parameters: encryptOptions({ options: { compression: 'zlib' } }) });

		const algorithms = configsFor('encrypt').map((config) => config.preferredCompressionAlgorithm);
		expect(algorithms).toEqual([0, 1, 2]);
	});

	it('leaves compression uncompressed when the option is untouched', async () => {
		await executeOne({ parameters: encryptOptions() });

		expect(configsFor('encrypt')[0]).toMatchObject({ preferredCompressionAlgorithm: 0 });
	});

	it('adds the legacy flags only when Legacy Compatibility is on', async () => {
		await executeOne({ parameters: encryptOptions() });
		await executeOne({
			parameters: encryptOptions({ options: { legacyCompatibility: true } }),
		});

		const [plain, legacy] = configsFor('encrypt');
		expect(plain).not.toHaveProperty('allowMissingKeyFlags');
		expect(plain).not.toHaveProperty('enableParsingV5Entities');
		expect(plain).not.toHaveProperty('parseAEADEncryptedV4KeysAsLegacy');
		expect(legacy).toMatchObject({
			allowMissingKeyFlags: true,
			enableParsingV5Entities: true,
			parseAEADEncryptedV4KeysAsLegacy: true,
		});
	});

	it('never mutates the process-global openpgp.config', async () => {
		await executeOne({
			parameters: encryptOptions({ options: { legacyCompatibility: true, compression: 'zip' } }),
		});
		await executeOne({
			parameters: {
				operation: 'decrypt',
				sourceData: 'binary',
				decryptUsing: 'privateKey',
				outputAs: 'binary',
				options: { legacyCompatibility: true },
			},
			binary: {
				0: { data: { data: fixtureBuffer('ciphertexts', 'rsa-binary.pgp'), fileName: 'rsa.pgp' } },
			},
			credential: { privateKey: RSA_PRIVATE },
		});

		expect(JSON.stringify(recorded.globalConfig)).toBe(recorded.globalConfigSnapshot);
	});
});
