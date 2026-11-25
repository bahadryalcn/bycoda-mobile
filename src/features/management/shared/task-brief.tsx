import { MessageText } from "@/ui/message-text";
import { Body } from "@/ui/primitives";
import {
  taskInstructionsMarkdown,
  taskInstructionsSummary,
} from "../../../../../src/features/tasks/model/taskInstructions";

export { taskInstructionsSummary };

/** A task prompt may be a versioned brief stored as JSON; people read it as sections, never as raw JSON. */
export function TaskBrief({ prompt }: { prompt: string }) {
  const markdown = taskInstructionsMarkdown(prompt);
  return markdown === prompt ? (
    <Body>{prompt}</Body>
  ) : (
    <MessageText text={markdown} role="assistant" />
  );
}
