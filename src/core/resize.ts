export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * ボックス平均による縮小。長辺が maxEdge 以下になるようにする。
 * 縮小不要でもコピーを返す(呼び出し側が独立バッファを前提にできるように)。
 */
export function resizeToFit(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  maxEdge: number,
): RawImage {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return { data: src.slice(), width, height };
  }

  const scale = maxEdge / longEdge;
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(dw * dh * 4);

  for (let dy = 0; dy < dh; dy++) {
    const sy0 = Math.floor((dy * height) / dh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * height) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = Math.floor((dx * width) / dw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * width) / dw));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let m = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const p = (sy * width + sx) * 4;
          r += src[p];
          g += src[p + 1];
          b += src[p + 2];
          a += src[p + 3];
          m++;
        }
      }
      const q = (dy * dw + dx) * 4;
      out[q] = r / m;
      out[q + 1] = g / m;
      out[q + 2] = b / m;
      out[q + 3] = a / m;
    }
  }
  return { data: out, width: dw, height: dh };
}
