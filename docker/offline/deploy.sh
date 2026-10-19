#!/usr/bin/env bash
# Run on the offline server. Only Docker + Compose and standard Linux tools needed.
set -Eeuo pipefail
umask 077
ARCHIVE="" DESTINATION="$PWD/simulator112-offline" RESTORE=0 STAGE=""
PROJECT="${SIMULATOR_PROJECT:-simulator112_offline}"
usage() {
  cat <<'HELP'
Usage: bash deploy.sh ARCHIVE.tar.gz [options]

Verify, extract and install the CPU-only offline bundle without downloading anything.
Copy this script, the archive and its .sha256 file to the server before running.

  --directory DIR   Install directory (default: ./simulator112-offline; must not exist)
  --project NAME    Docker Compose project (default: simulator112_offline)
  --restore         Restore the database/files included with --with-data
  -h, --help        Show help

Existing installations: use their ./start.sh or ./install.sh instead of extracting
over them. Docker Engine with Compose must already be installed and accessible.
HELP
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }
cleanup() { [[ -z "$STAGE" ]] || rm -rf -- "$STAGE"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
while (($#)); do
  case "$1" in
    --directory|--project)
      (($# >= 2)) || die "Missing value for $1"
      if [[ "$1" == --directory ]]; then DESTINATION="$2"; else PROJECT="$2"; fi
      shift 2;;
    --restore) RESTORE=1; shift;;
    -h|--help) usage; exit 0;;
    -*) die "Unknown option: $1";;
    *) [[ -z "$ARCHIVE" ]] || die 'Specify exactly one archive'; ARCHIVE="$1"; shift;;
  esac
done
[[ -n "$ARCHIVE" ]] || { usage >&2; exit 1; }
[[ -s "$ARCHIVE" ]] || die "Archive not found or empty: $ARCHIVE"
[[ -n "$DESTINATION" ]] || die 'Install directory must not be empty'
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die 'Invalid Compose project name'
for tool in docker tar sha256sum df awk mktemp; do
  command -v "$tool" >/dev/null || die "Required command is missing: $tool"
done
ARCHIVE="$(cd -- "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
# Strip trailing slashes to make the parent and final directory unambiguous.
while [[ "$DESTINATION" == */ && "$DESTINATION" != / ]]; do DESTINATION="${DESTINATION%/}"; done
[[ ! -e "$DESTINATION" && ! -L "$DESTINATION" ]] || die "Install directory already exists: $DESTINATION. Use its install.sh/start.sh; existing files will not be overwritten."
docker info >/dev/null
docker compose version >/dev/null
case "$(docker info --format '{{.OSType}}/{{.Architecture}}')" in
  linux/x86_64|linux/amd64) ;; *) die 'A Linux/amd64 Docker engine is required';;
esac
if [[ -f "${ARCHIVE}.sha256" ]]; then
  log 'Verifying the transfer archive'
  read -r expected_digest _ < "${ARCHIVE}.sha256"
  [[ "$expected_digest" =~ ^[a-fA-F0-9]{64}$ ]] || die 'Invalid archive checksum file'
  actual_digest="$(sha256sum -- "$ARCHIVE")"
  [[ "${actual_digest:0:64}" == "${expected_digest,,}" ]] || die 'Archive checksum mismatch; copy the archive again'
else
  log 'No adjacent .sha256 file; the embedded file checksums will be verified'
fi
mkdir -p -- "$(dirname "$DESTINATION")"
DESTINATION="$(cd -- "$(dirname "$DESTINATION")" && pwd)/$(basename "$DESTINATION")"
STAGE="$(mktemp -d "$(dirname "$DESTINATION")/.simulator112-deploy.XXXXXXXX")"
log 'Inspecting archive contents and required disk space'
# A single listing pass rejects traversal, links and special devices before extraction.
LC_ALL=C tar --list --verbose --gzip --numeric-owner --quoting-style=escape \
  --file "$ARCHIVE" > "$STAGE/members.txt"
required_bytes=0
while read -r mode owner size day clock name; do
  [[ "$mode" == -* || "$mode" == d* ]] || die 'Archive contains a link or special file'
  [[ "$size" =~ ^[0-9]+$ ]] || die 'Invalid archive size entry'
  [[ "$name" == simulator112-offline || "$name" == simulator112-offline/* ]] \
    || die "Unexpected archive path: $name"
  [[ "/$name/" != *'/../'* && "$name" != *\\* ]] || die "Unsafe archive path: $name"
  required_bytes=$((required_bytes + size))
done < "$STAGE/members.txt"
available_kb="$(df -Pk -- "$STAGE" | awk 'END {print $4}')"
[[ "$available_kb" =~ ^[0-9]+$ ]] || die 'Cannot determine available disk space'
((available_kb * 1024 >= required_bytes + 1073741824)) \
  || die 'Not enough space on the installation disk (archive contents + 1 GiB required). Choose another --directory.'
log "Extracting on the installation disk: $DESTINATION"
tar --extract --gzip --file "$ARCHIVE" --directory "$STAGE" \
  --no-same-owner --no-same-permissions --keep-old-files
BUNDLE="$STAGE/simulator112-offline"
for file in SHA256SUMS install.sh common.sh compose.yml images.env images.tar settings.env.example verify.sh; do
  [[ -s "$BUNDLE/$file" ]] || die "Incomplete distribution: missing $file"
done
log 'Verifying extracted files'
(cd "$BUNDLE"; sha256sum -c SHA256SUMS)
if ((RESTORE)); then
  [[ -s "$BUNDLE/backup/database.sql" && -s "$BUNDLE/backup/app-data.tar" ]] \
    || die 'No database backup in this archive. Package with --with-data, or omit --restore.'
fi
# Move only into a new directory; preserve it for diagnosis if installation fails.
mv -Tn -- "$BUNDLE" "$DESTINATION"
[[ ! -e "$BUNDLE" ]] || die 'Install directory appeared during extraction; refusing to overwrite it'
export SIMULATOR_PROJECT="$PROJECT"
args=()
((RESTORE == 0)) || args+=(--restore)
log 'Loading local images, starting services and checking CPU inference'
if ! bash "$DESTINATION/install.sh" "${args[@]}"; then
  printf '\nInstallation failed. Files remain in %s.\n' "$DESTINATION" >&2
  printf 'Inspect service logs; rerun this directory\x27s install.sh after correcting the problem.\n' >&2
  exit 1
fi
printf '\nDeployment ready: %s\n' "$DESTINATION"
printf 'Open http://SERVER_IP:3000 (unless changed in .env). Credentials: %s/.env\n' "$DESTINATION"
printf 'For subsequent start/stop/backup commands: export SIMULATOR_PROJECT=%q\n' "$PROJECT"
