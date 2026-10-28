/** Only file-path titles are rearranged; commands, URLs and prose retain their wording. */
export function activityFileLabel(title: string) {
  const match = /^(?:(Read|Edit|Update|Create|Delete|Open|Reading|Editing|Updating|Creating|Deleting|Opening|Oku|Düzenle|Oluştur|Güncelle|Sil|Aç)\s+)?((?:[A-Za-z]:[\\/]|\.{0,2}[\\/]|[\w.-]+[\\/]).+)$/.exec(title);
  if (!match) return { title };
  const path = match[2]!;
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const filename = path.slice(separator + 1);
  if (!/^[^\\/\r\n]+\.[\w-]+(?::\d+(?::\d+)?)?$/.test(filename)) return { title };
  return {
    title: [match[1], filename].filter(Boolean).join(" "),
    directory: path.slice(0, separator + 1),
  };
}
