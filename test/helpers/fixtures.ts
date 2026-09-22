/* eslint-disable @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-dangerous-functions -- test infrastructure: this helper reads committed fixtures and drives GnuPG. It is never published (`files: ["dist"]`) and sits outside the community scanner's source globs (`package.json` + `{nodes,credentials}/**`), which is the scope those rules protect. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Access to the GnuPG interoperability fixtures and to GnuPG itself, so the
 * test layer can prove the node talks to other implementations.
 */

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

export const FIXTURE_PASSPHRASES = {
	rsa: 'rsa-fixture-passphrase',
	curve: 'curve-fixture-passphrase',
	password: 'shared-fixture-password',
} as const;

/** Reads a fixture as text, e.g. `fixture('keys', 'rsa-public.asc')`. */
export function fixture(...parts: string[]): string {
	return readFileSync(join(FIXTURES, ...parts), 'utf8');
}

/** Reads a fixture as bytes, e.g. `fixtureBuffer('ciphertexts', 'rsa-binary.pgp')`. */
export function fixtureBuffer(...parts: string[]): Buffer {
	return readFileSync(join(FIXTURES, ...parts));
}

export function fixturePath(...parts: string[]): string {
	return join(FIXTURES, ...parts);
}

export interface GpgResult {
	stdout: string;
	stderr: string;
}

/**
 * Runs gpg against a throwaway keyring holding the fixture keys, with loopback
 * pinentry so no agent or tty is needed.
 */
export async function withGpg<T>(run: (gpg: Gpg) => Promise<T> | T): Promise<T> {
	const home = mkdtempSync(join(tmpdir(), 'openpgp-fixtures-'));
	try {
		writeFileSync(join(home, 'gpg.conf'), 'no-tty\nbatch\n');
		const gpg = new Gpg(home);
		for (const name of ['rsa', 'rsa-protected', 'curve', 'curve-protected', 'stranger']) {
			gpg.run(['--import', fixturePath('keys', `${name}-private.asc`)], {
				passphrase: name.includes('protected')
					? name.startsWith('rsa')
						? FIXTURE_PASSPHRASES.rsa
						: FIXTURE_PASSPHRASES.curve
					: undefined,
			});
		}
		return await run(gpg);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

class Gpg {
	constructor(private readonly home: string) {}

	run(
		args: string[],
		options: { passphrase?: string; input?: Buffer; check?: boolean } = {},
	): GpgResult {
		const { passphrase, input, check = true } = options;
		const result = spawnSync(
			'gpg',
			[
				'--homedir',
				this.home,
				'--batch',
				'--yes',
				'--pinentry-mode',
				'loopback',
				...(passphrase === undefined ? [] : ['--passphrase', passphrase]),
				...args,
			],
			{ input, maxBuffer: 32 * 1024 * 1024 },
		);
		const stdout = result.stdout?.toString() ?? '';
		const stderr = result.stderr?.toString() ?? '';
		if (check && result.status !== 0) {
			throw new Error(`gpg ${args.join(' ')} failed (${result.status}): ${stderr || stdout}`);
		}
		return { stdout, stderr };
	}

	/** Decrypts a fixture ciphertext and returns the plaintext bytes. */
	decrypt(ciphertext: Buffer, passphrase?: string): Buffer {
		const outputPath = join(this.home, 'decrypted.out');
		this.run(['--output', outputPath, '--decrypt'], { input: ciphertext, passphrase });
		return readFileSync(outputPath);
	}

	/** Verifies a detached signature against the message it signs. */
	verify(signature: Buffer, message: Buffer): { ok: boolean; output: string } {
		const signaturePath = join(this.home, 'signature.asc');
		const messagePath = join(this.home, 'message.bin');
		writeFileSync(signaturePath, signature);
		writeFileSync(messagePath, message);
		const result = this.run(['--verify', signaturePath, messagePath], { check: false });
		return { ok: result.stderr.includes('Good signature'), output: result.stderr };
	}

	/** Verifies a cleartext or inline signed message, which carries its own content. */
	verifyEmbedded(signedMessage: Buffer): { ok: boolean; output: string } {
		const path = join(this.home, 'signed-message.asc');
		writeFileSync(path, signedMessage);
		const result = this.run(['--verify', path], { check: false });
		return { ok: result.stderr.includes('Good signature'), output: result.stderr };
	}

	/** Lists the packets of a message, decrypting it when the keyring allows. */
	listPackets(message: Buffer): string {
		const path = join(this.home, 'packets.pgp');
		writeFileSync(path, message);
		return this.run(['--list-packets', path]).stdout;
	}
}
