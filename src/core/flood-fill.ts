import type { SpotOp } from "./types";
import { prepareKey, distanceToKey, smoothstep } from "./color";

/**
 * スポット透過(クリックで透過漏れを消す)の適用。
 *
 * 各操作について、サンプル色に近いピクセルの α を下げる。
 * - 連結モード: クリック地点からのフラッドフィルで到達できる範囲のみ。
 *   すでに透明なピクセル(α≈0)は通り抜けられないため、
 *   背景越しにキャラクター内の同系色(緑の瞳など)へ漏れない。
 * - 全体モード: 画像全体の同色ピクセルが対象。
 *
 * deconIdx には「そのピクセルの α を最終的に決めた操作」(0=メインキー、k+1=ops[k])
 * を記録し、後段の decontamination で正しい背景色を差し引けるようにする。
 */
export function applySpotOps(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  alpha: Float32Array,
  ops: SpotOp[],
  deconIdx: Uint8Array,
): void {
  for (let k = 0; k < ops.length && k < 254; k++) {
    const op = ops[k];
    const ref = prepareKey(op.color);
    const t0 = op.tolerance;
    const t1 = op.tolerance + Math.max(0.02, op.tolerance * 0.5);

    if (op.global) {
      for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const d = distanceToKey(src[p], src[p + 1], src[p + 2], ref);
        if (d >= t1) continue;
        const a = smoothstep(t0, t1, d);
        if (a < alpha[i]) {
          alpha[i] = a;
          deconIdx[i] = k + 1;
        }
      }
    } else {
      floodFill(src, width, height, alpha, deconIdx, op, ref, t0, t1, k + 1);
    }
  }
}

function floodFill(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  alpha: Float32Array,
  deconIdx: Uint8Array,
  op: SpotOp,
  ref: ReturnType<typeof prepareKey>,
  t0: number,
  t1: number,
  opIdx: number,
): void {
  const sx = Math.min(width - 1, Math.max(0, Math.round(op.x * (width - 1))));
  const sy = Math.min(height - 1, Math.max(0, Math.round(op.y * (height - 1))));
  const seed = sy * width + sx;

  const dSeed = distanceToKey(
    src[seed * 4],
    src[seed * 4 + 1],
    src[seed * 4 + 2],
    ref,
  );
  // クリック地点がすでに透明、または(通常起きないが)自身が許容外なら何もしない
  if (alpha[seed] <= 0.02 || dSeed >= t1) return;

  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let sp = 0;
  stack[sp++] = seed;
  visited[seed] = 1;

  while (sp > 0) {
    const i = stack[--sp];
    const p = i * 4;
    const d = distanceToKey(src[p], src[p + 1], src[p + 2], ref);
    const a = smoothstep(t0, t1, d);
    if (a < alpha[i]) {
      alpha[i] = a;
      deconIdx[i] = opIdx;
    }

    const x = i % width;
    const y = (i - x) / width;
    // 4近傍。すでに透明なピクセルは通り抜け不可
    if (x > 0) tryVisit(i - 1);
    if (x < width - 1) tryVisit(i + 1);
    if (y > 0) tryVisit(i - width);
    if (y < height - 1) tryVisit(i + width);
  }

  function tryVisit(n: number): void {
    if (visited[n]) return;
    visited[n] = 1;
    if (alpha[n] <= 0.02) return;
    const p = n * 4;
    const d = distanceToKey(src[p], src[p + 1], src[p + 2], ref);
    if (d < t1) stack[sp++] = n;
  }
}
