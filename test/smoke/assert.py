"""Asserts the outcome of one smoke-lane workflow execution.

Usage: assert.py <expectation> <output-name|-> <n8n-exit-status>   (output on stdin)

`n8n execute --raw-output` prints its own startup lines before the execution
JSON, so the JSON is located first. Binary results are compared as bytes from
the file the workflow wrote through Write Binary File: n8n's binary modes
(filesystem, s3, database) hide the bytes behind an id, so reading the CLI's
JSON would compare base64 of a mode marker instead.
"""

import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "test" / "fixtures"
OUTPUT_DIR = REPO_ROOT / ".smoke-out"


def execution(output: str) -> dict:
	"""The workflow execution record, without the CLI's startup and trailing lines."""
	start = re.search(r"^\{$", output, re.MULTILINE)
	if start is None:
		raise AssertionError(f"no execution JSON in the output:\n{output}")
	record, _ = json.JSONDecoder().raw_decode(output[start.start():])
	return record


def node_items(record: dict, node_name: str) -> list:
	run_data = record["data"]["resultData"]["runData"]
	if node_name not in run_data:
		raise AssertionError(f"node {node_name!r} did not run; ran: {sorted(run_data)}")
	return run_data[node_name][0]["data"]["main"][0]


def written_bytes(output_name: str) -> bytes:
	path = OUTPUT_DIR / output_name
	assert path.is_file(), f"the workflow did not write {path}"
	return path.read_bytes()


def expect_plaintext_round_trip(record: dict, output_name: str, status: int) -> None:
	assert status == 0, f"n8n exited with {status}"
	item = node_items(record, "Decrypt")[0]
	assert item["json"].get("fileName") == "plaintext.txt", (
		f"file name was not recovered: {item['json'].get('fileName')!r}"
	)
	expected = (FIXTURES / "messages" / "plaintext.txt").read_bytes()
	assert written_bytes(output_name) == expected, (
		"the decrypted file does not match the plaintext fixture"
	)


def expect_verified_with_keyid(record: dict, output_name: str, status: int) -> None:
	assert status == 0, f"n8n exited with {status}"
	item = node_items(record, "Verify")[0]
	key_id = (FIXTURES / "keys" / "rsa-keyid.txt").read_text().strip().lower()
	assert item["json"].get("verified") is True, f"signature was not verified: {item['json']}"
	assert item["json"].get("signed") is True, f"signature was not reported: {item['json']}"
	assert item["json"].get("keyID") == key_id, (
		f"signer key ID mismatch: {item['json'].get('keyID')!r} != {key_id!r}"
	)


def expect_verified_cleartext(record: dict, output_name: str, status: int) -> None:
	assert status == 0, f"n8n exited with {status}"
	item = node_items(record, "Verify")[0]
	assert item["json"].get("verified") is True, f"cleartext signature was not verified: {item['json']}"
	assert item["json"].get("data", "").startswith("OpenPGP fixture plaintext."), (
		f"cleartext content was not recovered: {item['json'].get('data')!r}"
	)


def expect_invalid_signature_error(record: dict, output_name: str, status: int) -> None:
	assert status != 0, "the workflow failed as expected, but n8n exited with 0"
	error = record["data"]["resultData"].get("error")
	assert error, f"the workflow should have failed, but reported no error: {json.dumps(record)[:400]}"
	message = str(error.get("message", ""))
	assert "Signature did not verify — the message was not signed by any provided Public Key(s)." in message, (
		f"canonical error copy missing from the execution error: {message!r}"
	)
	assert "[Item 0]" in message, f"the item index is missing from the error: {message!r}"


EXPECTATIONS = {
	"plaintext-round-trip": expect_plaintext_round_trip,
	"verified-with-keyid": expect_verified_with_keyid,
	"verified-cleartext": expect_verified_cleartext,
	"invalid-signature-error": expect_invalid_signature_error,
}


def main() -> int:
	if len(sys.argv) != 4:
		print(__doc__, file=sys.stderr)
		return 2
	name, output_name, status = sys.argv[1], sys.argv[2], int(sys.argv[3])
	expectation = EXPECTATIONS.get(name)
	if expectation is None:
		print(f"unknown expectation {name!r}; known: {', '.join(sorted(EXPECTATIONS))}", file=sys.stderr)
		return 2
	output = sys.stdin.read()
	try:
		record = execution(output)
		expectation(record, output_name, status)
	except (AssertionError, KeyError) as failure:
		print(f"FAIL ({name}): {failure}\n--- output ---\n{output}", file=sys.stderr)
		return 1
	print(f"PASS ({name})")
	return 0


if __name__ == "__main__":
	sys.exit(main())
