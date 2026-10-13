import { Body, Disclosure } from "@/ui/primitives";
import { socialCharacterCount } from "../social-content";
import type { SocialPolicy } from "@/domain/types";
import { socialLimit } from "../../../../../src/features/social/model/socialLimits";
import { useCopy } from "@/ui/copy";
import { useHostQuery } from "@/state/queries";
import type { EffectivePolicy, PolicyInfoProps } from "./types";

export function usePolicy(accountId: string) {
  return useHostQuery<EffectivePolicy>(["social", "policy", accountId], "social.request", {
    action: "policy.get",
    input: { accountId },
  });
}

export async function freshPolicy(
  policy: ReturnType<typeof usePolicy>,
  copy: ReturnType<typeof useCopy>,
): Promise<EffectivePolicy> {
  const result = await policy.refetch();
  if (!result.data || result.error)
    throw result.error ?? new Error(copy("Politika alınamadı.", "Policy unavailable."));
  return result.data;
}

export function PolicyInfo({ policy }: PolicyInfoProps) {
  const copy = useCopy();
  return (
    <Disclosure label={copy("Etkin politika", "Effective policy")}>
    <Body muted>
      {copy("Etkin politika", "Effective policy")}:{" "}
      {policy?.agent ? `${policy.agent.provider} ${policy.agent.model ?? ""} · ` : ""}
      {copy("içerik", "content")} {policy?.maxContentCharacters ?? "—"} · {copy("yorum", "comment")}{" "}
      {policy?.maxCommentCharacters ?? "—"} · {copy("mesaj", "message")}{" "}
      {policy?.maxMessageCharacters ?? "—"}
    </Body>
    </Disclosure>
  );
}

export function PolicyCounter({ policy, kind, text }: { policy?: SocialPolicy; kind: "content" | "comment" | "message"; text: string }) {
  const copy = useCopy();
  const limit = policy ? socialLimit(policy, kind) : undefined;
  const count = socialCharacterCount(text.trim());
  return <Body muted accessibilityLiveRegion="polite">{count}{limit === undefined ? ` ${copy("karakter", "characters")}` : ` / ${limit}`}{limit !== undefined && count > limit ? ` · ${copy("Sınır aşıldı", "Limit exceeded")}` : ""}</Body>;
}
