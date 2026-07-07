import { store } from "./state";
import type { PreviewView } from "./preview";
import type { BrushStroke } from "../core/types";

/**
 * ブラシツール: ドラッグで α を直接塗る(不透明に戻す / 透明にする)。
 * mousedown〜mouseup が1ストローク=1つの編集履歴(⌘Z で丸ごと取り消し)。
 * ドラッグ中は履歴末尾のストロークを差し替えながらプレビューを更新する。
 */
export function setupBrushTool(
  canvas: HTMLCanvasElement,
  preview: PreviewView,
): void {
  const cursor = document.getElementById("brush-cursor")!;
  let stroke: BrushStroke | null = null;

  function hideCursor(): void {
    cursor.style.display = "none";
  }

  function updateCursor(ev: MouseEvent): void {
    const { tool, original, brushSize, brushMode } = store.state;
    if (tool !== "brush" || !original) {
      hideCursor();
      return;
    }
    const fit = preview.fitRect();
    if (!fit) {
      hideCursor();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (
      x < fit.ox - 4 ||
      y < fit.oy - 4 ||
      x > fit.ox + fit.drawW + 4 ||
      y > fit.oy + fit.drawH + 4
    ) {
      hideCursor();
      return;
    }
    // 半径は「画像の長辺に対する比率」なので、表示上は描画矩形の長辺に比例する
    const rPx = brushSize * Math.max(fit.drawW, fit.drawH);
    cursor.style.display = "block";
    cursor.classList.toggle("erase", brushMode === "erase");
    cursor.style.width = `${rPx * 2}px`;
    cursor.style.height = `${rPx * 2}px`;
    cursor.style.left = `${x - rPx}px`;
    cursor.style.top = `${y - rPx}px`;
  }

  function replaceLastStroke(next: BrushStroke): void {
    stroke = next;
    const edits = store.state.edits.slice(0, -1);
    store.set({ edits: [...edits, { kind: "brush", stroke: next }] });
  }

  canvas.addEventListener("mousedown", (ev) => {
    const s = store.state;
    if (s.tool !== "brush" || !s.original) return;
    const pos = preview.clientToNormalized(ev);
    if (!pos) return;
    ev.preventDefault();
    stroke = {
      points: [{ x: pos.u, y: pos.v }],
      radius: s.brushSize,
      hardness: s.brushHardness,
      mode: s.brushMode,
    };
    store.set({ edits: [...s.edits, { kind: "brush", stroke }] });
  });

  window.addEventListener("mousemove", (ev) => {
    updateCursor(ev);
    if (!stroke) return;
    const pos = preview.clientToNormalized(ev);
    if (!pos) return;
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(pos.u - last.x, pos.v - last.y) < 0.002) return; // 間引き
    replaceLastStroke({
      ...stroke,
      points: [...stroke.points, { x: pos.u, y: pos.v }],
    });
  });

  window.addEventListener("mouseup", () => {
    stroke = null;
  });

  canvas.addEventListener("mouseleave", () => {
    if (!stroke) hideCursor();
  });

  store.subscribe((changed) => {
    if (changed.has("tool") && store.state.tool !== "brush") hideCursor();
  });
}
