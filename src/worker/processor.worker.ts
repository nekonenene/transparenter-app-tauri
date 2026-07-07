import { applyChromaKey } from "../core/chroma-key";
import { estimateKeyColor } from "../core/estimate-key";
import { encodePng } from "../core/png";
import { resizeToFit, type RawImage } from "../core/resize";
import type { MainToWorker, WorkerToMain } from "./protocol";

const ctx = self as unknown as {
  postMessage(msg: WorkerToMain, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<MainToWorker>) => void) | null;
};

let full: RawImage | null = null;
let preview: RawImage | null = null;

ctx.onmessage = (ev) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "set-image": {
        full = {
          data: new Uint8ClampedArray(msg.buffer),
          width: msg.width,
          height: msg.height,
        };
        preview = resizeToFit(
          full.data,
          full.width,
          full.height,
          msg.previewMaxEdge,
        );
        ctx.postMessage({
          type: "image-ready",
          previewWidth: preview.width,
          previewHeight: preview.height,
          estimatedKey: estimateKeyColor(
            preview.data,
            preview.width,
            preview.height,
          ),
        });
        break;
      }
      case "process-preview": {
        if (!preview) return;
        const out = applyChromaKey(
          preview.data,
          preview.width,
          preview.height,
          msg.params,
        );
        ctx.postMessage(
          {
            type: "preview-result",
            jobId: msg.jobId,
            width: preview.width,
            height: preview.height,
            buffer: out.buffer as ArrayBuffer,
          },
          [out.buffer as ArrayBuffer],
        );
        break;
      }
      case "process-full": {
        if (!full) return;
        const out = applyChromaKey(
          full.data,
          full.width,
          full.height,
          msg.params,
        );
        const png = encodePng(out, full.width, full.height, msg.options);
        const bytes =
          png.byteOffset === 0 && png.byteLength === png.buffer.byteLength
            ? png
            : png.slice();
        ctx.postMessage(
          { type: "full-result", jobId: msg.jobId, png: bytes.buffer as ArrayBuffer },
          [bytes.buffer as ArrayBuffer],
        );
        break;
      }
    }
  } catch (e) {
    ctx.postMessage({
      type: "error",
      jobId: "jobId" in msg ? msg.jobId : null,
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
