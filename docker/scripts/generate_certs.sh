#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${CERT_DIR:-${SCRIPT_DIR}/../../data/certs}"
mkdir -p "$CERT_DIR"
umask 077
if [ -s "$CERT_DIR/server.key" ] && [ -s "$CERT_DIR/server.crt" ]; then
    openssl x509 -in "$CERT_DIR/server.crt" -noout -checkend 86400 >/dev/null
    echo "Existing certificate retained. Rotate deliberately after checking consumers."
    exit 0
fi
TEMP_CERT_DIR="$(mktemp -d "${CERT_DIR}/.generate-XXXXXX")"
trap 'rm -rf "$TEMP_CERT_DIR"' EXIT
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$TEMP_CERT_DIR/server.key" -out "$TEMP_CERT_DIR/server.crt" \
    -subj '/C=RU/ST=Moscow/L=Moscow/O=112Simulator/OU=Training/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
mv "$TEMP_CERT_DIR/server.key" "$CERT_DIR/server.key"
mv "$TEMP_CERT_DIR/server.crt" "$CERT_DIR/server.crt"
chmod 600 "$CERT_DIR/server.key"
echo 'Local development certificate created; use a trusted certificate for other hosts.'
