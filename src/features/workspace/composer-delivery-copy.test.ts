import { expect, it } from "vitest";
import { composerDeliveryError } from "./composer-delivery-copy";

const english = (_tr: string, en: string) => en;

it("offers draft-preserving recovery without the removed composer mode selector", () => {
  expect(composerDeliveryError(new Error("Wait for this turn, queue your message, or choose Steer."), english))
    .toBe("Wait for this turn to finish, then send again. Your draft is kept.");
  expect(composerDeliveryError(new Error("Note context requires Send without plan, compact or session commands. Change the delivery mode or remove the note."), english))
    .toBe("Wait for the turn to finish and remove plan, compact or session commands before sending note context. Or remove the note.");
});

it("preserves unknown Host errors for the caller's detailed error presentation", () => {
  expect(composerDeliveryError(new Error("Host-specific diagnostic"), english)).toBeUndefined();
});
