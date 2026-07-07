/**
 * アプリアイコン生成: 緑背景で生成されたアイコン画像を自前のクロマキー
 * パイプラインで切り抜き、macOS のアイコングリッド(1024px 中 824px)に
 * 配置した app-icon.png を出力する。
 *
 *   npx esbuild scripts/make-icon.ts --bundle --format=esm --platform=node --outfile=<out>.mjs
 *   node <out>.mjs <input.png> <output.png>
 *
 * その後 `npm run tauri icon <output.png>` で src-tauri/icons/ を再生成する。
 */
import { decode } from "fast-png";
import { readFileSync, writeFileSync } from "node:fs";
import { applyChromaKey } from "../src/core/chroma-key";
import { estimateKeyColor } from "../src/core/estimate-key";
import { encodePng } from "../src/core/png";
import { resizeToFit } from "../src/core/resize";

const CANVAS = 1024;
const CONTENT = 824; // Apple のアイコングリッド: squircle は 1024px 中 824px

const [input, output] = process.argv.slice(2);
const png = decode(readFileSync(input));
const n = png.width * png.height;
let rgba: Uint8ClampedArray;
if (png.channels === 4) {
  rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, n * 4).slice();
} else {
  rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = png.data[i * 3];
    rgba[i * 4 + 1] = png.data[i * 3 + 1];
    rgba[i * 4 + 2] = png.data[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
}

// 背景の緑をキーイング
const key = estimateKeyColor(rgba, png.width, png.height);
console.log(`key: RGB(${key.r}, ${key.g}, ${key.b})`);
const cut = applyChromaKey(rgba, png.width, png.height, {
  keyColor: key,
  similarity: 0.1,
  smoothness: 0.08,
  despill: 0.9,
  choke: 0,
  alphaGamma: 1,
  binarize: false,
  binarizeThreshold: 0.5,
  edits: [],
});

// 不透明領域のバウンディングボックス
let minX = png.width;
let minY = png.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    if (cut[(y * png.width + x) * 4 + 3] >= 32) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const bw = maxX - minX + 1;
const bh = maxY - minY + 1;
console.log(`content bbox: ${bw}x${bh}`);

// クロップ → 824px に縮小 → 1024px キャンバス中央に配置
const cropped = new Uint8ClampedArray(bw * bh * 4);
for (let y = 0; y < bh; y++) {
  cropped.set(
    cut.subarray(((minY + y) * png.width + minX) * 4, ((minY + y) * png.width + minX + bw) * 4),
    y * bw * 4,
  );
}
const scaled = resizeToFit(cropped, bw, bh, CONTENT);
const canvas = new Uint8ClampedArray(CANVAS * CANVAS * 4);
const ox = (CANVAS - scaled.width) >> 1;
const oy = (CANVAS - scaled.height) >> 1;
for (let y = 0; y < scaled.height; y++) {
  canvas.set(
    scaled.data.subarray(y * scaled.width * 4, (y + 1) * scaled.width * 4),
    ((oy + y) * CANVAS + ox) * 4,
  );
}

writeFileSync(output, encodePng(canvas, CANVAS, CANVAS, { level: 9, quantize: false }));
console.log(`wrote ${output} (${CANVAS}x${CANVAS}, content ${scaled.width}x${scaled.height})`);
