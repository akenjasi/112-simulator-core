112 Simulator — CPU-only offline installation, Linux/amd64

The server needs Docker Engine, Docker Compose v2 (multiple --env-file support),
Bash and standard Linux utilities (tar, gzip, sha256sum). No host Python, Node,
PostgreSQL, CUDA, GPU driver or NVIDIA toolkit is required. Size/RAM and speed
depend on the supplied GGUF and CPU. Models are included as local files in this
distribution; the classifier and application libraries are inside the backend.

INSTALL
  tar -xzf simulator112-VERSION-linux-amd64.tar.gz
  cd simulator112-offline
  ./install.sh

If backup/ is included and you want to migrate its users, tickets and materials:
  ./install.sh --restore
Restoration is allowed only into an empty database and application volume.
It never overwrites an existing deployment. Keep source training idle during
export: PostgreSQL is transactionally dumped, but files are copied separately.

The installer verifies SHA256SUMS, loads all four images without a registry,
generates local credentials and a self-signed certificate, starts the stack,
checks backend + frontend + LLM health, then sends a synthetic CPU inference
request and real Qwen TTS synthesis (PCM16, mono, 8000 Hz). Readiness may take up to 30 minutes; inference has a separate timeout.
If a check fails, inspect logs; do not treat the deployment as ready.

Open http://SERVER_IP:3000 . For HTTPS use a trusted certificate for the actual
server name/IP; localhost self-signed
certificates are only a bootstrap. Install your server.crt and server.key in
certs/ before installation to use your own pair. No development keys are shipped.
The login and initial password are in .env (INITIAL_ADMIN_USERNAME/PASSWORD).
Restored existing accounts retain their passwords; restarting never resets them.

OPERATIONS
  ./start.sh
  ./stop.sh                   # keeps database and uploads
  ./verify.sh                 # real synthetic inference, no lesson data
  ./backup.sh                 # logical SQL dump + application files
  ./restore-data.sh /backup   # empty target only; then ./start.sh

For logs, use the same project and env files as the scripts:
  docker compose --env-file images.env --env-file .env -p simulator112_offline logs --tail=100
If SIMULATOR_PROJECT is overridden, keep that value consistent for all commands.
Customize ports, CPU threads, context and timeouts in .env. Re-run ./start.sh.
Application state is in persistent Docker volumes. Do not delete these volumes
when updating images. Keep .env and backups separately when migrating/updating.
After a partial restore error, inspect it rather than reusing a partly filled DB.

OFFLINE BOUNDARIES
All images are versioned locally and pull_policy is never. No build is performed
on the server; Compose starts with --no-build --pull never. Backend, LLM and DB
use an internal network. Nginx also has an ingress bridge so its published
HTTP/HTTPS ports are reachable from the host/LAN. Hugging Face is
forced offline. Report/advice and factoid generation use the shared CPU LLM;
no Ollama process or external API is required.

SPEECH
Qwen TTS synthesis is enabled by default. Both pinned GGUF weights are included
in models/tts; the binary, libraries and reference voices are in the backend image.
No pre-existing audio cache is required. TTS_ENABLED=false explicitly disables
synthesis. ASR is disabled; no GigaAM weights are included. Legacy HTTP TTS
requires a separately configured service and is outside this distribution.

The source repository and its development .env are not needed on the server.
BUILD-INFO.txt records the release, source commit, image IDs/digests and whether
database/files were exported. SHA256SUMS detects corruption, not authenticity.
