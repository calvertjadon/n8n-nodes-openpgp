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

/** The display names a user sees for a given set of node values. */
function visibleParameters(values: INodeParameters, operation: string): string[] {
	const nodeValues = { operation, ...values } as INodeParameters;
	return description.properties
		.filter((property) => isVisible(nodeValues, property as INodeParameters))
		.map((property) => property.displayName);
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
				) &&
				NodeHelpers.displayParameterPath(
					nodeWithParameters,
					item as INodeParameters,
					'parameters.options',
					node,
					description,
				),
		)
		.map((item) => item.displayName as string);
}

function countOf(names: string[], name: string): number {
	return names.filter((candidate) => candidate === name).length;
}

describe('Sign parameters', () => {
	it('shows the cleartext fields and hides the source/output discriminators', () => {
		const names = visibleParameters({ signatureType: 'cleartext' }, 'sign');

		expect(names).toEqual(['Operation', 'Signature Type', 'Text to Sign', 'Output Field Name', 'Options']);
		expect(countOf(names, 'Text to Sign')).toBe(1);
	});

	it('shows inline text for the detached and inline text path', () => {
		const names = visibleParameters(
			{ signatureType: 'detached', sourceData: 'text', outputAs: 'text' },
			'sign',
		);

		expect(names).toEqual([
			'Operation',
			'Signature Type',
			'Source Data',
			'Text to Sign',
			'Output As',
			'Output Field Name',
			'Options',
		]);
		expect(countOf(names, 'Text to Sign')).toBe(1);
	});

	it('shows the binary field for the detached and inline binary path', () => {
		const names = visibleParameters(
			{ signatureType: 'inline', sourceData: 'binary', outputAs: 'binary' },
			'sign',
		);

		expect(names).toEqual([
			'Operation',
			'Signature Type',
			'Source Data',
			'Input Binary Field',
			'Output As',
			'Put Output File in Field',
			'Options',
		]);
	});

	it('offers the armor option only for binary output', () => {
		expect(visibleOptions({ signatureType: 'detached', outputAs: 'binary' }, 'sign')).toEqual([
			'Armor Output',
			'Legacy Compatibility',
		]);
		expect(visibleOptions({ signatureType: 'detached', outputAs: 'text' }, 'sign')).toEqual([
			'Legacy Compatibility',
		]);
		expect(visibleOptions({ signatureType: 'cleartext' }, 'sign')).toEqual(['Legacy Compatibility']);
	});
});

describe('Verify parameters', () => {
	it('shows both message and signature inputs for a detached signature', () => {
		const names = visibleParameters(
			{ signatureType: 'detached', messageSource: 'binary', signatureSource: 'text' },
			'verify',
		);

		expect(names).toEqual([
			'Operation',
			'Signature Type',
			'Message Source',
			'Input Binary Field',
			'Signature Source',
			'Signature Text',
			'Public Key(s)',
			'Throw on Invalid Signature',
			'Options',
		]);
	});

	it('shows one message field per source for an embedded signature', () => {
		const binary = visibleParameters({ signatureType: 'embedded', sourceData: 'binary' }, 'verify');
		const text = visibleParameters({ signatureType: 'embedded', sourceData: 'text' }, 'verify');

		expect(binary).toEqual([
			'Operation',
			'Signature Type',
			'Source Data',
			'Input Binary Field',
			'Public Key(s)',
			'Throw on Invalid Signature',
			'Options',
		]);
		expect(text).toEqual([
			'Operation',
			'Signature Type',
			'Source Data',
			'Message Text',
			'Public Key(s)',
			'Throw on Invalid Signature',
			'Options',
		]);
		expect(countOf(text, 'Message Text')).toBe(1);
	});

	it('offers legacy compatibility only', () => {
		expect(visibleOptions({ signatureType: 'detached' }, 'verify')).toEqual(['Legacy Compatibility']);
	});
});

describe('Encrypt parameters', () => {
	it('shows the public-key path by default', () => {
		const names = visibleParameters(
			{ sourceData: 'binary', encryptUsing: 'publicKeys', outputAs: 'binary' },
			'encrypt',
		);

		expect(names).toEqual([
			'Operation',
			'Source Data',
			'Input Binary Field',
			'Encrypt Using',
			'Public Key(s)',
			'Also Sign',
			'Output As',
			'Put Output File in Field',
			'Options',
		]);
	});

	it('offers every option for the key path with binary output', () => {
		expect(visibleOptions({ encryptUsing: 'publicKeys', outputAs: 'binary' }, 'encrypt')).toEqual([
			'Armor Output',
			'Compression',
			'Hide Recipients',
			'Legacy Compatibility',
		]);
	});

	it('hides the options that do not apply to the chosen mode', () => {
		expect(visibleOptions({ encryptUsing: 'password', outputAs: 'binary' }, 'encrypt')).toEqual([
			'Armor Output',
			'Compression',
			'Legacy Compatibility',
		]);
		expect(visibleOptions({ encryptUsing: 'publicKeys', outputAs: 'text' }, 'encrypt')).toEqual([
			'Compression',
			'Hide Recipients',
			'Legacy Compatibility',
		]);
	});
});

describe('Decrypt parameters', () => {
	it('shows the private-key path by default', () => {
		const names = visibleParameters({ sourceData: 'binary', decryptUsing: 'privateKey', outputAs: 'binary' }, 'decrypt');

		expect(names).toEqual([
			'Operation',
			'Source Data',
			'Input Binary Field',
			'Decrypt Using',
			'Public Key(s)',
			'Require Valid Signature',
			'Output As',
			'Put Output File in Field',
			'Options',
		]);
	});

	it('offers legacy compatibility only', () => {
		expect(visibleOptions({ decryptUsing: 'privateKey' }, 'decrypt')).toEqual(['Legacy Compatibility']);
	});
});