import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { useAdaptiveLayout } from "./adaptive-layout";
import { tabRootColumn } from "./readable-width";

/** Single-column tab roots stay a readable, centered column on tablets instead of stretching. */
export function TabRootColumn({ children }: PropsWithChildren) {
  const { tablet } = useAdaptiveLayout();
  return <View style={tabRootColumn(tablet)}>{children}</View>;
}
