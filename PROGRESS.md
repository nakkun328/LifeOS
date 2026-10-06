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

## Phase 3：Tasks と 一言ログ
### できたこと
- `supabase/migrations/0002_tasks_logs.sql`：tasks / logs（実PostgreSQL 16 で制約を確認）
- Tasks：課題名と期限で登録、進捗を1タップで変更（未着手 → 途中 → 完了）、期限の近い順、「あと3日」「今日が期限」。期限切れは責めない言い回し。`/tasks` ページ。
- 一言ログ：1行 + タグ（趣味 / 部活 / 日記）。Today から直接入力、`/logs` で日付ごとに見返せる。
- 部活の作業時間：Today の計測カードで 勉強 / 部活 を切り替え。集計は勉強と分けて表示。
- Today に、期限が近い課題（残り日数つき）と今日のログを表示。
- テスト：Web 67件（Phase 2 の分を含む）、拡張 68件。`next build` も通る。

### 未確認
- Supabase への実接続（Phase 2 から継続）。画面操作（ブラウザでの見た目・タップ）は未確認。

### 人がやる作業
- Supabase の SQL Editor で `0002_tasks_logs.sql` を実行（`SETUP.md`）
