import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { nativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { useCopy } from "@/ui/copy";
import { useRouteFocus } from "@/ui/use-route-focus";
import { SelectField, ValueRow } from "@/ui/primitives";
import { useInfoHint } from "@/ui/info-hint";
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

type Copy = ReturnType<typeof useCopy>;

/**
 * How a microphone is named on the Voice assistant page. The phone's own microphone is never named by the
 * model the system reports (such as "SM-S928B"); only an accessory's own name is shown, after its kind.
 */
export function micLabel(kind: MicKind, name: string | undefined, copy: Copy): string {
  switch (kind) {
    case "builtin": return copy("Telefonun mikrofonu", "Phone microphone");
    case "wired": return copy("Kablolu kulaklık", "Wired headset");
    case "carplay": return "CarPlay";
    case "bluetooth": return name ? copy("Bluetooth · {p0}", "Bluetooth · {p0}", { p0: name }) : "Bluetooth";
  }
}

/**
 * Settings → Voice assistant → Microphone → Microphone in use. Phones change microphones as headsets come
 * and go, so the owner picks which connected kind is used first; the rest keep their order. With one
 * input this is a value, not a control. There is no drag reordering.
 */
export function MicrophonePriority({ order, disabled }: { order: MicKind[]; disabled: boolean }) {
  const copy = useCopy();
  const [inputs, setInputs] = useState(() => readMicInputs(nativeVoiceCompanion()));
  const focused = useRouteFocus();
  // Refresh the inventory while the page is in front, without opening the microphone; a page under a
  // pushed child page reads again when it is shown.
  useEffect(() => {
    if (!focused) return;
    const native = nativeVoiceCompanion();
    const refresh = () => {
      if (AppState.currentState !== "active") return;
      const next = readMicInputs(native);
      setInputs((current) => current.length === next.length && current.every((input, i) =>
        input.uid === next[i]?.uid && input.name === next[i]?.name && input.type === next[i]?.type) ? current : next);
    };
    const subscription = AppState.addEventListener("change", refresh);
    // No route-change event reaches JS, so the inventory is polled; 5 s keeps a plugged headset current without busy work.
    const timer = setInterval(refresh, 5000);
    refresh();
    return () => { clearInterval(timer); subscription.remove(); };
  }, [focused]);

  const visible = connectedMicKinds(order, inputs);
  const device = (kind: MicKind) => readableMicName(inputs.find((input: MicInput) => micKind(input) === kind)?.name);
  const label = copy("Kullanılan mikrofon", "Microphone in use");
  const help = copy("Kulaklık ya da Bluetooth bağlıyken hangisinin önce kullanılacağını burada seçersin.",
    "When a headset or Bluetooth device is connected, choose here which one is used first.");
  const info = useInfoHint(visible.length < 2 ? help : undefined);
  if (visible.length < 2) {
    const kind = visible[0];
    return <ValueRow label={label} value={kind ? micLabel(kind, device(kind), copy) : copy("Sistem varsayılanı", "System default")} trailing={info.button} />;
  }
  return (
    <SelectField
      variant="row"
      label={label}
      hint={help}
      value={visible[0]}
      disabled={disabled}
      // A wired headset's own name is a detail; Bluetooth already carries it in its label.
      options={visible.map((kind) => ({ value: kind, label: micLabel(kind, device(kind), copy), detail: kind === "wired" ? device(kind) : undefined }))}
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
