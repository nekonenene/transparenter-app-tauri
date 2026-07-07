import { encode } from "fast-png";
import { zlibSync } from "fflate";
import { quantize } from "./quantize";

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
    return encodeIndexedPng(data, width, height);
  }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return encode(
    { width, height, data: bytes, channels: 4 },
    { zlib: { level: ZLIB_LEVELS[options.compression] } },
  );
}

/**
 * 256色に減色したインデックスPNG(color type 3 + tRNS)を書き出す。
 * ユニーク色が256以下の画像なら減色は起きず、パレット化のみ(ロスレス)。
 */
function encodeIndexedPng(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const { palette, indices, colorCount } = quantize(data, 256);

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type: indexed
  // compression / filter / interlace = 0

  const plte = new Uint8Array(colorCount * 3);
  const trns = new Uint8Array(colorCount);
  for (let i = 0; i < colorCount; i++) {
    plte[i * 3] = palette[i * 4];
    plte[i * 3 + 1] = palette[i * 4 + 1];
    plte[i * 3 + 2] = palette[i * 4 + 2];
    trns[i] = palette[i * 4 + 3];
  }

  // 各行の先頭にフィルタ種別 0 を付けたスキャンライン
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const idat = zlibSync(raw, { level: 9 });

  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const chunks = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", plte),
    pngChunk("tRNS", trns),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(body, 8);
  view.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)));
  return chunk;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
