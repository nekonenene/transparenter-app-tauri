import type { KeyColor } from "./types";

/**
 * 距離計算用に前計算したキー色。
 * YCbCr(BT.601 full range)。cb/cr は 0 中心。
 */
export interface PreparedKey {
  y: number;
  cb: number;
  cr: number;
  /**
   * 輝度差の重み(0..1)。
   * 緑/青など彩度の高いキーでは 0(色差のみで判定)、
   * 白/グレーなど低彩度のキーでは 1 に近づき輝度差も効かせる。
   */
  wY: number;
  /**
   * 色差の重み(1..3)。低彩度キー(白背景)では、わずかな色味の違い
   * (肌色など)を強調しないとキャラクターが背景との距離を稼げず
   * うっすら透けてしまうため、彩度の低さに応じて色差を増幅する。
   */
  wC: number;
}

export function rgbToY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function rgbToCb(r: number, g: number, b: number): number {
  return -0.168736 * r - 0.331264 * g + 0.5 * b;
}

export function rgbToCr(r: number, g: number, b: number): number {
  return 0.5 * r - 0.418688 * g - 0.081312 * b;
}

/** 彩度 0..1(CbCr 平面での距離を正規化) */
export function saturationOf(c: KeyColor): number {
  const cb = rgbToCb(c.r, c.g, c.b);
  const cr = rgbToCr(c.r, c.g, c.b);
  return Math.min(1, Math.sqrt(cb * cb + cr * cr) / 127.5);
}

const LUMA_SAT_THRESHOLD = 0.25;

export function prepareKey(c: KeyColor): PreparedKey {
  const sat = saturationOf(c);
  const neutral = Math.min(1, Math.max(0, 1 - sat / LUMA_SAT_THRESHOLD));
  return {
    y: rgbToY(c.r, c.g, c.b),
    cb: rgbToCb(c.r, c.g, c.b),
    cr: rgbToCr(c.r, c.g, c.b),
    wY: neutral,
    wC: 1 + 2 * neutral,
  };
}

/**
 * ピクセルとキー色の距離(0..~1 に正規化)。
 * ホットループから呼ばれるため引数はプリミティブのみ。
 */
export function distanceToKey(
  r: number,
  g: number,
  b: number,
  key: PreparedKey,
): number {
  const dy = (rgbToY(r, g, b) - key.y) / 255;
  const dcb = (rgbToCb(r, g, b) - key.cb) / 255;
  const dcr = (rgbToCr(r, g, b) - key.cr) / 255;
  return Math.sqrt(key.wY * dy * dy + key.wC * (dcb * dcb + dcr * dcr));
}

/** smoothstep: x<=e0 → 0, x>=e1 → 1, 間は滑らかに補間 */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
