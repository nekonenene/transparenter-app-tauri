/**
 * 実画像でパイプラインを実行する動作確認スクリプト。
 *   npx esbuild scripts/run-on-image.ts --bundle --format=esm --platform=node --outfile=<out>.mjs
 *   node <out>.mjs <input.png> <output.png>
 */
import { decode } from "fast-png";
import { readFileSync, writeFileSync } from "node:fs";
import { applyChromaKey } from "../src/core/chroma-key";
import { estimateKeyColor } from "../src/core/estimate-key";
import { encodePng } from "../src/core/png";
import { resizeToFit } from "../src/core/resize";

const [input, output] = process.argv.slice(2);
const png = decode(readFileSync(input));

// RGBA に正規化(fast-png は 8bit RGB/RGBA/grayscale を返しうる)
let rgba: Uint8ClampedArray;
const n = png.width * png.height;
if (png.channels === 4) {
  rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, n * 4).slice();
} else if (png.channels === 3) {
  rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = png.data[i * 3];
    rgba[i * 4 + 1] = png.data[i * 3 + 1];
    rgba[i * 4 + 2] = png.data[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
} else {
  throw new Error(`unsupported channels: ${png.channels}`);
}

console.log(`input: ${png.width}x${png.height}`);

let t = performance.now();
const preview = resizeToFit(rgba, png.width, png.height, 1200);
console.log(
  `resize -> ${preview.width}x${preview.height}: ${(performance.now() - t).toFixed(0)}ms`,
);

const key = estimateKeyColor(preview.data, preview.width, preview.height);
console.log(`estimated key: RGB(${key.r}, ${key.g}, ${key.b})`);

const params = {
  keyColor: key,
  similarity: 0.1,
  smoothness: 0.1,
  despill: 0.8,
  choke: 0,
  alphaGamma: 1,
  spotOps: [],
};

t = performance.now();
applyChromaKey(preview.data, preview.width, preview.height, params);
console.log(`preview pass: ${(performance.now() - t).toFixed(0)}ms`);

t = performance.now();
const out = applyChromaKey(rgba, png.width, png.height, params);
console.log(`full pass: ${(performance.now() - t).toFixed(0)}ms`);

t = performance.now();
writeFileSync(output, encodePng(out, png.width, png.height));
console.log(`png encode+write: ${(performance.now() - t).toFixed(0)}ms`);

// 統計: α分布
let opaque = 0;
let transparent = 0;
let semi = 0;
for (let i = 0; i < n; i++) {
  const a = out[i * 4 + 3];
  if (a === 0) transparent++;
  else if (a === 255) opaque++;
  else semi++;
}
console.log(
  `alpha: 透明 ${((transparent / n) * 100).toFixed(1)}% / 不透明 ${((opaque / n) * 100).toFixed(1)}% / 半透明 ${((semi / n) * 100).toFixed(2)}%`,
);
