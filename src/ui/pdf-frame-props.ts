export type PdfFrameProps = {
  html: string;
  title: string;
  fill?: boolean;
  onMessage(raw: unknown): void;
  onFailure(): void;
};
