import { ChatInput } from "../chat/ChatInput";
import type { AgentState } from "../chat/types";

interface AgentInputProps {
  agentState: AgentState;
  partialTranscript: string;
  onTextSubmit?: (text: string) => void;
  onCancel?: () => void;
  accessory?: React.ReactNode;
}

export function AgentInput(props: AgentInputProps) {
  return <ChatInput {...props} autoFocus />;
}
