# `n8n-nodes-openpgp` — Locked Spec & Build Plan

**Status:** **LOCKED** (2026-09-21) — assembled from the closed decision tickets and reviewed with the human in the [#9](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/9) grilling round (all eight assembly questions confirmed as drafted). Changing a locked decision now requires a new ticket on the map.
**Audience:** the implementation session that builds the package. This document is the single input; nothing in it needs re-deciding.
**Provenance:** consolidates the closed decision tickets of [Map: n8n community node package for OpenPGP.js](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/1): [#2](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/2) prior-art audit, [#3](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/3) OpenPGP.js runtime compatibility, [#4](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/4) binary-data conventions, [#5](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/5) verification/bundling NO-GO, [#6](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/6) node UX & parameter spec, [#7](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/7) CI/CD & automation design, [#8](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/8) npm bootstrap.
**Not locked here:** docs, branding, example workflows, icon, help-anchor scheme, UX-guideline conformance pass — owned by [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10) (open). Build-plan Step 7 consumes its decisions.
**Convention:** "MUST/NEVER" reproduce a locked decision; anything marked *[implementation-time]* is syntax-level detail the implementer verifies against live docs, with the semantics already fixed here.

---

## 0. Orientation

| | |
|---|---|
| Package | `n8n-nodes-openpgp` ([npm](https://www.npmjs.com/package/n8n-nodes-openpgp), name reserved) |
| Repo | `calvertjadon/n8n-nodes-openpgp` (MIT) |
| What it is | One programmatic n8n node, **OpenPGP**: Encrypt / Decrypt / Sign / Verify, plus one credential holding an armored private key |
| Distribution | Public npm, published by CI with SLSA provenance via npm Trusted Publishers; **unverified** community node (bundling ruled out — §6) |
| Runtime | `openpgp@6.3.1` (exact pin) as the only run-time dependency; `n8n-workflow` peer; Node ≥ 22.22.0 |
| Maintenance posture | Hands-off: auto-release on merge to `main`, Renovate automerges every green bump, humans only when CI goes red |
| Builder | A held-out implementation session; the map is planning-only |

Read §1–§8 for the locked decisions, §9 for the ordered build steps, §10 for done-ness, and the appendices for config content that must be *landed*, not re-derived.

---

## 1. Package identity

| Field | Value |
|---|---|
| `name` | `n8n-nodes-openpgp` |
| `version` | `0.1.0` at scaffold; first CI release bumps per §7.5 (must end **> 0.0.1** — npm already carries the reserved `0.0.0` and the deprecated round-trip `0.0.1`) |
| `description` | One line, ≤ 200 chars — the README subtitle, and the n8n nodes-panel blurb; final wording owned by [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10). Draft: "Encrypt, decrypt, sign, and verify data with OpenPGP — key-based or password-based." |
| `license` | `MIT` — **exactly** `"MIT"` (the n8n scanner rejects SPDX combinations, which is part of why bundling is out: §6) |
| `homepage` | `https://github.com/calvertjadon/n8n-nodes-openpgp#readme` |
| `repository.url` | `git+https://github.com/calvertjadon/n8n-nodes-openpgp.git` — **byte-exact**; npm trusted publishing + provenance match on it (`npm trust` normalized the placeholder to this string) |
| `keywords` | `n8n-community-node-package` (required) + `n8n`, `openpgp`, `pgp`, `gpg`, `encryption`, `signature` |
| `author` | `calvertjadon` (name + email on the npm account) |
| `files` | `["dist"]` |
| `n8n` | `{ "n8nNodesApiVersion": 1, "strict": true, "credentials": ["dist/credentials/OpenPgpPrivateKey.credentials.js"], "nodes": ["dist/nodes/OpenPgp/OpenPgp.node.js"] }` |
| `engines.node` | `>=22.22.0` (n8n's documented node-authoring minimum and its own declared floor from 2.23.0; 18/20 EOL; openpgp's published floor is 18, so `>=24.0.0` would spuriously `EBADENGINE` older-but-working n8n installs — [#3](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/3)) |
| `peerDependencies` | `n8n-workflow: "*"` — the scanner's peer rule allows this one only |
| `dependencies` | `openpgp: "6.3.1"` (exact, per pin-everything §7.2) |
| `devDependencies` | exact pins: `@n8n/node-cli`, `@openpgp/web-stream-tools`, `eslint`, `prettier`, `release-it`, `@release-it/conventional-changelog`, `typescript`, `vitest`, `@commitlint/cli`, `@commitlint/config-conventional`, `n8n-workflow` |
| `publishConfig` | `{ "provenance": true }` (belt-and-braces; OIDC already auto-signs) |
| Icon | deferred to [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10); file lands at `nodes/OpenPgp/openPgp.svg` (+ dark variant if the chosen SVG needs one) |

Repo hygiene at scaffold time (Step 0): delete the research residue `n8n.json` (110 KB npm-registry dump); commit `AGENTS.md` + `docs/agents/`, which are currently untracked.

---

## 2. Public interface: credential `OpenPgpPrivateKey`

Declared **`required: false`** on the node, with a per-action runtime check (Encrypt when *Also Sign* is on, Decrypt in Private Key mode, Sign always; Verify never).

| Field | Display name | Type | Notes |
|---|---|---|---|
| `privateKey` | Private Key | string, `typeOptions: { password: true, rows: 6 }` | Armored ASCII private key, **masked** (fixes the incumbent's unmasked-key issue), multiline |
| `passphrase` | Passphrase | string, `typeOptions: { password: true }` | Optional — unprotected keys are allowed |

**No `test` / `testRequest`**: credential tests in n8n are HTTP-only (`ICredentialTestRequest.request`); a key-holding credential has nothing executable to test. The node's own error copy covers the failure modes.

---

## 3. Public interface: node `OpenPgp`

- `name: 'openPgp'`, `displayName: 'OpenPGP'`, `description` per §1, `subtitle: '={{ $parameter["operation"] }}'`, `icon` per [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10), `helpUrl` → repo README ([#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10) pins anchors).
- Top-level `operation`: **Encrypt | Decrypt | Sign | Verify**, default Encrypt.

### 3.1 Cross-cutting behaviour (every action)

- Per-item loop over input items; every emitted item carries **`pairedItem: { item: i }`**; **never mutate or clobber the input item** (fresh output JSON; the incumbent lineage clobbers and that is a named prior-art gap).
- Errors: `NodeOperationError`, `[Item N]` suffix, via `this.continueOnFail()` (folds in the node-level On Error setting). Canonical copy in §3.6.
- Expressions supported on every string parameter.
- **Never mutate `openpgp.config`** (process-global singleton, races across concurrent executions). Pass a **per-call** `config` to every call: `maxArgon2MemoryExponent: 20` (1 GiB) and `maxDecompressedMessageSize: 512 * 1024 * 1024` (512 MiB — matches the database binary-mode file cap).
- **Legacy Compatibility** boolean (Options collection on all four actions, default `false`): when on, adds `allowMissingKeyFlags: true`, `enableParsingV5Entities: true`, `parseAEADEncryptedV4KeysAsLegacy: true` to the per-call config. Help text names what it permits; warns that `parseAEADEncryptedV4KeysAsLegacy` is only correct for v4 keys AEAD-encrypted by OpenPGP.js v5. (Adopted on recommendation in [#6](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/6), flagged revisable; splitting it into three flags later is cheap.)
- **Text handling**: always call openpgp with `format: 'binary'` and decode UTF-8 ourselves (`new TextDecoder('utf-8', { fatal: true })`) — avoids v6's `format:'utf8'` newline normalisation (CRLF→LF) and turns invalid UTF-8 into a named error instead of U+FFFD.
- **Key-input hardening** on every key parameter: trim whitespace, normalise CRLF, tolerate junk headers (stray `Version:` lines), accept multi-key armored blocks via `readKeys`. Armored input only (binary keys cannot be pasted).
- **Source Data** discriminator (Text | Binary) per action; Text reveals an inline string param, Binary reveals *Input Binary Field* (`type: 'string'`, default `data`). **Output As** discriminator (Text | Binary): Text reveals *Output Field Name* (default `data`); Binary reveals *Put Output File in Field* (default `data`).
- Defaults pinned to the file-centric main path — `Read File → OpenPGP → Write File` all on `data`, zero configuration: Source Data = Binary for Encrypt/Decrypt/Sign/Verify-Embedded; Output As = Binary (Encrypt, Decrypt), Text (Sign), n/a (Verify). Sole exception: Verify's *Signature Source* defaults to Text (armored signatures are text).
- **Armor Output** boolean (Options on Encrypt/Sign Binary output, default `true`); Text output is always armored; Decrypt has no armor option.
- **Filename plumbing**: Binary input embeds the input `fileName` into the literal-data packet; Decrypt recovers the message's embedded `filename` as the output `fileName` (fallback `data`).
- **Binary output naming**: input fileName or `data` + artifact suffix — `.pgp` (binary) / `.asc` (armored) for Encrypt, `.sig` (detached signatures); cleartext output gets none. mimeTypes: Encrypt `application/pgp-encrypted`, Sign `application/pgp-signature`, Decrypt `application/octet-stream`. (`application/pgp-*` has no `fileTypeFromMimeType` entry → `fileType` stays `undefined`; harmless.)
- **Signature-result fields** whenever verification keys are supplied and no throw fires, in Text and Binary output modes alike: flat `signed: boolean`, `verified: boolean`, `keyID: string | null` (lowercase hex via `toHex()`; help text notes GPG shows uppercase). Multiple signature packets collapse: `signed = signatures.length > 0`; `verified` = any entry verifies (the library's own `anyPromise` semantics under `expectSigned`); `keyID` = first resolving entry's hex, else `null`.

### 3.2 Encrypt

| Param | Display name | Shape |
|---|---|---|
| `sourceData` | Source Data | Text \| Binary, default Binary |
| `textToEncrypt` | Text to Encrypt | string (textarea), required — Text mode |
| `binaryPropertyName` | Input Binary Field | string, default `data` — Binary mode |
| `encryptUsing` | Encrypt Using | Public Keys \| Password, default Public Keys |
| `publicKeys` | Public Key(s) | textarea, required — keys mode; multi-key block → multiple recipients |
| `password` | Password | string, required — Password mode |
| `alsoSign` | Also Sign | boolean, default false — works in both modes (v6 `encrypt()` takes `signingKeys` alongside `encryptionKeys` **and** `passwords`); needs the credential |
| `outputAs` | Output As | Text \| Binary, default Binary |
| `outputFieldName` | Output Field Name | string, default `data` — Text mode |
| `outputBinaryFieldName` | Put Output File in Field | string, default `data` — Binary mode |
| `options` | Options | collection: Armor Output (bool, true; Binary only), Compression (None \| ZIP \| ZLIB, default None — v6 default is uncompressed; key mode still negotiates recipient preferences; bzip2 is decompression-only in v6 and never offered), Hide Recipients (bool, false → `wildcard: true`; keys mode only), Legacy Compatibility |

### 3.3 Decrypt

| Param | Display name | Shape |
|---|---|---|
| `sourceData` | Source Data | Text \| Binary, default Binary |
| `textToDecrypt` | Text to Decrypt | string (textarea), required — Text mode |
| `binaryPropertyName` | Input Binary Field | string, default `data` — Binary mode |
| `decryptUsing` | Decrypt Using | Private Key (Credential) \| Password, default Private Key — v6 verification keys are orthogonal to both |
| `password` | Password | string, required — Password mode |
| `publicKeys` | Public Key(s) | textarea, optional — **verification** keys, usable in both modes |
| `requireValidSignature` | Require Valid Signature | boolean, default false; help text notes it requires Public Key(s). This is the differentiation fix: throw instead of silently returning unsigned data |
| `outputAs` | Output As | Text \| Binary, default Binary |
| `options` | Options | collection: Legacy Compatibility |

### 3.4 Sign

| Param | Display name | Shape |
|---|---|---|
| `signatureType` | Signature Type | Detached \| Cleartext \| Inline, default Detached |
| `sourceData` | Source Data | Text \| Binary, default Binary — **hidden for Cleartext** (v6 cleartext is string-only) |
| `textToSign` | Text to Sign | string (textarea), required — Text/Cleartext mode |
| `binaryPropertyName` | Input Binary Field | string, default `data` — Binary mode |
| `outputAs` | Output As | Text \| Binary, default Text — hidden for Cleartext (forced Text) |
| `options` | Options | collection: Armor Output (Binary output, non-cleartext only), Legacy Compatibility. No compression — v6 `sign()` never compresses |

Credential always required.

### 3.5 Verify

| Param | Display name | Shape |
|---|---|---|
| `signatureType` | Signature Type | Detached \| Embedded, default Detached |
| `messageSource` | Message Source | Text \| Binary, default Binary — Detached |
| `messageText` / `messageBinaryPropertyName` | Message Text / Input Binary Field | per mode — Detached |
| `signatureSource` | Signature Source | Text \| Binary, default **Text** — Detached |
| `signatureText` / `signatureBinaryPropertyName` | Signature Text / Input Binary Field | per mode — Detached |
| `sourceData` | Source Data | Text \| Binary, default Binary — Embedded (covers cleartext + inline through one `verify()` call) |
| `publicKeys` | Public Key(s) | textarea, required |
| `throwOnInvalidSignature` | Throw on Invalid Signature | boolean, default **true** — real failure semantics is the package's reason to exist; uncheck (or On Error outputs) for predicate-style branching |
| `options` | Options | collection: Legacy Compatibility |

Output is JSON-only: `{ verified, signed, keyID, data? }` — `data` carries the recovered text content for Embedded cleartext / text-format literal packets; binary literal content is **not** recovered (documented v1 gap: that needs Decrypt and a key).

### 3.6 Output item shapes

```ts
// Text output mode
{ json: { [outputFieldName]: string, signed?, verified?, keyID? }, pairedItem: { item: i } }
// Binary output mode
{ json: { mimeType, fileName, fileSize, signed?, verified?, keyID? },
  binary: { [outputBinaryFieldName]: IBinaryData }, pairedItem: { item: i } }
// Verify (always)
{ json: { verified, signed, keyID, data? }, pairedItem: { item: i } }
```

### 3.7 Canonical error copy (NodeOperationError; parameter named; description = how to unblock)

| Situation | Message |
|---|---|
| Missing credential | "This operation needs an OpenPGP Private Key credential — attach one to the node." |
| Unparseable key block | "Public Key(s) doesn't contain a readable OpenPGP key — paste the full armored block, including BEGIN/END lines." |
| Decryption rejected | "Couldn't decrypt with this credential's private key — check the Passphrase, or that the message was encrypted for this key." |
| Require Valid Signature, unsigned | "Message is not signed — Require Valid Signature is on." |
| Require Valid Signature / Throw on Invalid, invalid | "Signature did not verify — the message was not signed by any provided Public Key(s)." |
| Non-UTF-8 plaintext into Text output | "Plaintext is not valid UTF-8 text — set Output As to Binary instead." |

---

## 4. Runtime & dependency decisions ([#3](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/3))

- `openpgp@6.3.1` runs in n8n as-is — zero run-time dependencies, verified `require()` round-trip; **no adapter, shim, or build workaround**.
- Import shape: `import * as openpgp from 'openpgp'` (compiles to `require('openpgp')` → `dist/node/openpgp.min.cjs`). Never `import openpgp from 'openpgp'` (no default export); never `openpgp/lightweight` (`ERR_PACKAGE_PATH_NOT_EXPORTED` outside browsers).
- Keep `"skipLibCheck": true` (scaffold default) — `@openpgp/web-stream-tools` is type-level only and optional-peer; skipLibCheck makes its absence a no-op, but we add it as a devDependency (exact pin) anyway.
- Node floor `>=22.22.0`; CI matrix 22 / 24 / 26 (§7.4).
- v6 needs WebCrypto + Web Streams; both present in range (v6 falls back to `node:crypto` on older Node). **Never pass `stream.Readable`** — bridge with `Readable.toWeb()` if streaming ever appears (it is out of scope).
- Long-lived-process findings: entropy is the OS CSPRNG (no pool starvation); Argon2 WASM is base64-inlined in the `.cjs` (so `files: ["dist"]` packaging is complete) and self-limiting; n8n sweeps community-node files from `require.cache` on reload; no tracker report of memory growth or state corruption in Node servers. Keep the per-call config bounds (§3.1) as the hostile-input guard.
- Key-type trap: use `{ type: 'curve25519' }` for v6 keys and `curve: 'curve25519Legacy'` for legacy v4 — `EllipticCurveName` omits `'curve25519'`, so the alias-based form fails `tsc`.

## 5. Binary-data conventions ([#4](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/4))

- Default binary property is **`data`** in every direction; helpers are mandatory:
  - consume: `this.helpers.assertBinaryData(i, name)` → `await this.helpers.getBinaryDataBuffer(i, name)`;
  - emit: `await this.helpers.prepareBinaryData(buffer, fileName, mimeType)`.
- **NEVER hand-decode `item.binary[x].data` as base64** — under filesystem/s3/database modes `data` holds `"<mode>"` and the bytes live behind `id = "<mode>:<fileId>"`; the incumbent packages ship this bug (garbage output on n8n ≥ 2).
- `binaryPropertyName`-style params are plain `type: 'string'`, default `'data'` (census over `n8n-nodes-base@2.15.1`: 92 declarations, zero resourceLocator) → the UX-guideline resource-locator rule does not apply to binary fields.
- Text-vs-binary input uses the top-level discriminator + `displayOptions` pattern (built-in Html node precedent), not two competing input params.
- Every emitted item gets `pairedItem: { item: i }`; `n8n-core@2.16.x` binary modes: memory (default per docs) vs `filesystem`/`database` per code — flagged discrepancy, irrelevant because the helpers abstract it. Buffer-based v1 accepts the whole-file materialisation cost.
- Target chain: `Read File (data) → OpenPGP (in+out data) → Write File (data)` with zero configuration.

## 6. Verification & bundling: NO-GO ([#5](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/5))

- The n8n catalog scanner lints the **published tarball's `**/*.js` as source** with `allowInlineConfig: false` (no `eslint-disable` escape). A bundled openpgp leaves a hard floor of **6 error-level violations** (globals polyfill, `setTimeout`, `console.*`, `process.env`, `process.exit`, `require('module'|'url')`). Zero verified nodes in the 98-package catalog bundle, and n8n's own `n8n-node build` is plain `tsc`.
- LGPL-3.0+ bundling obligations (§4 Combined Work: notices + relinkability) collide with the scanner's exact-`MIT` license rule.
- **Decision:** ship **unverified** with `openpgp` in `dependencies`. `@openpgp/web-stream-tools` stays a **dev**Dependency (peer rule permits only `n8n-workflow`).
- Consequence to document (README, [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10)): n8n 3.0 (Oct 2026) flips `N8N_UNVERIFIED_PACKAGES_ENABLED` to `false` → self-hosted operators must opt in to install/keep unverified nodes; n8n Cloud stays out of reach. Known trade-off, not a blocker.
- Do **not** exploit the scanner's `.js`-only glob with a `.cjs`/`.mjs` bundle — evasion, not compliance, and an ESM dist would not load in n8n anyway.

## 7. CI/CD & automation ([#7](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/7))

### 7.1 Release pipeline
- **Single workflow** `.github/workflows/release.yml`, `on: push: branches: [main]` (the scaffold's tag-triggered `publish.yml` is deleted). One atomic run: full CI gate → if releasable commits exist → release-it `--ci` bumps, commits, tags, pushes, creates the GitHub Release, and OIDC-publishes.
- Cadence: auto-on-merge; a merge with nothing releasable publishes nothing.
- Why single: `GITHUB_TOKEN`-pushed tags do not trigger other workflows → any two-workflow shape needs a PAT/App token, which the hands-off preference rejects. Partial-failure repair: `release-it --no-increment`.
- Mechanics: `permissions: { contents: write, id-token: write }`; `env: RELEASE_MODE=true` (the scaffold's `prepublishOnly: n8n-node prerelease` gate rejects publishes without it); `npm install -g npm@latest` (trusted-publishing floor npm ≥ 11.5.1 / Node ≥ 22.14.0); call **release-it directly** (`n8n-node release`'s CI branch publishes only — it cannot bump).
- Provenance is automatic (OIDC + public repo); `publishConfig.provenance: true` as belt-and-braces.
- Post-publish tripwire: `npx @n8n/scan-community-package n8n-nodes-openpgp@<version>` — detects a bad publish within minutes (it cannot prevent one: the scanner only reads published artifacts).
- **Workflow filename is immutable** in the npm trusted-publisher binding → `release.yml` it is.

### 7.2 Dependency management
- **Renovate** (hosted app), **pin everything** (`rangeStrategy: "pin"` for deps and devDeps): the shipped artifact matches exactly what CI tested.
- **Automerge all green bumps, including openpgp majors.** The human appears only when tests fail.
- Load-bearing consequence: the test layer is the sole escalation gate → **committed GnuPG interop fixtures are mandatory** (§9 Step 5, Appendix B) so a behaviour-shifting openpgp major fails CI rather than shipping.
- `renovate.json` shape: devDeps grouped (non-major); `platformAutomerge`; `:enableVulnerabilityAlerts` + `rangeStrategy: "pin"` override inside `vulnerabilityAlerts` (its `update-lockfile` default would fix only the lockfile); label on openpgp majors; `security:minimumReleaseAgeNpm` (3-day hijack-window buffer; security fixes bypass it by design); docker (`n8nio/n8n` pin) + github-actions bumps with `ci(deps):` prefix; releaseRules ignore `ci` so CI-only bumps never cut a release.
- Repo prerequisites: Dependency graph + Dependabot alerts enabled (Renovate consumes GitHub's alerts as its vulnerability source).

### 7.3 CI lanes (`.github/workflows/ci.yml` rewritten)
- **Fast lane** (blocking; matrix Node 22 / 24 / 26): `npm ci` → commitlint → `npm run lint` (`n8n-node lint`; `eslint.config.mjs` must never be modified — `n8n.strict: true`) → `npm run build` → `npm test` (vitest).
- **Smoke lane — stable** (blocking): `npm pack` → pinned `n8nio/n8n:<full-patch>` container (2.39.10 today; **no per-minor tags exist**) → install the tgz into `~/.n8n/nodes` (the real consumer path — exercises the manifest, `files`, dependency resolution; not `N8N_CUSTOM_EXTENSIONS`) → `n8n import:credentials -i` + `n8n import:workflow -i` (committed JSON fixtures) → `n8n execute --id <id> --raw-output` → assert on parsed JSON with real exit codes. No API key, no license, no browser (the public REST API has no run endpoint).
- Smoke flows: key-based Encrypt→Decrypt round-trip through the binary path (plaintext + filename survive); Password-mode round-trip; Detached Sign→Verify (`verified: true` + signer keyID); Verify negative (wrong key + Throw on Invalid Signature → canonical `NodeOperationError`); plus GnuPG interop. Happy paths + one negative here; the exhaustive options matrix lives in the unit layer.
- **v3 canary** (**non-blocking**, `continue-on-error`): floating `n8nio/n8n:v3-nightly` watching the Oct-2026 cliff. On 3.0: promote to a second pinned blocking lane, retire the nightly.
- No beta lane — the Renovate-managed stable pin judges each n8n minor one week late with better signal isolation.
- Required status checks (branch protection): fast lane ×3 + smoke-stable.

### 7.4 Node matrix
Node 22 / 24 / 26 on the fast lane (floor `>=22.22.0`); smoke lanes run under the n8n image's bundled Node. Nothing below 22.

### 7.5 Versioning
- Semver from conventional commits (`feat`→minor, `fix`→patch, breaking→major), changelog via `@release-it/conventional-changelog` with custom `releaseRules`: `chore(deps)` → **patch** (stock preset ignores `chore`, which would leave merged dependency bumps unpublished and starve the security-fix path); `fix(deps)` → patch; `ci(deps)` → no release.
- A **green** openpgp major releases as our **patch**; a **red** one escalates, and the adaptation work carries its own commit types (up to breaking). Invariant: a dependency bump alone never exceeds patch.

## 8. npm bootstrap state ([#8](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/8)) — done

- Package exists: `n8n-nodes-openpgp`; maintainer `calvertjadon` (2FA on); versions `0.0.0` (inert reservation, currently `latest`) and `0.0.1` (deprecated OIDC round-trip artifact).
- **Trusted Publisher bound**: id `87f3234e-46ee-439a-8e80-ee99421c3c24`, GitHub, repo `calvertjadon/n8n-nodes-openpgp`, file **`release.yml`**, permissions publish + stage publish (`--allow-publish` explicit → the post-2026-09-03 stage-only default trap is avoided). Immutable: changing the filename means delete + recreate.
- **OIDC round-trip verified**: a real publish from Actions produced automatic SLSA provenance v1 (sigstore logIndex 2906727600), no token, no `--provenance` flag.
- Facts the build inherits: `repository.url` exact string (§1); workflow filename `release.yml`; first real version **> 0.0.1**; no npm token will ever exist.
- Deferred hardening (do after the first real CI release): npm → Publish access → "Require 2FA and disallow tokens".

---

## 9. Build plan

Each step is one commit group, landed on a PR (auto-merge on green) once CI exists. Steps 0–1 are the only ones without CI; they land directly on `main` with local verification.

### Step 0 — Scaffold transplant & repo hygiene
1. `npm create @n8n/node@latest` in a **temp directory** (programmatic/custom template), package name `n8n-nodes-openpgp` — the repo is non-empty and must keep `CONTEXT.md`, `docs/`, `README.md`, `.github/workflows/release.yml`.
2. Transplant from the temp scaffold: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.js`, `.vscode/launch.json`, `gitignore` → `.gitignore`, `CHANGELOG.md`, `.agents/*.md`; merge the scaffold's `AGENTS.md` (n8n node-dev guidance) into the repo's existing `AGENTS.md` (skills + issue-tracker conventions) rather than replacing either.
3. Delete from the transplant: the example node (`nodes/Example/**`), `.github/workflows/publish.yml` (superseded by `release.yml`), scaffold `README.md` (repo README + [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10) own that file), scaffold `CHANGELOG.md` body if it conflicts with release-it's generated one.
4. Delete `n8n.json` (research residue); `git add` `AGENTS.md` + `docs/agents/`.
5. `npm install`.
**Verify:** `npm run build` and `npm run lint` pass on the transplant with the example node removed. *(The `n8n` section in package.json points at node files that do not exist yet — Step 1 fixes the paths and Step 3 creates them; keep lint/dev out of the loop until then.)*

### Step 1 — Package identity & dependencies
1. Apply §1 verbatim (identity fields, `engines`, `n8n` section paths, `files`, `publishConfig`).
2. `npm install openpgp@6.3.1` → `dependencies`; `npm install -D` the pinned devDeps (§1), including `vitest`, `@commitlint/cli`, `@commitlint/config-conventional`, `@release-it/conventional-changelog`.
3. Scripts: keep scaffold `build`/`build:watch`/`dev`/`lint`/`lint:fix`/`release`/`prepublishOnly`; add `"test": "vitest run"`, `"commitlint": "commitlint"`.
**Verify:** `npm run lint`, `npm run build` clean; `node -e "require('openpgp')"` resolves the CJS build.

### Step 2 — Credential
`credentials/OpenPgpPrivateKey.credentials.ts` exactly as §2 (name `openPgpPrivateKey`, displayName "OpenPGP Private Key", masked key, optional passphrase, no test), registered in `package.json#n8n.credentials`.
**Verify:** lint + build; credential parses as a valid `ICredentialType` (unit-level import check).

### Step 3 — Node: shared plumbing then the four operations
`nodes/OpenPgp/OpenPgp.node.ts` (+ `openPgp.svg` from [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10)), in this order:
1. Shared helpers: per-call `config` builder (bounds + Legacy Compatibility), key parsing/hardening (`readKeys`), text/binary input reader, output builder (text field / binary via `prepareBinaryData`, filename + suffix + mimeType rules), signature-result collapse, error factory with the §3.7 copy, `pairedItem` + `continueOnFail` scaffolding.
2. **Encrypt** (§3.2) — all modes: keys/password × also-sign × text/binary out, options collection.
3. **Decrypt** (§3.3) — private-key/password, optional verification keys, `requireValidSignature`, embedded filename recovery.
4. **Sign** (§3.4) — detached / cleartext / inline with the Cleartext displayOptions forcing text.
5. **Verify** (§3.5) — detached / embedded, `throwOnInvalidSignature`, result fields, text-literal recovery.
**Verify:** unit tests from Step 4 exercise every branch; `npm run lint` + `npm run build` clean. Express the #6 parameter table literally — display names, defaults and `displayOptions` are locked strings.

### Step 4 — Unit layer (vitest)
Scaffold-free: `vitest.config.ts`, `test/` with a hand-rolled mocked execute-context harness, node class instantiated directly, **real openpgp** (never mock the crypto). Coverage: operations × Source Data × Output As, options matrix (armor / compression / hide-recipients / Legacy Compatibility per-call config assertion), `pairedItem`, filename + suffix + mimeType rules, the §3.7 error paths, multi-key + hardened-key-input cases.
**Verify:** `npm test` green locally; every parameter documented in §3 has at least one asserting test.

### Step 5 — Fixtures & GnuPG interop
1. `scripts/gen-interop-fixtures.sh` (committed, re-runnable) generating, with `gpg`: an RSA and a curve25519 keypair (passphrase-protected variants), messages, ciphertexts (armored + binary, hidden-recipient variant), detached + cleartext + inline signatures.
2. Committed under `test/fixtures/` with a manifest (fingerprints, Key IDs, passphrases, exact gpg commands); workflow + credential JSON fixtures for the smoke lane.
3. Interop assertions: node-encrypt → `gpg --decrypt`; gpg-encrypt → node Decrypt; node-sign → `gpg --verify`; gpg-sign → node Verify. Tests use a throwaway `GNUPGHOME` (`--batch --pinentry-mode loopback`).
**Verify:** suite green in the fast lane and locally; a deliberately altered openpgp default (test mutation, not committed) fails the interop suite — proving the gate has teeth.

### Step 6 — Smoke harness + CI/CD configs
1. `test/smoke/` harness scripts implementing §7.3's container flow; `npm run smoke` for local use.
2. `.github/workflows/ci.yml` rewritten (§7.3), `.github/workflows/release.yml` filled in (§7.1), `renovate.json`, `.release-it.json`, `commitlint.config.js` — pinned content in Appendix A.
**Verify:** a PR runs fast lane on 22/24/26 + smoke-stable green; a `chore:` only push produces no release; a `feat:` push produces a GitHub Release + npm publish with provenance + a clean scan tripwire. *(Dry-run the release path with `release-it --dry-run` in CI before the first real merge.)*

### Step 7 — Public surface ([#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10))
README per #10's outline (n8n 3.0 opt-in note, per-operation usage, key-hardening expectations, Legacy Compatibility warnings, known gaps), example workflow JSONs, icon, `helpUrl` anchors, and the UX-guideline conformance fixes #10 lists.
**Verify:** README examples reproduced against a local n8n (`npm run dev`); every example workflow JSON imports and executes.

### Step 8 — First release
1. Human checklist from §7/§8: branch protection (required checks, no required approvals, auto-merge on, no merge queue), Dependency graph + Dependabot alerts, Renovate app installed, npm trusted publisher confirmed (`release.yml`, publish allowed).
2. Merge to `main` → automated release (version > 0.0.1) → provenance + tripwire green.
3. Post-release: move `latest` off `0.0.0` (automatic), harden npm publishing access (2FA, tokens disallowed), verify install in a real n8n instance (`npm install n8n-nodes-openpgp` into `~/.n8n/nodes`, run an example workflow).
**Verify:** `npm view n8n-nodes-openpgp dist-tags version` shows the real version; attestation present: `npm view n8n-nodes-openpgp@<v> dist.attestations`; smoke-lane install path reproduced from the published tarball.

---

## 10. Definition of done

The build is done when, on `main`:
1. All four operations behave per §3 on the binary path with zero configuration and on the text path;
2. the unit layer covers the §3 matrix, with GnuPG interop fixtures proving cross-implementation behaviour;
3. CI's fast lane (22/24/26) + stable smoke lane are green and required; the v3 canary is present and non-blocking;
4. the first real version (> 0.0.1) is published to npm by CI with SLSA provenance, and the scan tripwire is clean;
5. Renovate is live with the §7.2 policy, and a package-bump PR merges hands-off;
6. README + examples land per [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10).

## 11. Out of scope (carried from the map)

- Key generation and key management (keys are assumed to exist elsewhere).
- Streaming large files — v1 is buffer-based (`getBinaryDataBuffer`); streaming may return as a fresh effort.
- AEAD config exposure (`openpgp.config.aeadProtect`) — breaks interop with other OpenPGP implementations.
- Browser/Deno support concerns — n8n runs on Node only.
- n8n **verification** (bundling, Creator Portal submission) — NO-GO per §6.

---

## Appendix A — Config file content (pinned policy; syntax verified at implementation time)

**`.github/workflows/release.yml`** — single workflow, `on: push: {branches: [main]}`; `permissions: {contents: write, id-token: write}`; `concurrency` on the ref, no cancel-in-progress for releases; steps: checkout (full history + tags: `fetch-depth: 0`) → setup-node 24 → `npm install -g npm@latest` → `npm ci` → `npm run build` → `npm test` → release-it `--ci` with `RELEASE_MODE=true` (bump/commit/tag/push/GitHub Release/OIDC publish) → `npx @n8n/scan-community-package n8n-nodes-openpgp@<published version>`.
**`.github/workflows/ci.yml`** — `on: pull_request` + `on: push: branches: [main]`; concurrency cancels superseded runs; `fast` matrix `node: ['22','24','26']` running commitlint (PR range only) → lint → build → test; `smoke-stable` on the pinned `n8nio/n8n:2.39.10` (§7.3 flow); `smoke-v3` on `n8nio/n8n:v3-nightly` with `continue-on-error: true`.
**`renovate.json`** — `extends`: `["config:recommended", ":semanticPrefixFixDepsChoreOthers", ":enableVulnerabilityAlerts", "security:minimumReleaseAgeNpm", ":automergeAll"]`; `rangeStrategy: "pin"`; `platformAutomerge: true`; packageRules: group non-major devDeps, `vulnerabilityAlerts` → `rangeStrategy: "pin"`, `matchDepNames: ["openpgp"]` + `matchUpdateTypes: ["major"]` → label, docker + github-actions updates → `commitMessagePrefix: "ci(deps):"`.
**`.release-it.json`** — `git: {requireCleanWorkingDir: false}`, `npm: {skipChecks: true}`, `github: {release: true}`, `plugins: {"@release-it/conventional-changelog": {preset: {name: "conventionalcommits", releaseRules: [{type: "chore", scope: "deps", release: "patch"}, {type: "ci", release: false}]}, infile: "CHANGELOG.md"}}`.
**`commitlint.config.js`** — `{extends: ['@commitlint/config-conventional']}`, with header-length relaxed if Renovate's generated messages exceed the default (verify with a real Renovate PR before enforcing).
**`vitest.config.ts`** — node environment, includes `test/**/*.test.ts`, excludes `test/smoke/**`.

## Appendix B — Test layer layout

```
test/
├── helpers/context.ts          # mocked IExecuteFunctions: params, input items, binary helpers, continueOnFail
├── openpgp.node.test.ts        # operation matrix per §3 (or split per operation)
├── interop.test.ts             # GnuPG fixture round-trips (§9 Step 5)
├── fixtures/
│   ├── keys/                   # armored public/private keypairs (RSA, curve25519; ± passphrase)
│   ├── messages/               # plaintext, binary blobs (incl. invalid-UTF-8)
│   ├── ciphertexts/            # gpg-produced: armored, binary, hidden-recipient, password mode
│   ├── signatures/             # gpg-produced: detached, cleartext, inline
│   ├── smoke/                  # credentials.json + workflow JSONs for `n8n import:*`
│   └── MANIFEST.md             # fingerprints, Key IDs, passphrases, gpg commands used
scripts/gen-interop-fixtures.sh # regenerates fixtures (gpg required)
```

## Appendix C — Decision provenance

| Spec section | Source ticket |
|---|---|
| §1, §7.5, §9 Step 0–1 | [#7](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/7) + scaffold facts + [#8](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/8) |
| §2, §3 | [#6](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/6), grounded in [#2](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/2)/[#3](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/3)/[#4](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/4) |
| §4 | [#3](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/3) |
| §5 | [#4](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/4) |
| §6 | [#5](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/5) |
| §7 | [#7](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/7) |
| §8 | [#8](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/8) |
| §11 | map [#1](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/1) Out of scope |
---

## 12. Implementation deltas (post-lock, 2026-09-22)

Everything above stays the record of the locked decisions. Building it against the pinned
toolchain (`@n8n/node-cli` 0.48.6, `@n8n/eslint-plugin-community-nodes` 0.32.1,
`eslint-plugin-n8n-nodes-base` 1.16.7, `@n8n/scan-community-package` 0.36.0) surfaced four
places where the letter of the spec could not be built green. Each has a ticket; each is
listed here with the mechanism that replaced it.

| Spec | Locked decision | What the build does instead | Ticket |
|---|---|---|---|
| §1, §6 | `dependencies: { openpgp: "6.3.1" }` | Unchanged: openpgp stays in `dependencies` (and in `devDependencies`, which is what makes the community import rule accept it). An `optionalDependencies` variant was tried and reverted — n8n's own installer strips `optionalDependencies` before `npm install`, so the package would install without its crypto library. | [#11](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/11) |
| §2 | Credential `openPgpPrivateKey`, display name "OpenPGP Private Key", class `OpenPgpPrivateKey` | `openPgpPrivateKeyApi`, "OpenPGP Private Key API", class `OpenPgpPrivateKeyApi`, file `credentials/OpenPgpPrivateKeyApi.credentials.ts`. The `-Api` suffix rules are error-level in the blocking lint lane and exempt only built-in credential names. | [#12](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/12) |
| §2 | "No `test` / `testRequest`" | The node implements a programmatic `methods.credentialTest.openPgpPrivateKeyTest` (parse the armored key, require a private key, unlock it with the Passphrase) and declares the credential with `testedBy`. `credential-test-required` is error-level without one, and n8n's credential tests are not HTTP-only — programmatic tests are a first-class mechanism. | [#12](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/12) |
| §7.3, §10.4 | Fast lane runs `npm run lint` (`n8n-node lint`); the scan tripwire is clean | The fast lane runs `npm run lint:ci` — the same ESLint run with `@n8n/community-nodes/no-runtime-dependencies` off. That rule forbids runtime dependencies outright (it is `error` in `recommended` *and* `recommendedWithoutCloudSupport`, so the CLI's `cloud-support disable` escape hatch does not clear it), and the scanner applies the same ruleset to `package.json` in both the attested source checkout and the published tarball. A package that ships a runtime dependency therefore cannot have a clean tripwire; the release workflow keeps the tripwire as `continue-on-error` monitoring so a *new* failure is still visible. `npm run lint` itself is unchanged and reports the one known error. | [#11](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/11) |

Implementation-level findings that do not change any decision, recorded so the next session
does not rediscover them:

- **`openpgp.readKeys` reads only the first armored block** (6.3.1). Multi-key blocks are
  split by the node before each block is read, which is what makes §3.2's "multi-key block →
  multiple recipients" work.
- **`openpgp.encrypt` has no `compression` option in v6**; the Compression option maps onto the
  per-call config's `preferredCompressionAlgorithm`, which password mode honours directly and
  key mode negotiates against recipient preferences — exactly as §3.2 describes the semantics.
- **Cleartext verification must use `format: 'utf8'`**: the library rejects binary output for
  cleartext messages. Every other call stays on `format: 'binary'` with the node's own UTF-8
  decoding, per §3.1.
- **`displayOptions` has no OR**: `show` is AND across keys. The Sign text field and the
  Verify message fields are therefore declared twice with mutually exclusive conditions
  (Cleartext vs. Source Data = Text; Detached vs. Embedded), which yields the locked UX
  without touching `displayOptions` semantics.
- **Icon**: a placeholder SVG lands at the spec-pinned path because the lint rules require the
  file to exist; the artwork is [#10](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10)'s
  to replace, and `icon-prefer-themed-variants` stays a warning until it does.
- **Binary input for the text parameters**: a text-format literal packet is written with
  `createMessage({ binary, format: 'text' })`, so the node neither canonicalises nor
  normalises line endings in either direction — the bytes a user encrypts are the bytes that
  come back.
- **Password-mode failures get their own copy**: §3.7's table has a row for a rejected
  private-key decryption but none for a wrong shared Password, so
  `Couldn't decrypt with this Password — check that it is the one the message was encrypted
  with.` joins the canonical set rather than leaking the library's
  `Session key decryption failed.` to the user.
- **`usableAsTool` stays `true`**: `.agents/nodes.md` suggests `false` for binary-heavy nodes,
  but n8n types the field as `true | UsableAsToolDescription`, so `false` does not compile and
  omitting it fails `@n8n/community-nodes/node-usable-as-tool`. Agents reach the text path by
  setting Source Data and Output As.
- **The credential's key gets its own copy**: §3.7's unparseable-key row names `Public Key(s)`, but
  the same failure on the credential's field must name that field instead, so
  `Private Key doesn't contain a readable OpenPGP key — paste the full armored block, including
  BEGIN/END lines.` is used when the credential's key block is unreadable or holds no private key.
