import type { BankFormatProfile, RawRow } from "@/domain/ingest.types";

/**
 * 分隔檔解析引擎（DELIMITED）。
 * cells 同時以「欄名」與「欄序(字串)」為 key，讓 column_map 可用 name 或 index 對應。
 * Phase 1 僅支援 UTF-8；其他編碼（如 Big5）需 iconv-lite，留待後續。
 */
export function parseDelimited(file: Buffer, profile: BankFormatProfile): RawRow[] {
  const enc = (profile.encoding || "UTF-8").toUpperCase();
  if (enc !== "UTF-8" && enc !== "UTF8" && enc !== "ASCII") {
    throw new Error(`暫不支援的編碼 ${profile.encoding}（Phase 1 僅 UTF-8）`);
  }

  let text = file.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 去 BOM

  const allLines = text.split(/\r\n|\r|\n/);
  const delim = profile.delimiter || ",";

  let idx = profile.skip_rows || 0;
  let header: string[] | null = null;
  if (profile.has_header) {
    const hl = allLines[idx];
    idx++;
    header = hl ? hl.split(delim).map(s => s.trim()) : [];
  }

  const rows: RawRow[] = [];
  for (let i = idx; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.trim().length === 0) continue; // 略過空行
    const parts = line.split(delim).map(s => s.trim());
    const cells: Record<string, string> = {};
    parts.forEach((v, j) => {
      cells[String(j)] = v; // 以欄序
      if (header && header[j] !== undefined) cells[header[j]] = v; // 以欄名
    });
    rows.push({ sourceRow: i + 1, cells });
  }
  return rows;
}
