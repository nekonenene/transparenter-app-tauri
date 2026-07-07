import type { KeyColor, KeyParams } from "../core/types";
import type { ExportOptions } from "../core/png";

export type MainToWorker =
  | {
      type: "set-image";
      width: number;
      height: number;
      buffer: ArrayBuffer; // RGBA。Transferable で受け渡し、Worker 側に常駐する
      previewMaxEdge: number;
    }
  | { type: "process-preview"; jobId: number; params: KeyParams }
  | {
      type: "process-full";
      jobId: number;
      params: KeyParams;
      options: ExportOptions;
    };

export type WorkerToMain =
  | {
      type: "image-ready";
      previewWidth: number;
      previewHeight: number;
      estimatedKey: KeyColor;
    }
  | {
      type: "preview-result";
      jobId: number;
      width: number;
      height: number;
      buffer: ArrayBuffer; // 透過処理済み RGBA
    }
  | { type: "full-result"; jobId: number; png: ArrayBuffer }
  | { type: "error"; jobId: number | null; message: string };
