# n8n-nodes-openpgp

Encrypt, decrypt, sign, and verify workflow data with OpenPGP, using public keys or shared passwords.

This package provides one n8n community node with four operations:

- Encrypt Data
- Decrypt Message
- Sign Data
- Verify Signature

It handles text fields and n8n binary data. File workflows use the binary field `data` by default, so a Read/Write Files from Disk node can connect to OpenPGP without field remapping.

> [!WARNING]
> This is an unverified community package for self-hosted n8n. It is not available on n8n Cloud. n8n 3.0 changes `N8N_UNVERIFIED_PACKAGES_ENABLED` from `true` to `false`. Set it to `true` before upgrading if this package must keep loading, or use the pinned-checksum environment-managed installation described below.

## Installation

Package name:

```text
n8n-nodes-openpgp
```

### Settings

An Owner or Admin can install the package from the n8n editor:

1. Open **Settings**.
2. Select **Community Nodes**.
3. Select **Install**.
4. Enter `n8n-nodes-openpgp`.
5. Review and accept the warning for unverified community code.
6. Select **Install**.

The node appears as **OpenPGP** after installation.

### Manual container installation

Use this path for queue-mode deployments, private registries, or installations where the Community Nodes settings page is unavailable.

Open a shell in the running n8n container:

```sh
docker exec -it <n8n-container> sh
```

Install the package under the n8n user folder:

```sh
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install n8n-nodes-openpgp
```

Restart every n8n process that loads community nodes. In queue mode, install the package in the shared image or persistent user folder used by both the main and worker processes.

n8n 3.0 requires Docker-based self-hosting. Do not base a new deployment on a host-level `npm install -g n8n` or `npx n8n` setup.

### Environment-managed installation

n8n 2.21.0 and later can reconcile community packages from environment variables. Pin both the package version and registry integrity value:

```sh
npm view n8n-nodes-openpgp version
npm view n8n-nodes-openpgp dist.integrity
```

Configure the instance with those values:

```sh
N8N_COMMUNITY_PACKAGES_MANAGED_BY_ENV=true
N8N_COMMUNITY_PACKAGES='[{"name":"n8n-nodes-openpgp","version":"<version>","checksum":"<sha512-integrity>"}]'
```

Enabling environment-managed packages uninstalls community packages that are not listed in `N8N_COMMUNITY_PACKAGES`. Add every package that the instance must retain before restarting it.

For n8n 3.0, choose one of these policies:

- Set `N8N_UNVERIFIED_PACKAGES_ENABLED=true` to allow unverified npm packages.
- Keep `N8N_UNVERIFIED_PACKAGES_ENABLED=false` and supply the pinned checksum above.

If unverified packages are disabled and no checksum is supplied, n8n refuses the package. An environment-managed instance can fail during startup.

## Credential setup

Create an **OpenPGP Private Key API** credential when a workflow needs to decrypt with a private key or create a signature.

| Field | Value |
|---|---|
| Private Key | A complete armored private-key block, including its `BEGIN` and `END` lines |
| Passphrase | The secret that unlocks the private key, or empty for an unprotected key |

The credential stores both fields as secrets. Its **Test** button parses the key and, when needed, unlocks it with the Passphrase. This check runs locally inside n8n and makes no network request.

The node accepts armored text, not a binary key file. Export a key in armored form before pasting it:

```sh
gpg --armor --export-secret-keys <key-id>
```

Public keys can be exported with:

```sh
gpg --armor --export <key-id>
```

### Key input hardening

Copy each key from its `BEGIN` line through its `END` line. The parser repairs common transport damage before OpenPGP.js reads the value:

- Windows line endings
- escaped newlines copied from JSON, YAML, or environment variables
- flattened armor whose markers and body arrived on one line
- whitespace inserted into the encoded body
- stray armor headers such as `Version:`
- multiple public-key blocks in one field

Damage that changes the key material is not guessed around. The node reports the offending line or missing marker so the source can be corrected.

## Usage

OpenPGP processes every input item independently and returns a new item linked to its source. It does not overwrite the incoming JSON or binary object.

Most operations share these controls:

| Control | Purpose |
|---|---|
| Source Data | Read inline Text or a Binary field |
| Input Data Field Name | Binary input field, default `data` |
| Output As | Write Text or a Binary field |
| Output Data Field Name | Binary output field, default `data` |
| Options | Operation-specific armor, compression, recipient, and compatibility settings |

Text output must be valid UTF-8. Select Binary output when decrypted or verified content may contain arbitrary bytes.

### Encrypt

Use **Encrypt Data** to encrypt for one or more public keys or for a shared Password.

Typical file workflow:

```text
Read/Write Files from Disk (Read)
  -> OpenPGP (Encrypt Data)
  -> Read/Write Files from Disk (Write)
```

All three nodes use the binary field `data` by default.

| Setting | Key mode | Password mode |
|---|---|---|
| Encrypt Using | Public Keys | Password |
| Recipient input | One or more armored public keys | Shared Password |
| Also Sign | Optional, needs the OpenPGP Private Key API credential | Optional, needs the OpenPGP Private Key API credential |
| Text output | Armored OpenPGP message | Armored OpenPGP message |
| Binary output | Armored or raw packets | Armored or raw packets |

Key-mode encryption accepts several armored public-key blocks. Every corresponding private-key holder can decrypt the result.

Options:

- **Armor Output** writes ASCII armor instead of raw OpenPGP packets for Binary output. Text output is always armored.
- **Compression** offers None, ZIP, and ZLIB. In key mode, recipient preferences can prevent the selected compression algorithm from being used.
- **Hide Recipients** writes wildcard recipient key IDs. A decrypting implementation must try the available private keys.
- **Legacy Compatibility** enables the compatibility settings described below.

Binary encryption preserves the input filename inside the OpenPGP literal-data packet. The output filename receives `.asc` for armored data or `.pgp` for raw packets.

### Decrypt

Use **Decrypt Message** with either the OpenPGP Private Key API credential or the shared Password used during encryption.

| Setting | Behavior |
|---|---|
| Decrypt Using | Private Key (Credential) or Password |
| Public Key(s) | Optional verification keys for a signature carried by the message |
| Require Valid Signature | Reject unsigned data and signatures that do not match a supplied public key |
| Output As | UTF-8 Text or Binary |

`Public Key(s)` is independent of the decryption method. Password-encrypted messages can still carry signatures, and private-key-encrypted messages can be decrypted without checking a signer.

When verification keys are supplied, the result includes:

| Field | Meaning |
|---|---|
| `signed` | The message contains at least one signature packet |
| `verified` | At least one signature matches a supplied public key |
| `keyID` | Lowercase hexadecimal key ID for the first verified signature, or `null` |

Signature reporting requires `Public Key(s)`. Leaving the field empty decrypts the message without claiming who signed it.

Binary output restores the filename embedded in the OpenPGP message. If the message has no filename, the node uses `data`.

### Sign

Use **Sign Data** with an OpenPGP Private Key API credential.

| Signature Type | Input | Result |
|---|---|---|
| Detached | Text or Binary | A separate signature to store or transmit beside the original data |
| Cleartext | Text only | Readable text wrapped in an armored signature |
| Inline | Text or Binary | One OpenPGP message containing the data and signature |

Detached signatures are the default. They do not contain the original content, so verification needs both the message and signature.

Text output is armored. Binary output can be armored or raw for Detached and Inline signatures. Cleartext signatures always use Text output.

### Verify

Use **Verify Signature** with one or more armored public keys.

| Signature Type | Required inputs | Result |
|---|---|---|
| Detached | Message plus separate signature | Signature status only |
| Embedded | Cleartext or inline signed message | Signature status and recovered text when available |

The output is JSON:

```json
{
  "verified": true,
  "signed": true,
  "keyID": "0123456789abcdef",
  "data": "Recovered text for supported embedded messages"
}
```

**Throw on Invalid Signature** defaults to on. Leave it on when an invalid or missing signature must stop the workflow. Turn it off to branch on the `verified` field instead.

Verify recovers `data` only from cleartext signatures and text-format literal packets. It does not return binary literal content. Use **Decrypt Message** with a key when a signed and encrypted binary message must be recovered.

## Shared options and output behavior

### Legacy Compatibility

**Legacy Compatibility** is off by default. Enable it only for material that modern OpenPGP defaults reject.

It enables these OpenPGP.js settings for that operation:

- `allowMissingKeyFlags`
- `enableParsingV5Entities`
- `parseAEADEncryptedV4KeysAsLegacy`

`parseAEADEncryptedV4KeysAsLegacy` is correct only for v4 keys that OpenPGP.js v5 encrypted with AEAD. It is not a general repair option for malformed or unknown key formats.

The option applies per execution. The node never mutates the process-wide OpenPGP.js configuration.

### Binary output

Binary operations use n8n's binary-data helpers, so they work with memory, filesystem, database, and supported external binary-data modes.

| Operation | MIME type | Filename behavior |
|---|---|---|
| Encrypt Data | `application/pgp-encrypted` | Adds `.asc` or `.pgp` |
| Decrypt Message | `application/octet-stream` | Restores the embedded filename when present |
| Sign Data | `application/pgp-signature` | Adds `.sig`, `.asc`, or `.pgp` as appropriate |

### Errors and n8n's On Error setting

Errors identify the input item and the field that needs attention. They also include a description of the corrective action.

The node follows n8n's **On Error** setting. With Continue selected, a failing item produces an error item while later inputs continue processing.

## Example workflows

The examples live in the repository rather than the npm runtime package. Download the JSON file, then use **Import from File** in n8n.

| Example | Setup |
|---|---|
| [File encryption](https://github.com/calvertjadon/n8n-nodes-openpgp/blob/main/examples/file-encrypt.json) | Set input/output paths and paste recipient public keys |
| [Password round trip](https://github.com/calvertjadon/n8n-nodes-openpgp/blob/main/examples/password-round-trip.json) | Runs with an obvious demo-only password; replace it before adapting the workflow |
| [Detached sign and verify](https://github.com/calvertjadon/n8n-nodes-openpgp/blob/main/examples/detached-sign-and-verify.json) | Attach a credential and paste its public key |
| [Encrypt and sign](https://github.com/calvertjadon/n8n-nodes-openpgp/blob/main/examples/encrypt-and-sign.json) | Attach a credential and paste recipient public keys |

No example contains a private key or a production password. Credential-dependent examples intentionally remain incomplete until configured.

## Security and verification status

Community nodes run with the permissions of the n8n process and can read workflow data. Review the package and pin versions before using it with sensitive material.

This package is unverified because it ships `openpgp` as a runtime dependency. The n8n scanner reports:

```text
@n8n/community-nodes/no-runtime-dependencies
```

The dependency is deliberate. n8n's installer removes optional dependencies, and bundling OpenPGP.js cannot satisfy the scanner's source and license requirements. `openpgp` is pinned and exercised against committed GnuPG interoperability fixtures.

The scanner reports no additional finding for provenance, restricted imports, lifecycle scripts, package manifest, license, or naming. Releases are published from GitHub Actions through npm Trusted Publishers with SLSA provenance and no long-lived npm token.

## Known limitations

- The package is for self-hosted n8n. n8n Cloud cannot install it.
- Version 1 buffers whole files in memory. Streaming is not implemented.
- Verify does not recover binary literal content.
- Key generation, key discovery, revocation, and key management are outside this node's scope.
- Binary key files cannot be pasted directly. Export armored text first.
- Key-mode compression is subject to recipient preferences.
- Signature reporting during decryption requires public verification keys.
- AEAD protection is not exposed because enabling it would reduce interoperability with other OpenPGP implementations.

## Development

Requirements:

- Node.js 22.22.0 or later
- npm
- Docker for smoke tests
- GnuPG for regenerating interoperability fixtures

Install and check the project:

```sh
npm ci
npm run lint:ci
npm run build
npm test
npm run smoke
```

Start an n8n development instance:

```sh
npm run dev
```

The package source, issue tracker, and release history are at [calvertjadon/n8n-nodes-openpgp](https://github.com/calvertjadon/n8n-nodes-openpgp).

## Support

Report reproducible defects through [GitHub Issues](https://github.com/calvertjadon/n8n-nodes-openpgp/issues). Include the n8n version, package version, selected operation, input mode, and the complete error message. Never attach private keys, Passphrases, Passwords, or decrypted sensitive data.

## License

[MIT](LICENSE)
