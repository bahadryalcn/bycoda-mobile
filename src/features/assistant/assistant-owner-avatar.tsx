import { Avatar } from "panelui-native/components/avatar";
import { useAccountMe } from "../account/ui/use-account-me";
import { graphemes } from "../../../../src/shared/lib/text/truncate";

export type AssistantOwner = { initial: string; avatarUrl?: string };

/** The signed-in owner's picture or initial; undefined until the account is known (no "?" placeholder). */
export function useAssistantOwner(): AssistantOwner | undefined {
  const user = useAccountMe().data?.user;
  const initial = graphemes((user?.displayName || user?.email || "").trim())[0]?.toUpperCase();
  if (!initial && !user?.avatarUrl) return undefined;
  return { initial: initial ?? "", avatarUrl: user?.avatarUrl ?? undefined };
}

/** The owner's own picture (or initial), shown where the owner speaks. */
export function AssistantOwnerAvatar({ owner, size = "sm" }: { owner: AssistantOwner; size?: "sm" | "md" | "lg" }) {
  return <Avatar size={size} accessible={false} source={owner.avatarUrl ? { uri: owner.avatarUrl } : undefined} fallback={owner.initial} />;
}
