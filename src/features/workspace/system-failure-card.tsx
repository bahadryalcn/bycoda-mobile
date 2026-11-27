import { View } from "react-native";
import Square from "lucide-react-native/icons/square";
import { sessionErrorPresentation } from "../../../../src/features/sessions/model/sessionErrorPresentation";
import { isOwnerStopNotice } from "../../../../src/features/sessions/model/turnInterruption";
import { Body } from "@/ui/typography";
import { useMobileTheme } from "@/ui/theme";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { StatusLine } from "@/ui/feedback";
import { Disclosure } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { friendlyProviderFailure } from "@/ui/error-message";
import { space } from "@/ui/tokens";

/** Provider limit codes desktop's presentation does not phrase as a sentence. */
const USAGE_LIMIT_CODE =
  /usage_limit_reached|quota_exceeded|insufficient_quota|(?:usage|weekly|monthly|session)\s+limit\s+(?:reached|exceeded)/i;

/** The first readable line of a failure, for the one-line status. */
export function failureHeadline(message: string): string {
  return message.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? message.trim();
}

type NoticeBlock = { role: string; notice?: "error" | "interrupt" | "info"; text?: string };

/** A system notice the compact row presents: an interruption or information, never an error or a record. */
export function isCompactSystemNotice(block: NoticeBlock & Record<string, unknown>) {
  return (
    block.role === "system" &&
    (block.notice === "interrupt" || block.notice === "info") &&
    !block.tool &&
    !block.approval &&
    !block.shell &&
    !block.interjection &&
    !block.orchestration &&
    !block.handoff &&
    !block.noteCard &&
    !block.secondOpinion &&
    !block.modelSwitch &&
    !block.image &&
    !(Array.isArray(block.attachments) && block.attachments.length)
  );
}

/** What the compact notice row says: Host interruption markers are English, so they get product words. */
export function systemNoticeLine(
  block: NoticeBlock,
  copy: (tr: string, en: string) => string,
): { tone: "neutral" | "warning" | "info"; label: string; detail?: string } {
  if (isOwnerStopNotice(block)) return { tone: "neutral", label: copy("Durdurdun", "You stopped") };
  if (block.notice === "interrupt") return { tone: "warning", label: copy("Bu tur yarıda kesildi.", "This turn was cut off.") };
  const text = block.text?.trim() ?? "";
  const label = failureHeadline(text) || copy("Bilgi", "Information");
  return { tone: "info", label, ...(label !== text ? { detail: text } : {}) };
}

/** An MCP sign-in, provider or interruption notice as one compact status line, its full text behind Details. */
export function SystemNoticeRow({ block }: { block: NoticeBlock }) {
  if (isOwnerStopNotice(block)) return <OwnerStopRow />;
  return <NoticeLine block={block} />;
}

/**
 * The owner's Stop when no turn receipt says it: one muted line with the receipt's small square,
 * in product words rather than the Host's English marker.
 */
function OwnerStopRow() {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 24 }}>
      <Square size={9} color={colors.muted} fill={colors.muted} strokeWidth={0} />
      <Body muted style={typography.metadata}>
        {copy("Durdurdun", "You stopped")}
      </Body>
    </View>
  );
}

function NoticeLine({ block }: { block: NoticeBlock }) {
  const copy = useCopy();
  const line = systemNoticeLine(block, copy);
  return (
    <View style={{ gap: space.xxs }}>
      <StatusLine tone={line.tone} label={line.label} />
      {line.detail ? (
        <Disclosure label={copy("Ayrıntılar", "Details")}>
          <Body selectable>{line.detail}</Body>
        </Disclosure>
      ) : null}
    </View>
  );
}

/**
 * Provider/system failure as one quiet status line (the shared turn-status presentation); identical
 * repeats fold into one line with a count. The full sentence and the raw text stay behind
 * "Details". A usage limit is a wait, not a fault, so it reads in warning tone as on desktop.
 */
export function SystemFailureCard({ text, repeat }: { text: string; repeat?: number }) {
  const copy = useCopy();
  const presentation = sessionErrorPresentation(text);
  const usageLimit = !!presentation.usageLimit || USAGE_LIMIT_CODE.test(text);
  const message = presentation.usageLimit
    ? [copy("Kullanım sınırına ulaşıldı", "Usage limit reached"), presentation.summary?.trim()].filter(Boolean).join(" · ")
    : friendlyProviderFailure(text, copy);
  const headline = failureHeadline(message);
  const count = repeat && repeat > 1 ? ` ×${repeat}` : "";
  const more = headline !== message.trim() || message !== text;
  return (
    <View accessibilityRole="alert" style={{ gap: space.xxs }}>
      <StatusLine tone={usageLimit ? "warning" : "danger"} label={`${headline}${count}`} />
      {more ? (
        <Disclosure label={copy("Ayrıntılar", "Details")}>
          <View style={{ gap: space.xs }}>
            {headline !== message.trim() ? <Body selectable>{message}</Body> : null}
            {message !== text ? <Body mono selectable>{text}</Body> : null}
          </View>
        </Disclosure>
      ) : null}
    </View>
  );
}
