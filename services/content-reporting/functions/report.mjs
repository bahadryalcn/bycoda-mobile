import { createHash, randomUUID } from "node:crypto";

const reasons = new Set(["unsafe", "hate", "sexual", "privacy", "other"]);
const keys = new Set(["version", "requestId", "reason", "description", "excerpt"]);
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validText(value, limit) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    [...value].length <= limit
  );
}

export function parseReport(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !keys.has(key)) ||
    body.version !== 1 ||
    typeof body.requestId !== "string" ||
    !requestIdPattern.test(body.requestId) ||
    !reasons.has(body.reason) ||
    !validText(body.description, 2_000) ||
    (Object.hasOwn(body, "excerpt") && !validText(body.excerpt, 4_000))
  ) {
    return null;
  }
  const { reason, description, excerpt } = body;
  const content = {
    version: 1,
    reason,
    description,
    ...(excerpt === undefined ? {} : { excerpt }),
  };
  return { requestId: body.requestId.toLowerCase(), content };
}

export function persistReport(database, { requestId, content }, retentionDays, now = Date.now()) {
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0)
    throw new Error("Invalid report retention period");
  const digest = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const document = database.collection("contentReports").doc(requestId);
  const createdAt = new Date(now);
  const expiresAt = new Date(now + retentionDays * 86_400_000);
  const reportId = randomUUID();
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(document);
    if (snapshot.exists) {
      const previous = snapshot.data();
      if (previous.digest !== digest || previous.expiresAt.toMillis() <= now) return null;
      return { requestId, reportId: previous.reportId };
    }
    transaction.create(document, { ...content, reportId, digest, createdAt, expiresAt });
    return { requestId, reportId };
  });
}
