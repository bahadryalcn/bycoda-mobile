import { useMemo, useState } from "react";
import { ScrollView, type StyleProp, type TextStyle } from "react-native";
import { Body, Button, Sheet } from "./primitives";
import { useCopy } from "./copy";
import { space } from "./tokens";
import { ReaderActions } from "./reader-actions";
import { useSourcePages } from "./use-source-pages";
import { messageDisplaySource } from "./message-model";
import { useClipboardFeedback } from "./use-clipboard-feedback";

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
  // Copies the complete original message, independent of the displayed page or hidden-metadata view.
  const clipboard = useClipboardFeedback(text, open);
  const displayText = useMemo(
    () => (open && hideInternalMetadata ? messageDisplaySource(text) : text),
    [text, open, hideInternalMetadata],
  );
  const pagination = useSourcePages(open ? displayText : "");
  return (
    <>
      <Body muted>
        {copy("Uzun mesajın önizlemesi gösteriliyor.", "Showing a preview of this long message.")}
      </Body>
      <Button
        label={copy("Metnin tamamı", "Full text")}
        tone="quiet"
        onPress={() => {
          pagination.setPage(0);
          setOpen(true);
        }}
      />
      <Sheet
        visible={open}
        title={copy("Metnin tamamı", "Full text")}
        size="full"
        scroll={false}
        onClose={() => setOpen(false)}
        footer={<ReaderActions page={pagination.page} pages={pagination.pages} onPage={pagination.setPage}
          copyLabel={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Mesajı kopyala", "Copy message")}
          onCopy={clipboard.copy} busy={clipboard.busy} error={clipboard.error} />}
      >
        {open ? <ScrollView key={pagination.page} contentContainerStyle={{ gap: space.md, padding: space.md }}>
          <Body style={textStyle}>{pagination.text}</Body>
        </ScrollView> : null}
      </Sheet>
    </>
  );
}
