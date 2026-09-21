# Prior-art audit: n8n PGP / OpenPGP community nodes

Ticket: [#2](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/2) (part of [#1](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/1))
Audit date: 2026-09-21. All registry/repo figures are as of this date.

Research question: what do the incumbent n8n PGP community nodes do, where are their gaps, and what user pain is on record?

---

## 1. Headline findings

1. **The whole ecosystem is one abandoned codebase plus six forks.** `@hapheus/n8n-nodes-pgp` (first published 2024-03-31) is the ancestor of `@paywatchglobal`, `@xzcutable`, `@taxmanagementnz`, `@r4wd0g` and `@luka-cat-mimi`. `@azerax/n8n-nodes-pgp-encode-only` forks `@xzcutable`; `n8n-nodes-pgp-reintellex` and the stale `n8n-nodes-pgp@0.1.3` (bramkn) are a separate lineage. There are effectively **two independent implementations**, both stale or fork-fragmented.
2. **The upstream is dead but looks alive.** hapheus's last *code* commit is `1.5.0` on 2025-08-16; every one of the last 100 commits on `master` is a bot commit titled `Live Test Results <date>` (README churn). **All four issues that remain open (#9, #11, #13, #16) are unanswered by the maintainer**, the oldest since 2025-03-12 — including a data-corruption-class bug.
3. **`item.binary[x].data` is broken on modern n8n**, and the most-downloaded packages still do it. n8n 2.0 **removed the in-memory binary data mode**; binary data is now filesystem/database/S3-backed and must be read through `this.helpers.getBinaryDataBuffer()`. Three of the six hapheus-lineage packages (`@hapheus`, `@xzcutable`, `@r4wd0g`) — including the most-downloaded one — still read `item.binary[name].data` directly, producing truncated/garbage output. Upstream bug open since 2026-01-02.
4. **Nobody supports symmetric (passphrase/password) encryption, and nobody uses `expectSigned`.** Across all eight packages audited, `openpgp.encrypt({ passwords })`, `decrypt({ expectSigned })` and `verify({ expectSigned })` are never used. An unsigned or wrongly-signed message yields a silent `verified: false`, never an error.
5. **Most nodes clobber the input item.** In binary mode every hapheus-lineage node sets `item.json = {}`; in text mode it sets `item.binary = {}`. Payload fields and unrelated binary properties are destroyed by the crypto step.
6. **`openpgp` v6 is already shipped by one incumbent** (`@luka-cat-mimi`, `openpgp ^6.3.1`) — so "v6" alone is not a differentiator. What nobody does is handle v6 *interop* (RFC 9580 keys, legacy v5 entity parsing, AEAD-encrypted v4 private keys, keys without key flags).
7. **The real competition may not be a PGP node at all.** `n8n-nodes-gpg` (a bramkn-lineage fork with an insecure-decryption workaround) has **248 downloads/month — more than any package except hapheus** — despite last publishing 2024-05-08 and shipping a typo'd dependency (`steam`). Users are choosing "works" over "maintained".
8. **Distribution, not features, is the gating risk.** From n8n 3.0 (scheduled October 2026) `N8N_UNVERIFIED_PACKAGES_ENABLED` defaults to **false**, i.e. unverified community nodes stop installing unless an operator opts in. Verified status requires **zero run-time dependencies** and that the node "MUST not be an existing node" — both of which collide head-on with "an OpenPGP node built on the `openpgp` npm package".

---

## 2. Method

Sources used, all primary:

- npm registry API — `https://registry.npmjs.org/<pkg>` (versions, dates, dependencies, `package.json` `n8n` block, README, `dist.attestations`) and `https://api.npmjs.org/downloads/point/{last-week,last-month}/<pkg>`.
- npm search — `https://registry.npmjs.org/-/v1/search?text=...` and `keywords:n8n-community-node-package pgp`.
- GitHub — `gh api` / `gh issue list` / `gh pr list` on every repository, plus raw source reads of the node, credentials and `operations.ts` of each package. Published tarballs were downloaded from npm and inspected where the repository could not be trusted (e.g. `@taxmanagementnz`, whose source repository is not public).
- n8n community forum Discourse search API — `https://community.n8n.io/search.json?q=...`.
- n8n documentation — `docs.n8n.io` markdown pages, the n8n and openpgpjs GitHub sources.
- openpgpjs — source of `src/openpgp.js` on `main` and the v6.0.0 release notes.

Limits of this audit are listed in §10.

---

## 3. Family tree

```
hapheus/n8n-nodes-pgp  (@hapheus/n8n-nodes-pgp, v1.5.0, 2025-08-16)   <- origin, abandoned
├── paywatchglobal/n8n-nodes-pgp   (@paywatchglobal, v1.8.0, 2026-03-12)  fixes binary helpers      [GitHub fork]
├── XZcutable/n8n-nodes-pgp        (@xzcutable,      v2.1.0, 2025-08-19)  + key generation, remote keys [GitHub fork]
│   └── Azerax/n8n-nodes-pgp-encode-only (@azerax,   v1.0.5, 2026-05-01)  encrypt-only, passthrough  [GitHub fork]
├── TaxManagementNewZealand (no public repo) (@taxmanagementnz, v1.1.0, 2026-02-04)  binary streams, weak-key config
├── R4wd0g/n8n-nodes-pgp           (@r4wd0g,         v1.6.0, 2026-04-22)  + cleartext signatures      [GitHub fork]
└── luka-n8n-nodes/n8n-nodes-pgp   (@luka-cat-mimi,  v1.3.14, 2026-08-11)  + openpgp v6, CI, releases  [re-publish, not a fork]

bramkn/n8n-nodes-pgp (n8n-nodes-pgp@0.1.3, 2023-10-14)  <- independent, dead
├── onlypfachi/n8n-nodes-gpg        (n8n-nodes-gpg@0.2.1, 2024-05-08)  allowInsecureDecryptionWithSigningKeys  [rewrite]
└── rumbra/n8n-nodes-pgp-reintellex (n8n-nodes-pgp-reintellex@1.0.3, 2026-06-02)  binary/.asc fixes  [GitHub fork]
```

Fork evidence: `gh api repos/<repo>` reports `"fork": true` with parent `hapheus/n8n-nodes-pgp` for paywatchglobal, XZcutable and R4wd0g; `Azerax/…-encode-only` is a fork of `XZcutable/n8n-nodes-pgp`; `rumbra/…-reintellex` is a fork of `bramkn/n8n-nodes-pgp`. Independently, the file trees are identical across the hapheus-derived packages (`nodes/PgpNode/PgpNode.node.ts`, `nodes/PgpNode/utils/{BinaryUtils,DataCompressor}.ts`, `credentials/PgpCredentialsApi.credentials.ts`), paywatch's history contains `Merge branch 'hapheus:master' into master` (2026-02-06), and XZcutable's README states it was "branched from [hapheus]".

Two lineage quirks worth recording:

- **`@luka-cat-mimi` is a re-publish, not a fork.** `gh api repos/luka-n8n-nodes/n8n-nodes-pgp` reports `"fork": false` (repo created 2025-12-03), yet its git tags include hapheus's `v1.0.2 · v1.1.0 · v1.1.1 · v1.2.0 · v1.3.0 · v1.4.0 · v1.5.0` pointing at hapheus's 2025-08-16 commits, and the npm `author` field is still `Franz Haberfellner <haf68k@gmail.com>` — hapheus's author — while npm maintainers are `domi-lucky` and `luka-cat`. A third party is publishing the original author's code under a different scope.
- **`@taxmanagementnz` has no public repository at all** — its npm `repository` field points at the org root `https://github.com/TaxManagementNewZealand`, which publishes three unrelated nodes and nothing matching this one.

---

## 4. Comparison table

### 4.1 Identity, traction and health

| Package | Latest | Published | Downloads/mo (wk) | GitHub repo | Stars | Issues | CI | npm provenance |
|---|---|---|---|---|---|---|---|---|
| `@hapheus/n8n-nodes-pgp` | 1.5.0 | 2025-08-16 | **386** (99) | [hapheus/n8n-nodes-pgp](https://github.com/hapheus/n8n-nodes-pgp) | 7 | 4 open / 9 closed | none | no |
| `n8n-nodes-gpg` (onlypfachi) | 0.2.1 | 2024-05-08 | **248** (62) | [onlypfachi/n8n-nodes-gpg](https://github.com/onlypfachi/n8n-nodes-gpg) | – | 0 | none | no |
| `n8n-nodes-pgp` (bramkn) | 0.1.3 | 2023-10-14 | 108 (15) | [bramkn/n8n-nodes-pgp](https://github.com/bramkn/n8n-nodes-pgp) | 10 | 1 closed | none | no |
| `@luka-cat-mimi/n8n-nodes-pgp` | 1.3.14 | 2026-08-11 | 105 (41) | [luka-n8n-nodes/n8n-nodes-pgp](https://github.com/luka-n8n-nodes/n8n-nodes-pgp) | 0 | 0 | `ci.yml`, `publish.yml` | **yes** |
| `@taxmanagementnz/n8n-nodes-pgp` | 1.1.0 | 2026-02-04 | 53 (4) | none public | – | – | none | no |
| `@azerax/n8n-nodes-pgp-encode-only` | 1.0.5 | 2026-05-01 | 52 (17) | [Azerax/…-encode-only](https://github.com/Azerax/n8n-nodes-pgp-encode-only) | – | – | none | no |
| `@paywatchglobal/n8n-nodes-pgp` | 1.8.0 | 2026-03-12 | 50 (7) | [paywatchglobal/n8n-nodes-pgp](https://github.com/paywatchglobal/n8n-nodes-pgp) | 0 | issues disabled | `release.yml` | **yes** |
| `@xzcutable/n8n-nodes-pgp` | 2.1.0 | 2025-08-19 | 31 (3) | [XZcutable/n8n-nodes-pgp](https://github.com/XZcutable/n8n-nodes-pgp) | 0 | 0 | none | no |
| `n8n-nodes-pgp-reintellex` | 1.0.3 | 2026-06-02 | 31 (6) | [rumbra/…-reintellex](https://github.com/rumbra/n8n-nodes-pgp-reintellex) | – | – | none | no |
| `@r4wd0g/n8n-nodes-pgp` | 1.6.0 | 2026-04-22 | 22 (1) | [R4wd0g/n8n-nodes-pgp](https://github.com/R4wd0g/n8n-nodes-pgp) | 0 | issues disabled | none | no |

Provenance check (`dist.attestations` in the registry document, verified 2026-09-21): only `@paywatchglobal` and `@luka-cat-mimi` publish with an npm provenance attestation. Rate the rest as non-compliant with the publish requirement that n8n applies from 2026-05-01 ([docs](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md)).

### 4.2 Capability matrix

Legend: ✅ verified by reading the implementation · `✅*` asserted only by the package's own description/README (source not read) · `?*` unknown, source not read · ❌ absent · `–` not applicable.

| | hapheus | paywatch | xzcutable | taxmgmtnz | r4wd0g | luka-cat-mimi | bramkn 0.1.3 | n8n-nodes-gpg | azerax¹ | reintellex | n8n built-in Crypto |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `openpgp` dependency | ^5.11.3 | ^5.11.3 | ^5.11.2 | ^5.11.3 | ^5.11.3 | **^6.3.1** | ^5.9.0 | ^5.11.0 | ^5.11.2 | ^5.9.0 | none (node `crypto`) |
| Encrypt | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | ✅ | ✅ (not OpenPGP) |
| Decrypt | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ❌ | ✅ | ✅ (not OpenPGP) |
| Sign | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅* | ❌ | ❌ | ✅ (raw, not PGP) |
| Verify | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅* | ❌ | ❌ | ❌ |
| Encrypt-and-sign in one pass | ✅ | ✅ | ✅ (implicit) | ✅ | ✅ | ✅ | ❌ | ?* | ❌ | ❌ | ❌ |
| Decrypt-and-verify in one pass | ✅ | ✅ | ✅ (implicit) | ✅ | ✅ | ✅ | ❌ | ?* | – | ❌ | ❌ |
| Embedded (integral) signature option | ✅ | ✅ | ✅ (always) | ✅ | ✅ | ✅ | ❌ | ?* | ❌ | ❌ | ❌ |
| Detached signature | ✅ | ✅ | ✅ (opt.) | ✅ | ✅ | ✅ | ❌ | ?* | ❌ | ❌ | ❌ |
| Cleartext signed message | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ?* | ❌ | ❌ | ❌ |
| Key generation | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ?* | ❌ | ❌ | ❌ |
| Symmetric / **password mode** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (non-PGP) |
| **`expectSigned`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Detached-sig input on decrypt | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ?* | – | ❌ | ❌ |
| Binary input | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | ✅ | ❌ |
| Binary **output** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ | ✅ | ❌ |
| Reads binary via n8n helpers (n8n ≥2 safe) | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ?* | ❌ | ✅ | – |
| Preserves input JSON/binary | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | file mode ✅ | ?* | ✅ | file mode ✅ | ✅ |
| Partial credentials (only the key you need) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (single key) | ?* | ✅ (single key) | ✅ (single key) | – |
| Remote key fetch by URL | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ?* | ✅ (public) | ❌ | ❌ |
| Weak/legacy key acceptance | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅* | ❌ | ❌ | – |

¹ `@azerax/n8n-nodes-pgp-encode-only` is deliberately encrypt-only (public key, no private key, no passphrase) — verified in its published `dist/`.

"Preserves input" = the operation does not overwrite the input item's unrelated `json` fields or `binary` properties. Verified by reading each node's `execute()` (hapheus, paywatch, xzcutable, r4wd0g, luka, bramkn, azerax, reintellex from source; taxmgmtnz and azerax cross-checked against the published tarball).

Note the two structural facts this table exposes: **every hapheus-lineage package except `@azerax` destroys part of the input item** (the bramkn lineage preserves the item in file mode), and **only `@paywatchglobal`, `@xzcutable` and the two single-key designs load just the key an operation actually needs** — hapheus, `@r4wd0g`, `@taxmanagementnz` and even the newest fork `@luka-cat-mimi` validate both keys on every run.

### 4.3 Credential design

| Package | Credential type (display name) | Fields | Masking |
|---|---|---|---|
| hapheus, paywatch, r4wd0g, taxmgmtnz, luka-cat-mimi | `pgpCredentialsApi` ("PGP API") | passphrase, armored public key, armored private key | passphrase masked; keys plaintext textareas — hapheus carries `// eslint-disable-next-line n8n-nodes-base/cred-class-field-type-options-password-missing` on both key fields |
| xzcutable | `pgpCredentialsApi` ("PGP API") | passphrase, key method (manual \| server), public key, public-key URL, private key, private-key URL | all key fields `password: true` |
| azerax | `pgpCredentialsApi` ("PGP Encrypt Only API") | key method (manual \| server), public key, public-key URL | public key `password: true` |
| bramkn, reintellex | `pgpKey` ("PGP Key API") | **type (public \| private)**, key, passphrase (passphrase only shown when type = private) | key is `password: false` (explicitly plaintext); passphrase masked |
| n8n-nodes-gpg | `GpgKeyApi` | not read | unknown |

Two credential philosophies are on display. The hapheus lineage puts *both* keys plus a passphrase in one credential — flexible across parties, but every node then has to decide which key is relevant, and most decide wrongly (all keys validated, always). bramkn's `pgpKey` inverts it: one credential holds one key with an explicit public/private switch, which makes the required key obvious and makes encrypt-only and decrypt-only credentials natural, at the cost of needing two credentials for a two-direction workflow.

None of the packages validates a key inside the credential itself; every failure surfaces only at execution time in the node (`NodeOperationError('public key is not valid')`). The hapheus maintainer states the reason in issue #10 (2025-03-26): "Unfortunately, there isn't a way to check this in the credentials yet."

---

## 5. Per-package notes

### 5.1 `@hapheus/n8n-nodes-pgp` v1.5.0 — the origin, abandoned

- Six operations: encrypt, decrypt, sign, verify, encrypt-and-sign, decrypt-and-verify; `inputType` text|binary; optional compression (zip/zlib via `fflate`) before encryption; embedded-signature booleans added in 1.5.0 (PR #15, 2025-08-14).
- Node-level credential requirement is `required: true`, and `execute()` loads **both** the private and public key before the item loop. Encrypting with only a recipient public key therefore throws `private key is not valid`. The maintainer acknowledged this in issue #12 (2025-06-23): "The current system checks both keys when the node runs."
- Binary input is read as `BinaryUtils.base64ToUint8Array(item.binary[name].data)` — inline base64 only.
- No `.github/workflows`; publishing is a local `scripts/bump-and-publish.sh`; no GitHub releases (`gh api repos/hapheus/n8n-nodes-pgp/releases` is empty); no npm provenance.
- Activity: last functional commit `1.5.0` (2025-08-16); the 100 most recent commits are all `Live Test Results <date>` README commits (2026-05-03 → 2026-08-11), which is why the repo still shows `pushed_at: 2026-08-11` and looks maintained.

### 5.2 `@paywatchglobal/n8n-nodes-pgp` v1.8.0 — the maintenance fork

- Same six operations, but the binary path was rewritten to `this.helpers.getBinaryDataBuffer(...)` and `this.helpers.prepareBinaryData(...)`; commit `fix: use n8n binary helpers API for compatibility with n8n 2.12 filesystem-backed binary storage` (2026-03-12).
- Loads keys **per operation** via `getRequiredKeys(operation)`, so public-key-only encryption and private-key-only decryption work.
- Still destroys the input item (`item.json = {}` in binary mode, `item.binary = {}` in text mode).
- Has `release.yml` and npm provenance; issues are disabled on the repo (no user feedback channel).

### 5.3 `@xzcutable/n8n-nodes-pgp` v2.1.0 — most opinionated UX, least maintained

- Reduced to encrypt / decrypt / **create** (key generation with RSA or curve25519, expiration, passphrase, armored or binary output). Encrypt-and-sign is implicit; the standalone sign/verify operations were deliberately removed (README "Changes").
- Credentials gained a `keyMethod` of `manual` or `server`, i.e. keys fetched from a URL at runtime, and all key fields are `password: true` — the only package that addressed issue #11 (credential masking). Upstream rejected the equivalent PR (#14 was closed 2025-08-12), which is why the fork exists.
- Still on `item.binary[name].data`; still clobbers the item.
- Repo idle since 2025-08-23, no CI, no provenance, 31 downloads/month.

### 5.4 `@taxmanagementnz/n8n-nodes-pgp` v1.1.0 — hard fork with real fixes, unpublished source

- Registry `repository` points at the bare org `https://github.com/TaxManagementNewZealand`; the org has three public repos, none of them this node. Findings here come from the **published tarball** (`dist/nodes/PgpNode/PgpNode.node.js`), which is a divergent hapheus fork:
  - binary reads through `this.helpers.getBinaryStream(binaryData.id)` with `Buffer.from(binaryData.data, BINARY_ENCODING)` fallback — this is the correct n8n ≥2 pattern;
  - encryption with `config: { rejectPublicKeyAlgorithms: new Set(), minRSABits: 0 }`, i.e. it deliberately accepts legacy/weak keys;
  - error messages from `operations` are surfaced instead of being replaced by a generic string (`isErrorResult` helper);
  - output mimeType `text/plain`, output extension `.gpg`.
- Like hapheus it validates both keys up front, and it still wipes `item.json`/`item.binary`.
- No public issue tracker, no CI, no provenance — historically the least inspectable of the forks.

### 5.5 `@r4wd0g/n8n-nodes-pgp` v1.6.0 — cleartext signatures

- hapheus fork that added **cleartext signed messages** (`-----BEGIN PGP SIGNED MESSAGE-----`) alongside detached signatures for text input, and a `verifiedData` output so callers verify against the canonical text rather than raw input. Newest functional addition in the family after luka's compression work.
- Otherwise unchanged: `item.binary[name].data`, both keys mandatory, no CI/provenance, 22 downloads/month, issues disabled.

### 5.6 `@luka-cat-mimi/n8n-nodes-pgp` v1.3.14 — the closest competitor

- **The only package on `openpgp ^6.3.1`.** Also the only one with compression done *inside* the PGP message (`config.preferredCompressionAlgorithm`) with a backwards-compatible `applyPrecompression` toggle — contributed via PR #2 by an outside contributor (2026-01-12).
- Binary access through `nodes/help/utils/NodeUtils.ts` → `helpers.getBinaryDataBuffer`, and separate handling for signature reads.
- Two GitHub Actions workflows (`ci.yml`, `publish.yml`), `release-it`, npm provenance, CHANGELOG, `README_ZH.md`, a 98.93 %-coverage claim, and the cleanest packaging in the ecosystem: runtime dependencies are just `fflate` and `openpgp`, with `n8n-workflow` correctly declared as a peer dependency and the rest as devDependencies.
- Two caveats:
  - `"n8n": { ..., "strict": false }` — strict mode is what the `n8n-node` CLI calls "enforce … community node rules required for n8n Cloud verification" ([CLI README](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/node-cli/README.md)); disabling it forfeits verification eligibility.
  - Its README states "All credential fields are optional", but `execute()` calls `loadPrivateKey()` and `loadPublicKey()` unconditionally before the loop, and both throw when their key is empty. The documented behaviour is not the implemented behaviour.
- Tags and npm have drifted: git tags include `v1.4.0` and `v1.5.0` (both inherited from the hapheus fork, pointing at the 2025-08-16 `1.5.0` commit) while npm's `latest` is `1.3.14`; npm versions skip `1.3.4`/`1.3.5`.

### 5.7 `n8n-nodes-pgp@0.1.3` (bramkn) — stale but not broken

- Two operations only (encrypt, decrypt), `type` string|file, a single `pgpKey` credential (`key` + `passphrase`), and an **optional output binary property** (`outputBinaryPropertyName`, default `encrypted`) instead of overwriting the input property.
- Correctly handles both binary modes (`binaryData.id` → `getBinaryStream`, else `Buffer.from(binaryData.data, BINARY_ENCODING)`), and in file mode returns `items[i]` so the rest of the item survives.
- Dead since 2023-10-14, `openpgp ^5.9.0` shipped as a **runtime** dependency alongside `eslint ^8.40.0`, no peer dependency on `n8n-workflow`, no CI, no provenance. Still 108 downloads/month.
- Its author is an n8n "expert partner" and the node is the one n8n staff recommend on the forum ("The PGP node is not one we officially support … although I do use it", [topic 31628](https://community.n8n.io/t/pgp-node-returning-no-output/31628)).

---

## 6. User pain — evidence on record

### 6.1 GitHub issues (hapheus primarily)

| Issue | State | Opened | Pain |
|---|---|---|---|
| [#16 Binary PGP Encrypt Not Handling Data Properly](https://github.com/hapheus/n8n-nodes-pgp/issues/16) | **open**, 1 comment, no maintainer reply | 2026-01-02 | Reporter measures "Decrypted as binary - 6 B (u´Zm´^^)" for a 705 B payload, and diagnoses it precisely: `BinaryUtils.base64ToUint8Array(item.binary[binaryPropertyName].data)` "doesn't work in N8N 2.0". Six weeks later a second user asks "Has this been resolved?" — still open. |
| [#13 Encrypt and Sign/Decrypt and Verify should be done in a single step](https://github.com/hapheus/n8n-nodes-pgp/issues/13) | **open** | 2025-07-02 | "the recipient expects the signature to be embedded in the file when encrypted & signed". 1.5.0 added the option, then two independent users report `NodeOperationError: Message could not be decrypted` on real vendor files, and one names the workaround: "the dumber way of decrypting/verify as a file running linux cmd". Still open. |
| [#11 Support Credential Masking](https://github.com/hapheus/n8n-nodes-pgp/issues/11) | **open**, no reply | 2025-04-10 | "the pgp public / private keys are visible in cleartext in n8n. Would it be possible to use masking like for other pass phrases and secrets?" Also reports Azure Key Vault issues suspected to be caused by line breaks in keys. |
| [#9 Unable to decrypt file](https://github.com/hapheus/n8n-nodes-pgp/issues/9) | **open** | 2025-03-12 | Cannot decrypt a `-----BEGIN PGP MESSAGE-----\nVersion: BouncyCastle.NET …` file while Kleopatra can; resolution was to **switch to a different node**: "I was able to find a resolution via using https://www.npmjs.com/package/n8n-nodes-gpg". The maintainer's own reply confirms the cause: "Currently, the Decrypt Node only supports armored messages". |
| [#12 Problem in node 'PGP' - public key is not valid ?!?](https://github.com/hapheus/n8n-nodes-pgp/issues/12) | closed | 2025-06-22 | Multi-key `.asc` confusion, plus the maintainer's admission that the node checks both keys on every run and a user replying "that would be more in-line with what is expected". |
| [#10 Nodes incorrectly reports "success" but stops workflow when encryption keys are invalid](https://github.com/hapheus/n8n-nodes-pgp/issues/10) | closed | 2025-03-26 | "The node will then report that it has executed successfully but no following nodes will be executed" — silent failure. |
| [#3 Binary Mode & Compression in single pass](https://github.com/hapheus/n8n-nodes-pgp/issues/3) | closed | 2024-11-23 | Featured user request that produced most of the current feature set; also the thread where the maintainer says "n8n doesn't currently support" per-key credential types. |
| [#1 Encrypt and sign one pass](https://github.com/hapheus/n8n-nodes-pgp/issues/1) | closed | 2024-10-09 | The original encrypt+sign request; the thread documents the confused public/private-key credential model ("I honestly never considered mixing private and public keys from different accounts in the credentials"). |

Structural signal: **the same small set of users (erictmnz, Keglerz, SamyDjemal, CameronSelly) filed most issues, and the fork authors are the same people** — XZcutable opened PR #14, CameronSelly opened PRs #1/#2 on luka. This is an ecosystem where users self-serve by forking.

### 6.2 n8n community forum

| Topic | Created | Signal |
|---|---|---|
| [PGP Encrypt/Decrypt Binary](https://community.n8n.io/t/pgp-encrypt-decrypt-binary/7837) | 2021-09-13 | "PGP key encrypting/decrypting of binary files would be very helpful - it could be incorporated in the existing Crypto Module or as a separate node. **For local implementations this can be handled via scripts, but for the n8n.cloud there is not a good workaround I can find.**" Followed by "need it too" (2022-05-12) and "Needed here also" (**2025-02-26**) — a four-year-old, still-unmet request, 1,205 views. |
| [PGP decryption not working](https://community.n8n.io/t/pgp-decryption-not-working/215957) | 2025-11-03 | User on `@xzcutable/n8n-nodes-pgp` fails to decrypt a `Version: BCPG v1.58` message. The answering user switched to `@luka-cat-mimi` and reports "**it did not work out of the box. What I had to do:** Remove the 'Version: XXXX' from the headers of the Public and private keys. Paste the keys in the credential on Expression and full window mode to see additional whitespaces above and below the ----BEGIN and -----END lines." → key/armor normalization is a real, unmet requirement. |
| [PGP decryption](https://community.n8n.io/t/pgp-decryption/13942) | 2022-05-13 | 1,077 views. "i receive FTP files encrypted with PGP. I saw encrypt/decrypt node in n8n but **it doesn't support PGP**" — the built-in node gap, plus the standard advice to use `getBinaryDataBuffer` for binary input. |
| [I am listing encrypted files from FTP node and decrypt it with pgp node …](https://community.n8n.io/t/i-am-listing-encrypted-files-from-ftp-node-and-decrypt-it-with-pgp-node-but-i-keep-getting-this-error/31503) | 2023-10-12 | "Problem in node 'PGP' No binary data exists on item!" — the poster is the author of `n8n-nodes-gpg`, who then forked bramkn's node because of a decryption bug. |
| [PGP node returning no output](https://community.n8n.io/t/pgp-node-returning-no-output/31628) | 2023-10-16 | "No output data returned"; n8n staff: "The PGP node is not one we officially support … although I do use it"; further error "Error during parsing. This message / key probably does not conform to a valid OpenPGP format." |

Searches for `detached signature`, `openpgp`, `gpg node`, `pgp key` returned no additional PGP-node-specific threads. Volume is low but consistent and long-lived: roughly one substantive PGP thread a year since 2021, each with the same three asks — **binary files, a node that actually works, and keys that are painful to paste**.

npm has no review mechanism, so "npm reviews" cannot be a pain source; the only keyword-level signal is that every fork copies the same keyword list (`n8n-community-node-package`, `pgp`, `pretty-good-privacy`, …) for discoverability, and the two packages *outside* the hapheus lineage (`n8n-nodes-gpg`, `n8n-nodes-pgp`) still out-download most of the maintained forks.

### 6.3 What users actually wanted (condensed)

1. Encrypt/decrypt **files** (binary) correctly — the single most repeated ask, 2021 → 2025.
2. Encrypt+sign and decrypt+verify **in one pass**, with the signature **inside** the message, interoperable with `gpg -se`.
3. Decrypt **non-armored/third-party** messages (BouncyCastle, `Version:` headers, ASCII-armored `.asc`, binary messages).
4. Keys that are not painful to paste (masking, whitespace tolerance, remote/keyvault retrieval).
5. **Honest errors** — fail loudly on an invalid key instead of reporting success or returning `verified: false`.
6. Not lose the rest of the item while doing the above.

---

## 7. Platform constraints the design must respect

These are the rules that decide whether a new node can actually be adopted.

1. **In-memory binary data mode was removed in n8n 2.0.** "n8n will remove the `default` mode for `N8N_DEFAULT_BINARY_DATA_MODE` … `filesystem`: Binary data is stored in the filesystem. Default option in regular mode. `database`: … Default option in queue mode." → [v2.0 breaking changes](https://docs.n8n.io/changelog/v20-breaking-changes.md). In-memory storage is fully removed in 3.0 ("`N8N_DEFAULT_BINARY_DATA_MODE=default` is no longer valid"), and the storage directory is renamed `~/.n8n/binaryData` → `~/.n8n/storage` ([v3.0 breaking changes](https://docs.n8n.io/changelog/v30-breaking-changes.md)).
2. **Always read binary via helpers.** "You should always use the `getBinaryDataBuffer()` function, and avoid using older methods of directly accessing the buffer, such as targeting it with expressions like `items[0].binary.data.data`." → [Get the binary data buffer](https://docs.n8n.io/build/code-in-n8n/cookbook/code-node/get-the-binary-data-buffer.md).
3. **Unverified community packages will stop installing by default in n8n 3.0** (scheduled October 2026): "The default for `N8N_UNVERIFIED_PACKAGES_ENABLED` changes from `true` to `false`." The current default is `true` ([`community-packages.config.ts`](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/modules/community-packages/community-packages.config.ts)).
4. **Verified status is hard for this node to obtain.** The guidelines require "the node **MUST** not be an existing node, If your node is an iteration on an existing node create a pull request instead", "**no external dependencies** … Ensure that your package does **not** include any external dependencies", and "verified community nodes aren't allowed to use any run-time dependencies". An OpenPGP node needs `openpgp` (or a bundled equivalent). → [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md), [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md).
5. **Provenance-based publishing is mandatory since 2026-05-01** for verification: GitHub Actions + npm provenance statement, `@n8n/node-cli ≥ 0.23.0`. The canonical workflow is [`n8n-nodes-starter/.github/workflows/publish.yml`](https://github.com/n8n-io/n8n-nodes-starter/blob/master/.github/workflows/publish.yml); the scaffold sets `"n8n": { "n8nNodesApiVersion": 1, "strict": true, … }` ([starter package.json](https://github.com/n8n-io/n8n-nodes-starter/blob/master/package.json)). Only 2 of 10 incumbents satisfy this.
6. **openpgp v6 removed/changed things that matter for interop** ([v6.0.0 release notes](https://github.com/openpgpjs/openpgpjs/releases/tag/v6.0.0)): RFC 9580 support; Node ≥ 18; native Node `Readable` streams dropped in favour of Web Streams; `config.enableParsingV5Entities` is now required to parse v5 keys/signatures; AEAD-encrypted v4 private keys from v5 need `config.parseAEADEncryptedV4KeysAsLegacy`; keys without key flags are refused unless `config.allowMissingKeyFlags`; `PrivateKey.getDecryptionKeys` now throws when no decryption key is found. **Any node migrating from v5 to v6 without handling these will regress on legacy keys.** Latest `openpgp` on npm is 6.3.1 (published 2026-06-04).
7. **The built-in Crypto node is not a substitute**: it offers symmetric passphrase or RSA-asymmetric encrypt/decrypt of *strings* (base64 in/out), hashing, HMAC and raw signing — no OpenPGP/RFC 9580 messages, no keyrings, no PGP armor, and its RSA mode "can only encrypt small payloads, around 190 bytes with a 2048-bit key" → [Crypto node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.crypto.md).

---

## 8. Differentiation opportunities for `n8n-nodes-openpgp`

Ranked by the strength of the evidence behind them. "Nobody does this" claims were checked against all eight packages plus the built-in Crypto node.

### Tier 1 — bugs and gaps that are proven and unserved

1. **Binary in/out that survives modern n8n.** Use `helpers.getBinaryDataBuffer()` / `helpers.getBinaryStream()` for every read and `helpers.prepareBinaryData()` for every write, on both the message and the signature property, and prove it with a filesystem-mode test. Evidence: hapheus #16 (open), four packages still reading `.data` raw (`@hapheus`, `@xzcutable`, `@r4wd0g`, `@azerax`), n8n 2.0/3.0 binary changes. This is table stakes, but it is also the most-downloaded package's live bug.
2. **Never clobber the input item.** Spread `...item.json` and `...item.binary`, write results to configurable output properties, and keep `pairedItem` intact. Evidence: six of the nine packages whose code was read wipe half the item; only `@azerax` (spread) and the bramkn lineage (write to a separate property, preserving the item in file mode) do otherwise.
3. **Fail loudly, and make verification meaningful.** Offer `expectSigned` on decrypt/verify (default on for `decrypt-and-verify`) so an unsigned or mismatched message is an error, not `verified: false`; surface openpgp's real error text instead of a generic "Message could not be decrypted". Evidence: `expectSigned` is used by nobody; hapheus #13 (users stuck on an opaque decrypt error), #10 (silent success).
4. **Partial credentials: load only the key the operation needs.** Public-key-only encryption and private-key-only decryption, with an error naming the missing key. Evidence: hapheus #12 (maintainer admitted the node checks both keys), and luka's README-vs-code divergence shows this is still unsolved in the newest fork.
5. **Key-input hardening.** Tolerate leading/trailing whitespace, stray `Version:` headers, multi-key blocks (take the first parsable key), CRLF, and unarmored/binary keys; support key material from an expression without manual cleanup. Also mask key fields in credentials. Evidence: forum 215957 (the exact manual workaround users were told to perform), hapheus #11 (masking, whitespace from key vaults), #12 (multi-key `.asc`).
6. **Decrypt messages the ecosystem rejects**: non-armored/binary PGP messages, `Version:`-header armor from BouncyCastle/other toolchains, ASCII-armored `.asc` inputs, and legacy/weak keys via explicit v6 config flags (`allowMissingKeyFlags`, `enableParsingV5Entities`, `parseAEADEncryptedV4KeysAsLegacy`, relaxed `minRSABits`/`rejectPublicKeyAlgorithms`) exposed as documented opt-ins rather than a hidden fork hack. Evidence: hapheus #9 (user defected to `n8n-nodes-gpg` for exactly this), forum 215957, taxmgmtnz's unpublished `minRSABits: 0` workaround, openpgp v6 config changes.

### Tier 2 — features nobody offers

7. **Symmetric / password mode** (`openpgp.encrypt({ passwords })` / `decrypt({ passwords })`): encrypt to a shared secret with no keypair, interoperable with `gpg -c`. Zero of eight packages offer it; the built-in Crypto node's passphrase mode is not OpenPGP.
8. **Key management as first-class operations**: generate, inspect (fingerprint, user IDs, algorithm, expiry, revocation), re-armor/convert, change passphrase, split/merge. Only `@xzcutable` has generation at all, and it is on the abandoned branch. Public key *inspection* (so a workflow can validate a vendor key or detect expiry) is offered by nobody.
9. **Signature UX as a deliberate design**: a single `Sign` operation with an explicit output choice (detached armor / cleartext `-----BEGIN PGP SIGNED MESSAGE-----` / integral), a matching `Verify` that accepts any of them, and a `verifiedData` output that returns the canonical verified text. `@r4wd0g` has cleartext; everyone else forces you to know which of the two or three "sign" paths to pick, and `decrypt-and-verify` requires pre-declaring whether the signature is embedded.
10. **Streaming for large files** so encryption does not buffer the whole payload in memory. Every incumbent reads the entire file into a Buffer/Uint8Array; n8n's own docs treat large-file handling as a scaling concern ([Handle binary data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/handle-binary-data.md)).
11. **No hand-rolled pre-compression.** hapheus's lineage compresses with `fflate` *before* OpenPGP and then requires the caller to select the matching decompression algorithm on the way back — a non-interoperable, error-prone arrangement that `@luka-cat-mimi` partially deprecated. Prefer PGP-native compression (`config.preferredCompressionAlgorithm`) with transparent decompression on decrypt (openpgp decompresses automatically).

### Tier 3 — engineering and trust

12. **Honest, current dependencies and published proof**: `openpgp` v6.x as the single runtime dependency (declared in `dependencies`, not smuggled in via tooling), `n8n-workflow` as a peer dependency, MIT, README with per-operation examples, and CI that runs lint + unit + a real n8n binary-mode smoke test on every PR. Evidence: hapheus ships `openpgp ^5.11.3` with no CI; bramkn's 2023 package and reintellex's 2026 fork both declare `eslint ^8.40.0` as a **runtime** dependency and omit the `n8n-workflow` peer dependency.
13. **GitHub Actions publish with npm provenance** (Trusted Publisher/OIDC) — mandatory for verification since 2026-05-01, satisfied by only 2 of 10 packages.
14. **A real feedback channel**: issues enabled, a support statement, and a changelog. `@paywatchglobal` and `@r4wd0g` disabled issues; `@taxmanagementnz` has no public repo at all; hapheus leaves bugs unanswered for 9+ months.

---

## 9. What is **not** a differentiator (honest list)

- **"openpgp v6" by itself.** `@luka-cat-mimi` already ships `openpgp ^6.3.1` with CI and provenance. The defensible claim is v6 *interop handling* (§8.6), not the version number.
- **Detached signatures.** hapheus, paywatch, r4wd0g, luka and xzcutable all produce detached signatures today; r4wd0g also does cleartext.
- **Binary property support per se.** paywatch, luka, taxmgmtnz, bramkn, `n8n-nodes-gpg` and reintellex already use the n8n helpers. The differentiator is doing it for *both* message and signature, in *both* directions, without destroying the item — and doing it under test.
- **Encrypt-and-sign / decrypt-and-verify in one pass.** Offered by six packages since hapheus 1.2/1.5; the unsolved part is the *interop* failure in #13, not the existence of the operation.
- **"Verified community node" as a near-term goal.** The verification rules ("must not be an existing node", "no run-time dependencies") are in direct tension with this package's premise (§7.4). Treat verification as an open question to raise with the map, not a promise — and note that from n8n 3.0 an unverified node needs `N8N_UNVERIFIED_PACKAGES_ENABLED=true` on the instance.

---

## 10. Limits of this audit / unverified items

- **`@taxmanagementnz/n8n-nodes-pgp`**: no public source repository exists (`repository` points at an org root; the org's three public repos do not include this node). Everything stated was read from the published tarball `n8n-nodes-pgp-1.1.0.tgz`; the source TypeScript, its build process and its CI are unknown.
- **`n8n-nodes-gpg` (onlypfachi)**: dependencies (`openpgp ^5.11.0`, `steam ^1.4.1` — apparently a typo for `stream`) and README were read from the registry; the node's operation list and I/O handling were **not** read in full, so its capability-matrix cells are marked `✅*` (description-only) or `?*` (unknown) rather than verified. Its README self-describes the `allowInsecureDecryptionWithSigningKeys` configuration as a workaround for "the openPGP bug", and recommends trying `n8n-nodes-pgp` first. The repo is not a GitHub fork of bramkn's; the README says it "was build with same functionality of the already build PGP node by Bram".
- **npm has no reviews**; the ticket's "npm reviews" item could not be satisfied and is replaced with download data, keyword inspection and README analysis.
- Download counts cannot distinguish CI/automation pulls from human installs; treat 386 vs 50 as order-of-magnitude, not precise demand.
- GitHub "last activity" for hapheus is misleading (§5.1); `pushed_at` was therefore cross-checked against commit messages.
- luka's git tags `v1.4.0`/`v1.5.0` are inherited from the hapheus fork and do not correspond to published npm versions; whether luka intends to publish a `1.4+` line is unknown.
- Forum search used the Discourse `search.json` endpoint, which returns relevance-ranked topics; obscure threads outside the first page of each query may have been missed. Queries run: `pgp`, `openpgp`, `gpg`, `detached signature`, `pgp encrypt`, `n8n-nodes-pgp`, `pgp node`, `gpg node`, `decrypt file pgp`, `encrypt binary file`, `pgp key`, `sign file gpg`.
- No blocked/allowlisted status was found for any of these packages: `https://api.n8n.io/api/community-nodes/blocklist` returns 404 and the docs page does not enumerate entries ([Blocklist](https://docs.n8n.io/integrations/community-nodes/blocklist.md)); an actual blocklist check would need the n8n instance API.
