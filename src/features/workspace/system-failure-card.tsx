import { View } from "react-native";
import { sessionErrorPresentation } from "../../../../src/features/sessions/model/sessionErrorPresentation";
import { Body } from "@/ui/typography";
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
