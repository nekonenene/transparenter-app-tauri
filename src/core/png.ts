import { encode } from "fast-png";
import UPNG from "upng-js";

/** PNG 書き出しのファイルサイズ設定。画質には影響しない(quantize を除く) */
export interface ExportOptions {
  /** zlib 圧縮レベルの選択: fast=速い(大きい) / normal=標準 / small=最小(遅い) */
  compression: "fast" | "normal" | "small";
  /** true なら 256 色パレットに減色(サイズ優先・わずかに劣化) */
  quantize: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  compression: "normal",
  quantize: false,
};

const ZLIB_LEVELS = { fast: 1, normal: 6, small: 9 } as const;

/**
 * RGBA バッファを PNG にエンコードする。
 * Canvas の toBlob() は premultiplied alpha の往復で半透明ピクセルの色が
 * 劣化するため使わず、ピクセル値をそのまま書き出す。
 */
export function encodePng(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Uint8Array {
  if (options.quantize) {
    const buf = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
    return new Uint8Array(UPNG.encode([buf as ArrayBuffer], width, height, 256));
  }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return encode(
    { width, height, data: bytes, channels: 4 },
    { zlib: { level: ZLIB_LEVELS[options.compression] } },
  );
}
