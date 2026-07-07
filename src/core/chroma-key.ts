import type { KeyColor, KeyParams } from "./types";
import { prepareKey, distanceToKey, smoothstep, saturationOf } from "./color";
import { chokeAlpha } from "./morphology";
import { applySpotOp, restrictToBorderConnected } from "./flood-fill";
import { DECON_NONE, stampStroke } from "./brush";

/**
 * クロマキーのメインパイプライン。RGBA バッファを受け取り、透過済み RGBA を返す。
 *
 * 1. 2段階しきい値の α 計算(similarity 以下=完全透明、similarity+smoothness 以上=完全不透明)
 * 2. スポット透過(クリック操作)の適用
 * 3. choke(erode)・alpha gamma
 * 4. decontamination: 半透明ピクセルから背景色の混入成分を除去
 * 5. despill: キー色のかぶり(緑/青)を抑制
 */
export function applyChromaKey(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  params: KeyParams,
): Uint8ClampedArray {
  const n = width * height;
  const key = prepareKey(params.keyColor);
  const e0 = params.similarity;
  const e1 = params.similarity + Math.max(0.001, params.smoothness);

  // 1. メインの α
  const alpha = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const d = distanceToKey(src[p], src[p + 1], src[p + 2], key);
    alpha[i] = smoothstep(e0, e1, d);
  }

  // 1.5. 外周連結モード: 閉じた領域(白い服等)の誤透過を復元。
  //      手動編集より前に行うので、髪の隙間などはスポット透過で個別に抜ける
  if (params.borderOnly) restrictToBorderConnected(alpha, width, height);

  // 2. 手動編集(スポット透過・ブラシ)を時系列順に適用。
  //    deconIdx: 0=メインキー、k=スポット操作k番目の色、DECON_NONE=復元しない(ブラシ)
  const deconIdx = new Uint8Array(n);
  const deconColors: KeyColor[] = [params.keyColor];
  for (const edit of params.edits) {
    if (edit.kind === "spot") {
      if (deconColors.length >= DECON_NONE) continue; // 上限(実用上到達しない)
      deconColors.push(edit.op.color);
      applySpotOp(
        src,
        width,
        height,
        alpha,
        edit.op,
        deconIdx,
        deconColors.length - 1,
      );
    } else {
      stampStroke(alpha, width, height, edit.stroke, deconIdx);
    }
  }

  // 3. choke と gamma
  if (params.choke > 0) chokeAlpha(alpha, width, height, params.choke);
  const gamma = params.alphaGamma;
  if (Math.abs(gamma - 1) > 0.001) {
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      if (a > 0 && a < 1) alpha[i] = Math.pow(a, gamma);
    }
  }

  // 4+5. 合成: decontamination → despill
  const out = new Uint8ClampedArray(n * 4);
  const spill = spillChannel(params.keyColor);
  const despillAmount = params.despill;
  const { binarize, binarizeThreshold } = params;

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = alpha[i];
    if (a <= 0.004) continue; // 完全透明(out は 0 初期化済み)

    // 二値化: しきい値未満は透明に、以上は不透明に確定。
    // 色の復元(decontamination)は二値化前の α で行うため、
    // 不透明に昇格したピクセルにも背景色が残らない。
    const aOut = binarize ? (a >= binarizeThreshold ? 1 : 0) : a;
    if (aOut <= 0) continue;

    let r = src[p];
    let g = src[p + 1];
    let b = src[p + 2];

    if (a < 1 && deconIdx[i] !== DECON_NONE) {
      // pixel = a·fg + (1−a)·key と仮定して前景色を復元(髪の隙間の背景色除去)
      const kc = deconColors[deconIdx[i]];
      const inv = 1 - a;
      r = (r - inv * kc.r) / a;
      g = (g - inv * kc.g) / a;
      b = (b - inv * kc.b) / a;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
    }

    if (despillAmount > 0 && spill !== null) {
      if (spill === 1) {
        const limit = r > b ? r : b;
        if (g > limit) g -= despillAmount * (g - limit);
      } else {
        const limit = r > g ? r : g;
        if (b > limit) b -= despillAmount * (b - limit);
      }
    }

    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = Math.round(aOut * 255);
  }

  return out;
}

/** 抑制すべきチャネル: 1=G(緑背景), 2=B(青背景), null=低彩度(白/グレー)や赤系はスキップ */
function spillChannel(key: KeyColor): 1 | 2 | null {
  if (saturationOf(key) < 0.15) return null;
  if (key.g >= key.r && key.g >= key.b) return 1;
  if (key.b >= key.r && key.b >= key.g) return 2;
  return null;
}
