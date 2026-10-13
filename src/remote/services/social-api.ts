import type {
  HostRequest,
  EffectiveSocialPolicy,
  RemoteRequestOptions,
  SocialDraft,
  SocialDraftInput,
  SocialJob,
  SocialPolicy,
  SocialSnapshot,
  SocialThread,
} from "../types";
import { HostTransport, RemoteHostError } from "../transport";
import {
  socialCharacterCount,
  socialLimit,
} from "../../../../src/features/social/model/socialLimits";

function enforceSocialLimit(
  transport: HostTransport,
  policy: SocialPolicy,
  kind: "comment" | "message",
  text: string,
): void {
  const limit = socialLimit(policy, kind);
  if (limit !== undefined && socialCharacterCount(text) > limit)
    throw new RemoteHostError(
      transport.machine.id,
      "host",
      `The account’s ${kind} character limit is ${limit}. Shorten the draft before saving.`,
    );
}
export function createSocialApi(transport: HostTransport, request: HostRequest) {
  const socialRequest = <T>(
    action: string,
    input: Record<string, unknown> = {},
    requestId?: string,
    options?: RemoteRequestOptions,
  ) =>
    request<T>("social.request", { action, input, ...(requestId ? { requestId } : {}) }, options);
  return {
    social: {
      request: socialRequest,
      snapshot: (options?: RemoteRequestOptions) =>
        socialRequest<SocialSnapshot>("snapshot", {}, undefined, options),
      policy: (accountId: string, options?: RemoteRequestOptions) =>
        socialRequest<EffectiveSocialPolicy>("policy.get", { accountId }, undefined, options),
      threads: (options?: RemoteRequestOptions) =>
        socialRequest<SocialThread[]>("inbox.list", {}, undefined, options),
      thread: (id: string, options?: RemoteRequestOptions) =>
        socialRequest<SocialThread & { contentTrust: "untrusted" }>(
          "thread.read",
          { id },
          undefined,
          options,
        ),
      draftReply: async (
        input: SocialDraftInput,
        threadKind: "comment" | "message",
        options?: RemoteRequestOptions,
      ): Promise<SocialDraft> => {
        const { effective } = await socialRequest<EffectiveSocialPolicy>(
          "policy.get",
          { accountId: input.accountId },
          undefined,
          options,
        );
        enforceSocialLimit(transport, effective, threadKind, input.text);
        return socialRequest<SocialDraft>("replies.draft", { ...input }, undefined, options);
      },
      draftMessage: async (
        input: SocialDraftInput,
        options?: RemoteRequestOptions,
      ): Promise<SocialDraft> => {
        const { effective } = await socialRequest<EffectiveSocialPolicy>(
          "policy.get",
          { accountId: input.accountId },
          undefined,
          options,
        );
        enforceSocialLimit(transport, effective, "message", input.text);
        return socialRequest<SocialDraft>("messages.draft", { ...input }, undefined, options);
      },
      updateDraft: async (
        draft: SocialDraft,
        text: string,
        factIds: string[],
        threadKind?: "comment" | "message",
        options?: RemoteRequestOptions,
      ): Promise<SocialDraft> => {
        const { effective } = await socialRequest<EffectiveSocialPolicy>(
          "policy.get",
          { accountId: draft.accountId },
          undefined,
          options,
        );
        enforceSocialLimit(
          transport,
          effective,
          threadKind ?? (draft.kind === "message" ? "message" : "comment"),
          text,
        );
        return socialRequest<SocialDraft>(
          "drafts.update",
          { id: draft.id, text, factIds },
          undefined,
          options,
        );
      },
      approveDraft: (id: string, options?: RemoteRequestOptions) =>
        socialRequest<SocialDraft>("drafts.approve", { id }, undefined, options),
      /** Call only after a separate owner send action; saving/approving does not send. */
      sendApprovedDraft: (
        draft: SocialDraft,
        requestId: string,
        options?: RemoteRequestOptions,
      ) => {
        if (!draft.approvedAt || draft.reviewReason)
          throw new RemoteHostError(
            transport.machine.id,
            "host",
            "Review and approve this draft before sending.",
          );
        const action =
          draft.kind === "reply"
            ? "replies.send"
            : draft.kind === "message"
              ? "messages.send"
              : "comments.send";
        return socialRequest<SocialJob>(action, { id: draft.id }, requestId, options);
      },
      pauseRule: (id: string, options?: RemoteRequestOptions) =>
        socialRequest("automations.pause", { id }, undefined, options),
      cancelJob: (id: string, options?: RemoteRequestOptions) =>
        socialRequest<SocialJob>("jobs.cancel", { id }, undefined, options),
    },
  };
}
