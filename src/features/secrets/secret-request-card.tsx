import { useState } from "react";
import { View } from "react-native";
import { Body, Button, Card, ErrorText, Field } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import {
  secretAnswer,
  secretAnswerable,
  type SecretAnswer,
  type SecretRequest,
} from "./secret-request-model";

/**
 * A masked field for one requested secret. The typed value lives only in this component's state and is
 * cleared as soon as it is handed to `onAnswer`; it is never logged, persisted or put in a query key.
 */
export function SecretRequestCard({
  request,
  expired,
  onAnswer,
}: {
  request: SecretRequest;
  expired: boolean;
  /** Resolves when the Host took the answer; a rejection keeps the card open for another try. */
  onAnswer: (answer: SecretAnswer) => Promise<void>;
}) {
  const copy = useCopy();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const answer = async (next: string | null) => {
    const payload = secretAnswer(next);
    if (!payload || busy || expired) return;
    setBusy(true);
    setValue("");
    setError(null);
    try {
      await onAnswer(payload);
      setValue("");
    } catch {
      // Remote errors must never echo an owner's typed value.
      setError(
        new Error(
          copy(
            "Yanıt doğrulanamadı. Güncel isteği kontrol edin.",
            "Answer could not be confirmed. Check the current request.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <Body style={{ fontWeight: "600" }}>{request.title}</Body>
        <Body muted>{request.message}</Body>
        <Field
          label={request.fieldLabel}
          value={value}
          onChangeText={setValue}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          textContentType="none"
          importantForAutofill="no"
          editable={!busy && !expired}
        />
        <ErrorText error={error} />
        {expired ? (
          <Body muted>{copy("Bu istek zaman aşımına uğradı.", "This request has expired.")}</Body>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button
            tone="quiet"
            label={request.cancelLabel}
            disabled={busy || expired}
            onPress={() => void answer(null)}
          />
          <Button
            label={request.confirmLabel}
            busy={busy}
            disabled={expired || !secretAnswerable(value)}
            onPress={() => void answer(value)}
          />
        </View>
      </View>
    </Card>
  );
}
