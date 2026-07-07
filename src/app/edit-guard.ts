import { ask } from "@tauri-apps/plugin-dialog";
import { store } from "./state";

/**
 * ブラシ編集の保護。
 * ブラシは「最終調整」という位置づけのため、塗った後にキー色や透過調整を
 * 変更しようとしたら警告し、OK ならブラシ編集だけを削除して続行する
 * (スポット透過の履歴は色ベースで再適用できるため残す)。
 */
export function hasBrushEdits(): boolean {
  return store.state.edits.some((e) => e.kind === "brush");
}

function removeBrushEdits(): void {
  store.set({ edits: store.state.edits.filter((e) => e.kind !== "brush") });
}

const MESSAGE =
  "ブラシで塗った編集があります。\n" +
  "キー色や透過調整を変更すると、ブラシでの編集は全て削除されます。\n" +
  "続行しますか?";

/**
 * ブラシ編集がある場合に確認ダイアログを出し、OK ならブラシ編集を削除して
 * true を返す。ブラシ編集が無ければ何もせず true。
 */
export async function confirmDiscardBrushEdits(): Promise<boolean> {
  if (!hasBrushEdits()) return true;
  let ok: boolean;
  try {
    ok = await ask(MESSAGE, {
      title: "ブラシ編集の削除",
      kind: "warning",
      okLabel: "削除して続行",
      cancelLabel: "キャンセル",
    });
  } catch {
    // ブラウザ単体(開発時)フォールバック
    ok = window.confirm(MESSAGE);
  }
  if (ok) removeBrushEdits();
  return ok;
}
