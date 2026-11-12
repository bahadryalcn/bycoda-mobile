import { Button, Column, Text, getMaterialColors } from "@expo/ui/jetpack-compose";
import { fillMaxSize, padding, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/** Android 2x2 counterpart of the NeedsAttention widget. Self-contained: see ActiveSessions. */
export function NeedsAttention(props: WidgetSnapshot, environment: WidgetEnvironment) {
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
  const surface = palette?.background ?? material.surface;
  const text = palette?.foreground ?? material.onSurface;
  const muted = palette?.secondary ?? material.onSurfaceVariant;
  const warning = palette?.warning ?? material.tertiary;
  const danger = palette?.danger ?? material.error;
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const message =
    state === "locked" ? labels.locked : state === "setup" ? labels.setup : stale ? labels.stale : "";
  const total = counts.needsInput + counts.failed;
  return (
    <Button colors={{ containerColor: surface }} modifiers={[fillMaxSize()]} onClick={() => {}}>
      <Column modifiers={[fillMaxSize(), paddingAll(12)]}>
        <Text color={muted} maxLines={1} style={{ fontSize: 12, fontWeight: "bold" }}>
          {labels.title}
        </Text>
        {message ? (
          <Text color={text} maxLines={3} style={{ fontSize: 13 }} modifiers={[padding(0, 6, 0, 0)]}>
            {message}
          </Text>
        ) : (
          <Column modifiers={[padding(0, 4, 0, 0)]}>
            <Text color={total > 0 ? warning : text} style={{ fontSize: 34, fontWeight: "bold" }}>
              {String(counts.needsInput)}
            </Text>
            <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
              {total === 0 ? labels.empty : labels.needsInput}
            </Text>
            {counts.failed > 0 ? (
              <Text color={danger} maxLines={1} style={{ fontSize: 12, fontWeight: "bold" }}>
                {`${counts.failed} ${labels.failed}`}
              </Text>
            ) : null}
          </Column>
        )}
      </Column>
    </Button>
  );
}

export default createWidget<WidgetSnapshot>("NeedsAttention", NeedsAttention);
