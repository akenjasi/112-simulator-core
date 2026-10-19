#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_install
compose up -d --no-build --pull never
"$ROOT/verify.sh"
