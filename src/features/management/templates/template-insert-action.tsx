import { useState, type ReactNode } from "react";
import { Button, ErrorText, Row, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

/** A refused local insertion keeps the editor open and reports at its initiating action. */
export function TemplateInsertAction({ disabled, onInsert, secondaryAction }: {
  disabled: boolean;
  onInsert: () => void;
  secondaryAction?: ReactNode;
}) {
  const copy = useCopy();
  const [error, setError] = useState<unknown>(null);
  return <Stack style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
    <Row><Button tone="default" label={copy("Mesaja ekle", "Insert into message")} disabled={disabled}
      onPress={() => {
        if (disabled) return;
        setError(null);
        try { onInsert(); }
        catch (cause) { setError(cause); }
      }} />{secondaryAction}</Row>
    <ErrorText error={error} />
  </Stack>;
}
