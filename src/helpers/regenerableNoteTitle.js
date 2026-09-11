// A title may be (re)generated only while it is still a placeholder — never
// after the user typed their own. Placeholders are the localized "new note"
// labels (plus the English literals, regardless of locale), the unedited
// calendar event summary, and the dated default a meeting is born with when it
// has no calendar summary ("Meeting — Sep 10, 5:32 AM", stamped by main from
// the `notes.meeting.defaultTitle` template). That last one arrives here as
// the template itself, since the date it was stamped with is not known: the
// literal text around `{{date}}` must match, and the slot must hold a time —
// every locale's short date-time carries hour:minute, and a title a person
// typed almost never does. Before the template was recognized the write-up
// ran and the note kept its dated name; the demo's own meeting shipped so.
const BUILTIN_PLACEHOLDERS = ["untitled note", "untitled", "new note"];
const BUILTIN_TEMPLATES = ["Meeting — {{date}}"];
const DATE_SLOT = "{{date}}";
const TIME_IN_SLOT = /\d{1,2}:\d{2}/;

function matchesDatedTemplate(template, title) {
  const at = template.indexOf(DATE_SLOT);
  if (at < 0) return false;
  const prefix = template.slice(0, at).trimStart().toLowerCase();
  const suffix = template
    .slice(at + DATE_SLOT.length)
    .trimEnd()
    .toLowerCase();
  const lower = title.toLowerCase();
  if (lower.length <= prefix.length + suffix.length) return false;
  if (!lower.startsWith(prefix) || !lower.endsWith(suffix)) return false;
  return TIME_IN_SLOT.test(title.slice(prefix.length, title.length - suffix.length));
}

export function isRegenerableNoteTitle(title, placeholders = [], calendarEventName = null) {
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (trimmed === "") return true;

  const set = new Set(BUILTIN_PLACEHOLDERS);
  const templates = [...BUILTIN_TEMPLATES];
  for (const p of placeholders) {
    if (typeof p !== "string" || !p.trim()) continue;
    if (p.includes(DATE_SLOT)) templates.push(p);
    else set.add(p.trim().toLowerCase());
  }
  if (set.has(trimmed.toLowerCase())) return true;
  if (templates.some((template) => matchesDatedTemplate(template, trimmed))) return true;

  return typeof calendarEventName === "string" && calendarEventName.trim() === trimmed;
}
