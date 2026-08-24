import { resolvePrompt } from "./prompts/index";

export {
  resolvePrompt,
  getDefaultPromptText,
  appendDictionarySuffix,
  appendScreenContextSuffix,
  wrapCleanupTranscript,
} from "./prompts/index";
export { PROMPT_KINDS, PROMPT_KIND_LIST, type PromptKind } from "./prompts/registry";
export { detectAgentName } from "./agentDetection";

export function getCleanupSystemPrompt(
  agentName: string | null,
  customDictionary?: string[],
  language?: string,
  uiLanguage?: string
): string {
  return resolvePrompt("cleanup", { agentName, language, customDictionary, uiLanguage });
}

export function getWordBoost(customDictionary?: string[]): string[] {
  if (!customDictionary || customDictionary.length === 0) return [];
  return customDictionary.filter((w) => w.trim());
}

const TOOL_INSTRUCTIONS: Record<string, string> = {
  search_notes:
    "Use search_notes to find information from the user's past meetings, discussions, or personal notes before answering from memory.",
  list_meetings:
    "Use list_meetings for any question about which meetings happened or how many — counts, date ranges, or enumerating them. search_notes returns only the closest few matches and can never tell you how many exist, so never count its results. When list_meetings reports a total larger than the number of meetings it listed, state the total and say how many you are showing.",
  search_memory:
    'Use search_memory for what was decided, what anyone committed to or owes, what is still open, and anything with a due date — it is the only tool that can filter on status and due date, which search_notes cannot express. For what is overdue, pass status "open" with due_before set to today. When a question needs both the decision and the discussion around it, call search_memory and search_notes together. Like list_meetings it reports an exact total: when it exceeds the number of claims listed, state the total.',
  get_note:
    "Use get_note to fetch the full content of a specific note by ID. If the current note's ID is provided in the context, use it directly. Otherwise, use search_notes first to find the note ID.",
  create_note:
    "Use create_note when the user asks you to create, write, or draft a new note. Whenever the note will go into a folder, call list_folders first and reuse an existing folder whose name is a reasonable fit for the note's topic (e.g. a new story belongs in an existing 'Stories' folder) — do this even when the user didn't name a folder but the content clearly fits one. Only pass a new folder name when nothing existing fits. Be tolerant of case, plurals, and typos.",
  update_note:
    "Use update_note to modify an existing note's title, content, or move it to a different folder. If the current note's ID is provided in the context, use it directly. Otherwise, use search_notes first to find the note ID. When moving to a folder, call list_folders first and reuse an existing folder whose name fits the note's topic; only create a new folder when nothing existing fits.",
  list_folders:
    "Use list_folders before create_note or update_note whenever a note is going into a folder, so you can reuse an existing folder whose name fits the note's topic instead of creating a near-duplicate.",
  web_search:
    "Use web_search for questions about current events, facts you're unsure about, or anything requiring up-to-date information.",
  copy_to_clipboard:
    "Use copy_to_clipboard when the user asks you to copy something to their clipboard.",
  get_calendar_events:
    "Use get_calendar_events to check the user's schedule, upcoming meetings, or calendar events.",
};

export interface AgentPromptContext {
  availableTools?: string[];
  /** Retrieved notes, already formatted, that may help answer this turn. */
  noteContext?: string;
  /** Durable facts about the user, pinned on every message (§19). */
  memoryProfile?: string;
  /** Open commitments and deadlines, pinned on every message (§19, §20). */
  openCommitments?: string;
  /** Claims extracted from the anchored note, with current statuses (note chat). */
  noteClaims?: string;
  /** The note a bare "this meeting" refers to, when the conversation has one. */
  focusNote?: { id: number; title: string };
}

/**
 * The named parts of the agent system prompt, in the order they are sent.
 *
 * These are the units the prompt inspector reports on, and they are the same
 * objects the prompt is joined from — not a description of it written
 * separately. A summary assembled beside the real thing drifts from it, and a
 * drifted summary is worse than none: it makes a wrong prompt look right.
 */
export type AgentPromptSectionName =
  | "assistantRole"
  | "userProfile"
  | "openCommitments"
  | "noteClaims"
  | "focusNote"
  | "toolInstructions"
  | "retrievedNotes";

export interface AgentPromptSection {
  name: AgentPromptSectionName;
  text: string;
}

/** Sections are joined with a blank line, which is what the model receives. */
export const AGENT_PROMPT_SECTION_SEPARATOR = "\n\n";

export function getAgentPromptSections(context: AgentPromptContext = {}): AgentPromptSection[] {
  const { availableTools, noteContext, memoryProfile, openCommitments, noteClaims, focusNote } =
    context;
  const sections: AgentPromptSection[] = [
    { name: "assistantRole", text: resolvePrompt("chatAgent", { agentName: null }) },
  ];

  // Durable facts about the user, pinned on every message (§19). This is what
  // separates memory from search: retrieval answers "what was said about X",
  // but the assistant should not have to look up who it is talking to. Kept
  // small because every single message pays for it.
  if (memoryProfile?.trim()) {
    sections.push({
      name: "userProfile",
      text:
        "What you know about this user, learned from their past meetings. " +
        "Treat it as background, not as something to recite:\n" +
        memoryProfile.trim(),
    });
  }

  // Pinned alongside the profile, and for the same reason: an agent that has to
  // decide to go looking for commitments does not, so "anything I should know?"
  // would never surface them. Capped upstream (utils/memoryPrompt.ts).
  if (openCommitments?.trim()) {
    sections.push({
      name: "openCommitments",
      text:
        "Open commitments and deadlines from the user's meetings. " +
        "Raise them when they bear on the question or when the user asks what is " +
        "outstanding, and do not recite them otherwise. For anything beyond this " +
        "list, use search_memory:\n" +
        openCommitments.trim(),
    });
  }

  // The correction channel for a note's own chat. The note's text is frozen at
  // the moment it was written; these rows know what happened since — an item
  // closed, a number renegotiated. Pinned because the model would otherwise
  // trust the pinned document over anything it might retrieve.
  if (noteClaims?.trim()) {
    sections.push({
      name: "noteClaims",
      text:
        "Claims extracted from this note's meeting, with their CURRENT status. " +
        "Where a claim is marked superseded or done, that status is newer than the " +
        "note's own text — trust the status over the wording in the note:\n" +
        noteClaims.trim(),
    });
  }

  // "For this meeting, what was the purpose?" has no referent on its own: the
  // model is holding several notes and nothing marks one as the subject. This
  // is set only when the last turn resolved to exactly one note, so it never
  // asserts a subject the conversation did not actually settle on.
  if (focusNote) {
    sections.push({
      name: "focusNote",
      text:
        `This conversation is currently about the note "${focusNote.title}" ` +
        `(ID ${focusNote.id}). When the user says "this meeting", "that note", or "it" ` +
        "without naming one, they mean this one. If their question clearly concerns a " +
        "different note, follow the question rather than this note.",
    });
  }

  if (availableTools && availableTools.length > 0) {
    const toolLines = availableTools.map((name) => TOOL_INSTRUCTIONS[name]).filter(Boolean);
    if (toolLines.length > 0) {
      sections.push({
        name: "toolInstructions",
        text: "You have access to tools. " + toolLines.join(" "),
      });
    }
  }

  if (noteContext) {
    // The citation marker is parsed back out by `utils/chatCitations.ts` and
    // rendered as a link to the note, so the id has to be the one on the tag.
    // Markers naming a note that was not supplied are dropped rather than
    // linked, which is why the instruction is explicit about not inventing one.
    sections.push({
      name: "retrievedNotes",
      text:
        "Below are notes from the user's library that may be relevant. " +
        "Use them when they help answer the question, and ignore them when they do not.\n\n" +
        "When a statement comes from one of these notes, cite it by appending " +
        "[[note:ID]] — the ID from that note's tag — at the end of the sentence. " +
        "Cite only notes listed below; never invent an ID. Do not add a sources " +
        "list of your own at the end: the app renders one from your citations.\n\n" +
        noteContext,
    });
  }

  return sections;
}

export function renderAgentPromptSections(sections: readonly AgentPromptSection[]): string {
  return sections.map((section) => section.text).join(AGENT_PROMPT_SECTION_SEPARATOR);
}

export function getAgentSystemPrompt(context: AgentPromptContext = {}): string {
  return renderAgentPromptSections(getAgentPromptSections(context));
}
