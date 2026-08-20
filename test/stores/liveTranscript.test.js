const test = require("node:test");
const assert = require("node:assert/strict");

async function load() {
  return await import("../../src/stores/meetingRecordingStore.ts");
}

const seg = (id, text, overrides = {}) => ({
  id,
  text,
  source: "mic",
  timestamp: 1_760_000_000_000,
  ...overrides,
});

test("says nothing once recording has stopped", async () => {
  const { useMeetingRecordingStore, selectLiveNoteTranscript } = await load();

  // `recordingNoteId` is never cleared at Stop, so it alone would keep claiming
  // this note forever — and the live segments it hands back predate diarization
  // and any manual speaker rename. After Stop the note's stored transcript is
  // the better copy, so this has to stand down.
  useMeetingRecordingStore.setState({
    isRecording: false,
    recordingNoteId: 7,
    segments: [seg("a", "pre-diarization text")],
    transcript: "",
  });

  assert.equal(selectLiveNoteTranscript(7), "");
});

test("returns the live transcript only for the note that is recording", async () => {
  const { useMeetingRecordingStore, selectLiveNoteTranscript } = await load();

  useMeetingRecordingStore.setState({
    isRecording: true,
    recordingNoteId: 7,
    segments: [seg("a", "hello there")],
    transcript: "",
  });

  assert.match(selectLiveNoteTranscript(7), /hello there/);
  // A different note is not the one recording — returning its neighbour's
  // transcript would write up the wrong meeting.
  assert.equal(selectLiveNoteTranscript(8), "");
  assert.equal(selectLiveNoteTranscript(null), "");
  assert.equal(selectLiveNoteTranscript(undefined), "");
});

test("falls back to main's transcript once Stop has cleared the segments", async () => {
  const { useMeetingRecordingStore, selectLiveNoteTranscript } = await load();

  useMeetingRecordingStore.setState({
    isRecording: true,
    recordingNoteId: 7,
    segments: [],
    transcript: "what main decided the meeting said",
  });

  assert.equal(selectLiveNoteTranscript(7), "what main decided the meeting said");
});

test("the store's transcript field stays empty while segments arrive", async () => {
  const { useMeetingRecordingStore, selectLiveNoteTranscript } = await load();

  // The contract after moving the join off the event path: `transcript` holds
  // main's authoritative text from Stop and nothing else. A caller that reads
  // it expecting live text gets an empty string — which is why the field is
  // documented and why callers go through selectLiveNoteTranscript instead.
  useMeetingRecordingStore.setState({
    isRecording: true,
    recordingNoteId: 7,
    segments: [seg("a", "live words")],
    transcript: "",
  });

  assert.equal(useMeetingRecordingStore.getState().transcript, "");
  assert.match(selectLiveNoteTranscript(7), /live words/);
});

test("meetingHasContent sees live segments before Stop fills the transcript", async () => {
  const { useMeetingRecordingStore, meetingHasContent } = await load();

  useMeetingRecordingStore.setState({ segments: [], transcript: "" });
  assert.equal(meetingHasContent(), false);

  // Whitespace-only speech is not content — otherwise an empty meeting leaves a
  // titled, empty note behind.
  useMeetingRecordingStore.setState({ segments: [seg("a", "   ")] });
  assert.equal(meetingHasContent(), false);

  useMeetingRecordingStore.setState({ segments: [seg("a", "something said")] });
  assert.equal(meetingHasContent(), true);

  // And after Stop, when main's transcript is what survives.
  useMeetingRecordingStore.setState({ segments: [], transcript: "final text" });
  assert.equal(meetingHasContent(), true);
});
