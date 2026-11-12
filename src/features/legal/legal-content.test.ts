import { expect, it } from "vitest";
import { legalSections, supportEmail } from "./legal-content";

const text = (id: keyof typeof legalSections, index: 0 | 1) =>
  legalSections[id].flatMap((section) => [section.title[index], ...section.paragraphs.map((paragraph) => paragraph[index])]).join("\n");

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
