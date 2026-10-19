import { useMobileTheme } from "@/ui/theme";
import { Alert, type TextInputProps } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHostClient } from "../../state/host-context";
import { tr, useLocale } from "../../i18n";
import { Button, ErrorNotice, Field, Loading } from "../../ui/primitives";

export { tr };
export { colors as palette } from "../../ui/tokens";
export { Body as Copy, Card as Box, Row as Actions } from "../../ui/primitives";
export function Action({
  title,
  onPress,
  disabled,
  danger,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  useMobileTheme();
  return (
    <Button
      label={title}
      onPress={onPress}
      disabled={disabled}
      tone={danger ? "danger" : "default"}
    />
  );
}
export function Input(props: TextInputProps & { label: string }) {
  useMobileTheme();
  return <Field {...props} />;
}
export function confirm(title: string, detail: string, action: () => void) {
  Alert.alert(title, detail, [
    { text: tr("Cancel", "Vazgeç"), style: "cancel" },
    { text: title, onPress: action },
  ]);
}
export function useHostData<T>(
  machineId: string,
  projectId: string | undefined,
  key: string,
  method: string,
  params: Record<string, unknown> = {},
  enabled = true,
) {
  const client = useHostClient(machineId);
  return useQuery({
    queryKey: ["host", machineId, projectId, key, params],
    queryFn: () => client!.request<T>(method, params),
    enabled: !!client && enabled,
    refetchInterval: 15000,
  });
}
export function useHostAction(machineId: string) {
  const client = useHostClient(machineId);
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async ({
      method,
      params = {},
    }: {
      method: string;
      params?: Record<string, unknown>;
    }) => {
      if (!client)
        throw new Error(tr("Connect to the computer first.", "Önce bilgisayara bağlanın."));
      return client.request<unknown>(method, params);
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ["host", machineId] }),
  });
}
export function Feedback({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
}) {
  useMobileTheme();
  useLocale();
  return loading ? (
    <Loading label={tr("Loading", "Yükleniyor")} />
  ) : error ? (
    <ErrorNotice error={error} onRetry={retry} retryLabel={tr("Retry", "Yeniden dene")} />
  ) : null;
}
export type ManagementProps = { machineId: string; projectId?: string };
