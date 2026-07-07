import type { KeyColor } from "../core/types";

/**
 * 元画像の指定位置(正規化座標)から 3x3 のチャネル別中央値で色を取得。
 * 1ピクセルだけだとノイズ・圧縮アーティファクトを拾うため。
 */
export function sampleColor(
  img: ImageData,
  u: number,
  v: number,
): KeyColor {
  const cx = Math.min(img.width - 1, Math.max(0, Math.round(u * (img.width - 1))));
  const cy = Math.min(img.height - 1, Math.max(0, Math.round(v * (img.height - 1))));

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.min(img.width - 1, Math.max(0, cx + dx));
      const y = Math.min(img.height - 1, Math.max(0, cy + dy));
      const p = (y * img.width + x) * 4;
      rs.push(img.data[p]);
      gs.push(img.data[p + 1]);
      bs.push(img.data[p + 2]);
    }
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

function median(v: number[]): number {
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}
