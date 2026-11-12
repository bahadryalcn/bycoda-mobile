import { Button, Column, Row, Text, getMaterialColors } from "@expo/ui/jetpack-compose";
import { fillMaxSize, fillMaxWidth, padding, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/**
 * Android home-screen widget. The function is evaluated by the widget runtime without this
 * module's scope, so helpers live inside it. Android has no widgetURL: the whole card is one
 * Button and the app's interaction listener opens `snapshot.url` (needs a live JS runtime).
 */
export function ActiveSessions(props: WidgetSnapshot, environment: WidgetEnvironment) {
  "widget";
  const labels = props.labels ?? {
    title: "bycoda",
    running: "Running",
    needsInput: "Needs you",
    failed: "Failed",
    empty: "No active sessions",
    locked: "Open bycoda to continue",
    setup: "Open bycoda to connect",
    stale: "Open bycoda to refresh",
  };
  const scheme = environment.colorScheme === "dark" ? "dark" : "light";
  const palette = props.palette?.[scheme];
  const material = getMaterialColors({ scheme });
  const colors = palette
    ? {
        surface: palette.background,
        text: palette.foreground,
        muted: palette.secondary,
        warning: palette.warning,
        danger: palette.danger,
        accent: palette.accent,
        success: palette.success,
      }
    : {
        surface: material.surface,
        text: material.onSurface,
        muted: material.onSurfaceVariant,
        warning: material.tertiary,
        danger: material.error,
        accent: material.primary,
        success: material.primary,
      };
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const sessions = props.sessions ?? [];
  const message =
    state === "locked" ? labels.locked : state === "setup" ? labels.setup : stale ? labels.stale : "";
  const statusColor = (status: string) =>
    status === "needs_input"
      ? colors.warning
      : status === "failed"
        ? colors.danger
        : status === "running"
          ? colors.accent
          : colors.success;
  return (
    <Button colors={{ containerColor: colors.surface }} modifiers={[fillMaxSize()]} onClick={() => {}}>
      <Column modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Text color={colors.muted} maxLines={1} style={{ fontSize: 12, fontWeight: "bold" }}>
          {labels.title}
        </Text>
        {message ? (
          <Text color={colors.text} maxLines={3} style={{ fontSize: 14 }} modifiers={[padding(0, 6, 0, 0)]}>
            {message}
          </Text>
        ) : (
          <Column modifiers={[fillMaxWidth(), padding(0, 4, 0, 0)]}>
            <Row>
              <Text color={colors.text} style={{ fontSize: 30, fontWeight: "bold" }}>
                {String(counts.running)}
              </Text>
              <Text color={colors.muted} maxLines={1} style={{ fontSize: 13 }} modifiers={[padding(8, 14, 0, 0)]}>
                {counts.running + counts.needsInput + counts.failed === 0 ? labels.empty : labels.running}
              </Text>
            </Row>
            {counts.needsInput > 0 ? (
              <Text color={colors.warning} maxLines={1} style={{ fontSize: 12, fontWeight: "bold" }}>
                {`${counts.needsInput} ${labels.needsInput}`}
              </Text>
            ) : null}
            {counts.failed > 0 ? (
              <Text color={colors.danger} maxLines={1} style={{ fontSize: 12, fontWeight: "bold" }}>
                {`${counts.failed} ${labels.failed}`}
              </Text>
            ) : null}
            {sessions.slice(0, 2).map((row) => (
              <Text
                key={row.id}
                color={statusColor(row.status)}
                maxLines={1}
                style={{ fontSize: 12 }}
                modifiers={[padding(0, 4, 0, 0)]}
              >
                {row.title || row.project}
              </Text>
            ))}
          </Column>
        )}
      </Column>
    </Button>
  );
}

export default createWidget<WidgetSnapshot>("ActiveSessions", ActiveSessions);
