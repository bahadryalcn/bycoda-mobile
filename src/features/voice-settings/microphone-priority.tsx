import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { nativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { useCopy } from "@/ui/copy";
import { SelectField, ValueRow } from "@/ui/primitives";
import { connectedMicKinds, micKind, readMicInputs, reorderConnectedMics, type MicInput } from "./mic-input";
import { voicePreferences, type MicKind } from "./voice-preferences";

/**
 * A device name the owner can read. iOS reports a port's localized name on a phone, but a simulator
 * or an accessory can report an identifier such as "MicrophoneBuiltIn"; that is never shown.
 */
export function readableMicName(name: string | undefined): string | undefined {
  const value = name?.trim();
  if (!value) return undefined;
  return /^[A-Za-z]+$/.test(value) && /[a-z][A-Z]/.test(value) ? undefined : value;
}

/**
 * Settings → Voice assistant → Microphone → Input device. Phones change microphones as headsets come
 * and go, so the owner picks which connected kind is used first; the rest keep their order. With one
 * input this is a value, not a control. There is no drag reordering.
 */
export function MicrophonePriority({ order, disabled }: { order: MicKind[]; disabled: boolean }) {
  const copy = useCopy();
  const [inputs, setInputs] = useState(() => readMicInputs(nativeVoiceCompanion()));
  // Refresh the inventory while the page is in the foreground, without opening the microphone.
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
  const device = (kind: MicKind) => readableMicName(inputs.find((input: MicInput) => micKind(input) === kind)?.name);
  const label = copy("Giriş aygıtı", "Input device");
  if (visible.length < 2) {
    const kind = visible[0];
    return <ValueRow label={label} value={kind ? device(kind) ?? names[kind] : copy("Sistem varsayılanı", "System default")} />;
  }
  return (
    <SelectField
      variant="row"
      label={label}
      hint={copy("Bağlı olanlar arasından ilk bu kullanılır.", "Used first while it is connected.")}
      value={visible[0]}
      disabled={disabled}
      options={visible.map((kind) => ({ value: kind, label: names[kind], detail: device(kind) !== names[kind] ? device(kind) : undefined }))}
      onChange={(kind) => {
        if (disabled) return;
        const connected = readMicInputs(nativeVoiceCompanion());
        void voicePreferences.getState().update((current) => {
          const available = connectedMicKinds(current.micOrder, connected);
          if (!available.includes(kind)) return {};
          return { micOrder: reorderConnectedMics(current.micOrder, available, kind, 0) };
        }).catch(() => {});
      }}
    />
  );
}
