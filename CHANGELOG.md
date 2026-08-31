# Changelog

All notable changes to Snowy are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-rc5] — 2026-08-31

Fifth release candidate: the big simplification. Snowy's surfaces were rebuilt
around one loop — start a meeting, get the write-up — and everything that
stood beside that loop was removed, hidden, or folded into it.

**Still a release candidate.** See _Known limitations_ under 0.1.0-rc1.

### Onboarding that sets itself up

- Transcription setup now asks one question in plain words — private on this
  computer, or an online service — then either picks and **downloads the right
  model for your machine automatically**, or recommends a provider that fits
  how you said you'd use Snowy. No model names, sizes or technical terms
  unless you go looking for them.
- The download never blocks you: keep going through onboarding while it runs,
  and after you land in the app a slim strip under the window header shows
  what is downloading and how far along it is. **Start meeting** stays
  disabled — with a tooltip saying why — only until the model your meetings
  actually transcribe with has arrived; anything else downloads quietly in
  the background.

### One bar to ask, one button to listen

- The assistant hotkey now summons a compact floating bar: type to ask
  (optionally letting Snowy see your screen — asked once, with consent), or
  press **Listen** to start a meeting on the spot. The live meeting panel
  appears right where the bar was.

### The live meeting panel, redesigned

- One clean dark surface instead of boxes inside boxes: the suggestion leads
  in the largest type, quick actions are real buttons — _What should I say?_,
  _Recap so far_, _What's still open?_ — and the question box is a proper
  input well with the panel's single strong send button.
- The transcript is **hidden by default**; one click shows a 3–4 line tail,
  and the choice sticks. The level meter already proves the meeting is heard.
- A missing AI model is no longer a dead end mid-meeting: the panel now
  carries a **Configure** button that deep-links straight into Settings, and
  the assistant refuses to pretend a half-configured provider will answer.

### Home is the meeting log

- Search lives in the window header now — one pill, every screen, same
  **⌘K / Ctrl K** palette. The rail icon, the Home search bar and the notes
  sidebar entry (three doors to the same room) are gone.
- Home itself is Start, the meeting history grouped by day, an **Ongoing**
  row while recording, and a card that says plainly what still needs setting
  up.

### The note is the summary

- A written-up meeting opens on its **Summary**, with **Copy summary** and a
  new **Follow-up email** button: Snowy drafts the email from the write-up,
  you edit it, then copy it or open it in your mail app pre-addressed to the
  attendees. Snowy never sends anything itself.
- Settings now opens as a true modal — visible close button, Escape, or a
  click outside all dismiss it.

### Removed

- **Manual note creation.** The AI write-up is the note; every "New note"
  button and the manual Notes tab are gone. Notes you already typed still
  open and edit normally, and the chat assistant can still save notes for
  you.
- **Write-up templates** (introduced in rc4). One high-quality default
  write-up shape, no decision before every meeting.
- **The extra default folders.** One _Meetings_ folder now; on existing
  installs, empty seeded folders are removed and ones still holding notes
  become ordinary folders you can rename or delete.
- Calendar sync and audio-file upload are hidden for v1 (kept behind feature
  flags, fully built).

## [0.1.0-rc4] — 2026-08-26

Fourth release candidate. Snowy learns that your meetings repeat: a recurring
meeting starts already briefed on last time, remembers how you like it written
up, and the pipeline underneath survives the things that kill long meetings.

**Still a release candidate.** See _Known limitations_ under 0.1.0-rc1.

### Recurring meetings know their history

- When a meeting that has met before starts, the panel shows it — _"Recurring ·
  last met Aug 19 · 3 open from last time"_ — with a one-click **What's still
  open?** that asks the assistant over your past notes. No series id from the
  calendar is needed: occurrences are matched by title and shared attendees, so
  it also works retroactively on every meeting you already recorded, and "1:1"
  with two different people never gets mixed up.
- The assistant is briefed before anyone speaks: last occurrence's decisions and
  commitments — with their **current** statuses — are pinned into every
  suggestion and Thinking answer. "As discussed last week" now lands without
  anyone having to phrase a search. Meetings whose notes you typed by hand are
  briefed from the notes themselves, labeled as possibly out of date.
- **Write-up templates.** A 1:1, a standup and a sales call produce different
  notes; pick the shape once per meeting — 1:1, Standup, Sales call, Interview,
  Planning, or the standard notes — and every future occurrence of that meeting
  inherits it automatically. All three write-up paths honor it, including the
  automatic one at Stop.

### The write-up is for sharing

- **Copy recap for sharing** on any written-up meeting: title, date, attendees,
  then the notes — formatted to paste cleanly into Slack or an email.

### Search finds meaning, not just words

- The command palette's note search now uses the same hybrid semantic ranking
  the AI assistant uses. Searching "financial forecast" finds the note about
  quarterly revenue projections — and each result shows the passage that
  matched instead of the note's first line.

### Sturdier under real conditions

- The meeting assistant's model and search index now load the moment a meeting
  starts, during the "can everyone hear me" minute — not underneath the
  meeting's first question.
- System audio capture that dies mid-meeting (laptop sleep is the usual
  culprit) now restarts itself, with attempts spread across the seconds an
  audio stack needs to come back after wake. Only when it truly cannot recover
  does the panel say so — and it then honestly reads "Microphone only" instead
  of continuing to claim both sources.
- On Windows, a corrupted binary or model download no longer reports a
  successful extraction and fails later as a mysteriously missing file.

### Fixed

- The test suite now passes on Windows machines, not only in CI — two
  host-dependent tests and the real extraction bug above were behind the
  failures a contributor reported.

## [0.1.0-rc3] — 2026-08-24

Third release candidate. The meeting assistant gets two speeds, every chat
learns exactly what it should know, and answers stop quoting facts that are no
longer true.

**Still a release candidate.** See _Known limitations_ under 0.1.0-rc1.

### Ask during the meeting: Fast and Thinking

- The panel's question box now has two modes. **Fast** — the default — answers
  instantly from the meeting itself: no note search, no model deliberation,
  first word as soon as the model can produce one. **Thinking** takes longer
  and also searches your past notes, naming the ones it used.
- They work together: a Fast answer offers **Check past notes**, which asks the
  same question again in Thinking mode. Instant first; depth one click away.
- The modes explain themselves — toggle tooltips, a one-line explainer before
  the first question, and a "Searching your past notes…" line while Thinking
  does the part that makes it slower. Every answer is labeled with the mode
  that produced it.

### Every chat knows exactly what it should

- Snowy has several chats — the global chat, a chat per space or folder, one
  inside each note, and the meeting panel. Each now has a defined contract:
  what it is about is pinned, the memory that matters to it rides along, and
  anything beyond its scope is reached by a visible search rather than a
  silent read.
- A note's chat pins the claims extracted from that note with their **current**
  status. The note says "$40k" forever; if the price was renegotiated two
  meetings later, the chat now knows — and says so instead of quoting it.
- The global chat now carries both sides of the table: what you owe people
  **and what they promised you**. "What is Acme supposed to send us?" finally
  has its data in reach.
- A space or folder chat pins the open items filed under _its_ notes, not your
  entire slate.
- The meeting assistant's Thinking mode (and the precomputed suggestions) now
  draw on durable memory too: your open commitments, both directions, and the
  claims behind every note they retrieve.
- Chatting inside a very long meeting note no longer re-sends the entire
  transcript with every message. The recent part stays pinned; the rest is
  found by search exactly when a question needs it.

### Fixed

- On macOS, the window buttons no longer sit on top of the section title. The
  top row of every layout now clears them.
- Buttons that open Settings on a particular panel land on that panel (this
  also shipped in the re-cut rc2).

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
- Buttons that open Settings on a particular panel now land on it. Opening
  Settings from anywhere else in the app applied the section but not the panel,
  so Home's "Set up" for Actions arrived at Language Models on whichever tab was
  visited last.
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
