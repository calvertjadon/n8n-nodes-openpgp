# n8n binary-data conventions for file-centric nodes

Resolves ticket [#4](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/4). Question: how do n8n's built-in nodes emit and consume binary data so `n8n-nodes-openpgp` plays nice with them (primary use case: encrypt/decrypt files produced by **Read/Write Files from Disk**)?

**Sources inspected** (all primary):

- n8n `master` on 2026-09-21 (GitHub raw): `packages/workflow/src/interfaces.ts`, `packages/workflow/src/utils.ts`, `packages/core/src/execution-engine/node-execution-context/**`, `packages/core/src/binary-data/**`, `packages/nodes-base/nodes/**`.
- Published npm dists (read directly from the tarballs): `n8n-workflow@2.16.0`, `n8n-core@2.16.1`, `n8n-nodes-base@2.15.1`.
- docs.n8n.io (Markdown variants), n8n-nodes-starter tree, and four community/verified node packages from npm (see §7).

Anything I could not verify is called out in §9.

---

## TL;DR — decisions this ticket forces

| Concern | Convention to follow | Evidence |
| --- | --- | --- |
| Consume an incoming file | `await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName)` — never read `binary.data` directly | §2.1, §3.3 |
| Emit a file | `await this.helpers.prepareBinaryData(buffer, fileName, mimeType)` and put it at `item.binary[property]` | §2.2 |
| Default property name | `data`, both directions (Read File emits to `data`; Write File reads `data`) | §1.3, §1.4 |
| Input param | `binaryPropertyName`, `type: 'string'`, `default: 'data'`, displayName **"Input Binary Field"** | §4 |
| Output param | `type: 'string'`, `default: 'data'`, displayName **"Put Output File in Field"** | §4 |
| Not a Resource Locator | 0 of 92 `binaryPropertyName` params use `resourceLocator` | §4.4 |
| Item pairing | every emitted item carries `pairedItem: { item: itemIndex }` | §5.1 |
| Errors | `NodeOperationError` + `itemIndex`; wrap the per-item body in `try/catch` with an `this.continueOnFail()` branch | §5.2–5.4 |
| Text vs binary input | one `options`/discriminator parameter (`Input Type`/`Source Data`) with `displayOptions.show`, values `json`/`binary` | §6 |

The zero-configuration goal: **Read File (default `data`) → OpenPGP action (in `data`, out `data` by default) → Write File (default `data`)** must work without the user touching a property name.

---

## 1. The binary-data convention

### 1.1 `IBinaryData`

[`interfaces.ts` L71–81](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L71-L81):

```ts
export type BinaryFileType = 'text' | 'json' | 'image' | 'audio' | 'video' | 'pdf' | 'html';

export interface IBinaryData {
	[key: string]: string | number | undefined;
	data: string;          // base64 payload (memory mode) — see §3
	mimeType: string;      // required
	fileType?: BinaryFileType;
	fileName?: string;
	directory?: string;
	fileExtension?: string;
	fileSize?: string;     // pretty-bytes string, e.g. "12.3 kB"
	bytes?: number;        // exact size
	id?: string;           // "<mode>:<fileId>" when offloaded — see §3
}
```

Only `data` and `mimeType` are non-optional. An item holds a **map** of these, not one:

```ts
export interface IBinaryKeyData { [key: string]: IBinaryData }   // interfaces.ts L1770-1772
export interface INodeExecutionData {
	json: IDataObject;
	binary?: IBinaryKeyData;
	error?: NodeApiError | NodeOperationError;
	pairedItem?: IPairedItemData | IPairedItemData[] | number;
	metadata?: {...};
}
```

([`interfaces.ts` L1837–1856](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1837-L1856))

### 1.2 Default property name is `data`

Every built-in that touches files defaults to `data`: Read File (`dataPropertyName` default `'data'`), Write File (`dataPropertyName` default `'data'`, `required: true`), Convert to File (`binaryPropertyName` default `'data'`), Compression (`binaryPropertyName` default `'data'`, output field default `'data'`).

The user-facing docs state it explicitly: *"The default in the Read/Write File From Disk node is 'data'"* — [docs: Get the binary data buffer](https://docs.n8n.io/build/code-in-n8n/cookbook/code-node/get-the-binary-data-buffer.md).

### 1.3 What **Read File(s) From Disk** emits

[`read.operation.ts` L142–172](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Files/ReadWriteFile/actions/read.operation.ts#L142-L172):

```ts
const stream = await this.helpers.createReadStream(await this.helpers.resolvePath(filePath));
const binaryData = await this.helpers.prepareBinaryData(stream, filePath);
// optional overrides: options.fileName / options.fileExtension / options.mimeType

newItems.push({
	binary: { [dataPropertyName]: binaryData },   // default 'data'
	json: {                                        // "brochure" of metadata in JSON
		mimeType: binaryData.mimeType,
		fileType: binaryData.fileType,
		fileName: binaryData.fileName,
		fileExtension: binaryData.fileExtension,
		fileSize: binaryData.fileSize,
	},
	pairedItem: { item: itemIndex },
});
```

Notes for the OpenPGP node's output shape: Read File mirrors the binary metadata into `json` and adds `fileSize` (a pretty-bytes **string**). One input item can produce *many* output items (glob matching), each paired to the same input index.

### 1.4 What **Write File to Disk** expects

[`write.operation.ts` L79–120](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Files/ReadWriteFile/actions/write.operation.ts#L79-L120):

```ts
const dataPropertyName = this.getNodeParameter('dataPropertyName', itemIndex); // 'Input Binary Field', default 'data'
const binaryData = this.helpers.assertBinaryData(itemIndex, dataPropertyName);

let fileContent: Buffer | Readable;
if (binaryData.id) {
	fileContent = await this.helpers.getBinaryStream(binaryData.id);          // offloaded → stream
} else {
	fileContent = Buffer.from(binaryData.data, BINARY_ENCODING);              // inline base64
}
await this.helpers.writeContentToFile(await this.helpers.resolvePath(fileName), fileContent, flag);
```

Two takeaways:

1. Write File only needs a well-formed `item.binary[<name>]`; it re-reads the bytes itself. So the OpenPGP node's output is automatically consumable **as long as it uses `prepareBinaryData`** (which sets `id` under offloading modes — a hand-built `{ data: base64 }` object would break, see §3.3).
2. Write File copies the incoming JSON (`Object.assign(newItem.json, item.json)`) and shallow-copies `item.binary` through to its output, adding `json.fileName`. Preserving the input's `json` is the established convention for file-in/file-out nodes.

User-facing parameter names are documented at [docs: Read/Write Files from Disk](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile.md) ("Put Output File in Field" / "Input Binary Field").

---

## 2. Helper APIs available to community nodes

### 2.1 Reading

| Helper | Signature (as exposed on `this.helpers`) | Source |
| --- | --- | --- |
| `assertBinaryData` | `(itemIndex: number, parameterData: string \| IBinaryData) => IBinaryData` — validates and throws a user-facing `NodeOperationError` if absent | [`interfaces.ts` L1391](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1391), impl [`binary-helper-functions.ts` L56](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/utils/binary-helper-functions.ts#L56) |
| `getBinaryDataBuffer` | `(itemIndex: number, parameterData: string \| IBinaryData) => Promise<Buffer>` | [`interfaces.ts` L1392](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1392), impl [L128](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/utils/binary-helper-functions.ts#L128) |
| `getBinaryStream` | `(binaryDataId: string, chunkSize?: number) => Promise<Readable>` — only usable when `binaryData.id` is set | [`interfaces.ts` L919](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L919) |
| `binaryToBuffer` | `(body: Buffer \| Readable) => Promise<Buffer>` | [`interfaces.ts` L916](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L916) |
| `binaryToString` | `(body: Buffer \| Readable, encoding?: BufferEncoding) => Promise<string>` | [L917](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L917) |
| `getBinaryMetadata` | `(binaryDataId: string) => Promise<{ fileName?; mimeType?; fileSize: number }>` | [L921](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L921) |
| `detectBinaryEncoding` | `(buffer: Buffer) => string` (chardet) | [L1398](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1398) |

`assertBinaryData` produces copy-aligned errors, e.g. *"The item has no binary field 'data' [item 0]… Check that the parameter where you specified the input binary field name is correct"* and *"This operation expects the node's input data to contain a binary file 'data', but none was found [item 0]"* ([binary-helper-functions.ts L56–120](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/utils/binary-helper-functions.ts#L56-L120)). Calling `assertBinaryData` before `getBinaryDataBuffer` is the idiom (and lets you read `mimeType`/`fileName`).

### 2.2 Writing

```ts
prepareBinaryData(
	binaryData: Buffer | Readable,
	filePath?: string,          // used to derive directory/fileName/fileExtension + mime lookup
	mimeType?: string,          // wins over extension sniffing
): Promise<IBinaryData>;
```

[`interfaces.ts` L908–912](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L908-L912), impl [L244](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/utils/binary-helper-functions.ts#L244). It:

- fills `mimeType` (from `filePath` via `mime-types`, else `file-type` sniffing of the buffer, else `text/plain`),
- derives `fileType` via `fileTypeFromMimeType` ([`workflow/src/utils.ts` L249–258](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/utils.ts#L249-L258)),
- derives `fileExtension` from the mime type or the path,
- sets `directory`, `fileName` from `filePath`,
- stores the bytes through the active binary-data mode and sets `fileSize`/`bytes` (and `id` when offloaded).

Related: `setBinaryDataBuffer(data, buffer)` (re-store an already-built `IBinaryData`) and `getBinaryPath(binaryDataId)`. `copyBinaryFile(...)` is **deprecated/removed** — its implementation now throws `UserError('`copyBinaryFile` has been removed. Please upgrade this node.')` ([binary-helper-functions.ts L359](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/utils/binary-helper-functions.ts#L359)).

### 2.3 The two canonical code shapes

**Consume binary → text** (this is byte-for-byte what the HTML node does when `sourceData === 'binary'`, [`Html.node.ts`](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Html/Html.node.ts)):

```ts
this.helpers.assertBinaryData(itemIndex, binaryPropertyName);            // friendly error if missing
const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
const text = buffer.toString('utf-8');
```

**Emit text → binary** (this is what `createBinaryFromJson` does for Convert to File, [`nodes-base/utils/binary.ts` L82–120](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/utils/binary.ts#L82-L120)):

```ts
const buffer = Buffer.from(valueAsString, 'utf8');            // Convert to File uses iconv for other charsets
const binaryData = await this.helpers.prepareBinaryData(buffer, 'fileName.ext', 'text/plain');
const newItem: INodeExecutionData = {
	json: {},
	binary: { [binaryPropertyName]: binaryData },
	pairedItem: { item: i },
};
```

---

## 3. Where binary data actually lives (and why you must use the helpers)

### 3.1 Modes

`N8N_DEFAULT_BINARY_DATA_MODE` ∈ `default` (memory), `filesystem`, `s3`, `database` ([docs: Binary data env vars](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/binary-data.md); enum in [`binary-data.config.ts`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/binary-data/binary-data.config.ts): `BINARY_DATA_MODES = ['default', 'filesystem', 's3', 'database']`). `N8N_BINARY_DATA_DATABASE_MAX_FILE_SIZE` defaults to 512 MiB, hard cap 1024 MiB (same page + config).

User-facing guidance: [docs: Handle binary data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/handle-binary-data.md) — memory is the small-instance default and *"can cause crashes when working with large files"*; switch to `filesystem`, or `database` when running in queue mode (`filesystem` is unsupported in queue mode).

### 3.2 The two on-the-wire shapes

[`binary-data.service.ts` `store()` / `getAsBuffer()` / `createBinaryDataId()`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/binary-data/binary-data.service.ts):

- **Memory (`default`) mode** — no manager registered, so bytes stay inline: `binaryData.data = buffer.toString('base64')`, plus `fileSize` and `bytes`. `getAsBuffer` = `Buffer.from(binaryData.data, 'base64')`.
- **Offloaded (filesystem / s3 / database)** — `binaryData.id = `${this.mode}:${fileId}`` (mode is `filesystem-v2` for the filesystem manager), `binaryData.data = this.mode` (i.e. the literal string `"filesystem"`/`"s3"`/`"database"`), plus `fileSize`/`bytes`. `getAsBuffer(id)` dispatches to the right manager.

### 3.3 Consequence: never decode `.data` by hand

```ts
// BROKEN under filesystem/s3/database modes — `data` holds the mode name, not base64
const buf = Buffer.from(item.binary.data.data, 'base64');

// CORRECT in every mode
const buf = await this.helpers.getBinaryDataBuffer(i, 'data');
```

The user-facing docs say the same: *"You should always use the `getBinaryDataBuffer()` function, and avoid using older methods of directly accessing the buffer, such as targeting it with expressions like `items[0].binary.data.data`"* ([docs: Get the binary data buffer](https://docs.n8n.io/build/code-in-n8n/cookbook/code-node/get-the-binary-data-buffer.md)).

Real-world counter-example: the community node `@azerax/n8n-nodes-pgp-encode-only@1.0.5` does `Buffer.from(item.binary[binaryPropertyName].data, 'base64')` and rebuilds the output object literally (`dist/nodes/PgpNode/PgpNode.node.js`), which silently breaks on any instance not using memory mode. Do not copy that pattern.

### 3.4 Size / memory caveats for buffer-based handling

- `getBinaryDataBuffer` **materialises the whole file** (`getAsBuffer`) — fine for v1 per the map's decision ("buffer-based v1; streaming maybe revisited"), but it means peak RAM ≈ file size (plus a second copy while decoding base64 in memory mode).
- In memory mode the base64 string lives inside item data → in the execution data that n8n persists and shows in the UI (~4/3 file size), which is why the docs recommend `filesystem` for large files.
- `database` mode rejects single files above `N8N_BINARY_DATA_DATABASE_MAX_FILE_SIZE` (default 512 MiB) — larger files *fail to store*.
- Streaming alternatives exist (`getBinaryStream(id)` + `binaryToBuffer`/`binaryToString`) and are what **Write File to Disk** uses when `binaryData.id` is present ([write.operation.ts L100](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Files/ReadWriteFile/actions/write.operation.ts#L100)). Community node `n8n-nodes-binary-to-url@0.2.4` uses `assertBinaryData` → `getBinaryDataBuffer`, falling back to `getBinaryStream` + `binaryToBuffer` for its own stored IDs — a reminder that the stream path only works with an `id`.

---

## 4. `binaryPropertyName` conventions (census of `n8n-nodes-base@2.15.1`)

Counted across the published `n8n-nodes-base@2.15.1` `dist/nodes/**/*.js` (files referenced, not occurrences):

| Pattern | Count |
| --- | --- |
| files containing `binaryPropertyName` | 108 |
| files containing `dataPropertyName` (older/file-node naming, used by Read/Write File + Html) | 39 |
| files containing `binaryPropertyOutput` (Compression v2 only) | 1 |
| files containing `outputBinaryProperty` | 0 |

### 4.1 Shape

Always a plain string with a `default` of `'data'`:

| Parameter shape | Count |
| --- | --- |
| `name: 'binaryPropertyName'` declarations | 92 |
| … `type: 'string'` | 92 (all of them) |
| displayName `"Input Binary Field"` | 51 |
| displayName `"Input Binary Field(s)"` (comma-separated list, Compression) | 53 |
| displayName `"Put Output File in Field"` | 43 |
| displayName `"Output Binary Field"` | 0 |
| `requiresDataPath` on a `binaryPropertyName` param | 0 |
| `hint:` present on a `binaryPropertyName` param | 29 |

Canonical input declaration ([`ReadPDF.node.ts` L29–36](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/ReadPdf/ReadPDF.node.ts#L29-L36)):

```ts
{
	displayName: 'Input Binary Field',
	name: 'binaryPropertyName',
	type: 'string',
	default: 'data',
	required: true,
	description: 'Name of the binary property from which to read the PDF file',
}
```

Canonical output declaration ([`toBinary.operation.ts` L24–34](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Files/ConvertToFile/actions/toBinary.operation.ts#L24-L34)):

```ts
{
	displayName: 'Put Output File in Field',
	name: 'binaryPropertyName',
	type: 'string',
	default: 'data',
	required: true,
	placeholder: 'e.g data',
	hint: 'The name of the output binary field to put the file in',
}
```

Compression's output variant is `name: 'binaryPropertyOutput'`, displayName `"Put Output File in Field"`, `default: 'data'` (i.e. overwrite in place by default) — [`Compression.node.ts`](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Compression/Compression.node.ts). Its input variant supports a comma-separated list (`displayName: 'Input Binary Field(s)'`, placeholder `e.g. data,data2,data3`).

`default: 'data'` + `required: true` is what makes Read File → *any node* → Write File work with zero configuration, so the OpenPGP node should mirror it (and may safely avoid `required` on an output field name that has a default).

### 4.2 `requiresDataPath`

Not used for binary property parameters (0 occurrences) — `requiresDataPath: 'single'` appears on *JSON* data-path params such as the Html node's "JSON Property".

### 4.3 Options are read with a fallback

Newer built-ins read with an explicit fallback: `this.getNodeParameter('binaryPropertyName', i, 'data')` (Convert to File), and Read File post-processes `let dataPropertyName = 'data'; if (options.dataPropertyName) {...}`. Reading the parameter with the default baked into the declaration is sufficient for our node.

### 4.4 Resource Locator is *not* used for binary properties

Across `n8n-nodes-base@2.15.1`, no `binaryPropertyName` declaration sits inside a `resourceLocator` block (0 matches). The UX guideline *"Use a Resource Locator component whenever possible … most often useful when you have to select a single item"* ([docs: UX guidelines §Resource Locator](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines.md)) therefore does **not** apply: a binary field name is a free-text item property, not a catalog object. Corroborated by the community nodes surveyed in §7, which are also plain strings defaulting to `data`.

---

## 5. Item pairing and error handling

### 5.1 `pairedItem`

Shape ([`interfaces.ts` L1774–1778](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1774-L1778)):

```ts
export interface IPairedItemData {
	item: number;
	input?: number;            // undefined ⇒ 0
	sourceOverwrite?: ISourceData;
}
```

`INodeExecutionData.pairedItem` accepts a single object, an array (merge nodes), or a bare `number`. For a one-in/one-out action node the convention is one object per output item:

```ts
returnData.push({ json: {...}, binary: {...}, pairedItem: { item: itemIndex } });
```

Docs: [Item linking for node creators](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/item-linking-for-node-creators.md) — *"As a node developer, you must ensure any items returned by your node support this"*, with the warning that missing links break expressions in later nodes. Automatic linking only happens in narrow cases ([How items link through workflows](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/how-items-link-through-workflows.md)): single-in/single-out, single-in/many-out, equal counts, or a preserved-order subset. **A decrypt of N items into N items *might* be auto-linked, but relies on it at your peril** — set `pairedItem` explicitly, as Read File/Write File/Compression/Convert-to-File all do.

Alternative helper for multi-output-per-input cases: `helpers.constructExecutionMetaData(items, { itemData: { item: i } })`, used by 361 files in nodes-base, e.g. the Html node:

```ts
const result = this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray({ html }), {
	itemData: { item: itemIndex },
});
returnData.push(...result);
```

Also available: `helpers.normalizeItems(items)` — coerces `{...}` / `[{json}]` / `[{binary}]` shapes into item arrays ([normalize-items.ts](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/utils/normalize-items.ts)). It does **not** add `pairedItem`.

### 5.2 `continueOnFail()` is the API, `onError` is the setting

```ts
// base-execute-context.ts L111-119
continueOnFail(): boolean {
	const onError = get(this.node, 'onError', undefined);
	if (onError === undefined) {
		return get(this.node, 'continueOnFail', false);
	}
	return ['continueRegularOutput', 'continueErrorOutput'].includes(onError);
}
```

([base-execute-context.ts L111–119](https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/node-execution-context/base-execute-context.ts#L111-L119); declared on `BaseExecutionFunctions`, [`interfaces.ts` L1301](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1301); `OnError = 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow'`, [L1722](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts#L1722)).

So a community node does **not** special-case the three UI modes; it asks `this.continueOnFail()` and either emits an error item or throws. The node-level setting is documented for users at [Work with nodes §Node settings](https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes.md) ("Continue" / "Continue (using error output)").

### 5.3 The error item

Classic (336 files in nodes-base call `this.continueOnFail()`):

```ts
} catch (error) {
	if (this.continueOnFail()) {
		returnData.push({
			json: { error: (error as Error).message },
			pairedItem: { item: i },
		});
		continue;
	}
	throw new NodeOperationError(this.getNode(), error as Error, {
		description: (error as NodeOperationError).description,
		itemIndex: i,
	});
}
```

([docs: Error handling](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/error-handling.md), exactly this shape.)

Modern addition for `continueErrorOutput` — the engine reads a real error object off the item:

```ts
// INodeExecutionData doc comment, interfaces.ts L1849-1852:
// "In `continueErrorOutput` mode, engine will try to read item.error or fallback to
//  item.json.error with allowed optional keys: message, details."
returnData.push({
	json: { error: error.message },
	pairedItem: { item: itemIndex },
	error: new NodeOperationError(this.getNode(), error as Error, { itemIndex }),
});
```

The verified community node `n8n-nodes-puppeteer@1.5.0` uses precisely this triple (`json.error` + `pairedItem` + `error: NodeOperationError`) in its `handleError` helper (`dist/nodes/Puppeteer/Puppeteer.node.js`).

### 5.4 Which error class

[docs: Error handling](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/error-handling.md): `NodeApiError` for *external API* failures; `NodeOperationError` for operational/validation/configuration problems. OpenPGP failures (bad armor, wrong passphrase, no matching key, decryption without integrity) are **operational**, so `NodeOperationError` with a helpful `description` and `itemIndex`.

Read/Write File additionally maps raw filesystem errors through `errorMapper(...)` and rethrows `NodeApiError`, but that exists because those nodes talk to the filesystem; we don't need it.

### 5.5 Copy rules that apply to our messages

From [UX guidelines §Errors](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines.md):

- Error message = what happened; include the offending parameter's `displayName` and append `[Item X]` (n8n does the `[item N]` part itself when you pass `itemIndex` — cf. `assertBinaryData`'s messages).
- Error description = how to get unstuck; guide, don't scold.
- Avoid the words "error", "problem", "failure", "mistake"; wrap parameter/field names in single quotes.
- Boolean descriptions start with "Whether…"; parameter copy uses "field" not "key".

The failure-cause declaration (`failure: { cause: 'credential-invalid' | 'configuration-invalid' | ... }`) is a newer, optional feature — *"Failure declarations are available from n8n 3.37"* ([docs: Error handling §Declaring why an operation failed](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/error-handling.md)). Not required for v1, but `credential-invalid` would be a natural fit if the private-key credential can't be decrypted.

---

## 6. Input-source patterns: text field vs binary property

Three primary-source precedents exist for "the user may supply either JSON text or a binary file":

**a) Community node, closest domain match** — `@azerax/n8n-nodes-pgp-encode-only@1.0.5` (`dist/nodes/PgpNode/PgpNode.node.js`):

```js
{ displayName: 'Input Type', name: 'inputType', type: 'options',
  options: [{ name: 'Text', value: 'text' }, { name: 'Binary', value: 'binary' }],
  default: 'binary' },
{ displayName: 'Message',               name: 'message',               type: 'string',
  displayOptions: { show: { inputType: ['text'] } } },
{ displayName: 'Binary Property Name',  name: 'binaryPropertyName',    type: 'string',
  default: 'data', displayOptions: { show: { inputType: ['binary'] } } },
{ displayName: 'Output Binary Property Name', name: 'outputBinaryPropertyName',
  type: 'string', default: 'data', displayOptions: { show: { inputType: ['binary'] } } },
```

It then discriminates in `execute()` with `if (inputType === 'text') { …item.json.encrypted = …; continue; }` and returns `this.prepareOutputData(items)` (mutating input items — note: it does **not** set `pairedItem`, relying on in-place mutation; our node should set it explicitly).

**b) Built-in** — `MistralAI` document → extract text uses `displayName: 'Input Type'`, `name: 'inputType'`, options `Binary Data` (`binary`) / `URL` (`url`), `description: 'How the document will be provided'`, with per-source params behind `displayOptions.show` ([`extractText.operation.ts`](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/MistralAI/descriptions/document/extractText.operation.ts)).

**c) Built-in** — `Html` uses `displayName: 'Source Data'`, `name: 'sourceData'`, options `Binary` / `JSON`, default `json`, `description: 'If HTML should be read from binary or JSON data'`, and then **reuses one parameter name** (`dataPropertyName`) for both sub-fields, distinguished only by `displayOptions.show` ([`Html.node.ts`](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Html/Html.node.ts)).

**Recommendation for `n8n-nodes-openpgp`:** one discriminator parameter (`Input Type` or `Source Data`, options `Text` / `Binary`, default `Binary` so a Read File feeds it with zero config — or `Text` for a friendlier generic default, a product decision outside this ticket), plus `message`/`dataPropertyName` behind `displayOptions.show { inputType: ['text'|'binary'] }`. Keep the discriminator in the node's main parameters (not inside an `Options` collection) since it changes the node's fundamental shape; that is what all three precedents do. Note `options` (the Add-option collection) is for optional behaviour, not for the primary input mode.

## 7. Community-node evidence (all read from published npm tarballs)

| Package | Binary pattern | Verdict |
| --- | --- | --- |
| `@azerax/n8n-nodes-pgp-encode-only@1.0.5` | `inputType` text/binary discriminator; `binaryPropertyName`/`outputBinaryPropertyName` default `data`; **manual** base64 decode + hand-built `IBinaryData`; no `pairedItem` | Domain-close UX precedent, unsafe byte handling — don't copy the internals |
| `n8n-nodes-puppeteer@1.5.0` (verified) | `helpers.prepareBinaryData(Buffer.from(x), path, mime)` → `binary: { [dataPropertyName]: binaryData }` + `pairedItem: { item: itemIndex }`; error items carry `error: NodeOperationError` | Model implementation for our output side |
| `n8n-nodes-binary-to-url@0.2.4` | `assertBinaryData` → `getBinaryDataBuffer`, falling back to `getBinaryStream(id)` + `binaryToBuffer`; `binaryPropertyName` string default `data` | Confirms helper-first reading |
| `n8n-nodes-xlsx@0.1.1` | `getBinaryDataBuffer` in, `prepareBinaryData(buffer, fileName, mime)` out; `binaryPropertyName`/`outputBinaryProperty` **inside an `Options` collection**, default `data` | Shows the "both fields default to `data`" convention |

The official starter (`n8n-io/n8n-nodes-starter`) has **no binary example at all** — its tree holds only `Example` and `GithubIssues` nodes, and neither node source mentions binary. Treat `n8n-nodes-base` as the reference corpus.

---

## 8. Concrete code shapes for `n8n-nodes-openpgp`

### 8.1 Consuming an incoming binary property (files)

```ts
const inputType = this.getNodeParameter('inputType', i) as 'text' | 'binary';

let payload: Buffer | string;
if (inputType === 'binary') {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
	const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);   // throws friendly NodeOperationError
	payload = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);   // Buffer, any binary mode
	// binaryData.mimeType / fileName / fileSize available if needed
} else {
	payload = this.getNodeParameter('message', i, '') as string;
}
```

### 8.2 Emitting armored text as binary (decrypt → `.asc`, sign → `.asc`)

```ts
const armored = await openpgp.decrypt({ ... });           // string, ASCII armor

const fileName = /* `${baseName}.asc` derived from the input binaryData.fileName if present */;
const binaryData = await this.helpers.prepareBinaryData(
	Buffer.from(armored as string, 'utf8'),
	fileName,
	'application/pgp-encrypted',   // or application/pgp-signature / application/pgp-keys / application/pgp
);

returnData.push({
	json: {
		// brochure fields, mirroring Read File's JSON output
		mimeType: binaryData.mimeType,
		fileType: binaryData.fileType,
		fileName: binaryData.fileName,
		fileExtension: binaryData.fileExtension,
		fileSize: binaryData.fileSize,
		// plus operation-specific facts: signedBy / encryptedFor / signatureValid ...
	},
	binary: { [outputBinaryPropertyName]: binaryData },   // default 'data'
	pairedItem: { item: i },
});
```

Armored PGP text is 7-bit ASCII, so `Buffer.from(str, 'utf8')` is lossless. `prepareBinaryData` will set `fileExtension` from the MIME or from `fileName` and `fileType` will be **`undefined`** for `application/pgp-*`, because `fileTypeFromMimeType` only maps `json`/`html`/`image/*`/`audio/*`/`video/*`/`text/*`/`application/javascript`/`application/pdf` ([`workflow/src/utils.ts` L249–258](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/utils.ts#L249-L258)). That's expected and harmless; if a `text` fileType is wanted for armored output, `text/plain` is the only way to get it.

For binary (unarmored) output — e.g. `.pgp`/`.gpg` — pass the raw `Uint8Array` from OpenPGP.js as a Buffer and a `application/octet-stream` (or `application/pgp-encrypted`) MIME.

### 8.3 Emitting a string-only result (verify / decrypt-to-text)

Keep `json` output for text results (no binary), exactly as the pgp community node puts ciphertext in `item.json.encrypted`. Emit binary only when the user asked for a file (`Output Type: File` / `Binary`), so text-in-text-out stays default for the common case.

### 8.4 Preserving `pairedItem` (full loop, including `continueOnFail`)

```ts
const items = this.getInputData();
const returnData: INodeExecutionData[] = [];

for (let i = 0; i < items.length; i++) {
	try {
		const newItem = await processItem.call(this, i);      // sets json + binary
		returnData.push({ ...newItem, pairedItem: { item: i } });
	} catch (error) {
		const nodeOperationError = new NodeOperationError(this.getNode(), error as Error, {
			itemIndex: i,
			description: "<what to check — e.g. the 'Private Key' credential, the armor format>",
		});
		if (this.continueOnFail()) {
			returnData.push({
				json: { error: nodeOperationError.message },
				pairedItem: { item: i },
				error: nodeOperationError,          // consumed by `Continue (using error output)`
			});
			continue;
		}
		throw nodeOperationError;
	}
}

return [returnData];   // or return this.prepareOutputData(returnData) once pairedItem is already set
```

### 8.5 Zero-config chain to aim for

```
Read File(s) From Disk (binary `data`, json.fileName)
	→ OpenPGP: Encrypt   (Input Type: Binary, binaryPropertyName: data, output field: data)
	→ Write File to Disk (Input Binary Field: data, file path expression from json.fileName)
```

Both default field names are `data` in the built-ins, so defaulting our input *and* output property names to `data` (as Compression's `binaryPropertyOutput` does) makes the chain work untouched.

---

## 9. Unverified / flagged

1. **Docs vs code on the default binary mode.** [docs: Binary data env vars](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/binary-data.md) states `N8N_DEFAULT_BINARY_DATA_MODE` default is `default` (memory) and [docs: Handle binary data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/handle-binary-data.md) says *"n8n keeps the data in memory by default"*, but `n8n-core@2.16.1`'s `BinaryDataConfig` constructor sets `this.mode ??= executionsConfig.mode === 'queue' ? 'database' : 'filesystem'` — i.e. code default is `filesystem` (→ `filesystem-v2` manager) for non-queue deployments. Either the docs are stale or a wrapper (Docker image / cloud) sets the variable. **Flagged, not resolved.** Irrelevant to the code we write (helpers handle both), but it invalidates any "in memory mode it's always base64" assumption — see §3.3.
2. **Exact `binaryPropertyName` vs `dataPropertyName` split.** The census counts *files*, not parameters; some files declare both. The directional conclusion (newer/IO nodes use `binaryPropertyName`; file-oriented and older nodes use `dataPropertyName`) is safe, the precise ratios are not.
3. **GitHub code search was rate-limited** partway through, so the community-node survey in §7 is a sample of npm-search results rather than an exhaustive scan. The built-in census (§4) is exhaustive over the published `n8n-nodes-base@2.15.1` tarball.
4. **No official "binary data" chapter for node *creators*** exists in docs.n8n.io: the node-builder reference covers error handling, item linking, UX and verification guidelines, but (per `llms.txt`) there is no page on `IBinaryData`/`prepareBinaryData` for authors; `verification-guidelines.md` contains **zero** binary-specific rules. The author-facing guidance is the Code-node cookbook page + the source.
5. **`getBinaryStream` for community nodes**: the helper is exposed, but `write.operation.ts` only calls it when `binaryData.id` is set; for our v1 (buffer-based) we don't need it. Not exercised here.
6. **Streaming/webhook payload ceilings** (`N8N_PAYLOAD_SIZE_MAX` etc.) are not relevant to node-to-node binary handling and were not researched — the env-var page for nodes lists only `NODES_EXCLUDE` in that area; webhook limits deserve their own check if we ever document "max file size" for users.
