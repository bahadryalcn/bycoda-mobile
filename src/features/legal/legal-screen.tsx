import { Stack, useLocalSearchParams } from "expo-router";
import { Empty, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { LegalReader } from "./legal-reader";
import { isLegalDocument, legalDocumentTitle, LegalDocument } from "./legal-document";
import { goBack } from "@/ui/navigation";

export function LegalScreen() {
  const copy = useCopy();
  const params = useLocalSearchParams<{ document?: string | string[] }>();
  const document = Array.isArray(params.document) ? params.document[0] : params.document;
  if (!isLegalDocument(document)) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ title: copy("Belge bulunamadı", "Document not found") }} />
        <Empty
          compact={false}
          illustration="error"
          title={copy("Bu belge mevcut değil.", "This document is unavailable.")}
          action={{
            label: copy("Geri dön", "Go back"),
            onPress: () => goBack("/settings"),
          }}
        />
      </Screen>
    );
  }
  if (document !== "help") {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ title: legalDocumentTitle(document, copy) }} />
        <LegalReader key={document} document={document} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: legalDocumentTitle(document, copy) }} />
      <LegalDocument document={document} />
    </Screen>
  );
}
