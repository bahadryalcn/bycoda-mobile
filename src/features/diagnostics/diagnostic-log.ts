import type { DiagnosticLogFields, DiagnosticLogLevel } from "../account/contracts";

type Sink = (level: DiagnosticLogLevel, category: string, message: string, fields?: DiagnosticLogFields) => void;
let sink: Sink | null = null;

export function setDiagnosticSink(next: Sink | null) {
  sink = next;
}

/** Records one structured event in the diagnostic log; a no-op until capture is installed. Never throws. */
export function logDiagnostic(
  level: DiagnosticLogLevel,
  category: string,
  message: string,
  fields?: DiagnosticLogFields,
) {
  try {
    sink?.(level, category, message, fields);
  } catch {
    // Logging must never affect the app.
  }
}
