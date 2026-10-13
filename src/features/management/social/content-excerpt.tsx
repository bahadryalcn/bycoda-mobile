import { useState } from "react";
import { Body, Button, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { MessageText } from "@/ui/message-text";

export function ContentExcerpt({ text }: { text: string }) {
  const copy = useCopy();
  const [expanded, setExpanded] = useState(false);
  const excerpt = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return <Stack>
    {expanded ? <MessageText text={text} role="assistant" /> : <Body>{excerpt}{excerpt.length < text.trim().length ? "…" : ""}</Body>}
    {text !== excerpt && <Button tone="quiet" label={expanded ? copy("Daha az göster", "Show less") : copy("Metnin tamamı", "Full text")} onPress={() => setExpanded((value) => !value)} />}
  </Stack>;
}
