# Security Policy

Snowy is a private, internally distributed application. Security issues are
handled internally: report them directly to the Snowball team rather than in
any public tracker, and do not disclose details outside the team.

## Security Model

- **Local-first audio processing** — Audio is transcribed on-device using
  whisper.cpp or NVIDIA Parakeet. Recordings are not sent to external servers
  unless explicitly configured by the user.
- **Credential storage** — API keys provided by users (BYOK) and enterprise
  cloud credentials (AWS, Azure, Vertex) are encrypted at rest using
  Electron's `safeStorage` API, which delegates to the OS keychain (Keychain
  on macOS, DPAPI on Windows, libsecret on Linux). Encrypted blobs are stored
  under `userData/secure-keys/`. Non-secret preferences (regions, endpoints,
  hotkeys, flags) continue to live in `.env`. On Linux systems without a
  keyring, secrets fall back to plaintext to match Electron's default
  behavior.
- **Native binaries** — Platform-specific helpers (key listeners, paste
  utilities) are compiled from source during the build process.
- **Context isolation** — The Electron renderer runs with context isolation
  enabled and a restricted preload bridge.
- **No telemetry, no accounts, no auto-update feed** — the app makes no
  outbound connections beyond those listed in
  [docs/network-allowlist.md](docs/network-allowlist.md).
