import { Alert } from "react-native";
import { tr } from "../i18n";

/** Only the caller supplies the action; incoming text never controls permissions. */
export function confirmAction(
  title: string,
  detail: string,
  label: string,
  action: () => void,
  cancelLabel = tr("Cancel", "Vazgeç"),
  intent: "default" | "destructive" = "destructive",
) {
  if (process.env.EXPO_OS === "web" && typeof globalThis.confirm === "function") {
    if (globalThis.confirm(`${title}\n\n${detail}`)) action();
    return;
  }
  Alert.alert(title, detail, [
    { text: cancelLabel, style: "cancel" },
    { text: label, style: intent, onPress: action },
  ], { cancelable: true });
}
