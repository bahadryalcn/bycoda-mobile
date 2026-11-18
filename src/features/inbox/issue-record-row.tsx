import type { ReactNode } from "react";
import { Badge, Body, NavigationRow, Row } from "@/ui/primitives";
import type { BadgeProps } from "@/ui/component-props";
import { fontSize, lineHeight } from "@/ui/tokens";

/** Issue identity owns the row width; state, draft and caption wrap below it. */
export function IssueRecordRow({ label, detail, state, stateTone, stateBadge, extraBadges, caption, disabled, onPress }: {
  label: string;
  detail?: string;
  state: string;
  stateTone?: BadgeProps["tone"];
  /** Replaces the default state Badge, e.g. the purple merged pill. */
  stateBadge?: ReactNode;
  /** Small secondary badges (draft, review, checks). */
  extraBadges?: readonly string[];
  /** Author and update time. */
  caption?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const badges = extraBadges?.filter(Boolean) ?? [];
  return <NavigationRow label={label} labelLines={2} emphasized detail={detail} detailLines={2}
    accessibilityLabel={[label, detail, state, ...badges, caption].filter(Boolean).join(". ")}
    supporting={state || badges.length || caption ? <>
      <Row>
        {state ? stateBadge ?? <Badge label={state} tone={stateTone} /> : null}
        {badges.map((badge) => <Badge key={badge} label={badge} />)}
      </Row>
      {caption ? <Body muted style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{caption}</Body> : null}
    </> : undefined}
    disabled={disabled} onPress={onPress} />;
}
