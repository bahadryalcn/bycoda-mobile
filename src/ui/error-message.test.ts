import { describe, expect, it, vi } from "vitest";
import { RemoteHostError } from "../remote/host-error";
import { ApprovalCommandRefused } from "../domain/approval-command";
import { DraftWriteError } from "../state/local-draft-storage";
import { errorMessage, remoteErrorKind } from "./error-message";
import { translate, type Locale } from "../localization";

const tr = (turkish: string, _english: string) => turkish;
const en = (_turkish: string, english: string) => english;
it("localizes a draft write failure without showing the native cause", () => {
  const cause = new Error("QA native draft write blocked");
  const error = new DraftWriteError(cause);
  expect(error.cause).toBe(cause);
  expect(errorMessage(error, en)).toBe("Couldn’t save the draft. Your edits are still open.");
  expect(errorMessage(error, tr)).toBe("Taslak kaydedilemedi. Düzenlemelerin açık.");
});
const remote = (
  kind: RemoteHostError["kind"],
  message = "Raw transport message",
  uncertain = false,
) => new RemoteHostError("synthetic-machine", kind, message, uncertain);

it("localizes approval identity refusals without suggesting uncertain delivery", () => {
  for (const reason of ["unsupported", "unidentified"] as const) {
    const error = new ApprovalCommandRefused(reason);
    expect(errorMessage(error, en)).toBe(error.message);
    expect(errorMessage(error, tr)).toContain(
      reason === "unsupported" ? "Bilgisayardaki bycoda" : "istek doğrulanamıyor",
    );
    expect(error.uncertain).toBe(false);
    expect(errorMessage(error, tr)).not.toContain("uygulanmış olabilir");
  }
});

it("never shows the Host's generic English failure", () => {
  for (const message of ["Host request failed", "Host request failed."]) {
    expect(errorMessage(remote("host", message), tr)).toBe("Bilgisayar bu isteği tamamlayamadı. Yeniden dene.");
    expect(errorMessage(remote("host", message), en)).toBe("The computer could not complete this request. Try again.");
  }
});

describe("shared remote error copy", () => {
  it.each([
    ["network", "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene."],
    ["timeout", "Bilgisayarın yanıt vermesi çok uzun sürdü. Sonucu kontrol etmek için yenile."],
    ["aborted", "İstek iptal edildi."],
    ["unsupported", "Bu özellik için bilgisayarındaki bycoda’yı güncelle."],
    ["identity", "Bu adresteki bilgisayar değişmiş. Doğru bilgisayarı yeniden bağla."],
  ] as const)("localizes real %s errors", (kind, expected) => {
    expect(errorMessage(remote(kind), tr)).toBe(expected);
    expect(remoteErrorKind(remote(kind))).toBe(kind);
  });

  it.each([
    [
      "Unlock the app before connecting to this computer.",
      "Bağlanmak için bycoda’nın kilidini aç.",
    ],
    [
      "This device credential is invalid or revoked. Pair the computer again.",
      "Bu telefonun erişimi kaldırılmış veya geçersiz. Bilgisayarı yeniden eşleştir.",
    ],
    [
      "Pair this computer with a valid bycoda device credential.",
      "Bu telefonun erişimi kaldırılmış veya geçersiz. Bilgisayarı yeniden eşleştir.",
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
    "keeps detailed arbitrary %s errors below a translated summary",
    (kind) => {
      const message = "Validation: checkout branch review/ui is missing (HTTP 409).";
      const [summary, detail] = errorMessage(remote(kind, message), tr).split("\n\n");
      expect(summary).toBe(
        kind === "auth"
          ? "Bilgisayara erişim reddedildi. Bu bilgisayarı yeniden bağla."
          : "Bilgisayar bu isteği tamamlayamadı.",
      );
      expect(detail).toBe(message);
      expect(errorMessage(remote(kind, message), en)).toBe(message);
    },
  );

  it("does not mistake an ordinary error carrying kind for a transport error", () => {
    const error = Object.assign(new Error("Attachment exceeds the allowed size."), {
      kind: "network",
      uncertain: true,
    });
    expect(remoteErrorKind(error)).toBeUndefined();
    expect(errorMessage(error, tr)).toBe(`İşlem tamamlanamadı.\n\n${error.message}`);
  });

  it("preserves local validation details and explicit caller messages", () => {
    expect(errorMessage(new Error("Name must be unique."), tr)).toBe("İşlem tamamlanamadı.\n\nName must be unique.");
    expect(errorMessage(new Error("Name must be unique."), en)).toBe("Name must be unique.");
    expect(errorMessage("Choose a branch first.", en)).toBe("Choose a branch first.");
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

describe("schema and provider failures", () => {
  const copy = (_tr: string, en: string) => en;
  it.each(["You've hit your limit", "You've hit your weekly limit", "You’ve hit your monthly limit", "You have reached your session limit", "Weekly limit reached", "insufficient_quota", "usage_limit_reached"])("replaces %s with one localized line naming account/model recovery", async (error) => {
    const { friendlyProviderFailure } = await import("./error-message");
    const text = friendlyProviderFailure(error, copy);
    expect(text).toBe("Usage limit reached. Open Model and access to choose another account or model.");
    expect(text).not.toContain("\n");
    expect(friendlyProviderFailure(error, (tr: string) => tr)).toContain("Model ve erişim");
  });
  it.each(["Attachment size limit exceeded", "Rate limit exceeded: requests per second", "HTTP 429 Too Many Requests", "Jira rate_limit exceeded", "Network connection failed"])("keeps unrelated %s unchanged", async (error) => {
    const { friendlyProviderFailure } = await import("./error-message");
    expect(friendlyProviderFailure(error, copy)).toBe(error);
  });
  it("never shows a raw zod dump", () => {
    const raw = JSON.stringify([
      { code: "unrecognized_keys", keys: ["managedBy"], path: [], message: "Unrecognized key" },
    ]);
    const text = errorMessage(new Error(raw), copy);
    expect(text).not.toContain("unrecognized_keys");
    expect(text).toContain("Update Bycoda");
  });
  it("softens archived provider sessions", async () => {
    const { friendlyProviderFailure } = await import("./error-message");
    const out = friendlyProviderFailure(
      "session 01a is archived. Run codex unarchive 01a to unarchive it first.",
      copy,
    );
    expect(out).not.toContain("codex unarchive");
  });
});

it("never tells a failed read that its action may have been applied", () => {
  const uncertain = new RemoteHostError("synthetic-machine", "network", "Can't reach your computer", true);
  const copyEn = (_tr: string, en: string) => en;
  expect(errorMessage(uncertain, copyEn)).toContain("The action may have been applied");
  expect(errorMessage(uncertain, copyEn, undefined, { read: true })).not.toContain("may have been applied");
});

it("shows a known English app or socket error in the screen's language", () => {
  const schema = new Error("The mobile app and Host use incompatible data. Update both and reconnect.");
  expect(errorMessage(schema, tr)).toBe("Mobil uygulama ile bilgisayardaki bycoda uyumsuz. İkisini de güncelleyip yeniden bağlan.");
  expect(errorMessage(schema, en)).toBe(schema.message);
  expect(errorMessage(new Error("Speech could not be recognized. Try again."), tr)).toBe("Konuşma anlaşılamadı. Yeniden dene.");
  // An unknown message keeps its English only as detail below a translated summary.
  expect(errorMessage(new Error("Unlisted detail"), tr)).toBe("İşlem tamamlanamadı.\n\nUnlisted detail");
  expect(errorMessage(new Error("Unlisted detail"), en)).toBe("Unlisted detail");
});

describe("central catalog translation of thrown English", () => {
  const withLocale = (locale: Locale) =>
    Object.assign((turkish: string, english: string) => translate(locale, turkish, english), { locale });

  it("fills catalog placeholders from the thrown text, in the active language only", () => {
    const message = "Remove notes.md from Desk? You would need to download it again.";
    expect(errorMessage(new Error(message), withLocale("tr"))).toBe(
      "notes.md, Desk üzerinden silinsin mi? Yeniden indirmek gerekir.",
    );
    expect(errorMessage(new Error(message), withLocale("de"))).toBe(
      "notes.md von Desk entfernen? Du müsstest es erneut herunterladen.",
    );
    expect(errorMessage(new Error(message), withLocale("en"))).toBe(message);
  });

  it("translates string errors and keeps unknown ones as detail under a localized summary", () => {
    const known = "The mobile app and Host use incompatible data. Update both and reconnect.";
    expect(errorMessage(known, withLocale("tr"))).toContain("bilgisayardaki bycoda uyumsuz");
    const unknown = "Unlisted string failure";
    const [summary, detail] = errorMessage(unknown, withLocale("de")).split("\n\n");
    expect(summary).toBe(translate("de", "İşlem tamamlanamadı.", "Could not complete this action."));
    expect(detail).toBe(unknown);
  });

  it("translates a Host message and the transport's unknown-outcome sentence separately", () => {
    const suffix = "The command ran; its outcome is unknown. Do not repeat it before checking.";
    const error = remote("host", `This computer is busy. Try again shortly. ${suffix}`, true);
    const text = errorMessage(error, tr);
    expect(text.startsWith("Bilgisayar meşgul. Biraz sonra yeniden dene.")).toBe(true);
    expect(text).not.toContain("This computer is busy");
    expect(errorMessage(error, en).startsWith(error.message)).toBe(true);
  });

  it("does not read the Turkish catalog for another language", async () => {
    vi.resetModules();
    const required: string[] = [];
    vi.doMock("../localization", async (original) => {
      const actual = await original<typeof import("../localization")>();
      return { ...actual, catalogFor: (locale: Locale) => (required.push(locale), actual.catalogFor(locale)) };
    });
    const fresh = await import("./error-message");
    fresh.errorMessage(new Error("Unlisted detail"), withLocale("de"));
    fresh.errorMessage(new Error("Unlisted detail"), en);
    expect(required).not.toContain("tr");
    vi.doUnmock("../localization");
  });
});
