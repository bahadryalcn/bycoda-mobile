import { StyleSheet, View } from "react-native";
import { router, useNavigation } from "expo-router";
import CornerUpLeft from "lucide-react-native/icons/corner-up-left";
import { Body } from "@/ui/typography";
import { PressableCard } from "@/ui/primitives";
import { ProviderIcon } from "@/ui/provider-identity";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import type { HostSessionSummary } from "@/domain/types";
import { useHostQuery } from "@/state/queries";
import { useModelCatalog } from "@/state/model-catalog";
import { activeSessionModel, sessionCatalog } from "./catalog";
import { settingsSummary } from "./model-picker-model";
import { settingLabels } from "./setting-labels";
import { sessionDisplayTitle } from "./session-title";
import { parentLinkOf } from "./subagent-sessions-model";
import { childRunState, childRunTiming, childStatusText, previousRouteIs } from "./subagent-run-model";
import { useElapsedNow } from "./use-elapsed-now";
import type { HostSession } from "./wire";

/**
 * On a delegated child session, a compact bar above the composer: the child's own provider mark
 * and model, its state and time ("Working 2:13", "Finished in 8 min 2 s") with whose subagent it
 * is, and Open parent. It never hides with the operations row; on a short frame it is one line
 * (mark, state, Parent session). Hidden for ordinary sessions. The composer stays the normal one.
 */
export function SessionParentBar({ session, machineId, compact = false }: { session: HostSession | undefined; machineId: string; compact?: boolean }) {
  const link = parentLinkOf(session?.session as Parameters<typeof parentLinkOf>[0]);
  const projectId = session?.projectId;
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const navigation = useNavigation();
  const siblings = useHostQuery<HostSessionSummary[]>(["sessions", projectId], "sessions.list", { projectId }, { enabled: !!link && !!projectId });
  const catalog = useModelCatalog(projectId ?? "", !!link && !!projectId);
  const state = session && link ? childRunState(session, link) : undefined;
  const now = useElapsedNow(state === "running");
  if (!link || !projectId || !session || !state) return null;
  const parent = siblings.data?.find((row) => row.id === link.parentSessionId);
  const title = parent ? sessionDisplayTitle(parent.title, copy("Ana oturum", "Parent session")) : copy("Ana oturum", "Parent session");
  const role = link.kind === "advisor" ? copy("{p0} danışmanı", "Advisor of {p0}", { p0: title }) : copy("{p0} alt ajanı", "Subagent of {p0}", { p0: title });
  const { harness } = session.session;
  const { name, model } = activeSessionModel(session.session, sessionCatalog(catalog.data, [harness]));
  const settings = settingsSummary(model, session.session.modelSettings, settingLabels(copy));
  const status = childStatusText(state, childRunTiming(session, link), now, copy);
  const tone = state === "running" ? colors.live : state === "failed" ? colors.danger : state === "completed" ? colors.muted : colors.warning;
  const openParent = () => {
    // Back keeps the parent's scroll and history when the parent is the page this child opened from.
    if (previousRouteIs(navigation.getState?.(), link.parentSessionId) && router.canGoBack()) router.back();
    else router.replace({ pathname: "/session/[id]", params: { id: link.parentSessionId, machineId, projectId } });
  };
  const small = { fontSize: fontSize.caption, lineHeight: lineHeight.caption };
  const card = { minWidth: 0, minHeight: metrics.touchTarget, flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingVertical: space.xs, paddingHorizontal: space.md, marginHorizontal: 0, borderRadius: radii.card,
    backgroundColor: colors.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator } as const;
  const label = [name, settings, status, role, copy("Ana oturumu aç", "Open parent")].filter(Boolean).join(". ");
  if (compact)
    return (
      <PressableCard label={label} onPress={openParent} style={card}>
        <ProviderIcon provider={harness} size={16} />
        <Body numberOfLines={1} style={{ ...small, flex: 1, minWidth: 0, color: tone, fontVariant: ["tabular-nums"] }}>{status}</Body>
        <CornerUpLeft size={14} color={colors.accent} />
        <Body numberOfLines={1} style={{ ...small, fontWeight: "600", color: colors.accent, flexShrink: 0 }}>{copy("Ana oturum", "Parent session")}</Body>
      </PressableCard>
    );
  return (
    <PressableCard label={label} onPress={openParent} style={card}>
      <ProviderIcon provider={harness} size={16} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body numberOfLines={1} style={{ ...small, fontWeight: "600" }}>
          {name}{settings ? <Body muted style={small}>{` · ${settings}`}</Body> : null}
        </Body>
        <Body muted numberOfLines={2} style={small}>
          <Body style={{ ...small, color: tone, fontVariant: ["tabular-nums"] }}>{status}</Body>
          {` · ${role}`}
        </Body>
      </View>
      <CornerUpLeft size={14} color={colors.accent} />
      <Body style={{ ...small, fontWeight: "600", color: colors.accent, flexShrink: 0 }}>{copy("Ana oturumu aç", "Open parent")}</Body>
    </PressableCard>
  );
}
