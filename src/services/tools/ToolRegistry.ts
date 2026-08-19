import { jsonSchema } from "ai";
import type { Tool } from "ai";

/** A note a tool result refers to, in the one shape the UI needs. */
export interface ToolNoteRef {
  id: number;
  title: string;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  displayText: string;
  /**
   * Notes this result points at, for citation links and the sources strip.
   *
   * Kept beside `data` rather than inside it: `data` is what the model reads,
   * and every tool shapes it differently. The UI needs one shape, and it must
   * not carry note bodies — these are persisted with the conversation.
   */
  noteRefs?: ToolNoteRef[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  /**
   * Note refs from calls that have run, keyed by tool call id.
   *
   * A side channel because the AI SDK's `execute` return value *is* what the
   * model sees — anything added there to help the UI would also be read back by
   * the model as part of the tool's answer.
   */
  private pendingNoteRefs = new Map<string, ToolNoteRef[]>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /** Consumes the note refs recorded for a completed call. */
  takeNoteRefs(toolCallId: string | undefined): ToolNoteRef[] | undefined {
    if (!toolCallId) return undefined;
    const refs = this.pendingNoteRefs.get(toolCallId);
    if (refs) this.pendingNoteRefs.delete(toolCallId);
    return refs;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  toAISDKFormat(): Record<string, Tool> {
    const result: Record<string, Tool> = {};
    for (const def of this.getAll()) {
      result[def.name] = {
        description: def.description,
        inputSchema: jsonSchema(def.parameters),
        execute: async (args: unknown, options?: { toolCallId?: string }) => {
          try {
            const toolResult = await def.execute(args as Record<string, unknown>);
            if (toolResult.noteRefs?.length) {
              this.pendingNoteRefs.set(options?.toolCallId ?? "", toolResult.noteRefs);
            }
            return toolResult.success ? toolResult.data : { error: toolResult.displayText };
          } catch (error) {
            return { error: (error as Error).message || "Tool execution failed" };
          }
        },
      } as Tool;
    }
    return result;
  }
}
