import * as openpgp from 'openpgp';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type ICredentialTestFunctions,
	type ICredentialsDecrypted,
	type IExecuteFunctions,
	type INodeCredentialTestResult,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { buildConfig, splitArmoredBlocks } from './helpers';
import { decrypt, encrypt, sign, verify } from './operations';

const OPERATIONS: Record<
	string,
	(ctx: IExecuteFunctions, itemIndex: number) => Promise<INodeExecutionData>
> = { decrypt, encrypt, sign, verify };

const ARMORED_KEY_HINT =
	'Copy the key from its BEGIN line through its END line. Binary key files must be exported as armored text first';

const armorOutputOption = (description: string, displayOptions?: INodeProperties['displayOptions']): INodeProperties => ({
	displayName: 'Armor Output',
	name: 'armorOutput',
	type: 'boolean',
	default: true,
	description,
	...(displayOptions ? { displayOptions } : {}),
});

const compressionOption: INodeProperties = {
	displayName: 'Compression',
	name: 'compression',
	type: 'options',
	default: 'none',
	description:
		'The compression algorithm applied to the message before it is encrypted. With public keys the recipients must support the chosen algorithm, otherwise the message is left uncompressed.',
	options: [
		{ name: 'None', value: 'none' },
		{ name: 'ZIP', value: 'zip' },
		{ name: 'ZLIB', value: 'zlib' },
	],
};

const hideRecipientsOption = (displayOptions?: INodeProperties['displayOptions']): INodeProperties => ({
	displayName: 'Hide Recipients',
	name: 'hideRecipients',
	type: 'boolean',
	default: false,
	description: 'Whether to encrypt without recording the recipient key IDs in the message',
	...(displayOptions ? { displayOptions } : {}),
});

const legacyCompatibilityOption: INodeProperties = {
	displayName: 'Legacy Compatibility',
	name: 'legacyCompatibility',
	type: 'boolean',
	default: false,
	description:
		'Whether to accept legacy OpenPGP material that modern defaults reject: keys without usage flags, v5 entities, and v4 keys AEAD-encrypted by OpenPGP.js v5. The last case is only correct for keys that OpenPGP.js v5 encrypted.',
};

/** The Options collection is per operation: each action lists what it honours. */
const optionsProperty = (operation: string, items: INodeProperties[]): INodeProperties => ({
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add option',
	default: {},
	displayOptions: { show: { operation: [operation] } },
	options: items,
});

export class OpenPgp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenPGP',
		name: 'openPgp',
		icon: 'file:openPgp.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Encrypt, decrypt, sign, and verify data with OpenPGP — key-based or password-based',
		defaults: {
			name: 'OpenPGP',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// n8n types this as `true | UsableAsToolDescription`, so a node cannot opt
		// out with `false`; the community lint rule requires the property to be
		// present. Agents can still drive the text path by setting Source Data and
		// Output As explicitly.
		usableAsTool: true,
		credentials: [
			{
				name: 'openPgpPrivateKeyApi',
				required: false,
				testedBy: 'openPgpPrivateKeyTest',
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'encrypt',
				options: [
					{
						name: 'Decrypt',
						value: 'decrypt',
						action: 'Decrypt data',
						description: 'Decrypt a message with a private key or password',
					},
					{
						name: 'Encrypt',
						value: 'encrypt',
						action: 'Encrypt data',
						description: 'Encrypt data with a public key or password',
					},
					{
						name: 'Sign',
						value: 'sign',
						action: 'Sign data',
						description: 'Sign data with a private key',
					},
					{
						name: 'Verify',
						value: 'verify',
						action: 'Verify a signature',
						description: 'Verify a signature with a public key',
					},
				],
			},

			// Encrypt
			{
				displayName: 'Source Data',
				name: 'sourceData',
				type: 'options',
				default: 'binary',
				description: 'Where the data to encrypt comes from',
				displayOptions: { show: { operation: ['encrypt'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			{
				displayName: 'Text to Encrypt',
				name: 'textToEncrypt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The inline text to encrypt, taken exactly as typed',
				displayOptions: { show: { operation: ['encrypt'], sourceData: ['text'] } },
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				placeholder: 'e.g. data',
				hint: 'The name of the binary field holding the file to encrypt',
				description: 'The file name of the input file is embedded in the encrypted message',
				displayOptions: { show: { operation: ['encrypt'], sourceData: ['binary'] } },
			},
			{
				displayName: 'Encrypt Using',
				name: 'encryptUsing',
				type: 'options',
				default: 'publicKeys',
				description: 'How the data is encrypted: for one or more public keys, or with a shared password',
				displayOptions: { show: { operation: ['encrypt'] } },
				options: [
					{ name: 'Public Keys', value: 'publicKeys' },
					{ name: 'Password', value: 'password' },
				],
			},
			{
				displayName: 'Public Key(s)',
				name: 'publicKeys',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				placeholder: 'e.g. -----BEGIN PGP PUBLIC KEY BLOCK-----',
				hint: ARMORED_KEY_HINT,
				description: 'One or more armored public keys to encrypt for, one recipient per key',
				displayOptions: { show: { operation: ['encrypt'], encryptUsing: ['publicKeys'] } },
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				placeholder: 'e.g. the shared password',
				description: 'The shared password the message is encrypted with',
				displayOptions: { show: { operation: ['encrypt'], encryptUsing: ['password'] } },
			},
			{
				displayName: 'Also Sign',
				name: 'alsoSign',
				type: 'boolean',
				default: false,
				description:
					"Whether to sign the message with the credential's private key as well. Works with both public keys and a password.",
				displayOptions: { show: { operation: ['encrypt'] } },
			},
			{
				displayName: 'Output As',
				name: 'outputAs',
				type: 'options',
				default: 'binary',
				description: 'Where the encrypted result is written: a text field or a binary field',
				displayOptions: { show: { operation: ['encrypt'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				description: 'The name of the field to write the armored result to',
				displayOptions: { show: { operation: ['encrypt'], outputAs: ['text'] } },
			},
			{
				displayName: 'Put Output File in Field',
				name: 'outputBinaryFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				hint: 'The name of the binary field to write the encrypted file to',
				description: 'The output file is named after the input file, with an .asc or .pgp suffix',
				displayOptions: { show: { operation: ['encrypt'], outputAs: ['binary'] } },
			},
			optionsProperty('encrypt', [
				// Text output is always armored, so the option only shapes binary output.
				armorOutputOption('Whether to write armored output instead of raw OpenPGP packets', {
					show: { outputAs: ['binary'] },
				}),
				compressionOption,
				hideRecipientsOption({ show: { encryptUsing: ['publicKeys'] } }),
				legacyCompatibilityOption,
			]),

			// Decrypt
			{
				displayName: 'Source Data',
				name: 'sourceData',
				type: 'options',
				default: 'binary',
				description: 'Where the message to decrypt comes from',
				displayOptions: { show: { operation: ['decrypt'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			{
				displayName: 'Text to Decrypt',
				name: 'textToDecrypt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The armored message to decrypt',
				displayOptions: { show: { operation: ['decrypt'], sourceData: ['text'] } },
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				placeholder: 'e.g. data',
				hint: 'The name of the binary field holding the message to decrypt',
				description: 'Armored and binary messages are both accepted',
				displayOptions: { show: { operation: ['decrypt'], sourceData: ['binary'] } },
			},
			{
				displayName: 'Decrypt Using',
				name: 'decryptUsing',
				type: 'options',
				default: 'privateKey',
				description: 'How the message is decrypted: with the credential private key, or with a shared password',
				displayOptions: { show: { operation: ['decrypt'] } },
				options: [
					{ name: 'Private Key (Credential)', value: 'privateKey' },
					{ name: 'Password', value: 'password' },
				],
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				placeholder: 'e.g. the shared password',
				description: 'The shared password the message was encrypted with',
				displayOptions: { show: { operation: ['decrypt'], decryptUsing: ['password'] } },
			},
			{
				displayName: 'Public Key(s)',
				name: 'publicKeys',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				placeholder: 'e.g. -----BEGIN PGP PUBLIC KEY BLOCK-----',
				hint: ARMORED_KEY_HINT,
				description: 'One or more armored public keys to verify the message signature with',
				displayOptions: { show: { operation: ['decrypt'] } },
			},
			{
				displayName: 'Require Valid Signature',
				name: 'requireValidSignature',
				type: 'boolean',
				default: false,
				description:
					'Whether to fail instead of returning data when the message is not signed by one of the provided Public Key(s)',
				displayOptions: { show: { operation: ['decrypt'] } },
			},
			{
				displayName: 'Output As',
				name: 'outputAs',
				type: 'options',
				default: 'binary',
				description: 'Where the decrypted result is written: a text field or a binary field',
				displayOptions: { show: { operation: ['decrypt'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				description: 'The name of the field to write the decrypted text to',
				displayOptions: { show: { operation: ['decrypt'], outputAs: ['text'] } },
			},
			{
				displayName: 'Put Output File in Field',
				name: 'outputBinaryFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				hint: 'The name of the binary field to write the decrypted file to',
				description: 'The output file is named after the name embedded in the message',
				displayOptions: { show: { operation: ['decrypt'], outputAs: ['binary'] } },
			},
			optionsProperty('decrypt', [legacyCompatibilityOption]),

			// Sign
			{
				displayName: 'Signature Type',
				name: 'signatureType',
				type: 'options',
				default: 'detached',
				description: 'The kind of signature to create: detached, cleartext or inline',
				displayOptions: { show: { operation: ['sign'] } },
				options: [
					{ name: 'Detached', value: 'detached' },
					{ name: 'Cleartext', value: 'cleartext' },
					{ name: 'Inline', value: 'inline' },
				],
			},
			{
				displayName: 'Source Data',
				name: 'sourceData',
				type: 'options',
				default: 'binary',
				description: 'Where the data to sign comes from',
				displayOptions: { show: { operation: ['sign'], signatureType: ['detached', 'inline'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			// Cleartext signing is text-only, so the text field is shown whenever
			// Source Data is Text or the signature type is Cleartext.
			{
				displayName: 'Text to Sign',
				name: 'textToSign',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The text to sign in place, which stays readable in the output',
				displayOptions: { show: { operation: ['sign'], signatureType: ['cleartext'] } },
			},
			{
				displayName: 'Text to Sign',
				name: 'textToSign',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The inline text to sign',
				displayOptions: {
					show: { operation: ['sign'], signatureType: ['detached', 'inline'], sourceData: ['text'] },
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				placeholder: 'e.g. data',
				hint: 'The name of the binary field holding the file to sign',
				description: 'The file name of the input file is embedded in an inline signed message',
				displayOptions: {
					show: { operation: ['sign'], signatureType: ['detached', 'inline'], sourceData: ['binary'] },
				},
			},
			{
				displayName: 'Output As',
				name: 'outputAs',
				type: 'options',
				default: 'text',
				description: 'Where the signature is written: a text field or a binary field',
				displayOptions: { show: { operation: ['sign'], signatureType: ['detached', 'inline'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			// Cleartext signatures are always written as text, so the field is
			// shown for Cleartext and for the text output of the other types.
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				description: 'The name of the field to write the signature to',
				displayOptions: { show: { operation: ['sign'], signatureType: ['cleartext'] } },
			},
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				description: 'The name of the field to write the signature to',
				displayOptions: {
					show: { operation: ['sign'], signatureType: ['detached', 'inline'], outputAs: ['text'] },
				},
			},
			{
				displayName: 'Put Output File in Field',
				name: 'outputBinaryFieldName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data',
				hint: 'The name of the binary field to write the signature to',
				description: 'The output file is named after the input file, with a .sig, .asc or .pgp suffix',
				displayOptions: { show: { operation: ['sign'], signatureType: ['detached', 'inline'], outputAs: ['binary'] } },
			},
			optionsProperty('sign', [
				armorOutputOption('Whether to write an armored signature instead of raw OpenPGP packets', {
					show: { signatureType: ['detached', 'inline'], outputAs: ['binary'] },
				}),
				legacyCompatibilityOption,
			]),

			// Verify
			{
				displayName: 'Signature Type',
				name: 'signatureType',
				type: 'options',
				default: 'detached',
				description: 'Whether the signature travels separately from the message, or is embedded in it',
				displayOptions: { show: { operation: ['verify'] } },
				options: [
					{ name: 'Detached', value: 'detached' },
					{ name: 'Embedded', value: 'embedded' },
				],
			},
			{
				displayName: 'Message Source',
				name: 'messageSource',
				type: 'options',
				default: 'binary',
				description: 'Where the signed message comes from',
				displayOptions: { show: { operation: ['verify'], signatureType: ['detached'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			{
				displayName: 'Message Text',
				name: 'messageText',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The text the signature was created for',
				displayOptions: {
					show: { operation: ['verify'], signatureType: ['detached'], messageSource: ['text'] },
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'messageBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				placeholder: 'e.g. data',
				hint: 'The name of the binary field holding the message the signature was created for',
				description: 'The exact bytes of the message are verified, so use the unmodified file',
				displayOptions: {
					show: { operation: ['verify'], signatureType: ['detached'], messageSource: ['binary'] },
				},
			},
			{
				displayName: 'Signature Source',
				name: 'signatureSource',
				type: 'options',
				default: 'text',
				description: 'Where the detached signature comes from',
				displayOptions: { show: { operation: ['verify'], signatureType: ['detached'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			{
				displayName: 'Signature Text',
				name: 'signatureText',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The armored detached signature to verify',
				displayOptions: {
					show: { operation: ['verify'], signatureType: ['detached'], signatureSource: ['text'] },
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'signatureBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				placeholder: 'e.g. data',
				hint: 'The name of the binary field holding the detached signature',
				description: 'Armored and binary signatures are both accepted',
				displayOptions: {
					show: { operation: ['verify'], signatureType: ['detached'], signatureSource: ['binary'] },
				},
			},
			{
				displayName: 'Source Data',
				name: 'sourceData',
				type: 'options',
				default: 'binary',
				description: 'Where the signed message comes from',
				displayOptions: { show: { operation: ['verify'], signatureType: ['embedded'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'Binary', value: 'binary' },
				],
			},
			// Embedded verification takes the message from the same fields as
			// detached verification, keyed on its own discriminator.
			{
				displayName: 'Message Text',
				name: 'messageText',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The signed message, either a cleartext signature or an armored signed message',
				displayOptions: {
					show: { operation: ['verify'], signatureType: ['embedded'], sourceData: ['text'] },
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'messageBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				placeholder: 'e.g. data',
				hint: 'The name of the binary field holding the signed message',
				description: 'Armored and binary signed messages are both accepted',
				displayOptions: {
					show: { operation: ['verify'], signatureType: ['embedded'], sourceData: ['binary'] },
				},
			},
			{
				displayName: 'Public Key(s)',
				name: 'publicKeys',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				placeholder: 'e.g. -----BEGIN PGP PUBLIC KEY BLOCK-----',
				hint: ARMORED_KEY_HINT,
				description: 'One or more armored public keys to verify the signature with',
				displayOptions: { show: { operation: ['verify'] } },
			},
			{
				displayName: 'Throw on Invalid Signature',
				name: 'throwOnInvalidSignature',
				type: 'boolean',
				default: true,
				description:
					'Whether to fail when the signature does not verify against the provided Public Key(s). Turn this off to branch on the verified field instead.',
				displayOptions: { show: { operation: ['verify'] } },
			},
			optionsProperty('verify', [legacyCompatibilityOption]),
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const returnItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				returnItems.push(await OPERATIONS[operation](this, itemIndex));
			} catch (error) {
				// Every error the node reports names the item it came from.
				const message = `${(error as Error).message} [Item ${itemIndex}]`;
				if (this.continueOnFail()) {
					returnItems.push({ json: { error: message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, {
					itemIndex,
					description: (error as NodeOperationError).description ?? undefined,
				});
			}
		}

		return [returnItems];
	}

	methods = {
		credentialTest: {
			async openPgpPrivateKeyTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const { privateKey, passphrase } = credential.data as {
					privateKey?: string;
					passphrase?: string;
				};
				const config = buildConfig({});
				try {
					const blocks = splitArmoredBlocks(String(privateKey ?? ''));
					if (blocks.length === 0) {
						return { status: 'Error', message: 'No private key was provided' };
					}
					const keys = [];
					for (const block of blocks) {
						keys.push(...(await openpgp.readKeys({ armoredKeys: block, config })));
					}
					const privateKeys = keys.filter((key) => key.isPrivate());
					if (privateKeys.length === 0) {
						return {
							status: 'Error',
							message: 'The provided key block does not contain a private key',
						};
					}
					for (const key of privateKeys) {
						if (!key.isDecrypted()) {
							await openpgp.decryptKey({ privateKey: key, passphrase: passphrase ?? '', config });
						}
					}
					return {
						status: 'OK',
						message: `Private key is usable (key ID ${privateKeys[0].getKeyID().toHex()})`,
					};
				} catch (error) {
					return { status: 'Error', message: (error as Error).message };
				}
			},
		},
	};
}
