import { expect, it } from "vitest";
import { legalSections, supportEmail } from "./legal-content";

const text = (id: keyof typeof legalSections, index: 0 | 1) =>
  legalSections[id].flatMap((section) => [section.title[index], ...section.paragraphs.map((paragraph) => paragraph[index])]).join("\n");

it("explains required mobile authentication while keeping desktop account choice distinct", () => {
  expect(text("privacy", 1)).toContain("Mobile use requires a free bycoda account.");
  expect(text("privacy", 1)).toContain("Desktop use remains available without an account.");
  expect(text("privacy", 1)).not.toContain("the whole app works without one");
  expect(text("privacy", 0)).toContain("Mobil kullanım için ücretsiz bir bycoda hesabı gereklidir.");
});

it.each([0, 1] as const)("does not claim there is no bycoda account (language %i)", (index) => {
  const all = (["privacy", "terms", "help"] as const).map((id) => text(id, index)).join("\n");
  expect(all).not.toMatch(/no bycoda registration|bycoda kaydı veya merkezi kullanıcı hesabı bulunmadığından|does not create a bycoda account|bycoda hesabı veya uygulama içi/);
});

it("describes the account, deletion grace, export, statistics and KVKK contact", () => {
  const privacy = text("privacy", 1);
  for (const phrase of ["Clerk", "push token", "active time", "off by default", "does not send anonymous statistics", "14-day grace", "export", "KVKK", "info@bycoda.codes"])
    expect(privacy).toContain(phrase);
  const turkish = text("privacy", 0);
  for (const phrase of ["Clerk", "14 günlük", "KVKK", "dışa aktarım"]) expect(turkish).toContain(phrase);
  expect(supportEmail).toBe("info@bycoda.codes");
});

it("explains microphone audio, draft versus call sending and Android background boundaries in Permissions", () => {
  const section = legalSections.privacy.find(row => row.title[1] === "Permissions & app lock")!;
  const english = section.paragraphs.map(row => row[1]).join(" ");
  for (const phrase of ["Microphone access starts only", "Host for local transcription", "Dictation adds text to a draft", "fixed Room conversation and provider", "On Android", "app lock off", "notification", "picture-in-picture", "revoked access ends the call"]) expect(english).toContain(phrase);
  const turkish = section.paragraphs.map(row => row[0]).join(" ");
  for (const phrase of ["Mikrofon", "taslağa", "sabit Room", "Android", "uygulama kilidi kapalıyken", "erişimin geri çekilmesi"]) expect(turkish).toContain(phrase);
  expect(english).not.toContain("On iOS");
});
