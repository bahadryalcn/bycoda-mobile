import assert from "node:assert/strict";
import test from "node:test";
import { localeMessagesFromSources } from "./locale-source.mjs";

const extract = (text) => localeMessagesFromSources([{ fileName: "fixture.tsx", text }]);

test("extracts literal copy and legacy tr calls with their respective argument order", () => {
  assert.deepEqual(extract(`
    copy("Kaydet", "Save");
    tr("Cancel", "İptal");
    copy(\`Hazır\`, \`Ready\`);
    copy(dynamicTurkish, dynamicEnglish);
    unrelated("Yanlış", "Unrelated");
  `), { Cancel: "İptal", Ready: "Hazır", Save: "Kaydet" });
});

test("retains explicitly typed offline copy including nested section paragraphs", () => {
  assert.deepEqual(extract(`
    type LegalText = readonly [tr: string, en: string];
    type Section = { title: LegalText; paragraphs: readonly LegalText[] };
    const updated: LegalText = ["12 Ekim", "12 October"];
    const sections: Record<string, readonly Section[]> = {
      privacy: [{ title: ["Gizlilik", "Privacy"], paragraphs: [["Cihazda kalır.", "Stays on device."]] }],
    };
    const untyped = ["Türkçe değil", "Untyped"];
    const unrelated: readonly [from: string, to: string] = ["left", "right"];
  `), { "12 October": "12 Ekim", Privacy: "Gizlilik", "Stays on device.": "Cihazda kalır." });
});

test("extracts only tuple maps consumed by copy or tr", () => {
  assert.deepEqual(extract(`
    const translated: Record<string, readonly [string, string]> = {
      todo: ["Yapılacak", "To do"], running: ["Çalışıyor", "Running"],
    };
    const tableAlias = translated;
    copy(...tableAlias[status]);
    const legacy = { ready: ["Legacy ready", "Eski hazır"], ignored: ["Ignored", "Yoksay"] } as const;
    tr(...legacy.ready);
    const direct = ["Doğrudan", "Direct"] as const;
    copy(...direct);
    const unrelated = { status: ["todo", "queued"] };
  `), { Direct: "Doğrudan", "Legacy ready": "Eski hazır", Running: "Çalışıyor", "To do": "Yapılacak" });
});

test("extracts navigation tuple fields from map bindings consumed by copy, independent of tuple width", () => {
  assert.deepEqual(extract(`
    const sections = [["inbox", "Gelen kutusu", "Inbox", "Yanıtlar", "Replies", "internal"]] as const;
    const aliases = sections;
    aliases.map(([id, titleTr, titleEn, detailTr, detailEn]) => (
      <Row label={copy(titleTr, titleEn)} detail={copy(detailTr, detailEn)} />
    ));
    const pairs = [["Back", "Geri"]];
    pairs.map(([english, turkish]) => tr(english, turkish));
  `), { Back: "Geri", Inbox: "Gelen kutusu", Replies: "Yanıtlar" });
});

test("does not mistake token, query, enum, or unused tuple arrays for localized copy", () => {
  assert.deepEqual(extract(`
    const tokens = ["link", "code_inline", "code_block", "fence", "image"];
    const statuses = ["todo", "queued"];
    const queryKey = ["host", "machine.changes"];
    const tupleRows = [["inbox", "tr title", "en title", "tr detail", "en detail"]];
    tupleRows.map(([id, tr, en]) => <Row label={en} />);
    const codes: readonly [string, string] = ["http:", "https:"];
    const labels = ["left", "right"] satisfies readonly [string, string];
  `), {});
});

test("uses lexical map bindings instead of matching common tr/en variable names", () => {
  assert.deepEqual(extract(`
    const sections = [["id", "Yanlış", "Wrong"]];
    sections.map(([id, tr, en]) => {
      const render = (tr: string, en: string) => copy(tr, en);
      return render("dynamic", "dynamic");
    });
    const other = [["Yanlış sıra", "Wrong order"]];
    other.map(([tr]) => { const en = external; return copy(tr, en); });
  `), {});
});
