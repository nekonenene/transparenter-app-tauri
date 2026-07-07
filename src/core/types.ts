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

/** ブラシの1ストローク(mousedown〜mouseup) */
export interface BrushStroke {
  /** 軌跡(画像に対する正規化座標 0..1) */
  points: { x: number; y: number }[];
  /** ブラシ半径(画像の長辺に対する比率)— 解像度非依存 */
  radius: number;
  /** 縁の硬さ 0..1。1 = ハード縁、小さいほど外周がなだらかにぼける */
  hardness: number;
  /** opaque = 不透明に戻す、erase = 透明にする */
  mode: "opaque" | "erase";
}

/** 手動編集の1操作。時系列順に適用され、⌘Z で新しい順に取り消される */
export type EditOp =
  | { kind: "spot"; op: SpotOp }
  | { kind: "brush"; stroke: BrushStroke };

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
  /**
   * true なら画像の外周とつながった領域だけを透過する。
   * 白背景でキャラクター内の白い服・ハイライト等が抜けるのを防ぐ。
   * 閉じた隙間(髪の間など)は不透明に戻るため、スポット透過で個別に抜く。
   */
  borderOnly: boolean;
  /** true なら α を 0 or 1 に二値化し、半透明ピクセルを出力しない */
  binarize: boolean;
  /** 二値化のしきい値(この α 以上を完全不透明にする) */
  binarizeThreshold: number;
  /** スポット透過・ブラシの編集履歴(時系列順) */
  edits: EditOp[];
}

export type ViewMode = "result" | "original" | "alpha" | "semi";
export type Tool = "eyedropper" | "spot" | "brush";
