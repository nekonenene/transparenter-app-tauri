import type { KeyColor } from "./types";

const PATCH = 16;
const AGREE_THRESHOLD = 0.08; // 正規化RGB距離

/**
 * 画像の四隅のパッチから背景色を推定する。
 * 各パッチのチャネル別中央値を取り、互いに近い色が多数派のグループを平均する。
 */
export function estimateKeyColor(
  src: Uint8ClampedArray,
  width: number,
  height: number,
): KeyColor {
  const px = Math.min(PATCH, width);
  const py = Math.min(PATCH, height);
  const corners: KeyColor[] = [
    patchMedian(src, width, 0, 0, px, py),
    patchMedian(src, width, width - px, 0, px, py),
    patchMedian(src, width, 0, height - py, px, py),
    patchMedian(src, width, width - px, height - py, px, py),
  ];

  // 最も多くの隅と一致する色を探し、そのグループを平均
  let best = 0;
  let bestCount = -1;
  for (let i = 0; i < corners.length; i++) {
    let count = 0;
    for (let j = 0; j < corners.length; j++) {
      if (rgbDist(corners[i], corners[j]) < AGREE_THRESHOLD) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = i;
    }
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let m = 0;
  for (const c of corners) {
    if (rgbDist(corners[best], c) < AGREE_THRESHOLD) {
      r += c.r;
      g += c.g;
      b += c.b;
      m++;
    }
  }
  return { r: Math.round(r / m), g: Math.round(g / m), b: Math.round(b / m) };
}

function patchMedian(
  src: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): KeyColor {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const p = (y * width + x) * 4;
      rs.push(src[p]);
      gs.push(src[p + 1]);
      bs.push(src[p + 2]);
    }
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

function median(v: number[]): number {
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}

function rgbDist(a: KeyColor, b: KeyColor): number {
  const dr = (a.r - b.r) / 255;
  const dg = (a.g - b.g) / 255;
  const db = (a.b - b.b) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
