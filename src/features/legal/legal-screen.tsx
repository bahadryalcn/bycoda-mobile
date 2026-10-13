import { Stack, router, useLocalSearchParams } from "expo-router";
import { Body, Button, Card, Screen } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { isLegalDocument, legalDocumentTitle, LegalDocument } from "./legal-document";

export function LegalScreen() {
  const copy = useCopy();
  const params = useLocalSearchParams<{ document?: string | string[] }>();
  const document = Array.isArray(params.document) ? params.document[0] : params.document;
  if (!isLegalDocument(document)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: copy("Belge bulunamadı", "Document not found") }} />
        <Card>
          <Body>{copy("Bu belge mevcut değil.", "This document is unavailable.")}</Body>
          <Button label={copy("Geri dön", "Go back")} onPress={() => router.back()} />
        </Card>
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
