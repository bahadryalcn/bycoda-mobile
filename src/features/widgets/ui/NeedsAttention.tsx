import { HStack, Image, Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  shapes,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/** The most urgent question or failure as one tinted card. Self-contained: see ActiveSessions. */
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
    environment.widgetRenderingMode !== undefined &&
    environment.widgetRenderingMode !== "fullColor";
  const palette = props.palette?.[environment.colorScheme === "dark" ? "dark" : "light"];
  const primary = !monochrome && palette ? palette.foreground : "primary";
  const secondary = !monochrome && palette ? palette.secondary : "secondary";
  const warning = monochrome ? "primary" : (palette?.warning ?? "orange");
  const danger = monochrome ? "primary" : (palette?.danger ?? "red");
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const message =
    state === "locked"
      ? labels.locked
      : state === "setup"
        ? labels.setup
        : stale
          ? labels.stale
          : "";
  const total = counts.needsInput + counts.failed;
  const top = props.sessions?.find(
    (row) => row.status === "needs_input" || row.status === "failed",
  );
  const modifiers = [
    ...((!message && top?.url) || props.url
      ? [widgetURL(!message && top ? top.url : props.url)]
      : []),
    ...(family !== "accessoryCircular" && family !== "accessoryRectangular" && palette
      ? [containerBackground(monochrome ? "clear" : palette.background, "widget")]
      : []),
  ];
  if (family === "accessoryInline") {
    return (
      <Text modifiers={modifiers}>{message || `${total} · ${top?.detail || labels.empty}`}</Text>
    );
  }
  if (family === "accessoryCircular") {
    return (
      <VStack spacing={0} modifiers={modifiers}>
        <Image systemName="hand.raised.fill" size={14} />
        <Text modifiers={[font({ size: 18, weight: "bold" })]}>
          {message ? "-" : String(total)}
        </Text>
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
          {message || `${total} · ${top?.detail || labels.empty}`}
        </Text>
      </VStack>
    );
  }
  const clear = labels.clear ?? labels.empty;
  const tone = top?.status === "failed" ? danger : warning;
  const soft = monochrome
    ? undefined
    : top?.status === "failed"
      ? palette?.dangerSoft
      : palette?.warningSoft;
  return (
    <VStack alignment="leading" spacing={8} modifiers={modifiers}>
      <HStack spacing={4}>
        <Text
          modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle(primary), lineLimit(1)]}
        >
          {labels.title}
        </Text>
        <Spacer />
        {!message && counts.needsInput > 0 ? (
          <HStack spacing={2}>
            <Image systemName="questionmark.bubble.fill" size={9} color={warning} />
            <Text
              modifiers={[
                font({ size: 12, weight: "bold", design: "rounded" }),
                foregroundStyle(warning),
              ]}
            >
              {String(counts.needsInput)}
            </Text>
          </HStack>
        ) : null}
        {!message && counts.failed > 0 ? (
          <HStack spacing={2}>
            <Image systemName="exclamationmark.triangle.fill" size={9} color={danger} />
            <Text
              modifiers={[
                font({ size: 12, weight: "bold", design: "rounded" }),
                foregroundStyle(danger),
              ]}
            >
              {String(counts.failed)}
            </Text>
          </HStack>
        ) : null}
      </HStack>
      {message || !top ? (
        <VStack alignment="leading" spacing={8}>
          <Image
            systemName={message ? "lock.fill" : "checkmark"}
            size={14}
            color={message ? secondary : monochrome ? "primary" : (palette?.success ?? "green")}
            modifiers={[
              frame({ width: 30, height: 30 }),
              ...(!monochrome && !message && palette?.successSoft
                ? [background(palette.successSoft, shapes.roundedRectangle({ cornerRadius: 10 }))]
                : []),
            ]}
          />
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>
            {message || clear}
          </Text>
          <Spacer />
        </VStack>
      ) : (
        <Link destination={top.url}>
          <VStack
            alignment="leading"
            spacing={4}
            modifiers={[
              padding({ all: 10 }),
              frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" }),
              ...(soft ? [background(soft, shapes.roundedRectangle({ cornerRadius: 14 }))] : []),
            ]}
          >
            <HStack spacing={5}>
              <Image
                systemName={
                  top.status === "failed"
                    ? "exclamationmark.triangle.fill"
                    : "questionmark.bubble.fill"
                }
                size={12}
                color={tone}
              />
              <Text
                modifiers={[
                  font({ size: 14, weight: "semibold" }),
                  foregroundStyle(primary),
                  lineLimit(1),
                ]}
              >
                {top.title || top.project}
              </Text>
            </HStack>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(tone), lineLimit(3)]}>
              {top.detail}
            </Text>
            <Spacer />
            {top.title ? (
              <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1)]}>
                {top.project}
              </Text>
            ) : null}
          </VStack>
        </Link>
      )}
    </VStack>
  );
}

export default createWidget<WidgetSnapshot>("NeedsAttention", NeedsAttention);
