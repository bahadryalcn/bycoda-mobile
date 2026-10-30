import { useMemo, useState } from "react";
import { ScrollView, type StyleProp, type TextStyle } from "react-native";
import { Body, Button, ErrorText, Row, Sheet } from "./primitives";
import { useCopy } from "./copy";
import { space } from "./tokens";
import { sourceSlice } from "./message-code-model";
import { messageDisplaySource } from "./message-model";
import { useClipboardFeedback } from "./use-clipboard-feedback";

const PAGE_SIZE = 12_000;

/** Bounded plain-source fallback preserves access to messages above the Markdown budget. */
export function MessageReader({
  text,
  hideInternalMetadata = false,
  textStyle,
}: {
  text: string;
  hideInternalMetadata?: boolean;
  textStyle?: StyleProp<TextStyle>;
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  // Copies the complete original message, independent of the displayed page or hidden-metadata view.
  const clipboard = useClipboardFeedback(text);
  const displayText = useMemo(
    () => (open && hideInternalMetadata ? messageDisplaySource(text) : text),
    [text, open, hideInternalMetadata],
  );
  const pages = Math.max(1, Math.ceil(displayText.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  return (
    <>
      <Body muted>
        {copy("Uzun mesajın önizlemesi gösteriliyor.", "Showing a preview of this long message.")}
      </Body>
      <Button
        label={copy("Metnin tamamı", "Full text")}
        tone="quiet"
        onPress={() => {
          setPage(0);
          setOpen(true);
        }}
      />
      <Sheet
        visible={open}
        title={copy("Metnin tamamı", "Full text")}
        size="full"
        scroll={false}
        onClose={() => setOpen(false)}
        footer={
          <Row>
            <Button
              label={copy("Geri", "Back")}
              disabled={current === 0}
              onPress={() => setPage(current - 1)}
            />
            <Body>
              {current + 1} / {pages}
            </Body>
            <Button
              label={copy("Sonraki", "Next")}
              disabled={current + 1 >= pages}
              onPress={() => setPage(current + 1)}
            />
          </Row>
        }
      >
        {open ? (
          <ScrollView key={current} contentContainerStyle={{ gap: space.md, padding: space.md }}>
            <Button
              label={
                clipboard.copied
                  ? copy("Kopyalandı", "Copied")
                  : copy("Mesajı kopyala", "Copy message")
              }
              tone="quiet"
              busy={clipboard.busy}
              onPress={clipboard.copy}
            />
            <ErrorText error={clipboard.error} />
            <Body style={textStyle}>
              {sourceSlice(displayText, current * PAGE_SIZE, (current + 1) * PAGE_SIZE)}
            </Body>
          </ScrollView>
        ) : null}
      </Sheet>
    </>
  );
}
