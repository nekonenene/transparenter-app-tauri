/**
 * コアパイプラインの headless 数値検証。
 * 合成した緑背景キャラ画像(AA縁・髪の隙間・スピル・透過漏れパッチ入り)に対して
 * applyChromaKey を実行し、期待する α と色を assert する。
 * ついでにテスト用 PNG を test-images/ に書き出す。
 */
import { applyChromaKey } from "../src/core/chroma-key";
import { quantize } from "../src/core/quantize";
import { estimateKeyColor } from "../src/core/estimate-key";
import { encodePng } from "../src/core/png";
import type { BrushStroke, KeyParams, SpotOp } from "../src/core/types";
import { writeFileSync, mkdirSync } from "node:fs";

const W = 400;
const H = 400;
const GREEN = { r: 0, g: 177, b: 64 };
const DARK_GREEN = { r: 0, g: 110, b: 45 }; // 透過漏れを模したパッチ
const SKIN = { r: 240, g: 200, b: 180 };
const HAIR = { r: 90, g: 60, b: 40 };

function makeImage(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  const put = (i: number, c: { r: number; g: number; b: number }) => {
    d[i * 4] = c.r;
    d[i * 4 + 1] = c.g;
    d[i * 4 + 2] = c.b;
    d[i * 4 + 3] = 255;
  };
  const mix = (
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
    t: number,
  ) => ({
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t,
  });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      put(i, GREEN);

      // キャラ本体(6px幅のぼけた輪郭の円 — 実画像のソフトな輪郭を模す)
      const dc = Math.hypot(x - 200, y - 210);
      const cov = Math.min(1, Math.max(0, (124.5 - dc) / 6));
      if (cov > 0) put(i, mix(GREEN, SKIN, cov));

      // 髪の隙間(キャラ内部に背景色が見える閉領域)
      const dg = Math.hypot(x - 200, y - 170);
      const gapCov = Math.min(1, Math.max(0, 18 + 0.5 - dg));
      if (gapCov > 0) {
        const cur = { r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] };
        put(i, mix(cur, GREEN, gapCov));
      }

      // 髪の毛(細い線、緑が30%かぶっている)
      if (y >= 60 && y < 90 && Math.abs(x - 200) <= 1) {
        put(i, mix(HAIR, GREEN, 0.3));
      }

      // 透過漏れパッチ(暗い緑、similarity では取り切れない)
      const dl = Math.hypot(x - 60, y - 330);
      const leakCov = Math.min(1, Math.max(0, 25 + 0.5 - dl));
      if (leakCov > 0) {
        const cur = { r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] };
        put(i, mix(cur, DARK_GREEN, leakCov));
      }
    }
  }
  return d;
}

const src = makeImage();

const baseParams: KeyParams = {
  keyColor: GREEN,
  similarity: 0.1,
  smoothness: 0.1,
  despill: 0.8,
  choke: 0,
  alphaGamma: 1,
  binarize: false,
  binarizeThreshold: 0.5,
  edits: [],
};

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name} ${detail}`);
  }
}
const px = (out: Uint8ClampedArray, x: number, y: number) => {
  const p = (y * W + x) * 4;
  return { r: out[p], g: out[p + 1], b: out[p + 2], a: out[p + 3] };
};

// --- キー色の自動推定 ---
console.log("estimateKeyColor:");
const est = estimateKeyColor(src, W, H);
check(
  "四隅から緑を推定",
  Math.abs(est.r - GREEN.r) < 3 &&
    Math.abs(est.g - GREEN.g) < 3 &&
    Math.abs(est.b - GREEN.b) < 3,
  JSON.stringify(est),
);

// --- 基本パイプライン ---
console.log("applyChromaKey (基本):");
const out = applyChromaKey(src, W, H, baseParams);

check("背景(左上)が完全透明", px(out, 5, 5).a === 0, `a=${px(out, 5, 5).a}`);
const center = px(out, 200, 240);
check("キャラ中心が完全不透明", center.a === 255, `a=${center.a}`);
check(
  "キャラ中心の色が変化しない",
  Math.abs(center.r - SKIN.r) <= 1 &&
    Math.abs(center.g - SKIN.g) <= 1 &&
    Math.abs(center.b - SKIN.b) <= 1,
  JSON.stringify(center),
);
check("髪の隙間(閉領域)も透明", px(out, 200, 170).a === 0, `a=${px(out, 200, 170).a}`);

// AA縁: 半透明ピクセルが存在し、緑が残らない(decontamination + despill)
let edgeChecked = false;
for (let x = 200; x < 340; x++) {
  const p = px(out, x, 210);
  if (p.a > 20 && p.a < 240) {
    check(
      `AA縁 x=${x} (α=${p.a}) に緑が残らない`,
      p.g <= Math.max(p.r, p.b) + 12,
      JSON.stringify(p),
    );
    edgeChecked = true;
    break;
  }
}
check("半透明のAA縁ピクセルが存在する", edgeChecked);

// 髪の毛のスピル除去: 元 g=95 が max(r,b) 付近まで下がる
const strand = px(out, 200, 75);
check(
  "髪の毛の緑かぶりが除去される (despill)",
  strand.a === 255 && strand.g < 80,
  JSON.stringify(strand),
);

// 透過漏れパッチ: デフォルトでは半端な透明度で残る(=既存ツールの症状の再現)
const leak = px(out, 60, 330);
check("暗緑パッチは基本設定では残る", leak.a > 10, `a=${leak.a}`);

// --- スポット透過(連結モード) ---
console.log("スポット透過:");
const spot: SpotOp = {
  x: 60 / (W - 1),
  y: 330 / (H - 1),
  color: DARK_GREEN,
  tolerance: 0.12,
  global: false,
};
const out2 = applyChromaKey(src, W, H, {
  ...baseParams,
  edits: [{ kind: "spot", op: spot }],
});
check("クリックでパッチが透明になる", px(out2, 60, 330).a === 0, `a=${px(out2, 60, 330).a}`);
check("キャラ本体は影響を受けない", px(out2, 200, 240).a === 255);
check("背景は透明のまま", px(out2, 5, 5).a === 0);

// --- ブラシ ---
console.log("ブラシ:");
// 不透明化ブラシ: 透過済みの背景の一角を塗って不透明に戻す
const opaqueStroke: BrushStroke = {
  points: [
    { x: 40 / (W - 1), y: 40 / (H - 1) },
    { x: 80 / (W - 1), y: 40 / (H - 1) },
  ],
  radius: 0.04, // 長辺400px → 半径16px
  hardness: 1,
  mode: "opaque",
};
const outOp = applyChromaKey(src, W, H, {
  ...baseParams,
  edits: [{ kind: "brush", stroke: opaqueStroke }],
});
const restored = px(outOp, 60, 40);
check("不透明化ブラシで α=255 に戻る", restored.a === 255, `a=${restored.a}`);
check("ブラシ外の背景は透明のまま", px(outOp, 300, 40).a === 0);

// 透明化ブラシ: キャラ本体の一部を塗って消す
const eraseStroke: BrushStroke = {
  points: [{ x: 200 / (W - 1), y: 240 / (H - 1) }],
  radius: 0.04,
  hardness: 1,
  mode: "erase",
};
const outEr = applyChromaKey(src, W, H, {
  ...baseParams,
  edits: [{ kind: "brush", stroke: eraseStroke }],
});
check("透明化ブラシで α=0 になる", px(outEr, 200, 240).a === 0, `a=${px(outEr, 200, 240).a}`);
check("ブラシ外のキャラは不透明のまま", px(outEr, 130, 280).a === 255, `a=${px(outEr, 130, 280).a}`);

// 硬さ<1 のとき縁に半透明の減衰が生じる
const softStroke: BrushStroke = { ...eraseStroke, hardness: 0.3 };
const outSoft = applyChromaKey(src, W, H, {
  ...baseParams,
  edits: [{ kind: "brush", stroke: softStroke }],
});
let softEdge = false;
for (let x = 200; x < 220; x++) {
  const a = px(outSoft, x, 240).a;
  if (a > 0 && a < 255) softEdge = true;
}
check("ソフト縁ブラシは境界がなだらか", softEdge);

// 1px ブラシ(半径 0.5px)はちょうど 1 ピクセルだけを塗る
const onePxStroke: BrushStroke = {
  points: [{ x: 200 / (W - 1), y: 240 / (H - 1) }],
  radius: 0.5 / Math.max(W, H),
  hardness: 1,
  mode: "erase",
};
const out1px = applyChromaKey(src, W, H, {
  ...baseParams,
  edits: [{ kind: "brush", stroke: onePxStroke }],
});
check("1pxブラシで中心だけが透明になる", px(out1px, 200, 240).a === 0, `a=${px(out1px, 200, 240).a}`);
check(
  "1pxブラシの隣接ピクセルは影響を受けない",
  px(out1px, 201, 240).a === 255 &&
    px(out1px, 199, 240).a === 255 &&
    px(out1px, 200, 239).a === 255 &&
    px(out1px, 200, 241).a === 255,
);

// ⌘Z 相当: 編集を除けば元に戻る(時系列適用の確認を兼ねる)
const outUndo = applyChromaKey(src, W, H, { ...baseParams, edits: [] });
check("編集を取り消すと元の結果に一致", outUndo.every((v, i) => v === out[i]));

// --- 二値化(半透明の排除) ---
console.log("二値化:");
const outB = applyChromaKey(src, W, H, {
  ...baseParams,
  binarize: true,
  binarizeThreshold: 0.5,
});
let semiCount = 0;
for (let i = 0; i < W * H; i++) {
  const a = outB[i * 4 + 3];
  if (a > 0 && a < 255) semiCount++;
}
check("二値化後に半透明ピクセルが1つも無い", semiCount === 0, `${semiCount} px`);
check("二値化してもキャラ中心は不透明", px(outB, 200, 240).a === 255);
check("二値化しても背景は透明", px(outB, 5, 5).a === 0);

// しきい値以上の縁ピクセルは不透明に昇格し、背景色の混入も除去されている。
// しきい値未満は透明に降格。画像全体から対象ピクセルを探して検証する。
let promoted = false;
let demoted = false;
for (let i = 0; i < W * H && !(promoted && demoted); i++) {
  const before = out[i * 4 + 3];
  const after = outB[i * 4 + 3];
  const x = i % W;
  const y = (i - x) / W;
  if (!promoted && before >= 128 && before < 255) {
    const q = px(outB, x, y);
    check(
      `昇格ピクセル (${x},${y}) (α ${before}→255) に緑が残らない`,
      after === 255 && q.g <= Math.max(q.r, q.b) + 12,
      JSON.stringify(q),
    );
    promoted = true;
  }
  if (!demoted && before > 0 && before < 128) {
    check(`しきい値未満のピクセル (${x},${y}) (α ${before}) は透明化`, after === 0, `a=${after}`);
    demoted = true;
  }
}
check("昇格・降格の対象ピクセルが両方存在した", promoted && demoted);

// --- choke ---
console.log("choke:");
const out3 = applyChromaKey(src, W, H, { ...baseParams, choke: 2 });
let shrunk = false;
for (let x = 200; x < 340; x++) {
  const before = px(out, x, 210).a;
  const after = px(out3, x, 210).a;
  if (before === 255 && after < 255) {
    shrunk = true;
    break;
  }
}
check("choke で縁が収縮する", shrunk);

// --- PNG 書き出しオプション ---
console.log("PNG書き出しオプション:");
const { decode } = await import("fast-png");
const pngFast = encodePng(out2, W, H, { level: 1, quantize: false });
const pngSmall = encodePng(out2, W, H, { level: 9, quantize: false });
const pngQuant = encodePng(out2, W, H, { level: 6, quantize: true });
check(
  "レベル9 ≤ レベル1(圧縮レベルが効いている)",
  pngSmall.byteLength <= pngFast.byteLength,
  `9=${pngSmall.byteLength} 1=${pngFast.byteLength}`,
);
check(
  "減色PNGはレベル9よりさらに小さい",
  pngQuant.byteLength < pngSmall.byteLength,
  `quant=${pngQuant.byteLength} 9=${pngSmall.byteLength}`,
);
// 圧縮レベル違いはデコードすると完全一致(ロスレスの確認)
const decFast = decode(pngFast);
const decSmall = decode(pngSmall);
check(
  "圧縮レベルを変えてもピクセルは完全一致(ロスレス)",
  decFast.width === W &&
    decSmall.width === W &&
    Buffer.compare(
      Buffer.from(decFast.data.buffer, decFast.data.byteOffset, decFast.data.byteLength),
      Buffer.from(decSmall.data.buffer, decSmall.data.byteOffset, decSmall.data.byteLength),
    ) === 0,
);
// 減色PNGはデコードできて寸法が一致する
const decQuant = decode(pngQuant);
check(
  "減色PNGが正しくデコードできる",
  decQuant.width === W && decQuant.height === H,
  `${decQuant.width}x${decQuant.height}`,
);

// quantize: 大きい画像でも 256 色以内に収まる
const q = quantize(out2, 256);
check("量子化後の色数が256以下", q.colorCount <= 256, `${q.colorCount}`);

// quantize: ユニーク色が256以下なら完全ロスレス
const tiny = new Uint8ClampedArray(4 * 4 * 4);
const tinyColors = [
  [255, 0, 0, 255],
  [0, 255, 0, 128],
  [0, 0, 255, 255],
  [0, 0, 0, 0],
];
for (let i = 0; i < 16; i++) tiny.set(tinyColors[i % 4], i * 4);
const qt = quantize(tiny, 256);
let losslessOk = qt.colorCount === 4;
for (let i = 0; i < 16 && losslessOk; i++) {
  const pi = qt.indices[i] * 4;
  for (let ch = 0; ch < 4; ch++) {
    if (qt.palette[pi + ch] !== tiny[i * 4 + ch]) losslessOk = false;
  }
}
check("256色以下の画像は量子化してもロスレス", losslessOk);

// --- テスト画像の書き出し ---
mkdirSync("test-images", { recursive: true });
writeFileSync("test-images/test-green-bg.png", encodePng(src, W, H));
writeFileSync("test-images/test-result.png", encodePng(out2, W, H));

// 白背景版も生成
const white = src.slice();
for (let i = 0; i < W * H; i++) {
  const p = i * 4;
  // 緑に近いピクセルを白に置換(簡易)
  const isGreenish =
    Math.abs(white[p] - GREEN.r) + Math.abs(white[p + 1] - GREEN.g) + Math.abs(white[p + 2] - GREEN.b) < 250;
  if (isGreenish) {
    const t = 1 - Math.min(1, (Math.abs(white[p] - GREEN.r) + Math.abs(white[p + 1] - GREEN.g) + Math.abs(white[p + 2] - GREEN.b)) / 250);
    white[p] = white[p] * (1 - t) + 250 * t;
    white[p + 1] = white[p + 1] * (1 - t) + 250 * t;
    white[p + 2] = white[p + 2] * (1 - t) + 250 * t;
  }
}
writeFileSync("test-images/test-white-bg.png", encodePng(white, W, H));

console.log("白背景の適応距離:");
const estW = estimateKeyColor(white, W, H);
check("白背景を推定", estW.r > 240 && estW.g > 240 && estW.b > 240, JSON.stringify(estW));
const outW = applyChromaKey(white, W, H, { ...baseParams, keyColor: estW });
check("白背景が透明", px(outW, 5, 5).a === 0, `a=${px(outW, 5, 5).a}`);
check("白背景でもキャラ中心は不透明", px(outW, 200, 240).a === 255, `a=${px(outW, 200, 240).a}`);

// --- 性能 ---
const t0 = performance.now();
applyChromaKey(src, W, H, baseParams);
const t1 = performance.now();
console.log(`400x400 1パス: ${(t1 - t0).toFixed(1)}ms`);

if (failures > 0) {
  console.error(`\n${failures} 件の検証が失敗`);
  process.exit(1);
}
console.log("\n全検証 OK");
