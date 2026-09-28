import { NodeHelpers, type INode, type INodeParameters } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { OpenPgp } from '../nodes/OpenPgp/OpenPgp.node';

/**
 * The locked parameter table (§3.2-§3.5), asserted with n8n's own visibility
 * helper: `displayParameter` is the function the editor uses, so these
 * expectations are exactly what a user sees — including that a field declaring
 * two displayOptions entries (the Sign text field, the Verify message fields)
 * still renders once.
 */

const description = new OpenPgp().description;
const node = { typeVersion: description.version } as INode;

function isVisible(values: INodeParameters, parameter: INodeParameters): boolean {
	return NodeHelpers.displayParameter(values, parameter, node, description);
}

/** Internal parameter names visible for a given set of node values. */
function visibleParameters(values: INodeParameters, operation: string): string[] {
	const nodeValues = { operation, ...values } as INodeParameters;
	return description.properties
		.filter((property) => isVisible(nodeValues, property as INodeParameters))
		.map((property) => property.name);
}

/**
 * The Options collection items a user can add for a given set of node values.
 * Collection items are evaluated the way the editor does it: from the node
 * values path, so items can address top-level parameters from the root.
 */
function visibleOptions(values: INodeParameters, operation: string): string[] {
	const nodeValues = { operation, ...values } as INodeParameters;
	const options = description.properties.find(
		(property) => property.name === 'options' && isVisible(nodeValues, property as INodeParameters),
	);
	if (!options?.options) {
		throw new Error(`no Options collection for ${operation} with ${JSON.stringify(values)}`);
	}
	const nodeWithParameters = { parameters: { ...nodeValues, options: values.options ?? {} } };
	return options.options
		.filter(
			(item) =>
				NodeHelpers.displayParameterPath(
					nodeWithParameters,
					item as INodeParameters,
					'parameters.options',
					node,
					description,
				),
		)
		.map((item) => item.name as string);
}

function countOf(names: string[], name: string): number {
	return names.filter((candidate) => candidate === name).length;
}

describe('credential visibility', () => {
	const [credential] = description.credentials ?? [];

	/** Whether the credential row is offered, as the editor decides it. */
	function credentialVisible(values: INodeParameters): boolean {
		return NodeHelpers.displayParameter(
			values,
			credential as unknown as INodeParameters,
			node,
			description,
		);
	}

	it('offers the private key credential wherever an operation can use it', () => {
		expect(credentialVisible({ operation: 'sign' })).toBe(true);
		expect(credentialVisible({ operation: 'encrypt', encryptUsing: 'publicKeys' })).toBe(true);
		expect(credentialVisible({ operation: 'decrypt', decryptUsing: 'privateKey' })).toBe(true);
	});

	it('hides it where it cannot be used: Verify, and password-mode decryption', () => {
		// Verify works from public keys alone, so a private-key row there reads as a
		// requirement that does not exist; password-mode decryption never touches it.
		expect(credentialVisible({ operation: 'verify' })).toBe(false);
		expect(credentialVisible({ operation: 'decrypt', decryptUsing: 'password' })).toBe(false);
	});
});

describe('Sign parameters', () => {
	it('shows the cleartext fields and hides the source/output discriminators', () => {
		const names = visibleParameters({ signatureType: 'cleartext' }, 'sign');

		expect(names).toEqual(['operation', 'signatureType', 'textToSign', 'outputFieldName', 'options']);
		expect(countOf(names, 'textToSign')).toBe(1);
	});

	it('shows inline text for the detached and inline text path', () => {
		const names = visibleParameters(
			{ signatureType: 'detached', sourceData: 'text', outputAs: 'text' },
			'sign',
		);

		expect(names).toEqual([
			'operation',
			'signatureType',
			'sourceData',
			'textToSign',
			'outputAs',
			'outputFieldName',
			'options',
		]);
		expect(countOf(names, 'textToSign')).toBe(1);
	});

	it('shows the binary field for the detached and inline binary path', () => {
		const names = visibleParameters(
			{ signatureType: 'inline', sourceData: 'binary', outputAs: 'binary' },
			'sign',
		);

		expect(names).toEqual([
			'operation',
			'signatureType',
			'sourceData',
			'binaryPropertyName',
			'outputAs',
			'outputBinaryFieldName',
			'options',
		]);
	});

	it('offers the armor option only for binary output', () => {
		expect(visibleOptions({ signatureType: 'detached', outputAs: 'binary' }, 'sign')).toEqual([
			'armorOutput',
			'legacyCompatibility',
		]);
		expect(visibleOptions({ signatureType: 'detached', outputAs: 'text' }, 'sign')).toEqual([
			'legacyCompatibility',
		]);
		expect(visibleOptions({ signatureType: 'cleartext' }, 'sign')).toEqual(['legacyCompatibility']);
	});
});

describe('Verify parameters', () => {
	it('shows both message and signature inputs for a detached signature', () => {
		const names = visibleParameters(
			{ signatureType: 'detached', messageSource: 'binary', signatureSource: 'text' },
			'verify',
		);

		expect(names).toEqual([
			'operation',
			'signatureType',
			'messageSource',
			'messageBinaryPropertyName',
			'signatureSource',
			'signatureText',
			'publicKeys',
			'throwOnInvalidSignature',
			'options',
		]);
	});

	it('uses distinct parameters for the message and signature data fields', () => {
		const names = visibleParameters(
			{ signatureType: 'detached', messageSource: 'binary', signatureSource: 'binary' },
			'verify',
		);

		expect(names).toContain('messageBinaryPropertyName');
		expect(names).toContain('signatureBinaryPropertyName');
		expect(countOf(names, 'binaryPropertyName')).toBe(0);
	});

	it('shows one message field per source for an embedded signature', () => {
		const binary = visibleParameters({ signatureType: 'embedded', sourceData: 'binary' }, 'verify');
		const text = visibleParameters({ signatureType: 'embedded', sourceData: 'text' }, 'verify');

		expect(binary).toEqual([
			'operation',
			'signatureType',
			'sourceData',
			'messageBinaryPropertyName',
			'publicKeys',
			'throwOnInvalidSignature',
			'options',
		]);
		expect(text).toEqual([
			'operation',
			'signatureType',
			'sourceData',
			'messageText',
			'publicKeys',
			'throwOnInvalidSignature',
			'options',
		]);
		expect(countOf(text, 'messageText')).toBe(1);
	});

	it('offers legacy compatibility only', () => {
		expect(visibleOptions({ signatureType: 'detached' }, 'verify')).toEqual(['legacyCompatibility']);
	});
});

describe('Encrypt parameters', () => {
	it('shows the public-key path by default', () => {
		const names = visibleParameters(
			{ sourceData: 'binary', encryptUsing: 'publicKeys', outputAs: 'binary' },
			'encrypt',
		);

		expect(names).toEqual([
			'operation',
			'sourceData',
			'binaryPropertyName',
			'encryptUsing',
			'publicKeys',
			'alsoSign',
			'outputAs',
			'outputBinaryFieldName',
			'options',
		]);
	});

	it('offers every option for the key path with binary output', () => {
		expect(visibleOptions({ encryptUsing: 'publicKeys', outputAs: 'binary' }, 'encrypt')).toEqual([
			'armorOutput',
			'compression',
			'hideRecipients',
			'legacyCompatibility',
		]);
	});

	it('hides the options that do not apply to the chosen mode', () => {
		expect(visibleOptions({ encryptUsing: 'password', outputAs: 'binary' }, 'encrypt')).toEqual([
			'armorOutput',
			'compression',
			'legacyCompatibility',
		]);
		expect(visibleOptions({ encryptUsing: 'publicKeys', outputAs: 'text' }, 'encrypt')).toEqual([
			'compression',
			'hideRecipients',
			'legacyCompatibility',
		]);
	});
});

describe('Decrypt parameters', () => {
	it('shows the private-key path by default', () => {
		const names = visibleParameters({ sourceData: 'binary', decryptUsing: 'privateKey', outputAs: 'binary' }, 'decrypt');

		expect(names).toEqual([
			'operation',
			'sourceData',
			'binaryPropertyName',
			'decryptUsing',
			'publicKeys',
			'requireValidSignature',
			'outputAs',
			'outputBinaryFieldName',
			'options',
		]);
	});

	it('offers legacy compatibility only', () => {
		expect(visibleOptions({ decryptUsing: 'privateKey' }, 'decrypt')).toEqual(['legacyCompatibility']);
	});
});