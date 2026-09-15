// Routing rules for meeting-diarization-complete events (issue #1495): a result
// must be persisted to the note that owns the recording session, never to
// whichever note happens to be rendered when the event arrives.
//
// Persistence runs at store level (meetingRecordingStore) so results survive the
// notes view unmounting; `isCurrentSession` gates only the publish to the UI.

export interface DiarizationCompletionPlan {
  targetNoteId: number | null;
  isCurrentSession: boolean;
}

export function resolveDiarizationTarget(params: {
  payloadNoteId?: number | null;
  payloadSessionId?: string | null;
  currentSessionId: string | null;
}): DiarizationCompletionPlan {
  const { payloadNoteId, payloadSessionId, currentSessionId } = params;

  return {
    targetNoteId: payloadNoteId ?? null,
    // A null current session means nothing newer is pending, so publishing is
    // safe and clearing a waiting spinner prevents it from getting stuck.
    isCurrentSession: currentSessionId == null || payloadSessionId === currentSessionId,
  };
}

export function selectBaseSegments<Segment>(params: {
  persistedSegments: Segment[] | null;
  liveSegments: Segment[];
  recordingNoteId: number | null;
  targetNoteId: number;
}): Segment[] {
  const { persistedSegments, liveSegments, recordingNoteId, targetNoteId } = params;

  if (persistedSegments) return persistedSegments;
  // Live segments belong to the recording note; merging them into any other
  // note would cross-contaminate transcripts.
  if (recordingNoteId === targetNoteId && liveSegments.length > 0) return liveSegments;
  return [];
}

/**
 * The archive pass replaces a session's transcript rather than annotating it.
 *
 * Its lines are new segments with new ids and better text, so a merge that
 * matches by id or by text (mergeTranscriptSegments) would keep every live
 * line and append every refined one — the meeting twice over. A resumed
 * note's earlier sessions must survive, though, and they are the segments
 * stamped before this session began: `replaceSince` is the session's start,
 * and everything at or after it is the session being replaced. Segments
 * without a stamp are kept — a legacy transcript is not this session's.
 */
export function replaceSessionSegments<Segment extends { timestamp?: number }>(params: {
  base: Segment[];
  incoming: Segment[];
  replaceSince: number;
}): Segment[] {
  const { base, incoming, replaceSince } = params;
  const kept = base.filter(
    (segment) => segment.timestamp == null || segment.timestamp < replaceSince
  );
  return [...kept, ...incoming];
}
