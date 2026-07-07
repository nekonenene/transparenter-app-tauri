# AGENTS.md — Transparenter 開発ガイド

コーディングエージェント向けのプロジェクトコンテキストとルール集。
ここに書かれていることは実際に踏んだ落とし穴・確立した検証手順に基づく。

## プロジェクト概要

AI生成キャラクター画像(緑/青/白背景)の背景をきれいに透過して PNG 保存する
macOS/Windows 向けデスクトップアプリ。**Tauri v2 + Vite + vanilla TypeScript**。

差別化ポイント(壊してはいけない品質保証):
- **キャラ本体が絶対に「うっすら透けない」**: 2段階しきい値(similarity/smoothness)で
  しきい値以上は完全不透明を保証
- **髪の隙間に背景色が残らない**: decontamination(背景色の数学的除去)+ despill
- **手動リカバリ**: スポット透過(クリック)とブラシ。ユーザーはこの手動修正機能を重視している

## アーキテクチャ

```
[メインスレッド] UI・プレビュー描画・I/O(src/app/ + src/main.ts)
      │ postMessage(Transferable。元画像は Worker 常駐、以後パラメータのみ)
[Web Worker]   処理パイプライン一式(src/worker/ → src/core/ を呼ぶ)
      │
[Rust]         dialog / fs プラグイン登録のみ。カスタムコマンドなし(src-tauri/)
```

- `src/core/` は **DOM / Tauri 非依存の純関数のみ**。ここにアルゴリズムを置く。
  Node で直接テストできる状態を維持すること(依存を持ち込まない)
- `src/app/` が UI と状態。状態は `state.ts` の store(素朴な pub/sub)一元管理。
  `PARAM_KEYS` に入っているキーの変更は自動で再プレビューされる
- Worker は busy/pending 方式で最新ジョブのみ処理(スライダー連打対策)。
  `worker-client.ts` の `onerror` は無限ロード防止のため必ず維持すること

### 処理パイプライン(src/core/chroma-key.ts、この順序に意味がある)

1. 適応 YCbCr 距離で α 計算(キー彩度が低い=白背景ほど輝度を加味し色差を増幅)
2. 手動編集(edits)を**時系列順**に適用(スポット透過 flood-fill / ブラシ stamp)
3. choke(半透明のみ収縮・不透明コア保護・小数対応)→ alpha gamma
4. 合成: decontamination(**二値化前の元 α で**)→ despill → 二値化

### 編集モデル(重要)

- スポット透過・ブラシは `EditOp[]`(edits)として**正規化座標で記録**。
  プレビューは縮小版、書き出しはフル解像度で**同じ操作を再適用**するため、
  座標や半径を絶対ピクセルで持ってはいけない
- ⌘Z は edits の末尾を取り消す。1ブラシストローク = 1編集
- `deconIdx` 配列: 0=メインキー色、k=スポットk番目の色、**255(DECON_NONE)=ブラシ
  が触れたピクセルで decontamination をスキップ**(背景混入の前提が成り立たないため)
- ブラシは「最終調整」という位置づけ。ブラシ編集がある状態でキー色・透過調整を
  変えようとしたら確認ダイアログ → OK でブラシ編集のみ削除(edit-guard.ts)

## 絶対に守ること(過去の事故・設計判断)

1. **PNG 書き出しに Canvas を使わない**。`canvas.toBlob()` は premultiplied alpha の
   往復で半透明ピクセルの色が壊れる。書き出しは `src/core/png.ts`(fast-png / 自前の
   インデックスPNGエンコーダ)経由のみ
2. **Worker に入るコードの依存に注意**。Worker には `window` が無い。古い UMD
   ライブラリ(例: upng-js)はバンドル後に `window.X` を参照してロード時にクラッシュし、
   「読み込みが終わらない」事故になった(修正済み)。**新しい依存を Worker 側に入れたら
   `npm run build` 後に `grep window dist/assets/processor.worker-*.js` を確認**し、
   vite preview で実際に Worker を動かして検証すること
3. **メンテされていないライブラリを入れない**(upng-js の教訓)。減色・PNG系は
   自前実装 + fflate / fast-png で完結している
4. **DnD は HTML5 イベントでは動かない**。`getCurrentWebview().onDragDropEvent()` を使う
   (`dragDropEnabled: true` のまま)。DnD で得たパスは fs スコープに自動追加されない
   ので `src-tauri/capabilities/default.json` の `fs:scope` が必要(設定済み)
5. **decode 経路**: `createImageBitmap(blob, { premultiplyAlpha: "none",
   colorSpaceConversion: "none" })`(失敗時フォールバック付き)→
   `getContext("2d", { colorSpace: "srgb", willReadFrequently: true })`。
   スポイトも処理もこの ImageData だけから読む
6. **プレビュー解像度は適応制**(約500万画素まで原寸、worker-client.ts の
   `PREVIEW_PIXEL_BUDGET`)。1200px 固定に戻すとズーム時のピクセル単位ブラシ編集が
   プレビューと一致しなくなる
7. **座標変換は preview.ts の fit 矩形が唯一の基準**。ズーム/パン/高DPI は全て
   `clientToNormalized()` / `fitRect()` 経由で扱う。独自に座標計算しない

## UI 規約

- 文言は全て日本語。技術用語よりユーザーの目的が伝わる言い回しを優先
  (例:「半透明検出」「追加透過」「不透明に戻す」)
- パネルはツールに応じて出し分け(controls.ts `updateSectionVisibility`)。
  「半透明の仕上げ」(二値化)と「編集履歴」は常時表示
- 破壊的操作(全消去・ブラシ編集の削除)は `edit-guard.ts` の `askConfirm` で確認
  ダイアログを挟む(Tauri ネイティブ、ブラウザ開発時は window.confirm フォールバック)
- ブラシサイズは「画面上の直径(px)」で指定し、表示は「画像上の直径」。
  ズームインするほど画像上で細かくなる仕様(ユーザーの明示的な希望)
- 開発用フック: dev ビルドでは `window.__app = { store, preview }` が生えており、
  ブラウザ単体での UI 検証(preview_eval)に使う

## 検証・開発フロー

```bash
npm run tauri dev      # 開発起動(vite: port 1420)
npm run verify:core    # コアの数値検証(必須。全項目パスを維持)
npx tsc --noEmit       # 型チェック
npm run tauri build    # production ビルド(.app のみ。DMG はローカルシェル制約で無効化)
```

- **コア(src/core/)を変更したら必ず scripts/verify-core.ts に検証を追加**して
  `npm run verify:core` を通す。合成画像で α と色を assert する形式
- UI 変更はブラウザで検証: `.claude/launch.json` に `vite`(dev)と
  `vite-preview`(dist 配信、production Worker の動作確認用)がある
- 一連の変更が終わったら production ビルドしてアプリを再起動する(**起動中でも
  確認なしで再起動してよい** — ユーザー承認済み):
  `pkill -x Transparenter; open src-tauri/target/release/bundle/macos/Transparenter.app`
- 便利スクリプト:
  - `scripts/run-on-image.ts` — 実画像でパイプライン実行+時間計測
  - `scripts/size-compare.ts` — 保存設定ごとのファイルサイズ比較
  - どちらも `npx esbuild <file> --bundle --format=esm --platform=node --outfile=<out>.mjs && node <out>.mjs <args>` で実行
- テスト画像は `test-images/`(緑/白背景の合成画像、AI生成キャラ画像)

## コミット規約

- 日本語のコミットメッセージ(1行目=要約、本文=箇条書きで何を・なぜ)
- 機能単位でコミット。フッターに `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- コミット前に PII レビュー(フックが強制する。ステージ内容を確認して再コミット)
- `.gitignore` は gibo(Node/Rust/macOS/VisualStudioCode)ベース。重複追記しない

## 性能の目安(Apple Silicon 実測)

- プレビュー1パス: 原寸 4.3M px で ~60ms(busy/pending 方式で体感は滑らか)
- フル解像度書き出し: 1792×2400 で 56ms + PNG エンコード 0.2〜1.2秒(zlib レベル依存)
- ピクセル単位ループは TypedArray + プリミティブ引数で書く(オブジェクト生成禁止)。
  400×400 の基準パスが verify:core で ~3ms から大きく悪化したら退行を疑う
