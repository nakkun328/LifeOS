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

### 実環境での確認（SETUP.md の Phase 2 を一緒に進めて確認）
- Supabase（Free）にマイグレーション 0001・0002 を実行。8テーブルとも RLS 有効。
- 手元（`npm run dev`）と Vercel（Hobby）の両方で、ログイン → Today 表示 → 科目追加 → START/STOP → 寝る/起きた → 一言ログが動き、Supabase に保存されることを確認。
- 拡張：設定画面の「連携を保存」（Chrome の許可ダイアログを含む）、「寝る」ボタンからの送信、前面タブの計測（`music.youtube.com` が `youtube_music` として別枠で `usage` に保存）を確認。

### 未確認
- 実際の Mac での長時間の計測精度（離席判定・スリープ復帰）。
- 夜（23:30 以降）の通常利用で Today の「昨夜のDigital」に集計が出ること（確認した時間帯は制限中で、計測できる音楽だけで確認した）。

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

## Phase 4：Discord 連携
### できたこと
- `POST /api/discord`（Interactions Endpoint）：Ed25519 署名検証（改ざん・別の鍵・古いタイムスタンプ・ヘッダー欠落は 401）、PING 応答、持ち主以外は何も実行しない。
- コマンド：`/panel`（ボタンのパネル）、`/log`、`/task`、`/today`、`/week`、`/sleep`
- ボタン：勉強開始（科目をセレクトで選ぶ）、部活開始、終了、寝る、起きた、今日、今週
- 期限のゆるい入力（`10/9`、`明日`、`3日後`、`2026-10-09`、全角）
- コマンド登録スクリプト（`web/scripts/register-discord-commands.mjs`）と、`SETUP.md` の Discord 手順
- 修正：Phase 2 の Today が参照する `app_events` テーブルを 0001 に追加（作り忘れ）。コードが使うテーブルがマイグレーションに揃っているか・RLS が有効かを検査するテストを追加。
- テスト：Web 106件、拡張 68件。`next build` も通る。実サーバーで署名つき PING が 200、署名なし・改ざんが 401 になることを確認。

### 未確認
- **本物の Discord での動作**（Endpoint URL の保存、コマンド登録、ボタンの見た目・応答）。メッセージの形は Discord の仕様に沿って作ったが、実機では未確認。
- Vercel 無料プランでの 3 秒以内の応答（コールドスタート時に遅れる可能性）。

### 人がやる作業
- `SETUP.md` の「Phase 4：Discord 連携」の手順 1〜7（アプリ作成、サーバーへの追加、環境変数、Endpoint URL の保存、コマンド登録）

## Phase 5：iPhone ショートカット連携
### できたこと
- `POST /api/ingest/sleep`：睡眠（Apple Watch 由来）。同じ夜は1件に保つ（再送は無変化、値が変わったら更新）。自動データがある夜は、ボタンの記録より優先して集計し、ボタンの行も残す。
- `POST /api/ingest/app`：アプリを開いた・閉じた（単発も配列も可）。重複は無視。開く→閉じるを組にして、Today の Digital に **Mac とは分けて** 出す。23:30〜06:00 の窓の外にはみ出す部分は切り落とす（朝にまたぐ区間も窓の分は数える）。
- Today に、睡眠時間と「（Watch）」の表示を追加。
- `docs/iphone-shortcuts.md`：睡眠を送るショートカットと毎朝のオートメーション、アプリごとの開く／閉じるのショートカットとオートメーション、JSON・ヘッダー、curl での確認、困ったときの表。
- テスト：Web 119件（正常系・重複・不正入力・認証エラー・自動優先・Digital の分離）、拡張 68件。
- 画面の確認：Web の Today / Tasks / Logs をスマホ幅の実ブラウザで描画し、表示内容とボタン操作（START・寝る・ログ記録）を確認（認証と API はモック）。

### 未確認
- **iPhone の実機でのショートカット作成と動作**（手順書は仕様どおりに書いたが、画面名や選べる項目は iOS のバージョンで違う可能性がある）。特に「ヘルスケアサンプルを検索」の睡眠サンプルの扱い（覚醒の除外など）。
- 実際の Apple Watch の睡眠データで、就寝・起床が意図どおりに取れるか。
- アプリのオートメーションが、実際にどの程度確実に「開く・閉じる」を送るか（iOS 側の挙動に依存）。

### 人がやる作業
- `docs/iphone-shortcuts.md` に沿って、iPhone でショートカットとオートメーションを作る。

---

# 全体のまとめ（Phase 1〜5）

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | Night Guard（Chrome 拡張） | 完了・マージ済み |
| 2 | Web MVP（Today・Study・就寝）、拡張の計測と送信 | 完了 |
| 3 | Tasks・一言ログ・部活 | 完了 |
| 4 | Discord 連携 | 完了（実機未確認） |
| 5 | iPhone ショートカット連携 | 完了（実機未確認） |

- **テスト**：拡張 68件、Web 119件（すべて通る）。Postgres 16 でマイグレーション 0001・0002 を実行して制約を確認。実ブラウザ（Chromium）で拡張の動作と Web 画面を確認。
- **Phase 6 の機能（Journal・English Words・Motivation・Wishlist・Insights）は作っていない。** 記録が数週間たまってから、仕様を決めて別途。

## 人がやる作業（まとめ）
1. Supabase のプロジェクト作成、`0001`・`0002` の SQL 実行、ログインユーザー作成 → `SETUP.md` Phase 2
2. 環境変数の設定、Vercel へのデプロイ → `SETUP.md` Phase 2
3. 拡張に API の URL とトークンを設定（Chrome の許可ダイアログで許可）→ `SETUP.md` Phase 2
4. Discord アプリの作成、Endpoint URL の保存、コマンド登録 → `SETUP.md` Phase 4
5. iPhone のショートカットとオートメーション作成 → `docs/iphone-shortcuts.md`

## 未確認の箇所（まとめ）
- 本物の Discord での動作。
- iPhone の実機でのショートカット。
- 拡張の長時間の計測精度、夜の通常利用での「昨夜のDigital」の集計。
（Supabase への実接続・ログイン・Vercel・拡張の送信は、実環境で確認済み。）

## 気づいた点
- 3つの入力元（拡張・Discord・iPhone）は同じハンドラ（`web/src/server/handlers/`）を通るので、ルールは1か所にある。
- 起床時刻は拡張の設定（Night Guard のブロック画面用）と Web の `LIFEOS_WAKE_TIME` の2か所にある。揃えておくこと。
