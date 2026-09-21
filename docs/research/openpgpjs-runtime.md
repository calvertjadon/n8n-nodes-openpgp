# OpenPGP.js v6 runtime compatibility inside n8n

Research for [map #1](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/1) / [ticket #3](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/3).
Target: `openpgp@6.3.1` in an n8n community node (programmatic node, compiled TypeScript, CJS, loaded by `require()` into the n8n main process).

Date of research: 2026-09-21. All version numbers below are as observed on that date.

---

## Bottom line

| Decision | Recommendation |
| --- | --- |
| `engines.node` for `n8n-nodes-openpgp` | `">=22.22.0"` (see [§7](#7-recommendation-engines-and-import-shape) for why not 18, 20 or 24) |
| Dependency | `"openpgp": "^6.3.1"` — zero runtime dependencies of its own, so nothing transitive to worry about |
| Import shape in node code | `import * as openpgp from 'openpgp';` (TS/CJS) → compiles to `require('openpgp')` → resolves `dist/node/openpgp.min.cjs` |
| Must **not** use | `openpgp/lightweight` (browser-only export, throws `ERR_PACKAGE_PATH_NOT_EXPORTED` in Node), `import openpgp from 'openpgp'` (no default export), any native Node `Readable` stream as crypto input |
| Peer/dev dep | `@openpgp/web-stream-tools@~0.3.0` as `devDependency`, types-only; harmless if omitted because n8n's tsconfig sets `skipLibCheck: true` |
| Verified | yes — full generate/encrypt/decrypt/sign round-trip executed under `require()` on Node v24.19.0, plus a `tsc` compile against the n8n starter tsconfig |

The headline correction to the ticket's premise: **the "Node.js v22+" statement in the OpenPGP.js README is not in any published release.** It landed one commit *after* the `v6.3.1` tag. Published `6.3.1` says Node v18+ and its CI actually tests 18/20/22/24.

---

## 1. The Node version discrepancy, resolved

There is no contradiction inside any single revision. There are two revisions:

| Source | Revision | Says | `engines` | CI matrix |
| --- | --- | --- | --- | --- |
| README `v6.3.1` (published) | tag `v6.3.1` | "works in Node.js **v18+**" | `">= 18.0.0"` | `[18.x, 20.x, 22.x, 24.x]` |
| README `main` (unreleased) | `main` @ `f9291c94` | "works in Node.js **v22+**" | `">= 22.0.0"` | `[22.x, 24.x, 26.x]` |

Evidence:

- Released README, `v6.3.1`: <https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/README.md> — *"The `dist/node/openpgp.min.mjs` (or `.cjs`) bundle works in Node.js v18+"*.
- Released CI, `v6.3.1`: <https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/.github/workflows/tests.yml> — `node-version: [18.x, 20.x, 22.x, 24.x]`.
- Released `engines` on npm: <https://registry.npmjs.org/openpgp/6.3.1> — `{"node": ">= 18.0.0", "typescript": ">= 5.0.0"}`.
- Unreleased README, `main`: <https://github.com/openpgpjs/openpgpjs/blob/main/README.md> — *"works in Node.js v22+"*, and <https://github.com/openpgpjs/openpgpjs/blob/main/.github/workflows/tests.yml> — `[22.x, 24.x, 26.x]`.
- The change commit is **after** the release: `f9291c94` *"Only support Node v22+"*, authored `2026-06-04T14:53:58Z`. The `v6.3.1` tag was published `2026-06-04T14:39:34Z` (<https://github.com/openpgpjs/openpgpjs/releases/tag/v6.3.1>), and `GET /repos/openpgpjs/openpgpjs/compare/v6.3.1...f9291c94` reports `ahead_by: 1`. Commit: <https://github.com/openpgpjs/openpgpjs/commit/f9291c9473>.
- The commit message states the rationale verbatim: *"We used to support v18+. Node v20 went EOL in March 2026. Node v18 in March 2025."* That matches the official schedule — Node 18 ended `2025-04-30`, Node 20 ends `2026-04-30` (<https://github.com/nodejs/Release/blob/main/schedule.json>).
- `devEngines.runtime` on `main` is also `">= 22.0.0"` (<https://github.com/openpgpjs/openpgpjs/blob/main/package.json>).

**Real floor for the version we would depend on (`6.3.1`): Node 18**, as declared and as actually exercised in CI. Every `6.x` release from `6.0.0` through `6.3.1` declares `">= 18.0.0"`.

Additional floor facts for completeness:
- v6.0.0 release note: *"Node.js: Drop support for Node.js versions below 18 (OpenPGP.js v5 supported Node.js v14 and above)"* — <https://github.com/openpgpjs/openpgpjs/releases/tag/v6.0.0> and the wiki <https://github.com/openpgpjs/openpgpjs/wiki/V6-Changelog>.
- v6.3.0 release note: *"Support Node.js v24"* (PR openpgpjs/openpgpjs#1896) — <https://github.com/openpgpjs/openpgpjs/releases/tag/v6.3.0>.

So: **OpenPGP.js is not the constraint.** Node's own EOL schedule and n8n's floor are.

---

## 2. What Node versions n8n requires

n8n's floor has moved three times in the 2.x line. From the npm registry (`engines.node`, deduplicated at each transition):

| n8n versions | `engines.node` |
| --- | --- |
| `1.x` – `2.8.x` (incl. `2.0.0`, `1.123.x`) | `">=20.19 <= 24.x"` |
| `2.9.0` – `2.22.x` | `">=22.16"` |
| `2.23.0` – `2.35.x` | `">=22.22"` |
| `2.36.0` – `2.40.5` (current: `latest` = `2.39.10`, `beta` = `2.40.5`) | `">=24.0.0"` |

Sources: <https://registry.npmjs.org/n8n> (per-version `engines`), and the repo root manifest <https://github.com/n8n-io/n8n/blob/master/package.json> (`"node": ">=24.0.0"`).

Corroborating runtime facts:

- The official Docker image builds and ships **Node 26.7.0**: <https://github.com/n8n-io/n8n/blob/master/docker/images/n8n/Dockerfile> (`ARG NODE_VERSION=26.7.0`, `node:26.7.0-alpine3.24`). Since node-based installs are being retired (*"npm-based installs are deprecated from n8n 3.0"* — <https://docs.n8n.io/deploy/host-n8n/install-options/install-with-npm.md>), Docker is the dominant real deployment, so **the practical n8n runtime today is Node 24–26**.
- n8n's node-authoring docs set a **higher** bar than the runtime: *"Node.js and npm. Minimum version Node 22.22.0."* — <https://docs.n8n.io/connect/create-nodes/build-your-node/set-up-your-development-environment.md>.
- The n8n docs' npm-install page still says *"n8n requires a Node.js version between 20.19 and 24.x, inclusive"* — <https://docs.n8n.io/deploy/host-n8n/install-options/install-with-npm.md>. **This page is stale** relative to the `engines` field of the 2.x packages it describes (n8n 2.36+ requires `>=24.0.0`). Treat the `engines` field as authoritative; flag the docs page as unreliable.

Alignment verdict: every n8n release that can host this node requires Node ≥ 20.19, and all of those are comfortably above OpenPGP.js's Node 18 floor. **No conflict.**

---

## 3. CJS interop — verified, works

### How n8n loads a community node

n8n reads the package's `n8n.nodes` / `n8n.credentials` arrays and requires each listed file:

- <https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/package-directory-loader.ts> (`loadAll()` iterating `packageJson.n8n.nodes`).
- <https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/load-class-in-isolation.ts> — the class is instantiated inside a `vm` context whose only capability is `require`:
  ```js
  const context = createContext({ require });
  const script = new Script(`new (require('${filePath}').${className})()`);
  script.runInContext(context);
  ```
  In tests it is a plain `require(filePath)[className]`.
- The `.node.json` codex file is also required: `module.require(codexFilePath)` in <https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/directory-loader.ts>.

So the node bundle **must be CJS** — no top-level `await`, no `import()`-only entry point. n8n's own tooling guarantees this: `n8n-node build` runs bare `tsc` (no bundler) against the project tsconfig — <https://github.com/n8n-io/n8n-nodes-starter/blob/master/tsconfig.json>, `"module": "commonjs"`, `"moduleResolution": "node"`, `"target": "es2019"`; the same tsconfig ships in the `@n8n/node-cli` template (<https://www.npmjs.com/package/@n8n/node-cli>). The starter's `package.json` contains no `engines` field at all.

### The openpgp export map

`openpgp@6.3.1` is `"type": "module"` but ships a real CJS build and maps it explicitly (full published manifest at <https://registry.npmjs.org/openpgp/6.3.1>, or `node_modules/openpgp/package.json`):

```jsonc
"main": "dist/node/openpgp.min.cjs",
"exports": {
  ".": {
    "types":   "./dist/types/index.d.ts",
    "browser": "./dist/openpgp.min.mjs",
    "import":  "./dist/node/openpgp.mjs",
    "require": "./dist/node/openpgp.min.cjs"     // <- what n8n gets
  },
  "./lightweight": {
    "types":   "./dist/types/index.d.ts",
    "browser": "./dist/lightweight/openpgp.min.mjs"
  }
}
```

The v6.0.0 release notes flag this as an intentional compatibility measure: *"declares exports, alongside the legacy package.json entrypoints, which should ensure backwards compatibility"* — <https://github.com/openpgpjs/openpgpjs/releases/tag/v6.0.0>.

### Empirical proof (run in this research)

Installed `openpgp@6.3.1` into a scratch project on Node v24.19.0 and required it — no bundler, no ESM loader, matching n8n's path exactly:

```
$ node -e "const openpgp = require('openpgp'); ..."
resolved main: /tmp/tstest/node_modules/openpgp/dist/node/openpgp.min.cjs
roundtrip data: hello world
signatures verified: true
node: v24.19.0 | pkg type: module
```

Full round-trip exercised through `require()`: `generateKey` (X25519) → `createMessage` → `encrypt` (signed) → `readMessage` → `decrypt` → detached-subkey `verificationKeys` verification returning `true`.

### ESM-only pitfalls that do exist

| Pitfall | Behaviour |
| --- | --- |
| `openpgp/lightweight` | **Unusable in Node.** The subpath export has only `types` and `browser` conditions. `require('openpgp/lightweight')` → `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './lightweight' is not defined by "exports"`. `import ... from 'openpgp/lightweight'` fails identically in Node (neither `import` nor `require` condition is declared). **Verified empirically.** Use the full build. |
| Default import | There is no default export; use `import * as openpgp from 'openpgp'`. |
| Bundling the node with esbuild/webpack | `main` points at the `.cjs` while `module`/`browser` point elsewhere; a bundler that prefers `browser` would pull the web build into a Node context. Since `n8n-node build` is a plain `tsc` (no bundler), this does not apply — but do not introduce a bundler. |
| Ship the whole `dist/` | The package's `files: ["dist/", "lightweight/"]`; nothing else is needed. The Argon2 WASM is base64-inlined in the `.cjs` (see §5), so there is no loose `.wasm` asset to copy. |

---

## 4. WebCrypto and Web Streams across the relevant Node versions

OpenPGP.js v6 requires both; this is a deliberate v6 breaking change (<https://github.com/openpgpjs/openpgpjs/releases/tag/v6.0.0>):

- *"Require availability of the Web Crypto API's `SubtleCrypto`"*
- *"Require availability of the Web Streams API"*
- *"Streaming: drop support for native Node `Readable` stream: require passing Node Web Streams"* (openpgpjs/openpgpjs#1716)

Availability in Node:

| Global | Node 18 | Node 20 | Node 22 | Node 24 / 26 |
| --- | --- | --- | --- | --- |
| `ReadableStream`, `WritableStream`, `TransformStream`, readers/writers | ✔ added v18.0.0 (Stability 1, experimental) | ✔ | ✔ | ✔ |
| `CompressionStream` / `DecompressionStream` | ✔ added v17.0.0 | ✔ | ✔ | ✔ |
| `crypto.subtle` via `globalThis.crypto` | ⚠ **behind `--experimental-global-webcrypto`** (Stability 1) | ✔ on by default since v19.0.0 | ✔ | ✔ |
| `TextEncoder` / `TextDecoder`, `BigInt` | ✔ | ✔ | ✔ | ✔ |

Sources: <https://github.com/nodejs/node/blob/v18.x/doc/api/globals.md> (`crypto`, `Crypto`, `CryptoKey` all carry *"Stability: 1 - Experimental. Enable this API with the `--experimental-global-webcrypto` CLI flag."*), and the same file on `v20.x`/`v24.x` where the change note reads *"v19.0.0 — No longer behind `--experimental-global-webcrypto` CLI flag"* (<https://github.com/nodejs/node/blob/v20.x/doc/api/globals.md>).

**Why this does not actually break Node 18 for openpgp:** the library degrades correctly. In `src/util.js` (<https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/src/util.js>):

```js
getWebCrypto: function() {
  const globalWebCrypto = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
  // Fallback for Node 16, which does not expose WebCrypto as a global
  const webCrypto = globalWebCrypto || this.getNodeCrypto()?.webcrypto.subtle;
  ...
}
```

and in `src/crypto/random.js`:

```js
const webcrypto = typeof crypto !== 'undefined' ? crypto : nodeCrypto?.webcrypto;
```

So on Node 18 without the flag it falls back to `require('crypto').webcrypto`. Entropy and crypto both work. Confirmed by v6.3.1's CI actually running its full suite on `18.x`.

The dist bundle does reference the Web Streams globals directly (verified in `dist/node/openpgp.min.cjs`: 9 × `new ReadableStream`, 2 × `CompressionStream`, 2 × `DecompressionStream`), which is why Node's Web Streams globals are a hard requirement — satisfied from Node 18.0.0 up.

**Practical consequence for the node implementation:** parse from and emit to **n8n's `IBinaryData` buffers (`Uint8Array`/`Buffer`) and/or Web Streams**, never `stream.Readable`. If a `Readable` ever needs converting, Node's `stream.Readable.toWeb()` exists from Node 17+ (<https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options>). Non-streaming string/`Uint8Array` inputs — the normal n8n case — avoid the streaming machinery entirely.

---

## 5. Long-lived-process gotchas

The n8n main process is a single long-lived Node process that loads a node module once and then runs many workflow executions, potentially concurrently. Six things matter.

### 5.1 `openpgp.config` is a process-global mutable singleton — the biggest hazard

`src/config.ts` declares a plain object and `export default config;` (<https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/src/config.ts>). Every high-level API reads the *same* object, and it is re-exported publicly as `openpgp.config` (`src/index.d.ts`: `export { enums, config, Config, PartialConfig };`).

In an n8n worker running two workflows concurrently, one execution setting `openpgp.config.allowMissingKeyFlags = true` silently changes the cryptography policy of every other in-flight execution in that process — and it persists after the execution ends.

**Mitigation:** never mutate `openpgp.config` in the node. Every relevant v6 high-level API accepts a per-call `config?: PartialConfig` (`generateKey`, `readKey`, `readMessage`, `encrypt`, `decrypt`, `sign`, `verify`, `decryptKey`, … — see the signatures in `src/index.d.ts`). Build a frozen per-execution config object and pass it in. This is also the correct place to expose node options such as `allowUnauthenticatedMessages`, `enforceGrammar`, `maxDecompressedMessageSize`, `minRSABits`.

### 5.2 Entropy is the OS CSPRNG, not a pool

`getRandomBytes` calls `crypto.getRandomValues` (global WebCrypto, falling back to `node:crypto`) — `src/crypto/random.js`. There is no userspace entropy pool to starve, no `/dev/random` blocking, and no state to fork-corrupt. **No concern** in a long-lived server. (The only entropy-related issue in the tracker, openpgpjs/openpgpjs#1308, is a closed feature request about *injecting* a deterministic RNG for key generation, not a runtime defect.)

### 5.3 Module-level state that is *reset*, not leaked, on community-node reload

n8n deletes the require-cache entries for its community-nodes directory when node types are reset (install / uninstall / `n8n-node dev` rebuilds):

```ts
private unloadAll() {
  // Community nodes developed with `n8n-node dev` are symlinked into
  // `<directory>/node_modules/<pkg>`. Node's require cache keys those files by
  // their resolved real path (the symlink target), which lives outside
  // `this.directory`, so we also sweep the resolved roots to pick up rebuilds.
  const rootsToUnload = [this.directory, ...this.getSymlinkedPackageRoots()];
  const filesToUnload = Object.keys(require.cache).filter((filePath) =>
    rootsToUnload.some((root) => filePath.startsWith(root)),
  );
  filesToUnload.forEach((filePath) => { delete require.cache[filePath]; });
}
```

(<https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/directory-loader.ts>, `reset()` → `unloadAll()`.)

Because `this.directory` is the nodes directory (`~/.n8n/nodes`), `~/.n8n/nodes/node_modules/openpgp/**` is swept too. So module-level state (the 388 KB CJS bundle parse, the `config` object, the Argon2 WASM cache) is *re-created* rather than retained. No leak, but a reload re-parses the 388 KB bundle. Nothing actionable — just don't rely on module-level state surviving a reload.

### 5.4 Argon2 WASM: inlined, and deliberately self-limiting

`src/type/s2k/argon2.js` (<https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/src/type/s2k/argon2.js>) caches the WASM module in a module-level `let loadArgonWasmModule`, with:

```js
// reload wasm module above this treshold, to deallocated used memory
const ARGON2_WASM_MEMORY_THRESHOLD_RELOAD = 2 << 19;
```

i.e. the module is dropped and re-instantiated once its linear memory crosses ~1 MiB, specifically so WASM memory does not grow without bound in a long-lived process. The v6.3.0 release also added `config.maxArgon2MemoryExponent` (default 30 = 1 GiB) to bound *decryption* of hostile inputs, throwing `Argon2OutOfMemoryError` before allocating (<https://github.com/openpgpjs/openpgpjs/releases/tag/v6.3.1>).

Packaging: the `.wasm` is **base64-inlined** into `dist/node/openpgp.min.cjs` (verified: `AGFzbQ` — the wasm magic — appears in the bundle; `rollup.config.js` uses `@rollup/plugin-wasm` with `wasmOptions.node`). There is **no** separate `.wasm` file in `dist/node/`, so `files: ["dist"]` packaging is complete and no asset-copying step is needed.

Residual risk worth knowing: an unauthenticated Argon2-S2K message can make the library allocate up to `maxArgon2MemoryExponent` per call on the *decrypt* path. On a shared n8n process, consider lowering `maxArgon2MemoryExponent` and/or `maxDecompressedMessageSize` via the per-call config.

### 5.5 `maxDecompressedMessageSize` / zip-bomb exposure

v6.3.0 added `config.maxDecompressedMessageSize` (default `Infinity`) precisely because *"decompression can increase the memory usage non-linearly"* (<https://github.com/openpgpjs/openpgpjs/releases/tag/v6.3.0>). For a server-side node processing user-supplied ciphertext this should be bounded per call.

### 5.6 Reported issues — what actually applies

| Issue | State | Relevant to n8n main process? |
| --- | --- | --- |
| [#1449 Out of memory when decrypting large files without MDC](https://github.com/openpgpjs/openpgpjs/issues/1449) | **open** (filed v5.0.1, Node 14) | Partially. The report is about a code path that buffers the whole stream (`readToEnd(stream.clone(encrypted))`) when integrity protection is *absent*. Not on the normal (authenticated) path. Relevant only if exposing `allowUnauthenticatedMessages` on large inputs. |
| [#1613 Streaming decryption consumes too much memory](https://github.com/openpgpjs/openpgpjs/issues/1613) | closed | No — browser/React 2 GB case. |
| [#839 openpgpjs loaded twice into memory?](https://github.com/openpgpjs/openpgpjs/issues/839) | closed 2021 | No — the old browser *worker* script, removed in v5 ([#1072](https://github.com/openpgpjs/openpgpjs/pull/1072)). v6 has no built-in worker. |
| [#554 Reduce memory usage when using with nodejs](https://github.com/openpgpjs/openpgpjs/issues/554) | closed 2021 | No — resolved by v6 shipping a minified Node entry (`dist/node/openpgp.min.cjs`, 388 KB). |
| [#1852 Library does not work on edge runtimes such as CloudFlare Workers](https://github.com/openpgpjs/openpgpjs/issues/1852) | closed | No — Cloudflare Workers has no `node:crypto`; n8n's main process is full Node. |
| [#1464 Cloudflare Worker: dependency on browser-only `navigator`](https://github.com/openpgpjs/openpgpjs/issues/1464) | closed | No — same reason. |
| [#852 Web Worker Out of Memory](https://github.com/openpgpjs/openpgpjs/issues/852) | closed | No — browser-worker era (v4). |

**No reported issue describes memory growth or state corruption in a long-lived Node server process.** No openpgpjs issue or discussion mentions n8n (search of the tracker returns nothing).

### 5.7 Signature-verification caching

`src/packet/signature.js` memoises a verification result on the `Signature` object itself:

```js
// Cryptographic validity is cached after one successful verification.
// However, for message signatures, we always re-verify, since the passed `data` can change
const skipVerify = this[verified] && !isMessageSignature;
```

(<https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/src/packet/signature.js>.)

Per-object, not global — it does not leak across executions, and it makes repeated verification against a cached parsed key fast. Just be aware that a `Signature` object reused with *different* data for a non-message signature type will not re-verify; parse fresh objects or don't cache across items.

### 5.8 Dependency footprint

The published `openpgp@6.3.1` manifest declares **`"dependencies": null`** — everything is bundled. The only peer is `@openpgp/web-stream-tools@~0.3.0`, marked `peerDependenciesMeta["@openpgp/web-stream-tools"].optional = true` (see §6). So installing the community node pulls in exactly one package, with no transitive tree. Nothing to conflict with n8n's own dependency graph.

---

## 6. TypeScript typing story for v6

The README's claim is accurate but under-specified. From `v6.3.1/README.md`:

> Since TS is not fully integrated in the library, TS-only dependencies are currently listed as `devDependencies`, so to compile the project you'll need to add `@openpgp/web-stream-tools` manually: `npm install --save-dev @openpgp/web-stream-tools`

What is actually true, verified by compiling a small TS project against the n8n starter tsconfig:

1. `@openpgp/web-stream-tools` is consumed **only at type level**. `dist/types/index.d.ts` line 12 is `import type { WebStream as GenericWebStream, NodeWebStream as GenericNodeWebStream } from '@openpgp/web-stream-tools';`. Grepping `dist/node/openpgp.min.cjs` and `.min.mjs` for `web-stream-tools` yields **0 occurrences** — it is not a runtime dependency at all, despite being declared under `peerDependencies`.
2. It is therefore declared `optional: true`, so `npm install openpgp` succeeds without it (verified: the install tree contains only `openpgp`).
3. With `skipLibCheck: true` — which is set in both the n8n starter tsconfig and the `@n8n/node-cli` template tsconfig — the missing package produces **no error at all**. Verified: `npx tsc --noEmit` is clean apart from an unrelated curve-name error (below).
4. With `skipLibCheck: false` it fails, and installing the package is *not* sufficient under classic resolution:
   - absent → `node_modules/openpgp/dist/types/index.d.ts(12,91): error TS2307: Cannot find module '@openpgp/web-stream-tools'`
   - present with `"moduleResolution": "node"` → `error TS7016: Could not find a declaration file for module '@openpgp/web-stream-tools'. ... There are types at '.../lib/types/index.d.ts', but this result could not be resolved under your current 'moduleResolution' setting. Consider updating to 'node16', 'nodenext', or 'bundler'.`

   So installing it only helps if module resolution is switched to `node16`/`nodenext`/`bundler` — which would conflict with the CJS emit configuration n8n requires (`"module": "commonjs"`).

**Recommendation:** keep the starter's `skipLibCheck: true` **and** add `@openpgp/web-stream-tools@~0.3.0` as a devDependency (belt and braces, matches the README, costs nothing at runtime). Do not switch `moduleResolution`.

### Incidental v6.3.1 typing trap found while verifying

`EllipticCurveName` in `dist/types/index.d.ts` is:

```ts
export type EllipticCurveName = 'ed25519Legacy' | 'curve25519Legacy' | 'nistP256' | 'nistP384'
  | 'nistP521' | 'secp256k1' | 'brainpoolP256r1' | 'brainpoolP384r1' | 'brainpoolP512r1';
```

There is **no** `'curve25519'` and no `'ed25519'` member — the v6 rename (`enums.curve.curve25519Legacy` value changed from `'curve25519'` to `'curve25519Legacy'`, per <https://github.com/openpgpjs/openpgpjs/releases/tag/v6.0.0>) was not mirrored in the type alias. Consequences, all verified at runtime on 6.3.1:

| Call | Type-checks | Runtime |
| --- | --- | --- |
| `generateKey({ type: 'curve25519' })` | ✔ | ✔ produces an `ed25519` (v6/RFC 9580) key |
| `generateKey({ type: 'ecc', curve: 'curve25519Legacy' })` | ✔ | ✔ produces `eddsaLegacy` (v4) |
| `generateKey({ type: 'ecc', curve: 'curve25519' })` | ✘ `TS2769: Type '"curve25519"' is not assignable to type 'EllipticCurveName'` | ✔ still works — deprecated runtime alias |

Use `type: 'curve25519'` / `'curve448'` for modern v6 keys and `type: 'ecc'` + `curve: 'curve25519Legacy'` for RFC 4880 legacy keys; never write `curve: 'curve25519'`.

Also note: `read[Private]Key` return types are declared as `Key`, not `PublicKey`/`PrivateKey` (the d.ts notes this is deliberate because TS cannot distinguish the classes). Expect to cast. The v6.3.1 release did fix `'node16'`/`'nodenext'` compatibility and declaration emission (<https://github.com/openpgpjs/openpgpjs/releases/tag/v6.3.1>).

---

## 7. Recommendation: engines and import shape

### `engines`

```jsonc
"engines": { "node": ">=22.22.0" }
```

Reasoning, in order of weight:

1. **Not 18 or 20.** Both are past EOL (18 → 2025-04-30, 20 → 2026-04-30; <https://github.com/nodejs/Release/blob/main/schedule.json>), and OpenPGP.js itself drops them in the very next commit after 6.3.1 (*"Node v20 went EOL in March 2026. Node v18 in March 2025."*). Declaring support for an EOL runtime is a false promise.
2. **Not 24 as the floor.** Current n8n stable does require `>=24.0.0`, but n8n `2.9.0`–`2.35.x` declares `>=22.16` / `>=22.22` and still runs OpenPGP.js v6 fine — nothing in openpgp needs more than Node 18. A `>=24.0.0` floor would emit spurious `EBADENGINE` warnings (or hard failures under `engine-strict`) for a technically-functional install base, for no technical reason.
3. **22.22.0 specifically** is n8n's own documented minimum for authoring nodes (<https://docs.n8n.io/connect/create-nodes/build-your-node/set-up-your-development-environment.md>), and is exactly the floor n8n declared from `2.23.0`. It is the narrowest floor that is truthful for every n8n release the node can plausibly run on.
4. Node 22 is in **maintenance** LTS (until 2027-04-30), not EOL — so this is not an EOL floor either.

If the project decides to support only the current n8n stable line and its Docker image (Node 24–26), `">=24.0.0"` is the honest alternative. Either is defensible; `">=22.22.0"` is the more inclusive truthful value and is what I recommend.

Note that `engines` is advisory here — n8n does not enforce a community package's `engines` at load time, and npm only warns unless `engine-strict` is set. It is a statement of tested support, so it should match the CI matrix: **test on Node 22 and 24** (and ideally 26, matching the official Docker image).

### Import shape

```ts
// nodes/OpenPgp/OpenPgp.node.ts
import * as openpgp from 'openpgp';
import type { PartialConfig } from 'openpgp';
```

emitted by `tsc` (`"module": "commonjs"`, `"esModuleInterop": true`) as `const openpgp = require("openpgp")`, which Node resolves through `exports["."].require` → `dist/node/openpgp.min.cjs`. **This exact path was executed end-to-end and produces correct ciphertext and verified signatures.**

Rules that follow:

- ✅ `import * as openpgp from 'openpgp'` — CJS build, verified.
- ❌ `import openpgp from 'openpgp'` — no default export.
- ❌ `import('openpgp')` as the only load path — n8n instantiates the node class synchronously inside a `vm` context that provides `require` and nothing else.
- ❌ `require('openpgp/lightweight')` — throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- ❌ `openpgp.config.x = …` — process-global mutation; pass `config` per call instead.
- ❌ Passing a `stream.Readable` as message input — v6 requires Web Streams or plain data.
- ✅ Depend on nothing else; `openpgp` has zero runtime dependencies.

---

## 8. Confidence and unverified items

**Verified empirically** (executed during this research, on Node v24.19.0):
- `require('openpgp')` resolution to `dist/node/openpgp.min.cjs`, and a full X25519 generate → encrypt(sign) → decrypt → verify round-trip.
- `openpgp/lightweight` unreachable from both `require` and `import` in Node (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
- `tsc` behaviour with/without `@openpgp/web-stream-tools` under `skipLibCheck` true and false, with `"moduleResolution": "node"`.
- `@openpgp/web-stream-tools` has zero occurrences in the shipped Node bundles; Argon2 WASM is base64-inlined in the `.cjs`; the `.cjs` is 388 KB with no loose assets.
- The three `generateKey` curve forms above.
- All package metadata quoted from the npm registry / published tarballs.

**Verified from primary documents, not executed:**
- n8n's `engines` history, Dockerfile `NODE_VERSION`, tsconfig, loader sources.
- Node's global availability matrix and EOL schedule (read from the versioned docs and `schedule.json`, not reproduced by running Node 18/20 here — only Node v24.19.0 was available in this environment).
- OpenPGP.js CI matrices and README text at each tag/commit.
- The v22+ commit being exactly one commit after the `v6.3.1` tag (`compare` API).

**Could not verify / flagged:**
- `docs.n8n.io`'s npm-install page (`"20.19 and 24.x"`) contradicts n8n's own `engines` for 2.36+. It is presumably stale. **Do not cite it as authoritative.**
- I found **no** statement anywhere (docs, forum, issues) specifically about OpenPGP.js v6 running inside n8n; there is no prior confirmation to lean on. The compatibility conclusion here is derived from n8n's loader source + n8n's `engines` + an executed round-trip, not from a published report.
- n8n renders on `latest` = `2.39.10` / `beta` = `2.40.5`; `n8n-nodes-base` publishes separately with a lower `latest`. Not material to this ticket.
- Long-run (hours/days) heap behaviour of the n8n main process with openpgp loaded was not measured; the §5 conclusions are from source inspection (Argon2 WASM reload threshold, zero module-level caches beyond `config`) and the absence of any tracker report, **not** from a soak test.
- Task-runner / worker mode was not investigated — community nodes run in the main process, so it was out of scope for this ticket.

---

## Sources

| Claim area | URL |
| --- | --- |
| openpgp `engines`, `exports`, deps, per-version metadata | <https://registry.npmjs.org/openpgp> |
| openpgp v6.3.1 README (Node v18+, WebCrypto, Web Streams, TS note) | <https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/README.md> |
| openpgp main README + package.json (Node v22+) | <https://github.com/openpgpjs/openpgpjs/blob/main/README.md> · <https://github.com/openpgpjs/openpgpjs/blob/main/package.json> |
| openpgp CI matrices | <https://github.com/openpgpjs/openpgpjs/blob/v6.3.1/.github/workflows/tests.yml> · <https://github.com/openpgpjs/openpgpjs/blob/main/.github/workflows/tests.yml> |
| "Only support Node v22+" commit | <https://github.com/openpgpjs/openpgpjs/commit/f9291c9473> |
| v6.0.0 / v6.3.0 / v6.3.1 release notes | <https://github.com/openpgpjs/openpgpjs/releases> |
| V6 changelog wiki · updating wiki | <https://github.com/openpgpjs/openpgpjs/wiki/V6-Changelog> · <https://github.com/openpgpjs/openpgpjs/wiki/Updating-from-previous-versions> |
| openpgp source: config singleton, WebCrypto fallback, Argon2 WASM, signature cache | <https://github.com/openpgpjs/openpgpjs/tree/v6.3.1/src> |
| openpgp docs site | <https://docs.openpgpjs.org/> |
| openpgp issues referenced | <https://github.com/openpgpjs/openpgpjs/issues/1449> · [/1613](https://github.com/openpgpjs/openpgpjs/issues/1613) · [/839](https://github.com/openpgpjs/openpgpjs/issues/839) · [/554](https://github.com/openpgpjs/openpgpjs/issues/554) · [/1852](https://github.com/openpgpjs/openpgpjs/issues/1852) · [/1464](https://github.com/openpgpjs/openpgpjs/issues/1464) |
| n8n `engines` history and current stable | <https://registry.npmjs.org/n8n> |
| n8n Docker Node version | <https://github.com/n8n-io/n8n/blob/master/docker/images/n8n/Dockerfile> |
| n8n node loader (require semantics, require-cache reset) | <https://github.com/n8n-io/n8n/tree/master/packages/core/src/nodes-loader> |
| n8n-node tool (tsc build, template tsconfig) | <https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool.md> · <https://www.npmjs.com/package/@n8n/node-cli> |
| n8n starter tsconfig / package.json | <https://github.com/n8n-io/n8n-nodes-starter> |
| n8n docs: node dev minimum Node 22.22.0 | <https://docs.n8n.io/connect/create-nodes/build-your-node/set-up-your-development-environment.md> |
| n8n docs: npm install (stale Node statement) | <https://docs.n8n.io/deploy/host-n8n/install-options/install-with-npm.md> |
| Node global availability (WebCrypto behind flag on 18) | <https://github.com/nodejs/node/blob/v18.x/doc/api/globals.md> · <https://github.com/nodejs/node/blob/v20.x/doc/api/globals.md> |
| Node release / EOL schedule | <https://github.com/nodejs/Release/blob/main/schedule.json> |
| Node `Readable.toWeb` conversion helper | <https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options> |
| n8n community forum: PGP/openpgp attempts in n8n | <https://community.n8n.io/t/pgp-decryption/13942> |
