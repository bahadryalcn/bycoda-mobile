import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import { useState } from "react";
import { Collapsible } from "panelui-native/components/collapsible";
import { Body, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { MessageText } from "@/ui/message-text";
import { metrics } from "@/ui/tokens";

export function ContentExcerpt({ text }: { text: string }) {
  const copy = useCopy();
  const [expanded, setExpanded] = useState(false);
  const normalized = text.replace(/\s+/g, " ").trim();
  const excerpt = truncateGraphemes(normalized, 180);
  return <Stack>
    {!expanded ? <Body>{excerpt}</Body> : null}
    <Collapsible variant="ghost" open={expanded} onOpenChange={setExpanded}>
      <Collapsible.Content><MessageText text={text} role="assistant" /></Collapsible.Content>
      {text !== excerpt ? <Collapsible.Trigger style={{ minHeight: metrics.touchTarget, justifyContent: "center", alignSelf: "flex-start" }}>
        {expanded ? copy("Daha az göster", "Show less") : copy("Metnin tamamı", "Full text")}
      </Collapsible.Trigger> : null}
    </Collapsible>
  </Stack>;
}
