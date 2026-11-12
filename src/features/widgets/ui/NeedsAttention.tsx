import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/** Count of sessions waiting for the owner or failed. Self-contained: see ActiveSessions. */
function NeedsAttention(props: WidgetSnapshot, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily;
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
  const monochrome =
    environment.widgetRenderingMode !== undefined && environment.widgetRenderingMode !== "fullColor";
  const palette = props.palette?.[environment.colorScheme === "dark" ? "dark" : "light"];
  const primary = !monochrome && palette ? palette.foreground : "primary";
  const secondary = !monochrome && palette ? palette.secondary : "secondary";
  const warning = monochrome ? "primary" : (palette?.warning ?? "orange");
  const danger = monochrome ? "primary" : (palette?.danger ?? "red");
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const message =
    state === "locked" ? labels.locked : state === "setup" ? labels.setup : stale ? labels.stale : "";
  const total = counts.needsInput + counts.failed;
  const modifiers = [
    ...(props.url ? [widgetURL(props.url)] : []),
    ...(family !== "accessoryCircular" && family !== "accessoryRectangular" && palette
      ? [containerBackground(monochrome ? "clear" : palette.background, "widget")]
      : []),
  ];
  if (family === "accessoryCircular") {
    return (
      <VStack spacing={0} modifiers={modifiers}>
        <Image systemName="hand.raised.fill" size={14} />
        <Text modifiers={[font({ size: 18, weight: "bold" })]}>{message ? "-" : String(total)}</Text>
      </VStack>
    );
  }
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={2} modifiers={modifiers}>
        <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), lineLimit(1)]}>
          {labels.title}
        </Text>
        <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>
          {message || `${counts.needsInput} ${labels.needsInput} · ${counts.failed} ${labels.failed}`}
        </Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={6} modifiers={modifiers}>
      <HStack spacing={4}>
        <Image systemName={total > 0 ? "hand.raised.fill" : "checkmark.circle.fill"} size={13} color={total > 0 ? warning : secondary} />
        <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), foregroundStyle(secondary), lineLimit(1)]}>
          {labels.title}
        </Text>
      </HStack>
      {message ? (
        <Text modifiers={[font({ textStyle: "subheadline" }), foregroundStyle(secondary)]}>{message}</Text>
      ) : (
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 38, weight: "bold", design: "rounded" }), foregroundStyle(total > 0 ? warning : primary)]}>
            {String(counts.needsInput)}
          </Text>
          <Text modifiers={[font({ textStyle: "subheadline" }), foregroundStyle(secondary), lineLimit(1)]}>
            {total === 0 ? labels.empty : labels.needsInput}
          </Text>
          {counts.failed > 0 ? (
            <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), foregroundStyle(danger), lineLimit(1)]}>
              {`${counts.failed} ${labels.failed}`}
            </Text>
          ) : null}
        </VStack>
      )}
      <Spacer />
    </VStack>
  );
}

export default createWidget<WidgetSnapshot>("NeedsAttention", NeedsAttention);
