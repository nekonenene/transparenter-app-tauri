/**
 * median-cut による RGBA 256色量子化。
 * ユニーク色が maxColors 以下ならパレット化のみで完全ロスレス。
 */
export interface QuantizedImage {
  /** RGBA 順のパレット(colorCount * 4) */
  palette: Uint8Array;
  /** ピクセルごとのパレット番号 */
  indices: Uint8Array;
  colorCount: number;
}

export function quantize(
  data: Uint8ClampedArray,
  maxColors = 256,
): QuantizedImage {
  const pixelCount = data.length / 4;

  // ユニーク色の収集(キー: RGBA を 32bit にパック)
  const countMap = new Map<number, number>();
  for (let p = 0; p < data.length; p += 4) {
    const key =
      (data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24)) >>> 0;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const uniques = [...countMap.keys()];
  const paletteOf = new Map<number, number>(); // 色 → パレット番号
  let palette: number[][];

  if (uniques.length <= maxColors) {
    palette = uniques.map(unpack);
    uniques.forEach((c, i) => paletteOf.set(c, i));
  } else {
    palette = medianCut(uniques, countMap, maxColors, paletteOf);
  }

  const paletteBytes = new Uint8Array(palette.length * 4);
  palette.forEach((c, i) => paletteBytes.set(c, i * 4));

  const indices = new Uint8Array(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    const key =
      (data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24)) >>> 0;
    indices[i] = paletteOf.get(key)!;
  }

  return { palette: paletteBytes, indices, colorCount: palette.length };
}

function unpack(key: number): number[] {
  return [key & 0xff, (key >> 8) & 0xff, (key >> 16) & 0xff, (key >>> 24) & 0xff];
}

interface Box {
  colors: number[]; // パックされたユニーク色
}

function medianCut(
  uniques: number[],
  counts: Map<number, number>,
  maxColors: number,
  paletteOf: Map<number, number>,
): number[][] {
  let boxes: Box[] = [{ colors: uniques }];

  while (boxes.length < maxColors) {
    // 最も範囲の広いチャネルを持つ箱を分割する
    let bestBox = -1;
    let bestChannel = 0;
    let bestRange = 0;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b].colors.length < 2) continue;
      for (let ch = 0; ch < 4; ch++) {
        let min = 255;
        let max = 0;
        for (const c of boxes[b].colors) {
          const v = (c >>> (ch * 8)) & 0xff;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const range = max - min;
        if (range > bestRange) {
          bestRange = range;
          bestBox = b;
          bestChannel = ch;
        }
      }
    }
    if (bestBox < 0) break; // これ以上分割できない

    const box = boxes[bestBox];
    box.colors.sort(
      (a, b) => (((a >>> (bestChannel * 8)) & 0xff) - ((b >>> (bestChannel * 8)) & 0xff)),
    );
    // ピクセル数の重み付き中央値で分割
    const total = box.colors.reduce((s, c) => s + counts.get(c)!, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.colors.length - 1; i++) {
      acc += counts.get(box.colors[i])!;
      if (acc * 2 >= total) {
        cut = i + 1;
        break;
      }
    }
    boxes[bestBox] = { colors: box.colors.slice(0, cut) };
    boxes.push({ colors: box.colors.slice(cut) });
  }

  // 各箱の重み付き平均をパレット色にする
  return boxes.map((box, idx) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let m = 0;
    for (const c of box.colors) {
      const n = counts.get(c)!;
      r += (c & 0xff) * n;
      g += ((c >> 8) & 0xff) * n;
      b += ((c >> 16) & 0xff) * n;
      a += ((c >>> 24) & 0xff) * n;
      m += n;
      paletteOf.set(c, idx);
    }
    return [Math.round(r / m), Math.round(g / m), Math.round(b / m), Math.round(a / m)];
  });
}
