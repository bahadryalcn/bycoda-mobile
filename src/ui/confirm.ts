import { Alert } from "react-native";

/** Only the caller supplies the action; incoming text never controls permissions. */
export function confirmAction(
  title: string,
  detail: string,
  label: string,
  action: () => void,
  cancelLabel = "Cancel",
) {
  if (process.env.EXPO_OS === "web" && typeof globalThis.confirm === "function") {
    if (globalThis.confirm(`${title}\n\n${detail}`)) action();
    return;
  }
  Alert.alert(title, detail, [
    { text: cancelLabel, style: "cancel" },
    { text: label, style: "destructive", onPress: action },
  ]);
}
