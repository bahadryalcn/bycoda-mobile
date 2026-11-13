import { useState } from "react";
import { View } from "react-native";
import { Body, Button, Row } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { DocumentContent } from "@/ui/document-content";
import { space } from "@/ui/tokens";
import { fileStressEncryptedPdf, fileStressPdf } from "./file-stress-fixtures";

const cases = ["PDF", "Encrypted", "Corrupt", "Markdown", "HTML", "Office"] as const;
type FileCase = typeof cases[number];
const names: Record<FileCase, string> = {
  PDF: "İstanbul – جدول العمل – 長い名前 – 📄.pdf", Encrypted: "protected.pdf", Corrupt: "broken.pdf",
  Markdown: "README.md", HTML: "report.html", Office: "2026-bütçe-予算-الميزانية.xlsx",
};

/** Real document owners with fixture bytes, never a Host or draft mutation. */
export function FileStressScreen() {
  const [selected, setSelected] = useState<FileCase>("PDF");
  const [opening, setOpening] = useState(0);
  const name = names[selected];
  const uri = selected === "PDF" ? fileStressPdf : selected === "Encrypted" ? fileStressEncryptedPdf
    : selected === "Corrupt" ? "data:application/pdf;base64,aW52YWxpZCBQREY=" : undefined;
  const text = selected === "Markdown" ? "# Türkçe • العربية • 日本語 📄\n\nLong_file_name_without_spaces_".repeat(3)
    : selected === "HTML" ? "<h1>İstanbul • العربية • 日本語</h1><p>Report &amp; details</p>" : undefined;
  return <ScreenList title="File fixtures" data={[selected]} keyExtractor={item => item}
    header={<Row>{cases.map(item => <Button key={item} label={item} selected={selected === item} onPress={() => setSelected(item)} />)}</Row>}
    renderItem={() => <View style={{ gap: space.sm }}>
      <Body>{name}</Body>
      <DocumentContent key={`${selected}:${opening}`} name={name} uri={uri} text={text} mimeType="application/octet-stream" onReload={() => setOpening(value => value + 1)} />
    </View>} />;
}
