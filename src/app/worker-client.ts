import type { KeyColor, KeyParams } from "../core/types";
import type { ExportOptions } from "../core/png";
import type { MainToWorker, WorkerToMain } from "../worker/protocol";

export interface ImageInfo {
  previewWidth: number;
  previewHeight: number;
  estimatedKey: KeyColor;
}

/**
 * プレビューの画素数バジェット。この範囲なら原寸で処理し、ブラシの
 * ピクセル単位編集がプレビューにも正確に反映される。超える巨大画像のみ
 * 縮小してリアルタイム性を保つ(1パス ~60ms 程度が上限の目安)。
 */
const PREVIEW_PIXEL_BUDGET = 5_000_000;

function previewMaxEdge(width: number, height: number): number {
  const pixels = width * height;
  const longEdge = Math.max(width, height);
  if (pixels <= PREVIEW_PIXEL_BUDGET) return longEdge;
  return Math.floor(longEdge * Math.sqrt(PREVIEW_PIXEL_BUDGET / pixels));
}

/**
 * 処理 Worker のラッパ。
 * プレビューは「処理中に来たリクエストは最新だけ保持し、完了後に投げ直す」
 * 方式で、スライダー連打でもキューが溜まらない。
 */
export class ProcessorClient {
  private worker: Worker;
  private jobSeq = 0;

  private previewBusy = false;
  private pendingPreview: KeyParams | null = null;

  private imageReadyResolve: ((info: ImageInfo) => void) | null = null;
  private imageReadyReject: ((e: Error) => void) | null = null;
  private fullResolvers = new Map<
    number,
    { resolve: (png: Uint8Array) => void; reject: (e: Error) => void }
  >();

  /** プレビュー処理結果を受け取るコールバック(常に最新のみ届く) */
  onPreview: (img: ImageData) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor() {
    this.worker = new Worker(
      new URL("../worker/processor.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (ev: MessageEvent<WorkerToMain>) =>
      this.handleMessage(ev.data);
    // Worker がロード失敗やクラッシュしたとき、待機中の処理を全て失敗させる
    // (これが無いと「読み込み中…」のまま固まる)
    this.worker.onerror = (ev: ErrorEvent) => {
      const error = new Error(ev.message || "画像処理ワーカーでエラーが発生しました");
      this.previewBusy = false;
      this.pendingPreview = null;
      this.imageReadyReject?.(error);
      this.imageReadyResolve = null;
      this.imageReadyReject = null;
      for (const { reject } of this.fullResolvers.values()) reject(error);
      this.fullResolvers.clear();
      this.onError(error.message);
    };
  }

  setImage(img: ImageData): Promise<ImageInfo> {
    // 元バッファはスポイト用にメインスレッドにも残すため、コピーを転送する
    const copy = img.data.slice();
    this.pendingPreview = null;
    this.previewBusy = false;
    return new Promise((resolve, reject) => {
      this.imageReadyResolve = resolve;
      this.imageReadyReject = reject;
      this.post(
        {
          type: "set-image",
          width: img.width,
          height: img.height,
          buffer: copy.buffer as ArrayBuffer,
          previewMaxEdge: previewMaxEdge(img.width, img.height),
        },
        [copy.buffer as ArrayBuffer],
      );
    });
  }

  requestPreview(params: KeyParams): void {
    if (this.previewBusy) {
      this.pendingPreview = params;
      return;
    }
    this.previewBusy = true;
    this.post({ type: "process-preview", jobId: ++this.jobSeq, params });
  }

  exportFull(params: KeyParams, options: ExportOptions): Promise<Uint8Array> {
    const jobId = ++this.jobSeq;
    return new Promise((resolve, reject) => {
      this.fullResolvers.set(jobId, { resolve, reject });
      this.post({ type: "process-full", jobId, params, options });
    });
  }

  private handleMessage(msg: WorkerToMain): void {
    switch (msg.type) {
      case "image-ready": {
        this.imageReadyResolve?.({
          previewWidth: msg.previewWidth,
          previewHeight: msg.previewHeight,
          estimatedKey: msg.estimatedKey,
        });
        this.imageReadyResolve = null;
        this.imageReadyReject = null;
        break;
      }
      case "preview-result": {
        this.previewBusy = false;
        if (this.pendingPreview) {
          const next = this.pendingPreview;
          this.pendingPreview = null;
          this.requestPreview(next);
        }
        const img = new ImageData(
          new Uint8ClampedArray(msg.buffer),
          msg.width,
          msg.height,
        );
        this.onPreview(img);
        break;
      }
      case "full-result": {
        const r = this.fullResolvers.get(msg.jobId);
        if (r) {
          this.fullResolvers.delete(msg.jobId);
          r.resolve(new Uint8Array(msg.png));
        }
        break;
      }
      case "error": {
        this.previewBusy = false;
        if (msg.jobId !== null) {
          const r = this.fullResolvers.get(msg.jobId);
          if (r) {
            this.fullResolvers.delete(msg.jobId);
            r.reject(new Error(msg.message));
            return;
          }
        }
        this.onError(msg.message);
        break;
      }
    }
  }

  private post(msg: MainToWorker, transfer?: Transferable[]): void {
    this.worker.postMessage(msg, transfer ?? []);
  }
}
