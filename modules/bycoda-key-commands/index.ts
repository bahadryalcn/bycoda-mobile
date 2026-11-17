import { requireOptionalNativeModule } from "expo";
import { useEffect, useId, useRef } from "react";
import { Platform } from "react-native";
import { activeCommands, type KeyCommandSpec, type RegisteredKeyCommand } from "./src/commands";
export type { KeyCommandSpec } from "./src/commands";

type NativeCommands = {
  setCommands(commands: RegisteredKeyCommand[]): Promise<void>;
  addListener(name: "onKeyCommand", listener: (event: { id: string }) => void): { remove(): void };
};
const registrations = new Map<string, { spec: RegisteredKeyCommand; run(): void }>();
let native: NativeCommands | null | undefined;
let subscription: { remove(): void } | undefined;

function bridge() {
  if (native === undefined) native = Platform.OS === "web" ? null : requireOptionalNativeModule<NativeCommands>("BycodaKeyCommands");
  return native;
}
function synchronize() {
  const module = bridge();
  if (!module) return;
  if (!subscription && registrations.size) subscription = module.addListener("onKeyCommand", ({ id }) => registrations.get(id)?.run());
  void module.setCommands(activeCommands([...registrations.values()].map(({ spec }) => spec))).catch(() => {
    // Native support is optional (Expo Go, web and old installed binaries).
  });
  if (!registrations.size) { subscription?.remove(); subscription = undefined; }
}

/** Native hardware only. Missing native module and web intentionally no-op. */
export function useKeyCommand(spec: KeyCommandSpec, handler: () => void) {
  const id = useId();
  const latest = useRef(handler);
  latest.current = handler;
  const { key, title, primary, shift, textInput, enabled = true, priority = 0 } = spec;
  // Reason: keep the platform's responder commands synchronized with mounted owners.
  useEffect(() => {
    if (!enabled) return;
    registrations.set(id, { spec: { id, key, title, primary, shift, priority, textInput }, run: () => latest.current() });
    synchronize();
    return () => { registrations.delete(id); synchronize(); };
  }, [id, key, title, primary, shift, textInput, enabled, priority]);
}
