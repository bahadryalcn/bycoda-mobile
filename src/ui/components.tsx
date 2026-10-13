import { View } from "react-native";
import {
  Body,
  Button as SharedButton,
  ErrorNotice as SharedErrorNotice,
  Heading,
} from "./primitives";
import { uiStyles } from "./styles";

// Compatibility names retain the legacy screens' public component contracts.
export { Screen, Card, Row, Field, Empty, Body as Label } from "./primitives";
export function Button({
  title,
  onPress,
  disabled,
  busy,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <SharedButton label={title} onPress={onPress} disabled={disabled} busy={busy} tone={variant} />
  );
}
export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={uiStyles.titleGroup}>
      <Heading>{title}</Heading>
      {detail ? <Body muted>{detail}</Body> : null}
    </View>
  );
}
export function ErrorNotice(props: { error: unknown; onRetry?: () => void }) {
  return <SharedErrorNotice {...props} retryLabel="Retry / Yeniden dene" />;
}
