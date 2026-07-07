/// <reference types="vite/client" />
import { PARAM_KEYS, store, type AppState } from "./app/state";
import { ProcessorClient } from "./app/worker-client";
import { PreviewView } from "./app/preview";
import { setupControls } from "./app/controls";
import { sampleColor } from "./app/eyedropper";
import { addSpotOp, setupUndoShortcut } from "./app/spot-tool";
import { setupBrushTool } from "./app/brush-tool";
import { confirmDiscardBrushEdits } from "./app/edit-guard";
import {
  loadImageFromPath,
  pickImagePath,
  savePng,
  setupDragDrop,
} from "./app/io";

const client = new ProcessorClient();
const preview = new PreviewView(
  document.getElementById("preview") as HTMLCanvasElement,
);

const statusEl = document.getElementById("status")!;
const dropzone = document.getElementById("dropzone")!;
const btnOpen = document.getElementById("btn-open") as HTMLButtonElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// ---- 画像読み込み ----

let loading = false;

async function loadImage(path: string): Promise<void> {
  if (loading) return;
  loading = true;
  setStatus("読み込み中…");
  try {
    const img = await loadImageFromPath(path);
    store.set({ original: img, srcPath: path, edits: [] });
    preview.setOriginal(img);

    const info = await client.setImage(img);
    store.set({ keyColor: info.estimatedKey });
    requestPreview();

    dropzone.classList.add("hidden");
    btnSave.disabled = false;
    const name = path.split("/").pop()?.split("\\").pop() ?? path;
    setStatus(`${name} — ${img.width}×${img.height}px(背景色を自動推定しました)`);
  } catch (e) {
    setStatus(`読み込みに失敗しました: ${e instanceof Error ? e.message : e}`);
  } finally {
    loading = false;
  }
}

// ---- プレビュー処理 ----

function requestPreview(): void {
  if (!store.state.original) return;
  client.requestPreview(store.buildParams());
}

const semiInfo = document.getElementById("semi-info")!;

client.onPreview = (img) => {
  preview.setResult(img);
  updateSemiInfo(img);
};
client.onError = (message) => setStatus(`処理エラー: ${message}`);

/** 半透明ピクセルの割合を表示(プレビュー解像度基準) */
function updateSemiInfo(img: ImageData): void {
  const n = img.width * img.height;
  let semi = 0;
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3];
    if (a > 0 && a < 255) semi++;
  }
  if (semi === 0) {
    semiInfo.textContent = "半透明ピクセル: なし";
    semiInfo.classList.remove("warn");
  } else {
    const pct = (semi / n) * 100;
    semiInfo.textContent = `半透明ピクセル: ${pct < 0.01 ? "0.01未満" : pct.toFixed(2)}%(「半透明検出」で赤く表示)`;
    semiInfo.classList.add("warn");
  }
}

store.subscribe((changed: Set<keyof AppState>) => {
  if (PARAM_KEYS.some((k) => changed.has(k))) requestPreview();
  if (changed.has("viewMode")) preview.setMode(store.state.viewMode);
});

// ---- キャンバスクリック(スポイト / 追加透過) ----

(document.getElementById("preview") as HTMLCanvasElement).addEventListener(
  "click",
  async (ev) => {
    const { original, tool } = store.state;
    if (!original || tool === "brush") return; // ブラシは mousedown/move で処理
    const pos = preview.clientToNormalized(ev);
    if (!pos) return;
    if (tool === "eyedropper") {
      // キー色の変更は結果が大きく変わるため、ブラシ編集があれば確認して削除
      if (!(await confirmDiscardBrushEdits())) return;
      const color = sampleColor(original, pos.u, pos.v);
      store.set({ keyColor: color });
      setStatus(`キー色を取得: RGB(${color.r}, ${color.g}, ${color.b})`);
    } else {
      addSpotOp(pos.u, pos.v);
    }
  },
);

// ---- 開く / 保存 ----

btnOpen.addEventListener("click", async () => {
  const path = await pickImagePath();
  if (path) await loadImage(path);
});

btnSave.addEventListener("click", async () => {
  if (!store.state.original) return;
  btnSave.disabled = true;
  setStatus("フル解像度で書き出し中…");
  try {
    const png = await client.exportFull(store.buildParams(), {
      level: store.state.exportLevel,
      quantize: store.state.exportQuantize,
    });
    const saved = await savePng(png, store.state.srcPath);
    setStatus(
      saved
        ? `保存しました: ${saved}(${formatBytes(png.byteLength)})`
        : "保存をキャンセルしました",
    );
  } catch (e) {
    setStatus(`保存に失敗しました: ${e instanceof Error ? e.message : e}`);
  } finally {
    btnSave.disabled = false;
  }
});

// ---- 初期化 ----

// ---- ズーム ----

const zoomLevel = document.getElementById("zoom-level")!;

/** ブラシサイズの値表示(スライダー右)を、現在のズームでの画像上の直径に更新 */
function updateBrushSizeInfo(): void {
  const brushSizeValue = document.getElementById("brush-size-value");
  if (!brushSizeValue) return;
  const { original, brushSize } = store.state;
  const fit = preview.fitRect();
  if (!original || !fit) {
    brushSizeValue.textContent = "—";
    return;
  }
  const norm = brushSize / 2 / Math.max(fit.drawW, fit.drawH);
  const px = Math.max(
    1,
    Math.round(2 * norm * Math.max(original.width, original.height)),
  );
  brushSizeValue.textContent = `${px}px`;
}

preview.onZoomChange = (zoom) => {
  zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
  updateBrushSizeInfo();
};
store.subscribe((changed) => {
  if (changed.has("brushSize") || changed.has("original")) {
    updateBrushSizeInfo();
  }
});
document
  .getElementById("zoom-in")!
  .addEventListener("click", () => preview.zoomStep(1.25));
document
  .getElementById("zoom-out")!
  .addEventListener("click", () => preview.zoomStep(0.8));
document
  .getElementById("zoom-fit")!
  .addEventListener("click", () => preview.resetZoom());
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key === "+" || e.key === "=" || e.key === ";") {
    preview.zoomStep(1.25);
    e.preventDefault();
  } else if (e.key === "-") {
    preview.zoomStep(0.8);
    e.preventDefault();
  } else if (e.key === "0") {
    preview.resetZoom();
    e.preventDefault();
  }
});

// ---- 初期化 ----

setupControls();
updateBrushSizeInfo();
setupUndoShortcut();
setupBrushTool(
  document.getElementById("preview") as HTMLCanvasElement,
  preview,
);
if (import.meta.env.DEV) {
  // ブラウザ単体での動作確認用(Tauri API なしでズーム等を試せる)
  (window as unknown as Record<string, unknown>).__app = { store, preview };
}
setupDragDrop(
  (path) => void loadImage(path),
  (over) => {
    if (store.state.original) return;
    dropzone.classList.toggle("hover", over);
  },
);
setStatus("画像を開いてください");
