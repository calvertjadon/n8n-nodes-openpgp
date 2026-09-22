#!/usr/bin/env bash
#
# Smoke lane: installs the packed tarball into a real n8n container the way n8n's
# own installer does, then runs committed workflows through the node.
#
# Usage: npm run smoke            (against the pinned stable n8n image)
#        N8N_IMAGE=n8nio/n8n:v3-nightly npm run smoke
#
# Requires: docker, npm, python3.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# renovate: datasource=docker depName=n8nio/n8n
N8N_IMAGE=${N8N_IMAGE:-n8nio/n8n:2.39.10}

CONTAINER="openpgp-smoke-$$"
MOUNT=/work
# n8n resolves installed packages at <community nodes folder>/node_modules/<name>.
NODES_DIR=/home/node/.n8n/nodes/node_modules/n8n-nodes-openpgp
TARBALL=''

log() { printf '\n== %s\n' "$*"; }

cleanup() {
	docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
	if [ -n "$TARBALL" ] && [ -f "$REPO_ROOT/$TARBALL" ]; then
		rm -f "$REPO_ROOT/$TARBALL"
	fi
}
trap cleanup EXIT

log "Building and packing the package"
(cd "$REPO_ROOT" && npm run build >/dev/null)
TARBALL=$(cd "$REPO_ROOT" && npm pack --pack-destination "$REPO_ROOT" | tail -n 1)
echo "packed $TARBALL"

log "Starting $N8N_IMAGE"
# The server has to run once: n8n 2.40+ requires an active encryption key before
# the CLI can import credentials, and the server's bootstrap is what creates and
# registers it. It is started detached inside a shell rather than as the
# container's main process, so it can be stopped again — a second n8n process
# cannot share the task broker port.
docker run -d --name "$CONTAINER" \
	--entrypoint sh \
	-v "$REPO_ROOT:$MOUNT" \
	-e N8N_UNVERIFIED_PACKAGES_ENABLED=true \
	-e N8N_DIAGNOSTICS_ENABLED=false \
	-e N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=false \
	-e N8N_RESTRICT_FILE_ACCESS_TO="$MOUNT;/home/node/.n8n-files" \
	"$N8N_IMAGE" -c 'n8n start & sleep infinity' >/dev/null

ready=0
for _ in $(seq 1 90); do
	if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
		break
	fi
	if docker logs "$CONTAINER" 2>&1 | grep -q 'Editor is now accessible'; then
		ready=1
		break
	fi
	sleep 2
done
if [ "$ready" != 1 ]; then
	docker logs --tail 60 "$CONTAINER" 2>&1 || true
	echo "n8n did not become ready" >&2
	exit 1
fi

log "Stopping the server so the CLI owns the process"
# Bracket in the pattern so pkill does not match the shell running it.
docker exec "$CONTAINER" sh -c 'pkill -f "[n]ode /usr/local/bin/n8n" || true'
for _ in $(seq 1 30); do
	if ! docker exec "$CONTAINER" sh -c 'pgrep -f "[n]ode /usr/local/bin/n8n" >/dev/null'; then
		break
	fi
	sleep 1
done

log "Installing the tarball into $NODES_DIR"
# Mirrors n8n's own community-package installer: extract the tarball, drop the
# dev/peer/optional dependency fields, then npm install with those flags.
# The n8n image ships sh, not bash.
docker exec -i "$CONTAINER" sh -s -- "$MOUNT/$TARBALL" "$NODES_DIR" <<'INSTALL'
set -eu
tarball=$1
target=$2
rm -rf "$target"
mkdir -p "$target"
tar xzf "$tarball" -C "$target" --strip-components=1
node -e '
	const fs = require("fs");
	const path = process.argv[1];
	const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
	for (const field of ["devDependencies", "peerDependencies", "optionalDependencies"]) {
		delete pkg[field];
	}
	fs.writeFileSync(path, JSON.stringify(pkg, null, 2));
' "$target/package.json"
cd "$target"
npm install --audit=false --fund=false --bin-links=false --install-strategy=shallow --ignore-scripts=true --package-lock=false
# Workflows write their results here: the mounted checkout belongs to the runner
# user, which the container's node user cannot write to.
mkdir -p /home/node/.n8n-files/smoke
INSTALL

log "Importing credentials and workflows"
docker exec -e N8N_RUNNERS_ENABLED=false "$CONTAINER" n8n import:credentials --input "$MOUNT/test/fixtures/smoke/credentials.json" >/dev/null
for workflow in "$REPO_ROOT"/test/fixtures/smoke/*.json; do
	case "$workflow" in
	*/credentials.json) continue ;;
	esac
	docker exec -e N8N_RUNNERS_ENABLED=false "$CONTAINER" n8n import:workflow --input "$MOUNT/test/fixtures/smoke/$(basename "$workflow")" >/dev/null
done

# Executes one workflow, copies any written result out of the container and hands
# the raw output to the assertion script.
run_workflow() {
	local id=$1 expectation=$2 output_name=$3
	local output status
	set +e
	output=$(docker exec -e N8N_RUNNERS_ENABLED=false "$CONTAINER" n8n execute --id "$id" --raw-output 2>&1)
	status=$?
	if [ "$output_name" != '-' ]; then
		docker cp "$CONTAINER:/home/node/.n8n-files/smoke/$output_name" "$REPO_ROOT/.smoke-out/$output_name" >/dev/null 2>&1 || true
	fi
	set -e
	printf '%s' "$output" | python3 "$REPO_ROOT/test/smoke/assert.py" "$expectation" "$output_name" "$status"
}

log "Executing smoke workflows"
# The workflows write their binary results into .smoke-out, which the host reads
# back to compare real bytes.
rm -rf "$REPO_ROOT/.smoke-out"
mkdir -p "$REPO_ROOT/.smoke-out"
run_workflow openPgpSmokeKeyRoundTrip plaintext-round-trip key-round-trip.bin
run_workflow openPgpSmokePasswordRoundTrip plaintext-round-trip password-round-trip.bin
run_workflow openPgpSmokeSignVerify verified-with-keyid -
run_workflow openPgpSmokeVerifyInvalid invalid-signature-error -
run_workflow openPgpSmokeGpgDecrypt plaintext-round-trip gpg-decrypt.bin
run_workflow openPgpSmokeGpgVerify verified-cleartext -

log "Smoke lane passed"
