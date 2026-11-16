import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useHostClient, useHostReadActive, hostKey } from "@/state/queries";
import { useConnectionScope } from "@/state/connection-scope";
import { Body } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { radii } from "@/ui/tokens";
import { graphemes } from "../../../../src/shared/lib/text/truncate";

// Same preset identities and artwork as desktop AssistantAvatar; no mobile editor.
const portraits = {
  robot: require("../../../../public/assistant/avatars/robot.webp"),
  owl: require("../../../../public/assistant/avatars/owl.webp"),
  fox: require("../../../../public/assistant/avatars/fox.webp"),
  spark: require("../../../../public/assistant/avatars/spark.webp"),
  wave: require("../../../../public/assistant/avatars/wave.webp"),
  character: require("../../../../public/assistant/avatars/character.webp"),
  cat: require("../../../../public/assistant/avatars/cat.webp"),
};

/** Portrait reads use the paired Host connection; missing/unsupported images leave the orb visible. */
export function AssistantAvatar({ value, size }: { value?: string; size: number }) {
  const { colors, uiStyles } = useMobileTheme();
  const transport = useHostClient(), connection = useConnectionScope(), active = useHostReadActive();
  const [failed, setFailed] = useState<string>();
  const text = value?.trim() ?? "";
  const id = /^image:([0-9a-f-]{36})$/.exec(text)?.[1];
  const portrait = useQuery({
    queryKey: hostKey(connection.review?.id ?? "", ["assistant", connection.token, "avatar", id]),
    enabled: active && !!id && !!transport && connection.isCurrent(),
    queryFn: async () => {
      const result = await transport!.request<{ dataUrl?: unknown }>("assistant.builder.avatarRead", { id }, { retry: false, timeoutMs: 30000 });
      if (!connection.isCurrent() || typeof result?.dataUrl !== "string" || result.dataUrl.length > 12_000_000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(result.dataUrl)) throw new Error("Invalid assistant portrait.");
      return result.dataUrl;
    },
    retry: false,
    staleTime: Infinity,
    networkMode: "always",
  });
  if (!active || !connection.isCurrent() || failed === text) return null;
  const preset = text.startsWith("preset:") ? portraits[text.slice(7) as keyof typeof portraits] : undefined;
  const source = id ? (portrait.data ? { uri: portrait.data } : undefined) : preset;
  if (source) return <Image source={source} contentFit="cover" accessible={false} onError={() => setFailed(text)} style={{ width: size, height: size, borderRadius: radii.pill }} />;
  if (!text || text.startsWith("preset:") || text.startsWith("image:")) return null;
  return <View style={{ width: size, height: size, borderRadius: radii.pill, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}>
    <Body numberOfLines={1} style={[uiStyles.heading, { maxWidth: size }]}>{graphemes(text).slice(0, 2).join("")}</Body>
  </View>;
}
