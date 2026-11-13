import type { Block, UserQuestionPrompt } from "./wire";

/** Dev/test data only. Same Host-shaped boundaries as real transcript content. */
export const contentStressQuestions: UserQuestionPrompt[] = [
  {
    requestId: 9001,
    occurrenceId: "019c0000-0000-7000-8000-000000009001",
    behavior: "blocking",
    title: "Kurtarma planını seç",
    questions: [
      { id: "strategy", prompt: "Kaydedilmemiş çalışma ve İstanbul/東京 klasör adları korunurken hangi kurtarma yöntemi uygulansın?", multiSelect: false, allowCustom: true,
        options: [
          { id: "retain", label: "Mevcut klasörü koru ve yalnızca başarısız aktarımı yeniden dene", description: "Taslaklar ve yerel dosyalar mevcut bilgisayarda kalır." },
          { id: "new", label: "Yeni çalışma klasörüne taşı" },
          { id: "provider-other", label: "Other" },
        ] },
      { id: "checks", prompt: "Hangi kontroller gerekli? Birden fazla seçenek seçebilirsin.", multiSelect: true, allowCustom: false,
        options: [{ id: "source", label: "TypeScript ve odaklı regresyon testleri" }, { id: "device", label: "Telefon: büyük metin, klavye açık, açık/koyu görünüm" }] },
      { id: "notes", prompt: "Korunacak dosyaları ve çalışma sınırlarını yaz.\nDosya adları, emoji ve satır sonları korunmalı.", multiSelect: false, allowCustom: true, options: [] },
    ],
  },
  { requestId: 9002, occurrenceId: "019c0000-0000-7000-8000-000000009002", behavior: "nonBlocking", delivery: "unknown", error: "Connection interrupted after dispatch. Receipt not available.", questions: [
    { id: "branch", prompt: "Release branch", multiSelect: false, allowCustom: true, preserveCustomWhitespace: true, options: [] },
  ] },
];

export const contentStressShell: Block = {
  id: "stress-shell-output", role: "tool", text: "",
  shell: {
    command: "pnpm test src/features/workspace src/state --maxWorkers=2 --reporter=dot",
    output: Array.from({ length: 180 }, (_, index) => `PASS src/features/workspace/session-recovery-${index + 1}.test.ts`).join("\n") +
      "\nFAIL src/features/workspace/session-authority.test.ts\nExpected owning computer identity to stay unchanged.\nReceived: remote route changed before dispatch.",
    running: false, exitCode: 1, truncated: false,
  },
};

export const contentStressCode = `type RecoveryStep = { path: string; required: boolean };\nconst steps: RecoveryStep[] = [\n${Array.from({ length: 30 }, (_, index) => `  { path: "src/features/workspace/İstanbul-東京-${index + 1}.tsx", required: true },`).join("\n")}\n];\n`;

export const contentStressApprovals: Block[] = [
  { id: "approval-pending", role: "approval", text: "Run pnpm test src/features/workspace on the owning computer?", approval: { requestId: 9003, occurrenceId: "019c0000-0000-7000-8000-000000009003" } },
  { id: "approval-denied", role: "approval", text: "Publish application package", approval: { requestId: 9004, occurrenceId: "019c0000-0000-7000-8000-000000009004", decided: "deny" } },
];
