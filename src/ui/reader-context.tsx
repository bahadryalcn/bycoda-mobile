import { ScrollView, View } from "react-native";
import { Body } from "./primitives";
import { usePrivateContentAllowed } from "./private-access";
import type { MessageContext } from "./media-policy";
import { space } from "./tokens";

/** Context belongs to the reader's content region, never its fixed title bar. */
export function ReaderContext({ context, path, bounded = false }: {
  context?: MessageContext; path?: string; bounded?: boolean;
}) {
  const allowed = usePrivateContentAllowed();
  if (!context || !allowed) return null;
  const content = <View style={{ gap: space.xs, minWidth: 0 }}>
    <Body muted>{context.client.machine.name || context.machineId}</Body>
    <Body muted mono>{path || context.cwd}</Body>
  </View>;
  return bounded ? <ScrollView style={{ flexGrow: 0, flexShrink: 1, maxHeight: "30%" }}
    keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: space.sm }}>{content}</ScrollView> : content;
}
