/**
 * αチャネルの erode(min フィルタ)。縁のフリンジを内側に収縮させる。
 * 分離可能フィルタ(水平→垂直)で O(n·r)。alpha を破壊的に更新する。
 */
export function erodeAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.round(radius);
  if (r <= 0) return;
  const tmp = new Float32Array(alpha.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 1;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const v = alpha[row + xx];
        if (v < m) m = v;
      }
      tmp[row + x] = m;
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 1;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * width + x];
        if (v < m) m = v;
      }
      alpha[y * width + x] = m;
    }
  }
}
