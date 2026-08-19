/**
 * The stamp recorded on a note when its enhanced content was generated, and
 * compared later to decide whether that enhancement has gone stale.
 *
 * Shared rather than reimplemented per call site: two spellings of this that
 * disagree would make every auto-generated note look stale the moment it was
 * opened, offering to redo work that was just done.
 *
 * Cheap on purpose — length plus a prefix. It is a change detector for a
 * user's own edits, not a checksum, and it runs against note bodies that can
 * be tens of thousands of characters.
 */
export function makeNoteContentHash(content: string): string {
  return String(content.length) + "-" + content.slice(0, 50);
}

/** The exact input both the manual and automatic paths hash. */
export function noteEnhancementSource(noteContent: string, rawTranscript: string): string {
  return `${noteContent}\n${rawTranscript}`;
}
