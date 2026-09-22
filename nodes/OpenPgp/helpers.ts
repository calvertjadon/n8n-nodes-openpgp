import * as openpgp from 'openpgp';
import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';

/**
 * Shared plumbing for every OpenPGP operation: the per-call config, key-input
 * hardening, text/binary input reading, output item building and the canonical
 * error copy.
 */

/** A single entry of `decrypt()`/`verify()`'s `signatures` array. */
export type SignatureEntry = openpgp.DecryptMessageResult['signatures'][number];

/** A parsed message, however it was read (armored text or binary packets). */
export type AnyMessage = openpgp.Message<Uint8Array | string>;

export type CompressionOption = 'none' | 'zip' | 'zlib';

/** Options that shape the per-call openpgp config, shared by all four actions. */
export interface ConfigOptions {
	compression?: CompressionOption;
	legacyCompatibility?: boolean;
}

/** Armored output and hide-recipients are encrypt/sign concerns. */
export interface EncryptOptions extends ConfigOptions {
	armorOutput?: boolean;
	hideRecipients?: boolean;
}

const MAX_ARGON2_MEMORY_EXPONENT = 20;

/** 512 MiB, matching the database binary-mode file cap. */
const MAX_DECOMPRESSED_MESSAGE_SIZE = 512 * 1024 * 1024;

const COMPRESSION_ALGORITHMS: Record<CompressionOption, openpgp.enums.compression> = {
	none: openpgp.enums.compression.uncompressed,
	zip: openpgp.enums.compression.zip,
	zlib: openpgp.enums.compression.zlib,
};

/**
 * Canonical error copy (spec §3.7). `message` names the failing parameter;
 * `description` says how to unblock.
 */
export const ERROR_COPY = {
	missingCredential: {
		message: 'This operation needs an OpenPGP Private Key credential — attach one to the node.',
		description:
			'Create an "OpenPGP Private Key API" credential holding the armored private key and, if the key is protected, its passphrase, then select it on this node.',
	},
	unreadableKey: {
		message:
			"Public Key(s) doesn't contain a readable OpenPGP key — paste the full armored block, including BEGIN/END lines.",
		description:
			'Copy the key from its BEGIN line through its END line. Binary key files must be exported as armored text first, for example with gpg --armor --export.',
	},
	unreadablePrivateKey: {
		message:
			"Private Key doesn't contain a readable OpenPGP key — paste the full armored block, including BEGIN/END lines.",
		description:
			'Fix the Private Key field in the credential: copy the key from its BEGIN line through its END line.',
	},
	privateKeyIsPublic: {
		message:
			"Private Key holds a public key — it can't decrypt or sign. Paste the armored private key block instead.",
		description:
			'Export the private key with gpg --armor --export-secret-keys <key ID>, including the BEGIN and END lines.',
	},
	decryptionFailed: {
		message:
			"Couldn't decrypt with this credential's private key — check the Passphrase, or that the message was encrypted for this key.",
		description:
			'Re-enter the Passphrase in the credential, and confirm the message was encrypted for the key this credential holds.',
	},
	passwordDecryptionFailed: {
		message:
			"Couldn't decrypt with this Password — check that it is the one the message was encrypted with.",
		description: 'Check the Password against the one the sender used to encrypt the message.',
	},
	unsignedMessage: {
		message: 'Message is not signed — Require Valid Signature is on.',
		description: 'Turn Require Valid Signature off to let unsigned data pass through.',
	},
	invalidSignature: {
		message: 'Signature did not verify — the message was not signed by any provided Public Key(s).',
		description:
			"Add the signer's public key to Public Key(s), or turn the throw option off to branch on the signature result instead.",
	},
	notUtf8Text: {
		message: 'Plaintext is not valid UTF-8 text — set Output As to Binary instead.',
		description: 'Binary output keeps the decrypted bytes exactly as they are.',
	},
} as const;

export type ErrorKind = keyof typeof ERROR_COPY;

/**
 * Builds the error thrown for every failure the node reports itself, carrying
 * the pinned copy, the item index and the underlying library error. The item
 * suffix is stamped on by `execute()`, which sees every error the node raises.
 */
export function operationError(
	ctx: IExecuteFunctions,
	kind: ErrorKind,
	itemIndex: number,
	cause?: Error,
	diagnosis?: string,
): NodeOperationError {
	const { message, description: hint } = ERROR_COPY[kind];
	// n8n's error panel does not surface `cause`, so the library's own reason goes
	// into the description: it is what tells a user which part of the input was wrong.
	const detail =
		diagnosis !== undefined
			? ` ${diagnosis}.`
			: cause instanceof Error && cause.message
				? ` The OpenPGP library reported: ${cause.message}`
				: '';
	const error = new NodeOperationError(ctx.getNode(), message, {
		itemIndex,
		description: `${hint}${detail}`,
	});
	if (cause !== undefined) {
		error.cause = cause;
	}
	return error;
}

/**
 * Builds the per-call openpgp config. `openpgp.config` is a process-global
 * singleton shared by every execution in the process, so it is never mutated:
 * every call receives its own config object.
 */
export function buildConfig(options: ConfigOptions): openpgp.PartialConfig {
	const config: openpgp.PartialConfig = {
		maxArgon2MemoryExponent: MAX_ARGON2_MEMORY_EXPONENT,
		maxDecompressedMessageSize: MAX_DECOMPRESSED_MESSAGE_SIZE,
		preferredCompressionAlgorithm: COMPRESSION_ALGORITHMS[options.compression ?? 'none'],
	};
	if (options.legacyCompatibility) {
		config.allowMissingKeyFlags = true;
		config.enableParsingV5Entities = true;
		config.parseAEADEncryptedV4KeysAsLegacy = true;
	}
	return config;
}

const ARMOR_BLOCK = /-----BEGIN PGP [^-]*-----[\s\S]*?-----END PGP [^-]*-----/g;
const ARMOR_HEADER = /^[A-Za-z][A-Za-z0-9-]*:/;
const BASE64_LINE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Normalises pasted key material into one entry per armored block: CRLF line
 * endings, surrounding junk and armor headers that carry no key data (a stray
 * `Version:` line) are removed. openpgp only reads the first block it is given,
 * so callers read the blocks one by one.
 */
export function splitArmoredBlocks(raw: string): string[] {
	// A value that carries literal `\n` escapes instead of newlines (pasted out of
	// JSON, YAML or an environment variable) has no line structure for the armor
	// parser at all, so rebuild it before anything else.
	const withNewlines = raw.includes('\\n') && !raw.includes('\n') ? raw.replace(/\\r\\n|\\n|\\r/g, '\n') : raw;
	const blocks = withNewlines.replace(/\r\n?/g, '\n').match(ARMOR_BLOCK) ?? [];
	return blocks.map(stripArmorHeaders);
}

/** Reads every armored block, since openpgp's readKeys stops at the first one. */
async function readKeyBlocks(
	blocks: string[],
	config: openpgp.PartialConfig,
): Promise<openpgp.PublicKey[]> {
	const keys: openpgp.PublicKey[] = [];
	for (const block of blocks) {
		keys.push(...(await openpgp.readKeys({ armoredKeys: block, config })));
	}
	return keys;
}

function stripArmorHeaders(block: string): string {
	// Armor is flush left: leading whitespace only ever comes from the surrounding
	// text it was copied out of (indented YAML, a markdown list, a quoted block).
	const lines = block.split('\n').map((line) => line.trim());
	const begin = lines.shift() ?? '';
	const end = lines.pop() ?? '';
	while (lines.length > 0 && ARMOR_HEADER.test(lines[0]) && !BASE64_LINE.test(lines[0])) {
		lines.shift();
	}
	// The body is base64 and a CRC line, neither of which contains whitespace, so
	// anything a word processor, email client or PDF paste inserted can go.
	const body = lines
		.map((line) => line.replace(/\s+/g, ''))
		.filter((line) => line !== '');
	return [begin, '', ...body, end].join('\n');
}

/** Names what is wrong with an armored block, when the library can only say "misformed". */
export function describeArmorProblem(armored: string): string | undefined {
	const lines = armored.split('\n');
	const begin = /^-----BEGIN PGP (.+)-----$/.exec(lines[0] ?? '');
	if (!begin) {
		return `the block does not start with a BEGIN line (it starts with ${JSON.stringify((lines[0] ?? '').slice(0, 40))})`;
	}
	// A key copied out of a quoted or dash-escaped message carries prefixes that
	// hide its own END line, so those are named before anything else.
	if (lines.some((line) => /^- /.test(line))) {
		return 'the paste looks dash-escaped from a quoted message — remove the leading "- " prefixes';
	}
	if (lines.some((line) => /^>/.test(line))) {
		return 'the paste came from a quoted message — remove the leading ">" prefixes';
	}
	const endIndex = lines.findIndex((line) => /^-----END PGP (.+)-----$/.test(line));
	if (endIndex === -1) {
		return `the ${begin[1]} block has no END line — the paste looks truncated`;
	}
	const endType = /^-----END PGP (.+)-----$/.exec(lines[endIndex])?.[1];
	if (endType !== begin[1]) {
		return `the block starts as ${begin[1]} but ends as ${endType}`;
	}
	const body = lines.slice(1, endIndex);
	for (const [index, line] of body.entries()) {
		if (line === '' || BASE64_LINE.test(line) || /^=[A-Za-z0-9+/]{4}$/.test(line)) {
			continue;
		}
		return `line ${index + 2} of the block is not valid armored data (${JSON.stringify(line.slice(0, 40))})`;
	}
	if (!body.some((line) => BASE64_LINE.test(line))) {
		return `the ${begin[1]} block has no key data between its BEGIN and END lines`;
	}
	return undefined;
}

/** Reads the armored key block of a key parameter into public keys. */
export async function readPublicKeys(
	ctx: IExecuteFunctions,
	armoredKeys: string,
	config: openpgp.PartialConfig,
	itemIndex: number,
): Promise<openpgp.PublicKey[]> {
	const blocks = splitArmoredBlocks(armoredKeys);
	if (blocks.length === 0) {
		throw operationError(ctx, 'unreadableKey', itemIndex);
	}
	let keys: openpgp.PublicKey[];
	try {
		keys = await readKeyBlocks(blocks, config);
	} catch (error) {
		throw operationError(ctx, 'unreadableKey', itemIndex, error, describeArmorProblem(blocks[0]));
	}
	if (keys.length === 0) {
		throw operationError(ctx, 'unreadableKey', itemIndex);
	}
	return keys;
}

/**
 * Reads the credential's armored private key and unlocks it with the
 * credential's passphrase. Unprotected keys are used as they are.
 */
export async function readCredentialPrivateKeys(
	ctx: IExecuteFunctions,
	config: openpgp.PartialConfig,
	itemIndex: number,
): Promise<openpgp.PrivateKey[]> {
	let credential: { privateKey?: string; passphrase?: string };
	try {
		credential = (await ctx.getCredentials('openPgpPrivateKeyApi')) as {
			privateKey?: string;
			passphrase?: string;
		};
	} catch (error) {
		throw operationError(ctx, 'missingCredential', itemIndex, error);
	}
	const blocks = splitArmoredBlocks(String(credential?.privateKey ?? ''));
	if (blocks.length === 0) {
		throw operationError(ctx, 'missingCredential', itemIndex);
	}
	let keys: openpgp.PublicKey[];
	try {
		keys = await readKeyBlocks(blocks, config);
	} catch (error) {
		throw operationError(
			ctx,
			'unreadablePrivateKey',
			itemIndex,
			error,
			describeArmorProblem(blocks[0]),
		);
	}
	const passphrase = credential.passphrase ?? '';
	const privateKeys: openpgp.PrivateKey[] = [];
	for (const key of keys) {
		if (!key.isPrivate()) {
			continue;
		}
		if (key.isDecrypted()) {
			privateKeys.push(key);
			continue;
		}
		try {
			privateKeys.push(await openpgp.decryptKey({ privateKey: key, passphrase, config }));
		} catch (error) {
			throw operationError(ctx, 'decryptionFailed', itemIndex, error);
		}
	}
	if (privateKeys.length === 0) {
		throw operationError(ctx, 'privateKeyIsPublic', itemIndex);
	}
	return privateKeys;
}

/** The input an action works on, already normalised to bytes. */
export interface InputPayload {
	bytes: Uint8Array;
	fileName?: string;
	/** Armored input can be parsed as text, whatever the source was. */
	armored: boolean;
	/** Set when the input came from an inline text parameter. */
	text?: string;
}

/** Reads either the inline text parameter or the input item's binary field. */
export async function readInput(
	ctx: IExecuteFunctions,
	itemIndex: number,
	sourceData: string,
	textParameter: string,
	binaryParameter: string,
): Promise<InputPayload> {
	if (sourceData === 'text') {
		const text = ctx.getNodeParameter(textParameter, itemIndex, '') as string;
		return { bytes: new TextEncoder().encode(text), armored: true, text };
	}
	const propertyName = ctx.getNodeParameter(binaryParameter, itemIndex, 'data') as string;
	const binaryData = ctx.helpers.assertBinaryData(itemIndex, propertyName);
	const bytes = await ctx.helpers.getBinaryDataBuffer(itemIndex, propertyName);
	return {
		bytes,
		fileName: binaryData.fileName,
		// Armor is ASCII, so a text-decoded prefix is enough to recognise it.
		armored: ARMOR_START.test(Buffer.from(bytes.subarray(0, 64)).toString('utf8')),
	};
}

const ARMOR_START = /^\s*-----BEGIN PGP/;

/** Cleartext signatures are armored text with their own header. */
export const CLEARTEXT_START = /^\s*-----BEGIN PGP SIGNED MESSAGE-----/;

/** Decodes plaintext as UTF-8, failing loudly instead of inserting U+FFFD. */
export function decodeUtf8(ctx: IExecuteFunctions, bytes: Uint8Array, itemIndex: number): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (error) {
		throw operationError(ctx, 'notUtf8Text', itemIndex, error);
	}
}

export function readMessage(input: InputPayload, config: openpgp.PartialConfig): Promise<AnyMessage> {
	return input.armored
		? openpgp.readMessage({ armoredMessage: Buffer.from(input.bytes).toString('utf8'), config })
		: openpgp.readMessage({ binaryMessage: input.bytes, config });
}

export function readSignature(
	input: InputPayload,
	config: openpgp.PartialConfig,
): Promise<openpgp.Signature> {
	return input.armored
		? openpgp.readSignature({ armoredSignature: Buffer.from(input.bytes).toString('utf8'), config })
		: openpgp.readSignature({ binarySignature: input.bytes, config });
}

/** Names the output artifact: the input file name, or `data`, plus a suffix. */
export function artifactFileName(fileName: string | undefined, suffix: string): string {
	return `${fileName || 'data'}${suffix}`;
}

export type ItemFields = IDataObject;

/** Text output mode: the artifact lands in a plain string field. */
export function textItem(
	fieldName: string,
	text: string,
	itemIndex: number,
	fields: ItemFields = {},
): INodeExecutionData {
	return {
		json: { [fieldName]: text, ...fields },
		pairedItem: { item: itemIndex },
	};
}

/** Binary output mode: bytes land in a binary field, metadata in `json`. */
export async function binaryItem(
	ctx: IExecuteFunctions,
	fieldName: string,
	bytes: Uint8Array,
	fileName: string,
	mimeType: string,
	itemIndex: number,
	fields: ItemFields = {},
): Promise<INodeExecutionData> {
	const binaryData = await ctx.helpers.prepareBinaryData(Buffer.from(bytes), fileName, mimeType);
	return {
		json: {
			mimeType,
			fileName,
			fileSize: bytes.byteLength,
			...fields,
		},
		binary: { [fieldName]: binaryData },
		pairedItem: { item: itemIndex },
	};
}

/** Flat signature result reported whenever verification keys were supplied. */
export interface SignatureOutcome {
	signed: boolean;
	verified: boolean;
	keyID: string | null;
}

/**
 * Collapses the per-signature packets into one result: `signed` when the
 * message carried any signature, `verified` when any of them verified, and the
 * first verifying signature's key ID.
 */
export async function collapseSignatures(signatures: SignatureEntry[]): Promise<SignatureOutcome> {
	const settled = await Promise.allSettled(signatures.map((entry) => entry.verified));
	const firstVerified = settled.findIndex(
		(result) => result.status === 'fulfilled' && result.value === true,
	);
	return {
		signed: signatures.length > 0,
		verified: firstVerified !== -1,
		keyID: firstVerified === -1 ? null : signatures[firstVerified].keyID.toHex(),
	};
}

/**
 * Applies Require Valid Signature / Throw on Invalid Signature to a result.
 * Decrypt separates "not signed" from "did not verify" so the user learns which
 * one it is; Verify reports both as a failed verification.
 */
export function assertSignatureOutcome(
	ctx: IExecuteFunctions,
	outcome: SignatureOutcome,
	itemIndex: number,
	requireValid: boolean,
	unsignedKind: ErrorKind,
): void {
	if (!requireValid) {
		return;
	}
	if (!outcome.signed) {
		throw operationError(ctx, unsignedKind, itemIndex);
	}
	if (!outcome.verified) {
		throw operationError(ctx, 'invalidSignature', itemIndex);
	}
}

/** True when the message's literal data packet is textual, not binary. */
export function literalDataIsText(message: AnyMessage): boolean {
	const literal = message
		.unwrapCompressed()
		.packets.find((packet) => packet instanceof openpgp.LiteralDataPacket);
	const format = (literal as { format?: openpgp.enums.literal } | undefined)?.format;
	return format !== undefined && format !== openpgp.enums.literal.binary;
}
