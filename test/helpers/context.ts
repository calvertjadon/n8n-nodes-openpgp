import { NodeOperationError, type IExecuteFunctions, type INodeExecutionData } from 'n8n-workflow';
import { OpenPgp } from '../../nodes/OpenPgp/OpenPgp.node';

/**
 * Hand-rolled `IExecuteFunctions` double. The node is instantiated directly and
 * the crypto stays real — only n8n's execution context is faked.
 */

export interface BinaryFixture {
	data: Buffer;
	fileName?: string;
	mimeType?: string;
}

export interface HarnessOptions {
	/** Node parameters, as the n8n editor would have stored them. */
	parameters?: Record<string, unknown>;
	/** Input items; one empty item by default. */
	items?: INodeExecutionData[];
	/** Binary fields per item index: `binary[itemIndex][fieldName]`. */
	binary?: Record<number, Record<string, BinaryFixture>>;
	/** Credential data, or `null`/omitted for "no credential attached". */
	credential?: { privateKey: string; passphrase?: string } | null;
	continueOnFail?: boolean;
}

export function createContext(options: HarnessOptions = {}): IExecuteFunctions {
	const parameters = options.parameters ?? {};
	const items = options.items ?? [{ json: {} }];
	const binary = options.binary ?? {};
	const node = {
		id: 'test-node',
		name: 'OpenPGP',
		type: 'n8n-nodes-openpgp.openPgp',
		typeVersion: 1,
		position: [0, 0] as [number, number],
		parameters,
	};
	const binaryFixture = (itemIndex: number, fieldName: string): BinaryFixture => {
		const fixture = binary[itemIndex]?.[fieldName];
		if (!fixture) {
			throw new NodeOperationError(node, `No binary data property "${fieldName}" exists on item!`, {
				itemIndex,
			});
		}
		return fixture;
	};

	const context = {
		getNode: () => node,
		getInputData: () => items,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in parameters ? parameters[name] : fallback,
		getCredentials: async (type: string) => {
			if (!options.credential) {
				throw new NodeOperationError(node, `Credentials for "${type}" are not set.`);
			}
			return options.credential;
		},
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: {
			assertBinaryData: (itemIndex: number, fieldName: string) => {
				const fixture = binaryFixture(itemIndex, fieldName);
				// Mirrors n8n's non-memory binary modes, where `data` holds the mode
				// marker instead of the bytes: reading it directly yields garbage.
				return {
					data: 'filesystem:test',
					fileName: fixture.fileName,
					mimeType: fixture.mimeType,
				};
			},
			getBinaryDataBuffer: async (itemIndex: number, fieldName: string) =>
				binaryFixture(itemIndex, fieldName).data,
			prepareBinaryData: async (data: Buffer, fileName?: string, mimeType?: string) => ({
				data: data.toString('base64'),
				fileName,
				mimeType,
				fileSize: data.length,
			}),
		},
	};

	return context as unknown as IExecuteFunctions;
}

/** Runs the node's `execute()` once and returns the items of the single output branch. */
export async function execute(options: HarnessOptions = {}): Promise<INodeExecutionData[]> {
	const node = new OpenPgp();
	if (!node.execute) {
		throw new Error('OpenPgp node has no execute method');
	}
	const [items] = await node.execute.call(createContext(options));
	return items;
}

/** Runs the node and returns its only output item. */
export async function executeOne(options: HarnessOptions = {}): Promise<INodeExecutionData> {
	const items = await execute(options);
	if (items.length !== 1) {
		throw new Error(`Expected exactly one output item, got ${items.length}`);
	}
	return items[0];
}

/** The bytes the node wrote into an output item's binary field. */
export function binaryBytes(item: INodeExecutionData, fieldName = 'data'): Buffer {
	const binaryData = item.binary?.[fieldName];
	if (!binaryData || typeof binaryData.data !== 'string') {
		throw new Error(`Output item has no binary field "${fieldName}"`);
	}
	return Buffer.from(binaryData.data, 'base64');
}
