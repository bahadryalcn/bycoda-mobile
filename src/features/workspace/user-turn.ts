import {
  delegationNoticeSections,
  type DelegationNoticeSection,
} from "../../../../src/features/sessions/model/delegationNotice";
import {
  operatorPromptText,
  resumePromptKind,
  visibleUserPrompt,
  type ResumePromptKind,
} from "../../../../src/features/sessions/model/userPromptText";
import type { Block } from "./wire";

/** How desktop shows a user-role turn that the app, an agent or a delegate wrote. */
export type UserTurn =
  | { kind: "delegation"; sections: DelegationNoticeSection[] }
  | { kind: "resume"; resume: ResumePromptKind }
  | { kind: "message" };

export function userTurn(block: Pick<Block, "role" | "text" | "author" | "attachments">): UserTurn {
  if (block.role !== "user") return { kind: "message" };
  if (block.author?.kind === "delegation")
    return { kind: "delegation", sections: delegationNoticeSections(block.text, block.author) };
  const resume = resumePromptKind(block.text);
  if (resume && !block.attachments?.length) return { kind: "resume", resume };
  return { kind: "message" };
}

/** The words a person sees: crew envelopes and legacy command prefixes stay in the send only. */
export const userPromptDisplay = (text: string) => operatorPromptText(visibleUserPrompt(text));

/** Desktop's "{name} wrote" line for prompts an assistant, task, automation or steward sent. */
export function userTurnAuthorLabel(
  author: Block["author"],
  copy: (tr: string, en: string, values?: Record<string, string | number>) => string,
): string | undefined {
  if (!author) return undefined;
  switch (author.kind) {
    case "delegation":
      return undefined;
    case "task":
      return copy("Görev yazdı", "Task wrote");
    case "automation":
      return copy("Otomasyon yazdı", "Automation wrote");
    case "steward":
      return copy("Gözetmen yazdı", "Steward wrote");
    default:
      return copy("{p0} yazdı", "{p0} wrote", { p0: author.name });
  }
}
