import ReasoningService from "../services/ReasoningService";
import { getSettings, selectResolvedLLMConfig } from "../stores/settingsStore";
import {
  MEMORY_EXTRACTION_PROMPT,
  formatSegmentsForExtraction,
  parseExtractionResponse,
  pruneUnknownCitations,
  type ExtractableSegment,
} from "../utils/memoryExtraction";
import type { MeetingSpeakerLabels } from "../utils/meetingNoteInput";
import type { MemoryIngestSummary } from "../types/electron";
import logger from "../utils/logger";

/**
 * Extracts memory objects from a finished meeting and hands them to main.
 *
 * Runs alongside note generation at Stop rather than as a second user-visible
 * step: both read the same transcript, and a meeting the user has walked away
 * from should still produce its commitments.
 *
 * Deliberately fire-and-forget and deliberately quiet. Memory is an
 * enhancement — a meeting whose extraction fails still has its transcript, its
 * notes and its audio, so nothing here interrupts the user.
 *
 * It reads segments back from `meeting_segments` rather than from the store's
 * in-memory array, because the ids the model is asked to cite have to be the
 * ones a citation will later resolve against.
 */
export async function generateMeetingMemory(args: {
  noteId: number;
  speakerLabels: MeetingSpeakerLabels;
}): Promise<MemoryIngestSummary | null> {
  try {
    const rows = (await window.electronAPI?.getNoteSegments?.(args.noteId)) ?? [];
    if (rows.length === 0) return null;

    const config = selectResolvedLLMConfig(getSettings(), "actions");
    if (!config.model) {
      logger.info("Skipping memory extraction — no note formatting model", {}, "memory");
      return null;
    }

    const segments: ExtractableSegment[] = rows.map((row) => ({
      id: row.id,
      text: row.text,
      source: row.source === "mic" ? "mic" : "system",
      speakerName: row.speaker_name,
      startMs: row.start_ms,
    }));

    const transcript = formatSegmentsForExtraction(segments, args.speakerLabels);
    if (!transcript.trim()) return null;

    const response = await ReasoningService.processText(transcript, config.model, null, {
      systemPrompt: MEMORY_EXTRACTION_PROMPT,
      provider: config.provider,
      inferenceScope: "actions",
      // Extraction is a transcription task, not a creative one: the same
      // meeting should yield the same objects, or consolidation sees a
      // reworded duplicate as a new claim every time.
      temperature: 0,
      baseUrl: config.cloudBaseUrl || undefined,
      lanUrl: config.remoteUrl || undefined,
      customApiKey: config.customApiKey || undefined,
    });

    // Two independent guards, because they catch different lies. Pruning drops
    // citations the model invented; ingest then re-validates types, confidence
    // and evidence before anything is stored.
    const objects = pruneUnknownCitations(
      parseExtractionResponse(response),
      rows.map((row) => row.id)
    );
    if (objects.length === 0) return null;

    const summary = await window.electronAPI?.ingestMemory?.({ noteId: args.noteId, objects });
    if (summary) {
      logger.info(
        "Extracted meeting memory",
        {
          noteId: args.noteId,
          inserted: summary.inserted,
          superseded: summary.superseded,
          duplicates: summary.duplicates,
          rejected: summary.rejected.length,
        },
        "memory"
      );
    }
    return summary ?? null;
  } catch (error) {
    logger.warn("Memory extraction failed", { error: (error as Error).message }, "memory");
    return null;
  }
}
