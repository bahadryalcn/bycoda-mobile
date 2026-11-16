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
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetSnapshot } from "../model/snapshot";

/**
 * Glance widget for what needs the owner: open questions first, then failed turns. Small
 * sizes show the most urgent item as one tinted card. Self-contained: see ActiveSessions.
 */
export function NeedsAttention(
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
  const w = environment.width ?? 170;
  const h = environment.height ?? 170;
  const small = w < 230;
  const tiny = h < 150;
  const url = props.url ?? "bycoda://sessions";
  const waiting = (props.sessions ?? []).filter(
    (row) => row.status === "needs_input" || row.status === "failed",
  );
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
      {counts.needsInput > 0 ? chip("needs_input", counts.needsInput) : null}
      {counts.needsInput > 0 && counts.failed > 0 ? <Spacer modifiers={[width(4)]} /> : null}
      {counts.failed > 0 ? chip("failed", counts.failed) : null}
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
      <Text color={text} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>
        {labels.title}
      </Text>
      {!message ? (
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          {chips}
        </Box>
      ) : null}
    </Box>
  );
  const quiet = (body: string, status: string) => (
    <Row verticalAlignment="center">
      {badge(status, 28)}
      <Spacer modifiers={[width(10)]} />
      <Text color={muted} maxLines={3} style={{ fontSize: 13 }}>
        {body}
      </Text>
    </Row>
  );

  if (message || waiting.length === 0) {
    return (
      <Button
        {...{ target: url }}
        colors={{ containerColor: surface }}
        contentPadding={{ start: 0, end: 0, top: 0, bottom: 0 }}
        modifiers={[fillMaxSize()]}
        onClick={() => {}}
      >
        {/* Header pinned on top; wider sizes center the note instead of leaving empty space. */}
        <Box modifiers={[fillMaxSize(), paddingAll(tiny ? 10 : 14)]}>
          {tiny ? null : header}
          <Box
            contentAlignment={small || tiny ? "topStart" : "centerStart"}
            modifiers={[fillMaxSize()]}
          >
            <Column>
              {small && !tiny ? <Spacer modifiers={[height(30)]} /> : null}
              {quiet(message || labels.clear || labels.empty, message ? "open" : "done")}
            </Column>
          </Box>
        </Box>
      </Button>
    );
  }

  const limit = small || tiny ? 1 : Math.max(1, Math.min(5, Math.floor((h - 58) / 60)));
  const rows = waiting.slice(0, limit);
  const big = small && !tiny;
  return (
    <Column modifiers={[fillMaxSize(), background(surface), paddingAll(tiny ? 8 : 14)]}>
      {tiny ? null : (
        <Button
          {...{ target: url }}
          colors={{ containerColor: surface }}
          contentPadding={{ start: 0, end: 0, top: 0, bottom: 0 }}
          modifiers={[fillMaxWidth()]}
          onClick={() => {}}
        >
          {header}
        </Button>
      )}
      {tiny ? null : <Spacer modifiers={[height(10)]} />}
      {rows.map((row, index) => (
        <Column key={row.id} modifiers={[fillMaxWidth()]}>
          {index > 0 ? <Spacer modifiers={[height(6)]} /> : null}
          <Button
            {...{ target: row.url }}
            colors={{ containerColor: big || tiny ? tone(row.status).bg : card }}
            contentPadding={{ start: 10, end: 10, top: big ? 10 : 8, bottom: big ? 10 : 8 }}
            modifiers={[
              fillMaxWidth(),
              ...(big ? [fillMaxSize()] : []),
              cornerRadius(14),
              semantics({ contentDescription: `${row.title || row.project} · ${row.detail}` }),
            ]}
            onClick={() => {}}
          >
            {big || tiny ? (
              <Column modifiers={[fillMaxWidth()]}>
                <Row verticalAlignment="center">
                  <Text color={tone(row.status).fg} style={{ fontSize: 15, fontWeight: "bold" }}>
                    {tone(row.status).glyph}
                  </Text>
                  <Spacer modifiers={[width(6)]} />
                  <Text color={text} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>
                    {row.title || row.project}
                  </Text>
                </Row>
                <Spacer modifiers={[height(4)]} />
                <Text color={tone(row.status).fg} maxLines={tiny ? 1 : 3} style={{ fontSize: 13 }}>
                  {row.detail}
                </Text>
                {row.title && !tiny ? (
                  <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
                    {row.project}
                  </Text>
                ) : null}
              </Column>
            ) : (
              <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                {badge(row.status, 30)}
                <Spacer modifiers={[width(10)]} />
                <Column>
                  <Text color={text} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>
                    {row.title || row.project}
                  </Text>
                  <Row verticalAlignment="center">
                    <Text color={tone(row.status).fg} maxLines={1} style={{ fontSize: 12 }}>
                      {row.detail}
                    </Text>
                    {row.title ? (
                      <Text color={muted} maxLines={1} style={{ fontSize: 12 }}>
                        {` · ${row.project}`}
                      </Text>
                    ) : null}
                  </Row>
                </Column>
              </Row>
            )}
          </Button>
        </Column>
      ))}
    </Column>
  );
}

export default createWidget<WidgetSnapshot>("NeedsAttention", NeedsAttention);
