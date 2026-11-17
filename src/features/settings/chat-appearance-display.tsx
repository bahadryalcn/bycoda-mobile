import { Notice, Section, SegmentedControl, Stack, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { useChatDisplay } from "@/ui/chat-display";
import { codeSizeOptions, toolVisibilityOptions } from "./chat-appearance-options";

/** Tool-call visibility, code/terminal size and code wrapping; every change applies to open chats at once. */
export function ChatDisplaySettings() {
  const copy = useCopy();
  const display = useChatDisplay((state) => state);
  const disabled = !display.hydrated;
  const sizes = codeSizeOptions(copy);
  return (
    <Stack style={{ gap: space.lg }}>
      <Section title={copy("Sohbette araç çağrıları", "Tool calls in chat")}>
        <SegmentedControl
          label={copy("Sohbette araç çağrıları", "Tool calls in chat")}
          hideLabel
          value={display.toolVisibility}
          disabled={disabled}
          options={toolVisibilityOptions(copy)}
          onChange={(toolVisibility) => void display.update({ toolVisibility })}
        />
      </Section>
      <Section title={copy("Kod yazı boyutu", "Code font size")}>
        <SegmentedControl
          label={copy("Kod yazı boyutu", "Code font size")}
          hideLabel
          value={display.codeSize}
          disabled={disabled}
          options={sizes}
          onChange={(codeSize) => void display.update({ codeSize })}
        />
        <ToggleField
          label={copy("Kodu satıra sığdır", "Wrap code lines")}
          value={display.codeWrap}
          disabled={disabled}
          onChange={(codeWrap) => void display.update({ codeWrap })}
        />
      </Section>
      <Section title={copy("Terminal yazı boyutu", "Terminal font size")}>
        <SegmentedControl
          label={copy("Terminal yazı boyutu", "Terminal font size")}
          hideLabel
          value={display.terminalSize}
          disabled={disabled}
          options={sizes}
          onChange={(terminalSize) => void display.update({ terminalSize })}
        />
      </Section>
      {display.storageError ? (
        <Notice
          tone="warning"
          message={display.storageError === "save"
            ? copy("Tercih kaydedilemedi; bu oturumda geçerli.", "The preference could not be saved; it applies for this session.")
            : copy("Kayıtlı tercihler okunamadı.", "Saved preferences could not be read.")}
        />
      ) : null}
    </Stack>
  );
}
