import type { SocialPolicy, SocialSnapshot } from "@/domain/types";
import {
  socialCharacterCount,
  socialLimit,
} from "../../../../src/features/social/model/socialLimits";

export { socialCharacterCount };
export function exceedsSocialLimit(
  policy: SocialPolicy,
  kind: "content" | "comment" | "message",
  text: string,
) {
  const limit = socialLimit(policy, kind);
  return limit !== undefined && socialCharacterCount(text.trim()) > limit ? limit : undefined;
}
export function missingFactIds(selected: readonly string[], facts: readonly { id: string }[]) {
  return selected.filter((id) => !facts.some((fact) => fact.id === id));
}
export function canEditSocialDraft(
  draft: Pick<SocialSnapshot["drafts"][number], "id" | "generation">,
  jobs: readonly Pick<SocialSnapshot["jobs"][number], "draftId" | "status" | "dispatchedAt">[],
) {
  return (
    draft.generation?.status !== "running" &&
    !jobs.some(
      (job) =>
        job.draftId === draft.id && (job.status !== "cancelled" || job.dispatchedAt !== undefined),
    )
  );
}
