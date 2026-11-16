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

/**
 * Home-screen widget listing running, waiting and failed sessions as tinted cards. The
 * function body is evaluated inside the widget extension without this module's scope, so it
 * only uses imported view factories and declares every helper locally. Strings arrive
 * pre-localized in the snapshot.
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
    environment.widgetRenderingMode !== undefined &&
    environment.widgetRenderingMode !== "fullColor";
  const palette = props.palette?.[environment.colorScheme === "dark" ? "dark" : "light"];
  const primary = !monochrome && palette ? palette.foreground : "primary";
  const secondary = !monochrome && palette ? palette.secondary : "secondary";
  const card = !monochrome ? (palette?.surface ?? palette?.track) : undefined;
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale === true || Date.now() >= props.expiresAt);
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const sessions = props.sessions ?? [];
  const accessory = family === "accessoryRectangular";
  const tone = (status: string) =>
    status === "needs_input"
      ? {
          fg: palette?.warning ?? "orange",
          bg: palette?.warningSoft,
          symbol: "questionmark.bubble.fill" as const,
        }
      : status === "failed"
        ? {
            fg: palette?.danger ?? "red",
            bg: palette?.dangerSoft,
            symbol: "exclamationmark.triangle.fill" as const,
          }
        : status === "running"
          ? { fg: palette?.accent ?? "blue", bg: palette?.accentSoft, symbol: "play.fill" as const }
          : status === "open"
            ? {
                fg: palette?.secondary ?? "gray",
                bg: card,
                symbol: "arrow.up.forward.app" as const,
              }
            : {
                fg: palette?.success ?? "green",
                bg: palette?.successSoft,
                symbol: "checkmark" as const,
              };
  const fg = (status: string) => (monochrome ? "primary" : tone(status).fg);
  const badge = (status: string, side: number) => (
    <Image
      systemName={tone(status).symbol}
      size={side * 0.45}
      color={fg(status)}
      modifiers={[
        frame({ width: side, height: side }),
        ...(!monochrome && tone(status).bg
          ? [background(tone(status).bg!, shapes.roundedRectangle({ cornerRadius: side / 3.2 }))]
          : []),
      ]}
    />
  );
  const chip = (status: string, count: number) => (
    <HStack
      key={status}
      spacing={3}
      modifiers={[
        padding({ horizontal: 7, vertical: 2 }),
        ...(!monochrome && tone(status).bg ? [background(tone(status).bg!, shapes.capsule())] : []),
      ]}
    >
      <Image systemName={tone(status).symbol} size={9} color={fg(status)} />
      <Text
        modifiers={[
          font({ size: 12, weight: "bold", design: "rounded" }),
          foregroundStyle(fg(status)),
        ]}
      >
        {String(count)}
      </Text>
    </HStack>
  );
  const stats = [
    { status: "needs_input", count: counts.needsInput, label: labels.needsInput },
    { status: "failed", count: counts.failed, label: labels.failed },
    { status: "running", count: counts.running, label: labels.running },
  ];
  const modifiers = [
    ...(props.url ? [widgetURL(props.url)] : []),
    ...(!accessory && palette
      ? [containerBackground(monochrome ? "clear" : palette.background, "widget")]
      : []),
  ];
  const message =
    state === "locked"
      ? labels.locked
      : state === "setup"
        ? labels.setup
        : stale
          ? labels.stale
          : "";
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
  const header = (
    <HStack spacing={6}>
      <Text
        modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle(primary), lineLimit(1)]}
      >
        {labels.title}
      </Text>
      {props.machineName && family !== "systemSmall" ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(1)]}>
          {props.machineName}
        </Text>
      ) : null}
      <Spacer />
      {!message && family !== "systemSmall"
        ? stats.filter((stat) => stat.count > 0).map((stat) => chip(stat.status, stat.count))
        : null}
    </HStack>
  );
  if (message) {
    return (
      <VStack alignment="leading" spacing={10} modifiers={modifiers}>
        {header}
        {family === "systemSmall" ? null : <Spacer />}
        <HStack spacing={10}>
          {badge("open", 28)}
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{message}</Text>
        </HStack>
        <Spacer />
      </VStack>
    );
  }
  if (family === "systemSmall") {
    const lead = stats.find((stat) => stat.count > 0);
    const rest = stats.filter((stat) => stat !== lead && stat.count > 0);
    return (
      <VStack alignment="leading" spacing={4} modifiers={modifiers}>
        {header}
        <Spacer />
        {lead ? (
          <VStack alignment="leading" spacing={0}>
            <Text
              modifiers={[
                font({ size: 44, weight: "bold", design: "rounded" }),
                foregroundStyle(fg(lead.status)),
              ]}
            >
              {String(lead.count)}
            </Text>
            <Text
              modifiers={[
                font({ size: 13, weight: "semibold" }),
                foregroundStyle(primary),
                lineLimit(1),
              ]}
            >
              {lead.label}
            </Text>
          </VStack>
        ) : (
          <HStack spacing={8}>
            {badge("done", 28)}
            <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary), lineLimit(2)]}>
              {labels.empty}
            </Text>
          </HStack>
        )}
        {rest.length ? (
          <HStack spacing={4}>{rest.map((stat) => chip(stat.status, stat.count))}</HStack>
        ) : null}
      </VStack>
    );
  }
  const limit = family === "systemLarge" || family === "systemExtraLarge" ? 5 : 2;
  return (
    <VStack alignment="leading" spacing={8} modifiers={modifiers}>
      {header}
      {sessions.length === 0 ? (
        <HStack spacing={10}>
          {badge("done", 28)}
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{labels.empty}</Text>
        </HStack>
      ) : (
        <VStack alignment="leading" spacing={6}>
          {sessions.slice(0, limit).map((row) => (
            <Link key={row.id} destination={row.url}>
              <HStack
                spacing={10}
                modifiers={[
                  padding({ horizontal: 8, vertical: 7 }),
                  frame({ maxWidth: 10000, alignment: "leading" }),
                  ...(card
                    ? [background(card, shapes.roundedRectangle({ cornerRadius: 14 }))]
                    : []),
                ]}
              >
                {badge(row.status, 30)}
                <VStack alignment="leading" spacing={1}>
                  <Text
                    modifiers={[
                      font({ size: 14, weight: "semibold" }),
                      foregroundStyle(primary),
                      lineLimit(1),
                    ]}
                  >
                    {row.title || row.project}
                  </Text>
                  <HStack spacing={4}>
                    {row.startedAt ? (
                      <Text
                        date={new Date(row.startedAt)}
                        dateStyle="timer"
                        modifiers={[
                          font({ size: 12, design: "rounded" }),
                          foregroundStyle(fg("running")),
                        ]}
                      />
                    ) : (
                      <Text
                        modifiers={[
                          font({ size: 12 }),
                          foregroundStyle(fg(row.status)),
                          lineLimit(1),
                        ]}
                      >
                        {row.detail}
                      </Text>
                    )}
                    {row.title ? (
                      <Text
                        modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(1)]}
                      >
                        {`· ${row.project}`}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
                <Spacer />
              </HStack>
            </Link>
          ))}
        </VStack>
      )}
      <Spacer />
    </VStack>
  );
}

export default createWidget<WidgetSnapshot>("ActiveSessions", ActiveSessions);
