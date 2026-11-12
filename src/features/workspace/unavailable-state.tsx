import { StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

/** Centered state for a sheet or panel whose private records cannot be read right now. */
export function RecordAccessUnavailable() {
  const copy = useCopy();
  return <StateView
    illustration="locked"
    title={copy(
      "Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.",
      "Record access is unavailable. Check the original computer and project connection.",
    )}
  />;
}

/** Centered state for a feature this computer's bycoda is too old (or unable) to provide. */
export function FeatureUnavailable({ message }: { message: string }) {
  return <StateView illustration="connect-computer" title={message} />;
}
