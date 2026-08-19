import { ToolRegistry } from "./ToolRegistry";
import { createSearchNotesTool } from "./searchNotesTool";
import { createListMeetingsTool } from "./listMeetingsTool";
import { createSearchMemoryTool } from "./searchMemoryTool";
import { getNoteTool } from "./getNoteTool";
import { createNoteTool } from "./createNoteTool";
import { updateNoteTool } from "./updateNoteTool";
import { listFoldersTool } from "./listFoldersTool";
import { clipboardTool } from "./clipboardTool";
import { calendarTool } from "./calendarTool";
import type { ContainerScope } from "../../types/chat";

export { ToolRegistry } from "./ToolRegistry";
export type { ToolDefinition, ToolResult } from "./ToolRegistry";

interface ToolRegistrySettings {
  calendarConnected: boolean;
  /** Pins search_notes to a container (overview chat); the LLM cannot widen it. */
  searchScope?: ContainerScope;
}

export function createToolRegistry(settings: ToolRegistrySettings): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(createSearchNotesTool({ fixedScope: settings.searchScope }));
  // Same fixed scope as search: a container chat that could enumerate meetings
  // from other spaces would leak exactly what the scope exists to contain.
  registry.register(createListMeetingsTool({ fixedScope: settings.searchScope }));
  // Same pin again: memory objects carry the note they came from, so an
  // unscoped memory query in a container chat would report claims from meetings
  // that chat is not allowed to see.
  registry.register(createSearchMemoryTool({ fixedScope: settings.searchScope }));
  registry.register(getNoteTool);
  registry.register(createNoteTool);
  registry.register(updateNoteTool);
  registry.register(listFoldersTool);
  registry.register(clipboardTool);

  if (settings.calendarConnected) {
    registry.register(calendarTool);
  }

  return registry;
}
