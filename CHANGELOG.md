# Changelog

All notable changes to Snowy are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-rc2] — 2026-08-21

Second release candidate. The meeting panel stops being a status bar and starts
being the meeting, local captions get much faster, and Home says what Snowy can
and cannot do rather than leaving you to find out.

**Still a release candidate.** See _Known limitations_ under 0.1.0-rc1; the ones
listed there that are fixed are called out below.

### The meeting panel

- The panel is now the meeting surface. Starting a meeting minimises the main
  window and opens a side panel carrying a suggestion, a small live transcript
  and a question box. It stays excluded from screen shares.
- **Suggestions.** When the other side stops talking, the panel already has a
  line ready — computed in the background, drawn from the meeting so far and
  from your own past notes. It is precomputed rather than fetched on demand
  because a suggestion that arrives eight seconds into an awkward silence is one
  nobody wanted.
- **Ask during the call.** A question box answers from the live meeting first
  and your note library second, streaming, so the first sentence lands early.
  Both the suggestion and the answer name the notes they drew on.
- The transcript pane is capped at about five lines and never grows. It is there
  to show the meeting is being heard, not to be read.

### Transcription

- **Local captions stream properly.** Meetings using a streaming-capable local
  model now feed a live websocket instead of decoding the last few seconds over
  and over. Captions arrive word by word rather than a sentence at a time.
- Captions are attributed as **You** and **Others**. Speaker identification is
  off for now — it cost more latency than it was worth during a live call.
- **Transcription setup has a Basic mode**, which measures the machine and picks
  and downloads a model for it. Advanced still exposes every model, and it is
  now possible to get back from Advanced to Basic.
- Setup explains why a model has to be downloaded at all, for people who have
  never had to think about it.

### Home

- A capability card says what works right now and what still needs a language
  model — written as what you get, not what the setting is called. Once
  something is configured it names the model it is running and where.
- Onboarding's "About you" categories are meeting kinds now (team meetings,
  client calls, interviews, research, healthcare, education) rather than the
  generic dictation categories they inherited.

### Actions

- Settings' "Note Formatting" panel is now **Actions**, which is what it always
  was: writing up a meeting is not a separate feature from Generate Notes, it is
  that action run automatically. The panel leads with the actions, then names
  the model they all run on.
- The rename goes all the way down. The `noteFormatting` inference scope, its
  settings keys, its panel id, its IPC channels and the name its credential is
  filed under are now `actions`, so nothing left in the code lists a single
  action as a peer of Chat. Settings are migrated on first launch. The one
  thing that does not carry over is a custom Actions endpoint's API key, which
  was stored under the old name and has to be entered once more.
- Actions are managed from a list-and-editor screen reachable both from the
  notes sidebar and from that Settings panel. Writing an action is a prompt
  about your own notes and you think of one while reading a note; picking the
  model it runs on is a different question, and that stays in Settings.
- The action button no longer appears on a note when no model is configured.
  There was nothing for it to run, so it could only produce a setup prompt.
- Notes no longer open onto a setup screen. A first visit used to be taken over
  by a model picker and an action builder before any note could be seen. Model
  setup lives in Settings and is offered from Home; Notes shows notes.
- Language Models leads with Actions and Chat. They are two of the three things
  Snowy does; the dictation trio that used to sit above them is the smaller,
  older surface.

### Fixed

- Stopping a meeting no longer generates the write-up before you have said
  whether to keep it. Discard now means nothing happened, and no inference call
  is spent on a meeting that was thrown away.
- Saving a meeting with no action model configured skips the write-up quietly
  instead of interrupting the end of the call with a setup prompt. The meeting
  still appears in Home's write-up backlog.
- The transcript pane no longer re-renders the whole conversation on every word,
  and no longer scrolls away from what you were reading.

## [0.1.0-rc1] — 2026-08-19

First release candidate. Everything below is new, because this is the first
build carrying the Snowy name.

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
- Dictation is present in the codebase but disabled: Snowy is a meeting copilot
  in this release.

[0.1.0-rc1]: https://github.com/tpikachu/Snowi2/releases/tag/v0.1.0-rc1
