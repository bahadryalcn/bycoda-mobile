import { useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { Body, Button, FieldError, IdentifierField, MutationState, Sheet } from "@/ui/primitives";
import {
  cloneDraftProblem,
  cloneParams,
  cloneProgressLabel,
  inferCloneName,
  type CloneProgress,
} from "./clone-model";

/** Clones into `parentPath` on the computer; `onCloned` receives the new folder to open. */
export function CloneRepositorySheet({
  parentPath,
  onClose,
  onCloned,
}: {
  parentPath: string;
  onClose: () => void;
  onCloned: (path: string) => void;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [operationId] = useState(() => randomUUID());
  const clone = useHostMutation<{ path: string }>("projects.clone", null);
  const progress = useHostQuery<{ progress: CloneProgress | null }>(
    ["clone-progress", operationId],
    "projects.clone.progress",
    { operationId },
    { enabled: clone.isPending, interval: 1000 },
  );
  const draft = { url, name: name.trim() };
  const problem = touched ? cloneDraftProblem(draft) : null;
  const submit = () => {
    setTouched(true);
    if (clone.isPending || cloneDraftProblem(draft)) return;
    void clone
      .mutateAsync(cloneParams(draft, parentPath, operationId))
      .then((result) => onCloned(result.path))
      .catch(() => {});
  };
  const status = cloneProgressLabel(progress.data?.progress);
  return (
    <Sheet
      visible
      size="form"
      title={copy("Depoyu klonla", "Clone repository")}
      dirty={!!url.trim()}
      dismissible={!clone.isPending}
      onClose={() => {
        if (!clone.isPending) onClose();
      }}
      footer={
        <View style={{ gap: space.sm }}>
          <MutationState mutation={clone} />
          <Button
            label={copy("Klonla ve aç", "Clone and open")}
            tone="primary"
            fullWidth
            busy={clone.isPending}
            onPress={submit}
          />
        </View>
      }
    >
      <IdentifierField
        label={copy("Depo adresi", "Repository URL")}
        value={url}
        onChangeText={setUrl}
        placeholder="https://github.com/owner/repo.git"
        keyboardType="url"
        editable={!clone.isPending}
      />
      {problem === "url" ? (
        <FieldError
          message={copy(
            "https, ssh veya git adresi gir.",
            "Enter an https, ssh, or git URL.",
          )}
        />
      ) : null}
      <IdentifierField
        label={copy("Klasör adı (isteğe bağlı)", "Folder name (optional)")}
        value={name}
        onChangeText={setName}
        placeholder={inferCloneName(url) ?? ""}
        editable={!clone.isPending}
      />
      {problem === "name" ? (
        <FieldError message={copy("Geçerli bir klasör adı gir.", "Enter a valid folder name.")} />
      ) : null}
      <Body muted style={uiStyles.caption}>
        {copy("Hedef klasör", "Destination folder")}
      </Body>
      <Body mono selectable style={uiStyles.caption}>
        {parentPath}
      </Body>
      {clone.isPending ? (
        <Body muted style={uiStyles.caption}>
          {status ?? copy("Klonlanıyor…", "Cloning…")}
        </Body>
      ) : null}
    </Sheet>
  );
}
