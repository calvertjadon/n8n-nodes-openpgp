# Ticket #5 — Can bundling OpenPGP.js earn n8n verification?

**Verdict: NO-GO** for "bundle OpenPGP.js into `dist/` so the package declares zero run-time dependencies, then submit for verification".

Bundling does clear n8n's *declared-dependency* rule, but it cannot clear n8n's *static* rules: the published tarball (including bundled third-party code) is linted by `@n8n/scan-community-package`, and openpgp v6's own build contains identifiers/imports that the scanner treats as hard errors (`global`, `setTimeout`, `process`, `require("module")`, `require("url")`, `__filename`, `console.*`). n8n's scanner disables inline suppression (`allowInlineConfig: false`), so this cannot be silenced in code; the only ways out are rewriting third-party internals or gaming the file globs. On top of that, the CJS bundle is operationally fragile (a plain `import` + esbuild `--format=cjs` build crashes at module load), and shipping a bundled library drags real LGPL-3.0 obligations into an MIT package whose `license` field the scanner *requires* to stay exactly `"MIT"`.

Recommended course: ship `n8n-nodes-openpgp` as an ordinary (unverified) community node with `openpgp` in `dependencies`, exactly like the existing PGP nodes, and treat verification as out of reach until openpgp's build or n8n's rules change. Details, evidence, and the full obligation list if a future team still chooses GO are below.

---

## 1. What `@n8n/scan-community-package` actually checks (Q1)

Source of truth: [`packages/@n8n/scan-community-package/scanner/`](https://github.com/n8n-io/n8n/tree/master/packages/%40n8n/scan-community-package/scanner) in n8n-io/n8n (`scanner.mjs`, `provenance.mjs`, `cli.mjs`; package version **0.36.0**, published 2026-09-15 per the npm registry).

`analyzePackageByName()` runs this pipeline:

1. **Provenance gate.** `checkPackageProvenance()` requires `package.json` → npm metadata `versions[v].dist.attestations.provenance` to exist and to use predicate type `https://slsa.dev/provenance/v1` ([`provenance.mjs`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/scan-community-package/scanner/provenance.mjs)). No provenance = fail, full stop.
2. **Source fetch gate.** `parseSourceRepo()` decodes the attestation and requires a `git+https://github.com/<owner>/<repo>` resolved dependency plus a 40–64 hex `gitCommit` — GitLab/other hosts return `null`, and an unreachable source is a **hard failure** ("The scan lints the attested source, so it must be reachable — publish with provenance from a public GitHub repository"). It then downloads `https://codeload.github.com/<owner>/<repo>/tar.gz/<commit>` and locates the package root by `package.json.name`.
3. **Source leg lint** with `SOURCE_FILE_PATTERNS = ['package.json', '{nodes,credentials}/**/*.{js,ts,json}']`.
4. **Tarball leg lint** — `npm pack <pkg>@<version>`, extract, then `analyzePackage(packageDir, ['**/*.js', 'package.json'])`.
5. **Pass = zero error-level violations in both legs.** `results.filter(r => r.errorCount > 0)` — warnings do not fail the scan.

The ESLint config ([`buildScanConfig`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/scan-community-package/scanner/scanner.mjs)) is:
`@n8n/eslint-plugin-community-nodes` `recommended` (all files) + `{'no-console': 'error'}` + `eslint-plugin-n8n-nodes-base`'s `community` ruleset on `package.json`, `credentials` ruleset on `**/credentials/**/*.ts`, `nodes` ruleset on `**/nodes/**/*.ts`.

Two structural facts matter more than any individual rule:

* `new ESLint({ allowInlineConfig: false, overrideConfigFile: true, overrideConfig: … })` — **`// eslint-disable` comments are ignored** and the package cannot influence the rule set.
* The tarball leg's glob is `**/*.js` (+ root `package.json`), evaluated from the package root with `node_modules/**` excluded. So **bundled third-party code inside `dist/**/*.js` is linted** with the full community-nodes ruleset. It is not a dependency-manifest check.

What it does **not** do: no dependency-tree walk, no transitive analysis, no tarball content allowlist/hash check, no license scan of shipped code, no runtime sandbox, no vendored-code detection. It is a provenance check plus an AST lint.

### Rules that decide this ticket

From [`@n8n/eslint-plugin-community-nodes`](https://github.com/n8n-io/n8n/tree/master/packages/%40n8n/eslint-plugin-community-nodes/src/rules) (0.33.0, as pinned by scanner 0.36.0):

| Rule | Level | Effect here |
| --- | --- | --- |
| `no-runtime-dependencies` | error | Non-empty `dependencies` in `package.json` fails. Message: *"Move shared libraries to 'peerDependencies' or bundle them into your build artifact."* — n8n's own text naming bundling as the alternative. |
| `valid-peer-dependencies` | error | `peerDependencies` may contain only `n8n-workflow: "*"` (plus optionally `@n8n/ai-node-sdk`). **`@openpgp/web-stream-tools` may not be a peer dependency.** |
| `no-restricted-imports` | error | Bare `require`/`import`/dynamic-import is allowed only for: relative paths, **anything listed in the package's own `devDependencies`**, and `n8n-workflow`, `ai-node-sdk`, `@n8n/ai-node-sdk`, `lodash`, `moment`, `p-limit`, `luxon`, `zod`, `crypto`, `node:crypto`. |
| `no-restricted-globals` | error | Bans `process`, `global`, `globalThis`, `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `__dirname`, `__filename` — in **every** linted file, dist included. |
| `no-dangerous-functions` | error | `eval`, `Function` constructor, `child_process` spawn family. (openpgp does not trip this.) |
| `n8n-nodes-base/community-package-json-license-not-default` | error | `license` must equal exactly `"MIT"` (constant `LICENSE: "MIT"` in `eslint-plugin-n8n-nodes-base@1.16.7`). |
| `no-overrides-field`, `no-forbidden-lifecycle-scripts` | error | No `overrides`, no install hooks. |

Note the sanctioned path is explicit: `no-restricted-imports`'s own comment says *"any external package an author uses must be a devDependency (bundled at build) or a peerDependency (provided by the instance)"*, and `no-runtime-dependencies` says to bundle. **Bundling is legal by design — the blocker is what the bundle contains.**

## 2. Empirical result: a bundled OpenPGP node fails the scan (Q1/Q3)

I built a throwaway but realistic fixture (a programmatic `Openpgp` node + credential, `peerDependencies: {n8n-workflow: "*"}`, no `dependencies`, `openpgp` and `esbuild` as `devDependencies`) and ran the **real scanner code** (`analyzePackage` imported from `@n8n/scan-community-package@0.36.0/scanner/scanner.mjs`) against it. openpgp 6.3.1, esbuild 0.28.2, Node 24.

| Build configuration | Runs in Node? | Tarball-leg (`dist/**/*.js`) errors |
| --- | --- | --- |
| Source leg (`source` patterns) | n/a | **0 — passes** |
| `import * as openpgp from 'openpgp'` + `--format=cjs` (esbuild resolves the `import` condition → `dist/node/openpgp.mjs`) | ❌ **crashes at module load** (`createRequire(import.meta.url)`, see §6) | **10** |
| `require('openpgp')` + `--format=cjs` (→ `dist/node/openpgp.min.cjs`) | ✅ round trip OK | **15** |
| browser build aliased (`dist/openpgp.min.mjs`) + `--format=cjs` | ✅ round trip OK | **12** |
| browser build + `--drop:console --define:process.env.NODE_ENV='"production"'` | ✅ round trip OK | **6 (floor)** |
| `--format=esm` output | ✅ round trip OK | not linted (`.mjs` is outside both globs) — and not loadable by n8n's `require`-based loader (§6) |

Representative violations from the `require('openpgp')` build (15 errors):

```
global                    ×2   no-restricted-globals
require('module')         ×1   no-restricted-imports
setTimeout                ×3   no-restricted-globals
console.*                 ×6   no-console
process                   ×2   no-restricted-globals
require('url')            ×1   no-restricted-imports
__filename                ×1   no-restricted-globals
```

The offending code is openpgp's own shipped build, not the wrapper:

* the global-object polyfill vendored in `@openpgp/web-stream-tools`:
  `var globalThis = typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};`
* stream bridging: `await new Promise((resolve) => setTimeout(resolve));` (3 sites)
* debug/diagnostics: `console.warn('stream.slice(input, …) not implemented efficiently.')`, `console.log('[OpenPGP.js debug]', …)`, `process.env.NODE_ENV === 'development'`
* browser build fatal path: `process.exit(1)`
* Node build module loading: `require("module")` → `createRequire(import.meta.url)` (the `nodeRequire` config) and `require("url").pathToFileURL(__filename)`

Applying the two *legitimate* esbuild transforms (`--drop:console`, `--define:process.env.NODE_ENV='"production"'`) removes the `console` and `NODE_ENV` violations but leaves a floor of **6 errors**: `global` ×2, `setTimeout` ×3, `process` ×1 (the `process.exit(1)` path). Reaching zero would require rewriting openpgp's vendored stream layer and its fatal-error path at build time — i.e. shipping a patched fork of a crypto library, with the LGPL source-publication duty that implies (§5).

Because `allowInlineConfig: false`, there is no `eslint-disable`, no local rule override, and no config escape hatch.

**Scanner scope caveats (documented for completeness — not recommended as a workaround).** Both legs are glob-scoped to `.js`: only `**/*.js` + root `package.json` in the tarball, and only `{nodes,credentials}/**/*.{js,ts,json}` + `package.json` in the source. A bundle emitted as `.cjs`/`.mjs` would therefore not be linted. That is evasion of the gate rather than compliance, and it does not survive human review; separately, n8n loads node files with `require` (see §6), so an ESM-only dist would not load anyway.

## 3. Environment variables / filesystem: enforced statically (Q3)

The guidelines state: *"The code **must not** interact with environment variables or attempt to read/write files. Pass all necessary data through node parameters."* ([verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md)).

This is enforced statically, by identifier: `no-restricted-globals` flags `process`, `__dirname`, `__filename` anywhere in linted files, and `no-restricted-imports` blocks `require('fs')`, `require('node:fs')`, `require('module')`, `require('url')`, `require('stream')`, `require('worker_threads')`, etc. (only `crypto`/`node:crypto` from the built-in list are allowed). There is no dataflow analysis, so an indirect `process` reference would slip through — but openpgp references these globals directly, and its Node build literally creates a `require` via `createRequire(pathToFileURL(__filename))`.

So: **yes, statically enforced, and yes, openpgp's internals trip it.** openpgp's crypto import itself is fine (`node:crypto` is allow-listed); its stream layer, debug flags, and module-loading plumbing are not.

## 4. Precedent: verified community nodes do not bundle (Q2)

The verified ("vetted") catalog is a live API — `https://api.n8n.io/api/community-nodes` (`N8N_VETTED_NODE_TYPES_PRODUCTION_URL`, see [`community-node-types-utils.ts`](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/modules/community-packages/community-node-types-utils.ts)); each entry carries `packageName`, `npmVersion`, and a per-version `checksum`. As of 2026-09-21 it lists **98 packages**, and it contains **no PGP/crypto/OpenPGP node**.

I downloaded and inspected all 98 published tarballs (latest version for each):

| Check | Result |
| --- | --- |
| Tarballs retrieved | 98/98 |
| `dependencies` non-empty | 2 (both explained below) |
| esbuild/webpack-style bundler scaffolding in `dist/**` (`__commonJS`, `__toESM`, `__webpack_require__`, `__defProp`) | **0** |
| Restricted patterns in `dist/**` (`typeof global`, `require("module")`, `setTimeout(function`) | **0** |

The two packages with declared dependencies are version drift, not precedent: `@vlm-run/n8n-nodes-vlmrun` added `form-data` only in 2.2.10+ (its vetted version is **2.2.9**, `dependencies: none`), and `n8n-nodes-jigsawstack` re-added `n8n-workflow` as a dependency in 0.0.13 (vetted version **0.0.10**, `dependencies: none`). Verification is per-version and checksum-pinned, so those latest releases are simply not the verified ones.

Deep inspection of sampled packages (`@langfuse/n8n-nodes-langfuse`, `n8n-nodes-qdrant`, `n8n-nodes-serpapi`, `@mendable/n8n-nodes-firecrawl`, `@apaleo/n8n-nodes-apaleo-official`) shows plain `tsc` output — the largest files are authored code or generated parameter tables (e.g. an 838 KB `descriptions/parameters.js` array in the apaleo package), not vendored libraries.

Consistent with that, n8n's own toolchain never bundles: [`n8n-node build`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/node-cli/src/commands/build.ts) runs `tsc` and copies static assets, and the [starter](https://github.com/n8n-io/n8n-nodes-starter) `package.json` has no bundler. Verified nodes hit "zero runtime dependencies" by calling the HTTP Request helper/routing in `n8n-workflow` instead of linking a library.

**Finding: there is no verified-node precedent for bundling a third-party library, and every verified node that needed an API client implemented it against `n8n-workflow` primitives.** The only place bundling is endorsed is n8n's own rule text.

## 5. Licensing: LGPL-3.0+ inside an MIT package (Q4)

Facts:

* openpgp's npm metadata declares `"license": "LGPL-3.0+"`; its [`LICENSE`](https://github.com/openpgpjs/openpgpjs/blob/main/LICENSE) is the verbatim 165-line LGPL-3.0 text **with no linking exception**; the [README](https://github.com/openpgpjs/openpgpjs#license) says "GNU Lesser General Public License (3.0 or any later version)".
* Bundling openpgp into `dist/` is the JS analogue of static linking, which LGPL-3.0 §4 ("Combined Works") governs: *"A 'Combined Work' is a work produced by combining or linking an Application with the Library."* You may convey a Combined Work under terms of your choice **if** the combination does not restrict modification/reverse-engineering of the library and you also:
  * **§4a** give prominent notice with each copy that the Library is used and is covered by the LGPL;
  * **§4b** accompany the work with a copy of **GNU GPL-3.0 and LGPL-3.0**;
  * **§4c** include the library's copyright notice where the work displays notices at execution;
  * **§4d** do one of: **(4d0)** convey the Minimal Corresponding Source plus the application code in a form that permits **recombining/relinking** with a modified library, or **(4d1)** use a suitable shared-library mechanism that uses a library copy already present on the user's system;
  * **§4e** Installation Information, only where GPL §6 would apply (not typical for npm packages).
* FSF's own guidance ([GPL FAQ #LGPLStaticVsDynamic](https://www.gnu.org/licenses/gpl-faq.html#LGPLStaticVsDynamic)): *"If you statically link against an LGPLed library, you must also provide your application in an object (not necessarily source) format, so that a user has the opportunity to modify the library and relink the application."*

Practical reading for an npm node package (**[INFERENCE] — informational, not legal advice**): bundling is permissible; keep your own code MIT, and satisfy §4 by shipping the LGPL/GPL texts plus an OpenPGP notice inside the published tarball, retaining openpgp's license header in the bundle, pinning the exact openpgp version, and publishing the build script + a documented procedure for substituting a modified openpgp and rebuilding (the JS equivalent of §4d0 relinking).

Two tensions are worth flagging before anyone commits:

1. **`package.json` must say `"MIT"`.** The scanner enforces `community-package-json-license-not-default` (constant `LICENSE: "MIT"`), and the guidelines say "Make sure your package license is MIT". You therefore cannot express the combined licensing in the single `license` field (e.g. `MIT AND LGPL-3.0-or-later`); the notice/license-text files carry that burden instead. Declaring the whole package MIT while shipping LGPL-3.0 code without notices is the actual compliance failure mode.
2. **If you patch openpgp's internals** to satisfy the scan (§2), you are conveying a *modified* LGPL work, which must itself be offered under LGPL-3.0+ (source of the modification published). That adds a fork-maintenance and publication duty on top of the crypto code you are already patching.

## 6. openpgp v6 CJS bundling feasibility (Q5)

* openpgp 6.3.1 publishes only `dist/` and `lightweight/` (`files: ["dist/", "lightweight/"]`) — **no `src/`**, no `sideEffects` hint — and its `exports` map exposes only `.` and `./lightweight`, so partial imports/tree-shaking of the internals are not available. You ship the whole pre-bundled library (≈517 KB bundle for the browser build, ≈763–880 KB for the Node build in my fixtures, plus the source-map-free dist).
* `dist/node/openpgp.min.cjs` is self-contained: it requires only `module`, `node:crypto`, and `url`. The declared `peerDependencies: {"@openpgp/web-stream-tools": "~0.3.0"}` was **not** installed by `npm install openpgp` in my sandbox, and encrypt/decrypt round trips succeeded without it — the dist inlines what it needs. (Flagged: I observed this, I did not investigate the upstream packaging intent.)
* **`import` + esbuild CJS output does not work.** openpgp v6 resolves to `dist/node/openpgp.mjs`, which calls `createRequire(import.meta.url)`; esbuild empties `import.meta` for `--format=cjs`, so the bundle throws at module init:
  `TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined`, at `createRequire`.
  This is upstream [openpgpjs/openpgpjs#1814](https://github.com/openpgpjs/openpgpjs/issues/1814); maintainer response: *"You'll get this error with `platform=node` if you `import` openpgp (as opposed to `require` it) and set ESBuild to output a non-ESM format (default is `format=cjs`)… possible manual solutions (i.e. use `format: 'esm'` or manually replace `'import.meta.url'` using a custom plugin)."*
  I reproduced the crash and confirmed both workarounds work: `require('openpgp')` (CJS condition) and `--format=esm` both round-trip encrypt/decrypt correctly.
* The `exports` map also blocks `import 'openpgp/dist/node/openpgp.min.cjs'` (`MODULE_NOT_FOUND`), so forcing the CJS entry requires a bundler alias/resolver plugin rather than a plain subpath import.
* n8n loads node/credential files with `require` ([`load-class-in-isolation.ts`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/load-class-in-isolation.ts), [`directory-loader.ts`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/directory-loader.ts)); I found no dynamic-import/ESM path in `packages/core/src/nodes-loader`. The dist must therefore be CJS.
* Runtime hazard worth noting: the browser build's fatal-error path calls `process.exit(1)`; inside an n8n worker that terminates the process rather than failing one execution.

Net: openpgp v6 **can** be bundled into a working CJS artifact (with `require` or an alias), but it does not bundle "cleanly", and the working variants are the ones that fail the scan hardest (§2).

## 7. Creator Portal process and review criteria beyond the scanner (Q6)

Per [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md) and [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md):

1. Start from `n8n-node` scaffolding (`npm create @n8n/node@latest`); use the [`n8n-node`](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool.md) CLI for build/lint/dev.
2. **Publish from GitHub Actions with npm provenance** — mandatory for all submissions, and the docs set a hard deadline: *"From May 1st 2026, nodes submitted for verification through the n8n Creator Portal must be published using GitHub Actions with a provenance statement."* Use the starter's `publish.yml` and `@n8n/node-cli >= 0.23.0`; configure npm "Trusted Publishers" (or an `NPM_TOKEN`). The scanner independently refuses packages without SLSA-v1 provenance and a reachable public GitHub source (§1).
3. Meet the guidelines: MIT license; public repo with matching author/repo; README with usage docs (English only); no environment/file access; linter passes (`npx @n8n/scan-community-package n8n-nodes-PACKAGE`) and no run-time dependencies; UX guidelines (password fields for credentials, CRUD operations, resource locator, consistency with existing nodes); one third-party service per package; no duplication of an existing node; no logic/flow-control nodes.
4. Submit at **https://creators.n8n.io/nodes**. The portal's client bundle exposes `/api/package-cloud-verifications/submit-for-verification`, `…/confirm-package-submission`, `…/resubmit-auto-review`, `…/resubmit-manual-review`, and `…/submit-video` — i.e. an **automated review stage followed by a human review**, with a demo video that can be requested. n8n *"reserves the right to reject nodes that compete with any of n8n's paid features"*.
5. Verification is **per version and checksum-pinned** in the vetted catalog, and instance installs verify integrity (`verifyIntegrity`, `community-packages.service.ts`). An unverified package additionally requires the instance's `unverifiedEnabled` config to install at all.

Two maintenance realities follow: the scanner is released roughly weekly (0.33.0 → 0.36.0 between 2026-08-25 and 2026-09-15; `no-runtime-dependencies` landed 2026-05-05, the `setTimeout` "use sleep" hint 2026-07-29), and it pins `eslint-plugin-n8n-nodes-base` as a floating `^1.16.7`, so **the effective gate can change without the package changing**. Any submission plan must include a re-scan immediately before submitting.

## 8. Obligations list, if a future plan still chooses GO

Build / scan (all mandatory for the scan to pass):

1. Force the CJS entry (`require('openpgp')` or a bundler alias to `dist/node/openpgp.min.cjs`); do not rely on `import` + `--format=cjs`.
2. Remove every restricted reference from shipped `dist/**/*.js`: `global`, `setTimeout`, `process`, `require('module')`, `require('url')`, `__filename`, and all `console.*`. Empirically `--drop:console` + `--define:process.env.NODE_ENV='"production"'` gets from 12→6 errors; the residual `global`/`setTimeout`/`process.exit` sites live inside openpgp's vendored stream and fatal-error code and must be patched out.
3. Keep `dependencies` empty/absent; `peerDependencies` = `n8n-workflow: "*"` only; put `openpgp` + `@openpgp/web-stream-tools` in `devDependencies`; `license` stays exactly `"MIT"`; no `overrides`, no lifecycle scripts.
4. Keep the `n8n.nodes`/`n8n.credentials` paths pointing at the emitted files, and make the custom bundling build reproducible from the public repo.
5. Publish from GitHub Actions with provenance; re-run `npx @n8n/scan-community-package n8n-nodes-openpgp` against the exact published version before submitting.

Licensing:

6. Ship, inside the npm tarball (watch the `files` array): `LICENSE-OpenPGP` (LGPL-3.0), the GPL-3.0 text, and a notice that OpenPGP.js is used and LGPL-covered; retain openpgp's header in the bundle.
7. Document the relink path: pinned openpgp version + build script + instructions to substitute a modified openpgp and rebuild.
8. If openpgp internals are patched, publish the modified library's source under LGPL-3.0+.

Process:

9. UX guidelines, README/docs, English only, public repo, author/repo match, one service per package, no duplicate of an existing node.
10. Creator Portal submission with the demo-video step expected; keep the node re-scannable as the ruleset drifts.

## 9. What would flip NO-GO → GO

* openpgp upstream ships a bundler-clean Node build (no `createRequire(import.meta.url)`, no `globalThis` polyfill, no bare `setTimeout`/`process.exit` in the module graph) — then a plain bundle could pass without patching; and/or
* n8n's ruleset changes (openpgp allow-listed, or `no-restricted-globals` scoped out of `dist/`);
* or the project deliberately takes on a patched-fork bundle and accepts §8 in full.

Absent those, the two honest options stay: (a) unverified community node with `openpgp` as a run-time dependency (installs on self-hosted instances; Cloud restricted to verified nodes), or (b) implementing the PGP operations from scratch on allow-listed primitives (`n8n-workflow`, `node:crypto`) — a rewrite of OpenPGP's key/message parsing, armor, and algorithms, which is the only route that both satisfies "no external dependencies" in spirit and passes the static gate.

## 10. Reproducing the empirical results

```bash
# scanner + library under test
mkdir -p /tmp/exp && cd /tmp/exp && npm init -y
npm i --no-audit --no-fund openpgp@6.3.1 esbuild @n8n/scan-community-package   # 0.36.0

# build variants (from a package fixture whose src/nodes/Openpgp/Openpgp.node.ts imports openpgp)
esbuild src/nodes/Openpgp/Openpgp.node.ts --bundle --platform=node --target=node18 \
  --format=cjs --external:n8n-workflow --outfile=dist/nodes/Openpgp/Openpgp.node.js          # 10 errors, crashes at runtime
# require-condition variant: replace the import with `const openpgp = require('openpgp')`     # 15 errors, runs
# browser variant:           add --alias:openpgp=./node_modules/openpgp/dist/openpgp.min.mjs  # 12 errors, runs
# best-case mitigated:       add --drop:console --define:process.env.NODE_ENV='"production"'  # 6 errors, runs

# run the scanner's own code against a fixture package dir
node -e "import('@n8n/scan-community-package/scanner/scanner.mjs').then(async (m) => {
  const r = await m.analyzePackage('/tmp/exp/t4', ['**/*.js', 'package.json']);
  console.log(r.passed, r.message, r.details ?? '');
})"
```

Precedent sweep: `curl -s 'https://api.n8n.io/api/community-nodes?pagination[pageSize]=500'` for the catalog, then per-package `npm pack`/tarball download with `tar -xzOf … | grep -E '__commonJS|__toESM|__webpack_require__|__defProp'` and `grep -E 'typeof global|require\("module"\)|setTimeout\(function'` over `dist/**` (§4).

## 11. Flagged / not verified

* The Creator Portal is closed source; I confirmed the submission endpoints from its client bundle and the documented requirement that the scan passes, but not whether the portal's "auto-review" runs the identical scanner version.
* No n8n instance was available in this environment: bundle behaviour was verified by executing the built artifacts in Node (round-trip encrypt/decrypt), not by loading them into n8n.
* Bundler-signature detection in §4 identifies esbuild/webpack-style scaffolding; a hypothetical rollup-only bundle might not match that regex. Absence of restricted-global patterns is a direct grep and is reliable.
* `@openpgp/web-stream-tools` is declared as a peer dependency of openpgp 6.3.1 yet was not installed by npm and was not needed by the exercised APIs — observed, not explained.
* LGPL conclusions are a reading of the licence text and FSF guidance, not legal advice; a lawyer should review the notice/relink package before publication.
