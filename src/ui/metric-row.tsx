import { View } from "react-native";
import { Body } from "./typography";
import { space } from "./tokens";

/** Read-only measurements keep their labels and full readings when either needs another line. */
export function MetricRow({ label, value }: { label: string; value: string | number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: space.xs, minWidth: 0 }}>
    <Body muted style={{ flexBasis: 140, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>{label}</Body>
    <Body mono style={{ flexShrink: 1, maxWidth: "100%", marginStart: "auto", textAlign: "right" }}>{value}</Body>
  </View>;
}
