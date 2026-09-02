import {
  Search,
  Globe,
  ClipboardCheck,
  Calendar,
  FileText,
  FilePlus,
  FilePen,
  Keyboard,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

export const toolIcons: Record<string, typeof Search> = {
  search_notes: Search,
  web_search: Globe,
  copy_to_clipboard: ClipboardCheck,
  get_calendar_events: Calendar,
  get_note: FileText,
  create_note: FilePlus,
  update_note: FilePen,
  get_app_settings: SlidersHorizontal,
  set_hotkey: Keyboard,
  open_settings: Settings2,
};
