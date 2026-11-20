import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import CornerUpLeft from "lucide-react-native/icons/corner-up-left";
import { Body } from "@/ui/typography";
import { PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, space } from "@/ui/tokens";
import type { HostSessionSummary } from "@/domain/types";
import { useHostQuery } from "@/state/queries";
import { sessionDisplayTitle } from "./session-title";
import { parentLinkOf } from "./subagent-sessions-model";
import type { HostSession } from "./wire";

/** On a delegated child session: "Subagent of <parent> · Open parent". Hidden for ordinary sessions. */
export function SessionParentBar({ session, machineId }: { session: HostSession | undefined; machineId: string }) {
  const link = parentLinkOf(session?.session as Parameters<typeof parentLinkOf>[0]);
  const projectId = session?.projectId;
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const siblings = useHostQuery<HostSessionSummary[]>(["sessions", projectId], "sessions.list", { projectId }, { enabled: !!link && !!projectId });
  if (!link || !projectId) return null;
  const parent = siblings.data?.find((row) => row.id === link.parentSessionId);
  const title = parent ? sessionDisplayTitle(parent.title, copy("Ana oturum", "Parent session")) : copy("Ana oturum", "Parent session");
  const label = link.kind === "advisor" ? copy("{p0} danışmanı", "Advisor of {p0}", { p0: title }) : copy("{p0} alt ajanı", "Subagent of {p0}", { p0: title });
  return (
    <PressableCard
      label={`${label}. ${copy("Ana oturumu aç", "Open parent")}`}
      onPress={() => router.replace({ pathname: "/session/[id]", params: { id: link.parentSessionId, machineId, projectId } })}
      style={{ minHeight: metrics.touchTarget, flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.screen, marginTop: space.xs, paddingVertical: 0, paddingHorizontal: space.md, backgroundColor: colors.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator }}
    >
      <CornerUpLeft size={16} color={colors.tertiary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body muted numberOfLines={1} style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
          {label} · {copy("Kendi başına çalışır", "Runs on its own")}
        </Body>
      </View>
      <Body style={{ fontWeight: "600", color: colors.info, fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{copy("Ana oturumu aç", "Open parent")}</Body>
    </PressableCard>
  );
}
