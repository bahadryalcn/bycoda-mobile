import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Sortable } from "panelui-native/components/sortable";
import { nativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { useCopy } from "@/ui/copy";
import { Body, NavigationGroup, SectionHeader, Stack, ValueRow } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { connectedMicKinds, micKind, readMicInputs, reorderConnectedMics } from "./mic-input";
import { voicePreferences, type MicKind } from "./voice-preferences";

export function MicrophonePriority({ order, disabled }: { order: MicKind[]; disabled: boolean }) {
  const copy = useCopy();
  const [inputs, setInputs] = useState(() => readMicInputs(nativeVoiceCompanion()));
  // Refresh the inventory while the sheet is in the foreground, without opening the microphone.
  useEffect(() => {
    const native = nativeVoiceCompanion();
    const refresh = () => {
      if (AppState.currentState !== "active") return;
      const next = readMicInputs(native);
      setInputs((current) => current.length === next.length && current.every((input, i) =>
        input.uid === next[i]?.uid && input.name === next[i]?.name && input.type === next[i]?.type) ? current : next);
    };
    const subscription = AppState.addEventListener("change", refresh);
    const timer = setInterval(refresh, 1500);
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  const names: Record<MicKind, string> = {
    wired: copy("Kablolu", "Wired"),
    bluetooth: copy("Bluetooth", "Bluetooth"),
    builtin: copy("Yerleşik", "Built-in"),
    carplay: copy("CarPlay", "CarPlay"),
  };
  const visible = connectedMicKinds(order, inputs);
  const label = (kind: MicKind) => inputs.find((input) => micKind(input) === kind)?.name || names[kind];
  const move = (kind: MicKind, to: number) => {
    if (disabled) return;
    const connected = readMicInputs(nativeVoiceCompanion());
    void voicePreferences.getState().update((current) => {
      const available = connectedMicKinds(current.micOrder, connected);
      if (available.length !== visible.length || available.some((item, index) => item !== visible[index])) return {};
      return { micOrder: reorderConnectedMics(current.micOrder, available, kind, to) };
    }).catch(() => {});
  };
  return (
    <Stack>
      <SectionHeader title={visible.length > 1
        ? copy("Mikrofon önceliği", "Microphone priority") : copy("Mikrofon", "Microphone")} />
      {visible.length > 1 ? (
        <GestureHandlerRootView style={{ flexGrow: 0 }}>
          <Sortable value={visible} disabled={disabled} gap={space.xs} onReorder={(_, { id, to }) => {
            const kind = visible.find((entry) => entry === id);
            if (kind) move(kind, to);
          }}>
            {visible.map((kind, index) => (
              <Sortable.Item key={kind} id={kind}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ValueRow label={label(kind)} value={names[kind] === label(kind) ? undefined : names[kind]} />
                  </View>
                  <Sortable.Handle
                    accessibilityLabel={label(kind)}
                    accessibilityValue={{ min: 1, max: visible.length, now: index + 1 }}
                    accessibilityActions={[
                      ...(index > 0 ? [{ name: "decrement" }, { name: "moveUp", label: copy("Yukarı taşı", "Move up") }] : []),
                      ...(index < visible.length - 1 ? [{ name: "increment" }, { name: "moveDown", label: copy("Aşağı taşı", "Move down") }] : []),
                    ]}
                    onAccessibilityAction={({ nativeEvent: { actionName } }) => {
                      if (actionName === "decrement" || actionName === "moveUp") move(kind, index - 1);
                      if (actionName === "increment" || actionName === "moveDown") move(kind, index + 1);
                    }}
                    style={{ minWidth: metrics.touchTarget, minHeight: metrics.touchTarget }}
                  />
                </View>
              </Sortable.Item>
            ))}
          </Sortable>
        </GestureHandlerRootView>
      ) : visible[0] ? (
        <NavigationGroup><ValueRow label={label(visible[0])} /></NavigationGroup>
      ) : <Body muted>{copy("Sistem varsayılanı", "System default")}</Body>}
    </Stack>
  );
}
