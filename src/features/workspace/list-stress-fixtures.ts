/** Dev-only list data. Import only from the parent-owned demo route. */
export const listFixtureModes = ["Demo", "Worst", "Empty", "One", "1000"] as const;
export type ListFixtureMode = (typeof listFixtureModes)[number];
const worstRows = [
  { title: "İstanbul müşteri portalında bildirim tercihlerini ve erişim izinlerini gözden geçir", projectName: "Northwind Industries Holdings müşteri portalı", branch: "feature/customer-notification-preferences-and-access-review" },
  { title: "IĞDIR saha ekibinin çevrimdışı çalışma kayıtlarını karşılaştır", projectName: "IĞDIR saha operasyonları", branch: "fix/offline-draft-recovery-after-network-change" },
  { title: "Jo", projectName: "J", branch: "main" },
  { title: "👩🏽‍💻 Priya ile sürüm öncesi erişilebilirlik incelemesi", projectName: "Aleksandra Wiśniewska-Kowalczyk araştırma alanı", branch: "review/voiceover-talkback-and-large-text" },
  { title: "إصلاح استعادة المسودة عند تغيير الاتصال", projectName: "نور الهدى عبد الرحمن", branch: "fix/session-draft-recovery" },
  { title: "Benachrichtigungseinstellungen nach einem Verbindungswechsel prüfen", projectName: "Paramètres de confidentialité et de sécurité", branch: "feature/account-notification-settings" },
  { title: "日本語の添付ファイル名と送信状態を確認する", projectName: "王秀英", branch: "main" },
  { title: "Q3 Board Deck FINAL revised v12 approved by legal.pdf dosyasını incele", projectName: "Seán O'Brien-Ó Súilleabháin", branch: "review/quarterly-board-deck-final-revision" },
];
export function listFixtureData(mode: ListFixtureMode) {
  const count = mode === "Empty" ? 0 : mode === "One" ? 1 : mode === "1000" ? 1000 : 12;
  return Array.from({ length: count }, (_, index) => ({
    id: `list-fixture-${index}`,
    title: mode === "Worst" ? worstRows[index % worstRows.length]!.title : `Review workspace ${index + 1}`,
    projectName: mode === "Worst" ? worstRows[index % worstRows.length]!.projectName : "Bycoda",
    branch: mode === "Worst" ? worstRows[index % worstRows.length]!.branch : "main",
    harness: index % 2 ? "claude" : "codex",
    status: index % 3 ? "idle" : "running",
    hasDraft: index % 4 === 0,
  }));
}
