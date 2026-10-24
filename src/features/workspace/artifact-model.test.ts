import { describe, expect, it } from "vitest";
import { MAX_ARTIFACT_BYTES, readArtifact, readArtifactList } from "./artifact-model";

const artifact = { id: "artifact-a", sessionId: "session-a", title: "Report", createdAt: "2026-10-21T12:00:00Z", bytes: 20, html: "<h1>Report</h1>" };

describe("saved HTML artifact responses", () => {
  it("reads only the requested session and artifact", () => {
    expect(readArtifactList([artifact], "session-a")).toEqual([{ id: artifact.id, sessionId: artifact.sessionId, title: artifact.title, createdAt: artifact.createdAt, bytes: artifact.bytes }]);
    expect(readArtifact(artifact, "session-a", "artifact-a").html).toBe(artifact.html);
    expect(() => readArtifactList([artifact], "session-b")).toThrow();
    expect(() => readArtifact(artifact, "session-a", "artifact-b")).toThrow();
    expect(() => readArtifact(artifact, "session-b", "artifact-a")).toThrow();
  });

  it("rejects malformed and duplicate identities instead of showing an empty success", () => {
    for (const invalid of [null, {}, [null], [{ ...artifact, createdAt: "invalid" }], [{ ...artifact, bytes: -1 }], [artifact, artifact]]) {
      expect(() => readArtifactList(invalid, "session-a")).toThrow();
    }
    expect(readArtifactList([], "session-a")).toEqual([]);
  });

  it("bounds collection metadata and actual multibyte HTML regardless of advertised size", () => {
    expect(() => readArtifactList(Array.from({ length: 201 }, (_, i) => ({ ...artifact, id: String(i) })), "session-a")).toThrow();
    expect(() => readArtifactList([{ ...artifact, bytes: MAX_ARTIFACT_BYTES + 1 }], "session-a")).toThrow();
    expect(() => readArtifact({ ...artifact, html: "😀".repeat(MAX_ARTIFACT_BYTES / 4 + 1) }, "session-a", "artifact-a")).toThrow();
    expect(readArtifact({ ...artifact, html: "a".repeat(MAX_ARTIFACT_BYTES) }, "session-a", "artifact-a").html.length).toBe(MAX_ARTIFACT_BYTES);
  });
});
