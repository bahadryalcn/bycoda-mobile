import { requireOptionalNativeModule } from "expo";
import { useEffect, useId, useRef } from "react";
import { Platform } from "react-native";
import type { KeyCommandSpec, RegisteredKeyCommand } from "./src/commands";
import { createKeyCommandRegistry } from "./src/registry";
export type { KeyCommandSpec } from "./src/commands";

type NativeCommands = {
  setCommands(commands: RegisteredKeyCommand[]): Promise<void>;
  addListener(name: "onKeyCommand", listener: (event: { id: string }) => void): { remove(): void };
};
const native = Platform.OS === "web" ? null : requireOptionalNativeModule<NativeCommands>("BycodaKeyCommands");
const registry = createKeyCommandRegistry(native && {
  setCommands: (commands) => native.setCommands(commands),
  subscribe: (listener) => native.addListener("onKeyCommand", ({ id }) => listener(id)),
});

/** Native hardware only. Missing native module and web intentionally no-op. */
export function useKeyCommand(spec: KeyCommandSpec, handler: () => void) {
  const id = useId();
  const latest = useRef(handler);
  latest.current = handler;
  const { key, title, primary, shift, textInput, enabled = true, priority = 0 } = spec;
  // Reason: keep the platform's responder commands synchronized with mounted owners.
  useEffect(() => {
    if (!enabled) return;
    return registry.register({ id, key, title, primary, shift, priority, textInput }, () => latest.current());
  },[id, key, title, primary, shift, textInput, enabled, priority]);
}
