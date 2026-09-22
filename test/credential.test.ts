import type { ICredentialsDecrypted, ICredentialTestFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { OpenPgpPrivateKeyApi } from '../credentials/OpenPgpPrivateKeyApi.credentials';
import manifest from '../package.json';
import { OpenPgp } from '../nodes/OpenPgp/OpenPgp.node';
import { FIXTURE_PASSPHRASES, fixture } from './helpers/fixtures';

/** The credential test the node registers for `testedBy: 'openPgpPrivateKeyTest'`. */
function credentialTest() {
	const { methods } = new OpenPgp();
	const test = methods?.credentialTest?.openPgpPrivateKeyTest;
	if (!test) {
		throw new Error('the node does not register openPgpPrivateKeyTest');
	}
	return test;
}

function runCredentialTest(data: Record<string, unknown>) {
	const test = credentialTest();
	return test.call({} as ICredentialTestFunctions, { data } as ICredentialsDecrypted);
}

describe('OpenPgpPrivateKeyApi', () => {
	it('is a credential type the manifest points at', () => {
		const credential = new OpenPgpPrivateKeyApi();

		expect(credential.name).toBe('openPgpPrivateKeyApi');
		expect(credential.displayName).toBe('OpenPGP Private Key API');
		expect(credential.documentationUrl).toMatch(/^https:\/\//);
		expect(manifest.n8n.credentials).toContain(
			`dist/credentials/${credential.constructor.name}.credentials.js`,
		);
		expect(manifest.n8n.nodes).toContain('dist/nodes/OpenPgp/OpenPgp.node.js');
	});

	it('keeps both secrets masked and the key required', () => {
		const [privateKey, passphrase] = new OpenPgpPrivateKeyApi().properties;

		expect(privateKey.name).toBe('privateKey');
		expect(privateKey.type).toBe('string');
		expect(privateKey.typeOptions).toMatchObject({ password: true, rows: 6 });
		expect(privateKey.required).toBe(true);
		expect(passphrase.name).toBe('passphrase');
		expect(passphrase.typeOptions).toMatchObject({ password: true });
		// Unprotected keys are allowed, so the passphrase must not be required.
		expect(passphrase.required).toBeUndefined();
	});

	it('is declared on the node as optional and tested by this test', () => {
		const [declaration] = new OpenPgp().description.credentials ?? [];

		expect(declaration).toMatchObject({
			name: 'openPgpPrivateKeyApi',
			required: false,
			testedBy: 'openPgpPrivateKeyTest',
		});
	});
});

describe('the credential test', () => {
	it('accepts an unprotected private key and reports its key ID', async () => {
		const result = await runCredentialTest({ privateKey: fixture('keys', 'rsa-private.asc') });

		expect(result.status).toBe('OK');
		expect(result.message).toContain(fixture('keys', 'rsa-keyid.txt').trim().toLowerCase());
	});

	it('accepts a protected private key with its passphrase', async () => {
		const result = await runCredentialTest({
			privateKey: fixture('keys', 'curve-protected-private.asc'),
			passphrase: FIXTURE_PASSPHRASES.curve,
		});

		expect(result.status).toBe('OK');
	});

	it('rejects a protected private key with the wrong passphrase', async () => {
		const result = await runCredentialTest({
			privateKey: fixture('keys', 'curve-protected-private.asc'),
			passphrase: 'not-the-passphrase',
		});

		expect(result.status).toBe('Error');
		expect(result.message).toMatch(/passphrase/i);
	});

	it('rejects an empty or unreadable key', async () => {
		const empty = await runCredentialTest({ privateKey: '' });
		const junk = await runCredentialTest({ privateKey: 'not a key' });

		expect(empty).toEqual({ status: 'Error', message: 'No private key was provided' });
		expect(junk.status).toBe('Error');
	});
});
