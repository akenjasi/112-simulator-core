"""Validated configuration shared by API and deployment checks."""
import os
from urllib.parse import urlsplit


def cors_origins():
    values = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    result = []
    for raw in values:
        value = raw.strip().rstrip("/")
        if not value:
            continue
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise RuntimeError("CORS_ORIGINS must contain explicit HTTP(S) origins")
        result.append(value)
    return list(dict.fromkeys(result))
