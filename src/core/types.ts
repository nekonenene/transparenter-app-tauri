export interface KeyColor {
  r: number;
  g: number;
  b: number;
}

/** クリックによる「追加透過」1回分の操作 */
export interface SpotOp {
  /** クリック位置(画像に対する正規化座標 0..1)— 解像度非依存で再適用できる */
  x: number;
  y: number;
  /** クリック地点でサンプルした色 */
  color: KeyColor;
  /** 色の許容量(0..1、YCbCr距離) */
  tolerance: number;
  /** true なら連結領域ではなく画像全体の同色を透過 */
  global: boolean;
}

export interface KeyParams {
  keyColor: KeyColor;
  /** この距離以下は完全透明 */
  similarity: number;
  /** similarity からこの幅で 0→1 に遷移。それ以上は完全不透明 */
  smoothness: number;
  /** スピル除去の強さ 0..1 */
  despill: number;
  /** αの収縮(erode)半径 px */
  choke: number;
  /** αのガンマ。>1 で縁が薄く、<1 で縁が濃くなる */
  alphaGamma: number;
  /** true なら α を 0 or 1 に二値化し、半透明ピクセルを出力しない */
  binarize: boolean;
  /** 二値化のしきい値(この α 以上を完全不透明にする) */
  binarizeThreshold: number;
  spotOps: SpotOp[];
}

export type ViewMode = "result" | "original" | "matte";
export type Tool = "eyedropper" | "spot";
