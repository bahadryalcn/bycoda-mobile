import { expect, it, vi } from "vitest";
import { pdfHtml, type PdfLabels } from "./pdf-html";
import { darkColors } from "./tokens";

vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("../../assets/pdf-runtime", () => ({ default: "window.runtimeLoaded=true;/* </ScRiPt><script>escape */" }));
const labels: PdfLabels = {
  loading: "Loading", error: "Failed", password: "Password", passwordIncorrect: "Incorrect",
  page: "Page", previous: "Previous", next: "Next", zoomIn: "Zoom in", zoomOut: "Zoom out",
  fit: "Fit", open: "Open", passwordLabel: "Document password",
};
const input = { base64: "JVBERg==", channel: "reader-1", position: { page: 2, zoom: 1.5 }, colors: darkColors, locale: "tr-TR", labels };

it("blocks network, workers, embedded content, forms and base navigation before scripts", () => {
  const html = pdfHtml(input);
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  for (const rule of ["default-src 'none'", "connect-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"])
    expect(csp).toContain(rule);
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script>"));
  expect(html).toContain('name="referrer" content="no-referrer"');
  expect(html).not.toMatch(/<(?:script|iframe)[^>]+src=/i);
});
it("escapes labels in text and attributes and serializes script data without closing its script", () => {
  const attack = `</script><img src=x onerror="run()">&'`;
  const html = pdfHtml({ ...input, channel: attack, locale: attack, labels: Object.fromEntries(Object.keys(labels).map(key => [key, attack])) as PdfLabels });
  expect(html).not.toContain(attack);
  expect(html).toContain('&lt;/script&gt;&lt;img src=x onerror=&quot;run()&quot;&gt;&amp;&#39;');
  const configuration = html.match(/window\.byCodaPdfStart\((.+)\);<\/script>/)?.[1];
  expect(configuration).toBeDefined(); expect(configuration).not.toContain("<");
  const parsed = JSON.parse(configuration!);
  expect(parsed.channel).toBe(attack); expect(parsed.labels.previous).toBe(attack); expect(parsed.locale).toBe(attack);
  expect(html).toContain("<\\/script><script>escape");
});
it("keeps document bytes and reader restoration values in local runtime configuration", () => {
  const html = pdfHtml(input);
  const configuration = html.match(/window\.byCodaPdfStart\((.+)\);<\/script>/)?.[1];
  expect(JSON.parse(configuration!)).toMatchObject({ base64: input.base64, channel: input.channel, page: 2, zoom: 1.5, locale: "tr-TR" });
  expect(() => pdfHtml({ ...input, base64: "</script>" })).toThrow("Invalid or oversized PDF data.");
});
it.each([[0.5, 16], [2, 32], [10, 64], [NaN, 16], [Infinity, 16]])("bounds system font scale %s while keeping usable controls", (fontScale, size) => {
  const html = pdfHtml({ ...input, fontScale });
  expect(html).toContain(`font-size:${size}px`);
  expect(html).toContain("min-width:48px;min-height:48px");
  expect(html).toContain('for="password"'); expect(html).toContain('type="password"');
  expect(html).toContain('class="textLayer" role="document"');
});
