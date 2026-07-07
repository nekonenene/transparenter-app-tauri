import { store, type AppState } from "./state";
import type { Tool, ViewMode } from "../core/types";
import { clearEdits, undoEdit } from "./spot-tool";
import { confirmDiscardBrushEdits, hasBrushEdits } from "./edit-guard";

interface SliderDef {
  key: keyof AppState;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  /** true ならブラシ編集がある状態での変更時に確認ダイアログを出す */
  guarded?: boolean;
  /** 値表示 span に付ける id(外部から動的に書き換える場合に指定) */
  valueId?: string;
}

const MAIN_SLIDERS: SliderDef[] = [
  {
    key: "similarity",
    label: "類似度(透過する範囲)",
    min: 0,
    max: 0.4,
    step: 0.005,
    format: pct,
    guarded: true,
  },
  {
    key: "smoothness",
    label: "なめらかさ(縁のグラデーション)",
    min: 0.005,
    max: 0.3,
    step: 0.005,
    format: pct,
    guarded: true,
  },
  {
    key: "despill",
    label: "色かぶり除去(スピル)",
    min: 0,
    max: 1,
    step: 0.05,
    format: pct,
    guarded: true,
  },
  {
    key: "choke",
    label: "縁の収縮(px)",
    min: 0,
    max: 3,
    step: 1,
    format: (v) => `${v}`,
    guarded: true,
  },
  {
    key: "alphaGamma",
    label: "縁の濃さ(←濃い / 薄い→)",
    min: 0.4,
    max: 2.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    guarded: true,
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
    label: "ブラシサイズ(画像上の直径)",
    min: 4,
    max: 150,
    step: 2,
    // 値表示は main.ts がズームに応じた「画像上の直径」で動的に書き換える
    format: () => "",
    valueId: "brush-size-value",
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
  el("btn-clear-spots").addEventListener("click", () => void clearEdits());

  setupSaveSettings();

  store.subscribe((changed) => {
    if (changed.has("keyColor")) updateSwatch();
    if (changed.has("edits")) updateEditCount();
    if (changed.has("tool")) {
      updateToolHint();
      updateSectionVisibility();
    }
  });
  updateSwatch();
  updateEditCount();
  updateToolHint();
  updateSectionVisibility();
}

/** 保存設定ポップオーバー(⚙ボタン): 圧縮レベルと256色減色 */
function setupSaveSettings(): void {
  const popover = el("save-settings");
  const toggle = el("btn-save-settings");

  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    popover.hidden = !popover.hidden;
  });
  popover.addEventListener("click", (ev) => ev.stopPropagation());
  document.addEventListener("click", () => {
    popover.hidden = true;
  });

  const levelSlider = el<HTMLInputElement>("export-level");
  const levelValue = el("export-level-value");
  levelSlider.value = String(store.state.exportLevel);
  levelValue.textContent = String(store.state.exportLevel);
  levelSlider.addEventListener("input", () => {
    const v = Number(levelSlider.value);
    levelValue.textContent = String(v);
    store.set({ exportLevel: v });
  });

  const quantizeCheck = el<HTMLInputElement>("export-quantize");
  quantizeCheck.checked = store.state.exportQuantize;
  const syncQuantize = () => {
    // 減色時はパレットPNGになり zlib レベル選択は使われない
    levelSlider.disabled = quantizeCheck.checked;
    el("export-level-row").classList.toggle("dimmed", quantizeCheck.checked);
  };
  syncQuantize();
  quantizeCheck.addEventListener("change", () => {
    store.set({ exportQuantize: quantizeCheck.checked });
    syncQuantize();
  });
}

/**
 * ツールに応じたセクションの出し分け。
 * ブラシは最終調整なので、ブラシモード中は透過調整を隠す
 * (「半透明の仕上げ」はブラシ後にも使うため常時表示)。
 * 追加透過の設定は追加透過モードのときだけ表示する。
 */
function updateSectionVisibility(): void {
  const tool = store.state.tool;
  el("section-adjust").hidden = tool === "brush";
  el("section-spot").hidden = tool !== "spot";
  el("section-brush").hidden = tool !== "brush";
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
    if (def.valueId) value.id = def.valueId;
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

    if (def.guarded) {
      // ブラシは最終調整という位置づけ。塗った後に調整を触ろうとしたら
      // 確認を挟み、OK ならブラシ編集を削除してから操作を受け付ける
      input.addEventListener("pointerdown", (ev) => {
        if (!hasBrushEdits()) return;
        ev.preventDefault();
        void confirmDiscardBrushEdits();
      });
    }

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
      : `編集: ${edits.length}件(追加透過 ${spots} / ブラシ ${brushes})`;
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
