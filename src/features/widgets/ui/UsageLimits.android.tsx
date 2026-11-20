import {
  Box,
  Button,
  Column,
  LinearProgressIndicator,
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
  paddingAll,
  semantics,
  weight,
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { UsageWidgetSnapshot } from "../model/usage-widget";

/**
 * 4x2 glance widget: one column per provider (Codex, Claude), each with its session and
 * weekly bars and reset lines. Self-contained like the other Android widgets: the function
 * body runs without this module's scope, so helpers are local.
 */
export function UsageLimits(
  props: UsageWidgetSnapshot,
  environment: WidgetEnvironment & { width?: number; height?: number },
) {
  "widget";
  const labels = props.labels;
  const scheme = environment.colorScheme === "dark" ? "dark" : "light";
  const palette = props.palette?.[scheme];
  const material = getMaterialColors({ scheme });
  const surface = palette?.background ?? material.surface;
  const card = palette?.surface ?? palette?.track ?? material.surfaceVariant;
  const text = palette?.foreground ?? material.onSurface;
  const muted = palette?.secondary ?? material.onSurfaceVariant;
  const track = palette?.track ?? material.surfaceVariant;
  const toneColor = (tone: string) =>
    tone === "danger"
      ? (palette?.danger ?? material.error)
      : tone === "warning"
        ? (palette?.warning ?? material.tertiary)
        : (palette?.accent ?? material.primary);
  const stale = props.state === "ready" && (props.stale || Date.now() >= props.expiresAt);
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
  const providers = rows
    .map((row) => row.providerName)
    .filter((name, index, all) => all.indexOf(name) === index);
  const url = props.url ?? "bycoda://tools/usage";
  const column = (name: string) => (
    <Column modifiers={[fillMaxWidth()]}>
      <Text color={text} maxLines={1} style={{ fontSize: 13, fontWeight: "bold" }}>
        {name}
      </Text>
      {rows
        .filter((row) => row.providerName === name)
        .map((row) => (
          <Column key={row.id} modifiers={[fillMaxWidth(), height(34)]}>
            <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
              <Text
                color={muted}
                maxLines={1}
                overflow="ellipsis"
                modifiers={[weight(1)]}
                style={{ fontSize: 11 }}
              >
                {row.label}
              </Text>
              <Spacer modifiers={[width(4)]} />
              <Text
                color={toneColor(row.tone)}
                maxLines={1}
                style={{ fontSize: 12, fontWeight: "bold" }}
              >
                {`${row.leftPercent}% ${labels.left}`}
              </Text>
            </Row>
            <LinearProgressIndicator
              progress={row.leftPercent / 100}
              color={toneColor(row.tone)}
              trackColor={track}
              modifiers={[fillMaxWidth()]}
            />
          </Column>
        ))}
    </Column>
  );
  return (
    <Button
      {...{ target: url }}
      colors={{ containerColor: surface }}
      contentPadding={{ start: 0, end: 0, top: 0, bottom: 0 }}
      modifiers={[fillMaxSize()]}
      onClick={() => {}}
    >
      <Column modifiers={[fillMaxSize(), background(surface), paddingAll(12)]}>
        <Text color={text} maxLines={1} style={{ fontSize: 14, fontWeight: "bold" }}>
          {labels.title}
        </Text>
        <Spacer modifiers={[height(6)]} />
        {message || providers.length === 0 ? (
          <Box modifiers={[fillMaxWidth(), background(card), cornerRadius(14), paddingAll(10)]}>
            <Text color={muted} maxLines={3} style={{ fontSize: 13 }}>
              {message || labels.empty}
            </Text>
          </Box>
        ) : (
          <Row modifiers={[fillMaxWidth(), fillMaxSize()]}>
            {providers.map((name, index) => (
              <Row key={name} modifiers={[fillMaxWidth(), semantics({ contentDescription: name })]}>
                {index > 0 ? <Spacer modifiers={[width(12)]} /> : null}
                {column(name)}
              </Row>
            ))}
          </Row>
        )}
      </Column>
    </Button>
  );
}

export default createWidget<UsageWidgetSnapshot>("UsageLimits", UsageLimits);
