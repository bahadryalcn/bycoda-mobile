import type { ContextualSessionInput, ContextualSessionPreview, HostSession } from "@/domain/types";
import type { SessionScope } from "./session-types";
import { sameFormValue } from "@/state/form-draft";
import { captureSessionAuthority, type SessionAuthority } from "@/domain/session-authority";

export function contextualReplies(source: HostSession) {
  return source.session.blocks.filter(
    (block) =>
      ["assistant", "plan", "tasks"].includes(block.role) &&
      !block.streaming &&
      !block.draft &&
      !block.internal &&
      (!!block.text.trim() || !!block.remoteContent),
  );
}
export function sameContextualInput(
  a: ContextualSessionInput | null,
  b: ContextualSessionInput | null,
) {
  return !!a && !!b && sameFormValue(a, b);
}
export function contextualCommand(
  scope: SessionScope,
  source: HostSession,
  input: ContextualSessionInput,
  preview: ContextualSessionPreview,
  reviewedAuthority: SessionAuthority = source,
) {
  const reviewed: ContextualSessionInput = {
    sessionId: preview.sessionId,
    sourceBlockId: preview.sourceBlockId,
    expectedRevision: preview.expectedRevision,
    mode: preview.mode,
    harness: preview.harness,
    model: preview.model,
    modelSettings: preview.modelSettings,
  };
  if (
    scope.sessionId !== source.session.id ||
    input.sessionId !== scope.sessionId ||
    source.status === "running" ||
    source.revision !== input.expectedRevision ||
    !sameContextualInput(input, reviewed) ||
    !/^[a-f0-9]{64}$/.test(preview.digest) ||
    preview.account !== "host-default" ||
    preview.projectId !== source.projectId
  )
    throw new Error("The reviewed context changed. Review it again before continuing.");
  return {
    ...reviewed,
    ...captureSessionAuthority(reviewedAuthority),
    type: "contextual" as const,
    previewDigest: preview.digest,
  };
}
