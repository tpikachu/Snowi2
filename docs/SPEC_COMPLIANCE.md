# V1 spec compliance tracker

Living status of this fork against
`Snowi_Desktop_Meeting_Copilot_V1_Contractor_Spec_v1.0.md`. Update it in the
same commit that changes status — it doubles as the §33 "known limitations and
unresolved-risk register".

Status: **Done** · **Partial** · **Missing** · **Waived** (recorded owner decision)

## Owner decisions on record

| Decision              | Choice                                                                          | Date       |
| --------------------- | ------------------------------------------------------------------------------- | ---------- |
| Dictation feature     | Kept in full, beyond spec scope                                                 | 2026-08-18 |
| Calendar integrations | Kept, documented exception to §22.2                                             | 2026-08-17 |
| Linux                 | Code kept, not shipped or QA'd (§6 does not require it)                         | 2026-08-17 |
| Updater               | Disabled for now (§22.2 update endpoint optional)                               | 2026-08-17 |
| Encryption scope      | Meetings become a new encrypted entity; notes/snippets stay plaintext with FTS5 | 2026-08-19 |
| First milestone       | M1 security foundation                                                          | 2026-08-19 |

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

| Item                                    | Status  | Notes                                                           |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| §10 preflight panel and Start gating    | Missing | No preflight; no disk-space or key-availability gate            |
| §11 capture state machine               | Partial | Pause/Resume with gap markers; no PAUSING/FINALIZING states yet |
| §11.1 emergency-stop shortcut           | Missing |                                                                 |
| §11.1 stop asks keep-or-discard         | Done    | Empty meetings lead with Discard; Enter never destroys          |
| §11.1 quit-while-recording confirmation | Missing |                                                                 |
| §12.1 compact always-on-top panel       | Partial | `MeetingRecordingPill` shows state; no question box             |
| §13.1 separate mic/system tracks        | Done    | CoreAudio tap (macOS), WASAPI process loopback (Windows)        |
| §13.2 encrypted checkpoints ≤10s        | Missing | Store now exists (§21); nothing writes to it yet                |

## §14–§20 Transcription, intelligence, artifact

| Item                                  | Status  | Notes                                                     |
| ------------------------------------- | ------- | --------------------------------------------------------- |
| §14.1 local-first transcription       | Done    | whisper.cpp / Parakeet default; no cloud audio by default |
| §14.2 segment contract                | Missing | No `segment_id` / `sequence` / `is_final` contract        |
| §15 running meeting state             | Missing |                                                           |
| §15.4 `TranscriptRetriever`           | Missing | Qdrant + FTS5 exist for notes, not as this interface      |
| §16 in-meeting assistant + citations  | Missing | Chat agent exists but is not meeting-grounded             |
| §17 finalization pipeline             | Missing |                                                           |
| §18 immutable artifact + content hash | Missing |                                                           |
| §19 memory objects                    | Missing |                                                           |
| §20 action items + revision events    | Missing | `actions` table is AI prompt presets, not action items    |

## §21 Local encrypted storage

| Item                                 | Status  | Notes                                                               |
| ------------------------------------ | ------- | ------------------------------------------------------------------- |
| §21.2 key hierarchy, fail-closed     | Done    | `meetingKeyService.js` — installation key → per-meeting DEK         |
| §21.2 AES-256-GCM with AAD binding   | Done    | `meetingCrypto.js` — binds meeting, type, id, schema; header in AAD |
| §21.4 file layout                    | Done    | `encryptedMeetingStore.js`                                          |
| §21.5 atomic persistence             | Done    | `atomicWrite.js` — temp → fsync → rename                            |
| §21.6 deletion removes files + key   | Done    | `deleteMeeting()` destroys the wrapped DEK first                    |
| §21.1 no plaintext content on disk   | Partial | Store enforces it; **no producer writes through it yet**            |
| §21.3 no plaintext FTS over meetings | Missing | `notes_fts` indexes meeting transcripts today                       |
| §21.6 retention, quota, 500 MiB gate | Missing | `usageBytes()` exists; no policy on top                             |

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

- **Meetings-as-notes.** The fork has no meeting entity; §18/§19 and §21 all
  need one. Building any of them on the notes schema means building it twice.
- **`webSecurity: false` is load-bearing.** Provider calls run in the renderer
  from a `file://` origin, so the flag cannot simply be flipped — the adapters
  have to move into main first (M1.3 before M1.4).
- **FTS5 over meeting content** violates §21.3 today and is fixed only once
  meetings stop being notes.
