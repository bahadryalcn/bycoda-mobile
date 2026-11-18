import { Avatar } from "panelui-native/components/avatar";
import { useAccountMe } from "../account/ui/use-account-me";
import { graphemes } from "../../../../src/shared/lib/text/truncate";

/** The signed-in owner's own picture (or initial), shown where the owner speaks. */
export function AssistantOwnerAvatar({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const user = useAccountMe().data?.user;
  const name = (user?.displayName || user?.email || "").trim();
  return <Avatar size={size} accessible={false} source={user?.avatarUrl ? { uri: user.avatarUrl } : undefined}
    fallback={(graphemes(name)[0] ?? "?").toUpperCase()} />;
}
