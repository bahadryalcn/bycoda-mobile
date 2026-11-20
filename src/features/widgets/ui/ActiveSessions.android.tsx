import {
  Box,
  Button,
  Column,
  Row,
  Spacer,
  Text,
  getMaterialColors,
} from "@expo/ui/jetpack-compose";
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  semantics,
  size,
  weight,
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/**
 * Glance home-screen widget: every running, waiting and failed session as a tappable card.
 * The function body runs in the widget runtime without this module's scope, so all helpers
 * are local. Small sizes switch to a single headline count; the pinned expo-widgets patch
 * supplies the size and direct session links.
 */
export function ActiveSessions(
  props: WidgetSnapshot,
  environment: WidgetEnvironment & { width?: number; height?: number },
) {
  "widget";
  const labels = props.labels ?? {
    title: "bycoda",
    running: "Running",
    needsInput: "Needs input",
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
  const card = palette?.surface ?? palette?.track ?? material.surfaceVariant;
  const text = palette?.foreground ?? material.onSurface;
  const muted = palette?.secondary ?? material.onSurfaceVariant;
  const tone = (status: string) =>
    status === "needs_input"
      ? { fg: palette?.warning ?? material.tertiary, bg: palette?.warningSoft ?? card, glyph: "?" }
      : status === "failed"
        ? { fg: palette?.danger ?? material.error, bg: palette?.dangerSoft ?? card, glyph: "!" }
        : status === "running"
          ? { fg: palette?.accent ?? material.primary, bg: palette?.accentSoft ?? card, glyph: "▶" }
          : status === "open"
            ? { fg: muted, bg: card, glyph: "↗" }
            : {
                fg: palette?.success ?? material.primary,
                bg: palette?.successSoft ?? card,
                glyph: "✓",
              };
  const counts = props.counts ?? { running: 0, needsInput: 0, failed: 0 };
  const total = counts.running + counts.needsInput + counts.failed;
  const state = props.state ?? "setup";
  const stale = state === "ready" && (props.stale || Date.now() >= props.expiresAt);
  const message =
    state === "locked"
      ? labels.locked
      : state === "setup"
        ? labels.setup
        : stale
          ? labels.stale
          : "";
  const w = environment.width ?? 300;
  const h = environment.height ?? 180;
  const small = w < 230;
  const tiny = h < 150;
  const url = props.url ?? "bycoda://sessions";
  const stats = [
    { status: "needs_input", count: counts.needsInput, label: labels.needsInput },
    { status: "failed", count: counts.failed, label: labels.failed },
    { status: "running", count: counts.running, label: labels.running },
  ];
  const chip = (status: string, count: number) => (
    <Box
      key={status}
      modifiers={[background(tone(status).bg), cornerRadius(10), padding(7, 2, 7, 2)]}
    >
      <Text color={tone(status).fg} maxLines={1} style={{ fontSize: 12, fontWeight: "bold" }}>
        {`${tone(status).glyph} ${count}`}
      </Text>
    </Box>
  );
  const chips = (
    <Row verticalAlignment="center">
      {stats
        .filter((stat) => stat.count > 0)
        .map((stat, index) => (
          <Row key={stat.status} verticalAlignment="center">
            {index > 0 ? <Spacer modifiers={[width(4)]} /> : null}
            {chip(stat.status, stat.count)}
          </Row>
        ))}
    </Row>
  );
  const badge = (status: string, side: number) => (
    <Box
      contentAlignment="center"
      modifiers={[size(side, side), background(tone(status).bg), cornerRadius(side / 3)]}
    >
      <Text color={tone(status).fg} style={{ fontSize: side / 2, fontWeight: "bold" }}>
        {tone(status).glyph}
      </Text>
    </Box>
  );
  const header = (
    <Box modifiers={[fillMaxWidth()]}>
      <Row verticalAlignment="center">
        <Text color={text} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>
          {labels.title}
        </Text>
        {props.machineName && !small ? (
          <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
            {`  ${props.machineName}`}
          </Text>
        ) : null}
      </Row>
      {!small && !message ? (
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          {chips}
        </Box>
      ) : null}
    </Box>
  );

  if (message) {
    return (
      <Button
        {...{ target: url }}
        colors={{ containerColor: surface }}
        contentPadding={{ start: 0, end: 0, top: 0, bottom: 0 }}
        modifiers={[fillMaxSize()]}
        onClick={() => {}}
      >
        {/* Header pinned on top; on wider sizes the message centers in the rest instead of
            leaving the lower half empty. Glance has no flex weight, so this overlays a Box. */}
        <Box modifiers={[fillMaxSize(), paddingAll(14)]}>
          {header}
          <Box contentAlignment={small ? "topStart" : "centerStart"} modifiers={[fillMaxSize()]}>
            <Column>
              {small ? <Spacer modifiers={[height(30)]} /> : null}
              <Row verticalAlignment="center">
                {badge("open", 28)}
                <Spacer modifiers={[width(10)]} />
                <Text color={muted} maxLines={3} style={{ fontSize: 13 }}>
                  {message}
                </Text>
              </Row>
            </Column>
          </Box>
        </Box>
      </Button>
    );
  }

  if (small || tiny) {
    const lead = stats.find((stat) => stat.count > 0);
    const rest = stats.filter((stat) => stat !== lead && stat.count > 0);
    const description = stats.map((stat) => `${stat.count} ${stat.label}`).join(" · ");
    return (
      <Button
        {...{ target: url }}
        colors={{ containerColor: surface }}
        contentPadding={{ start: 0, end: 0, top: 0, bottom: 0 }}
        modifiers={[fillMaxSize(), semantics({ contentDescription: description })]}
        onClick={() => {}}
      >
        <Column modifiers={[fillMaxSize(), paddingAll(tiny ? 10 : 14)]}>
          {tiny ? null : header}
          {tiny ? null : <Spacer modifiers={[height(8)]} />}
          {lead ? (
            <Column>
              <Text
                color={tone(lead.status).fg}
                maxLines={1}
                style={{ fontSize: tiny ? 30 : 40, fontWeight: "bold" }}
              >
                {String(lead.count)}
              </Text>
              <Text color={text} maxLines={1} style={{ fontSize: 13, fontWeight: "bold" }}>
                {lead.label}
              </Text>
            </Column>
          ) : (
            <Row verticalAlignment="center">
              {badge("done", 28)}
              <Spacer modifiers={[width(8)]} />
              <Text color={muted} maxLines={2} style={{ fontSize: 13 }}>
                {labels.empty}
              </Text>
            </Row>
          )}
          {rest.length ? <Spacer modifiers={[height(8)]} /> : null}
          {rest.length ? (
            <Row verticalAlignment="center">
              {rest.map((stat, index) => (
                <Row key={stat.status} verticalAlignment="center">
                  {index > 0 ? <Spacer modifiers={[width(4)]} /> : null}
                  {chip(stat.status, stat.count)}
                </Row>
              ))}
            </Row>
          ) : null}
        </Column>
      </Button>
    );
  }

  const limit = Math.max(1, Math.min(5, Math.floor((h - 58) / 60)));
  const rows = (props.sessions ?? []).slice(0, limit);
  return (
    <Column modifiers={[fillMaxSize(), background(surface), paddingAll(14)]}>
      <Button
        {...{ target: url }}
        colors={{ containerColor: surface }}
        contentPadding={{ start: 0, end: 0, top: 0, bottom: 0 }}
        modifiers={[fillMaxWidth()]}
        onClick={() => {}}
      >
        {header}
      </Button>
      <Spacer modifiers={[height(10)]} />
      {total === 0 && rows.length === 0 ? (
        <Row verticalAlignment="center">
          {badge("done", 28)}
          <Spacer modifiers={[width(10)]} />
          <Text color={muted} maxLines={2} style={{ fontSize: 13 }}>
            {labels.empty}
          </Text>
        </Row>
      ) : null}
      {rows.map((row, index) => (
        <Column key={row.id} modifiers={[fillMaxWidth()]}>
          {index > 0 ? <Spacer modifiers={[height(6)]} /> : null}
          <Button
            {...{ target: row.url }}
            colors={{ containerColor: card }}
            contentPadding={{ start: 10, end: 10, top: 8, bottom: 8 }}
            modifiers={[
              fillMaxWidth(),
              cornerRadius(14),
              semantics({
                contentDescription: `${row.title || row.project} · ${row.startedLabel || row.detail}`,
              }),
            ]}
            onClick={() => {}}
          >
            <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
              {badge(row.status, 30)}
              <Spacer modifiers={[width(10)]} />
              <Column modifiers={[weight(1)]}>
                <Text color={text} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>
                  {row.title || row.project}
                </Text>
                <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                  <Text
                    color={row.status === "running" ? muted : tone(row.status).fg}
                    maxLines={1}
                    overflow="ellipsis"
                    modifiers={[weight(1)]}
                    style={{ fontSize: 12 }}
                  >
                    {row.startedLabel || row.detail}
                  </Text>
                  {row.title ? (
                    <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
                      {` · ${row.project}`}
                    </Text>
                  ) : null}
                </Row>
              </Column>
            </Row>
          </Button>
        </Column>
      ))}
    </Column>
  );
}

export default createWidget<WidgetSnapshot>("ActiveSessions", ActiveSessions);
