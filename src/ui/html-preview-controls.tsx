import { ScrollView, View } from "react-native";
import { Button, ErrorText, Loading, Row } from "./primitives";
import { useCopy } from "./copy";
import { space } from "./tokens";

/** A containing reader may retain its choice across source/preview transitions. */
export type HtmlPreviewInteraction = { enabled: boolean; toggle(): void };

/** Reader controls stay outside the preview document; oversized text can scroll independently. */
export function HtmlPreviewControls({ fill, javascript, onToggle, loading, error, onRetry }: {
  fill: boolean; javascript: boolean; onToggle(): void; loading?: boolean;
  error?: Error | null; onRetry?(): void;
}) {
  const copy = useCopy();
  const content = <>
    <Row><Button density="compact" tone="quiet" label={javascript ? copy("Etkileşim açık", "Interaction on") : copy("Etkileşim kapalı", "Interaction off")} onPress={onToggle} /></Row>
    {loading ? <Loading /> : null}
    <ErrorText error={error} />
    {error && onRetry ? <Button label={copy("Yeniden dene", "Retry")} onPress={onRetry} /> : null}
  </>;
  return fill ? <ScrollView style={{ flexGrow: 0, flexShrink: 1, maxHeight: "50%" }}
    keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>{content}</ScrollView>
    : <View style={{ gap: space.sm }}>{content}</View>;
}
