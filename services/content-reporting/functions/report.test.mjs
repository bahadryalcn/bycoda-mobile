import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { submitContentReport } from "./index.mjs";
import { parseReport, persistReport } from "./report.mjs";

const payload = {
  version: 1,
  requestId: "5d3a2bb9-f609-48b8-80ab-5689cc816cfc",
  reason: "unsafe",
  description: "A reviewed report",
};

test("the HTTP receiver rejects requests outside the App Check and JSON contract", async () => {
  async function statusFor(overrides) {
    const response = Object.assign(new EventEmitter(), {
      headers: {},
      set(name, value) {
        this.headers[name] = value;
        return this;
      },
      status(code) {
        this.code = code;
        return this;
      },
      end() {
        this.emit("finish");
      },
    });
    await submitContentReport(
      {
        method: "POST",
        headers: {},
        is: () => true,
        rawBody: Buffer.from(JSON.stringify(payload)),
        get: () => undefined,
        body: payload,
        ...overrides,
      },
      response,
    );
    assert.equal(response.headers["Cache-Control"], "no-store");
    return response.code;
  }

  assert.equal(await statusFor({ method: "GET" }), 405);
  assert.equal(await statusFor({ is: () => false }), 415);
  assert.equal(await statusFor({ rawBody: Buffer.alloc(48_001) }), 413);
  assert.equal(await statusFor({}), 401);
});

function memoryDatabase() {
  const records = new Map();
  return {
    records,
    collection: () => ({ doc: (id) => id }),
    runTransaction: (run) =>
      run({
        get: async (id) => ({ exists: records.has(id), data: () => records.get(id) }),
        create(id, value) {
          assert.equal(records.has(id), false);
          records.set(id, { ...value, expiresAt: { toMillis: () => value.expiresAt.getTime() } });
        },
      }),
  };
}

test("parses only reviewed fields and counts Unicode code points", () => {
  assert.deepEqual(parseReport(payload)?.content, {
    version: 1,
    reason: "unsafe",
    description: "A reviewed report",
  });
  assert.ok(parseReport({ ...payload, description: "🧪".repeat(2_000), excerpt: "x" }));
  assert.equal(parseReport({ ...payload, description: "🧪".repeat(2_001) }), null);
  assert.equal(parseReport({ ...payload, hostAddress: "example.invalid" }), null);
  assert.equal(parseReport({ ...payload, requestId: "../private" }), null);
});

test("retries return one receipt and conflicting or expired requests fail", async () => {
  const database = memoryDatabase();
  const report = parseReport(payload);
  const first = await persistReport(database, report, 1, 0);
  assert.equal(first.requestId, payload.requestId);
  assert.match(first.reportId, /^[a-z0-9-]{36}$/);
  assert.deepEqual(await persistReport(database, report, 1, 1), first);
  assert.equal(
    await persistReport(database, parseReport({ ...payload, description: "Changed" }), 1, 1),
    null,
  );
  assert.equal(await persistReport(database, report, 1, 86_400_000), null);
  assert.equal(database.records.size, 1);
});

test("concurrent Firestore retries return the committed receipt", { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const firebase = initializeApp({ projectId: "demo-bycoda-reporting" }, "report-test");
  try {
    const database = getFirestore(firebase);
    const report = parseReport({ ...payload, requestId: randomUUID() });
    const [first, second] = await Promise.all([
      persistReport(database, report, 1),
      persistReport(database, report, 1),
    ]);
    assert.deepEqual(first, second);
    assert.ok(first.reportId);
    await database.collection("contentReports").doc(report.requestId).delete();
  } finally {
    await deleteApp(firebase);
  }
});
