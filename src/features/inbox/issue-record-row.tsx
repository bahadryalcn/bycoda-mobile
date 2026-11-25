import type { ReactNode } from "react";
import { Badge, Body, NavigationRow, Row, StatusText } from "@/ui/primitives";
import type { BadgeProps } from "@/ui/component-props";
import { fontSize, lineHeight } from "@/ui/tokens";

/**
 * Issue identity owns the row width; state, draft and caption wrap below it. The ordinary workflow
 * state (open, closed, approved) is quiet text; only a state the owner must act on keeps a tinted badge.
 */
export function IssueRecordRow({ label, detail, state, stateTone, stateBadge, extraBadges, caption, disabled, onPress }: {
  label: string;
  detail?: string;
  state: string;
  stateTone?: BadgeProps["tone"];
  /** Replaces the default state presentation, e.g. the purple merged pill. */
  stateBadge?: ReactNode;
  /** Small secondary badges (draft, review, checks). */
  extraBadges?: readonly string[];
  /** Author and update time. */
  caption?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const badges = extraBadges?.filter(Boolean) ?? [];
  return <NavigationRow label={label} labelLines={2} detail={detail} detailLines={2}
    accessibilityLabel={[label, detail, state, ...badges, caption].filter(Boolean).join(". ")}
    supporting={state || badges.length || caption ? <Row>
      {state ? stateBadge ?? <ProviderState label={state} tone={stateTone} /> : null}
      {badges.map((badge) => <Badge key={badge} label={badge} />)}
      {caption ? <Body muted style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{caption}</Body> : null}
    </Row> : undefined}
    disabled={disabled} onPress={onPress} />;
}

/**
 * A provider workflow/check state: one the owner must act on (warning, danger) is a tinted badge;
 * the ordinary state (open, approved, passed) is quiet text and progress keeps its live tone.
 */
export function ProviderState({ label, tone }: { label: string; tone?: BadgeProps["tone"] }) {
  if (tone === "warning" || tone === "danger") return <Badge label={label} tone={tone} />;
  return <StatusText label={label} tone={tone === "active" || tone === "live" || tone === "info" ? tone : "default"} />;
}
