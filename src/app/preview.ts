import type { ViewMode } from "../core/types";

interface FitRect {
  ox: number;
  oy: number;
  drawW: number;
  drawH: number;
  imgW: number;
  imgH: number;
}

/**
 * プレビュー描画。チェッカーボード上に 結果 / 元画像 / マット を表示する。
 * 高DPI対応(バッキングストア = CSSサイズ × devicePixelRatio)。
 */
export class PreviewView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private original: ImageData | null = null;
  private result: ImageData | null = null;
  private mode: ViewMode = "result";

  private originalCache: HTMLCanvasElement | null = null;
  private resultCache: HTMLCanvasElement | null = null;
  private alphaCache: HTMLCanvasElement | null = null;
  private semiCache: HTMLCanvasElement | null = null;

  private checker: CanvasPattern;
  private lastFit: FitRect | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.checker = makeCheckerPattern(this.ctx);
    new ResizeObserver(() => this.render()).observe(canvas);
  }

  setOriginal(img: ImageData | null): void {
    this.original = img;
    this.originalCache = null;
    this.result = null;
    this.resultCache = null;
    this.alphaCache = null;
    this.semiCache = null;
    this.render();
  }

  setResult(img: ImageData): void {
    this.result = img;
    this.resultCache = null;
    this.alphaCache = null;
    this.semiCache = null;
    this.render();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.render();
  }

  /** 表示中画像の描画矩形(CSS px)。未表示なら null。ブラシカーソルのサイズ計算用 */
  fitRect(): { ox: number; oy: number; drawW: number; drawH: number } | null {
    return this.lastFit
      ? {
          ox: this.lastFit.ox,
          oy: this.lastFit.oy,
          drawW: this.lastFit.drawW,
          drawH: this.lastFit.drawH,
        }
      : null;
  }

  /** クリック座標(クライアント座標)→ 画像の正規化座標。画像外なら null */
  clientToNormalized(ev: MouseEvent): { u: number; v: number } | null {
    const fit = this.lastFit;
    if (!fit) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left - fit.ox;
    const y = ev.clientY - rect.top - fit.oy;
    if (x < 0 || y < 0 || x >= fit.drawW || y >= fit.drawH) return null;
    return { u: x / fit.drawW, v: y / fit.drawH };
  }

  render(): void {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const src = this.currentSource();
    if (!src) {
      this.lastFit = null;
      return;
    }

    const imgW = src.width;
    const imgH = src.height;
    const s = Math.min(cssW / imgW, cssH / imgH);
    const drawW = imgW * s;
    const drawH = imgH * s;
    const ox = (cssW - drawW) / 2;
    const oy = (cssH - drawH) / 2;
    this.lastFit = { ox, oy, drawW, drawH, imgW, imgH };

    // 透明部分が見えるように画像の下にだけチェッカーボードを敷く
    if (this.mode === "result" || this.mode === "original") {
      ctx.fillStyle = this.checker;
      ctx.fillRect(ox, oy, drawW, drawH);
    }
    ctx.imageSmoothingEnabled = s < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, ox, oy, drawW, drawH);
  }

  private currentSource(): HTMLCanvasElement | null {
    switch (this.mode) {
      case "original":
        if (!this.original) return null;
        if (!this.originalCache)
          this.originalCache = toCanvas(this.original);
        return this.originalCache;
      case "alpha": {
        // αの階調をグレースケールで表示(黒=透明、白=不透明)
        const r = this.result;
        if (!r) return null;
        if (!this.alphaCache) {
          const m = new ImageData(r.width, r.height);
          for (let i = 0; i < r.width * r.height; i++) {
            const a = r.data[i * 4 + 3];
            m.data[i * 4] = a;
            m.data[i * 4 + 1] = a;
            m.data[i * 4 + 2] = a;
            m.data[i * 4 + 3] = 255;
          }
          this.alphaCache = toCanvas(m);
        }
        return this.alphaCache;
      }
      case "semi": {
        // 半透明ピクセルだけを赤で警告表示(書き出し時に残ると困るため)
        const r = this.result;
        if (!r) return null;
        if (!this.semiCache) {
          const m = new ImageData(r.width, r.height);
          for (let i = 0; i < r.width * r.height; i++) {
            const a = r.data[i * 4 + 3];
            if (a > 0 && a < 255) {
              m.data[i * 4] = 255;
              m.data[i * 4 + 1] = 45;
              m.data[i * 4 + 2] = 45;
            } else {
              m.data[i * 4] = a;
              m.data[i * 4 + 1] = a;
              m.data[i * 4 + 2] = a;
            }
            m.data[i * 4 + 3] = 255;
          }
          this.semiCache = toCanvas(m);
        }
        return this.semiCache;
      }
      default:
        if (!this.result) {
          // 処理結果がまだ無ければ元画像を出す(読み込み直後のちらつき防止)
          if (!this.original) return null;
          if (!this.originalCache)
            this.originalCache = toCanvas(this.original);
          return this.originalCache;
        }
        if (!this.resultCache) this.resultCache = toCanvas(this.result);
        return this.resultCache;
    }
  }
}

function toCanvas(img: ImageData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

function makeCheckerPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const tile = document.createElement("canvas");
  tile.width = 16;
  tile.height = 16;
  const t = tile.getContext("2d")!;
  t.fillStyle = "#3a3a3f";
  t.fillRect(0, 0, 16, 16);
  t.fillStyle = "#4c4c52";
  t.fillRect(0, 0, 8, 8);
  t.fillRect(8, 8, 8, 8);
  return ctx.createPattern(tile, "repeat")!;
}
