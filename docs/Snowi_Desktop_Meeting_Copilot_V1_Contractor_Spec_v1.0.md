# Snowi Desktop Meeting Copilot V1

**Product, UX, Architecture, Security and Contractor Implementation Specification**  
Version: 1.0  
Status: Approved implementation baseline  
Date: 5 August 2026  
Audience: External desktop application contractor, Snowi product and engineering reviewers

> This specification deliberately excludes Snowi authentication, cloud synchronization, OpenClaw integration and internal Snowi infrastructure. V1 is a self-contained local desktop product. Interfaces are designed so V2 and V3 can be added without replacing the V1 capture, intelligence or storage pipeline.

## 1. Normative language

The terms **MUST** and **MUST NOT** are release requirements. **SHOULD** is strongly recommended and requires a documented reason if omitted. **MAY** is optional.

## 2. Executive decision

### 2.1 Product decision

V1 is a meetings-first, local-first, real-time desktop copilot. It listens only after explicit user action, transcribes microphone and system audio, understands the meeting as it progresses, privately answers questions during the meeting, and creates an encrypted local meeting record with summary, decisions, action items and structured memory objects.

V1 has no Snowi account, Snowi authentication, cloud upload, bot connection or OpenClaw dependency.

### 2.2 Technology decision

V1 SHOULD use an audited, pinned fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr) as the open-source base and Electron as the desktop runtime.

Electron is approved for V1 because:

- OpenWhispr already has working macOS and Windows meeting capture, native audio helpers, local transcription, streaming AI adapters and an agent overlay.
- Reusing one application architecture is materially safer and faster than combining Electron and Tauri projects.
- Electron supports macOS and Windows packaging, signing, update delivery, OS key protection and native helper processes.
- The team can meet the security requirement by reducing the fork, sandboxing renderers, validating IPC and limiting network access.

The choice is conditional on the Gate 0 checks in Section 25. If the pinned OpenWhispr build fails the audio, license or security gate, the fallback is a pinned Meetily fork using Tauri/Rust. Product behavior and data contracts in this specification remain unchanged.

### 2.3 Fork policy

The contractor MUST:

- Fork one exact audited OpenWhispr commit into a Snowi-controlled repository.
- Record the source commit, release, license and copied native binaries in `UPSTREAM.md`.
- Retain the MIT license and required third-party notices.
- Generate an SBOM for each release.
- Never automatically merge or rebase from upstream `main`.
- Import upstream changes only through reviewed, testable pull requests.
- Remove upstream branding, update URLs, cloud endpoints, subscription code and analytics before the first Snowi build.

## 3. Product objective

### 3.1 User problem

A user may attend 10–20 meetings per day. Important decisions, commitments and follow-ups are lost because the user cannot listen, contribute, take complete notes and remember every detail at the same time.

### 3.2 V1 promise

While a meeting is active, Snowi privately helps the user understand what is being discussed and answer questions about the conversation. When the meeting ends, Snowi produces useful notes and actions that remain encrypted on the user’s computer.

### 3.3 Primary jobs

- Capture microphone and meeting audio reliably.
- Produce a readable live transcript.
- Answer private questions using the active meeting as evidence.
- Maintain a compact understanding of topics, decisions, commitments and risks.
- Produce an accurate post-meeting summary and action list.
- Store transcript, summary and memory objects securely on the device.

## 4. V1 scope

### 4.1 Required features

- macOS Apple Silicon support.
- Windows 10/11 x64 support.
- Explicit Start, Pause, Resume and Stop.
- Microphone-only, system-audio-only and combined recording.
- Live local transcription.
- Visible recording state and duration.
- Compact always-on-top meeting panel.
- Private text questions during the meeting.
- Streaming AI answers grounded in the current meeting.
- Running meeting understanding.
- Post-meeting summary, decisions, action items, deadlines, risks and open questions.
- Local action-item editing and completion.
- Encrypted local audio checkpoints, transcript, summary and memory objects.
- BYOK AI providers plus an optional local-model adapter.
- Local meeting history and meeting deletion.
- Markdown and JSON export initiated by the user.
- Crash recovery for interrupted recordings.

### 4.2 Explicitly out of scope

- Snowi login, account or device authentication.
- Cloud synchronization or backup.
- OpenClaw or Telegram integration.
- Bot participation in Zoom, Meet or Teams.
- Automatic calendar joining.
- Automatic meeting recording.
- Always-on microphone, screen or application monitoring.
- Screenshot, OCR or screen-video capture.
- An “undetectable” mode, process disguise or evasion behavior.
- Speaking into the meeting, sending messages or executing external actions.
- Automatic email, calendar, Jira, Linear, Notion or CRM updates.
- Mobile and browser-extension clients.
- Guaranteed biometric speaker identification.
- Shared workspaces or team collaboration.

## 5. Product principles

1. **Explicit capture:** recording starts only through a deliberate user action.
2. **Visible state:** the user can always tell whether Snowi is recording, paused or processing.
3. **Local authority:** the local encrypted meeting artifact is the V1 source of truth.
4. **Evidence first:** answers, decisions and memory objects link to transcript timestamps.
5. **No silent failure:** missing system audio, revoked permission and dropped devices are shown immediately.
6. **No automatic action:** the assistant may recommend text and actions but cannot execute them in V1.
7. **Minimum network:** only approved AI-provider requests, model downloads and signed update checks are allowed.
8. **Future-safe contracts:** V2 capture sources and V3 synchronization plug into stable V1 interfaces.

## 6. Supported platform matrix

| Platform    |             Minimum | V1 support   | Notes                                                                                     |
| ----------- | ------------------: | ------------ | ----------------------------------------------------------------------------------------- |
| macOS       | 14.2, Apple Silicon | Required     | Native CoreAudio Tap preferred; ScreenCaptureKit fallback only if required and disclosed. |
| Windows     |      Windows 10 x64 | Required     | WASAPI loopback for system audio. Windows 11 is the primary QA target.                    |
| Intel macOS |                   — | Not required | May be evaluated after V1.                                                                |
| Windows ARM |                   — | Not required | May be evaluated after V1.                                                                |
| Linux       |                   — | Not required | No V1 installer or QA commitment.                                                         |

The contractor MUST test on physical macOS and Windows hardware. Virtual machines are acceptable for build and security tests but are not sufficient for final audio acceptance.

## 7. End-to-end user flow

```mermaid
flowchart TD
    A[Launch Snowi Desktop] --> B{First run?}
    B -- Yes --> C[Privacy explanation and permissions]
    C --> D[Select transcription and AI providers]
    B -- No --> E[Meeting library]
    D --> E
    E --> F[Start meeting]
    F --> G[Preflight: mic, system audio, language, consent]
    G --> H[Recording and live transcription]
    H --> I[Ask Snowi during meeting]
    I --> H
    H --> J{Pause?}
    J -- Yes --> K[Capture stops; context frozen]
    K --> H
    H --> L[Stop]
    L --> M[Finalize transcript]
    M --> N[Generate summary, actions and memory objects]
    N --> O[Encrypted local meeting record]
    O --> P[Review, edit actions, export or delete]
```

## 8. First-run onboarding

### 8.1 Welcome and privacy

The first screen MUST explain:

- Snowi records only when the user starts a meeting.
- V1 stores meeting content locally and encrypted.
- Local transcription keeps raw audio on the device.
- If the user selects a cloud AI provider, selected transcript context is sent directly to that provider.
- Snowi does not receive the provider key or meeting content in V1.
- The user is responsible for following applicable recording and participant-consent requirements.

The application MUST require affirmative acknowledgement before requesting audio permissions.

### 8.2 Permission setup

The application MUST guide the user through:

- Microphone permission.
- macOS system-audio permission, or required Screen Recording permission only when the OS capture method needs it.
- Windows microphone permission.

Each permission step MUST have Test, Retry and Open System Settings actions.

### 8.3 Transcription setup

Default V1 transcription is local.

The user selects an approved local model:

- Recommended model for the detected hardware.
- Smaller/faster model.
- Larger/more accurate model.

The model download view MUST show size, progress, required free space, checksum verification and cancellation.

### 8.4 AI setup

Supported initial AI modes:

- OpenAI-compatible BYOK provider.
- Anthropic BYOK provider.
- Ollama local provider.

Shipping more than two cloud providers is optional. Provider interfaces MUST remain extensible.

The user can Test, Replace and Delete a credential. Secrets MUST be stored using OS-protected secure storage and MUST never be written to SQLite, `.env`, logs or crash reports.

## 9. Main application information architecture

### 9.1 Meeting Library

The default screen displays:

- Start Meeting primary action.
- Recent meetings ordered by start time.
- Title, date, duration, completion state and action-item count.
- Filters for All, Processing, Completed and Interrupted.
- Local storage usage.
- Settings access.

V1 does not require cross-meeting semantic search. The architecture MUST not prevent adding it later.

### 9.2 Meeting Detail

The meeting detail view contains:

- Overview.
- Transcript.
- Summary.
- Decisions.
- Action Items.
- Open Questions and Risks.
- Memory Objects.
- Assistant conversation.
- Export and Delete actions.

### 9.3 Settings

Settings contain:

- Audio devices.
- Transcription model and language.
- AI provider and model.
- Assistant context/cost controls.
- Recording and retention behavior.
- Keyboard shortcuts.
- Privacy and diagnostics.
- Application version and third-party notices.

## 10. Meeting start and preflight

Selecting Start Meeting opens a preflight panel.

Required fields and checks:

- Optional meeting title.
- Microphone device.
- System-audio capture on/off.
- Input-level meter.
- System-audio test result.
- Language or Auto Detect.
- AI-provider status.
- Available disk space.
- Recording authorization acknowledgement.

The Start button MUST be disabled if:

- No selected audio source is available.
- Required permission is denied.
- The encryption master key cannot be accessed.
- Free disk space is below 500 MiB.
- Another recording is active.

AI provider unavailability MUST NOT prevent recording. The user may record/transcribe and generate the summary later.

## 11. Capture state machine

```mermaid
stateDiagram-v2
    [*] --> READY
    READY --> STARTING: Start
    STARTING --> RECORDING: sources ready
    STARTING --> ACTION_REQUIRED: permission/device failure
    RECORDING --> PAUSING: Pause
    PAUSING --> PAUSED: buffers flushed
    PAUSED --> RECORDING: Resume
    RECORDING --> STOPPING: Stop
    PAUSED --> STOPPING: Stop
    STOPPING --> FINALIZING_TRANSCRIPT
    FINALIZING_TRANSCRIPT --> GENERATING_RESULTS
    GENERATING_RESULTS --> COMPLETED
    GENERATING_RESULTS --> TRANSCRIPT_ONLY: AI unavailable/fails
    RECORDING --> INTERRUPTED: crash/sleep/device loss
    INTERRUPTED --> RECOVERABLE: checkpoint valid
    RECOVERABLE --> GENERATING_RESULTS: user finalizes
    ACTION_REQUIRED --> READY: resolved
```

### 11.1 State requirements

- Pause MUST stop microphone and system-audio collection after buffers are flushed.
- Resume MUST create a visible gap marker and continue monotonic meeting time.
- Stop MUST be available in one interaction from the overlay and tray.
- A configurable global emergency-stop shortcut MUST be provided.
- Only one meeting may be active per installation.
- Closing the main window while recording MUST leave the visible recording panel/tray indicator active.
- Quit while recording MUST require Stop and Finalize or Discard confirmation.

## 12. In-meeting UX

### 12.1 Compact panel

The compact panel MUST show:

```text
● Recording   00:24:16                         [Pause] [Stop]
Mic: MacBook Microphone     System audio: Active

Current topic: Enterprise pricing

Ask about this meeting…
┌──────────────────────────────────────────────────────────┐
│ What objection did the customer raise?                  │
└──────────────────────────────────────────────────────────┘

They are concerned that per-seat pricing becomes expensive
after 200 users. Evidence: 21:42, 22:06
```

Requirements:

- Movable and resizable.
- Always-on-top option.
- Expand/collapse transcript.
- Keyboard shortcut to focus the question box.
- Escape returns focus to the meeting application.
- Streaming answer display.
- Stop remains visible while an answer is generating.
- No process disguise or deceptive system name.

Screen-share exclusion MAY be implemented solely to protect private assistant text, using documented OS window-protection APIs. It MUST NOT hide the fact that recording is active from the local user, alter process names or claim universal invisibility.

### 12.2 Full meeting view

The expanded view SHOULD use three areas:

- Live transcript with timestamps and source label.
- Running meeting state: current topic, decisions and provisional actions.
- Assistant conversation.

The user can click a cited timestamp to jump to the relevant transcript segment.

## 13. Audio capture requirements

### 13.1 Logical tracks

Where supported, capture:

- `microphone`: the local user.
- `system`: remote participants and meeting playback.

Tracks MUST remain logically separate through transcription. They MAY be mixed only for optional local playback/export.

### 13.2 Capture behavior

- Use OS-native sample rates and normalize to the transcription engine’s required format in memory.
- Maintain monotonic timestamps independent of wall-clock changes.
- Write encrypted checkpoints at most every 10 seconds.
- Preserve gap markers for pause, sleep, device loss and permission revocation.
- Handle Bluetooth/headset connection changes without crashing.
- Never silently fall back from combined recording to microphone-only.
- Show an actionable warning within two seconds when a source fails.
- Support at least a two-hour meeting.

### 13.3 macOS

- Prefer CoreAudio Tap on macOS 14.2+.
- Use ScreenCaptureKit only as an explicit fallback.
- Do not capture screen frames.
- Detach capture from the playback output where necessary to avoid Bluetooth route disruption.

### 13.4 Windows

- Use WASAPI loopback for system audio.
- Do not modify the user’s default input/output devices.
- Do not permanently change microphone gain or enhancements.
- Recover when the default audio endpoint changes.

## 14. Live transcription

### 14.1 Default processing

Transcription MUST run locally in V1. Raw audio MUST NOT be sent to a cloud speech provider by default.

### 14.2 Segment contract

```json
{
  "segment_id": "seg_0198...",
  "meeting_id": "mtg_0198...",
  "sequence": 42,
  "start_ms": 12400,
  "end_ms": 16800,
  "source": "microphone",
  "speaker_id": "self",
  "speaker_label": "You",
  "text": "Approved transcript text.",
  "confidence": 0.94,
  "is_final": true,
  "engine": "whisper",
  "model": "model-id"
}
```

### 14.3 Segment rules

- Partial segments may be shown but MUST NOT be persisted as final evidence.
- A final segment is append-only. Corrections create a revision event that retains the original identity.
- Retries MUST not duplicate segments.
- Empty, silence-only and known hallucination segments SHOULD be filtered.
- Overlapping speech from microphone and system tracks MUST not be removed only because timestamps overlap.
- Text-level echo deduplication MAY remove confirmed repeated system audio from the mic track, with an auditable local event.

### 14.4 Latency target

- Partial text visible: p50 under 1.5 seconds, p95 under 3 seconds.
- Final segment: p50 under 3 seconds, p95 under 6 seconds.

## 15. Real-time meeting intelligence

### 15.1 Context layers

The application MUST build assistant context from three layers.

1. **Recent window:** final transcript segments from approximately the last five minutes.
2. **Running state:** a compact structured representation of the meeting so far.
3. **Relevant history:** older segments retrieved locally for the current user question.

The full growing transcript MUST NOT be sent with every question.

### 15.2 Running state schema

```json
{
  "meeting_id": "mtg_0198...",
  "state_version": 7,
  "through_segment_sequence": 142,
  "current_topic": "Enterprise pricing",
  "summary_so_far": "The customer supports the product direction but is concerned about pricing after 200 seats.",
  "topics": [],
  "provisional_decisions": [],
  "provisional_action_items": [],
  "open_questions": [],
  "risks": [],
  "entities": [],
  "updated_at": "2026-08-05T10:30:00Z"
}
```

### 15.3 Update policy

- Update only when new final transcript content exists.
- Baseline trigger: every 60–90 seconds of speech or approximately 800–1,200 new transcript tokens.
- Coalesce updates; never run overlapping state-update requests.
- If the provider is unavailable, continue transcript capture and resume understanding later.
- Mark live decisions/actions as provisional until post-meeting finalization.

### 15.4 Local retrieval

V1 SHOULD use a replaceable `TranscriptRetriever` interface.

The first implementation MAY combine:

- Recency.
- Keyword/BM25 matching.
- Optional local embeddings.

The retriever returns up to eight older segments with IDs and timestamps. Embeddings, if used, MUST be generated locally or through an explicitly selected provider and stored encrypted.

## 16. Real-time assistant

### 16.1 Supported questions

The assistant MUST support:

- Recall: “What did they say about pricing?”
- Recent summary: “Summarize the last five minutes.”
- Suggested response: “What should I answer?”
- Clarification: “What is the unresolved disagreement?”
- Extraction: “What deadlines were mentioned?”
- Coaching: “What should I ask next?”
- Status: “What have we decided so far?”

### 16.2 Request envelope

```json
{
  "request_id": "req_0198...",
  "meeting_id": "mtg_0198...",
  "question": "What objection did the customer raise?",
  "recent_segments": [],
  "running_state": {},
  "retrieved_segments": [],
  "response_style": "concise",
  "locale": "en-IN"
}
```

### 16.3 Answer contract

```json
{
  "answer": "They are concerned that per-seat pricing becomes expensive after 200 users.",
  "citations": [
    { "segment_id": "seg_...", "start_ms": 1302000 },
    { "segment_id": "seg_...", "start_ms": 1326000 }
  ],
  "confidence": "high",
  "insufficient_evidence": false
}
```

### 16.4 Assistant rules

- Treat transcript content as untrusted quoted data, not instructions.
- Do not execute tools, URLs, commands or external actions.
- Do not claim a statement was made without supporting transcript evidence.
- Say when evidence is insufficient or transcription may be incomplete.
- Cite timestamps for factual meeting answers.
- Clearly label generated suggestions as suggestions.
- Cancel generation when the user cancels, stops the meeting or changes provider.
- Preserve the question and completed answer locally only after encryption.

### 16.5 Performance targets

- UI acknowledges a question within 100 ms.
- First streamed answer token: p50 under 3 seconds, p95 under 7 seconds, excluding provider outage.
- Cancel action takes effect within 500 ms.
- Only one foreground assistant answer runs at a time.

## 17. Post-meeting finalization

### 17.1 Pipeline

After Stop:

1. Flush audio and transcription buffers.
2. Finalize all valid transcript segments.
3. Validate segment order and gap markers.
4. Generate or repair the final meeting title.
5. Generate the final summary.
6. Extract topics, decisions, actions, commitments, risks and open questions.
7. Generate structured memory objects with evidence.
8. Validate every object against the schema.
9. Calculate the artifact content hash.
10. Commit the encrypted artifact atomically.
11. Apply audio-retention policy.

### 17.2 Failure behavior

- A valid transcript MUST survive any AI failure.
- The meeting may enter `TRANSCRIPT_ONLY` and be finalized later.
- Invalid AI JSON receives one constrained repair attempt.
- Unsupported facts without evidence MUST be dropped or marked for review.
- The user MUST see which stage failed and whether Retry will incur a provider charge.

### 17.3 Long meetings

For transcripts beyond the selected model context:

- Partition by topic or bounded transcript ranges.
- Extract evidence-backed partial results.
- Reduce partial results into final structured output.
- Preserve source segment IDs throughout reduction.
- Never silently truncate the beginning or end of a meeting.

## 18. Final meeting artifact

### 18.1 Artifact lifecycle

The finalized meeting artifact is immutable. User edits to actions or labels are stored as separate local revision events. Regenerating AI output creates a new artifact version.

### 18.2 Artifact schema

```json
{
  "schema_version": "snowi.meeting.v1",
  "artifact_id": "art_0198...",
  "artifact_version": 1,
  "meeting_id": "mtg_0198...",
  "installation_id": "ins_0198...",
  "source_type": "desktop_meeting",
  "started_at": "2026-08-05T09:30:00Z",
  "ended_at": "2026-08-05T10:15:00Z",
  "timezone": "Asia/Kolkata",
  "language": "en-IN",
  "capture_mode": "microphone_and_system",
  "title": "Product planning meeting",
  "summary": "...",
  "topics": [],
  "decisions": [],
  "action_items": [],
  "risks": [],
  "open_questions": [],
  "memory_objects": [],
  "transcript_segments": [],
  "assistant_interactions": [],
  "processing": {
    "transcription_engine": "whisper",
    "transcription_model": "model-id",
    "assistant_provider": "provider-id",
    "assistant_model": "model-id",
    "prompt_version": "snowi-meeting-1"
  },
  "created_at": "2026-08-05T10:17:00Z",
  "content_sha256": "hex-sha256"
}
```

`installation_id` is a random local identifier. It is not a Snowi account or device credential. V3 may map it to an authenticated device without changing historic artifacts.

### 18.3 Canonicalization

- Encode canonical JSON as UTF-8.
- Sort object keys using the selected canonical JSON implementation.
- Preserve array order where semantically meaningful.
- Exclude `content_sha256` while calculating the hash, then write the hash.
- Record the canonicalization library and version.
- Reject NaN, Infinity, NUL and malformed UTF-8.

## 19. Memory objects

### 19.1 Schema

```json
{
  "schema_version": "snowi.memory.v1",
  "memory_id": "mem_0198...",
  "meeting_id": "mtg_0198...",
  "artifact_id": "art_0198...",
  "type": "action_item",
  "content": "Prepare the revised enterprise pricing proposal.",
  "subject": "user",
  "owner": "You",
  "due_at": "2026-08-08T17:00:00+05:30",
  "status": "open",
  "source_segments": ["seg_0198..."],
  "confidence": 0.91,
  "created_at": "2026-08-05T10:17:00Z",
  "supersedes": null,
  "sync_status": "local_only"
}
```

### 19.2 Supported types

- `decision`
- `action_item`
- `commitment`
- `deadline`
- `project_fact`
- `person_fact`
- `preference`
- `risk`
- `open_question`

### 19.3 Rules

- Every memory object MUST include at least one source segment.
- `person_fact` and `preference` require a higher confidence threshold than ordinary topic extraction.
- V1 memory objects remain local and editable through revision events.
- `sync_status` MUST be `local_only` in V1.
- V3 may add `queued`, `uploaded`, `validated`, `indexed` and `rejected` without changing the base object.

## 20. Action items

The user can:

- Edit title, owner and due date.
- Mark complete or reopen.
- Copy action text.
- Jump to supporting transcript evidence.
- Export selected actions.
- Delete an incorrect action.

Edits MUST create an append-only revision event containing old value, new value and timestamp. V1 does not require user identity because there is only one local user context.

Snowi MUST NOT automatically send, schedule or execute an action in V1.

## 21. Local encrypted storage

### 21.1 Security objective

No transcript, summary, memory object, assistant conversation, meeting title or persisted audio may appear in plaintext on disk.

### 21.2 Key hierarchy

```mermaid
flowchart TD
    A[Random 256-bit installation key] --> B[Protected by macOS Keychain or Windows DPAPI via safeStorage]
    B --> C[Random 256-bit per-meeting data key]
    C --> D[Encrypted audio chunks]
    C --> E[Encrypted transcript and state]
    C --> F[Encrypted artifact and memory objects]
    C --> G[Encrypted assistant interactions]
```

Requirements:

- Generate a random 256-bit installation key on first run.
- Protect it using Electron `safeStorage`, backed by macOS Keychain or Windows DPAPI.
- Fail closed if secure OS protection is unavailable; do not fall back to plaintext key storage.
- Generate a random 256-bit data-encryption key for each meeting.
- Wrap the meeting key with the installation key.
- Encrypt content with AES-256-GCM or XChaCha20-Poly1305.
- Use a unique cryptographically random nonce for every encryption operation.
- Authenticate meeting ID, object type, object ID and schema version as additional authenticated data.
- Never reuse a nonce with the same key.

### 21.3 Database strategy

The local SQLite database MAY store non-content operational fields such as random IDs, state codes, encrypted byte counts and timestamps.

The following MUST be encrypted before being stored in SQLite or files:

- Meeting title.
- Transcript.
- Summary and structured notes.
- Assistant questions and answers.
- Memory objects.
- Participant names.
- Calendar or meeting links if added later.
- Audio and recovery chunks.

V1 MUST NOT build a plaintext SQLite FTS index over meeting content.

### 21.4 File layout

Use the OS-private application-data directory:

```text
Snowi/
  database/app.sqlite
  meetings/<meeting-id>/
    manifest.enc
    keys/wrapped-dek.bin
    audio/mic-000001.enc
    audio/system-000001.enc
    transcript/checkpoint-000001.enc
    state/running-state.enc
    artifact/snowi-meeting-v1.json.enc
  models/
  logs/
  updates/
```

No meeting content may be written to Desktop, Documents, Downloads, shared temporary folders or consumer cloud-sync folders unless the user explicitly exports it.

### 21.5 Atomic persistence

For every content write:

1. Serialize in memory.
2. Encrypt in memory.
3. Write to a temporary file within the same private directory.
4. Flush data.
5. Atomically rename.
6. Commit metadata/checksum transactionally.

### 21.6 Retention

- Default raw-audio deletion: after successful final transcript and artifact creation.
- Optional encrypted raw-audio retention: 1, 7 or 30 days.
- Interrupted meetings are retained encrypted until the user finalizes or deletes them.
- Default local quota: 5 GiB.
- Warn at 80% quota.
- Block new recording below 500 MiB free space.
- Deletion removes encrypted files and wrapped meeting keys.

## 22. Provider and network design

### 22.1 Provider interface

```ts
interface AssistantProvider {
  id: string
  validateCredential(): Promise<ProviderStatus>
  streamAnswer(input: AssistantRequest, signal: AbortSignal): AsyncIterable<AnswerDelta>
  updateMeetingState(input: StateUpdateRequest, signal: AbortSignal): Promise<RunningMeetingState>
  finalizeMeeting(input: FinalizationRequest, signal: AbortSignal): Promise<FinalMeetingResult>
}
```

Provider-specific response objects MUST be normalized inside the adapter and MUST NOT be persisted or logged.

### 22.2 Network allowlist

V1 network requests are limited to:

- User-selected approved AI provider.
- Approved model-download hosts.
- Snowi-controlled signed application-update endpoint, if enabled.

V1 MUST NOT contact:

- OpenWhispr Cloud.
- OpenWhispr analytics/authentication/subscription endpoints.
- Snowi APIs other than an optional update endpoint.
- Arbitrary user-entered API hosts in the first release.

Custom OpenAI-compatible endpoints MAY be added after an SSRF and certificate-validation design review.

### 22.3 TLS

- Use platform-default certificate validation.
- Never install a certificate-verification override.
- Never trust a hostname unconditionally.
- Do not permit plain HTTP except loopback Ollama with explicit user selection.
- Apply timeouts and bounded retries.

## 23. Electron security baseline

Every renderer window MUST use:

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `enableRemoteModule: false`
- A minimal, window-specific preload bridge.

The application MUST:

- Enforce a strict Content Security Policy with no remote scripts.
- Package UI assets locally.
- Deny arbitrary navigation and new-window creation.
- Deny unapproved downloads.
- Avoid `<webview>`.
- Schema-validate every IPC request and response.
- Authorize IPC by sender window and allowed operation.
- Keep filesystem, process spawning and secure-storage access in the main process.
- Pass audio/model helpers fixed arguments, not shell strings.
- Never use `shell: true` for child processes.
- Verify downloaded model/helper checksums before use.
- Sign and notarize macOS builds.
- Sign Windows installers and executables.
- Verify update signatures before installation.
- Remove all process-disguise and “stealth” code inherited from upstream.

## 24. Reliability, performance and diagnostics

### 24.1 Reliability targets

- Two-hour meeting without material audio loss.
- No more than 10 seconds of recoverable transcript/audio loss after process crash.
- Pause/Resume creates no duplicate final transcript segments.
- Device changes do not crash the app.
- Transcript remains available if summary generation fails.
- Reopening the app reconstructs every meeting state from encrypted checkpoints.

### 24.2 Resource targets

Targets are measured on an M1 Mac with 16 GB RAM and a representative Windows 11 x64 laptop with 16 GB RAM:

- Idle background CPU: below 1% average when no capture is active.
- Recording/transcribing CPU: below 35% average where hardware acceleration is available.
- Working memory: target below 1.5 GiB during a one-hour meeting.
- No unbounded growth with transcript length.
- Model and audio buffers use explicit upper bounds.

### 24.3 Logging

Allowed log data:

- State transitions.
- Durations and performance metrics.
- App/OS/model versions.
- Device class without hardware serial number.
- Provider HTTP status category.
- Retry counts and safe error codes.
- Random correlation IDs.

Forbidden log data:

- Transcript text.
- Summaries or memory objects.
- Assistant questions or answers.
- Audio bytes.
- API keys or tokens.
- Meeting titles, links or participant names.
- Provider request/response bodies.

Diagnostics and crash reporting MUST be off by default. Any future opt-in report MUST be previewable and redacted.

## 25. Gate 0: base-repository acceptance

Before feature implementation, the contractor has five working days to prove the selected base.

### 25.1 Required checks

- Build the pinned source on M1 and Windows 11 x64.
- Produce a complete SBOM and third-party/model license list.
- Confirm the forked files are MIT-compatible.
- Scan npm/native dependencies for known vulnerabilities.
- Run secret scanning, CodeQL or equivalent static analysis.
- Identify and remove every upstream network endpoint.
- Verify secrets use OS-protected storage.
- Record a 90-minute Zoom or Meet call on both platforms.
- Prove microphone and system audio are independently present.
- Measure CPU, memory and transcript latency.
- Verify no unexpected outbound traffic.

### 25.2 Gate result

Proceed with OpenWhispr if:

- Audio capture is reliable on both operating systems.
- No unmitigated Critical or High security issue remains.
- License provenance is acceptable.
- Upstream cloud/product functionality can be cleanly disabled.
- Resource use meets or can reasonably meet V1 targets.

If the gate fails, stop work on the OpenWhispr fork and repeat the same product contracts on the Meetily/Tauri fallback. Do not attempt to merge both codebases.

## 26. Internal module architecture

```mermaid
flowchart LR
    subgraph Renderer[Sandboxed renderer]
      UI[Meeting UI and overlay]
      VM[View models]
    end

    subgraph Main[Electron main process]
      ORCH[Meeting orchestrator]
      IPC[Validated IPC gateway]
      STORE[Encrypted meeting store]
      CTX[Context and retrieval engine]
      LLM[AI provider adapters]
      SEC[Secure key service]
      LIFE[Retention and recovery]
    end

    subgraph Helpers[Constrained native helpers]
      MAC[macOS audio helper]
      WIN[Windows audio helper]
      ASR[Local transcription runtime]
    end

    UI <--> VM
    VM <--> IPC
    IPC <--> ORCH
    ORCH <--> MAC
    ORCH <--> WIN
    ORCH <--> ASR
    ORCH <--> CTX
    CTX <--> LLM
    ORCH <--> STORE
    STORE <--> SEC
    LIFE <--> STORE
```

### 26.1 Required boundaries

- `CaptureSource`: produces timestamped audio frames and health events.
- `TranscriptionEngine`: produces normalized partial/final transcript events.
- `MeetingOrchestrator`: owns the state machine and coordinates persistence.
- `ContextEngine`: maintains recent context, running state and retrieval.
- `AssistantProvider`: performs provider-specific AI calls.
- `ArtifactFinalizer`: validates and canonicalizes immutable output.
- `EncryptedMeetingStore`: owns encrypted persistence and recovery.
- `RetentionService`: enforces quota and deletion policy.
- `FutureSyncAdapter`: defined as an inactive interface only; no V1 network implementation.

## 27. Internal event contract

All core events SHOULD use a versioned envelope:

```json
{
  "event_version": 1,
  "event_id": "evt_0198...",
  "meeting_id": "mtg_0198...",
  "type": "transcript.segment.finalized",
  "sequence": 142,
  "occurred_at": "2026-08-05T10:03:12.125Z",
  "payload": {}
}
```

Required event families:

- `meeting.*`
- `capture.*`
- `transcript.*`
- `assistant.*`
- `understanding.*`
- `artifact.*`
- `storage.*`
- `retention.*`

Events stored for recovery MUST be encrypted. Event handlers MUST be idempotent by `event_id`.

## 28. Future V2 compatibility

V2 may add optional always-aware device capture: screen frames, OCR, application activity and longer-running audio.

V1 MUST prepare for V2 by:

- Keeping `CaptureSource` independent from meeting orchestration.
- Including `source_type` and capture-scope metadata.
- Keeping audio, screen and application permissions separately consented.
- Using bounded encrypted chunks and retention policies.
- Allowing additional artifact types without changing `snowi.meeting.v1`.
- Keeping screen/OCR code completely absent from the V1 capture path.

V2 MUST remain opt-in and must not silently change V1 meeting recording behavior.

## 29. Future V3 compatibility

V3 may add Snowi authentication, encrypted synchronization, OpenClaw ingestion and Telegram recall.

V1 MUST prepare for V3 by:

- Generating globally unique meeting, artifact and memory IDs.
- Producing immutable artifacts with a canonical content hash.
- Keeping `installation_id` random and stable.
- Including `schema_version`, `artifact_version` and `sync_status` fields.
- Keeping local user edits as revision events.
- Providing an inactive `FutureSyncAdapter` interface.
- Separating encrypted local storage from future transport code.

V1 MUST NOT implement placeholder Snowi tokens, hidden cloud calls or hard-coded bot identifiers.

Proposed future interface only:

```ts
interface FutureSyncAdapter {
  enqueue(artifactId: string): Promise<void>
  getStatus(
    artifactId: string,
  ): Promise<'local_only' | 'queued' | 'uploaded' | 'indexed' | 'failed'>
  cancel(artifactId: string): Promise<void>
}
```

## 30. Error experience

Errors MUST state what happened, what was preserved and what the user can do.

Examples:

| Condition                  | Required user experience                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| System audio unavailable   | Show “System audio stopped”; continue mic only only after explicit confirmation. Mark the gap. |
| Microphone disconnected    | Show source error within two seconds and allow device selection.                               |
| AI key invalid             | Keep recording/transcript active; offer Replace key or Use local model.                        |
| Provider rate limited      | Show retry time; do not issue rapid retries.                                                   |
| Disk nearly full           | Warn, offer audio cleanup, and block new recording below threshold.                            |
| App crash                  | Recover encrypted checkpoints and offer Finalize or Delete interrupted meeting.                |
| Summary failure            | Preserve transcript; allow retry without retranscribing.                                       |
| Secure storage unavailable | Do not create or open meetings; explain that encrypted data cannot be safely accessed.         |

## 31. Testing and acceptance

### 31.1 Functional acceptance

- Start, Pause, Resume and Stop work from main view and compact panel.
- Combined mic/system capture works on physical macOS and Windows hardware.
- Live transcript remains ordered and deduplicated.
- User can ask questions while recording.
- Answers use recent and older meeting evidence and show timestamps.
- Post-meeting summary and actions complete successfully.
- Every memory object links to source segments.
- Actions can be edited, completed and exported.
- Deleting a meeting removes its encrypted files and wrapped key.

### 31.2 Security acceptance

- No meeting content is discoverable through plaintext disk search.
- No API key appears in database, files, logs or crash reports.
- Renderer cannot access Node, filesystem or secure storage directly.
- IPC rejects unknown senders, methods and invalid schemas.
- No certificate-validation bypass exists.
- No unexpected outbound network traffic exists.
- Downloaded native helpers/models pass checksum validation.
- No unmitigated Critical/High dependency finding remains.
- Installers are signed; macOS is notarized.

### 31.3 Reliability scenarios

- Two-hour meeting.
- Pause/Resume ten times.
- AirPods connect/disconnect.
- Default audio device changes.
- System sleeps and wakes.
- Permission revoked mid-meeting.
- Provider offline/rate limited.
- Application force-quit and recovery.
- Disk fills during recording.
- 20 sequential meetings in one day.
- Transcript contains prompt-injection instructions.

### 31.4 Performance evidence

The contractor MUST provide a results table containing:

- Device and OS.
- Meeting duration.
- Audio sources.
- Transcription model.
- CPU average/peak.
- Memory average/peak.
- Partial/final transcript latency p50/p95.
- Assistant first-token latency p50/p95.
- Dropped/gap duration.
- Finalization duration.

## 32. Implementation milestones

### Milestone 0 — Base audit and proof, 1 week

- Pin and fork OpenWhispr.
- Complete license/security/network inventory.
- Build on macOS and Windows.
- Prove 90-minute dual-source capture.
- Confirm go/no-go.

### Milestone 1 — Reduced Snowi shell and secure foundation, 1–2 weeks

- Remove upstream cloud, auth, subscription, telemetry and unrelated features.
- Apply Snowi branding and app identifiers.
- Harden Electron windows and IPC.
- Implement secure key service and encrypted meeting store.
- Establish CI and signed development builds.

### Milestone 2 — Reliable meeting capture, 2 weeks

- Implement complete capture state machine.
- Start/Pause/Resume/Stop and emergency stop.
- Dual-source capture, health events and encrypted checkpoints.
- Live local transcription and recovery.

### Milestone 3 — Real-time copilot, 2–3 weeks

- Compact panel and full meeting view.
- Provider adapters and streaming answers.
- Recent/running/retrieved context engine.
- Timestamp citations and prompt-injection defenses.

### Milestone 4 — Finalization, actions and memory, 2 weeks

- Final summary pipeline.
- Decisions, actions, risks and memory objects.
- Immutable artifact and revision events.
- Meeting detail, export, retention and delete.

### Milestone 5 — Hardening and release candidate, 2 weeks

- Full platform test matrix.
- Performance tuning.
- Dependency/security remediation.
- Signing, notarization and update signing.
- Contractor handoff and documentation.

Expected V1 range: approximately 9–12 weeks for one experienced contractor, depending on Gate 0 results, supported provider count and Windows audio issues.

## 33. Contractor deliverables

The contractor MUST deliver:

- Snowi-controlled source repository with clean history.
- `UPSTREAM.md`, `THIRD_PARTY_NOTICES.md` and SBOM.
- Reproducible macOS and Windows build instructions.
- CI workflows with tests and security scanning.
- Signed release-candidate installers.
- Architecture decision records.
- Internal event and artifact JSON Schemas.
- Provider-adapter interface and test adapter.
- Automated unit, integration and end-to-end tests.
- Mock transcript/provider fixtures containing no real user data.
- Threat model and network-egress inventory.
- Performance and two-hour reliability report.
- Crash-recovery and retention test report.
- Release, rollback and updater documentation.
- Known limitations and unresolved-risk register.

## 34. Definition of done

V1 is complete only when:

- Product acceptance tests pass on physical macOS Apple Silicon and Windows x64.
- A two-hour dual-source meeting completes without material loss.
- The user can ask grounded questions during the meeting.
- Final summary, actions and memory objects contain timestamp evidence.
- All sensitive local content is encrypted at rest.
- Provider secrets are protected by the OS credential system.
- The application makes no unapproved network request.
- No High/Critical security issue remains unmitigated.
- Installers are signed and macOS is notarized.
- The immutable artifact and revision contracts are documented and tested.
- V1 works entirely without Snowi authentication or cloud availability.

## 35. Defaults requiring Product approval before release

Implementation may start with the defaults below. Product must approve them before release:

- Cloud AI providers: OpenAI-compatible plus Anthropic.
- Local AI provider: Ollama.
- Default transcription: recommended local model selected by hardware.
- Recent context window: five minutes.
- Running-state update: 60–90 seconds of speech.
- Retrieved historical segments: maximum eight.
- Raw-audio retention: delete after successful finalization.
- Local storage quota: 5 GiB.
- Emergency-stop shortcut: configurable, with OS conflict detection.
- Meeting artifact schema: `snowi.meeting.v1`.
- Memory object schema: `snowi.memory.v1`.

---

**Implementation boundary:** The contractor owns the V1 local desktop application only. No Snowi production access, internal bot architecture, cloud credentials or OpenClaw access is required or permitted.
