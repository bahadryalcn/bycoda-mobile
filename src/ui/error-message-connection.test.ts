import { expect, it } from "vitest";
import { RemoteHostError } from "../remote/host-error";
import { errorMessage } from "./error-message";
import { translate } from "../localization";

const tr = (turkish: string, _english: string) => turkish;
const en = (_turkish: string, english: string) => english;
const cases = [
  ["auth", "Computer access was denied. Reconnect this computer.", "erişim reddedildi"],
  ["protocol", "The mobile app and Host use incompatible data. Update both and reconnect.", "bilgisayardaki bycoda uyumsuz"],
  ["auth", "The computer certificate could not be verified. Reconnect this computer.", "sertifikası doğrulanamadı"],
  ["host", "This computer is busy. Try again shortly.", "Bilgisayar meşgul"],
  ["host", "This computer is not ready for this request. Try again shortly.", "isteğe hazır değil"],
  ["host", "The computer could not complete this request. Try again.", "isteği tamamlayamadı"],
  ["host", "The computer rejected this request. Check its details and try again.", "isteği reddetti"],
] as const;

it.each(cases)("localizes exact %s connection message: %s", (kind, message, expected) => {
  const error = new RemoteHostError("computer", kind, message);
  expect(errorMessage(error, tr)).toContain(expected);
  expect(errorMessage(error, en)).toBe(message);
  expect(error.message).toBe(message);
});

it.each(["auth", "protocol", "host"] as const)("keeps %s details that extend a known message", kind => {
  const message = `${cases[1][1]} Field: session.authorityGeneration; HTTP 409.`;
  const text = errorMessage(new RemoteHostError("computer", kind, message), tr);
  // A translated summary leads; the unrecognized English stays as a collapsible detail paragraph.
  expect(text.split("\n\n")[0]).not.toContain("HTTP 409");
  expect(text.endsWith(`\n\n${message}`)).toBe(true);
  expect(errorMessage(new RemoteHostError("computer", kind, message), en)).toBe(message);
});

it.each(["tr", "de", "es", "fr", "pt", "ja", "zh-CN"] as const)("uses %s catalog copy for each known connection failure", locale => {
  for (const [kind, message] of cases) {
    const error = new RemoteHostError("computer", kind, message);
    const localized = errorMessage(error, (turkish, english) => translate(locale, turkish, english));
    expect(localized).not.toBe(message);
    expect(localized.trim()).not.toBe("");
  }
});

it("retains the localized uncertainty caution and explicit caller feedback", () => {
  const error = new RemoteHostError("computer", "host", "Connection interrupted. Check this command's result before trying again.", true);
  expect(errorMessage(error, tr)).toContain("Bağlantı kesildi.");
  // The interruption line already asks to check the result; the phone showed both sentences at once.
  expect(errorMessage(error, tr)).not.toContain("İşlem uygulanmış olabilir.");
  expect(errorMessage(error, tr, "Özel geri bildirim")).toContain("Özel geri bildirim");
  expect(errorMessage(error, tr, "Özel geri bildirim")).toContain("İşlem uygulanmış olabilir.");
});
