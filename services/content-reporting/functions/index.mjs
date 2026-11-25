import { initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { defineInt, defineList, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { parseReport, persistReport } from "./report.mjs";

initializeApp();

const region = defineString("REPORT_REGION");
const retentionDays = defineInt("REPORT_RETENTION_DAYS");
const allowedApps = defineList("REPORT_ALLOWED_APPS");

export const submitContentReport = onRequest(
  { region, cors: false, timeoutSeconds: 15 },
  async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (request.method !== "POST") {
      response.set("Allow", "POST").status(405).end();
      return;
    }
    if (!request.is("application/json")) {
      response.status(415).end();
      return;
    }
    // JSON can use six bytes per escaped control character.
    if (!request.rawBody || request.rawBody.length > 48_000) {
      response.status(413).end();
      return;
    }
    const token = request.get("X-Firebase-AppCheck");
    const verification = token
      ? await getAppCheck()
          .verifyToken(token)
          .catch(() => null)
      : null;
    if (!verification || !allowedApps.value().includes(verification.appId)) {
      response.status(401).end();
      return;
    }
    const report = parseReport(request.body);
    if (!report) {
      response.status(400).end();
      return;
    }
    try {
      const receipt = await persistReport(getFirestore(), report, retentionDays.value());
      if (receipt) response.status(200).json({ ...receipt, requestId: request.body.requestId });
      else response.status(409).end();
    } catch {
      response.status(503).end();
    }
  },
);
