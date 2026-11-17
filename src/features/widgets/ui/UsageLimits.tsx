import { HStack, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  tint,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { UsageWidgetSnapshot } from "../model/usage-widget";

/**
 * Codex and Claude session and weekly limits as percent bars. The function body is evaluated
 * inside the widget extension without this module's scope, so helpers are declared locally
 * and every string arrives pre-localized in the snapshot. Rows carry no account names.
 */
function UsageLimits(props: UsageWidgetSnapshot, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily;
  const labels = props.labels;
  const monochrome =
    environment.widgetRenderingMode !== undefined &&
    environment.widgetRenderingMode !== "fullColor";
  const palette = props.palette?.[environment.colorScheme === "dark" ? "dark" : "light"];
  const primary = !monochrome && palette ? palette.foreground : "primary";
  const secondary = !monochrome && palette ? palette.secondary : "secondary";
  const toneColor = (tone: string) =>
    monochrome || !palette
      ? primary
      : tone === "danger"
        ? palette.danger
        : tone === "warning"
          ? palette.warning
          : palette.accent;
  const stale = props.state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const message =
    props.state === "locked"
      ? labels.locked
      : props.state === "setup"
        ? labels.setup
        : stale
          ? labels.stale
          : props.state === "empty"
            ? labels.empty
            : "";
  const rows = message ? [] : (props.rows ?? []);
  const modifiers = [
    widgetURL(props.url),
    ...(family !== "accessoryRectangular" && palette
      ? [containerBackground(monochrome ? "clear" : palette.background, "widget")]
      : []),
  ];
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={2} modifiers={modifiers}>
        <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), lineLimit(1)]}>
          {labels.title}
        </Text>
        {message ? (
          <Text modifiers={[font({ textStyle: "caption" }), lineLimit(2)]}>{message}</Text>
        ) : (
          rows.slice(0, 2).map((row) => (
            <Text key={row.id} modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>
              {`${row.providerName} ${row.label} ${row.leftPercent}%`}
            </Text>
          ))
        )}
      </VStack>
    );
  }
  const medium = family === "systemMedium";
  return (
    <VStack alignment="leading" spacing={medium ? 8 : 6} modifiers={modifiers}>
      <Text
        modifiers={[
          font({ size: 14, weight: "bold" }),
          foregroundStyle(primary),
          lineLimit(1),
        ]}
      >
        {labels.title}
      </Text>
      {message ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary), lineLimit(3)]}>
          {message}
        </Text>
      ) : (
        rows.map((row) => (
          <VStack key={row.id} alignment="leading" spacing={3}>
            <HStack spacing={4}>
              <Text
                modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(primary), lineLimit(1)]}
              >
                {`${row.providerName} · ${row.label}`}
              </Text>
              <Spacer />
              <Text
                modifiers={[
                  font({ size: 12, weight: "bold", design: "rounded" }),
                  foregroundStyle(toneColor(row.tone)),
                ]}
              >
                {`${row.leftPercent}% ${labels.left}`}
              </Text>
            </HStack>
            <ProgressView value={row.leftPercent / 100} modifiers={[tint(toneColor(row.tone))]} />
            {medium ? (
              <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1)]}>
                {row.resetText}
              </Text>
            ) : null}
          </VStack>
        ))
      )}
    </VStack>
  );
}

export default createWidget<UsageWidgetSnapshot>("UsageLimits", UsageLimits);
