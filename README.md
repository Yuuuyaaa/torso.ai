# TORSO.AI MVP

中古アパレル向けAI商品画像生成の最小MVPです。

## MVPフロー

1. ユーザーがログイン
2. 画像またはZIPアップロード
3. バックエンドがジョブをDB保存（JobID単位）
4. ZIPは自動展開し、画像のみ抽出（フォルダ構造を保持）
5. バックエンドがFASHN APIを実行
6. 生成結果URLをDBへ保存
7. フロントがジョブをポーリングして表示
8. 完了ジョブをZIP一括ダウンロード

## 仕様確定（運用ルール）

### 1) フォルダ構造保持
- ZIP内パスは `originalPath` / `relativePath` として `job.items` に保存
- SKU推測値 `skuGuess` を `originalPath` から抽出して保存（先頭フォルダ優先）
- 納品ZIPは原則 `relativePath` を維持して再梱包

### 2) 課金タイミング
- 課金ポリシー: `success_only`
- ジョブ作成時に最大想定分を仮押さえ（reserved）
- `done` になった枚数だけ確定課金（`creditUsed = successCount * creditRate`）
- `error` は自動返却
- リトライ時は、返却済みエラー分のみ再度仮押さえ

### 3) リトライ冪等性
- リトライはジョブが `queued/processing` の間は不可
- リトライ対象は `error` アイテムのみ
- `idempotencyKey` (`jobId:attempt`) で重複実行をガード
- `retryAttempt` をジョブに保持

## 主要機能

- Job単位管理（JobID / スタイル / 受付時刻 / 進捗 / クレジット / ステータス）
- クレジット消費: `mannequin=1`, `ghost=2`, `model=3`
- 失敗理由表示（errorHint）
- 失敗分リトライ
- 出力規格プリセット（白背景 / 1:1 / 4:5）
- UI注意書き（AI生成・ロゴ崩れ可能性・保存期間）
- `jobEvents` にイベントを追記（最低限監査ログ）

## 主要構成

- Frontend: React + Vite
- Backend: `server/mvpServer.js` (Node http)
- DB: `server/data/mvp-db.json` (JSON file)

## セットアップ

```bash
npm install
cp .env.example .env
```

別ターミナルでAPIサーバー起動:

```bash
export FASHN_API_KEY=YOUR_KEY
# 任意: FASHNへ画像URLで渡したい場合だけ設定（公開URL必須）
# export BACKEND_PUBLIC_BASE_URL=https://your-public-api.example.com
npm run api
```

FASHN接続確認:

```bash
curl -s http://localhost:8787/api/health
```

`"fashnConfigured": true` ならAPIキー読込OKです。
`"backendPublicBaseUrl"` が `null` の場合は、JPG圧縮後のData URLをFASHNに渡します。

フロント起動:

```bash
npm run dev
```

## 補足

- 開発者ログイン: メール空欄で `ログイン` を押すと `dev@local.test` でログイン
- ZIP展開はサーバーで `unzip` コマンドを使用
- 納品ZIP生成はサーバーで `zip` コマンドを使用
- 入力画像はサーバー側でJPG(quality 70)へ変換・圧縮してから処理
- 本番ではJSON DBをSupabase/Postgresへ置換推奨
- 本番ではバックエンド認証を必ず導入

## Supabaseマイグレーション

- マイグレーションSQLは `supabase/migrations` に時系列で保存
- 今回の資産ライブラリ作成: `supabase/migrations/202603040001_create_app_asset_libraries.sql`
- ユーザー単位の本番向け基盤テーブル作成: `supabase/migrations/202603040002_create_multiuser_core_tables.sql`
- 画像保存用 Storage バケット作成: `supabase/migrations/202603040003_create_asset_storage_bucket.sql`
- Supabase CLI を使う場合:

```bash
supabase db push
```

- SQL Editorで手動適用する場合は上記ファイルをそのまま実行
- アプリは Supabase ライブラリが空のとき、既存ローカル資産を読み込んで自動移行します（画像はStorage URL化して軽量化）

## 検証

```bash
npm run lint
npm run build
```
