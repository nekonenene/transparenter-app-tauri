/**
 * PNG 保存設定ごとのファイルサイズ比較。
 *   npm run verify:core と同様に esbuild でバンドルして実行:
 *   npx esbuild scripts/size-compare.ts --bundle --format=esm --platform=node --outfile=<out>.mjs && node <out>.mjs <input.png>
 */
import { decode } from "fast-png";
import { readFileSync } from "node:fs";
import { applyChromaKey } from "../src/core/chroma-key";
import { estimateKeyColor } from "../src/core/estimate-key";
import { encodePng, type ExportOptions } from "../src/core/png";

const [input] = process.argv.slice(2);
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

const key = estimateKeyColor(rgba, png.width, png.height);
const out = applyChromaKey(rgba, png.width, png.height, {
  keyColor: key,
  similarity: 0.1,
  smoothness: 0.1,
  despill: 0.8,
  choke: 0,
  alphaGamma: 1,
  binarize: false,
  binarizeThreshold: 0.5,
  edits: [],
});

const cases: [string, ExportOptions][] = [
  ["level 0", { level: 0, quantize: false }],
  ["level 1", { level: 1, quantize: false }],
  ["level 6", { level: 6, quantize: false }],
  ["level 9", { level: 9, quantize: false }],
  ["256色に減色", { level: 6, quantize: true }],
];
for (const [label, opts] of cases) {
  const t = performance.now();
  const bytes = encodePng(out, png.width, png.height, opts);
  const ms = performance.now() - t;
  console.log(
    `${label}: ${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB (${ms.toFixed(0)}ms)`,
  );
}
