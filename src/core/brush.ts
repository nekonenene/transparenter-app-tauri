import type { BrushStroke } from "./types";
import { smoothstep } from "./color";

/** deconIdx にこの値が入っているピクセルは decontamination をスキップする。
 * ブラシで α を手動指定したピクセルは背景色が混ざっている前提が成り立たず、
 * 色の復元計算をすると逆に色が壊れるため。 */
export const DECON_NONE = 255;

/**
 * ブラシストロークを α マップに焼き込む。
 * 軌跡に沿って円をスタンプし、opaque は α を引き上げ、erase は引き下げる。
 * スタンプ同士の重なりは max/min 合成なので何度重なっても濃くならない。
 */
export function stampStroke(
  alpha: Float32Array,
  width: number,
  height: number,
  stroke: BrushStroke,
  deconIdx: Uint8Array,
): void {
  // 最小 0.5(距離 0.5 未満は中心ピクセルのみ)= ちょうど 1px のブラシを許す
  const r = Math.max(0.5, stroke.radius * Math.max(width, height));
  // 硬さ: 内側 hardness*r まではベタ、そこから外周にかけて減衰
  const inner = r * Math.min(1, Math.max(0, stroke.hardness));
  const pts = stroke.points;
  if (pts.length === 0) return;

  const stamp = (nx: number, ny: number) => {
    const cx = nx * (width - 1);
    const cy = ny * (height - 1);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const v = 1 - smoothstep(inner, r, d); // 中心 1 → 外周 0
        if (v <= 0) continue;
        const i = y * width + x;
        const a = alpha[i];
        const next =
          stroke.mode === "opaque" ? Math.max(a, v) : Math.min(a, 1 - v);
        if (next !== a) {
          alpha[i] = next;
          deconIdx[i] = DECON_NONE;
        }
      }
    }
  };

  stamp(pts[0].x, pts[0].y);
  const spacingN = (r * 0.35) / Math.max(width, height); // 正規化座標での間隔
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / spacingN));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }
}
