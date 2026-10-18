#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
umask 077
RESTORE=0
case "${1:-}" in '') ;; --restore) RESTORE=1;; *) echo 'Usage: ./install.sh [--restore]' >&2; exit 1;; esac
[[ $# -le 1 ]] || exit 1
docker info >/dev/null
docker compose version >/dev/null
case "$(docker info --format '{{.OSType}}/{{.Architecture}}')" in
  linux/x86_64|linux/amd64) ;; *) echo 'This package requires a Linux/amd64 Docker engine' >&2; exit 1;;
esac
(cd "$ROOT"; sha256sum -c SHA256SUMS)
docker image load -i "$ROOT/images.tar"
if [[ ! -e "$ROOT/.env" ]]; then
  TEMP_ENV="$(mktemp "$ROOT/.env.XXXXXXXX")"
  trap 'rm -f -- "${TEMP_ENV:-}"' EXIT
  cp "$ROOT/settings.env.example" "$TEMP_ENV"
  docker run --rm --network none --entrypoint python "$(backend_image)" -c \
    'import secrets; print("SECRET_KEY="+secrets.token_hex(32)); print("POSTGRES_PASSWORD="+secrets.token_hex(24)); print("INITIAL_ADMIN_PASSWORD="+secrets.token_hex(12))' >> "$TEMP_ENV"
  mv -- "$TEMP_ENV" "$ROOT/.env"
  TEMP_ENV=""
fi
mkdir -p "$ROOT/certs"
if [[ ! -e "$ROOT/certs/server.crt" && ! -e "$ROOT/certs/server.key" ]]; then
  docker run --rm --network none --mount "type=bind,source=$ROOT/certs,target=/certs" \
    --entrypoint openssl "$(backend_image)" req -x509 -newkey rsa:3072 -nodes -days 365 \
    -subj /CN=simulator112 -addext subjectAltName=DNS:localhost,IP:127.0.0.1 \
    -keyout /certs/server.key -out /certs/server.crt
fi
[[ -s "$ROOT/certs/server.crt" && -s "$ROOT/certs/server.key" ]] || { echo 'Incomplete TLS certificate pair' >&2; exit 1; }
compose config -q
if ((RESTORE)); then "$ROOT/restore-data.sh" "$ROOT/backup"; fi
compose up -d --no-build --pull never
"$ROOT/verify.sh"
printf '\nInstalled. Open http://SERVER_IP:3000 (or the port set in .env).\n'
printf 'Initial login and password are stored in %s/.env. Existing restored accounts retain their passwords.\n' "$ROOT"
