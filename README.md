# Snowy

**A meeting copilot that runs on your own machine.**

Snowy listens to your meetings, transcribes them locally, and turns them into notes you can search and ask questions about. Nothing leaves your computer unless you point it at a cloud model yourself.

macOS · Windows · Linux

---

## What it does

**Captures the whole conversation.** Microphone and system audio together, so both sides of a call are recorded — no bot joins the meeting, and nothing shows up in the participant list.

**Knows when a meeting starts.** Detects Zoom, Teams, Webex and FaceTime as they launch, notices when the microphone goes live for browser calls like Google Meet, and reads your calendar for what is scheduled. A floating panel shows capture status while you work, and stays out of screen shares.

**Transcribes on-device.** whisper.cpp or NVIDIA Parakeet running locally, with speaker diarization to separate who said what. 58 transcription languages. Bring your own API key for a cloud model instead if you prefer.

**Writes the notes.** A summary, decisions and action items generated when you stop recording — offered before you save, so you decide what to keep.

**Answers questions about what was said.** Semantic search across your notes, so "financial forecast" finds the meeting where you discussed quarterly revenue. Local embeddings and a local vector index; the chat agent searches your whole workspace.

**Connects to your calendar.** Google, Microsoft and Apple Calendar, with meeting notes linked to the events they came from.

## Privacy

Snowy is local-first by construction, not by policy:

- **No account.** There is no sign-up, no login, and no server that belongs to Snowy.
- **No telemetry.** Nothing is reported anywhere, including crashes.
- **No auto-update feed.** The app does not phone home to check for versions.
- **Local by default.** Transcription, embeddings and vector search all run on your machine. Cloud models are opt-in and use your own API keys.
- **Keys in the OS keychain.** API keys and credentials are encrypted at rest through Keychain, DPAPI or libsecret.

Notes and transcripts are stored in a local SQLite database under your user data directory. Encrypted meeting storage is implemented but not yet the write path — see [docs/SPEC_COMPLIANCE.md](docs/SPEC_COMPLIANCE.md) for exactly where that stands.

Every host the app is able to contact is listed in [docs/network-allowlist.md](docs/network-allowlist.md).

## Installing

Download the build for your platform from the releases page.

### Unsigned builds

Snowy is not yet code signed. The binaries are built in CI straight from the tagged commit, but your OS has no certificate to check them against, so it will warn you on first launch.

**macOS** — right-click the app and choose **Open**, then confirm. Or clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/Snowy.app
```

**Windows** — SmartScreen shows "Windows protected your PC". Choose **More info → Run anyway**.

**Linux** — mark the AppImage executable: `chmod +x Snowy-*.AppImage`.

Signing and notarization are wired into the release workflow and switch on as soon as certificates are configured; until then builds are produced unsigned rather than not at all.

## Development

```bash
npm install
npm run dev
```

Requires **Node.js 24** (pinned in `.nvmrc`). Run `npm install` with Node 24 — a different major version produces a `package-lock.json` that breaks `npm ci` in CI.

Sidecar binaries and models (whisper.cpp, sherpa-onnx, Qdrant, embeddings) download automatically via the `predev` / `prebuild` scripts. To fetch one by hand: `npm run download:whisper-cpp`, or `npm run download:whisper-cpp:all` when packaging for several platforms.

| Command                | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run dev`          | Vite renderer + Electron main, with hot reload                     |
| `npm test`             | Unit tests (`node --test`)                                         |
| `npm run quality-check` | Lint, Prettier and typecheck — the same gate CI runs               |
| `npm run i18n:check`   | Verifies translation-key parity across all 10 locales              |
| `npm run reset:dev`    | Clears dev data so the next launch starts from onboarding          |
| `npm run pack`         | Unsigned local build                                               |

Dev runs against an isolated user-data directory (`Snowy-development`), so an installed copy of Snowy is never touched.

### Contributing

Every user-facing string goes through i18n — see the [i18n section of CLAUDE.md](CLAUDE.md). `npm run quality-check` and `npm test` must pass before a change lands.

## Further reading

| Document                                                          | Contents                                            |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                            | Architecture reference — the deep technical map     |
| [docs/SPEC_COMPLIANCE.md](docs/SPEC_COMPLIANCE.md)                | What is built against the V1 spec, and what is not  |
| [docs/network-allowlist.md](docs/network-allowlist.md)            | Every outbound host the app can reach               |
| [LOCAL_WHISPER_SETUP.md](LOCAL_WHISPER_SETUP.md)                  | Local transcription setup                           |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md), [DEBUG.md](DEBUG.md)    | Diagnostics                                         |
| [examples/custom-asr-shim/](examples/custom-asr-shim/)            | Self-hosted transcription against a non-OpenAI ASR  |

## Tech stack

Electron 41 · React 19 · TypeScript · Tailwind CSS v4 · better-sqlite3 · whisper.cpp · sherpa-onnx · Qdrant · shadcn/ui

## License

[MIT](LICENSE). Snowy builds on work from the OpenWhispr project, also MIT licensed; that copyright is retained in [LICENSE](LICENSE) and provenance is recorded in [UPSTREAM.md](UPSTREAM.md).
