# TORSO.AI 引き継ぎメモ（2026-02-28）

## 1. 今回までに反映済み（直近）

### API生成の画質/形式
- `product-to-model` 送信時に以下を反映済み
  - `output_format: "png"`（API生成はPNG固定）
  - `resolution: "1k" | "4k"`（UIの画質選択と連動）
- マッピング
  - `通常画質` -> `1K`
  - `高画質` -> `4K`

### 保存時フォーマット選択
- 生成履歴の「選択分を保存」で、保存形式を選択可能
  - `PNGで保存`
  - `JPGで保存`
- JPG選択時はフロント側で保存前に変換してダウンロード

### UI文言更新
- 新規生成の画質説明を明確化
  - 「通常画質は1K、高画質は4Kで生成します（高画質は +1cr/枚）」
- 処理概要の画質表示
  - `通常画質（1K）`
  - `高画質（4K / +1cr/枚）`

## 2. 変更ファイル

- `/Users/yuya/fcursor/my-vto-ui/server/mvpServer.js`
  - `normalizeStyleConfig` の quality デフォルトを `standard` に変更
  - `resolveFashnResolution` 追加（standard=1K, high=4K）
  - `resolveFashnOutputFormat` 追加（png固定）
  - `runPayload` の `product-to-model` inputs に `resolution` と `output_format: png` 追加
  - 生成結果保存時のMIME判定を拡張
  - 出力ファイル名の拡張子デフォルトを `png` に変更

- `/Users/yuya/fcursor/my-vto-ui/src/App.jsx`
  - `HistoryPage` に保存形式 state 追加 (`saveFormat`)
  - `downloadImage` を format対応（PNG/JPG）
  - 生成履歴の選択保存UIに formatセレクト追加
  - 新規生成の画質説明/処理概要文言を更新

## 3. 動作確認（実施済み）

- `npm run build` 成功
- フロントビルドは通過（構文エラーなし）

## 4. 重要な運用メモ

- ローカルは必ず **2プロセス**
  - APIサーバー: `npm run api`（8787）
  - Vite: `npm run dev`（5173）
- `EADDRINUSE: 8787` は既存APIプロセスが生きているだけ
  - `pkill -f mvpServer.js || true` 後に再起動
- ヘルスチェック
  - `curl -s http://localhost:8787/api/health`

## 5. まだ注意が必要な点（次スレで確認推奨）

- `model` スタイルの `tryon-v1.6` は API仕様上 `instructions` は送っているが、
  `product-to-model` のような `resolution/output_format` 連携は現時点で未適用
  （try-onエンドポイントの受理パラメータ差異のため）
- 「高画質 + model(tryon)」の実測結果差分は次スレで検証推奨
- APIキーまわり
  - `FASHN_API_KEY` が古いと `Could not validate API key after retries.` が出る
  - `.env.local` 更新後は APIサーバー再起動必須

## 6. 次スレ冒頭でやると早いチェック

1. `curl -s http://localhost:8787/api/health` で `fashnConfigured: true` 確認  
2. 新規生成で `通常画質(1K)` と `高画質(4K)` を同一画像で1枚ずつ実行  
3. 生成履歴で同一画像を `PNG保存` と `JPG保存` で比較  
4. modelスタイル（tryon）だけ別途、品質差が出るか確認  

---
このメモを次スレの最初に貼れば、すぐ続きから作業できます。
