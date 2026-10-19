#!/usr/bin/env bash
# Build on an online Linux machine; deploy the resulting archive without internet.
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(date -u +%Y%m%d-%H%M%S)"
LLM_MODEL="${DDS_LLM_MODEL_PATH:-$ROOT/models/Qwen3.5-9B-Q4_K_M.gguf}"
# Pinned Hugging Face LFS metadata; never use a moving main revision for weights.
QWEN_REVISION=3885219b6810b007914f3a7950a8d1b469d598a5
QWEN_SHA256=03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8
QWEN_SIZE=5680522464
QWEN_URL="https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/$QWEN_REVISION/Qwen3.5-9B-Q4_K_M.gguf"
DEFAULT_MODEL=1
[[ -z "${DDS_LLM_MODEL_PATH:-}" ]] || DEFAULT_MODEL=0
OUTPUT="" WORK_DIR="" CHECK=0 WITH_DATA=0 DOWNLOAD=1
SOURCE_PROJECT="$(basename "$ROOT")"
STAGE="" PART=""

usage() {
  cat <<'HELP'
Usage: ./docker/offline/package.sh [options]

Create a Linux/amd64 CPU-only offline installation (Docker Engine + Compose).
Downloads pinned Qwen if absent, builds images, includes weights in the archive.
Speech recognition is disabled; no ASR weights are included.
No current .env, TLS private key, database or uploads are copied by default.

  --llm-model FILE       Use an existing single-file GGUF instead of downloading Qwen
  --no-download          Require cached/local weights; never download model weights
  --output FILE         Destination .tar.gz (must not exist)
  --version TAG         Release/image tag (default: UTC timestamp)
  --work-dir DIR        Temporary space (default: .work next to the output archive)
  --with-data           Include logical database dump and /app/data from live stack
  --source-project NAME Source Compose project for --with-data (default: directory name)
  --check               Validate inputs and Docker; do not download, build or package
  -h, --help            Show help

Example:
  ./docker/offline/package.sh --output /srv/export/simulator112.tar.gz
See docs/operations/offline.md. Downloads stay in models/ (ignored by Git). Live stack is unchanged.
HELP
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }
cleanup() {
  [[ -z "$STAGE" ]] || rm -rf -- "$STAGE"
  [[ -z "$PART" ]] || rm -f -- "$PART"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
while (($#)); do
  case "$1" in
    --llm-model|--output|--version|--work-dir|--source-project)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --llm-model) LLM_MODEL="$2"; DEFAULT_MODEL=0;;
        --output) OUTPUT="$2";; --version) VERSION="$2";;
        --work-dir) WORK_DIR="$2";; --source-project) SOURCE_PROJECT="$2";;
      esac
      shift 2;;
    --with-data) WITH_DATA=1; shift;;
    --no-download) DOWNLOAD=0; shift;;
    --check) CHECK=1; shift;;
    -h|--help) usage; exit 0;;
    *) die "Unknown option: $1 (see --help)";;
  esac
done
[[ "$VERSION" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,100}$ ]] || die 'Invalid version tag'
if ((WITH_DATA)); then
  [[ "$SOURCE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die 'Invalid source project name'
fi
[[ -n "$OUTPUT" ]] || OUTPUT="$ROOT/data/packages/offline/simulator112-$VERSION-linux-amd64.tar.gz"
# /tmp is often a small RAM filesystem. Keep multi-GB staging on the output disk.
[[ -n "$WORK_DIR" ]] || WORK_DIR="$(dirname "$OUTPUT")/.work"
[[ "$OUTPUT" == *.tar.gz ]] || die '--output must end with .tar.gz'
[[ ! -e "$OUTPUT" ]] || die "Output already exists: $OUTPUT"
[[ ! -e "${OUTPUT}.sha256" ]] || die "Checksum already exists: ${OUTPUT}.sha256"
for tool in docker git tar gzip sha256sum find sort xargs head od tr cut; do
  command -v "$tool" >/dev/null || die "Required command is missing: $tool"
done

# Validate cheap prerequisites before downloading or building anything.
missing=0
for file in config.json inference.py model.safetensors tokenizer.json tokenizer_config.json; do
  [[ -s "$ROOT/models/classifier/$file" ]] || { printf 'Missing classifier file: %s\n' "$file" >&2; missing=1; }
done
((missing == 0)) || die 'Prepare the classifier files first; nothing has been downloaded or built.'
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null
docker info >/dev/null
docker compose version >/dev/null

if ((DEFAULT_MODEL && DOWNLOAD && ! CHECK)) && [[ ! -e "$LLM_MODEL" ]]; then
  for tool in curl flock stat; do
    command -v "$tool" >/dev/null || die "Required for downloading Qwen: $tool"
  done
  mkdir -p -- "$(dirname "$LLM_MODEL")"
  # Concurrent packagers share the cache. A failed download leaves only .part.
  exec 9>"${LLM_MODEL}.lock"
  flock 9
  if [[ ! -e "$LLM_MODEL" ]]; then
    log 'Downloading Qwen3.5-9B Q4_K_M (5.7 GB); interrupted transfers can resume'
    # Start a fresh curl invocation per retry so -C - uses the latest file size.
    # curl's internal retries can discard bytes received by the failed attempt.
    for attempt in {1..6}; do
      if [[ -f "${LLM_MODEL}.part" ]] && \
         [[ "$(stat -c %s -- "${LLM_MODEL}.part")" == "$QWEN_SIZE" ]]; then
        break  # A previous connection may have closed after the last byte.
      fi
      if curl --fail --location --show-error --progress-bar \
        --proto '=https' --proto-redir '=https' --connect-timeout 30 \
        --speed-time 120 --speed-limit 1024 --continue-at - \
        --output "${LLM_MODEL}.part" "$QWEN_URL"; then
        break
      else
        curl_status=$?
      fi
      case "$curl_status" in
        5|6|7|16|18|22|28|35|52|55|56|92|95)
          if ((attempt < 6)); then
            log "Download interrupted (curl $curl_status); resuming saved bytes, retry $attempt/5"
            sleep 2
            continue
          fi;;
      esac
      die "Download failed (curl $curl_status). Saved bytes remain in ${LLM_MODEL}.part; rerun ./docker/offline/package.sh to resume."
    done
    if [[ "$(stat -c %s -- "${LLM_MODEL}.part")" != "$QWEN_SIZE" ]] || \
       [[ "$(sha256sum -- "${LLM_MODEL}.part" | cut -d ' ' -f 1)" != "$QWEN_SHA256" ]]; then
      rm -f -- "${LLM_MODEL}.part"
      die 'Downloaded Qwen failed size/SHA-256 validation; rerun to download a fresh copy.'
    fi
    mv -- "${LLM_MODEL}.part" "$LLM_MODEL"
  fi
  exec 9>&-
fi

# Validate before expensive builds; a missing model must never yield a "ready" archive.
for file in "$LLM_MODEL"; do
  if [[ ! -f "$file" || ! -s "$file" ]]; then
    printf 'Missing model: %s\n' "$file" >&2; missing=1
  elif [[ "$(head -c 4 -- "$file")" != GGUF ]]; then
    printf 'Not a GGUF file: %s\n' "$file" >&2; missing=1
  elif [[ "$(basename "$file")" == *-of-*.gguf ]]; then
    printf 'Use a merged, single-file GGUF: %s\n' "$file" >&2; missing=1
  fi
done
((missing == 0)) || die 'Weights are missing/invalid. Run without --check to download default Qwen, or supply an existing --llm-model FILE.'
if ((DEFAULT_MODEL)); then
  [[ "$(sha256sum -- "$LLM_MODEL" | cut -d ' ' -f 1)" == "$QWEN_SHA256" ]] \
    || die "Cached Qwen SHA-256 mismatch: $LLM_MODEL. Remove the damaged file and rerun."
fi
if ((CHECK)); then
  log 'Inputs and Docker are ready. Target: linux/amd64, CPU only. No archive created.'
  exit 0
fi

mkdir -p -- "$(dirname "$OUTPUT")" "$WORK_DIR"
STAGE="$(mktemp -d "$WORK_DIR/simulator112-package.XXXXXXXX")"
CONTEXT="$STAGE/context"
BUNDLE="$STAGE/simulator112-offline"
mkdir -p "$CONTEXT" "$BUNDLE/models"
log 'Preparing a source context without local secrets or live data'
# Read tracked source from the working tree, including uncommitted tracked fixes.
# Explicit paths prevent accidentally baking arbitrary local files into the image.
git -C "$ROOT" ls-files -z -- .dockerignore backend backend/requirements/runtime.lock docker/images/backend.Dockerfile \
  docker/images/frontend.Dockerfile docker frontend models/classifier \
  assets/reference/classifier_ekp.json assets/reference/moscow_112_addresses.json assets/reference/template_students.csv \
  assets/tts-cache > "$STAGE/source-files"
tar -C "$ROOT" --null --exclude='frontend/out' --exclude='*.gguf' \
  --exclude='.env*' --exclude='*.key' --exclude='*.pem' --exclude='*.db' \
  -T "$STAGE/source-files" -cf - | tar -C "$CONTEXT" -xf -
# Classifier weights may be locally provisioned rather than tracked by Git.
mkdir -p "$CONTEXT/models/classifier"
for name in config.json inference.py model.safetensors tokenizer.json tokenizer_config.json \
  special_tokens_map.json vocab.txt added_tokens.json; do
  if [[ -f "$ROOT/models/classifier/$name" ]]; then
    cp -- "$ROOT/models/classifier/$name" "$CONTEXT/models/classifier/$name"
  fi
done

BACKEND_IMAGE="simulator112/backend:$VERSION"
FRONTEND_IMAGE="simulator112/frontend:$VERSION"
POSTGRES_IMAGE="simulator112/postgres:$VERSION"
LLM_IMAGE="simulator112/llm-cpu:$VERSION"
log 'Building backend and frontend for Linux/amd64'
docker build --platform linux/amd64 -f "$CONTEXT/docker/images/backend.Dockerfile" -t "$BACKEND_IMAGE" "$CONTEXT"
docker build --platform linux/amd64 -f "$CONTEXT/docker/images/frontend.Dockerfile" -t "$FRONTEND_IMAGE" "$CONTEXT"
log 'Fetching PostgreSQL and the CPU-only llama.cpp runtime'
docker pull --platform linux/amd64 postgres:15-alpine
docker pull --platform linux/amd64 ghcr.io/ggml-org/llama.cpp@sha256:951661b272f3ff206c499719d69864b9f53621786ff8e55ce1bb8996b4bf48a1
docker tag postgres:15-alpine "$POSTGRES_IMAGE"
docker tag ghcr.io/ggml-org/llama.cpp@sha256:951661b272f3ff206c499719d69864b9f53621786ff8e55ce1bb8996b4bf48a1 "$LLM_IMAGE"
for image in "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$POSTGRES_IMAGE" "$LLM_IMAGE"; do
  [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" == linux/amd64 ]] \
    || die "Wrong image platform: $image"
done

log 'Copying offline runtime, model weights and public instructions'
# Keep the deployed bundle interface stable; repository-only builders/tests stay out.
for file in README.txt backup.sh common.sh compose.yml install.sh restore-data.sh settings.env.example start.sh stop.sh verify.sh; do
  cp -a "$ROOT/docker/offline/$file" "$BUNDLE/"
done
cp -- "$LLM_MODEL" "$BUNDLE/models/report.gguf"
chmod 644 "$BUNDLE/models/"*.gguf
# TTS is currently disabled in tts_v2.py. Carry its weights if already available.
mkdir -p "$BUNDLE/models/tts"
for name in qwen-tokenizer-12hz-Q4_K_M.gguf qwen-talker-0.6b-base-Q4_K_M.gguf; do
  if [[ -s "$ROOT/backend/core/qwen_tts/models/$name" ]]; then
    cp -- "$ROOT/backend/core/qwen_tts/models/$name" "$BUNDLE/models/tts/$name"
  fi
done
cat > "$BUNDLE/images.env" <<EOF
BACKEND_IMAGE=$BACKEND_IMAGE
FRONTEND_IMAGE=$FRONTEND_IMAGE
POSTGRES_IMAGE=$POSTGRES_IMAGE
LLM_IMAGE=$LLM_IMAGE
EOF
chmod +x "$BUNDLE/"*.sh
{
  printf 'release=%s\nplatform=linux/amd64\ncompute=cpu\nspeech_recognition=disabled\n' "$VERSION"
  printf 'source_commit=%s\n' "$(git -C "$ROOT" rev-parse HEAD)"
  if ! git -C "$ROOT" diff --quiet HEAD --; then printf 'tracked_worktree=modified\n'; fi
  printf 'includes_database=%s\n' "$WITH_DATA"
  for image in "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$POSTGRES_IMAGE" "$LLM_IMAGE"; do
    docker image inspect --format '{{.Id}} {{json .RepoTags}} {{json .RepoDigests}}' "$image"
  done
} > "$BUNDLE/BUILD-INFO.txt"

if ((WITH_DATA)); then
  log 'Exporting source PostgreSQL and application data (read-only; keep training idle during export)'
  mkdir "$BUNDLE/backup"
  source_compose=(docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" -p "$SOURCE_PROJECT" -f "$ROOT/docker/compose/base.yml" -f "$ROOT/docker/compose/dev.yml")
  "${source_compose[@]}" exec -T postgres sh -c \
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' > "$BUNDLE/backup/database.sql"
  "${source_compose[@]}" exec -T backend tar -C /app/data --exclude='./backups' \
    --exclude='*.db' -cf - . > "$BUNDLE/backup/app-data.tar"
  [[ -s "$BUNDLE/backup/database.sql" && -s "$BUNDLE/backup/app-data.tar" ]] || die 'Empty data export'
fi
log 'Saving all four images to images.tar'
docker image save -o "$BUNDLE/images.tar" "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$POSTGRES_IMAGE" "$LLM_IMAGE"
[[ -s "$BUNDLE/images.tar" ]] || die 'Docker produced an empty image archive'
(cd "$BUNDLE"; find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
log 'Creating the transfer archive (may take several minutes)'
PART="$(mktemp "${OUTPUT}.part.XXXXXXXX")"
tar -C "$STAGE" -czf "$PART" simulator112-offline
[[ ! -e "$OUTPUT" ]] || die "Output appeared during packaging: $OUTPUT"
mv -- "$PART" "$OUTPUT"
PART=""
(cd "$(dirname "$OUTPUT")"; sha256sum -- "$(basename "$OUTPUT")" > "$(basename "$OUTPUT").sha256")
log "Ready: $OUTPUT"
printf 'Copy the archive to the offline server, extract it and run ./simulator112-offline/install.sh\n'
((WITH_DATA == 0)) || printf 'For the included database use: ./simulator112-offline/install.sh --restore\n'
