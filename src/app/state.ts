import type { KeyColor, KeyParams, SpotOp, Tool, ViewMode } from "../core/types";

export interface AppState {
  srcPath: string | null;
  original: ImageData | null; // フル解像度の元画像(スポイト・元画像表示用)

  keyColor: KeyColor;
  similarity: number;
  smoothness: number;
  despill: number;
  choke: number;
  alphaGamma: number;
  binarize: boolean;
  binarizeThreshold: number;

  spotTolerance: number;
  spotGlobal: boolean;
  spotOps: SpotOp[];

  viewMode: ViewMode;
  tool: Tool;
}

export const PARAM_KEYS: (keyof AppState)[] = [
  "keyColor",
  "similarity",
  "smoothness",
  "despill",
  "choke",
  "alphaGamma",
  "binarize",
  "binarizeThreshold",
  "spotOps",
];

type Listener = (changed: Set<keyof AppState>) => void;

class Store {
  state: AppState = {
    srcPath: null,
    original: null,
    keyColor: { r: 0, g: 255, b: 0 },
    similarity: 0.1,
    smoothness: 0.1,
    despill: 0.8,
    choke: 0,
    alphaGamma: 1,
    binarize: false,
    binarizeThreshold: 0.5,
    spotTolerance: 0.12,
    spotGlobal: false,
    spotOps: [],
    viewMode: "result",
    tool: "eyedropper",
  };

  private listeners: Listener[] = [];

  set(partial: Partial<AppState>): void {
    const changed = new Set<keyof AppState>();
    for (const k of Object.keys(partial) as (keyof AppState)[]) {
      if (this.state[k] !== partial[k]) {
        (this.state as unknown as Record<string, unknown>)[k] = partial[k];
        changed.add(k);
      }
    }
    if (changed.size === 0) return;
    for (const fn of this.listeners) fn(changed);
  }

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  buildParams(): KeyParams {
    const s = this.state;
    return {
      keyColor: s.keyColor,
      similarity: s.similarity,
      smoothness: s.smoothness,
      despill: s.despill,
      choke: s.choke,
      alphaGamma: s.alphaGamma,
      binarize: s.binarize,
      binarizeThreshold: s.binarizeThreshold,
      spotOps: s.spotOps,
    };
  }
}

export const store = new Store();
