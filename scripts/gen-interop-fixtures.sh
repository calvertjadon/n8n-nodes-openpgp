#!/usr/bin/env bash
#
# Regenerates the GnuPG interoperability fixtures committed under test/fixtures/.
#
# The fixtures exist so the test layer notices when OpenPGP.js changes the wire
# behaviour this node depends on: every ciphertext and signature here is produced
# by GnuPG, and every node output is checked with GnuPG.
#
# Requirements: gpg >= 2.2 (loopback pinentry), openssl-free (uses printf for bytes).
# Usage: bash scripts/gen-interop-fixtures.sh
#
# Key material is random per run, so re-running rewrites the fixtures and the
# manifest together. Nothing outside test/fixtures/ is touched.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FIXTURES="$REPO_ROOT/test/fixtures"

RSA_PASSPHRASE='rsa-fixture-passphrase'
CURVE_PASSPHRASE='curve-fixture-passphrase'

GNUPGHOME=$(mktemp -d)
export GNUPGHOME
trap 'rm -rf "$GNUPGHOME"' EXIT
chmod 700 "$GNUPGHOME"

gpg_silent() {
	gpg --batch --yes --pinentry-mode loopback "$@"
}

# Empty passphrases create unprotected keys; gpg refuses to prompt in batch mode.
gpg_keygen() {
	local passphrase=$1
	shift
	gpg_silent --passphrase "$passphrase" "$@"
}

rm -rf "$FIXTURES"
mkdir -p "$FIXTURES"/keys "$FIXTURES"/messages "$FIXTURES"/ciphertexts "$FIXTURES"/signatures "$FIXTURES"/smoke

# --- keypairs -----------------------------------------------------------------
# RSA: the classic v4 RSA key. Curve: ed25519 primary with a cv25519 subkey.
generate_key() {
	local uid=$1 type=$2 passphrase=$3
	if [ "$type" = 'rsa2048' ]; then
		gpg_keygen "$passphrase" --quick-generate-key "$uid" rsa2048 sign,encrypt never
	else
		local fpr
		gpg_keygen "$passphrase" --quick-generate-key "$uid" ed25519 sign never
		fpr=$(fingerprint "$uid")
		gpg_keygen "$passphrase" --quick-add-key "$fpr" cv25519 encrypt never
	fi
}

fingerprint() {
	gpg --list-keys --with-colons "$1" | awk -F: '/^fpr:/ { print $10; exit }'
}

key_id() {
	gpg --list-keys --with-colons "$1" | awk -F: '/^pub:/ { print $5; exit }'
}

export_pair() {
	local name=$1 uid=$2 passphrase=$3
	local fpr
	fpr=$(fingerprint "$uid")
	gpg_silent --armor --export "$fpr" >"$FIXTURES/keys/$name-public.asc"
	gpg_silent --passphrase "$passphrase" --armor --export-secret-keys "$fpr" >"$FIXTURES/keys/$name-private.asc"
	printf '%s\n' "$fpr" >"$FIXTURES/keys/$name-fingerprint.txt"
	printf '%s\n' "$(key_id "$uid")" >"$FIXTURES/keys/$name-keyid.txt"
}

generate_key 'OpenPGP Fixtures RSA <rsa@fixtures.openpgp.invalid>' rsa2048 ''
generate_key 'OpenPGP Fixtures RSA Protected <rsa-protected@fixtures.openpgp.invalid>' rsa2048 "$RSA_PASSPHRASE"
generate_key 'OpenPGP Fixtures Curve <curve@fixtures.openpgp.invalid>' ed25519 ''
generate_key 'OpenPGP Fixtures Curve Protected <curve-protected@fixtures.openpgp.invalid>' ed25519 "$CURVE_PASSPHRASE"
generate_key 'OpenPGP Fixtures Stranger <stranger@fixtures.openpgp.invalid>' ed25519 ''

export_pair rsa 'OpenPGP Fixtures RSA <rsa@fixtures.openpgp.invalid>' ''
export_pair rsa-protected 'OpenPGP Fixtures RSA Protected <rsa-protected@fixtures.openpgp.invalid>' "$RSA_PASSPHRASE"
export_pair curve 'OpenPGP Fixtures Curve <curve@fixtures.openpgp.invalid>' ''
export_pair curve-protected 'OpenPGP Fixtures Curve Protected <curve-protected@fixtures.openpgp.invalid>' "$CURVE_PASSPHRASE"
export_pair stranger 'OpenPGP Fixtures Stranger <stranger@fixtures.openpgp.invalid>' ''

# --- messages -----------------------------------------------------------------
# LF text, and a blob that is deliberately not valid UTF-8.
printf 'OpenPGP fixture plaintext.\nSecond line with trailing spaces.   \nThird line.\n' >"$FIXTURES/messages/plaintext.txt"
printf '\x00\x01\x02\xfe\xff\x80PNG-not-really\x00\x7f' >"$FIXTURES/messages/binary.bin"

RSA_FPR=$(cat "$FIXTURES/keys/rsa-fingerprint.txt")
CURVE_FPR=$(cat "$FIXTURES/keys/curve-fingerprint.txt")
RSA_PROTECTED_FPR=$(cat "$FIXTURES/keys/rsa-protected-fingerprint.txt")

# --- ciphertexts --------------------------------------------------------------
# gpg embeds the input file name in the literal data packet when encrypting a file.
gpg_silent --armor --output "$FIXTURES/ciphertexts/rsa-armored.asc" --encrypt --recipient "$RSA_FPR" "$FIXTURES/messages/plaintext.txt"
gpg_silent --output "$FIXTURES/ciphertexts/rsa-binary.pgp" --encrypt --recipient "$RSA_FPR" "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --output "$FIXTURES/ciphertexts/curve-armored.asc" --encrypt --recipient "$CURVE_FPR" "$FIXTURES/messages/binary.bin"
gpg_silent --armor --throw-keyids --output "$FIXTURES/ciphertexts/hidden-recipient.asc" --encrypt --recipient "$RSA_FPR" "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --textmode --output "$FIXTURES/ciphertexts/textmode-armored.asc" --encrypt --recipient "$RSA_FPR" "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --compress-algo zip --output "$FIXTURES/ciphertexts/compressed-zip-armored.asc" --encrypt --recipient "$RSA_FPR" "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --local-user "$RSA_FPR" --sign --encrypt --recipient "$RSA_FPR" --output "$FIXTURES/ciphertexts/rsa-signed-armored.asc" "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --output "$FIXTURES/ciphertexts/rsa-protected-armored.asc" --encrypt --recipient "$RSA_PROTECTED_FPR" "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --pinentry-mode loopback --passphrase 'shared-fixture-password' --symmetric --output "$FIXTURES/ciphertexts/password-armored.asc" "$FIXTURES/messages/plaintext.txt"
gpg_silent --pinentry-mode loopback --passphrase 'shared-fixture-password' --symmetric --output "$FIXTURES/ciphertexts/password-binary.pgp" "$FIXTURES/messages/plaintext.txt"

# --- signatures ---------------------------------------------------------------
gpg_silent --armor --output "$FIXTURES/signatures/rsa-detached.asc" --detach-sign "$FIXTURES/messages/plaintext.txt"
gpg_silent --output "$FIXTURES/signatures/rsa-detached.sig" --detach-sign "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --output "$FIXTURES/signatures/rsa-cleartext.asc" --clearsign "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --output "$FIXTURES/signatures/rsa-inline.asc" --sign "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --textmode --output "$FIXTURES/signatures/rsa-inline-textmode.asc" --sign "$FIXTURES/messages/plaintext.txt"
gpg_silent --armor --output "$FIXTURES/signatures/curve-detached.asc" --local-user "$CURVE_FPR" --detach-sign "$FIXTURES/messages/binary.bin"
gpg_silent --armor --output "$FIXTURES/signatures/stranger-detached.asc" --local-user "$(cat "$FIXTURES/keys/stranger-fingerprint.txt")" --detach-sign "$FIXTURES/messages/plaintext.txt"

# --- smoke-lane fixtures ------------------------------------------------------
# Credentials and workflows for the container smoke lane. The workflows carry the
# public keys inline, so they are regenerated with the key material. Inputs are
# read from /work, where test/smoke/run.sh mounts the repository, and results are
# written inside the container (its own file area is always writable) for the
# harness to copy out.
python3 - "$FIXTURES" <<'PY'
import json
import pathlib
import sys

fixtures = pathlib.Path(sys.argv[1])
read = lambda *parts: (fixtures.joinpath(*parts)).read_text()

credentials = [
	{
		'id': 'openPgpFixtureKey',
		'name': 'OpenPGP Fixture Key',
		'type': 'openPgpPrivateKeyApi',
		'data': {'privateKey': read('keys', 'rsa-private.asc'), 'passphrase': ''},
	},
	{
		'id': 'openPgpStrangerKey',
		'name': 'OpenPGP Stranger Key',
		'type': 'openPgpPrivateKeyApi',
		'data': {'privateKey': read('keys', 'stranger-private.asc'), 'passphrase': ''},
	},
]
(fixtures / 'smoke/credentials.json').write_text(json.dumps(credentials, indent=2) + '\n')

RSA_PUBLIC = read('keys', 'rsa-public.asc')
CREDENTIAL = {'openPgpPrivateKeyApi': {'id': 'openPgpFixtureKey', 'name': 'OpenPGP Fixture Key'}}
STRANGER_CREDENTIAL = {
	'openPgpPrivateKeyApi': {'id': 'openPgpStrangerKey', 'name': 'OpenPGP Stranger Key'}
}


def positioned(nodes):
	# Every node is placed on its own column, so the committed workflows open as
	# a readable graph in the editor instead of a stack at the origin.
	for index, node in enumerate(nodes):
		node['position'] = [index * 220, 0]
	return nodes


def merge_node(node_id, name='Merge'):
	# Combine-by-position keeps both binary fields, so Verify sees the message
	# and the signature on one item.
	return {
		'parameters': {'mode': 'combine', 'combineBy': 'combineByPosition', 'numberInputs': 2, 'options': {}},
		'id': node_id,
		'name': name,
		'type': 'n8n-nodes-base.merge',
		'typeVersion': 3,
		'position': [0, 0],
	}


def write_file(node_id, path, name='Write File'):
	return {
		'parameters': {'operation': 'write', 'fileName': path, 'dataPropertyName': 'data', 'options': {}},
		'id': node_id,
		'name': name,
		'type': 'n8n-nodes-base.readWriteFile',
		'typeVersion': 1,
		'position': [0, 0],
	}


# `readWriteFile` is the built-in that exists on every n8n this lane runs
# against; `readBinaryFile`/`writeBinaryFile` were removed in 2.40.
def read_file(node_id, path, name='Read File'):
	return {
		'parameters': {'operation': 'read', 'fileSelector': path, 'dataPropertyName': 'data', 'options': {}},
		'id': node_id,
		'name': name,
		'type': 'n8n-nodes-base.readWriteFile',
		'typeVersion': 1,
		'position': [0, 0],
	}


def openpgp(node_id, name, parameters, credentials=None):
	node = {
		'parameters': parameters,
		'id': node_id,
		'name': name,
		'type': 'n8n-nodes-openpgp.openPgp',
		'typeVersion': 1,
		'position': [0, 0],
	}
	if credentials is not None:
		node['credentials'] = credentials
	return node


def trigger(node_id='trigger'):
	# n8n's CLI refuses to execute a workflow without an explicit start node, and
	# the manual trigger is one of the start nodes it accepts.
	return {
		'parameters': {},
		'id': node_id,
		'name': 'When clicking Execute workflow',
		'type': 'n8n-nodes-base.manualTrigger',
		'typeVersion': 1,
		'position': [0, 0],
	}


def chain(names):
	return {
		names[index]: {'main': [[{'node': names[index + 1], 'type': 'main', 'index': 0}]]}
		for index in range(len(names) - 1)
	}


def workflow(workflow_id, name, nodes, connections=None):
	nodes = positioned([trigger()] + nodes)
	names = [node['name'] for node in nodes]
	return {
		'id': workflow_id,
		'name': name,
		'nodes': nodes,
		'connections': connections if connections is not None else chain(names),
		'settings': {},
	}


def link(source, *targets):
	return {source: {'main': [[{'node': target, 'type': 'main', 'index': 0}] for target in targets]}}


PLAINTEXT = '/work/test/fixtures/messages/plaintext.txt'
workflows = {
	'key-round-trip': workflow(
		'openPgpSmokeKeyRoundTrip',
		'smoke: key round trip',
		[
			read_file('read-plaintext', PLAINTEXT),
			openpgp(
				'encrypt',
				'Encrypt',
				{
					'operation': 'encrypt',
					'sourceData': 'binary',
					'encryptUsing': 'publicKeys',
					'publicKeys': RSA_PUBLIC,
					'outputAs': 'binary',
				},
			),
			openpgp(
				'decrypt',
				'Decrypt',
				{
					'operation': 'decrypt',
					'sourceData': 'binary',
					'decryptUsing': 'privateKey',
					'outputAs': 'binary',
				},
				CREDENTIAL,
			),
			write_file('write-result', '/home/node/.n8n-files/smoke/key-round-trip.bin'),
		],
	),
	'password-round-trip': workflow(
		'openPgpSmokePasswordRoundTrip',
		'smoke: password round trip',
		[
			read_file('read-plaintext', PLAINTEXT),
			openpgp(
				'encrypt',
				'Encrypt',
				{
					'operation': 'encrypt',
					'sourceData': 'binary',
					'encryptUsing': 'password',
					'password': 'smoke-password',
					'outputAs': 'binary',
					'options': {'armorOutput': False},
				},
			),
			openpgp(
				'decrypt',
				'Decrypt',
				{
					'operation': 'decrypt',
					'sourceData': 'binary',
					'decryptUsing': 'password',
					'password': 'smoke-password',
					'outputAs': 'binary',
				},
			),
			write_file('write-result', '/home/node/.n8n-files/smoke/password-round-trip.bin'),
		],
	),
	'sign-verify': workflow(
		'openPgpSmokeSignVerify',
		'smoke: sign and verify',
		[
			read_file('read-plaintext', PLAINTEXT),
			openpgp(
				'sign',
				'Sign',
				{
					'operation': 'sign',
					'signatureType': 'detached',
					'sourceData': 'binary',
					'outputAs': 'binary',
					'outputBinaryFieldName': 'signature',
					'options': {'armorOutput': False},
				},
				CREDENTIAL,
			),
			merge_node('merge'),
			openpgp(
				'verify',
				'Verify',
				{
					'operation': 'verify',
					'signatureType': 'detached',
					'messageSource': 'binary',
					'signatureSource': 'binary',
					'messageBinaryPropertyName': 'data',
					'signatureBinaryPropertyName': 'signature',
					'publicKeys': RSA_PUBLIC,
				},
			),
		],
		{
			**link('When clicking Execute workflow', 'Read File'),
			'Read File': {
				'main': [
					[
						{'node': 'Sign', 'type': 'main', 'index': 0},
						{'node': 'Merge', 'type': 'main', 'index': 1},
					],
				],
			},
			**link('Sign', 'Merge'),
			**link('Merge', 'Verify'),
		},
	),
	'verify-invalid': workflow(
		'openPgpSmokeVerifyInvalid',
		'smoke: verify with the wrong key fails',
		[
			read_file('read-plaintext', PLAINTEXT),
			openpgp(
				'sign',
				'Sign',
				{
					'operation': 'sign',
					'signatureType': 'detached',
					'sourceData': 'binary',
					'outputAs': 'binary',
					'outputBinaryFieldName': 'signature',
					'options': {'armorOutput': False},
				},
				STRANGER_CREDENTIAL,
			),
			merge_node('merge'),
			openpgp(
				'verify',
				'Verify',
				{
					'operation': 'verify',
					'signatureType': 'detached',
					'messageSource': 'binary',
					'signatureSource': 'binary',
					'messageBinaryPropertyName': 'data',
					'signatureBinaryPropertyName': 'signature',
					'publicKeys': RSA_PUBLIC,
				},
			),
		],
		{
			**link('When clicking Execute workflow', 'Read File'),
			'Read File': {
				'main': [
					[
						{'node': 'Sign', 'type': 'main', 'index': 0},
						{'node': 'Merge', 'type': 'main', 'index': 1},
					],
				],
			},
			**link('Sign', 'Merge'),
			**link('Merge', 'Verify'),
		},
	),
	'gpg-decrypt': workflow(
		'openPgpSmokeGpgDecrypt',
		'smoke: decrypt a GnuPG message',
		[
			read_file('read-ciphertext', '/work/test/fixtures/ciphertexts/rsa-armored.asc'),
			openpgp(
				'decrypt',
				'Decrypt',
				{
					'operation': 'decrypt',
					'sourceData': 'binary',
					'decryptUsing': 'privateKey',
					'outputAs': 'binary',
				},
				CREDENTIAL,
			),
			write_file('write-result', '/home/node/.n8n-files/smoke/gpg-decrypt.bin'),
		],
	),
	'gpg-verify': workflow(
		'openPgpSmokeGpgVerify',
		'smoke: verify a GnuPG cleartext signature',
		[
			read_file('read-cleartext', '/work/test/fixtures/signatures/rsa-cleartext.asc'),
			openpgp(
				'verify',
				'Verify',
				{
					'operation': 'verify',
					'signatureType': 'embedded',
					'sourceData': 'binary',
					'publicKeys': RSA_PUBLIC,
				},
			),
		],
	),
}

for name, definition in workflows.items():
	(fixtures / 'smoke' / f'{name}.json').write_text(json.dumps(definition, indent=2) + '\n')
PY

# --- manifest -----------------------------------------------------------------
{
	echo '# Interoperability fixtures'
	echo
	echo 'Generated by `scripts/gen-interop-fixtures.sh`; re-run that script to replace'
	echo 'them. Key material is random per run, so the fingerprints below change.'
	echo
	echo '## Keys'
	echo
	echo '| Fixture | Fingerprint | Key ID | Passphrase |'
	echo '|---|---|---|---|'
	for name in rsa rsa-protected curve curve-protected stranger; do
		printf '| %s | `%s` | `%s` | %s |\n' \
			"$name" \
			"$(cat "$FIXTURES/keys/$name-fingerprint.txt")" \
			"$(cat "$FIXTURES/keys/$name-keyid.txt")" \
			"$(case "$name" in rsa-protected) echo "\`$RSA_PASSPHRASE\`";; curve-protected) echo "\`$CURVE_PASSPHRASE\`";; *) echo 'none';; esac)"
	done
	echo
	echo '## Files'
	echo
	echo '| File | Produced by |'
	echo '|---|---|'
	echo '| `messages/plaintext.txt` | `printf`, LF line endings |'
	echo '| `messages/binary.bin` | `printf`, contains bytes that are not valid UTF-8 |'
	echo '| `ciphertexts/*` | `gpg --encrypt` / `gpg --symmetric` |'
	echo '| `signatures/*` | `gpg --detach-sign` / `--clearsign` / `--sign` |'
	echo
	echo '## Commands'
	echo
	echo '```'
	echo '# keys'
	echo "gpg --batch --pinentry-mode loopback --passphrase '<passphrase>' --quick-generate-key '<uid>' rsa2048 sign,encrypt never"
	echo "gpg --batch --pinentry-mode loopback --passphrase '<passphrase>' --quick-generate-key '<uid>' ed25519 sign never"
	echo "gpg --batch --pinentry-mode loopback --passphrase '<passphrase>' --quick-add-key <fpr> cv25519 encrypt never"
	echo 'gpg --batch --armor --export <fpr> > keys/<name>-public.asc'
	echo 'gpg --batch --pinentry-mode loopback --passphrase <passphrase> --armor --export-secret-keys <fpr> > keys/<name>-private.asc'
	echo
	echo '# ciphertexts'
	echo 'gpg --batch --armor --encrypt --recipient <fpr> messages/plaintext.txt'
	echo 'gpg --batch --encrypt --recipient <fpr> messages/plaintext.txt'
	echo 'gpg --batch --armor --throw-keyids --encrypt --recipient <fpr> messages/plaintext.txt'
	echo 'gpg --batch --armor --textmode --encrypt --recipient <fpr> messages/plaintext.txt'
	echo 'gpg --batch --armor --compress-algo zip --encrypt --recipient <fpr> messages/plaintext.txt'
	echo "gpg --batch --armor --pinentry-mode loopback --passphrase 'shared-fixture-password' --symmetric messages/plaintext.txt"
	echo
	echo '# signatures'
	echo 'gpg --batch --armor --detach-sign messages/plaintext.txt'
	echo 'gpg --batch --detach-sign messages/plaintext.txt'
	echo 'gpg --batch --armor --clearsign messages/plaintext.txt'
	echo 'gpg --batch --armor --sign messages/plaintext.txt'
	echo '```'
	echo
	echo '## Smoke lane'
	echo
	echo '`smoke/credentials.json` is an `n8n import:credentials` payload holding the'
	echo 'unprotected RSA private key.'
} >"$FIXTURES/MANIFEST.md"

echo "Fixtures written to $FIXTURES"
