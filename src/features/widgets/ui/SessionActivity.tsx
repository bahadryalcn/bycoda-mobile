import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, lineLimit } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

import type { LiveActivityProps } from "../model/snapshot";

/**
 * Lock-screen / Dynamic Island activity for running sessions (iOS only, started locally).
 * Self-contained: the extension evaluates this function without this module's scope.
 */
function SessionActivity(props: LiveActivityProps, environment: LiveActivityEnvironment) {
  "widget";
  const waiting = props.needsInput > 0;
  const total = props.running + props.needsInput;
  const palette = props.palette?.[environment.colorScheme === "dark" ? "dark" : "light"];
  const tint = waiting ? (palette?.warning ?? "primary") : (palette?.accent ?? "primary");
  const headline = waiting
    ? `${props.needsInput} ${props.labels.needsInput}`
    : `${props.running} ${props.labels.running}`;
  const note = environment.isStale ? props.labels.stale : headline;
  const banner = (
    <VStack alignment="leading" spacing={6}>
      <HStack spacing={6}>
        <Image
          systemName={waiting ? "hand.raised.fill" : "play.circle.fill"}
          size={16}
          color={tint}
        />
        <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{props.title}</Text>
        <Spacer />
        <Text
          modifiers={[
            font({ textStyle: "subheadline", weight: "semibold" }),
            foregroundStyle(environment.isStale ? "secondary" : tint),
            lineLimit(1),
          ]}
        >
          {note}
        </Text>
      </HStack>
      {props.rows.map((row, index) => (
        <HStack key={`${index}-${row.project}`} spacing={6}>
          <Image
            systemName={row.status === "needs_input" ? "hand.raised.fill" : "play.circle.fill"}
            size={12}
            color={
              row.status === "needs_input"
                ? (palette?.warning ?? "primary")
                : (palette?.accent ?? "primary")
            }
          />
          <Text modifiers={[font({ textStyle: "subheadline" }), lineLimit(1)]}>
            {row.title || row.project}
          </Text>
          <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{row.detail}</Text>
          <Spacer />
        </HStack>
      ))}
    </VStack>
  );
  return {
    banner,
    bannerSmall: (
      <Text modifiers={[font({ textStyle: "subheadline", weight: "semibold" }), lineLimit(1)]}>
        {`${props.title} · ${note}`}
      </Text>
    ),
    compactLeading: (
      <Image
        systemName={waiting ? "hand.raised.fill" : "play.circle.fill"}
        size={14}
        color={tint}
      />
    ),
    compactTrailing: (
      <Text modifiers={[font({ textStyle: "caption", weight: "semibold" })]}>{String(total)}</Text>
    ),
    minimal: (
      <Image
        systemName={waiting ? "hand.raised.fill" : "play.circle.fill"}
        size={14}
        color={tint}
      />
    ),
    expandedLeading: (
      <Image
        systemName={waiting ? "hand.raised.fill" : "play.circle.fill"}
        size={20}
        color={tint}
      />
    ),
    expandedCenter: <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{note}</Text>,
    expandedTrailing: (
      <Text modifiers={[font({ textStyle: "title3", weight: "bold" })]}>{String(total)}</Text>
    ),
    expandedBottom: banner,
  };
}

export default createLiveActivity<LiveActivityProps>("SessionActivity", SessionActivity);
