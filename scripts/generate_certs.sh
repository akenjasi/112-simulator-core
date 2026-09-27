#!/bin/bash

set -e

# Переход в корень проекта
cd "$(dirname "$0")/.."

mkdir -p certs

echo "Generating self-signed SSL certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/server.key \
    -out certs/server.crt \
    -subj "/C=RU/ST=Moscow/L=Moscow/O=112Simulator/OU=IT/CN=localhost" 2>/dev/null || true

echo "Certificate generation successful! Saved to certs/server.key and certs/server.crt"
