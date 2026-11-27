import { parseBrowserAnnotation, type BrowserAnnotationCapture } from "../../../../src/shared/lib/browserAnnotation";
export type BrowserCaptureScope = { projectId: string; sessionId: string; navigationId: string };
/** Page content remains untrusted data. No text selection is an instruction or send. */
export function readBrowserCapture(value: unknown, scope: BrowserCaptureScope): BrowserAnnotationCapture {
  if (!value || typeof value !== "object") throw new Error("Invalid browser selection");
  const capture = value as BrowserAnnotationCapture;
  const screenshot = capture.screenshot;
  if (!screenshot || screenshot.mimeType !== "image/jpeg" || typeof screenshot.data !== "string" || !screenshot.data.length ||
    screenshot.data.length > Math.ceil(2 * 1024 * 1024 / 3) * 4 || screenshot.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot.data) ||
    !Number.isSafeInteger(screenshot.width) || !Number.isSafeInteger(screenshot.height) || screenshot.width < 1 || screenshot.height < 1 || screenshot.width > 16384 || screenshot.height > 16384)
    throw new Error("Invalid browser screenshot");
  const decodedBytes = screenshot.data.length / 4 * 3 - (screenshot.data.endsWith("==") ? 2 : screenshot.data.endsWith("=") ? 1 : 0);
  if (decodedBytes > 2 * 1024 * 1024) throw new Error("Browser screenshot exceeds transfer budget");
  const { screenshot: _screenshot, ...metadata } = capture;
  const { comment: _comment, ...parsed } = parseBrowserAnnotation({ ...metadata, comment: "" });
  if (!scope.projectId || !scope.sessionId || !scope.navigationId || parsed.projectId !== scope.projectId || parsed.sessionId !== scope.sessionId || parsed.navigationId !== scope.navigationId)
    throw new Error("Browser selection belongs to another page or session");
  return { ...parsed, screenshot: { mimeType: "image/jpeg", data: screenshot.data, width: screenshot.width, height: screenshot.height } };
}
