import { describe, expect, it } from "vitest";
import { RemoteHostError } from "../remote/host-error";
import { errorMessage, remoteErrorKind } from "./error-message";

const tr = (turkish: string, _english: string) => turkish;
const en = (_turkish: string, english: string) => english;
const remote = (
  kind: RemoteHostError["kind"],
  message = "Raw transport message",
  uncertain = false,
) => new RemoteHostError("synthetic-machine", kind, message, uncertain);

describe("shared remote error copy", () => {
  it.each([
    ["network", "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene."],
    ["timeout", "Bilgisayarın yanıt vermesi çok uzun sürdü. Sonucu kontrol etmek için yenile."],
    ["aborted", "İstek iptal edildi."],
    ["unsupported", "Bu özellik için bilgisayarındaki Bycoda’yı güncelle."],
    ["identity", "Bu adresteki bilgisayar değişmiş. Doğru bilgisayarı yeniden bağla."],
  ] as const)("localizes real %s errors", (kind, expected) => {
    expect(errorMessage(remote(kind), tr)).toBe(expected);
    expect(remoteErrorKind(remote(kind))).toBe(kind);
  });

  it.each([
    [
      "Unlock the app before connecting to this computer.",
      "Bağlanmak için Bycoda’nın kilidini aç.",
    ],
    [
      "This device credential is invalid or revoked. Pair the computer again.",
      "Cihaz anahtarı geçersiz veya iptal edilmiş. Bilgisayar bağlantısını yenile.",
    ],
    [
      "Pair this computer with a valid bycoda device credential.",
      "Cihaz anahtarı geçersiz veya iptal edilmiş. Bilgisayar bağlantısını yenile.",
    ],
    [
      "The saved device credential could not be read. Unlock the app or pair this computer again.",
      "Kaydedilen cihaz anahtarı okunamadı. Uygulamanın kilidini aç veya bu bilgisayarı yeniden bağla.",
    ],
    [
      "Access changed while waiting for this computer. Restore access and check the result before retrying.",
      "Bilgisayar beklenirken erişim değişti. Yeniden denemeden önce erişimi geri yükleyip sonucu kontrol et.",
    ],
  ])("keeps actionable authentication meaning: %s", (message, expected) => {
    expect(errorMessage(remote("auth", message), tr)).toBe(expected);
  });

  it("distinguishes a missing connection from changed identity", () => {
    expect(
      errorMessage(remote("identity", "Connect this computer before sending requests."), tr),
    ).toBe("İstek göndermeden önce bu bilgisayarı bağla.");
  });

  it.each(["host", "protocol", "auth"] as const)(
    "preserves detailed arbitrary %s errors",
    (kind) => {
      const message = "Validation: checkout branch review/ui is missing (HTTP 409).";
      expect(errorMessage(remote(kind, message), tr)).toBe(message);
    },
  );

  it("does not mistake an ordinary error carrying kind for a transport error", () => {
    const error = Object.assign(new Error("Attachment exceeds the allowed size."), {
      kind: "network",
      uncertain: true,
    });
    expect(remoteErrorKind(error)).toBeUndefined();
    expect(errorMessage(error, tr)).toBe(error.message);
  });

  it("preserves local validation details and explicit caller messages", () => {
    expect(errorMessage(new Error("Name must be unique."), tr)).toBe("Name must be unique.");
    expect(errorMessage("Choose a branch first.", tr)).toBe("Choose a branch first.");
    expect(errorMessage(remote("network"), tr, "Ek yüklenemedi.")).toBe("Ek yüklenemedi.");
    expect(errorMessage({}, tr)).toBe("İşlem tamamlanamadı.");
  });

  it.each(["network", "timeout", "aborted", "auth", "host", "protocol"] as const)(
    "retains uncertain outcome caution for %s",
    (kind) => {
      const error = remote(kind, "Original detail", true);
      const original = error.message;
      const message = errorMessage(error, tr);
      expect(message).toContain(
        "İşlem uygulanmış olabilir. Yeniden denemeden önce sonucu kontrol et.",
      );
      expect(error.message).toBe(original);
      expect(error.uncertain).toBe(true);
      if (kind === "network")
        expect(message).not.toContain("Bağlantıyı kontrol edip yeniden dene.");
    },
  );

  it("keeps uncertainty with an override, without repeating an already localized caution", () => {
    const error = remote("network", "Network failure", true);
    const caution = "The action may have been applied. Check the result before trying again.";
    expect(errorMessage(error, en, "Upload interrupted.")).toBe(
      `Upload interrupted.\n\n${caution}`,
    );
    expect(errorMessage(error, en, `Upload interrupted.\n\n${caution}`)).toBe(
      `Upload interrupted.\n\n${caution}`,
    );
  });
});
