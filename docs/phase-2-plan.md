# Phase 2 計画：Web MVP と拡張からのデータ送信

## 方針
- 入力元はすべて Web の API に送る。Supabase の鍵は `web/` のサーバー側だけに置く。
- 業務ロジックは `web/src/server/handlers/` の関数に集め、DB は `Db` インターフェースの背後に置く。
  テストはメモリ実装（`memoryDb.ts`）、本番は Supabase 実装（`supabaseDb.ts`）。
  → Supabase なしでも全ロジックをテストできる。
- 日付・時間帯・集計は `web/src/lib/` の純粋関数にしてテストする（1日の区切りは 06:00 JST）。
- Web 画面は Supabase Auth（メール+パスワード）。拡張・ショートカットは環境変数の個人用トークン（Bearer）。

## 作るもの
1. `supabase/migrations/0001_init.sql`：subjects / sessions / sleep / usage / guard_events（RLS 有効）
2. `web/`：Today 画面（Study タイマー、就寝・起床、昨夜の結果）、ログイン画面
3. API：subjects / sessions / sleep / today / ingest（拡張用）
4. 拡張：
   - 利用時間の計測（前面のタブだけ。別ウィンドウ・離席は数えない）
   - `EventSink` の送信実装 + 未送信キュー（再送しても二重登録にならない）
   - 設定画面に API の URL とトークン、ブロック画面とポップアップに「寝る」ボタン

## 集計の定義（DECISIONS.md にも記録）
- 1日の区切り：06:00 JST。深夜の出来事は前日の夜として数える。
- 就寝の比較：正午を起点にした分で比べる（23:50 と 00:20 は30分差）。
- 「昨夜」：23:30 以降は今夜を指し、それ以前は前の夜を指す。

## 完了条件
- スマホとMacの両方で、勉強の START/STOP と就寝・起床を記録できる
- 拡張の計測と Night Guard の記録が Today に昨夜の結果として出る
- 音楽の時間が「減らしたい時間」に入っていない
- 溜まった未送信の記録が、復帰後に重複なく送られる
