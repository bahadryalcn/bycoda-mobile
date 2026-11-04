import { MutationState } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { campaignApprovalError } from "./review-presentation";
import type { SocialPanelContext } from "./types";

type Collection = "drafts" | "campaigns" | "rules" | "jobs";
type Context = Pick<SocialPanelContext, "action">;
const owners: Record<string, Collection | undefined> = {
  "drafts.approve": "drafts",
  "replies.send": "drafts",
  "messages.send": "drafts",
  "comments.send": "drafts",
  "campaigns.pause": "campaigns",
  "campaigns.approveReviewed": "campaigns",
  "campaigns.schedule": "campaigns",
  "automations.pause": "rules",
  "automations.activate": "rules",
  "jobs.cancel": "jobs",
  "jobs.retry": "jobs",
};

/** Unknown operations stay with the screen owner; never guess from an id alone. */
export function socialActionTarget(
  variables: Record<string, unknown> | undefined,
): { collection: Collection; id: string } | undefined {
  const collection =
    typeof variables?.action === "string" && Object.hasOwn(owners, variables.action)
      ? owners[variables.action]
      : undefined;
  const input = variables?.input;
  if (
    !collection ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !("id" in input) ||
    typeof input.id !== "string" ||
    !input.id
  )
    return undefined;
  return { collection, id: input.id };
}

export function SocialActionFeedback({ action }: Context) {
  const copy = useCopy();
  return (
    <MutationState
      pending={copy("İşlem sürüyor…", "Working…")}
      mutation={
        action.variables?.action === "campaigns.approveReviewed"
          ? { ...action, error: campaignApprovalError(action.error, copy) }
          : action
      }
    />
  );
}

export function SocialCollectionFeedback({
  action,
  collection,
  visible,
}: Context & { collection: Collection; visible: readonly { id: string }[] }) {
  const target = socialActionTarget(action.variables);
  return target?.collection === collection &&
    !visible.some((item) => item.id === target.id) ? (
    <SocialActionFeedback action={action} />
  ) : null;
}

export function SocialRecordFeedback({
  action,
  collection,
  id,
}: Context & { collection: Collection; id: string }) {
  const target = socialActionTarget(action.variables);
  return target?.collection === collection && target.id === id ? (
    <SocialActionFeedback action={action} />
  ) : null;
}
