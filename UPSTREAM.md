# Upstream provenance

This repository is a Snowy-controlled fork of the OpenWhispr desktop
application, per the Snowy Desktop Meeting Copilot V1 contractor
specification (docs/Snowy_Desktop_Meeting_Copilot_V1_Contractor_Spec_v1.0.md,
section 2.3).

## Source

- Upstream project: OpenWhispr — https://github.com/OpenWhispr/openwhispr
- Upstream package version at fork time: **1.8.3**
- Upstream commit: **UNKNOWN — snapshot obtained without git history.**
  TODO: identify the exact upstream commit matching this tree (compare
  against the v1.8.3 release tag) and record its SHA here before Gate 0
  sign-off.
- License: MIT (retained; see LICENSE). Third-party notices must be
  regenerated as THIRD_PARTY_NOTICES.md before the first release.
- This repository's history begins with a single squashed initial
  commit; the pre-fork upstream tree is not retained as a separate
  commit here. Provenance is recorded in this file.

## Fork policy (spec §2.3)

- Never merge or rebase from upstream `main` automatically.
- Import upstream changes only through reviewed, testable pull requests.
- Generate an SBOM for each release.

## Copied native binaries / helpers

Downloaded or compiled into `resources/bin/` (not committed; fetched by
`scripts/download-*.js` / `scripts/build-*.js`):

- whisper.cpp binaries (GitHub releases, upstream OpenWhispr builds)
- llama.cpp server (ggml-org/llama.cpp releases)
- sherpa-onnx offline/online websocket servers (Parakeet ASR)
- Qdrant vector DB sidecar
- all-MiniLM-L6-v2 embedding model + whisper VAD model (HuggingFace)
- diarization models (sherpa-onnx releases)
- meeting-aec-helper (WebRTC AEC)
- macos-audio-tap, macos-globe-listener, macos-mic-listener,
  macos-calendar-listener, macos-fast-paste, macos-text-monitor,
  macos-media-remote + MediaRemoteAdapter.framework (compiled from
  sources in `resources/` and `native/`)
- windows-key-listener, windows-mic-listener,
  windows-system-audio-helper, windows-fast-paste, windows-text-monitor
  (prebuilt from upstream CI releases)
- linux helpers (fast-paste, system-audio, key-listener, text-monitor)
- nircmd.exe (nirsoft.net — third-party host; flagged for vendoring in
  the network-egress inventory)
- yt-dlp (GitHub releases)

TODO before Gate 0 sign-off: pin every download script to an exact
release tag + checksum and record the provenance of each prebuilt
Windows helper binary.

## Approved V1 scope decisions (product owner, 2026-08-17)

1. **Dictation:** KEPT in full (decision revised 2026-08-18, superseding
   the earlier removal decision). Snowy ships as dictation + meeting
   copilot. This is a documented scope addition relative to the spec's
   meetings-only V1 (§4.1); dictation is fully local/BYOK and adds no
   network egress beyond the approved allowlist.
2. **Calendar integrations:** Google/Microsoft calendar OAuth sync and
   Apple Calendar (EventKit) are **retained** in V1. This is a
   documented exception to the spec §22.2 network allowlist: permitted
   additional egress is limited to
   `accounts.google.com` / `oauth2.googleapis.com` /
   `www.googleapis.com/calendar/v3`,
   `login.microsoftonline.com` / `graph.microsoft.com`.
3. **Linux:** Linux code paths are retained but Linux is not a shipped
   or QA'd platform for V1 (spec §6).
4. All upstream cloud (OpenWhispr Cloud API, auth, billing/Stripe,
   referrals, workspaces/policies, cloud sync, managed enterprise
   credentials) is removed per spec §22.2 and Milestone 1.
