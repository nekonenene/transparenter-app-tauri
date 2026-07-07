import { store, type AppState } from "./state";
import type { Tool, ViewMode } from "../core/types";
import { clearEdits, undoEdit } from "./spot-tool";

interface SliderDef {
  key: keyof AppState;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const MAIN_SLIDERS: SliderDef[] = [
  {
    key: "similarity",
    label: "類似度(透過する範囲)",
    min: 0,
    max: 0.4,
    step: 0.005,
    format: pct,
  },
  {
    key: "smoothness",
    label: "なめらかさ(縁のグラデーション)",
    min: 0.005,
    max: 0.3,
    step: 0.005,
    format: pct,
  },
  {
    key: "despill",
    label: "色かぶり除去(スピル)",
    min: 0,
    max: 1,
    step: 0.05,
    format: pct,
  },
  {
    key: "choke",
    label: "縁の収縮(px)",
    min: 0,
    max: 3,
    step: 1,
    format: (v) => `${v}`,
  },
  {
    key: "alphaGamma",
    label: "縁の濃さ(←濃い / 薄い→)",
    min: 0.4,
    max: 2.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
];

const BINARIZE_SLIDER: SliderDef = {
  key: "binarizeThreshold",
  label: "しきい値(これ以上を不透明化)",
  min: 0.05,
  max: 0.95,
  step: 0.05,
  format: pct,
};

const SPOT_SLIDER: SliderDef = {
  key: "spotTolerance",
  label: "許容量(消す色の範囲)",
  min: 0.01,
  max: 0.4,
  step: 0.005,
  format: pct,
};

const BRUSH_SLIDERS: SliderDef[] = [
  {
    key: "brushSize",
    label: "ブラシサイズ(画像に対する比率)",
    min: 0.005,
    max: 0.15,
    step: 0.005,
    format: pct,
  },
  {
    key: "brushHardness",
    label: "硬さ(縁のぼかし ←柔 / 硬→)",
    min: 0,
    max: 1,
    step: 0.05,
    format: pct,
  },
];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function setupControls(): void {
  buildSliders(el("sliders-main"), MAIN_SLIDERS);
  buildSliders(el("sliders-binarize"), [BINARIZE_SLIDER]);
  buildSliders(el("sliders-spot"), [SPOT_SLIDER]);
  buildSliders(el("sliders-brush"), BRUSH_SLIDERS);

  // 二値化チェックボックス(OFF のときはしきい値スライダーを無効化)
  const binarizeCheck = el<HTMLInputElement>("binarize");
  const binarizeSlider = el("sliders-binarize").querySelector("input")!;
  const syncBinarize = () => {
    binarizeSlider.disabled = !binarizeCheck.checked;
    el("sliders-binarize").classList.toggle("dimmed", !binarizeCheck.checked);
  };
  binarizeCheck.checked = store.state.binarize;
  syncBinarize();
  binarizeCheck.addEventListener("change", () => {
    store.set({ binarize: binarizeCheck.checked });
    syncBinarize();
  });

  // 全体適用チェックボックス
  const globalCheck = el<HTMLInputElement>("spot-global");
  globalCheck.checked = store.state.spotGlobal;
  globalCheck.addEventListener("change", () =>
    store.set({ spotGlobal: globalCheck.checked }),
  );

  // 表示モード・ツール切替
  setupSegment<ViewMode>("view-switch", "mode", (mode) =>
    store.set({ viewMode: mode }),
  );
  setupSegment<Tool>("tool-switch", "tool", (tool) => store.set({ tool }));
  setupSegment<"opaque" | "erase">("brush-mode", "brushmode", (mode) =>
    store.set({ brushMode: mode }),
  );

  el("btn-undo").addEventListener("click", () => undoEdit());
  el("btn-clear-spots").addEventListener("click", () => clearEdits());

  store.subscribe((changed) => {
    if (changed.has("keyColor")) updateSwatch();
    if (changed.has("edits")) updateEditCount();
    if (changed.has("tool")) updateToolHint();
  });
  updateSwatch();
  updateEditCount();
  updateToolHint();
}

function buildSliders(container: HTMLElement, defs: SliderDef[]): void {
  for (const def of defs) {
    const row = document.createElement("label");
    row.className = "slider-row";

    const head = document.createElement("div");
    head.className = "slider-head";
    const name = document.createElement("span");
    name.textContent = def.label;
    const value = document.createElement("span");
    value.className = "slider-value";
    head.append(name, value);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(store.state[def.key]);
    value.textContent = def.format(Number(input.value));

    input.addEventListener("input", () => {
      const v = Number(input.value);
      value.textContent = def.format(v);
      store.set({ [def.key]: v } as Partial<AppState>);
    });

    row.append(head, input);
    container.append(row);
  }
}

function setupSegment<T extends string>(
  containerId: string,
  dataKey: string,
  onSelect: (value: T) => void,
): void {
  const container = el(containerId);
  const buttons = Array.from(container.querySelectorAll("button"));
  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      for (const b of buttons) b.classList.toggle("active", b === btn);
      onSelect(btn.dataset[dataKey] as T);
    });
  }
}

function updateSwatch(): void {
  const { r, g, b } = store.state.keyColor;
  el("key-swatch").style.background = `rgb(${r}, ${g}, ${b})`;
  el("key-value").textContent = `RGB(${r}, ${g}, ${b})`;
}

function updateEditCount(): void {
  const edits = store.state.edits;
  const spots = edits.filter((e) => e.kind === "spot").length;
  const brushes = edits.length - spots;
  el("spot-count").textContent =
    edits.length === 0
      ? "編集: なし"
      : `編集: ${edits.length}件(クリック ${spots} / ブラシ ${brushes})`;
  (el<HTMLButtonElement>("btn-undo")).disabled = edits.length === 0;
  (el<HTMLButtonElement>("btn-clear-spots")).disabled = edits.length === 0;
}

function updateToolHint(): void {
  const tool = store.state.tool;
  el("tool-hint").textContent =
    tool === "eyedropper"
      ? "画像をクリックして背景色を取得します"
      : tool === "spot"
        ? "透過しきれず残った部分をクリックすると、その部分を透過します(⌘Z で取り消し)"
        : "ドラッグで塗って透明・不透明を直接修正します(⌘Z で取り消し)";
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
