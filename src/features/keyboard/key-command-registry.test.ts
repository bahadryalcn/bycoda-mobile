import { describe, expect, it, vi } from "vitest";
import type { RegisteredKeyCommand } from "../../../modules/bycoda-key-commands/src/commands";
import { createKeyCommandRegistry } from "../../../modules/bycoda-key-commands/src/registry";

function setup() {
  const queue: Array<() => void> = [];
  let listener: ((id: string) => void) | undefined;
  const remove = vi.fn(() => { listener = undefined; });
  const setCommands = vi.fn<(commands: RegisteredKeyCommand[]) => Promise<void>>(() => Promise.resolve());
  const subscribe = vi.fn((next: (id: string) => void) => { listener = next; return { remove }; });
  const registry = createKeyCommandRegistry({ setCommands, subscribe }, (flush) => queue.push(flush));
  const tick = () => { while (queue.length) queue.shift()!(); };
  const press = (key: string, primary?: boolean) => {
    const sent = setCommands.mock.calls.at(-1)?.[0].find((command) => command.key.toLowerCase() === key.toLowerCase() && !!command.primary === !!primary);
    if (sent) listener?.(sent.id);
  };
  return { registry, tick, press, setCommands, subscribe, remove };
}
const command = (id: string, key: string, extra: Partial<RegisteredKeyCommand> = {}): RegisteredKeyCommand => ({ id, key, title: key, primary: true, ...extra });

describe("key command registry", () => {
  it("coalesces a burst of registrations into one native call", () => {
    const { registry, tick, setCommands, subscribe } = setup();
    for (let index = 0; index < 11; index += 1) registry.register(command(`a${index}`, String(index)), () => {});
    expect(setCommands).not.toHaveBeenCalled();
    tick();
    expect(setCommands).toHaveBeenCalledTimes(1);
    expect(setCommands.mock.calls[0]![0]).toHaveLength(11);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("skips native when a screen swap leaves the effective list unchanged and keeps the new owner's handler", () => {
    const { registry, tick, press, setCommands } = setup();
    const oldRun = vi.fn();
    const newRun = vi.fn();
    const unregisterOld = registry.register(command("screen-a", "k"), oldRun);
    tick();
    unregisterOld();
    registry.register(command("screen-b", "k"), newRun);
    tick();
    expect(setCommands).toHaveBeenCalledTimes(1);
    press("k", true);
    expect(oldRun).not.toHaveBeenCalled();
    expect(newRun).toHaveBeenCalledTimes(1);
  });

  it("keeps focused-screen authority: an unfocused screen's chord is gone and the shortcut is removed natively", () => {
    const { registry, tick, setCommands, remove } = setup();
    const unregister = registry.register(command("screen-a", "k"), () => {});
    tick();
    unregister();
    tick();
    expect(setCommands).toHaveBeenLastCalledWith([]);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("routes a chord to the live priority winner and falls back when it unmounts", () => {
    const { registry, tick, press } = setup();
    const background = vi.fn();
    const modal = vi.fn();
    registry.register(command("editor", "Enter", { priority: 0 }), background);
    const unregisterModal = registry.register(command("palette", "Enter", { priority: 100 }), modal);
    tick();
    press("Enter", true);
    expect(modal).toHaveBeenCalledTimes(1);
    expect(background).not.toHaveBeenCalled();
    unregisterModal();
    press("Enter", true);
    expect(background).toHaveBeenCalledTimes(1);
  });

  it("preserves every shortcut, including duplicates on different chords and shift/primary variants", () => {
    const { registry, tick, setCommands } = setup();
    for (const key of ["k", "f", ",", "/", "n", "[", "1", "2", "3", "4", "5"]) registry.register(command(key, key), () => {});
    registry.register(command("enter", "Enter", { primary: false }), () => {});
    registry.register(command("send", "Enter"), () => {});
    registry.register(command("newline", "Enter", { primary: false, shift: true }), () => {});
    tick();
    expect(setCommands.mock.calls[0]![0]).toHaveLength(14);
  });

  it("does not resend a same-chord owner swap, but resends real changes and retries after a native failure", async () => {
    const { registry, tick, setCommands } = setup();
    registry.register(command("a", "1"), () => {});
    registry.register(command("b", "2"), () => {});
    tick();
    const unregisterC = registry.register(command("c", "2"), () => {});
    tick();
    expect(setCommands).toHaveBeenCalledTimes(1);
    unregisterC();
    registry.register(command("d", "3"), () => {});
    tick();
    expect(setCommands).toHaveBeenCalledTimes(2);

    setCommands.mockRejectedValueOnce(new Error("no native"));
    registry.register(command("e", "4"), () => {});
    tick();
    await Promise.resolve();
    registry.register(command("e2", "4"), () => {});
    tick();
    expect(setCommands).toHaveBeenCalledTimes(4);
  });

  it("no-ops without a native module", () => {
    const registry = createKeyCommandRegistry(null, () => { throw new Error("must not schedule"); });
    expect(() => registry.register(command("a", "k"), () => {})()).not.toThrow();
  });
});
