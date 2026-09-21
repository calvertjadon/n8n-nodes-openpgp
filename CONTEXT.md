# n8n-nodes-openpgp

Domain language for the OpenPGP community node for n8n: encrypting, decrypting, signing, and verifying workflow data with OpenPGP.js.

## Language

### Data sources

**Source Data**:
The per-action choice of where input is read from — inline text, or a binary property of the input item.
_Avoid_: Input Type, data source

**Armored**:
The ASCII-text encoding of OpenPGP data (`-----BEGIN PGP …-----` blocks). Armored output is text; binary output is raw OpenPGP bytes.
_Avoid_: ASCII-armored, text mode, PEM

**Hide Recipients**:
Encrypting so the ciphertext does not reveal which keys it was encrypted for (OpenPGP wildcard key ID).
_Avoid_: anonymous encryption, hidden key IDs

### Signatures

**Detached signature**:
A signature transmitted separately from the message it signs.
_Avoid_: separate signature

**Cleartext signature**:
A signed message whose content stays human-readable text.
_Avoid_: signed text, clearsign

**Inline signature**:
A signature embedded in a binary OpenPGP message together with its content (a one-pass signed message).
_Avoid_: attached signature

**Embedded signature**:
Verify's umbrella term for a signature that travels with its message — either cleartext or inline.
_Avoid_: attached signature, integral signature

### Secrets

**Password**:
A symmetric secret supplied as a node parameter, used in Password mode.
_Avoid_: passphrase

**Passphrase**:
The secret that unlocks the credential's private key. Never encrypts message data.
_Avoid_: password

**Password mode**:
Encryption or decryption with a shared Password instead of keys.
_Avoid_: symmetric mode

**OpenPGP Private Key**:
The credential type holding an armored private key and its Passphrase.
_Avoid_: PGP credential, key credential

### Compatibility

**Legacy Compatibility**:
The opt-in that lets the node parse OpenPGP material modern defaults reject — keys without usage flags, non-standard v5 entities, and v4 keys AEAD-encrypted by OpenPGP.js v5. Off by default.
_Avoid_: compat mode, strict mode
