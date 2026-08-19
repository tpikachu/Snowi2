# Changelog

All notable changes to Snowi are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-rc1] — 2026-08-19

First release candidate. Everything below is new, because this is the first
build carrying the Snowi name.

**This is a release candidate, not a finished 1.0.** It is meant for people
willing to hit rough edges and say so. See _Known limitations_ before installing.

### Capture

- Records microphone and system audio as separate tracks, so both sides of a
  call are captured without a bot joining the meeting or appearing in the
  participant list. CoreAudio tap on macOS, WASAPI process loopback on Windows,
  PipeWire on Linux.
- Detects meetings three ways: known apps launching (Zoom, Teams, Webex,
  FaceTime), the microphone going live for browser calls like Google Meet, and
  scheduled calendar events. Prompts arrive in an in-app overlay that survives
  Focus and Do Not Disturb.
- Pre-roll keeps the 45 seconds before you accept a prompt, so an accepted
  meeting does not start mid-sentence.
- A floating panel shows capture state, elapsed time and audio sources while you
  work in other windows. It is excluded from screen shares.
- Pause and resume, with gap markers in the transcript. Stopping asks whether to
  keep the recording; an empty one leads with Discard, and Enter never destroys.

### Transcription

- On-device by default: whisper.cpp or NVIDIA Parakeet, 58 languages, with
  speaker diarization. Cloud transcription is opt-in and uses your own API key.
- Live preview while recording for streaming-capable models.

### Notes and intelligence

- Notes are generated when you stop recording — summary, decisions and action
  items — and offered before you save.
- Semantic search over your library: local embeddings (all-MiniLM-L6-v2) and a
  local Qdrant index, fused with SQLite full-text search. "Financial forecast"
  finds the meeting where you discussed quarterly revenue.
- A chat agent over your whole workspace, or scoped to one space or folder. It
  cites the notes its answers came from, as links you can click through to.
- `list_meetings` answers questions about which meetings happened and how many,
  from a real database count rather than from search results.
- Persistent memory extracted from meetings — decisions, commitments, people and
  preferences — stored as claims that supersede one another as they change.
  Durable facts about you are available to chat on every message.

### Calendar

- Google, Microsoft and Apple Calendar, with meeting notes linked to the events
  they came from, and a Join action on scheduled prompts.

### Privacy

- No account, no telemetry, no auto-update feed. Nothing is reported anywhere,
  including crashes.
- API keys and credentials are encrypted at rest through the OS keychain
  (Keychain, DPAPI, libsecret) — never in SQLite or a plaintext `.env`.
- Every host the app can contact is listed in `docs/network-allowlist.md`.

### Known limitations

- **Builds are unsigned.** macOS and Windows will both warn on first launch. See
  the "Unsigned builds" section of the README for how to open them.
- **Encrypted meeting storage exists but is not the write path.** Transcripts and
  notes live in a local SQLite database, and the meeting transcript is indexed by
  full-text search. `docs/SPEC_COMPLIANCE.md` records exactly where this stands.
- **No emergency stop, and no confirmation when quitting mid-recording.**
- **Action items are extracted but have no dedicated view yet** — they are in the
  database and reachable by chat, not on a screen of their own.
- Dictation is present in the codebase but disabled: Snowi is a meeting copilot
  in this release.

[0.1.0-rc1]: https://github.com/tpikachu/Snowi2/releases/tag/v0.1.0-rc1
