import { expect, it } from "vitest";
import type { NoteComposerCard } from "../../../../src/features/notes/notes";
import { validateNoteDelivery, type ComposerDelivery } from "./composer-delivery";
import { composerDeliveryError } from "./composer-delivery-copy";

const english = (_tr: string, en: string) => en;

it("describes the actual note delivery blocker", () => {
  const note = {} as NoteComposerCard;
  const recovery = (mode: ComposerDelivery, text: string) => {
    try { validateNoteDelivery(note, mode, text, true); }
    catch (error) { return composerDeliveryError(error, english); }
  };
  expect(recovery("send", "/plan Draft text")).toBe("Turn off Plan mode or remove the note.");
  expect(recovery("send", "/draft Draft text")).toBe("Turn off Draft mode or remove the note.");
  expect(recovery("send", "/compact")).toBe("Remove the command at the start of the message or remove the note.");
  expect(recovery("queue", "Draft text")).toBe("To keep the note, send this message after the current turn finishes.");
});

it("offers draft-preserving recovery without the removed composer mode selector", () => {
  expect(composerDeliveryError(new Error("Wait for this turn, queue your message, or choose Steer."), english))
    .toBe("Wait for this turn to finish, then send again. Your draft is kept.");
});

it("preserves unknown Host errors for the caller's detailed error presentation", () => {
  expect(composerDeliveryError(new Error("Host-specific diagnostic"), english)).toBeUndefined();
});
