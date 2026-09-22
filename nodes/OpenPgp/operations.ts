import * as openpgp from 'openpgp';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import {
	artifactFileName,
	assertSignatureOutcome,
	binaryItem,
	buildConfig,
	CLEARTEXT_START,
	collapseSignatures,
	decodeUtf8,
	literalDataIsText,
	operationError,
	readCredentialPrivateKeys,
	readInput,
	readMessage,
	readPublicKeys,
	readSignature,
	textItem,
	type AnyMessage,
	type ConfigOptions,
	type EncryptOptions,
	type ItemFields,
	type SignatureOutcome,
} from './helpers';

/**
 * The four operations. Each one is a self-contained per-item translation of
 * node parameters into openpgp calls and back into n8n items.
 */

/** Literal data packets are marked as text for inline text input. */
function literalFormat(input: { text?: string }): 'binary' | 'text' {
	return input.text === undefined ? 'binary' : 'text';
}

export async function encrypt(ctx: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const sourceData = ctx.getNodeParameter('sourceData', itemIndex) as string;
	const encryptUsing = ctx.getNodeParameter('encryptUsing', itemIndex) as string;
	const outputAs = ctx.getNodeParameter('outputAs', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as EncryptOptions;
	const config = buildConfig(options);
	const input = await readInput(ctx, itemIndex, sourceData, 'textToEncrypt', 'binaryPropertyName');
	const message = await openpgp.createMessage({
		binary: input.bytes,
		filename: input.fileName,
		format: literalFormat(input),
	});
	const encryptOptions: openpgp.EncryptOptions = {
		message,
		signingKeys: (ctx.getNodeParameter('alsoSign', itemIndex, false) as boolean)
			? await readCredentialPrivateKeys(ctx, config, itemIndex)
			: undefined,
		config,
	};
	if (encryptUsing === 'password') {
		encryptOptions.passwords = [ctx.getNodeParameter('password', itemIndex, '') as string];
	} else {
		encryptOptions.encryptionKeys = await readPublicKeys(
			ctx,
			ctx.getNodeParameter('publicKeys', itemIndex, '') as string,
			config,
			itemIndex,
		);
		encryptOptions.wildcard = options.hideRecipients === true;
	}
	// Text output is always armored; the Armor Output option only shapes binary output.
	if (outputAs === 'text') {
		const armoredText = await openpgp.encrypt({ ...encryptOptions, format: 'armored' });
		const fieldName = ctx.getNodeParameter('outputFieldName', itemIndex, 'data') as string;
		return textItem(fieldName, armoredText, itemIndex);
	}
	const armored = options.armorOutput !== false;
	const encrypted = armored
		? await openpgp.encrypt({ ...encryptOptions, format: 'armored' })
		: await openpgp.encrypt({ ...encryptOptions, format: 'binary' });
	return binaryItem(
		ctx,
		ctx.getNodeParameter('outputBinaryFieldName', itemIndex, 'data') as string,
		typeof encrypted === 'string' ? Buffer.from(encrypted, 'utf8') : Buffer.from(encrypted),
		artifactFileName(input.fileName, armored ? '.asc' : '.pgp'),
		'application/pgp-encrypted',
		itemIndex,
	);
}

export async function decrypt(ctx: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const sourceData = ctx.getNodeParameter('sourceData', itemIndex) as string;
	const decryptUsing = ctx.getNodeParameter('decryptUsing', itemIndex) as string;
	const outputAs = ctx.getNodeParameter('outputAs', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as ConfigOptions;
	const config = buildConfig(options);
	const input = await readInput(ctx, itemIndex, sourceData, 'textToDecrypt', 'binaryPropertyName');
	const message = await readMessage(input, config);
	const armoredVerificationKeys = ctx.getNodeParameter('publicKeys', itemIndex, '') as string;
	const verificationKeys =
		armoredVerificationKeys.trim() === ''
			? undefined
			: await readPublicKeys(ctx, armoredVerificationKeys, config, itemIndex);
	const decryptOptions: openpgp.DecryptOptions & { message: AnyMessage; format: 'binary' } = {
		message,
		verificationKeys,
		format: 'binary',
		config,
	};
	const usingCredential = decryptUsing !== 'password';
	if (usingCredential) {
		decryptOptions.decryptionKeys = await readCredentialPrivateKeys(ctx, config, itemIndex);
	} else {
		decryptOptions.passwords = [ctx.getNodeParameter('password', itemIndex, '') as string];
	}
	let result: openpgp.DecryptMessageResult & { data: Uint8Array };
	try {
		result = await openpgp.decrypt(decryptOptions);
	} catch (error) {
		throw operationError(
			ctx,
			usingCredential ? 'decryptionFailed' : 'passwordDecryptionFailed',
			itemIndex,
			error,
		);
	}
	const outcome = await collapseSignatures(result.signatures ?? []);
	assertSignatureOutcome(
		ctx,
		outcome,
		itemIndex,
		ctx.getNodeParameter('requireValidSignature', itemIndex, false) as boolean,
		'unsignedMessage',
	);
	const fields: ItemFields =
		verificationKeys === undefined
			? {}
			: { signed: outcome.signed, verified: outcome.verified, keyID: outcome.keyID };
	if (outputAs === 'text') {
		const fieldName = ctx.getNodeParameter('outputFieldName', itemIndex, 'data') as string;
		return textItem(fieldName, decodeUtf8(ctx, result.data, itemIndex), itemIndex, fields);
	}
	return binaryItem(
		ctx,
		ctx.getNodeParameter('outputBinaryFieldName', itemIndex, 'data') as string,
		result.data,
		result.filename || 'data',
		'application/octet-stream',
		itemIndex,
		fields,
	);
}

export async function sign(ctx: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const signatureType = ctx.getNodeParameter('signatureType', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as EncryptOptions;
	const config = buildConfig(options);
	const signingKeys = await readCredentialPrivateKeys(ctx, config, itemIndex);
	if (signatureType === 'cleartext') {
		// Cleartext signing is string-only in openpgp, and always armored.
		const cleartext = await openpgp.createCleartextMessage({
			text: ctx.getNodeParameter('textToSign', itemIndex, '') as string,
		});
		const signed = await openpgp.sign({ message: cleartext, signingKeys, format: 'armored', config });
		const fieldName = ctx.getNodeParameter('outputFieldName', itemIndex, 'data') as string;
		return textItem(fieldName, signed, itemIndex);
	}
	const input = await readInput(
		ctx,
		itemIndex,
		ctx.getNodeParameter('sourceData', itemIndex) as string,
		'textToSign',
		'binaryPropertyName',
	);
	const message = await openpgp.createMessage({
		binary: input.bytes,
		filename: input.fileName,
		format: literalFormat(input),
	});
	const detached = signatureType === 'detached';
	if ((ctx.getNodeParameter('outputAs', itemIndex, 'text') as string) === 'text') {
		const armoredSignature = await openpgp.sign({
			message,
			signingKeys,
			detached,
			format: 'armored',
			config,
		});
		const fieldName = ctx.getNodeParameter('outputFieldName', itemIndex, 'data') as string;
		return textItem(fieldName, armoredSignature, itemIndex);
	}
	const armored = options.armorOutput !== false;
	const signed = armored
		? await openpgp.sign({ message, signingKeys, detached, format: 'armored', config })
		: await openpgp.sign({ message, signingKeys, detached, format: 'binary', config });
	const suffix = detached ? '.sig' : armored ? '.asc' : '.pgp';
	return binaryItem(
		ctx,
		ctx.getNodeParameter('outputBinaryFieldName', itemIndex, 'data') as string,
		typeof signed === 'string' ? Buffer.from(signed, 'utf8') : Buffer.from(signed),
		artifactFileName(input.fileName, suffix),
		'application/pgp-signature',
		itemIndex,
	);
}

export async function verify(ctx: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const signatureType = ctx.getNodeParameter('signatureType', itemIndex, 'detached') as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as ConfigOptions;
	const config = buildConfig(options);
	const publicKeys = await readPublicKeys(
		ctx,
		ctx.getNodeParameter('publicKeys', itemIndex, '') as string,
		config,
		itemIndex,
	);
	let signatures: SignatureOutcome;
	// Recovered plaintext is only reported for textual content (cleartext and
	// text-format literal packets); binary literal data needs Decrypt and a key.
	let recovered: string | undefined;

	if (signatureType === 'embedded') {
		const input = await readInput(
			ctx,
			itemIndex,
			ctx.getNodeParameter('sourceData', itemIndex) as string,
			'messageText',
			'messageBinaryPropertyName',
		);
		if (CLEARTEXT_START.test(Buffer.from(input.bytes.subarray(0, 64)).toString('utf8'))) {
			const cleartext = await openpgp.readCleartextMessage({
				cleartextMessage: Buffer.from(input.bytes).toString('utf8'),
				config,
			});
			// Cleartext messages can only be returned as text by openpgp.
			const result = await openpgp.verify({
				message: cleartext,
				verificationKeys: publicKeys,
				format: 'utf8',
				config,
			});
			signatures = await collapseSignatures(result.signatures);
			recovered = result.data;
		} else {
			const message = await readMessage(input, config);
			const verifyOptions: openpgp.VerifyOptions & {
				message: AnyMessage;
				format: 'binary';
			} = {
				message,
				verificationKeys: publicKeys,
				format: 'binary',
				config,
			};
			const result = await openpgp.verify(verifyOptions);
			signatures = await collapseSignatures(result.signatures);
			if (literalDataIsText(message)) {
				try {
					recovered = new TextDecoder('utf-8', { fatal: true }).decode(result.data);
				} catch {
					// A text-format packet that is not valid UTF-8 carries no recoverable text.
					recovered = undefined;
				}
			}
		}
	} else {
		const messageInput = await readInput(
			ctx,
			itemIndex,
			ctx.getNodeParameter('messageSource', itemIndex) as string,
			'messageText',
			'messageBinaryPropertyName',
		);
		const signatureInput = await readInput(
			ctx,
			itemIndex,
			ctx.getNodeParameter('signatureSource', itemIndex, 'text') as string,
			'signatureText',
			'signatureBinaryPropertyName',
		);
		const message = await openpgp.createMessage({
			binary: messageInput.bytes,
			filename: messageInput.fileName,
			format: literalFormat(messageInput),
		});
		const verifyOptions: openpgp.VerifyOptions & { message: AnyMessage; format: 'binary' } = {
			message,
			signature: await readSignature(signatureInput, config),
			verificationKeys: publicKeys,
			format: 'binary',
			config,
		};
		const result = await openpgp.verify(verifyOptions);
		signatures = await collapseSignatures(result.signatures);
	}

	assertSignatureOutcome(
		ctx,
		signatures,
		itemIndex,
		ctx.getNodeParameter('throwOnInvalidSignature', itemIndex, true) as boolean,
		'invalidSignature',
	);
	const json: ItemFields = {
		verified: signatures.verified,
		signed: signatures.signed,
		keyID: signatures.keyID,
	};
	if (recovered !== undefined) {
		json.data = recovered;
	}
	return { json, pairedItem: { item: itemIndex } };
}
