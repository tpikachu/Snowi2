# Snowi

Snowi is a local-first voice dictation and meeting copilot desktop app for macOS, Windows, and Linux. Press a hotkey, speak, and your words appear at your cursor — transcribed on-device with whisper.cpp or NVIDIA Parakeet, or through your own cloud API keys. It also detects and transcribes meetings with on-device speaker diarization, and keeps searchable local notes. No accounts, no telemetry, no auto-update feed.

Snowi is a private fork of OpenWhispr 1.8.3 by Snowball — see [UPSTREAM.md](UPSTREAM.md) for fork provenance and the approved V1 scope.

## Development

```bash
npm install
npm run dev
```

Requires Node.js 24 (pinned in `.nvmrc`). Always run `npm install` with Node 24 so `package-lock.json` stays compatible with CI.

Binaries and models (whisper.cpp, sherpa-onnx, Qdrant, etc.) are downloaded automatically by the `predev`/`prebuild` scripts; to fetch the whisper.cpp binary manually run `npm run download:whisper-cpp` (or `npm run download:whisper-cpp:all` for multi-platform packaging). Use `npm run pack` for unsigned builds.

Further docs in this repo:

- [LOCAL_WHISPER_SETUP.md](LOCAL_WHISPER_SETUP.md) — local transcription setup
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [DEBUG.md](DEBUG.md) — diagnostics
- [docs/network-allowlist.md](docs/network-allowlist.md) — every outbound host the app can contact
- [examples/custom-asr-shim/](examples/custom-asr-shim/) — Self-Hosted transcription against non-OpenAI-compatible ASR APIs

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## License

[MIT](LICENSE)
