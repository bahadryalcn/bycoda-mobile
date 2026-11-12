import { Directory, File, Paths } from "expo-file-system";
import type { DiagnosticFiles } from "./diagnostic-files";

export function expoDiagnosticFiles(): DiagnosticFiles {
  const directory = new Directory(Paths.document, "diagnostics");
  return {
    read(name) {
      try {
        const file = new File(directory, name);
        return file.exists ? file.textSync() : null;
      } catch {
        return null;
      }
    },
    write(name, text) {
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, name);
      if (!file.exists) file.create();
      file.writeSync(text);
    },
    remove(name) {
      try {
        const file = new File(directory, name);
        if (file.exists) file.delete();
      } catch {
        // shortcut: a stale marker is retried on the next launch.
      }
    },
  };
}
