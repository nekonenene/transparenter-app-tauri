/**
 * 縁の収縮(choke)。半透明のフリンジ帯だけを内側に収縮させる。
 *
 * - amount は小数対応(例 0.5)。整数回の erode 結果と +1 回の結果を
 *   ブレンドしてサブピクセルの収縮を実現する
 * - 完全不透明(α=1)のピクセルは削らない。取りたいフリンジは半透明の
 *   帯であり、芯まで不透明な細い髪の毛が途切れるのを防ぐ
 */
export function chokeAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0) return;
  const k = Math.floor(amount);
  const f = amount - k;

  const base = alpha.slice(); // 保護判定用の元 α
  const cur = alpha.slice(); // erode を k 回適用した結果
  for (let i = 0; i < k; i++) erodeAlpha(cur, width, height, 1);
  let next: Float32Array | null = null;
  if (f > 0.001) {
    next = cur.slice();
    erodeAlpha(next, width, height, 1);
  }

  // 出力時に 255 へ丸まるピクセル(α ≥ 254.5/255)を「完全不透明」として保護
  const OPAQUE = 254.5 / 255;
  for (let i = 0; i < alpha.length; i++) {
    if (base[i] >= OPAQUE) continue; // 不透明コアの保護
    alpha[i] = next ? cur[i] * (1 - f) + next[i] * f : cur[i];
  }
}

/**
 * αチャネルの erode(min フィルタ)。
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
