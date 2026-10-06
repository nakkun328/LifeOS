# Phase 4 計画：Discord 連携（リモコン）

常時起動のBotは作らない。Discord の「Interactions Endpoint」に Web の API ルートを登録し、
スラッシュコマンドとボタンの操作だけを受ける（Gateway 接続・自由文の受信は使わない）。

## 構成
- `POST /api/discord`：Discord からの HTTP リクエストを受ける。
  1. 署名検証（Ed25519。`X-Signature-Ed25519` / `X-Signature-Timestamp`）。失敗なら 401。
  2. 操作できるのは `DISCORD_OWNER_ID` のユーザーだけ。それ以外には何もせず断る。
  3. PING には PONG を返す。
- `web/src/server/discord/`
  - `verify.ts`：署名検証（Node 標準の crypto。追加依存なし）
  - `handler.ts`：コマンド・ボタン・セレクトの処理。Phase 2〜3 のハンドラをそのまま呼ぶ
  - `format.ts`：Today / 今週の文面（純粋関数）
  - `commands.json`：コマンド定義（登録スクリプトとハンドラで共有）
- `web/scripts/register-discord-commands.mjs`：コマンド登録（人が1回実行）
- `web/src/lib/due.ts`：期限の入力をゆるく解釈（`10/9`、`明日`、`3日後`、`2026-10-09`）

## 操作
| やりたいこと | 操作 |
|---|---|
| 操作パネルを出す | `/panel`（ボタンが並ぶ） |
| 勉強の開始 | パネルの「勉強開始」→ 科目を選ぶ |
| 部活の開始 / 終了 | パネルのボタン |
| 一言ログ | `/log <タグ> <本文>` |
| 課題を追加 | `/task <課題名> <期限>` |
| まとめ | `/today`、`/week`（パネルのボタンも可） |
| 寝る / 起きた | `/sleep`、パネルのボタン |

## テスト
署名検証（正常・改ざん・別の鍵・古いタイムスタンプ）、各コマンド、ボタンとセレクト、持ち主以外の拒否。
実機（本物の Discord）での確認は人が行う（SETUP.md に手順）。

## 完了条件
- 署名検証、各コマンド、ボタンの処理にテストがある
- Webを開かずに、勉強の開始・終了、ログ、課題追加、まとめの確認ができる
