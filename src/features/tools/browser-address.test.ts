import { expect, it } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { browserAddress, browserErrorMessage, phoneCanOpen } from "./browser-address";

const en = (_tr: string, english: string) => english;
const tr = (turkish: string) => turkish;
const hostError = (message: string, uncertain = false) => new RemoteHostError("machine", "host", message, uncertain);

it("accepts what people type into a browser bar", () => {
  expect(browserAddress("www.google.com")).toBe("https://www.google.com");
  expect(browserAddress("  example.com/path?q=1 ")).toBe("https://example.com/path?q=1");
  expect(browserAddress("localhost:3000")).toBe("http://localhost:3000");
  expect(browserAddress("192.168.1.5:8080/app")).toBe("http://192.168.1.5:8080/app");
  expect(browserAddress("https://example.com")).toBe("https://example.com");
  expect(browserAddress("HTTP://Example.com")).toBe("HTTP://Example.com");
  expect(browserAddress("münchen.de")).toBe("https://münchen.de");
});

it("rejects text that is not a web address", () => {
  for (const input of ["", "   ", "google", "two words.com", "file:///etc/passwd", "ftp://example.com", "https://", "https://user:pw@example.com", "user@example.com", "mailto:a@example.com"])
    expect(browserAddress(input)).toBeUndefined();
});

it("does not offer the phone's browser for the computer's own loopback", () => {
  expect(phoneCanOpen("https://www.google.com/")).toBe(true);
  expect(phoneCanOpen("http://localhost:3000/")).toBe(false);
  expect(phoneCanOpen("http://127.0.0.1:8080/")).toBe(false);
  expect(phoneCanOpen(null)).toBe(false);
});

it("never shows the uncertain-write caution for opening an address", () => {
  const failure = hostError("Host request failed", true);
  expect(browserErrorMessage(failure, "browser.open", en)).toBe("The computer could not complete this request. Try again.");
  expect(browserErrorMessage(failure, "browser.open", tr)).toBe("Bilgisayar bu isteği tamamlayamadı. Yeniden dene.");
  // Typing into the page is not repeatable, so it keeps the caution.
  expect(browserErrorMessage(failure, "browser.input", en)).toContain("may have been applied");
});

it("localizes the shared browser's own refusals and navigation failures", () => {
  expect(browserErrorMessage(hostError("Enter a web address such as example.com."), "browser.open", tr)).toBe("example.com gibi bir web adresi yaz.");
  expect(browserErrorMessage(hostError("Another client controls this browser. Use Claim control to take over."), "browser.claim", en))
    .toBe("Another device or session is using the shared browser right now.");
  expect(browserErrorMessage(hostError("page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/\nCall log:\n  - navigating"), "browser.open", en))
    .toBe("This address could not be found. Check the spelling.");
  expect(browserErrorMessage(hostError("page.goto: Timeout 15000ms exceeded."), "browser.open", en))
    .toBe("The page did not load in time. Refresh the screen to see whether it opened.");
  expect(browserErrorMessage(hostError("page.goto: net::ERR_ABORTED"), "browser.open", en)).toBe("This page could not be opened.");
});

it("leaves connection failures to the shared mapping", () => {
  const offline = new RemoteHostError("machine", "network", "This computer could not be reached. Check its connection and try again.");
  expect(browserErrorMessage(offline, "browser.status", en)).toContain("The computer could not be reached.");
});
