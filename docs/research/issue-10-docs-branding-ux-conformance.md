# Docs, branding, and UX conformance research

**Ticket:** [Docs, branding, and UX conformance pass](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/10) (wayfinder grilling ticket).
**Status:** research only. No production code, README, metadata, tests, or issues were changed; no lint, build, or test was run. Everything below is either a cited external fact, a cited first-party source reading, or a local finding with `file:field`.
**Snapshot date:** 2026-09-28.
**Versions used as evidence:**
`@n8n/node-cli` 0.49.1 and its pinned `@n8n/eslint-plugin-community-nodes` 0.33.0 ([npm](https://registry.npmjs.org/@n8n/node-cli/0.49.1), [plugin 0.33.0 tarball](https://registry.npmjs.org/@n8n/eslint-plugin-community-nodes/-/eslint-plugin-community-nodes-0.33.0.tgz)); `n8n-workflow` 2.39.3 ([npm](https://www.npmjs.com/package/n8n-workflow/v/2.39.3)) as pinned in this repo, cross-checked against `n8n` `master` (= 2.41.0) and the `3.x` branch; published n8n dist-tags today: `stable` 2.40.7, `next` 2.41.3, no published 3.x ([registry](https://registry.npmjs.org/n8n)).

Terminology note: the build plan says "`helpUrl`" ([`docs/spec.md`](../../docs/spec.md) §3.1, §9 Step 7). **No `helpUrl` field exists in n8n** — the field to implement is `documentationUrl`; see §3 below. This is the single most load-bearing naming correction in this note.

---

## 1. Icons and theming

### 1.1 What the official docs require/recommend

| Fact | Source |
|---|---|
| `icon` is Required, and may be a string **or** an object `{ light, dark }`; the string form `file:exampleNodeIcon.svg` is for an icon that works on both themes. | [Standard parameters § icon](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/standard-parameters) |
| "n8n recommends using an SVG for your node icon, but you can also use PNG. If using PNG, the icon resolution should be 60x60px. Node icons should have a square or near-square aspect ratio." | [Standard parameters § icon](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/standard-parameters), [Node UI design § Node icons](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design) |
| Do **not** set `defaults.color`: it only tints Font Awesome icons, is deprecated since n8n 1.52.0, and **n8n 3.0 removes it**. | [Standard parameters § defaults](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/standard-parameters), [Node UI design § Node icons](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design), [v3.0 breaking changes](https://docs.n8n.io/changelog/v30-breaking-changes) |
| Replacement for `defaults.color` is `iconColor` (with the same file-icon caveat): the type marks `color` `@deprecated` in favour of `iconColor`, which "supports dark mode and uses preset colors from n8n's design system". | [`n8n-workflow` interfaces.ts](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts) (`NodeDefaults.color`, `INodeTypeBaseDescription.iconColor`) |
| The presets include `pink-red`; n8n's own token for its brand pink is `--node--icon--color--pink-red: #ea4b71`. | [`interfaces.ts` `ThemeIconColor`](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts), [design-system `_tokens.scss`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/%40n8n/design-system/src/css/_tokens.scss) |

### 1.2 Themed variants: what the linter actually enforces

- `icon-prefer-themed-variants` is a **warning** (not an error), set to warn in both `recommended` and `recommendedWithoutN8nCloudSupport`: "This rule warns when a node or credential defines its icon as a single file string instead of the themed `{ light, dark }` object … it nudges authors toward themed variants without failing verification." — [rule doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/icon-prefer-themed-variants.md), severity table in the [plugin README](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/README.md). Rationale in the same rule doc: "the marketplace/preview UI renders both variants for nodes that aren't installed yet. A single icon file often renders poorly on one of the two themes."
- The rule implementation reports **only a string-literal icon** (`Literal` whose value is a string): for nodes it inspects `description.icon`, for credentials the class `icon` ([`icon-prefer-themed-variants.ts`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/src/rules/icon-prefer-themed-variants.ts)). Byte-identical between plugin 0.33.0 (the version this repo runs) and 0.34.0 — verified by diffing both published tarballs.
- "Both slots can point to the same file if one icon design works on both themes" — [rule doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/icon-prefer-themed-variants.md); the companion `icon-validation` rule (enabled, error-level) only requires the referenced files to exist and use the `file:` protocol, SVG or PNG — [icon-validation doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/icon-validation.md).
- The editor picks the variant by theme: `getThemedValue(nodeType.icon / iconUrl, appliedTheme)` returns `value[theme]` for objects and the string itself for a plain string — [`nodeIcon.ts`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/app/utils/nodeIcon.ts), [`nodeTypesUtils.ts` `getThemedValue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/app/utils/nodeTypesUtils.ts). A single-file icon therefore renders *identically* in both themes by design.
- Icons ship automatically: `n8n-node build` copies `**/*.{png,svg}` (ignoring `dist`, `node_modules`) into `dist/`, and the runtime loader rewrites `file:x.svg` to `icons/<packageName>/<path relative to the node file>`, refusing paths outside the package — [`build.ts` `copyStaticFiles`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/node-cli/src/commands/build.ts), [`directory-loader.ts` `getIconPath`/`fixIconPaths`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/directory-loader.ts). New icon files placed next to the `.ts` files need no build-config change.

### 1.3 Local state

| Finding | Location |
|---|---|
| Node icon already uses the themed object form, with **the same file in both slots**: `icon: { light: 'file:openPgp.svg', dark: 'file:openPgp.svg' }` (line 81). Introduced by commit `f795bc3` "fix: clarify release metadata and theme icon (#30)". | `nodes/OpenPgp/OpenPgp.node.ts:81` |
| Credential icon is a **single string literal**: `icon = 'file:openPgpPrivateKeyApi.svg' as const` (line 10). | `credentials/OpenPgpPrivateKeyApi.credentials.ts:10` |
| Both icon files exist and are 24×24 `viewBox` SVGs with a hardcoded `stroke="#EA4B71"` (no theme token, no dark variant). | `nodes/OpenPgp/openPgp.svg`, `credentials/openPgpPrivateKeyApi.svg` |
| `defaults` carries only `{ name: 'OpenPGP' }` — no `defaults.color`. | `nodes/OpenPgp/OpenPgp.node.ts:89` |

**Source-derived conclusion (not lint-observed, because no check was run):** on the current code the open `icon-prefer-themed-variants` warning can only come from the **credential** (string literal); the node's object form is explicitly accepted by the rule even when both slots share a file. Fixing the warning is therefore a one-line credential change (object with two slots) — distinct from the *settled* requirement of true adaptive artwork (see §6).

---

## 2. Package registration

| Fact | Source |
|---|---|
| `n8n.n8nNodesApiVersion` must be present and a positive integer **inside** `n8n`; `n8n.nodes` a non-empty array of strings each starting with `dist/`; `n8n.credentials` (if present) likewise `dist/`-prefixed. TypeScript sources or `./dist/...`/`DIST/...` variants are rejected. | [n8n-object-validation doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/n8n-object-validation.md) |
| Every `.node.ts` under `nodes/` must be registered in `n8n.nodes` or it is "silently excluded from the published package"; a versioned node registers only its entry file. | [node-registration-complete doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/node-registration-complete.md) |
| Docs: "Make sure that you add your nodes and credentials to the `package.json` file inside the `n8n` attribute"; package name must start with `n8n-nodes-`; `n8n-community-node-package` keyword required. | [Submit community nodes § Standards](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes) |
| `n8n.strict` is optional and must be boolean; it is written by the CLI's cloud-support toggle and pairs with `import { config } from '@n8n/node-cli/eslint'` (= `configs.recommended`, vs `configWithoutCloudSupport` = `recommendedWithoutN8nCloudSupport`). | [plugin `n8n-object-validation.ts`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/src/rules/n8n-object-validation.ts), [`cloud-support.ts`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/node-cli/src/commands/cloud-support.ts), [node-cli README § cloud-support](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/node-cli/README.md), [node-cli `configs/eslint.ts`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/node-cli/src/configs/eslint.ts) |
| API-level compatibility rule: `package.n8n.n8nNodesApiVersion <= N8N_NODES_API_VERSION`, where the constant is `1` on `master` and `3` on the `3.x` branch ("it also serves as the v3 feature flag for node-authoring APIs"). | [`@n8n/constants/src/community-nodes.ts`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/constants/src/community-nodes.ts), [3.x variant](https://github.com/n8n-io/n8n/blob/3.x/packages/%40n8n/constants/src/community-nodes.ts) |
| Scaffold shape for comparison (contains `"strict": true` and `dist/` paths). | [n8n-nodes-starter `package.json`](https://github.com/n8n-io/n8n-nodes-starter/blob/master/package.json) |

**Local state:** `package.json` `n8n` = `{ n8nNodesApiVersion: 1, strict: true, credentials: ["dist/credentials/OpenPgpPrivateKeyApi.credentials.js"], nodes: ["dist/nodes/OpenPgp/OpenPgp.node.js"] }`, matching the one credential file (`credentials/OpenPgpPrivateKeyApi.credentials.ts`) and the one node file (`nodes/OpenPgp/OpenPgp.node.ts`); `keywords` includes `n8n-community-node-package`; `files: ["dist"]`; `license: "MIT"`; `homepage` present; `author` has name + email. `eslint.config.mjs` is exactly `import { config } from '@n8n/node-cli/eslint'; export default config;` (the strict/default leg). `package.json` `scripts.lint:ci` turns off `@n8n/community-nodes/no-runtime-dependencies` for the fast lane — the accepted deviation recorded as [#11](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/11) and §12 of [`docs/spec.md`](../../docs/spec.md). No registration defect found. Note `n8nNodesApiVersion: 1` stays valid on the 3.x branch by the `<=` rule above.

---

## 3. `documentationUrl` vs `helpUrl`, and per-operation links

### 3.1 There is no `helpUrl`

- `helpUrl` does **not** exist in `n8n-workflow` (2.39.3 or master). The only doc-URL fields are `documentationUrl` on `ICredentialType` and on `INodeTypeBaseDescription` — [`interfaces.ts`](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts); in n8n's own repo `helpUrl` appears only as a Playwright a11y-result field ([a11y fixture](https://github.com/n8n-io/n8n/blob/master/packages/testing/playwright/fixtures/a11y.test.ts)). → **The spec's `helpUrl` means `documentationUrl`.**
- The official node-building reference does **not** document a node-level `documentationUrl` at all: the [standard parameters](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/standard-parameters) page lists `icon`, `group`, `description`, `defaults`, `inputs`, `outputs`, `credentials`, `properties` — no `documentationUrl`. It is documented for **credentials**: "`documentationUrl`: String. URL to your credentials documentation." — [Credentials files](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/credentials-files).
- Credential `documentationUrl` is lint-enforced (error-level) and "should always be a complete URL to your documentation" in community packages; slugs are internal-n8n only — [credential-documentation-url doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/credential-documentation-url.md). No node-level documentation-URL rule exists in the plugin's rule list ([README table](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/README.md)).

### 3.2 How each URL is consumed by the editor

| Surface | Behaviour | Source |
|---|---|---|
| Node "Docs" link | `documentationUrl` is returned verbatim **if it starts with `http`**; otherwise codex `primaryDocumentation[0].url`; otherwise, for community packages, `https://www.npmjs.com/package/<packageName>`; otherwise the built-in docs root. | [`useNodeDocsUrl.ts`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/app/composables/useNodeDocsUrl.ts), [`urls.ts`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/app/constants/urls.ts) (`NPM_PACKAGE_DOCS_BASE_URL`), Docs tab wiring in [`NodeSettingsTabs.vue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/features/ndv/settings/components/NodeSettingsTabs.vue) |
| Credential modal docs link | Uses the credential type's `documentationUrl`; for community nodes an absolute URL is used as-is, while a non-absolute "slug" yields **no link** for community nodes. | [`CredentialConfig.vue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/features/credentials/components/CredentialEdit/CredentialConfig.vue) |
| codex `resources.primaryDocumentation` / `credentialDocumentation` | Docs: "The `resources` object contains links to your node documentation. n8n automatically adds help links to credentials and nodes in the GUI." A codex file is *recommended*, not required. The type is `DocumentationLink[]` = `{ url: string }` — **node- and credential-level only, no per-operation or per-resource entries**. For community packages the loader reads a sibling `<Node>.node.json` (missing → `codex = { categories: ['Custom Nodes'] }`, per [`constants.ts`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/constants.ts)). | [Codex files](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/codex-files), [Choose node file structure](https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-node-file-structure), [`CodexData` type](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts), [`directory-loader.ts` `addCodex`/`getCodex`](https://github.com/n8n-io/n8n/blob/master/packages/core/src/nodes-loader/directory-loader.ts) |

### 3.3 Per-operation links: what is actually possible

There is **no per-operation URL field** anywhere in the node description type — `documentationUrl` is one string per node, and codex resources are node/credential-level arrays (sources in §3.1–3.2). Per-operation anchors must therefore travel in copy. Verified link-capable and link-incapable surfaces:

| Copy surface | Renders links? | Source |
|---|---|---|
| Parameter `description` (tooltip) | **Yes** — rendered through `v-n8n-html` with HTML sanitized (sanitize-html allow-list includes `a`) and `href=` rewritten to `target="_blank"`. | [`InputLabel.vue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/%40n8n/design-system/src/components/N8nInputLabel/InputLabel.vue), [`n8n-html.ts` directive](https://github.com/n8n-io/n8n/blob/master/packages/frontend/%40n8n/design-system/src/directives/n8n-html.ts) |
| Parameter `hint` | **Yes** — the wrapper renders the hint with `:render-h-t-m-l="true"`, and the component forces `target="_blank"` on its anchors. (Without that prop the hint is escaped text.) | [`ParameterInputWrapper.vue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/features/ndv/parameters/components/ParameterInputWrapper.vue), [`ParameterInputHint.vue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/features/ndv/parameters/components/ParameterInputHint.vue) |
| Node-level `hints[]` | **Yes** — documented "The hint message. You can use HTML."; `displayCondition` is an expression, so a hint can be shown for one operation only. | [Node UI elements § Hints](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/node-ui-elements) |
| Operation `description` in the NDV action picker | **No** — the picker renders only `option.action.properties.displayName`. | [`NodeActionsList.vue`](https://github.com/n8n-io/n8n/blob/master/packages/frontend/editor-ui/src/app/components/NodeActionsList.vue) |
| Info box / Notice, tooltips, hints generally | Docs: "This field can include links, which should open in a new tab." | [Node UI design § UI text style](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design) |

Practical consequence for the settled anchor scheme: node-wide docs URL → `description.documentationUrl` (one anchor); per-operation pointers → parameter `description`/`hint` HTML anchors (the parameter already carries the operation-scoped `displayOptions`, so it is naturally per-operation), or node `hints[]` with a per-operation `displayCondition`.

**Local state:** the node description defines **no** `documentationUrl`, no `hints`, no `codex`, and there is no `nodes/OpenPgp/OpenPgp.node.json` codex file (`nodes/OpenPgp/OpenPgp.node.ts:79-99`; directory listing `nodes/OpenPgp/` = `OpenPgp.node.ts`, `helpers.ts`, `operations.ts`, `openPgp.svg`). Per `useNodeDocsUrl.ts`, the Docs tab of the deployed community node therefore currently falls back to `https://www.npmjs.com/package/n8n-nodes-openpgp`, not the README. The credential does set `documentationUrl = 'https://github.com/calvertjadon/n8n-nodes-openpgp#readme'` (`credentials/OpenPgpPrivateKeyApi.credentials.ts:8`) — an absolute URL, so the credential modal's docs link works and passes the lint rule.

---

## 4. UX copy, `displayOptions` and error rules

### 4.1 Copy rules (docs)

| Rule | Source |
|---|---|
| Title Case for node `name`, parameter `displayName`, drop-down values, subtitle; Sentence case for node `description`, parameter `description` (tooltips), `hint`, operation `action` and `description`. | [UX guidelines § Copy](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines), [Node UI design § UI text style](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design) |
| Single-sentence tooltip/hint: **no trailing period**; more than one sentence: always a period. Info boxes/tooltips may contain links that open in a new tab. | [Node UI design § UI text style](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design) |
| Boolean descriptions start with "Whether to…". | [UX guidelines § Boolean description](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines), [Node UI design § Toggles](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design) |
| Placeholders should start with "e.g." and use camel case for the demo content. | [UX guidelines § Placeholders](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines) |
| When copy refers to a parameter/field name, wrap it in single quotation marks. | [UX guidelines § Referring to parameter and field name](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines) |
| "Don't use the terms 'binary data' or 'binary property' for this field. Instead, use a more descriptive name: **Input data field name** / **Output data field name**." | [UX guidelines § Source keys or binary properties](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines) |
| Operation copy vocabulary (name/action/description, CRUD terms, "object of the operation"). | [UX guidelines § Operations name, action, and description](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines) |
| "Don't use technical jargon when there are simpler alternatives"; use the service's own GUI terminology; be consistent. | [Node UI design § UI text terminology](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design), [UX guidelines § Terminology](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines) |
| No emojis in option names (lint-enforced, error). | [no-emoji-in-options doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/no-emoji-in-options.md) |

### 4.2 `displayOptions` rules

| Rule | Source |
|---|---|
| Reusing an internal name across operations is **recommended** ("allows n8n to preserve user-entered data if a user switches operations"), and "When reusing the internal name, you must ensure that only one field is visible to the user at a time. You can control this using `displayOptions`." | [Code standards § Reuse internal parameter names](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/code-standards) |
| Progressive disclosure: hide a field until the fields it depends on have values; bundle mutually dependent optional fields under one collection option. | [Node UI design § Showing and hiding fields / Optional fields](https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design) |
| `show` is AND across keys; `hide` is OR (any matching key hides). | [`node-helpers.ts` `displayParameter`](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/node-helpers.ts) |
| A `displayOptions` key with a leading `/` is resolved against the **root** of the node's parameter data; without it the value is read from the current (collection) level. | [`node-helpers.ts` `getPropertyValues`](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/node-helpers.ts) — this is source-only behaviour, not in the docs; recorded locally in [`docs/spec.md`](../../docs/spec.md) §12 |
| `usableAsTool` must be declared; the type accepts `true | UsableAsToolDescription`, so a node cannot opt out with `false`. | [node-usable-as-tool doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/node-usable-as-tool.md), [`interfaces.ts`](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts) |

### 4.3 Error rules

| Rule | Source |
|---|---|
| Use `NodeOperationError` for operational/validation/config failures and `NodeApiError` for external API failures; pass `itemIndex` for multi-item runs; the `continueOnFail()` branch should push `{ json: { error }, pairedItem: { item: i } }`. | [Error handling](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/error-handling) |
| Lint (error): caught-and-rethrown errors must be wrapped in `NodeApiError`/`NodeOperationError`; raw re-throws/generic `Error` lose UI context. | [require-node-api-error doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/require-node-api-error.md) |
| Every returned item needs `pairedItem` (preserves item linking). | [missing-paired-item doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/missing-paired-item.md) |
| Error message = what happened; include the triggering parameter's `displayName`; append `[Item X]`; avoid the words "error", "problem", "failure", "mistake". Error `description` = how to solve/unblock (same word ban). | [UX guidelines § Errors](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines) |

### 4.4 Local state (copy, `displayOptions`, errors)

- **Copy case:** all 48 `displayName`s in `nodes/OpenPgp/OpenPgp.node.ts` are Title Case; operation `options[].name` (`Decrypt`/`Encrypt`/`Sign`/`Verify`) Title Case and `options[].action`/`description` sentence case (`OpenPgp.node.ts:111-140`).
- **Booleans:** every boolean `description` starts with "Whether to" — `hideRecipients` (`:53`), `legacyCompatibility` (`:63`), `alsoSign` (`:227`), `armorOutput` encrypt (`:263`) and sign (`:509`), `requireValidSignature` (`:353`), `throwOnInvalidSignature` (`:667`).
- **Placeholders** start with "e.g." for every input field (e.g. `:173` `e.g. data`, credential `:23` `e.g. -----BEGIN PGP PRIVATE KEY BLOCK-----`); the only exception is the collection's prompt `placeholder: 'Add option'` at `:71`, which is n8n's standard wording. The demo content itself is prose, not camelCase. (21 `placeholder` occurrences across the two files.)
- **Descriptions/hints**: sentence case, single-sentence tooltips carry no trailing period, multi-sentence copy does (spot-checked across `OpenPgp.node.ts` and `OpenPgpPrivateKeyApi.credentials.ts`).
- **`displayOptions`**: collection options address node-level parameters with the leading `/` — `{'/outputAs': ['binary']}` (`:264`), `{'/encryptUsing': ['publicKeys']}` (`:266`), `{'/signatureType': ['detached','inline'], '/outputAs': ['binary']}` (`:510`) — which is exactly the root-lookup behaviour in §4.2. Mutually exclusive duplicates reuse internal names (`textToSign` ×2 at `:430`/`:440`, `outputFieldName` ×2 at `:479`/`:488`, `binaryPropertyName` ×3 at `:168`/`:295`/`:452`, `messageText` ×2 at `:549`/`:625`), satisfying the "only one visible at a time" rule; `displayName`s therefore repeat across those branches.
- **Errors:** all failures go through one factory — `ERROR_COPY` (9 kinds, `nodes/OpenPgp/helpers.ts:50-98`) + `operationError()` (`helpers.ts:107-131`), which builds `NodeOperationError` with `itemIndex` and a `description` (how to unblock) and attaches the library error as `cause`; `execute()` in `nodes/OpenPgp/OpenPgp.node.ts:674-698` appends `[Item <n>]` (`:684`), honours `continueOnFail()` with `pairedItem`, and rethrows `NodeOperationError`. Every successful result carries `pairedItem` (`nodes/OpenPgp/operations.ts:307`). Messages name the offending field ("Public Key(s) doesn't contain…", "Private Key holds a public key…", "Couldn't decrypt with this Password…") and none of the banned words ("error"/"problem"/"failure"/"mistake") appear in `ERROR_COPY`.
- **Credential test (UX-relevant):** the credential has no HTTP `test`, but the node declares `testedBy: 'openPgpPrivateKeyTest'` (`OpenPgp.node.ts:103`) and implements `methods.credentialTest.openPgpPrivateKeyTest` (`OpenPgp.node.ts:699-745`) which parses the armored key, requires a private key, and unlocks it with the Passphrase — all offline (no network call). n8n resolves the string form as `node.methods.credentialTest[testedBy]` ([`credentials-tester.service.ts`](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/services/credentials-tester.service.ts)), and the lint rule accepts `testedBy` in place of `test` when every usage of the credential is covered ([credential-test-required doc](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/docs/rules/credential-test-required.md), [rule source](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/eslint-plugin-community-nodes/src/rules/credential-test-required.ts)). This is why the README can say the credential's Test button validates the key + Passphrase offline.

---

## 5. `N8N_UNVERIFIED_PACKAGES_ENABLED` — current behaviour

**Today (n8n 2.x, what ships as of 2026-09-28):** default **`true`**.

- Official env-var reference: "`N8N_UNVERIFIED_PACKAGES_ENABLED` | Boolean | `true` | When `N8N_COMMUNITY_PACKAGES_ENABLED` is true, this variable controls whether to enable the installation and use of unverified community nodes from an NPM registry (true) or not (false)." — [Nodes environment variables](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/nodes). The same page gives `N8N_COMMUNITY_PACKAGES_ENABLED` default `true` ("If set to false, neither verified nor unverified community packages will be available, regardless of their individual settings") and `N8N_VERIFIED_PACKAGES_ENABLED` default `true`.
- Runtime source (master, 2.41.0): `@Env('N8N_UNVERIFIED_PACKAGES_ENABLED') unverifiedEnabled: boolean = true;` and the install guard `if (!this.config.unverifiedEnabled && !checksumProvided) throw new UnexpectedError('Installation of unverified community packages is forbidden!')` — [`community-packages.config.ts`](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/modules/community-packages/community-packages.config.ts), [`community-packages.service.ts`](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/modules/community-packages/community-packages.service.ts).

**When the flag is `false` (i.e. what operators will hit):**

- GUI/npm install of an unverified package fails; checking a `checksum` is the alternative path (the guard above).
- Env-var–managed installs **fail at startup**: "If a package isn't in the vetted-packages registry and `N8N_UNVERIFIED_PACKAGES_ENABLED` is `false`, n8n fails to start. Either pin a `checksum` for the package, set `N8N_UNVERIFIED_PACKAGES_ENABLED=true`, or pick a vetted package." — [Environment variable installation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/environment-variable-installation) (that page also states env-var package management is available from n8n 2.21.0, and that enabling it uninstalls packages not in the list).

**n8n 3.0 flips the default to `false` (scheduled October 2026 — not yet shipped):**

- "**Unverified community packages off by default.** The default for `N8N_UNVERIFIED_PACKAGES_ENABLED` changes from `true` to `false`. **What to do:** Set `N8N_UNVERIFIED_PACKAGES_ENABLED=true` to keep installing unverified community nodes from npm." — [v3.0 Breaking changes § Changed defaults and removed variables](https://docs.n8n.io/changelog/v30-breaking-changes) (page header: "scheduled for October 2026").
- Code on the `3.x` branch already reads `/** Whether to allow installing and loading packages not verified by n8n */ @Env('N8N_UNVERIFIED_PACKAGES_ENABLED') unverifiedEnabled: boolean = false;` — [3.x `community-packages.config.ts`](https://github.com/n8n-io/n8n/blob/3.x/packages/cli/src/modules/community-packages/community-packages.config.ts). `master` still reads `true` (master is 2.41.0, i.e. still the 2.x line).
- The migration report for that flip exists in source: "Installed community packages that are not verified by n8n will stop loading unless the variable is explicitly set to true", detected when `N8N_UNVERIFIED_PACKAGES_ENABLED` is unset while community packages are enabled — [`unverified-packages.rule.ts`](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/modules/breaking-changes/rules/v3/unverified-packages.rule.ts).

**Verified vs unverified availability:**

- "Unverified community nodes aren't available on n8n cloud and require self-hosting" — [Installation and management](https://docs.n8n.io/integrations/community-nodes/installation-and-management). Verified nodes are installable from the nodes panel ("More from the community") — [Install verified community nodes](https://docs.n8n.io/integrations/community-nodes/installation-and-management/install-verified-community-nodes).
- Four documented install routes: nodes panel (verified only), in-app GUI from npm, manual CLI/Docker (`docker exec -it n8n sh` → `~/.n8n/nodes` → `npm i <pkg>`, needed for queue mode and private packages), and environment variables — [Installation and management](https://docs.n8n.io/integrations/community-nodes/installation-and-management), [Manual installation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation).
- Risk framing to reuse verbatim where needed: community nodes "have full access to the machine that n8n runs on" and see workflow data — [Risks](https://docs.n8n.io/integrations/community-nodes/risks). Persistence/"missing packages" and `N8N_REINSTALL_MISSING_PACKAGES` — [Troubleshooting](https://docs.n8n.io/integrations/community-nodes/troubleshooting).
- Install matrix caveat for 3.0: "Self-hosted n8n will require a Docker-based deployment. n8n 3.0 will no longer support installations run using `npm` or `npx n8n`." — [v3.0 Breaking changes § Deployment](https://docs.n8n.io/changelog/v30-breaking-changes). The manual-install instructions above are already the in-container form, so they survive that change; a host-level `npm i -g n8n` path does not.

---

## 6. Classification of the local work

### 6.1 Required fixes (source-backed; blocking or observable defects)

| # | Item | Evidence |
|---|---|---|
| R1 | Add `documentationUrl` to the node description (`nodes/OpenPgp/OpenPgp.node.ts`, `INodeTypeBaseDescription`). Without it the Docs tab resolves to `https://www.npmjs.com/package/n8n-nodes-openpgp`, because there is also no codex file. | §3.2 sources; local absence at `OpenPgp.node.ts:79-99` |
| R2 | Credential icon must stop being a string literal to clear `icon-prefer-themed-variants` (warning): `credentials/OpenPgpPrivateKeyApi.credentials.ts:10` → `{ light, dark }` object. | §1.2 rule source + rule doc |
| R3 | Keep `documentationUrl` a **complete absolute URL** on the credential and the node (a slug/bare path renders no link for community packages). The settled per-surface anchors must be `https://…` URLs, not slugs. | §3.1, §3.2 |
| R4 | Any new icon file must land beside the node/credential file (so `n8n-node build` copies it) and be a `file:`-prefixed `.svg`/`.png` that exists, with square/near-square aspect. | §1.1, §1.2 sources |

No other *hard* defects were found: package registration, error wrapping, `pairedItem`, `usableAsTool`, `subtitle`, icon presence, credential password masking, credential `testedBy`, and the `n8n` object shape all satisfy their rules (§2, §4.4).

### 6.2 Advisory (docs guidance the linter does not enforce; the human decides)

| # | Item | Evidence |
|---|---|---|
| A1 | Binary-field naming: the docs ask for "Input data field name"/"Output data field name" instead of binary-property wording. Local names are `Input Binary Field` (`:168`, `:295`, `:452`), `Message Binary Field` (`:561`, `:637`), `Signature Binary Field` (`:598`), `Put Output File in Field` (`:252`, `:378`, `:499`). These display names are locked strings in the spec's parameter table, so changing them is a decision, not a fix. | §4.1 |
| A2 | Placeholder demo content uses prose ("the shared password") rather than camelCase examples; the `.svg` sources hardcode `#EA4B71` instead of a theme-aware value. | §1.1, §4.1 |
| A3 | Copy does not wrap parameter names in single quotation marks (e.g. "check the Passphrase"). | §4.1 |
| A4 | `[Item X]` casing: the local suffix is `[Item N]` (`OpenPgp.node.ts:684`); the guideline prose says `[Item X]` while its own example shows `[item 2]` — the doc is internally inconsistent, so this is cosmetic either way. | §4.3 |
| A5 | Repeated `displayName`s across mutually exclusive branches (e.g. `Operation`-scoped `Source Data` ×3, `Public Key(s)` ×3, `Text to Sign` ×2). The documented rule is about reusing *internal* names with one field visible at a time — satisfied — so this is a naming preference, not a defect. | §4.2, §4.4 |
| A6 | Operation `action` strings (`Decrypt data`, `Sign data`, `Verify a signature`) name the object ("data") but not a resource; the CRUD vocabulary in the guidelines assumes resource-style nodes. Single-resource node → judgement call. | §4.1 |
| A7 | No codex `<Node>.node.json` (docs "recommend" one). Adding one would give n8n a docs hint independent of `documentationUrl`, but its resources are node-level only and `documentationUrl` takes precedence in the editor. | §3.2 |

### 6.3 Intentional technical language (do **not** "simplify")

The "no tech jargon" guidance targets gratuitous jargon, not the third-party service's own vocabulary ("use the same terminology as the service the node connects to"). OpenPGP's vocabulary is the subject matter, so these should survive the copy pass: **Armored**, `BEGIN`/`END` lines, **Passphrase** (unlocks the key) vs **Password** (the shared secret) — a distinction [`CONTEXT.md`](../../CONTEXT.md) declares authoritative for this repo — **Public Key(s)**, **Key ID**, **Signature Type: Detached / Cleartext / Inline**, **Embedded**, **Hide Recipients**, **Compression** (None/ZIP/ZLIB), **Legacy Compatibility** (with its `allowMissingKeyFlags` / v5-entity / AEAD-v5 wording), `gpg --armor --export-secret-keys`, wildcard key ID. The credential name "OpenPGP Private Key API" is likewise forced by the lint naming rules (issue [#12](https://github.com/calvertjadon/n8n-nodes-openpgp/issues/12)) and its "API" is not a remote API — worth one clarifying clause in the README.

### 6.4 Given, not derived

The following are human decisions recorded for ticket #10 and are **not** source facts; this note only maps them onto the mechanisms that implement them:
task-first 250–400-line README; three-path install matrix; all four workflows as setup-required safe templates; recipe plus focused table per operation; original shield/keyhole and lock icons with true (distinct-art) adaptive-pink theme variants — note that "distinct art" is *stricter* than the lint rule, which accepts one file in both slots (§1.2); node and credential documentation URLs to separate stable README anchors; targeted strict UX fixes.

---

## 7. Source index

**n8n documentation (current site; old `/integrations/creating-nodes/…` paths now live under `/connect/create-nodes/…`)**
- UX guidelines — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines
- Node UI design — https://docs.n8n.io/connect/create-nodes/plan-your-node/node-ui-design
- Node UI elements — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/node-ui-elements
- Standard parameters — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/standard-parameters
- Code standards — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/code-standards
- Error handling — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/error-handling
- Credentials files — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/credentials-files
- Codex files — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/codex-files
- Choose node file structure — https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-node-file-structure
- Verification guidelines — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines
- Submit community nodes — https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes
- Node linter — https://docs.n8n.io/connect/create-nodes/test-your-node/node-linter
- Community nodes: installation and management — https://docs.n8n.io/integrations/community-nodes/installation-and-management (GUI, manual, environment-variable, verified pages hang off it)
- Risks — https://docs.n8n.io/integrations/community-nodes/risks
- Troubleshooting — https://docs.n8n.io/integrations/community-nodes/troubleshooting
- Env vars: Nodes — https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/nodes
- v3.0 breaking changes — https://docs.n8n.io/changelog/v30-breaking-changes

**Linter (first-party)**
- Plugin repo + rule list — https://github.com/n8n-io/n8n/tree/master/packages/%40n8n/eslint-plugin-community-nodes
- Installed version in this repo: 0.33.0 via `@n8n/node-cli` 0.49.1 — https://www.npmjs.com/package/@n8n/eslint-plugin-community-nodes/v/0.33.0

**n8n runtime/editor sources (master; `3.x` where noted)**
- `workflow/src/interfaces.ts`, `workflow/src/node-helpers.ts`
- `core/src/nodes-loader/directory-loader.ts`
- `cli/src/modules/community-packages/{community-packages.config.ts,community-packages.service.ts}`, `cli/src/modules/breaking-changes/rules/v3/unverified-packages.rule.ts`, `cli/src/services/credentials-tester.service.ts`
- `frontend/editor-ui/src/app/composables/useNodeDocsUrl.ts`, `app/utils/nodeIcon.ts`, `app/utils/nodeTypesUtils.ts`, `app/constants/urls.ts`, `app/components/NodeActionsList.vue`, `features/ndv/.../ParameterInputWrapper.vue`, `features/credentials/components/CredentialEdit/CredentialConfig.vue`
- `frontend/@n8n/design-system/src/components/N8nInputLabel/InputLabel.vue`, `src/directives/n8n-html.ts`, `src/css/_tokens.scss`
- `@n8n/node-cli/src/commands/{build.ts,cloud-support.ts}`, `src/configs/eslint.ts`, `README.md`
- `@n8n/constants/src/community-nodes.ts` (master = 1, `3.x` = 3)
- Starter manifest — https://github.com/n8n-io/n8n-nodes-starter/blob/master/package.json
