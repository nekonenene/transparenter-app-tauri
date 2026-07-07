import { store } from "./state";
import { sampleColor } from "./eyedropper";

/**
 * 追加透過ツール: クリック位置の色をサンプルし、編集履歴に積む。
 * 操作は正規化座標で保存されるため、縮小プレビューでもフル解像度書き出しでも
 * 同じ結果になる。
 */
export function addSpotOp(u: number, v: number): void {
  const { original, spotTolerance, spotGlobal, edits } = store.state;
  if (!original) return;
  const color = sampleColor(original, u, v);
  store.set({
    edits: [
      ...edits,
      {
        kind: "spot",
        op: { x: u, y: v, color, tolerance: spotTolerance, global: spotGlobal },
      },
    ],
  });
}

/** 直前の編集(スポット/ブラシ)を取り消す(Cmd/Ctrl+Z) */
export function undoEdit(): boolean {
  const edits = store.state.edits;
  if (edits.length === 0) return false;
  store.set({ edits: edits.slice(0, -1) });
  return true;
}

export function clearEdits(): void {
  if (store.state.edits.length === 0) return;
  store.set({ edits: [] });
}

export function setupUndoShortcut(): void {
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      if (undoEdit()) e.preventDefault();
    }
  });
}
