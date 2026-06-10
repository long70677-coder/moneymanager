import type { BankFormatProfile, ParserEngine, RawRow } from "@/domain/ingest.types";
import { parseDelimited } from "./delimited";

type ParserFn = (file: Buffer, profile: BankFormatProfile) => RawRow[];

/**
 * 解析引擎註冊表。新增「全新檔案結構類型」才在此註冊新引擎（一次性）；
 * 同類型的格式差異一律靠 bank_format_profiles 設定，不動程式。
 * Phase 1 只實作 DELIMITED。
 */
const registry: Partial<Record<ParserEngine, ParserFn>> = {
  DELIMITED: parseDelimited,
};

export function getParser(engine: ParserEngine): ParserFn {
  const fn = registry[engine];
  if (!fn) throw new Error(`尚未支援的解析引擎：${engine}`);
  return fn;
}
