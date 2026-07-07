import { encode } from "fast-png";

/**
 * RGBA バッファを PNG にエンコードする。
 * Canvas の toBlob() は premultiplied alpha の往復で半透明ピクセルの色が
 * 劣化するため使わず、ピクセル値をそのまま書き出す。
 */
export function encodePng(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return encode({ width, height, data: bytes, channels: 4 });
}
