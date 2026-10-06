# PROGRESS

## Phase 1（完了・マージ済み）
Night Guard（`extension/`）。

## Phase 2：Web MVP と、拡張からのデータ送信
### できたこと
- `web/`（Next.js App Router + TypeScript）：Today 画面、ログイン、API（subjects / sessions / sleep / today / ingest）
  - Study：科目選択 → START / STOP。振り返り（効率・進捗・メモ）は任意。開始時刻をDBに保存するので別端末でも続きが見える。同時に動かせるのは1つ。3時間超で確認表示。
  - 就寝：「寝る」「起きた」。0時をまたいでも正しく比較（23:50 と 00:20 は30分差）。
  - Today：今日・今週の勉強時間、昨夜の就寝と前日との差（改善量で表示）、平日の平均就寝、昨夜の Digital（23:30以降、Mac / iPhone 別）、Night Guard の解除回数、夜は「今寝れば◯時間◯分」。
- `supabase/migrations/0001_init.sql`：subjects / sessions / sleep / usage / guard_events（RLS 有効）
- 拡張：
  - 利用時間の計測（前面のウィンドウのアクティブタブだけ。ロック・離席は数えない。音楽は `youtube_music` として別枠）
  - 記録の送信（`EventSink` + 送信待ちキュー。再送しても二重登録にならない）
  - 設定画面に API URL とトークン、ブロック画面とポップアップに「寝る」ボタン
- テスト：拡張 68件、Web 52件（ハンドラはメモリDBで検証）。実ブラウザでの動作確認も実施（下記）。

### 確認したこと
- マイグレーションを実際の PostgreSQL 16 に流し、制約（同時セッション1つ、再送の上書き、id 重複の無視、RLS）が働くことを確認。
- Chromium に拡張を読み込み、モックAPIで以下を確認：前面タブの計測、別タブは数えない、音楽は別カテゴリ、サーバー停止中は保持して復帰後に再送、解除の記録（理由つき）、「寝る」ボタン（ブロック画面・ポップアップ）。Night Guard 本体の動作（段階切替・解除・設定ロック）も再確認。
- `next build` が通ること、API の認証（無し / 誤り → 401）。

### 未確認（実接続ができなかった箇所）
- **Supabase への実接続**：`supabaseDb.ts`（supabase-js 経由のクエリ）は未確認。ロジックはメモリDBで、SQL は実PostgreSQLで確認済み。
- **Supabase Auth のログイン**（ブラウザ → JWT → API の検証）。
- **拡張の「連携を保存」時の Chrome の許可ダイアログ**（`chrome.permissions.request`）。テストでは保存済みの状態から始めた。
- 実際の Mac での長時間の計測精度（離席判定・スリープ復帰）。

### 人がやる作業
- `SETUP.md` の手順 1〜7（Supabase 作成、ユーザー作成、環境変数、Vercel デプロイ、拡張の URL・トークン設定）
