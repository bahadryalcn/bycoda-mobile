import { HStack, Image, Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/**
 * Home-screen widget listing running and waiting sessions. The function body is evaluated
 * inside the widget extension without this module's scope, so it only uses imported view
 * factories and declares every helper locally. Strings arrive pre-localized in the snapshot.
 */
function ActiveSessions(props: WidgetSnapshot, environment: WidgetEnvironment) {
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
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const sessions = props.sessions ?? [];
  const accessory = family === "accessoryRectangular";
  const statusColor = (status: string) =>
    monochrome
      ? "primary"
      : status === "needs_input"
        ? (palette?.warning ?? "orange")
        : status === "failed"
          ? (palette?.danger ?? "red")
          : status === "running"
            ? (palette?.accent ?? "blue")
            : (palette?.success ?? "green");
  const statusSymbol = (status: string) =>
    status === "needs_input"
      ? "hand.raised.fill"
      : status === "failed"
        ? "exclamationmark.triangle.fill"
        : status === "running"
          ? "play.circle.fill"
          : "checkmark.circle.fill";
  const modifiers = [
    ...(props.url ? [widgetURL(props.url)] : []),
    ...(!accessory && palette ? [containerBackground(monochrome ? "clear" : palette.background, "widget")] : []),
  ];
  const message = state === "locked" ? labels.locked : state === "setup" ? labels.setup : stale ? labels.stale : "";
  if (accessory) {
    return (
      <VStack alignment="leading" spacing={2} modifiers={modifiers}>
        <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), lineLimit(1)]}>
          {labels.title}
        </Text>
        <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>
          {message ||
            `${counts.running} ${labels.running}${counts.needsInput > 0 ? ` · ${counts.needsInput} ${labels.needsInput}` : ""}`}
        </Text>
      </VStack>
    );
  }
  if (message) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={modifiers}>
        <Text modifiers={[font({ textStyle: "headline" }), foregroundStyle(primary), lineLimit(1)]}>
          {labels.title}
        </Text>
        <Text modifiers={[font({ textStyle: "subheadline" }), foregroundStyle(secondary)]}>
          {message}
        </Text>
        <Spacer />
      </VStack>
    );
  }
  const limit = family === "systemLarge" || family === "systemExtraLarge" ? 5 : 3;
  const showRows = family !== "systemSmall" && sessions.length > 0;
  return (
    <VStack alignment="leading" spacing={8} modifiers={modifiers}>
      <HStack spacing={6}>
        <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), foregroundStyle(secondary), lineLimit(1)]}>
          {labels.title}
        </Text>
        <Spacer />
        {counts.needsInput > 0 ? (
          <HStack spacing={3}>
            <Image systemName="hand.raised.fill" size={11} color={statusColor("needs_input")} />
            <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), foregroundStyle(statusColor("needs_input"))]}>
              {String(counts.needsInput)}
            </Text>
          </HStack>
        ) : null}
        {counts.failed > 0 ? (
          <HStack spacing={3}>
            <Image systemName="exclamationmark.triangle.fill" size={11} color={statusColor("failed")} />
            <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), foregroundStyle(statusColor("failed"))]}>
              {String(counts.failed)}
            </Text>
          </HStack>
        ) : null}
      </HStack>
      {showRows ? (
        <VStack alignment="leading" spacing={6}>
          {sessions.slice(0, limit).map((row) => (
            <Link key={row.id} destination={row.url}>
              <HStack spacing={8} modifiers={[frame({ maxWidth: 10000, alignment: "leading" })]}>
                <Image systemName={statusSymbol(row.status)} size={14} color={statusColor(row.status)} />
                <VStack alignment="leading" spacing={0}>
                  <Text modifiers={[font({ textStyle: "subheadline", weight: "medium" }), foregroundStyle(primary), lineLimit(1)]}>
                    {row.title || row.project}
                  </Text>
                  {row.title ? (
                    <Text modifiers={[font({ textStyle: "caption2" }), foregroundStyle(secondary), lineLimit(1)]}>
                      {row.project}
                    </Text>
                  ) : null}
                </VStack>
                <Spacer />
              </HStack>
            </Link>
          ))}
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 38, weight: "bold", design: "rounded" }), foregroundStyle(primary)]}>
            {String(counts.running)}
          </Text>
          <Text modifiers={[font({ textStyle: "subheadline" }), foregroundStyle(secondary), lineLimit(1)]}>
            {counts.running + counts.needsInput + counts.failed === 0 ? labels.empty : labels.running}
          </Text>
        </VStack>
      )}
      <Spacer />
    </VStack>
  );
}

export default createWidget<WidgetSnapshot>("ActiveSessions", ActiveSessions);
