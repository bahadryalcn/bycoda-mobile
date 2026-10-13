import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Body, Button, CodePanel, CodeText, ErrorText, Row, Sheet } from "./primitives";
import { HtmlDocument } from "./html-document";
import type { MessageContext } from "./media-policy";
import { MessageDiagram } from "./message-diagram";
import { useCopy } from "./copy";
import { colors, space } from "./tokens";
import { chatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { highlightCode } from "./message-highlight";
import Code from "lucide-react-native/icons/code";
import { ChatSummary } from "./chat-controls";

export function MessageCode({
  compact = false,
  ...props
}: Parameters<typeof ExpandedMessageCode>[0] & { compact?: boolean }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  if (!compact) return <ExpandedMessageCode {...props} />;
  const title = props.language || copy("Kod", "Code");
  return (
    <>
      <ChatSummary
        label={title}
        detail={copy("{p0} satır · kodu aç", "{p0} lines · open code", {
          p0: props.code.split("\n").length,
        })}
        status={props.complete === false ? copy("Yazılıyor", "Writing") : undefined}
        icon={<Code size={16} color={colors.muted} />}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={title} size="full" onClose={() => setOpen(false)}>
        {open ? <ExpandedMessageCode {...props} allLines /> : null}
      </Sheet>
    </>
  );
}

function ExpandedMessageCode({
  code,
  language = "",
  complete = true,
  context,
  allLines = false,
}: {
  code: string;
  language?: string;
  complete?: boolean;
  context?: MessageContext;
  allLines?: boolean;
}) {
  const copy = useCopy();
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const styles = chatTextStyles(useChatAppearance((state) => state.textSize));
  const html = /^(?:html|htm)$/i.test(language) && complete && code.length <= 2 * 1024 * 1024;
  const diagram = language.toLowerCase() === "mermaid" && complete;
  const lines = code.split("\n");
  const long = !allLines && lines.length > 24;
  const shown = long && !expanded ? lines.slice(0, 24).join("\n") : code;
  const tokens = useMemo(() => highlightCode(shown, language), [shown, language]);
  return (
    <View style={{ gap: space.xs }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Body muted style={styles.metadata}>
          {language || copy("Kod", "Code")}
        </Body>
        <Row>
          <Button
            density="compact"
            tone="quiet"
            label={copied ? copy("Kopyalandı", "Copied") : copy("Kodu kopyala", "Copy code")}
            onPress={() => {
              void Clipboard.setStringAsync(code)
                .then(() => setCopied(true))
                .catch(setError);
            }}
          />
          {html ? (
            <Button
              density="compact"
              tone="quiet"
              label={copy("Önizle", "Preview")}
              onPress={() => setPreview(true)}
            />
          ) : null}
        </Row>
      </Row>
      {diagram ? <MessageDiagram source={code} /> : null}
      <CodePanel>
        <CodeText style={styles.code}>
          {tokens.map((token, index) => (
            <Text
              key={index}
              style={{
                color:
                  token.kind === "string"
                    ? colors.success
                    : token.kind === "comment"
                      ? colors.subtle
                      : token.kind === "keyword"
                        ? colors.accent
                        : token.kind === "number"
                          ? colors.warning
                          : colors.text,
              }}
            >
              {token.text}
            </Text>
          ))}
        </CodeText>
      </CodePanel>
      {long ? (
        <Button
          density="compact"
          tone="quiet"
          label={
            expanded
              ? copy("Daralt", "Collapse")
              : copy("Tüm kodu göster ({p0} satır)", "Show all code ({p0} lines)", {
                  p0: lines.length,
                })
          }
          onPress={() => setExpanded(!expanded)}
        />
      ) : null}
      {!complete ? (
        <Body muted style={[styles.metadata, { color: colors.subtle }]}>
          {copy("Kod devam ediyor…", "Code is still arriving…")}
        </Body>
      ) : null}
      <ErrorText error={error} />
      <Sheet
        visible={preview}
        title={copy("HTML önizleme", "HTML preview")}
        size="full"
        onClose={() => setPreview(false)}
      >
        {preview ? (
          <HtmlDocument html={code} name="preview.html" context={context} height={540} />
        ) : null}
      </Sheet>
    </View>
  );
}
