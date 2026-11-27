/**
 * File references named in a reply (a Markdown link to a workspace file, inline code holding a file
 * path, an `@path` mention): which kind of file it is (tint and icon), the short name shown on the
 * phone and the quieter line location. Mirrors desktop `shared/lib/fileReferenceKind.ts`; pure so
 * the renderer and the selection layer produce the same characters.
 */
export const FILE_REF_KINDS = ["code", "markup", "docs", "data", "media", "archive", "folder", "other"] as const;
export type FileRefKind = (typeof FILE_REF_KINDS)[number];

const words = (list: string) => list.split(" ");
const EXTENSION_KINDS: Record<Exclude<FileRefKind, "folder" | "other">, readonly string[]> = {
  code: words(
    "ts tsx mts cts js jsx mjs cjs py pyi rs go java kt kts swift c h cc cpp cxx hpp cs rb php sh bash zsh fish ps1 psm1 bat sql lua dart scala exs erl hs clj vue svelte astro css scss sass styl gradle graphql gql proto zig nim jl",
  ),
  markup: words("html htm xhtml xml xsl xslt jsp aspx ejs hbs pug"),
  docs: words("md mdx markdown txt pdf doc docx rtf odt tex rst adoc epub ppt pptx odp"),
  data: words("json jsonc json5 jsonl ndjson yaml yml toml csv tsv xlsx xls ods ini cfg conf ipynb parquet sqlite plist"),
  media: words(
    "png jpg jpeg gif webp avif bmp ico icns tif tiff heic svg psd mp4 m4v mov webm mkv avi ogv mp3 m4a aac wav ogg oga opus flac",
  ),
  archive: words("zip tar gz tgz bz2 xz 7z rar zst"),
};
const KIND_BY_EXTENSION = new Map<string, FileRefKind>(
  (Object.entries(EXTENSION_KINDS) as [FileRefKind, readonly string[]][]).flatMap(([kind, list]) =>
    list.map((extension) => [extension, kind] as const),
  ),
);
// `log`, `map`, `env` and `lock` read as code in `console.log` or `process.env`; only whole names count.
const NAMED_KINDS = new Map<string, FileRefKind>([
  ["dockerfile", "code"], ["makefile", "code"], ["gemfile", "code"], ["rakefile", "code"],
  ["license", "docs"], ["readme", "docs"], ["changelog", "docs"],
  [".env", "data"], [".gitignore", "data"], [".gitattributes", "data"], [".editorconfig", "data"],
  [".npmrc", "data"], [".prettierrc", "data"], [".eslintrc", "data"],
  ["package-lock.json", "data"], ["pnpm-lock.yaml", "data"], ["yarn.lock", "data"], ["cargo.lock", "data"],
]);

const LOCATION = /(?::(\d+)(?::(\d+))?|#L(\d+)(?::(\d+))?(?:-L?(\d+))?)$/;

const leafOf = (name: string) => (name.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "");
function extensionOf(name: string): string {
  const leaf = leafOf(name);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(dot + 1).toLowerCase() : "";
}

/** A dotted identifier such as `images.generate` is not a file; only recognised types count. */
export function isKnownFileType(name: string): boolean {
  const leaf = leafOf(name).toLowerCase();
  return NAMED_KINDS.has(leaf) || /^\.env\.[\w.-]+$/.test(leaf) || KIND_BY_EXTENSION.has(extensionOf(name));
}

/** Kind by name; a trailing separator marks a folder, an unlisted file is `other`. */
export function fileReferenceKind(name: string): FileRefKind {
  const path = name.replace(LOCATION, "");
  if (/[\\/]$/.test(path)) return "folder";
  const leaf = leafOf(path).toLowerCase();
  if (/^\.env\.[\w.-]+$/.test(leaf)) return "data";
  return NAMED_KINDS.get(leaf) ?? KIND_BY_EXTENSION.get(extensionOf(path)) ?? "other";
}

/** Splits `:711`, `:711:5`, `#L13`, `#L13-L20` off a reference; `location` reads `L711`, `L711:5`, `L13-20`. */
export function splitFileLocation(text: string): { name: string; location?: string } {
  const match = LOCATION.exec(text);
  if (!match || match.index === 0) return { name: text };
  const name = text.slice(0, match.index);
  if (match[1]) return { name, location: `L${match[1]}${match[2] ? `:${match[2]}` : ""}` };
  return { name, location: `L${match[3]}${match[5] ? `-${match[5]}` : match[4] ? `:${match[4]}` : ""}` };
}

/**
 * Inline code that names a workspace file: a recognised file type (`src/app.ts:12`, `README.md`),
 * never a URL, slash command, absolute root-relative path, flag or multi-word snippet. Returns the
 * path to open, or null so the span stays neutral code.
 */
export function inlineCodeFilePath(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 1024 || /\s/.test(text)) return null;
  if (/^[a-z][\w+.-]*:\/\//i.test(text) || /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(text)) return null;
  // `/compact` and `/usr/bin` are commands or machine paths, not workspace references.
  if (text.startsWith("/") || text.startsWith("-") || /[`'"<>{}()[\]|*?$;,]/.test(text)) return null;
  const name = splitFileLocation(text).name;
  const leaf = leafOf(name);
  if (!leaf || !isKnownFileType(leaf)) return null;
  return text;
}

/**
 * What a chip shows: the leaf name (phones have no room for long paths) and the line location.
 * A custom link label (`[the config](src/config.ts)`) is kept as written; the location still
 * comes from the target when the label has none.
 */
export function fileChipText(label: string, target: string): { name: string; location?: string } {
  const own = splitFileLocation(label.trim());
  const pathLike = /[\\/]/.test(own.name) || own.name === leafOf(splitFileLocation(target).name) || own.name === target;
  const location = own.location ?? splitFileLocation(target.replace(/^file:\/\//i, "")).location;
  const name = pathLike ? leafOf(own.name) || own.name : own.name;
  return { name: name || leafOf(splitFileLocation(target).name) || target, location };
}

/** Placeholder the selection layer uses for the chip's icon slot (one em wide, like the icon box). */
export const FILE_CHIP_ICON_SLOT = " ";
/** Narrow no-break space closing the chip so its tinted ground ends after the text. */
export const FILE_CHIP_END = " ";

/** The exact characters a chip renders after its icon slot; shared with the selection layer. */
export function fileChipString(label: string, target: string): string {
  const { name, location } = fileChipText(label, target);
  return `${name}${location ? ` · ${location}` : ""}${FILE_CHIP_END}`;
}
