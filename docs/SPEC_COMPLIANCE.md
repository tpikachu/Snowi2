# V1 spec compliance tracker

Living status of this fork against
`Snowi_Desktop_Meeting_Copilot_V1_Contractor_Spec_v1.0.md`. Update it in the
same commit that changes status — it doubles as the §33 "known limitations and
unresolved-risk register".

Status: **Done** · **Partial** · **Missing** · **Waived** (recorded owner decision)

## Owner decisions on record

| Decision                      | Choice                                                                                                                               | Date       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Dictation feature             | Kept in full, beyond spec scope                                                                                                      | 2026-08-18 |
| Calendar integrations         | Kept, documented exception to §22.2                                                                                                  | 2026-08-17 |
| Linux                         | Code kept, not shipped or QA'd (§6 does not require it)                                                                              | 2026-08-17 |
| Updater                       | Disabled for now (§22.2 update endpoint optional)                                                                                    | 2026-08-17 |
| Encryption scope              | Meetings become a new encrypted entity; notes/snippets stay plaintext with FTS5                                                      | 2026-08-19 |
| First milestone               | M1 security foundation                                                                                                               | 2026-08-19 |
| Panel screen-share exclusion  | Whole panel window protected, not just assistant text — see note below                                                               | 2026-08-19 |
| Home information architecture | Home is a meeting dashboard (now / next / recent / readiness); Notes stays the single library                                        | 2026-08-19 |
| Detected-meeting pre-roll     | Buffer 45s only while a detection prompt is on screen; not always-on                                                                 | 2026-08-19 |
| Memory vs notes               | Separate stores, one retrieval path — a note is a document, a memory object is a claim whose truth changes                           | 2026-08-19 |
| Memory storage split          | Content sealed under the meeting key; type/status/subject/due date indexed in SQLite so open work is a query, not a decrypt-and-scan | 2026-08-19 |
| Tiering                       | Free: local only. Paid: sync the local store and use cloud storage. Nothing syncs in V1                                              | 2026-08-19 |
| Code signing                  | Ship unsigned until certificates exist; CI warns and records it rather than failing the build                                        | 2026-08-19 |
| Packaging CI                  | Installers build on tag (release.yml) or manual dispatch, not on every push                                                          | 2026-08-19 |

## §2–§9 Fork, scope, onboarding

| Item                                   | Status  | Notes                                                             |
| -------------------------------------- | ------- | ----------------------------------------------------------------- |
| §2.3 fork policy, `UPSTREAM.md`        | Done    | Commit, license and native binaries recorded                      |
| §2.3 `THIRD_PARTY_NOTICES.md`, SBOM    | Missing | Neither file exists                                               |
| §4.2 out-of-scope surface removed      | Partial | Cloud/auth/telemetry gone; YouTube/URL audio import still present |
| §8.1 first-run privacy acknowledgement | Partial | Onboarding exists; no affirmative recording-consent gate          |
| §8.4 secrets in OS-protected storage   | Done    | `secretCrypto.js` → Keychain/DPAPI, never in SQLite or `.env`     |
| §9.1 meeting library                   | Missing | Meetings are notes; no library, filters or storage-usage view     |

## §10–§13 Capture

| Item                                    | Status  | Notes                                                                                                               |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| §10 preflight panel and Start gating    | Partial | Home's readiness panel answers mic/system-audio/model/calendar; no disk-space or key gate, and nothing blocks Start |
| §10 detected-meeting pre-roll           | Done    | 45s in-memory window while a prompt is up; opt-out in Settings — see decision below                                 |
| §11 capture state machine               | Partial | Pause/Resume with gap markers; no PAUSING/FINALIZING states yet                                                     |
| §11.1 emergency-stop shortcut           | Missing |                                                                                                                     |
| §11.1 stop asks keep-or-discard         | Done    | Empty meetings lead with Discard; Enter never destroys                                                              |
| §11.1 quit-while-recording confirmation | Missing |                                                                                                                     |
| §12.1 compact always-on-top panel       | Partial | Floating panel: state, clock, sources, Pause/Stop. No question box                                                  |
| §12.1 movable and resizable             | Done    | Frameless drag region; real min/max bounds                                                                          |
| §12.1 screen-share exclusion            | Done    | `setContentProtection` on the panel window — see decision below                                                     |
| §12.1 question box + streaming answer   | Missing | Depends on §15/§16; the panel has room reserved for it                                                              |
| §12.1 expand/collapse transcript        | Missing |                                                                                                                     |
| §12.1 focus-question shortcut / Escape  | Missing | Lands with the question box                                                                                         |
| §12.2 full meeting view                 | Missing | Three-area expanded view not started                                                                                |
| §13.1 separate mic/system tracks        | Done    | CoreAudio tap (macOS), WASAPI process loopback (Windows)                                                            |
| §13.2 encrypted checkpoints ≤10s        | Missing | Store now exists (§21); nothing writes to it yet                                                                    |

## §14–§20 Transcription, intelligence, artifact

| Item                                  | Status  | Notes                                                                                                            |
| ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| §14.1 local-first transcription       | Done    | whisper.cpp / Parakeet default; no cloud audio by default                                                        |
| §14.2 segment contract                | Partial | Persisted segments are addressable rows (`meeting_segments`); the live `is_final` contract is still absent       |
| §15 running meeting state             | Missing |                                                                                                                  |
| §15.4 `TranscriptRetriever`           | Missing | Qdrant + FTS5 exist for notes, not as this interface                                                             |
| §16 in-meeting assistant + citations  | Partial | Post-meeting chat is grounded and cites notes (clickable, persisted); no in-meeting assistant                    |
| §17 finalization pipeline             | Missing |                                                                                                                  |
| §18 immutable artifact + content hash | Missing |                                                                                                                  |
| §19 memory objects                    | Done    | Schema, consolidation, encrypted/indexed split, extraction at Stop with cited evidence, pinned profile in chat   |
| §20 action items + revision events    | Partial | Extracted and stored with due dates, owners and evidence; queryable. No UI, edits, completion or revision events |

## §21 Local encrypted storage

| Item                                 | Status  | Notes                                                                                           |
| ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| §21.2 key hierarchy, fail-closed     | Done    | `meetingKeyService.js` — installation key → per-meeting DEK                                     |
| §21.2 AES-256-GCM with AAD binding   | Done    | `meetingCrypto.js` — binds meeting, type, id, schema; header in AAD                             |
| §21.4 file layout                    | Done    | `encryptedMeetingStore.js`                                                                      |
| §21.5 atomic persistence             | Done    | `atomicWrite.js` — temp → fsync → rename                                                        |
| §21.6 deletion removes files + key   | Done    | `deleteMeeting()` destroys the wrapped DEK first                                                |
| §21.1 no plaintext content on disk   | Partial | Memory objects are the first producer writing through it; transcripts and audio still plaintext |
| §21.3 no plaintext FTS over meetings | Missing | `notes_fts` indexes meeting transcripts today                                                   |
| §21.6 retention, quota, 500 MiB gate | Missing | `usageBytes()` exists; no policy on top                                                         |

## §22–§24 Network, Electron, diagnostics

| Item                                      | Status  | Notes                                                                      |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------- |
| §22.3 TLS, no cert override               | Done    | No `rejectUnauthorized` / `setCertificateVerifyProc` anywhere              |
| §22.2 network allowlist                   | Partial | Calendar waived; YouTube/URL import out of scope; no enforcement layer     |
| §23 `contextIsolation`, `nodeIntegration` | Done    | All windows                                                                |
| §23 `sandbox: true`                       | Partial | Control panel and agent overlay run `sandbox: false`                       |
| §23 `webSecurity`                         | Missing | Disabled on two windows; provider calls run in the renderer from `file://` |
| §23 Content Security Policy               | Missing | No CSP anywhere                                                            |
| §23 navigation / new-window denial        | Partial | Control panel only                                                         |
| §23 IPC schema validation + sender auth   | Missing | 405 handlers, no validation                                                |
| §24.1 crash recovery ≤10s loss            | Missing |                                                                            |
| §24.3 logging allowlist                   | Partial | Not yet audited against the forbidden-data list                            |

## Milestone plan

**M1 — security foundation (current)**

1. ✅ §21.2/§21.4/§21.5 key service, content crypto, encrypted store, atomic writes
2. Meeting entity: operational-only SQLite row + `meetings/<id>/` content, `notes_fts` no longer sees meeting text (§21.3)
3. Move AI provider HTTP into the main process (§26 `AssistantProvider` boundary) — the prerequisite for the next item
4. `webSecurity: true`, `sandbox: true`, strict CSP, navigation/new-window/download denial on every window (§23)
5. IPC gateway: schema validation + sender authorization (§23)
6. `THIRD_PARTY_NOTICES.md` + SBOM (§33)

**M2 — capture reliability.** §11 state machine with Pause/Resume and gap
markers, emergency stop, quit guard, §13.2 encrypted checkpoints, §24.1
crash recovery, §10 preflight and disk gating, §21.6 retention and quota.

**M3 — real-time copilot.** §14.2 segment contract, §15 running state and
`TranscriptRetriever`, §16 assistant with citations and prompt-injection
defences, §12 compact panel with question box.

**M4 — finalization and memory.** §17 pipeline, §18 immutable artifact with
canonical hash, §19 memory objects, §20 action items and revision events.

**M5 — hardening and release.** §24.2 resource targets, §24.3 logging audit,
§31 acceptance matrix, signing and notarization.

## Open risks

- **Meetings-as-notes.** The fork has no meeting entity; §18 and §9.1 still need
  one. §19 no longer does: memory objects carry their own `meeting_id`, minted
  when a note first produces memory, so the eventual meeting entity adopts that
  id rather than reconciling a second one.
- **Memory rows outlive their content.** Deleting a note removes its memory rows
  by trigger, but the sealed document for that meeting is only removed when the
  meeting itself is deleted, which nothing calls yet. The orphan is unreadable
  ciphertext rather than a leak, but it is disk that is never reclaimed.
- **`webSecurity: false` is load-bearing.** Provider calls run in the renderer
  from a `file://` origin, so the flag cannot simply be flipped — the adapters
  have to move into main first (M1.3 before M1.4).
- **FTS5 over meeting content** violates §21.3 today and is fixed only once
  meetings stop being notes.
- **The pre-roll captures before consent, by design.** A meeting detected
  for you has already started, so accepting a prompt otherwise begins
  mid-sentence. The window is bounded on every axis instead: it opens only
  while a prompt is actually asking, holds 45s in memory, never touches disk,
  is destroyed on dismiss or timeout, self-expires after 5 minutes if an
  outcome never arrives, and can be turned off in Settings. An always-on
  buffer was considered and rejected — it would light the OS microphone
  indicator whenever a meeting app was open, with no prompt to explain why.
- **Panel content protection is coarser than §12.1 allows.** The spec permits
  screen-share exclusion "solely to protect private assistant text". Electron's
  `setContentProtection` is per-window, so the only options are to protect the
  whole panel — status row, clock and controls included — or to protect none of
  it and keep assistant answers in a separate window. The whole panel is
  protected today. This does not conceal recording from the local user, which
  is what §12.1 actually forbids, but it does keep the recording indicator out
  of a shared screen. Revisit if the assistant text moves to its own surface.
