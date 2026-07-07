import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];

export async function pickImagePath(): Promise<string | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "画像", extensions: IMAGE_EXTENSIONS }],
  });
  return path;
}

export async function loadImageFromPath(path: string): Promise<ImageData> {
  const bytes = await readFile(path);
  return decodeToImageData(bytes);
}

async function decodeToImageData(bytes: Uint8Array): Promise<ImageData> {
  const blob = new Blob([bytes as unknown as BlobPart]);
  let bmp: ImageBitmap;
  try {
    // ICC 変換や premultiply による色ずれを避ける(未対応環境ではフォールバック)
    bmp = await createImageBitmap(blob, {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
  } catch {
    bmp = await createImageBitmap(blob);
  }
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", {
    colorSpace: "srgb",
    willReadFrequently: true,
  })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return img;
}

/** Tauri のネイティブ DnD イベントを購読する(HTML5 の drop は Tauri では発火しない) */
export async function setupDragDrop(
  onDrop: (path: string) => void,
  onHover: (over: boolean) => void,
): Promise<void> {
  await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "over") {
      onHover(true);
    } else if (event.payload.type === "drop") {
      onHover(false);
      const path = event.payload.paths.find((p) =>
        IMAGE_EXTENSIONS.includes(p.split(".").pop()?.toLowerCase() ?? ""),
      );
      if (path) onDrop(path);
    } else {
      onHover(false);
    }
  });
}

export async function savePng(
  bytes: Uint8Array,
  srcPath: string | null,
): Promise<string | null> {
  const path = await save({
    defaultPath: suggestPath(srcPath),
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (!path) return null;
  await writeFile(path, bytes);
  return path;
}

/** 元画像と同じフォルダを初期選択にするため、ディレクトリ込みのパスを返す */
function suggestPath(srcPath: string | null): string {
  if (!srcPath) return "transparent.png";
  const sep = Math.max(srcPath.lastIndexOf("/"), srcPath.lastIndexOf("\\"));
  const dir = sep >= 0 ? srcPath.slice(0, sep + 1) : "";
  const base = sep >= 0 ? srcPath.slice(sep + 1) : srcPath;
  const stem = base.includes(".")
    ? base.slice(0, base.lastIndexOf("."))
    : base;
  return `${dir}${stem}_transparent.png`;
}
