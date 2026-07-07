import { store } from "./state";
import { sampleColor } from "./eyedropper";

/**
 * 追加透過ツール: クリック位置の色をサンプルし、スポット操作として積む。
 * 操作は正規化座標で保存されるため、縮小プレビューでもフル解像度書き出しでも
 * 同じ結果になる。
 */
export function addSpotOp(u: number, v: number): void {
  const { original, spotTolerance, spotGlobal, spotOps } = store.state;
  if (!original) return;
  const color = sampleColor(original, u, v);
  store.set({
    spotOps: [
      ...spotOps,
      { x: u, y: v, color, tolerance: spotTolerance, global: spotGlobal },
    ],
  });
}

/** 直前のスポット操作を取り消す(Cmd/Ctrl+Z) */
export function undoSpotOp(): boolean {
  const ops = store.state.spotOps;
  if (ops.length === 0) return false;
  store.set({ spotOps: ops.slice(0, -1) });
  return true;
}

export function clearSpotOps(): void {
  if (store.state.spotOps.length === 0) return;
  store.set({ spotOps: [] });
}

export function setupUndoShortcut(): void {
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      if (undoSpotOp()) e.preventDefault();
    }
  });
}
