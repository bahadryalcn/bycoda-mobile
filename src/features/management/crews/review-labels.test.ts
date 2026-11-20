import { expect, it } from "vitest";
import { translate, type Locale } from "@/localization";
import { messageSenderLabel, reviewVerdictLabel, type CrewCopy } from "./review-labels";

const copyFor = (locale: Locale): CrewCopy => (tr, en, values) => translate(locale, tr, en, values);

it("maps host review verdicts to localized labels, never raw pass/fail tokens", () => {
  expect(reviewVerdictLabel("pass", copyFor("en"))).toBe("Passed");
  expect(reviewVerdictLabel("fail", copyFor("en"))).toBe("Failed");
  expect(reviewVerdictLabel("pass", copyFor("tr"))).toBe("Başarılı");
  expect(reviewVerdictLabel("fail", copyFor("tr"))).toBe("Başarısız");
  expect(reviewVerdictLabel("pass", copyFor("de"))).toBe("Bestanden");
  expect(reviewVerdictLabel("fail", copyFor("de"))).toBe("Fehlgeschlagen");
  expect(reviewVerdictLabel(undefined, copyFor("en"))).toBe("Awaiting review");
  expect(reviewVerdictLabel(undefined, copyFor("tr"))).toBe("İnceleme bekleniyor");
});

it("labels message senders by role instead of printing raw host ids", () => {
  expect(messageSenderLabel("owner", "coord-1", copyFor("en"))).toBe("You");
  expect(messageSenderLabel("coord-1", "coord-1", copyFor("en"))).toBe("Coordinator");
  expect(messageSenderLabel("session-9", "coord-1", copyFor("en"))).toBe("Member");
  expect(messageSenderLabel("session-9", undefined, copyFor("en"))).toBe("Member");
  expect(messageSenderLabel("owner", undefined, copyFor("tr"))).toBe("Sen");
  expect(messageSenderLabel("owner", undefined, copyFor("tr"))).not.toBe("owner");
});

it("interpolates task counts through the plural-aware catalog, not string concatenation", () => {
  expect(translate("en", "{p0} görev", "{p0} tasks", { p0: 3 })).toBe("3 tasks");
  expect(translate("tr", "{p0} görev", "{p0} tasks", { p0: 3 })).toBe("3 görev");
  expect(translate("de", "{p0} görev", "{p0} tasks", { p0: 3 })).toBe("3 Aufgaben");
});
